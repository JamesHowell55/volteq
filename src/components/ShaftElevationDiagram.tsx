import type { ReactElement } from 'react';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';
import type { ShaftSection, TransverseLoad } from '../lib/shaftPhysics';

// Side elevation of a stepped shaft: each section drawn to scale in length and
// (scaled) diameter about the centreline, hollow bores shown, bearing supports
// as triangles, transverse loads as arrows, and each evaluation station marked
// (the governing one highlighted).

const W = 900;
const H = 260;
const AXIS_Y = 120;
const MARGIN_X = 40;
const MAX_HALF = 70; // px, largest shaft radius drawn
const MONO = 'ui-monospace, monospace';

interface StationMark { positionMm: number; governing: boolean; label: string; }

interface Props {
  sections: ShaftSection[];
  bearingAPosMm: number;
  bearingBPosMm: number;
  loads: TransverseLoad[];
  stations: StationMark[];
  unitSystem: UnitSystem;
}

export default function ShaftElevationDiagram({ sections, bearingAPosMm, bearingBPosMm, loads, stations, unitSystem }: Props): ReactElement {
  const L = sections.reduce((a, s) => a + s.lengthMm, 0);
  if (L <= 0 || sections.length === 0) {
    return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 260 }}><text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Define at least one shaft section</text></svg>;
  }
  const maxOd = Math.max(...sections.map((s) => s.odMm));
  const plotW = W - 2 * MARGIN_X;
  const sx = (mm: number) => MARGIN_X + (mm / L) * plotW;
  const sr = (mm: number) => (mm / maxOd) * MAX_HALF; // radius px

  const els: ReactElement[] = [];
  // Sections
  let x = 0;
  sections.forEach((s, i) => {
    const x0 = sx(x), x1 = sx(x + s.lengthMm);
    const rOuter = sr(s.odMm);
    els.push(<rect key={`sec${i}`} x={x0} y={AXIS_Y - rOuter} width={x1 - x0} height={2 * rOuter} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} />);
    if (s.idMm > 0) {
      const rIn = sr(s.idMm);
      els.push(<rect key={`bore${i}`} x={x0} y={AXIS_Y - rIn} width={x1 - x0} height={2 * rIn} fill="var(--card-bg, rgba(0,0,0,0.15))" stroke="var(--border-hover)" strokeWidth={0.8} strokeDasharray="3 2" />);
    }
    x += s.lengthMm;
  });
  els.push(<line key="axis" x1={MARGIN_X - 10} y1={AXIS_Y} x2={W - MARGIN_X + 10} y2={AXIS_Y} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="6 3" />);

  // Bearings (triangles below)
  for (const [pos, lbl] of [[bearingAPosMm, 'A'], [bearingBPosMm, 'B']] as const) {
    const bx = sx(pos as number);
    const by = AXIS_Y + sr(maxOd) + 6;
    els.push(
      <g key={`brg${lbl}`}>
        <path d={`M${bx} ${by} L${bx - 9} ${by + 15} L${bx + 9} ${by + 15} Z`} fill="none" stroke="var(--text-2)" strokeWidth={1.3} />
        <line x1={bx - 13} y1={by + 15} x2={bx + 13} y2={by + 15} stroke="var(--text-2)" strokeWidth={1.3} />
        <text x={bx} y={by + 28} textAnchor="middle" fontSize="10" fontFamily={MONO} fill="var(--text-2)">{lbl}</text>
      </g>,
    );
  }

  // Loads (arrows from above)
  for (const l of loads) {
    if (l.magnitudeN <= 0) continue;
    const lx = sx(l.positionMm);
    const topY = 20;
    const tipY = AXIS_Y - sr(maxOd) - 4;
    els.push(
      <g key={`ld${l.id}`} stroke="var(--pos, #16a34a)" strokeWidth={1.6} fill="var(--pos, #16a34a)">
        <line x1={lx} y1={topY} x2={lx} y2={tipY} />
        <path d={`M${lx - 4} ${tipY - 7} L${lx + 4} ${tipY - 7} L${lx} ${tipY} Z`} />
        <text x={lx + 5} y={topY + 9} fontSize="9.5" fontFamily={MONO} stroke="none">{l.label || 'F'}{l.angleDeg ? ` @${l.angleDeg}°` : ''}</text>
      </g>,
    );
  }

  // Station markers (below the shaft)
  for (const st of stations) {
    const stx = sx(st.positionMm);
    const y0 = AXIS_Y + sr(maxOd) + 2;
    els.push(
      <g key={`st${st.positionMm}-${st.label}`}>
        <circle cx={stx} cy={AXIS_Y - sr(maxOd) - 10} r={4} fill={st.governing ? 'var(--neg, #dc2626)' : 'var(--warn, #e0a000)'} />
        {st.governing && <text x={stx} y={AXIS_Y - sr(maxOd) - 16} textAnchor="middle" fontSize="9" fontFamily={MONO} fill="var(--neg, #dc2626)" stroke="none">governing</text>}
        <line x1={stx} y1={AXIS_Y - sr(maxOd) - 6} x2={stx} y2={y0} stroke="var(--text-faint)" strokeWidth={0.7} strokeDasharray="2 2" />
      </g>,
    );
  }

  els.push(<text key="cap" x={W / 2} y={H - 8} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>side elevation · length {toDisplay(L, unitSystem, UNIT_LENGTH).toFixed(unitSystem === 'imperial' ? 2 : 0)} {unitLabel(unitSystem, UNIT_LENGTH)} · diameters to scale · ● stations</text>);

  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 260 }}>{els}</svg>;
}
