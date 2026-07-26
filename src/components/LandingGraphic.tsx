// Abstract line-art placeholders for the landing page's content sections —
// circuit/coil/cell motifs in the brand accent color, standing in for real
// photos/renders. Swapping any variant for a real asset later means touching
// only this file (e.g. replacing a case's <svg> with an <img src={...} />) —
// Home.tsx and the surrounding CSS layout never need to change.

export type LandingGraphicVariant = 'circuit-traces' | 'battery-cells' | 'motor-winding' | 'inverter-switching';

function CircuitTraces() {
  const vias: Array<[number, number]> = [[180, 60], [300, 140], [120, 180], [260, 280], [200, 300], [380, 220]];
  return (
    <svg viewBox="0 0 480 360" width="100%" style={{ maxHeight: 320 }}>
      <g fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.55}>
        <path d="M40 60 H180 V140 H300 V60 H440" />
        <path d="M40 180 H120 V280 H260 V220 H380 V140" />
        <path d="M60 300 H200 V240 H380 V220" />
      </g>
      {vias.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1} />
      ))}
    </svg>
  );
}

function BatteryCells() {
  const cols = 4;
  const rows = 3;
  const spacingX = 88;
  const spacingY = 76;
  const startX = 90;
  const startY = 60;
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 1 ? spacingX / 2 : 0;
    for (let col = 0; col < cols; col++) {
      cells.push([startX + col * spacingX + offset, startY + row * spacingY]);
    }
  }
  return (
    <svg viewBox="0 0 480 360" width="100%" style={{ maxHeight: 320 }}>
      {cells.map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={32} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} opacity={0.7} />
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="var(--accent)" strokeWidth={1.5} opacity={0.8} />
          <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke="var(--accent)" strokeWidth={1.5} opacity={0.8} />
        </g>
      ))}
    </svg>
  );
}

function MotorWinding() {
  const coilCount = 10;
  const coils = Array.from({ length: coilCount }, (_, i) => (i / coilCount) * Math.PI * 2);
  return (
    <svg viewBox="0 0 480 360" width="100%" style={{ maxHeight: 320 }}>
      <circle cx={240} cy={180} r={140} fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.4} />
      <circle cx={240} cy={180} r={78} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} opacity={0.6} />
      {coils.map((angle) => {
        const x1 = 240 + Math.cos(angle) * 92;
        const y1 = 180 + Math.sin(angle) * 92;
        const x2 = 240 + Math.cos(angle) * 132;
        const y2 = 180 + Math.sin(angle) * 132;
        const midAngle = angle + 0.18;
        const cx = 240 + Math.cos(midAngle) * 112;
        const cy = 180 + Math.sin(midAngle) * 112;
        return (
          <path
            key={angle}
            d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            opacity={0.55}
          />
        );
      })}
    </svg>
  );
}

function InverterSwitching() {
  return (
    <svg viewBox="0 0 480 360" width="100%" style={{ maxHeight: 320 }}>
      {/* simplified half-bridge: two switches over a load node */}
      <g fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.6}>
        <path d="M240 40 V90" />
        <rect x={210} y={90} width={60} height={40} rx={4} />
        <path d="M240 130 V190" />
        <rect x={210} y={190} width={60} height={40} rx={4} />
        <path d="M240 230 V300" />
        <path d="M270 110 H340" />
        <path d="M270 210 H340" />
      </g>
      <circle cx={240} cy={160} r={5} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1} />
      {/* PWM square-wave trace */}
      <path
        d="M40 300 H80 V260 H130 V300 H180 V260 H230 V300 H280 V260 H330 V300 H380"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        opacity={0.75}
      />
    </svg>
  );
}

export default function LandingGraphic({ variant }: { variant: LandingGraphicVariant }) {
  switch (variant) {
    case 'circuit-traces': return <CircuitTraces />;
    case 'battery-cells': return <BatteryCells />;
    case 'motor-winding': return <MotorWinding />;
    case 'inverter-switching': return <InverterSwitching />;
  }
}
