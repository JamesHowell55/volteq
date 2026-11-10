interface Props {
  diaMm: number;
  pitchTransverseMm: number;
  pitchLongitudinalMm: number;
  rowsAlongFlow: number;
  pinsAcross: number;
}

const MAX_ROWS = 14;
const MAX_ACROSS = 10;

// Plan view of the offset (staggered) pin array — flow runs left to right. Large arrays are
// truncated for legibility (labelled); proportions of D, S_T and S_L are drawn to scale.
export default function PinFinArrayDiagram({ diaMm, pitchTransverseMm, pitchLongitudinalMm, rowsAlongFlow, pinsAcross }: Props) {
  const rows = Math.min(Math.max(1, Math.round(rowsAlongFlow)), MAX_ROWS);
  const across = Math.min(Math.max(1, Math.round(pinsAcross)), MAX_ACROSS);
  const truncated = rows < rowsAlongFlow || across < pinsAcross;
  const st = Math.max(pitchTransverseMm, 0.01);
  const sl = Math.max(pitchLongitudinalMm, 0.01);
  const d = Math.min(Math.max(diaMm, 0.01), Math.min(st, sl) * 0.98);
  const wMm = (across + 0.5) * st;
  const lMm = rows * sl;
  const pad = 22;
  const scale = Math.min(520 / lMm, 240 / wMm);
  const W = lMm * scale + pad * 2 + 30;
  const H = wMm * scale + pad * 2;
  const pins: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < across; c++) {
      const offset = r % 2 === 0 ? 0.25 : 0.75;
      pins.push({ x: pad + (r + 0.5) * sl * scale, y: pad + (c + offset) * st * scale });
    }
  }
  const arrowY = pad + (wMm * scale) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 300 }} role="img" aria-label="Offset pin-fin array plan view">
      <rect x={pad} y={pad} width={lMm * scale} height={wMm * scale} fill="none" stroke="var(--border, #888)" strokeWidth={1.5} />
      {pins.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={(d / 2) * scale} fill="#a855f7" fillOpacity={0.85} />
      ))}
      <line x1={4} y1={arrowY} x2={pad - 3} y2={arrowY} stroke="var(--accent)" strokeWidth={2} markerEnd="url(#pfArrow)" />
      <line x1={pad + lMm * scale + 3} y1={arrowY} x2={W - 4} y2={arrowY} stroke="var(--accent)" strokeWidth={2} markerEnd="url(#pfArrow)" />
      <defs>
        <marker id="pfArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="var(--accent)" />
        </marker>
      </defs>
      {truncated && (
        <text x={W - 6} y={H - 4} textAnchor="end" fontSize={10} fill="var(--muted, #888)">drawn truncated to {rows}×{across}</text>
      )}
    </svg>
  );
}
