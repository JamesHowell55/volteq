import type { ReactElement } from 'react';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';
import type { SystemLoad, Arrangement } from '../lib/shaftBearingSystem';

// Schematic of a shaft on two bearings: the shaft, bearing A/B symbols with the
// selected designation and reaction, transverse load arrows, and the axial
// (thrust) arrow — annotated with the arrangement (fixed–floating or opposed pair).

const W = 900;
const H = 240;
const AXIS_Y = 118;
const MARGIN_X = 60;
const MONO = 'ui-monospace, monospace';

interface Props {
  bearingAPosMm: number;
  bearingBPosMm: number;
  loads: SystemLoad[];
  arrangement: Arrangement;
  locatingBearing: 'A' | 'B';
  designationA: string; designationB: string;
  reactionAN: number; reactionBN: number;
  externalThrustN: number;
  unitSystem: UnitSystem;
}

export default function ShaftBearingSystemDiagram(p: Props): ReactElement {
  const positions = [p.bearingAPosMm, p.bearingBPosMm, ...p.loads.map((l) => l.positionMm)];
  const minX = Math.min(0, ...positions);
  const maxX = Math.max(p.bearingBPosMm, ...positions, p.bearingAPosMm + 1);
  const span = maxX - minX || 1;
  const sx = (mm: number) => MARGIN_X + ((mm - minX) / span) * (W - 2 * MARGIN_X);

  const els: ReactElement[] = [];
  const shaftHalf = 14;
  const x0 = sx(minX), x1 = sx(maxX);
  els.push(<rect key="shaft" x={x0} y={AXIS_Y - shaftHalf} width={x1 - x0} height={2 * shaftHalf} rx={2} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} />);
  els.push(<line key="axis" x1={x0 - 12} y1={AXIS_Y} x2={x1 + 12} y2={AXIS_Y} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="6 3" />);

  // Bearings
  const bearing = (pos: number, lbl: 'A' | 'B', des: string, reac: number, floating: boolean): ReactElement => {
    const bx = sx(pos);
    return (
      <g key={`brg${lbl}`}>
        <rect x={bx - 13} y={AXIS_Y - shaftHalf - 16} width={26} height={16} fill="var(--text-faint)" stroke="var(--border-hover)" strokeWidth={1} />
        <rect x={bx - 13} y={AXIS_Y + shaftHalf} width={26} height={16} fill="var(--text-faint)" stroke="var(--border-hover)" strokeWidth={1} />
        {!floating && <line x1={bx - 17} y1={AXIS_Y + shaftHalf + 20} x2={bx + 17} y2={AXIS_Y + shaftHalf + 20} stroke="var(--text-2)" strokeWidth={2} />}
        {/* reaction arrow (up) */}
        <g stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)">
          <line x1={bx} y1={AXIS_Y + shaftHalf + 44} x2={bx} y2={AXIS_Y + shaftHalf + 20} />
          <path d={`M${bx - 4} ${AXIS_Y + shaftHalf + 26} L${bx + 4} ${AXIS_Y + shaftHalf + 26} L${bx} ${AXIS_Y + shaftHalf + 19} Z`} />
        </g>
        <text x={bx} y={AXIS_Y - shaftHalf - 22} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily={MONO} fill="var(--text)">{lbl}{floating ? ' (float)' : ' (fixed)'}</text>
        <text x={bx} y={AXIS_Y + shaftHalf + 58} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fill="var(--accent)">{des} · {reac.toFixed(0)} N</text>
      </g>
    );
  };
  const floatA = p.arrangement === 'fixed-floating' && p.locatingBearing === 'B';
  const floatB = p.arrangement === 'fixed-floating' && p.locatingBearing === 'A';
  els.push(bearing(p.bearingAPosMm, 'A', p.designationA, p.reactionAN, floatA));
  els.push(bearing(p.bearingBPosMm, 'B', p.designationB, p.reactionBN, floatB));

  // Loads (radial arrows down)
  for (const l of p.loads) {
    if (l.radialN <= 0) continue;
    const lx = sx(l.positionMm);
    els.push(
      <g key={`ld${l.id}`} stroke="var(--pos, #16a34a)" strokeWidth={1.6} fill="var(--pos, #16a34a)">
        <line x1={lx} y1={18} x2={lx} y2={AXIS_Y - shaftHalf - 3} />
        <path d={`M${lx - 4} ${AXIS_Y - shaftHalf - 10} L${lx + 4} ${AXIS_Y - shaftHalf - 10} L${lx} ${AXIS_Y - shaftHalf - 2} Z`} />
        <text x={lx + 5} y={26} fontSize="9.5" fontFamily={MONO} stroke="none">{l.label || 'F'} {l.radialN.toFixed(0)}N</text>
      </g>,
    );
  }

  // Thrust arrow (axial)
  if (Math.abs(p.externalThrustN) > 1) {
    const dir = p.externalThrustN >= 0 ? 1 : -1;
    const cx = (x0 + x1) / 2;
    const ty = AXIS_Y;
    els.push(
      <g key="thrust" stroke="var(--warn, #e0a000)" strokeWidth={2} fill="var(--warn, #e0a000)">
        <line x1={cx - dir * 22} y1={ty} x2={cx + dir * 22} y2={ty} />
        <path d={`M${cx + dir * 14} ${ty - 5} L${cx + dir * 14} ${ty + 5} L${cx + dir * 24} ${ty} Z`} />
        <text x={cx} y={ty - 10} textAnchor="middle" fontSize="9.5" fontFamily={MONO} stroke="none">Ka {Math.abs(p.externalThrustN).toFixed(0)}N</text>
      </g>,
    );
  }

  const arrLabel = p.arrangement === 'fixed-floating' ? 'fixed–floating' : p.arrangement === 'back-to-back' ? 'opposed pair · back-to-back (O)' : 'opposed pair · face-to-face (X)';
  els.push(<text key="cap" x={W / 2} y={H - 8} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>shaft on two bearings · {arrLabel} · span {toDisplay(p.bearingBPosMm - p.bearingAPosMm, p.unitSystem, UNIT_LENGTH).toFixed(0)} {unitLabel(p.unitSystem, UNIT_LENGTH)} · schematic</text>);

  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 240 }}>{els}</svg>;
}
