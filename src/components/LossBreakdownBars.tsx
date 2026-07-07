export interface LossBar {
  label: string;
  conductionChannelW: number;
  conductionDiodeW: number;
  deadTimeDiodeW: number;
  switchingW: number;
  reverseRecoveryW: number;
}

interface Props {
  bars: LossBar[];
  unitNote?: string;
}

const SEGMENTS: { key: keyof Omit<LossBar, 'label'>; label: string; color: string }[] = [
  { key: 'conductionChannelW', label: 'Conduction (channel)', color: 'var(--accent)' },
  { key: 'conductionDiodeW', label: 'Conduction (body diode)', color: 'var(--warn)' },
  { key: 'deadTimeDiodeW', label: 'Dead-time diode', color: 'color-mix(in srgb, var(--warn) 55%, var(--text-3))' },
  { key: 'switchingW', label: 'Switching (Eon+Eoff)', color: 'var(--blue)' },
  { key: 'reverseRecoveryW', label: 'Reverse recovery', color: 'color-mix(in srgb, var(--blue) 45%, var(--text-3))' },
];

const BAR_H = 26;
const ROW_GAP = 14;
const LABEL_W = 110;
const VALUE_W = 80;
const W = 640;

// Horizontal stacked bars, one per operating point / duty step, all sharing one scale
// so relative magnitudes between steps stay meaningful.
export default function LossBreakdownBars({ bars, unitNote }: Props) {
  if (bars.length === 0) return null;
  const totals = bars.map((b) => SEGMENTS.reduce((a, s) => a + (b[s.key] as number), 0));
  const maxTotal = Math.max(...totals, 1e-9);
  const plotW = W - LABEL_W - VALUE_W;
  const H = bars.length * (BAR_H + ROW_GAP) + 40;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {bars.map((b, i) => {
          const y = i * (BAR_H + ROW_GAP) + 8;
          let x = LABEL_W;
          return (
            <g key={i}>
              <text x={LABEL_W - 8} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="11" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
                {b.label}
              </text>
              {SEGMENTS.map((s) => {
                const v = b[s.key] as number;
                const w = (v / maxTotal) * plotW;
                const rect = v > 0 ? (
                  <rect key={s.key} x={x} y={y} width={Math.max(w, 0.5)} height={BAR_H} fill={s.color} stroke="var(--bg-card)" strokeWidth={0.5} />
                ) : null;
                x += w;
                return rect;
              })}
              <text x={x + 8} y={y + BAR_H / 2 + 4} textAnchor="start" fontSize="11" fill="var(--text)" fontFamily="ui-monospace, monospace">
                {totals[i] >= 100 ? totals[i].toFixed(0) : totals[i].toFixed(1)} W
              </text>
            </g>
          );
        })}
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">
          {unitNote ?? 'per-device die losses · shared scale across bars'}
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.25rem' }}>
        {SEGMENTS.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-2)' }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
