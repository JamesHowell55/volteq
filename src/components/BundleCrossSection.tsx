import type { WireCategory } from '../lib/harnessWireTypes';

export interface BundleWireVisual {
  id: number;
  x: number;
  y: number;
  d: number;
  category: WireCategory;
}

interface Props {
  wires: BundleWireVisual[];
  bundleDiameterMm: number;
  overbraidThicknessMm: number;
  finishedOuterDiameterMm: number | null;
  coveringLabel?: string;
}

const DRAW_SIZE = 420;
const PAD = 56;

const CATEGORY_COLORS: Record<WireCategory, string> = {
  single: 'var(--accent)',
  twistedPair: 'var(--blue)',
  shielded: 'var(--warn)',
  twistedShieldedPair: 'color-mix(in srgb, var(--blue) 55%, var(--warn))',
  canBus: 'color-mix(in srgb, var(--accent) 50%, var(--blue))',
};

const CATEGORY_LABELS: Record<WireCategory, string> = {
  single: 'Single conductor',
  twistedPair: 'Twisted pair',
  shielded: 'Shielded single',
  twistedShieldedPair: 'Twisted shielded pair',
  canBus: 'CAN bus (120 Ω pair)',
};

// Every wire drawn as a filled circle at its packed position, then concentric
// rings for the overbraid (hatched) and main covering (translucent), scaled
// to fit the drawing area. Not to a fixed mm->px scale across bundles — each
// bundle is scaled independently to fill the available space, consistent
// with the other cross-section components in this app.
export default function BundleCrossSection({ wires, bundleDiameterMm, overbraidThicknessMm, finishedOuterDiameterMm, coveringLabel }: Props) {
  const outerDiameterMm = finishedOuterDiameterMm ?? (bundleDiameterMm + 2 * overbraidThicknessMm);
  const avail = DRAW_SIZE - 2 * PAD;
  const scale = outerDiameterMm > 0 ? avail / outerDiameterMm : 1;
  const cx = DRAW_SIZE / 2;
  const cy = DRAW_SIZE / 2;

  const bundleRadiusPx = (bundleDiameterMm / 2) * scale;
  const overbraidRadiusPx = bundleRadiusPx + overbraidThicknessMm * scale;
  const outerRadiusPx = (outerDiameterMm / 2) * scale;

  const categoriesPresent = Array.from(new Set(wires.map((w) => w.category)));

  return (
    <svg viewBox={`0 0 ${DRAW_SIZE} ${DRAW_SIZE}`} width="100%" style={{ maxHeight: 420 }}>
      <defs>
        <pattern id="braidHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="var(--text-3)" opacity="0.15" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-2)" strokeWidth="1.6" />
        </pattern>
      </defs>

      {finishedOuterDiameterMm !== null && (
        <circle cx={cx} cy={cy} r={outerRadiusPx} fill="color-mix(in srgb, var(--text-3) 12%, transparent)" stroke="var(--border-strong)" strokeWidth={1.5} strokeDasharray="4,3" />
      )}
      {overbraidThicknessMm > 0 && (
        <circle cx={cx} cy={cy} r={overbraidRadiusPx} fill="url(#braidHatch)" stroke="var(--text-2)" strokeWidth={1.2} />
      )}
      <circle cx={cx} cy={cy} r={bundleRadiusPx} fill="none" stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="2,3" />

      {wires.map((w) => (
        <circle
          key={w.id}
          cx={cx + w.x * scale}
          cy={cy + w.y * scale}
          r={Math.max((w.d / 2) * scale, 1)}
          fill={CATEGORY_COLORS[w.category]}
          stroke="var(--bg-card)"
          strokeWidth={0.6}
        />
      ))}

      <text x={cx} y={cy - bundleRadiusPx - 8} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
        bundle ⌀{bundleDiameterMm.toFixed(2)} mm
      </text>
      {finishedOuterDiameterMm !== null && (
        <text x={cx} y={cy + outerRadiusPx + 16} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
          finished ⌀{finishedOuterDiameterMm.toFixed(2)} mm{coveringLabel ? ` (${coveringLabel})` : ''}
        </text>
      )}

      <g fontSize="9" fontFamily="ui-monospace, monospace">
        {categoriesPresent.map((cat, i) => (
          <g key={cat} transform={`translate(${8}, ${8 + i * 14})`}>
            <rect width="9" height="9" fill={CATEGORY_COLORS[cat]} />
            <text x="13" y="8" fill="var(--text-2)">{CATEGORY_LABELS[cat]}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
