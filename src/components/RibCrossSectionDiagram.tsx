interface Props {
  heightMm: number;
  widthMm: number;
  widthOk: boolean;
}

const DRAW_W = 420;
const DRAW_H = 230;
const BASE_Y = 165;
const RIB_CENTER_X = DRAW_W / 2;
const RIB_HALF_W_PX = 26; // fixed on-screen half-width — geometry is illustrative, not to scale
const RIB_H_PX = 60;

// Side-profile cross-section of an insulation surface between two conductive
// regions, with a rib (raised barrier) molded into it — the same 2x-height
// creepage-path detour credited to a cut groove, drawn as a raised feature
// since that's the more common real-world case (an enclosure rib, PCB
// standoff, or connector web). Only the ratio the width bears to the
// pollution-degree minimum is meaningful here; absolute rib proportions are
// drawn at a fixed illustrative scale since actual rib dimensions can be a
// fraction of a millimetre up to several millimetres — no single px/mm scale
// would stay legible across that range.
export default function RibCrossSectionDiagram({ heightMm, widthMm, widthOk }: Props) {
  const ribLeftX = RIB_CENTER_X - RIB_HALF_W_PX;
  const ribRightX = RIB_CENTER_X + RIB_HALF_W_PX;
  const ribTopY = BASE_Y - RIB_H_PX;
  const pathColor = widthOk ? 'var(--accent)' : 'var(--neg)';

  return (
    <svg viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} width="100%" style={{ maxHeight: 280 }}>
      {/* insulation surface (baseline) */}
      <line x1={20} y1={BASE_Y} x2={DRAW_W - 20} y2={BASE_Y} stroke="var(--text-3)" strokeWidth={2} />

      {/* left / right conductive regions */}
      <rect x={20} y={BASE_Y} width={70} height={16} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1} />
      <text x={55} y={BASE_Y + 34} textAnchor="middle" fontSize="9.5" fill="var(--text-2)" fontFamily="ui-monospace, monospace">live</text>
      <rect x={DRAW_W - 90} y={BASE_Y} width={70} height={16} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1} />
      <text x={DRAW_W - 55} y={BASE_Y + 34} textAnchor="middle" fontSize="9.5" fill="var(--text-2)" fontFamily="ui-monospace, monospace">chassis</text>

      {/* rib */}
      <path
        d={`M ${ribLeftX} ${BASE_Y} L ${ribLeftX} ${ribTopY} L ${ribRightX} ${ribTopY} L ${ribRightX} ${BASE_Y}`}
        fill="none"
        stroke={widthOk ? 'var(--text-2)' : 'var(--neg)'}
        strokeWidth={2}
      />

      {/* creepage path: flat, then up-and-over the rib */}
      <path
        d={`M 90 ${BASE_Y - 4} L ${ribLeftX} ${BASE_Y - 4} L ${ribLeftX} ${ribTopY} L ${ribRightX} ${ribTopY} L ${ribRightX} ${BASE_Y - 4} L ${DRAW_W - 90} ${BASE_Y - 4}`}
        fill="none"
        stroke={pathColor}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />

      {/* width callout (W), below baseline */}
      <line x1={ribLeftX} y1={BASE_Y + 8} x2={ribLeftX} y2={BASE_Y + 20} stroke="var(--text-2)" strokeWidth={1} />
      <line x1={ribRightX} y1={BASE_Y + 8} x2={ribRightX} y2={BASE_Y + 20} stroke="var(--text-2)" strokeWidth={1} />
      <line x1={ribLeftX} y1={BASE_Y + 14} x2={ribRightX} y2={BASE_Y + 14} stroke="var(--text-2)" strokeWidth={1} />
      <text x={RIB_CENTER_X} y={BASE_Y + 30} textAnchor="middle" fontSize="10" fill={widthOk ? 'var(--text-2)' : 'var(--neg)'} fontFamily="ui-monospace, monospace">
        W = {widthMm.toFixed(2)} mm{!widthOk ? ' ⚠ below minimum' : ''}
      </text>

      {/* height callout (H), right of rib */}
      <line x1={ribRightX + 10} y1={BASE_Y} x2={ribRightX + 22} y2={BASE_Y} stroke="var(--text-2)" strokeWidth={1} />
      <line x1={ribRightX + 10} y1={ribTopY} x2={ribRightX + 22} y2={ribTopY} stroke="var(--text-2)" strokeWidth={1} />
      <line x1={ribRightX + 16} y1={BASE_Y} x2={ribRightX + 16} y2={ribTopY} stroke="var(--text-2)" strokeWidth={1} />
      <text x={ribRightX + 26} y={(BASE_Y + ribTopY) / 2 + 4} fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
        H = {heightMm.toFixed(2)} mm
      </text>

      {/* legend */}
      <g fontSize="9.5" fontFamily="ui-monospace, monospace">
        <line x1={20} y1={202} x2={40} y2={202} stroke={pathColor} strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={46} y={205} fill="var(--text-2)">Creepage path traced by the standard's measurement rule</text>
      </g>
    </svg>
  );
}
