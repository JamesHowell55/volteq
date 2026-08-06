import type { ReactElement } from 'react';
import type { SealType, PressureDirection } from '../lib/oringPhysics';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';

// Schematic gland cross-sections for each seal configuration, with the input
// dimensions called out so it's unambiguous which number drives which feature.
// Deliberately NOT to scale: real grooves are tiny relative to their diameters,
// so a true-scale section would be unreadable. The O-Ring ellipse squeeze and
// groove proportions are exaggerated but topologically faithful.

interface Props {
  sealType: SealType;
  pressureDirection: PressureDirection;
  sealDiameterMm?: number; // rod Ø (innerRadial) / bore Ø (outerRadial)
  grooveDiameterMm?: number; // housing groove Ø (innerRadial) / groove root Ø (outerRadial)
  counterDiameterMm?: number | null; // housing bore Ø / piston land Ø
  grooveWidthMm?: number;
  grooveOuterDiameterMm?: number; // d7
  grooveInnerDiameterMm?: number; // d8
  grooveDepthMm?: number; // t
  perimeterMm?: number; // non-circular centreline length L
  rectWidthMm?: number | null;
  rectHeightMm?: number | null;
  rectCornerRadiusMm?: number | null;
  d1Mm: number;
  squeezePct: number;
  unitSystem: UnitSystem;
}

const W = 480;

function fmtDim(mm: number, unitSystem: UnitSystem): string {
  const v = toDisplay(mm, unitSystem, UNIT_LENGTH);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: unitSystem === 'imperial' ? 4 : 2 })} ${unitLabel(unitSystem, UNIT_LENGTH)}`;
}

const MONO = 'ui-monospace, monospace';

/** Squeezed O-Ring ellipse preserving cross-section area. */
function squeezedEllipse(cx: number, cy: number, csPx: number, heightPx: number, key: string): ReactElement {
  const ry = Math.max(heightPx / 2, 2);
  const rx = Math.max((csPx * csPx) / (4 * ry), ry * 0.6);
  return <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} />;
}

function hatchedRect(x: number, y: number, w: number, h: number, key: string): ReactElement {
  return (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} fill="var(--card-bg-2, rgba(255,255,255,0.03))" stroke="var(--border-hover)" strokeWidth={1.2} />
    </g>
  );
}

function dimLabel(x: number, y: number, text: string, color = 'var(--text-3)', anchor: 'start' | 'middle' | 'end' = 'start'): ReactElement {
  return <text key={`t-${x}-${y}-${text}`} x={x} y={y} fontSize="9.5" fill={color} fontFamily={MONO} textAnchor={anchor}>{text}</text>;
}

/** Vertical radius leader from the axis centreline up to a feature edge. */
function radiusLeader(x: number, yAxis: number, yFeature: number, label: string, labelDy = -4): ReactElement {
  return (
    <g key={`rl-${x}-${label}`} stroke="var(--text-faint)" strokeWidth={1}>
      <line x1={x} y1={yAxis} x2={x} y2={yFeature} />
      <line x1={x - 3} y1={yFeature + 4} x2={x} y2={yFeature} />
      <line x1={x + 3} y1={yFeature + 4} x2={x} y2={yFeature} />
      <text x={x + 4} y={yFeature + labelDy} fontSize="9.5" fill="var(--text-2)" fontFamily={MONO} stroke="none">{label}</text>
    </g>
  );
}

export default function ORingGlandDiagram(props: Props) {
  const { sealType, pressureDirection, unitSystem, squeezePct } = props;

  if (sealType === 'innerRadial' || sealType === 'outerRadial') {
    const H = 330;
    const isRod = sealType === 'innerRadial';
    const yAxis = 300; // shaft axis centreline
    const yInterface = 158; // sealing interface (bore / rod surface)
    const gap = 5; // exaggerated extrusion clearance
    const grooveHalfW = 34;
    const grooveCx = 250;
    const grooveDepthPx = 46;
    const squeezeFrac = Math.min(Math.max(squeezePct, 0), 40) / 100;
    // O-Ring height = gland height (groove root to counter surface)
    const glandPx = grooveDepthPx + gap;
    const csPx = glandPx / (1 - squeezeFrac || 1);

    const els: ReactElement[] = [];
    if (isRod) {
      // Rod below; housing above with groove cut upward.
      els.push(hatchedRect(40, yInterface + gap, 400, yAxis - yInterface - gap - 8, 'rod'));
      els.push(
        <path key="housing" d={`M40 60 L440 60 L440 ${yInterface} L${grooveCx + grooveHalfW} ${yInterface} L${grooveCx + grooveHalfW} ${yInterface - grooveDepthPx} L${grooveCx - grooveHalfW} ${yInterface - grooveDepthPx} L${grooveCx - grooveHalfW} ${yInterface} L40 ${yInterface} Z`}
          fill="var(--card-bg-2, rgba(255,255,255,0.03))" stroke="var(--border-hover)" strokeWidth={1.2} />
      );
      els.push(squeezedEllipse(grooveCx, (yInterface + gap + (yInterface - grooveDepthPx)) / 2, csPx, glandPx, 'or'));
      els.push(radiusLeader(100, yAxis, yInterface + gap, `rod Ø d5 = ${props.sealDiameterMm != null ? fmtDim(props.sealDiameterMm, unitSystem) : '—'}`));
      els.push(radiusLeader(155, yAxis, yInterface - grooveDepthPx, `groove Ø d6 = ${props.grooveDiameterMm != null ? fmtDim(props.grooveDiameterMm, unitSystem) : '—'}`));
      if (props.counterDiameterMm != null) {
        els.push(radiusLeader(392, yAxis, yInterface, `bore Ø = ${fmtDim(props.counterDiameterMm, unitSystem)}`));
      }
      els.push(dimLabel(46, 76, 'housing', 'var(--text-faint)'));
      els.push(dimLabel(46, yAxis - 16, 'rod', 'var(--text-faint)'));
    } else {
      // Piston below with groove cut downward; cylinder above.
      els.push(hatchedRect(40, 60, 400, yInterface - 60 - gap, 'cyl'));
      els.push(
        <path key="piston" d={`M40 ${yAxis - 8} L40 ${yInterface} L${grooveCx - grooveHalfW} ${yInterface} L${grooveCx - grooveHalfW} ${yInterface + grooveDepthPx} L${grooveCx + grooveHalfW} ${yInterface + grooveDepthPx} L${grooveCx + grooveHalfW} ${yInterface} L440 ${yInterface} L440 ${yAxis - 8} Z`}
          fill="var(--card-bg-2, rgba(255,255,255,0.03))" stroke="var(--border-hover)" strokeWidth={1.2} />
      );
      els.push(squeezedEllipse(grooveCx, (yInterface - gap + (yInterface + grooveDepthPx)) / 2, csPx, glandPx, 'or'));
      els.push(radiusLeader(100, yAxis, yInterface - gap, `bore Ø = ${props.sealDiameterMm != null ? fmtDim(props.sealDiameterMm, unitSystem) : '—'}`));
      els.push(radiusLeader(155, yAxis, yInterface + grooveDepthPx, `groove root Ø d3 = ${props.grooveDiameterMm != null ? fmtDim(props.grooveDiameterMm, unitSystem) : '—'}`, 12));
      if (props.counterDiameterMm != null) {
        els.push(radiusLeader(392, yAxis, yInterface, `piston Ø = ${fmtDim(props.counterDiameterMm, unitSystem)}`));
      }
      els.push(dimLabel(46, 76, 'cylinder', 'var(--text-faint)'));
      els.push(dimLabel(46, yAxis - 16, 'piston', 'var(--text-faint)'));
    }

    // Groove width dimension
    const yW = isRod ? yInterface - grooveDepthPx - 12 : yInterface + grooveDepthPx + 16;
    els.push(
      <g key="bdim" stroke="var(--border-strong)" strokeWidth={1}>
        <line x1={grooveCx - grooveHalfW} y1={yW} x2={grooveCx + grooveHalfW} y2={yW} />
        <line x1={grooveCx - grooveHalfW} y1={yW - 3} x2={grooveCx - grooveHalfW} y2={yW + 3} />
        <line x1={grooveCx + grooveHalfW} y1={yW - 3} x2={grooveCx + grooveHalfW} y2={yW + 3} />
      </g>
    );
    els.push(dimLabel(grooveCx, isRod ? yW - 5 : yW + 12, `b = ${props.grooveWidthMm != null ? fmtDim(props.grooveWidthMm, unitSystem) : '—'}`, 'var(--text-2)', 'middle'));

    // Extrusion gap callout
    els.push(
      <g key="gapdim">
        <line x1={330} y1={yInterface + (isRod ? gap / 2 : -gap / 2)} x2={368} y2={isRod ? yInterface + 32 : yInterface - 32} stroke="var(--text-faint)" strokeWidth={0.8} />
        {dimLabel(371, isRod ? yInterface + 36 : yInterface - 30, 'clearance gap S', 'var(--text-faint)')}
      </g>
    );

    // Pressure arrow along the interface
    els.push(
      <g key="press" fill="var(--warn)">
        <line x1={58} y1={yInterface + (isRod ? gap / 2 : -gap / 2)} x2={92} y2={yInterface + (isRod ? gap / 2 : -gap / 2)} stroke="var(--warn)" strokeWidth={1.5} />
        <polygon points={`98,${yInterface + (isRod ? gap / 2 : -gap / 2)} 88,${yInterface + (isRod ? gap / 2 : -gap / 2) - 4} 88,${yInterface + (isRod ? gap / 2 : -gap / 2) + 4}`} />
        {dimLabel(50, yInterface + (isRod ? gap / 2 : -gap / 2) - 8, 'p', 'var(--warn)')}
      </g>
    );

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: H }}>
        {els}
        <line x1={20} y1={yAxis} x2={460} y2={yAxis} stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="10,3,2,3" />
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)" fontFamily={MONO}>
          {isRod ? 'inner radial (rod) seal — groove in housing, seals on rod' : 'outer radial (piston) seal — groove in piston, seals on bore'} · half section · schematic, not to scale
        </text>
      </svg>
    );
  }

  // --- Axial face seals ---
  const isNonCircular = sealType === 'nonCircularFace';
  const H = isNonCircular ? 470 : 330;
  const els: ReactElement[] = [];
  let sectionTop = 40;

  if (isNonCircular) {
    // Plan view of the rounded-rectangle groove path
    const planCy = 130;
    const planW = 250;
    const rw = props.rectWidthMm ?? null;
    const rh = props.rectHeightMm ?? null;
    const rr = props.rectCornerRadiusMm ?? null;
    const aspect = rw != null && rh != null && rw > 0 && rh > 0 ? rh / rw : 0.55;
    const pw = planW;
    const ph = Math.min(Math.max(planW * aspect, 60), 150);
    const px0 = 240 - pw / 2;
    const py0 = planCy - ph / 2;
    const rPx = rw != null && rr != null && rw > 0 ? Math.min((rr / rw) * pw, pw / 2, ph / 2) : 18;
    els.push(
      <rect key="plan" x={px0} y={py0} width={pw} height={ph} rx={rPx} fill="none" stroke="var(--accent)" strokeWidth={2} />
    );
    els.push(
      <rect key="plan2" x={px0 - 8} y={py0 - 8} width={pw + 16} height={ph + 16} rx={rPx + 8} fill="none" stroke="var(--border-hover)" strokeWidth={1} />
    );
    els.push(
      <rect key="plan3" x={px0 + 8} y={py0 + 8} width={pw - 16} height={ph - 16} rx={Math.max(rPx - 8, 2)} fill="none" stroke="var(--border-hover)" strokeWidth={1} />
    );
    if (rw != null && rh != null) {
      els.push(dimLabel(240, py0 - 16, `W = ${fmtDim(rw, unitSystem)}`, 'var(--text-2)', 'middle'));
      els.push(dimLabel(px0 + pw + 14, planCy, `H = ${fmtDim(rh, unitSystem)}`, 'var(--text-2)'));
      if (rr != null) els.push(dimLabel(px0 + pw - 6, py0 + 18, `r = ${fmtDim(rr, unitSystem)}`, 'var(--text-2)', 'end'));
    }
    if (props.perimeterMm != null) {
      els.push(dimLabel(240, planCy - 6, `L (neutral axis) = ${fmtDim(props.perimeterMm, unitSystem)}`, 'var(--accent)', 'middle'));
      els.push(dimLabel(240, planCy + 10, `equivalent Ø = L/π = ${fmtDim(props.perimeterMm / Math.PI, unitSystem)}`, 'var(--text-2)', 'middle'));
    }
    els.push(dimLabel(240, py0 + ph + 22, 'groove centreline path (plan view)', 'var(--text-faint)', 'middle'));
    sectionTop = 250;
  }

  // Section view: two plates, groove in the lower plate.
  const xAxis = 56; // groove axis centreline (circular face seals)
  const yFace = sectionTop + 90; // interface between plates
  const t = 40; // groove depth px
  const gW = 66; // groove width px
  const gX = 268; // groove inner wall x
  const squeezeFracF = Math.min(Math.max(squeezePct, 0), 40) / 100;
  const csPxF = t / (1 - squeezeFracF || 1);

  // Upper plate (cover)
  els.push(hatchedRect(xAxis, sectionTop + 30, 384, yFace - sectionTop - 34, 'cover'));
  // Lower plate with groove
  els.push(
    <path key="base" d={`M${xAxis} ${yFace} L${gX} ${yFace} L${gX} ${yFace + t} L${gX + gW} ${yFace + t} L${gX + gW} ${yFace} L440 ${yFace} L440 ${yFace + 78} L${xAxis} ${yFace + 78} Z`}
      fill="var(--card-bg-2, rgba(255,255,255,0.03))" stroke="var(--border-hover)" strokeWidth={1.2} />
  );
  // The O-Ring is pushed against the pressure-side groove wall — the same
  // seatInternal/seatExternal behaviour the physics engine models. In this
  // section the groove's INNER wall (toward the axis, smaller diameter, d8) is
  // on the LEFT at gX; the OUTER wall (larger diameter, d7) is on the RIGHT at
  // gX+gW. Internal pressure comes from the bore side and drives the ring
  // outward onto the outer wall; external pressure (or internal vacuum) drives
  // it inward onto the inner wall. The ellipse is shifted so it just touches
  // that wall rather than sitting centred in the groove.
  const orRy = Math.max((t + 4) / 2, 2);
  const orRx = Math.max((csPxF * csPxF) / (4 * orRy), orRy * 0.6);
  const seatsOuter = pressureDirection === 'internal';
  // Exaggerate the ring being driven hard against the pressure-side wall: push it
  // a few px past the wall (schematic contact/deformation) so there's an obvious
  // open gap on the low-pressure side and it's unmistakable which face it seals on.
  const wallOverlap = 5;
  const orCx = seatsOuter ? gX + gW - orRx + wallOverlap : gX + orRx - wallOverlap;
  els.push(squeezedEllipse(orCx, yFace + t / 2 - 2, csPxF, t + 4, 'orf'));
  // Mark the sealed contact face and the open (low-pressure) gap.
  const sealX = seatsOuter ? gX + gW : gX;
  els.push(<line key="contact" x1={sealX} y1={yFace + 1} x2={sealX} y2={yFace + t - 1} stroke="var(--accent)" strokeWidth={2.5} />);
  const gapX = seatsOuter ? gX : gX + gW;
  els.push(dimLabel(gapX + (seatsOuter ? 3 : -3), yFace + t / 2 + 3, 'gap', 'var(--text-faint)', seatsOuter ? 'start' : 'end'));
  els.push(dimLabel(xAxis + 6, sectionTop + 48, 'cover / mating face', 'var(--text-faint)'));
  els.push(dimLabel(xAxis + 6, yFace + 70, 'grooved housing', 'var(--text-faint)'));
  // Which wall the ring seats against, called out under the groove.
  els.push(dimLabel(gX + gW / 2, sectionTop + 30 - 6, `seats on ${seatsOuter ? 'outer (d7)' : 'inner (d8)'} wall`, 'var(--accent)', 'middle'));

  if (!isNonCircular) {
    // d8 / d7 horizontal dimensions from the groove axis
    const yD8 = yFace + t + 26;
    const yD7 = yFace + t + 44;
    els.push(
      <g key="d8" stroke="var(--text-faint)" strokeWidth={1}>
        <line x1={xAxis} y1={yD8} x2={gX} y2={yD8} />
        <line x1={gX} y1={yD8 - 3} x2={gX} y2={yFace + t + 2} strokeDasharray="2,2" />
        {dimLabel((xAxis + gX) / 2, yD8 - 4, `groove ID d8 = ${props.grooveInnerDiameterMm != null ? fmtDim(props.grooveInnerDiameterMm, unitSystem) : '—'}`, 'var(--text-2)', 'middle')}
      </g>
    );
    els.push(
      <g key="d7" stroke="var(--text-faint)" strokeWidth={1}>
        <line x1={xAxis} y1={yD7} x2={gX + gW} y2={yD7} />
        <line x1={gX + gW} y1={yD7 - 3} x2={gX + gW} y2={yFace + t + 2} strokeDasharray="2,2" />
        {dimLabel((xAxis + gX + gW) / 2, yD7 + 12, `groove OD d7 = ${props.grooveOuterDiameterMm != null ? fmtDim(props.grooveOuterDiameterMm, unitSystem) : '—'}`, 'var(--text-2)', 'middle')}
      </g>
    );
    // Axis centreline
    els.push(<line key="axis" x1={xAxis} y1={sectionTop + 16} x2={xAxis} y2={yFace + t + 54} stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="10,3,2,3" />);
  } else {
    // Non-circular: groove width dimension instead of d7/d8
    const yB = yFace + t + 26;
    els.push(
      <g key="bnc" stroke="var(--border-strong)" strokeWidth={1}>
        <line x1={gX} y1={yB} x2={gX + gW} y2={yB} />
        <line x1={gX} y1={yB - 3} x2={gX} y2={yB + 3} />
        <line x1={gX + gW} y1={yB - 3} x2={gX + gW} y2={yB + 3} />
        {dimLabel(gX + gW / 2, yB + 13, `b = ${props.grooveWidthMm != null ? fmtDim(props.grooveWidthMm, unitSystem) : '—'}`, 'var(--text-2)', 'middle')}
      </g>
    );
  }

  // Groove depth t on the right of the groove
  els.push(
    <g key="tdim" stroke="var(--border-strong)" strokeWidth={1}>
      <line x1={gX + gW + 10} y1={yFace} x2={gX + gW + 10} y2={yFace + t} />
      <line x1={gX + gW + 7} y1={yFace} x2={gX + gW + 13} y2={yFace} />
      <line x1={gX + gW + 7} y1={yFace + t} x2={gX + gW + 13} y2={yFace + t} />
      {dimLabel(gX + gW + 16, yFace + t / 2 + 3, `t = ${props.grooveDepthMm != null ? fmtDim(props.grooveDepthMm, unitSystem) : '—'}`, 'var(--text-2)')}
    </g>
  );
  if (!isNonCircular) {
    const yBTop = yFace - 10;
    els.push(
      <g key="bdimf" stroke="var(--border-strong)" strokeWidth={1}>
        <line x1={gX} y1={yBTop} x2={gX + gW} y2={yBTop} />
        <line x1={gX} y1={yBTop - 3} x2={gX} y2={yBTop + 3} />
        <line x1={gX + gW} y1={yBTop - 3} x2={gX + gW} y2={yBTop + 3} />
        {dimLabel(gX + gW / 2, yBTop - 5, `b = (d7−d8)/2 = ${props.grooveWidthMm != null ? fmtDim(props.grooveWidthMm, unitSystem) : '—'}`, 'var(--text-2)', 'middle')}
      </g>
    );
  }

  // Pressure arrow at the interface
  const pFromInside = pressureDirection === 'internal';
  const pX = pFromInside ? xAxis + 30 : 430;
  const pDir = pFromInside ? 1 : -1;
  els.push(
    <g key="pressf" fill="var(--warn)">
      <line x1={pX} y1={yFace - 4} x2={pX + 30 * pDir} y2={yFace - 4} stroke="var(--warn)" strokeWidth={1.5} />
      <polygon points={`${pX + 36 * pDir},${yFace - 4} ${pX + 26 * pDir},${yFace - 8} ${pX + 26 * pDir},${yFace}`} />
      {dimLabel(pX + (pFromInside ? -4 : 6), yFace - 10, `p (${pFromInside ? 'internal' : 'external'})`, 'var(--warn)', pFromInside ? 'end' : 'start')}
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: H }}>
      {els}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)" fontFamily={MONO}>
        axial face seal{isNonCircular ? ', non-circular groove path' : ''} · section · schematic, not to scale
      </text>
    </svg>
  );
}
