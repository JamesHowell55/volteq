import { PT_W, PT_H, triangleGeometry, type TriangleInput } from '../lib/powerTriangleGeometry';

interface Props extends TriangleInput {
  phiDeg: number;
  pLabel: string;
  qLabel: string;
  sLabel: string;
  correctedPhiDeg?: number | null;
  correctedSLabel?: string;
}

// Power triangle drawn to scale. When a corrected state is supplied, the reduced
// reactive component and shorter hypotenuse are overlaid dashed so the effect of
// the capacitor bank (smaller S, smaller φ, same P) is visible at a glance.
export default function PowerTriangle(props: Props) {
  const { pW, qVar, sVA, lagging, corrected, phiDeg, pLabel, qLabel, sLabel, correctedPhiDeg, correctedSLabel } = props;
  const g = triangleGeometry({ pW, qVar, sVA, lagging, corrected });
  const midX = (g.ox + g.px) / 2;
  const showArc = qVar > 1e-9 * sVA && pW > 1e-9 * sVA;

  return (
    <svg viewBox={`0 0 ${PT_W} ${PT_H}`} width="100%" style={{ maxHeight: 320 }}>
      {/* filled triangle */}
      <polygon points={`${g.ox},${g.oy} ${g.px},${g.oy} ${g.px},${g.qy}`} fill="var(--accent-glow)" stroke="none" />

      {/* corrected overlay */}
      {corrected && g.qyNew !== null && (
        <g>
          <line x1={g.ox} y1={g.oy} x2={g.px} y2={g.qyNew} stroke="var(--pos)" strokeWidth={1.5} strokeDasharray="5 3" />
          <line x1={18} y1={19} x2={44} y2={19} stroke="var(--pos)" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={50} y={22} fontSize="9.5" fill="var(--pos)" fontFamily="ui-monospace, monospace">
            corrected S = {correctedSLabel}{correctedPhiDeg != null ? ` · φ = ${correctedPhiDeg.toFixed(1)}°` : ''}
          </text>
        </g>
      )}

      {/* P, Q, S */}
      <line x1={g.ox} y1={g.oy} x2={g.px} y2={g.oy} stroke="var(--accent)" strokeWidth={2} />
      <line x1={g.px} y1={g.oy} x2={g.px} y2={g.qy} stroke="var(--text-2)" strokeWidth={2} />
      <line x1={g.ox} y1={g.oy} x2={g.px} y2={g.qy} stroke="var(--accent)" strokeWidth={2} />

      {showArc && (
        <path d={`M ${g.ox + g.arcR} ${g.oy} A ${g.arcR} ${g.arcR} 0 0 ${lagging ? 0 : 1} ${g.arcEndX} ${g.arcEndY}`} fill="none" stroke="var(--text-2)" strokeWidth={1} />
      )}
      {showArc && (
        <text x={g.ox + g.arcR + 8} y={g.oy + (lagging ? -8 : 16)} fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
          φ = {phiDeg.toFixed(1)}°
        </text>
      )}

      <text x={midX} y={g.oy + (lagging ? 18 : -8)} textAnchor="middle" fontSize="10.5" fill="var(--accent)" fontFamily="ui-monospace, monospace">P = {pLabel}</text>
      <text x={g.px + 8} y={(g.oy + g.qy) / 2 + 4} fontSize="10.5" fill="var(--text-2)" fontFamily="ui-monospace, monospace">Q = {qLabel}</text>
      <text x={(g.ox + g.px) / 2 - 12} y={(g.oy + g.qy) / 2 + (lagging ? -10 : 18)} textAnchor="end" fontSize="10.5" fill="var(--accent)" fontFamily="ui-monospace, monospace">S = {sLabel}</text>

      <text x={PT_W / 2} y={PT_H - 8} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">
        power triangle to scale · {lagging ? 'lagging (inductive) load' : 'leading (capacitive) load'}
      </text>
    </svg>
  );
}
