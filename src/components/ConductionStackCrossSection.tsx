interface Props {
  busbarThicknessMm: number;
  timThicknessMm: number;
  timConductivity: number;
  metalThicknessMm: number;
  metalConductivity: number;
}

const DRAW_W = 420;
const DRAW_H = 300;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 40;
const MARGIN_X = 90;
const FLUID_BAND_PX = 46; // decorative — no real "channel height" input, so not drawn to scale

// Cross-section of the conduction-cooling path for one section: the busbar
// conductor sits on a thermal interface material, which sits on a metallic
// plate, which is bathed by the coolant. Each of the first three layers is
// drawn to the same mm->px scale (so relative thicknesses are meaningful);
// the fluid band is a fixed decorative height since no channel geometry is
// captured as an input.
export default function ConductionStackCrossSection({ busbarThicknessMm, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity }: Props) {
  const stackW = DRAW_W - 2 * MARGIN_X;
  const availH = DRAW_H - MARGIN_TOP - MARGIN_BOTTOM - FLUID_BAND_PX;
  const totalMm = Math.max(busbarThicknessMm + timThicknessMm + metalThicknessMm, 0.001);
  const scale = availH / totalMm;

  const busbarPx = Math.max(busbarThicknessMm * scale, 10);
  const timPx = Math.max(timThicknessMm * scale, 4);
  const metalPx = Math.max(metalThicknessMm * scale, 8);

  const busbarY = MARGIN_TOP;
  const timY = busbarY + busbarPx;
  const metalY = timY + timPx;
  const fluidY = metalY + metalPx;

  const layers = [
    { y: busbarY, h: busbarPx, fill: 'var(--accent-glow)', stroke: 'var(--accent)', label: 'Busbar (conductor)', dim: `${busbarThicknessMm} mm` },
    { y: timY, h: timPx, fill: 'color-mix(in srgb, var(--warn) 25%, transparent)', stroke: 'var(--warn)', label: 'Thermal interface material', dim: `${timThicknessMm} mm, k=${timConductivity} W/m·K` },
    { y: metalY, h: metalPx, fill: 'color-mix(in srgb, var(--text-3) 30%, transparent)', stroke: 'var(--text-2)', label: 'Metallic section', dim: `${metalThicknessMm} mm, k=${metalConductivity} W/m·K` },
  ];

  return (
    <svg viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} width="100%" style={{ maxHeight: 320 }}>
      <defs>
        <pattern id="coolingHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="var(--blue)" opacity="0.12" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--blue)" strokeWidth="2.2" />
        </pattern>
      </defs>

      {layers.map(l => (
        <g key={l.label}>
          <rect x={MARGIN_X} y={l.y} width={stackW} height={l.h} fill={l.fill} stroke={l.stroke} strokeWidth={1.5} />
          <text x={MARGIN_X - 10} y={l.y + l.h / 2 + 3} textAnchor="end" fontSize="10" fill={l.stroke} fontFamily="ui-monospace, monospace">
            {l.label}
          </text>
          <text x={MARGIN_X + stackW + 10} y={l.y + l.h / 2 + 3} textAnchor="start" fontSize="9" fill="var(--text-2)" fontFamily="ui-monospace, monospace">
            {l.dim}
          </text>
        </g>
      ))}

      {/* fluid band — hatched blue, decorative height, with flow arrows */}
      <rect x={MARGIN_X} y={fluidY} width={stackW} height={FLUID_BAND_PX} fill="url(#coolingHatch)" stroke="var(--blue)" strokeWidth={1.5} />
      <text x={MARGIN_X - 10} y={fluidY + FLUID_BAND_PX / 2 + 3} textAnchor="end" fontSize="10" fill="var(--blue)" fontFamily="ui-monospace, monospace">
        Coolant / fluid
      </text>
      {[0.2, 0.45, 0.7, 0.95].map((f, i) => (
        <path
          key={i}
          d={`M ${MARGIN_X + stackW * f - 8} ${fluidY + FLUID_BAND_PX / 2} L ${MARGIN_X + stackW * f + 4} ${fluidY + FLUID_BAND_PX / 2} L ${MARGIN_X + stackW * f} ${fluidY + FLUID_BAND_PX / 2 - 5} M ${MARGIN_X + stackW * f + 4} ${fluidY + FLUID_BAND_PX / 2} L ${MARGIN_X + stackW * f} ${fluidY + FLUID_BAND_PX / 2 + 5}`}
          stroke="var(--blue)"
          strokeWidth={1.3}
          fill="none"
          opacity={0.85}
        />
      ))}

      <text x={DRAW_W / 2} y={DRAW_H - 10} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">
        conduction path (one face) · layers to scale except fluid band · flow direction indicative only
      </text>
    </svg>
  );
}
