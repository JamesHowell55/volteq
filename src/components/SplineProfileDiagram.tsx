import type { ReactElement } from 'react';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';
import { generateProfilePoints, type SplineGeometry } from '../lib/splinePhysics';

// To-scale end view of an external involute spline: the true tooth profile
// (generated from the same involute maths as the DXF export) with the pitch,
// base, major and minor reference circles, and a measuring pin seated in a space
// annotated with the measurement-over-pins dimension.

const W = 460;
const H = 430;
const CX = W / 2;
const CY = 190;
const MONO = 'ui-monospace, monospace';

function fmtDim(mm: number, unitSystem: UnitSystem, digits = 2): string {
  const v = toDisplay(mm, unitSystem, UNIT_LENGTH);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: unitSystem === 'imperial' ? digits + 1 : digits })} ${unitLabel(unitSystem, UNIT_LENGTH)}`;
}

export default function SplineProfileDiagram({ geometry, unitSystem }: { geometry: SplineGeometry; unitSystem: UnitSystem }): ReactElement {
  const g = geometry;
  if (!(g.majorDiaMm > 0) || g.teeth < 3) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 430 }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Enter a valid module and tooth count</text>
      </svg>
    );
  }

  const rTip = g.majorDiaMm / 2;
  const scale = 150 / rTip; // px per mm; fit the tip circle to ~150 px radius
  const toX = (x: number) => CX + x * scale;
  const toY = (y: number) => CY - y * scale;

  const pts = generateProfilePoints(g, 14);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`).join(' ') + ' Z';

  // Measuring pins seated on the vertical axis (top and bottom), across the spline.
  const pinR = (g.pinDiameterMm / 2) * scale;
  const pinCentreR = (g.measurementOverPinsMm / 2 - g.pinDiameterMm / 2) * scale;

  const circle = (dMm: number, dash: string, stroke: string, key: string) => (
    <circle key={key} cx={CX} cy={CY} r={(dMm / 2) * scale} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray={dash} />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 430 }}>
      {/* Reference circles */}
      {circle(g.majorDiaMm, '', 'var(--text-faint)', 'major')}
      {circle(g.minorDiaMm, '', 'var(--text-faint)', 'minor')}
      {circle(g.pitchDiaMm, '5 3', 'var(--accent)', 'pitch')}
      {circle(g.baseDiaMm, '2 3', 'var(--text-faint)', 'base')}

      {/* Tooth profile (to scale) */}
      <path d={path} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.4} />

      {/* Centre cross */}
      <line x1={CX - 6} y1={CY} x2={CX + 6} y2={CY} stroke="var(--text-faint)" strokeWidth={1} />
      <line x1={CX} y1={CY - 6} x2={CX} y2={CY + 6} stroke="var(--text-faint)" strokeWidth={1} />

      {/* Measuring pins + MOP dimension */}
      {[1, -1].map((s) => (
        <circle key={`pin${s}`} cx={CX} cy={CY - s * pinCentreR} r={pinR} fill="none" stroke="var(--warn, #e0a000)" strokeWidth={1.3} strokeDasharray="3 2" />
      ))}
      <g stroke="var(--text-2)" strokeWidth={1} fill="none">
        <line x1={CX + 150} y1={CY - g.measurementOverPinsMm / 2 * scale} x2={CX + 150} y2={CY + g.measurementOverPinsMm / 2 * scale} />
        <path d={`M${CX + 147} ${CY - g.measurementOverPinsMm / 2 * scale + 5} L${CX + 153} ${CY - g.measurementOverPinsMm / 2 * scale + 5} L${CX + 150} ${CY - g.measurementOverPinsMm / 2 * scale} Z`} fill="var(--text-2)" />
        <path d={`M${CX + 147} ${CY + g.measurementOverPinsMm / 2 * scale - 5} L${CX + 153} ${CY + g.measurementOverPinsMm / 2 * scale - 5} L${CX + 150} ${CY + g.measurementOverPinsMm / 2 * scale} Z`} fill="var(--text-2)" />
      </g>
      <text x={CX + 156} y={CY + 4} fontSize="10" fill="var(--text-2)" fontFamily={MONO} stroke="none">MOP {fmtDim(g.measurementOverPinsMm, unitSystem)}</text>

      {/* Reference-circle labels */}
      <text x={CX} y={toY(rTip) - 6} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)" fontFamily={MONO}>Dee {fmtDim(g.majorDiaMm, unitSystem)}</text>
      <text x={toX(-g.pitchDiaMm / 2) - 4} y={CY - 4} textAnchor="end" fontSize="9.5" fill="var(--accent)" fontFamily={MONO}>D {fmtDim(g.pitchDiaMm, unitSystem)}</text>

      {/* Caption */}
      <text x={W / 2} y={H - 26} textAnchor="middle" fill="var(--text-2)" fontSize="10.5" fontFamily={MONO}>
        Ø{g.pinDiameterMm.toFixed(2)} mm measuring pins · z = {g.teeth} · m = {g.moduleMm} · α = {g.pressureAngleDeg}°
      </text>
      <text x={W / 2} y={H - 10} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>
        external spline end view · true involute profile · to scale
      </text>
    </svg>
  );
}
