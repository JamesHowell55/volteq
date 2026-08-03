import type { ReactElement } from 'react';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';
import type { BearingTypeMeta } from '../lib/bearingData';
import type { CatalogueEntry } from '../lib/bearingPhysics';

// Longitudinal cross-section of a shaft/bearing/housing (or shaft/bush/housing)
// assembly, in the same schematic, illustrative-proportions style as FitsDiagram —
// a real bearing section shows exactly one rolling element in section on each side
// (the plane cuts through the bearing axis, not around its circumference), which
// is what's drawn here. Deliberately not to scale.

type Props =
  | { kind: 'bearing'; type: BearingTypeMeta; entry: CatalogueEntry; radialLoadN: number; axialLoadN: number; unitSystem: UnitSystem }
  | { kind: 'bush'; boreMm: number; odMm: number; lengthMm: number; radialLoadN: number; unitSystem: UnitSystem };

const W = 480;
const H = 300;
const AXIS_Y = 150;
const MAX_HALF_PX = 100;
const HOUSING_X0 = W / 2 - 95;
const HOUSING_X1 = W / 2 + 95;
const SHAFT_OVERHANG_PX = 55;
const MONO = 'ui-monospace, monospace';

function fmtDim(mm: number, unitSystem: UnitSystem): string {
  const v = toDisplay(mm, unitSystem, UNIT_LENGTH);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: unitSystem === 'imperial' ? 3 : 2 })} ${unitLabel(unitSystem, UNIT_LENGTH)}`;
}

function hatchedRect(x: number, y: number, w: number, h: number, key: string, fill = 'var(--card-bg-2, rgba(255,255,255,0.03))'): ReactElement {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} stroke="var(--border-hover)" strokeWidth={1.2} />;
}

function radiusLeader(x: number, yAxis: number, yFeature: number, label: string, labelDy: number, anchor: 'start' | 'end' = 'start'): ReactElement {
  const dx = anchor === 'start' ? 4 : -4;
  return (
    <g key={`rl-${x}-${label}`} stroke="var(--text-faint)" strokeWidth={1}>
      <line x1={x} y1={yAxis} x2={x} y2={yFeature} />
      <line x1={x - 3} y1={yFeature + 4} x2={x} y2={yFeature} />
      <line x1={x + 3} y1={yFeature + 4} x2={x} y2={yFeature} />
      <text x={x + dx} y={yFeature + labelDy} fontSize="9.5" fill="var(--text-2)" fontFamily={MONO} stroke="none" textAnchor={anchor}>{label}</text>
    </g>
  );
}

function loadArrows(radialLoadN: number, axialLoadN: number, centerX: number, shaftHalfPx: number): ReactElement[] {
  const els: ReactElement[] = [];
  if (radialLoadN > 0) {
    const topY = AXIS_Y - shaftHalfPx - 34;
    els.push(
      <g key="fr" stroke="var(--accent)" strokeWidth={1.6} fill="var(--accent)">
        <line x1={centerX} y1={topY} x2={centerX} y2={AXIS_Y - shaftHalfPx - 4} />
        <path d={`M${centerX - 4} ${AXIS_Y - shaftHalfPx - 10} L${centerX + 4} ${AXIS_Y - shaftHalfPx - 10} L${centerX} ${AXIS_Y - shaftHalfPx - 2} Z`} />
        <text x={centerX + 7} y={topY + 8} fontSize="10.5" fill="var(--accent)" fontFamily={MONO} stroke="none">Fr</text>
      </g>
    );
  }
  if (axialLoadN > 0) {
    const y = AXIS_Y + shaftHalfPx + 30;
    const x0 = centerX - 26, x1 = centerX + 26;
    els.push(
      <g key="fa" stroke="var(--accent)" strokeWidth={1.6} fill="var(--accent)">
        <line x1={x0} y1={y} x2={x1} y2={y} />
        <path d={`M${x1 - 8} ${y - 4} L${x1 - 8} ${y + 4} L${x1} ${y} Z`} />
        <text x={x1 + 6} y={y + 4} fontSize="10.5" fill="var(--accent)" fontFamily={MONO} stroke="none">Fa</text>
      </g>
    );
  }
  return els;
}

function renderRollingElement(type: BearingTypeMeta, cx: number, cy: number, r: number): ReactElement {
  const key = `re-${cx}-${cy}`;
  const fill = 'var(--accent)';
  switch (type.rollingElement) {
    case 'ball':
      return <circle key={key} cx={cx} cy={cy} r={r} fill={fill} />;
    case 'cylindrical-roller':
      return <rect key={key} x={cx - r * 0.75} y={cy - r} width={r * 1.5} height={r * 2} rx={1.5} fill={fill} />;
    case 'needle':
      return <rect key={key} x={cx - r * 0.4} y={cy - r * 1.3} width={r * 0.8} height={r * 2.6} rx={1} fill={fill} />;
    case 'tapered-roller': {
      const top = r * 0.6, bottom = r * 1.0;
      return <polygon key={key} points={`${cx - top},${cy - r} ${cx + top},${cy - r} ${cx + bottom},${cy + r} ${cx - bottom},${cy + r}`} fill={fill} />;
    }
    case 'spherical-roller':
      return <ellipse key={key} cx={cx} cy={cy} rx={r * 0.95} ry={r * 1.2} fill={fill} />;
    default:
      return <circle key={key} cx={cx} cy={cy} r={r} fill={fill} />;
  }
}

function renderRadialBearing(type: BearingTypeMeta, entry: CatalogueEntry, radialLoadN: number, axialLoadN: number, unitSystem: UnitSystem): ReactElement {
  const pxPerMm = MAX_HALF_PX / ((entry.odMm / 2) * 1.18);
  const shaftHalfPx = Math.max((entry.boreMm / 2) * pxPerMm, 8);
  const bearingHalfPx = Math.max((entry.odMm / 2) * pxPerMm, shaftHalfPx + 20);
  const housingHalfPx = bearingHalfPx + 16;
  const innerRingOuterHalfPx = shaftHalfPx + (bearingHalfPx - shaftHalfPx) * 0.36;
  const outerRingInnerHalfPx = shaftHalfPx + (bearingHalfPx - shaftHalfPx) * 0.64;

  const shaftX0 = HOUSING_X0 - SHAFT_OVERHANG_PX;
  const shaftX1 = HOUSING_X1 + SHAFT_OVERHANG_PX;
  const cx = W / 2;

  const els: ReactElement[] = [];

  els.push(hatchedRect(HOUSING_X0, AXIS_Y - housingHalfPx, HOUSING_X1 - HOUSING_X0, housingHalfPx - bearingHalfPx, 'housing-top'));
  els.push(hatchedRect(HOUSING_X0, AXIS_Y + bearingHalfPx, HOUSING_X1 - HOUSING_X0, housingHalfPx - bearingHalfPx, 'housing-bottom'));

  els.push(hatchedRect(HOUSING_X0, AXIS_Y - bearingHalfPx, HOUSING_X1 - HOUSING_X0, bearingHalfPx - outerRingInnerHalfPx, 'outer-top', 'var(--text-faint)'));
  els.push(hatchedRect(HOUSING_X0, AXIS_Y + outerRingInnerHalfPx, HOUSING_X1 - HOUSING_X0, bearingHalfPx - outerRingInnerHalfPx, 'outer-bottom', 'var(--text-faint)'));

  els.push(hatchedRect(HOUSING_X0, AXIS_Y - innerRingOuterHalfPx, HOUSING_X1 - HOUSING_X0, innerRingOuterHalfPx - shaftHalfPx, 'inner-top', 'var(--text-faint)'));
  els.push(hatchedRect(HOUSING_X0, AXIS_Y + shaftHalfPx, HOUSING_X1 - HOUSING_X0, innerRingOuterHalfPx - shaftHalfPx, 'inner-bottom', 'var(--text-faint)'));

  const elementR = ((bearingHalfPx - innerRingOuterHalfPx) / 2) * 0.85;
  const rowXs = type.rowCount === 2 ? [cx - 22, cx + 22] : [cx];
  for (const rx of rowXs) {
    for (const sign of [-1, 1] as const) {
      const ey = AXIS_Y + sign * (innerRingOuterHalfPx + (bearingHalfPx - innerRingOuterHalfPx) / 2);
      els.push(renderRollingElement(type, rx, ey, elementR));
    }
  }

  if (type.contactAngleDeg > 0 && type.contactAngleDeg < 90 && type.rowCount === 1) {
    const ang = (type.contactAngleDeg * Math.PI) / 180;
    for (const sign of [-1, 1] as const) {
      const ey = AXIS_Y + sign * (innerRingOuterHalfPx + (bearingHalfPx - innerRingOuterHalfPx) / 2);
      const dx = Math.sin(ang) * 22;
      const dy = -sign * Math.cos(ang) * 22;
      els.push(<line key={`angle-${sign}`} x1={cx} y1={ey} x2={cx + dx} y2={ey + dy} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" />);
    }
  }

  els.push(<rect key="shaft" x={shaftX0} y={AXIS_Y - shaftHalfPx} width={shaftX1 - shaftX0} height={2 * shaftHalfPx} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} />);
  els.push(<line key="axis" x1={30} y1={AXIS_Y} x2={W - 20} y2={AXIS_Y} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="5 3" />);

  els.push(...loadArrows(radialLoadN, axialLoadN, cx, shaftHalfPx));

  els.push(radiusLeader(HOUSING_X0 + 20, AXIS_Y, AXIS_Y - shaftHalfPx, `bore d = ${fmtDim(entry.boreMm, unitSystem)}`, -6));
  els.push(radiusLeader(HOUSING_X1 - 20, AXIS_Y, AXIS_Y - bearingHalfPx, `OD D = ${fmtDim(entry.odMm, unitSystem)}`, -6, 'end'));

  els.push(
    <text key="caption" x={cx} y={H - 10} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>
      {type.label} · {entry.designation} · longitudinal section · schematic, not to scale
    </text>
  );

  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 300 }}>{els}</svg>;
}

function renderThrustBearing(type: BearingTypeMeta, entry: CatalogueEntry, radialLoadN: number, axialLoadN: number, unitSystem: UnitSystem): ReactElement {
  const pxPerMm = MAX_HALF_PX / ((entry.odMm / 2) * 1.15);
  const shaftHalfPx = Math.max((entry.boreMm / 2) * pxPerMm, 8);
  const washerHalfPx = Math.max((entry.odMm / 2) * pxPerMm, shaftHalfPx + 24);
  const cx = W / 2;
  const shaftX0 = 40, shaftX1 = W - 40;
  const washerThicknessPx = 16;
  const gapPx = 14;

  const els: ReactElement[] = [];
  els.push(<rect key="shaft" x={shaftX0} y={AXIS_Y - shaftHalfPx} width={shaftX1 - shaftX0} height={2 * shaftHalfPx} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} />);
  els.push(<line key="axis" x1={20} y1={AXIS_Y} x2={W - 20} y2={AXIS_Y} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="5 3" />);

  const washerXs = [cx - gapPx / 2 - washerThicknessPx, cx + gapPx / 2];
  for (const wx of washerXs) {
    els.push(hatchedRect(wx, AXIS_Y - washerHalfPx, washerThicknessPx, 2 * washerHalfPx, `washer-${wx}`, 'var(--text-faint)'));
  }
  const ballR = Math.min(gapPx * 0.9, washerHalfPx * 0.16);
  for (const sign of [-1, 1] as const) {
    els.push(<circle key={`ball-${sign}`} cx={cx} cy={AXIS_Y + sign * (shaftHalfPx + ballR + 6)} r={ballR} fill="var(--accent)" />);
  }
  const housingSpan = washerThicknessPx * 2 + gapPx;
  els.push(hatchedRect(cx - housingSpan, AXIS_Y - washerHalfPx - 14, housingSpan * 2, 14, 'housing-top'));
  els.push(hatchedRect(cx - housingSpan, AXIS_Y + washerHalfPx, housingSpan * 2, 14, 'housing-bottom'));

  els.push(...loadArrows(radialLoadN, axialLoadN, cx, shaftHalfPx));

  els.push(radiusLeader(shaftX0 + 20, AXIS_Y, AXIS_Y - shaftHalfPx, `bore d = ${fmtDim(entry.boreMm, unitSystem)}`, -6));
  els.push(radiusLeader(cx + housingSpan + 8, AXIS_Y, AXIS_Y - washerHalfPx, `OD D = ${fmtDim(entry.odMm, unitSystem)}`, -6, 'end'));

  els.push(
    <text key="caption" x={cx} y={H - 10} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>
      {type.label} · {entry.designation} · axial (thrust) arrangement · schematic, not to scale
    </text>
  );

  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 300 }}>{els}</svg>;
}

function renderBush(boreMm: number, odMm: number, lengthMm: number, radialLoadN: number, unitSystem: UnitSystem): ReactElement {
  const pxPerMm = MAX_HALF_PX / ((odMm / 2) * 1.2);
  const shaftHalfPx = Math.max((boreMm / 2) * pxPerMm, 8);
  const bushHalfPx = Math.max((odMm / 2) * pxPerMm, shaftHalfPx + 14);
  const housingHalfPx = bushHalfPx + 16;
  const cx = W / 2;
  const halfSpan = Math.min(90, (lengthMm / 2) * pxPerMm * 1.4 + 40);
  const bushX0 = cx - halfSpan, bushX1 = cx + halfSpan;
  const shaftX0 = bushX0 - 55, shaftX1 = bushX1 + 55;

  const els: ReactElement[] = [];
  els.push(hatchedRect(bushX0, AXIS_Y - housingHalfPx, bushX1 - bushX0, housingHalfPx - bushHalfPx, 'housing-top'));
  els.push(hatchedRect(bushX0, AXIS_Y + bushHalfPx, bushX1 - bushX0, housingHalfPx - bushHalfPx, 'housing-bottom'));
  els.push(hatchedRect(bushX0, AXIS_Y - bushHalfPx, bushX1 - bushX0, bushHalfPx - shaftHalfPx, 'bush-top', 'var(--text-faint)'));
  els.push(hatchedRect(bushX0, AXIS_Y + shaftHalfPx, bushX1 - bushX0, bushHalfPx - shaftHalfPx, 'bush-bottom', 'var(--text-faint)'));
  els.push(<rect key="shaft" x={shaftX0} y={AXIS_Y - shaftHalfPx} width={shaftX1 - shaftX0} height={2 * shaftHalfPx} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.3} />);
  els.push(<line key="axis" x1={20} y1={AXIS_Y} x2={W - 20} y2={AXIS_Y} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="5 3" />);
  els.push(...loadArrows(radialLoadN, 0, cx, shaftHalfPx));
  els.push(radiusLeader(bushX0 + 18, AXIS_Y, AXIS_Y - shaftHalfPx, `bore d = ${fmtDim(boreMm, unitSystem)}`, -6));
  els.push(radiusLeader(bushX1 - 18, AXIS_Y, AXIS_Y - bushHalfPx, `OD Ø ${fmtDim(odMm, unitSystem)}`, -6, 'end'));

  const dimY = AXIS_Y + housingHalfPx + 22;
  els.push(
    <g key="len" stroke="var(--text-faint)" strokeWidth={1}>
      <line x1={bushX0} y1={AXIS_Y + housingHalfPx + 4} x2={bushX0} y2={dimY} />
      <line x1={bushX1} y1={AXIS_Y + housingHalfPx + 4} x2={bushX1} y2={dimY} />
      <line x1={bushX0} y1={dimY} x2={bushX1} y2={dimY} />
      <text x={cx} y={dimY + 14} fontSize="9.5" fill="var(--text-2)" fontFamily={MONO} stroke="none" textAnchor="middle">L = {fmtDim(lengthMm, unitSystem)}</text>
    </g>
  );
  els.push(
    <text key="caption" x={cx} y={H - 10} textAnchor="middle" fill="var(--text-faint)" fontSize="9.5" fontFamily={MONO}>
      plain bush (sleeve bearing) · longitudinal section · schematic, not to scale
    </text>
  );
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 300 }}>{els}</svg>;
}

export default function BearingCrossSectionDiagram(props: Props): ReactElement {
  if (props.kind === 'bush') {
    if (props.boreMm <= 0 || props.odMm <= props.boreMm) {
      return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 300 }}>
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Enter a shaft diameter to size the bush</text>
        </svg>
      );
    }
    return renderBush(props.boreMm, props.odMm, props.lengthMm, props.radialLoadN, props.unitSystem);
  }
  const { type, entry, radialLoadN, axialLoadN, unitSystem } = props;
  if (entry.boreMm <= 0 || entry.odMm <= entry.boreMm) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 300 }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Enter a shaft diameter to size the bearing</text>
      </svg>
    );
  }
  if (type.axial === 'axial-only') return renderThrustBearing(type, entry, radialLoadN, axialLoadN, unitSystem);
  return renderRadialBearing(type, entry, radialLoadN, axialLoadN, unitSystem);
}
