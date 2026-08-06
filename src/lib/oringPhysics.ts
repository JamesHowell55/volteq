// O-Ring gland physics engine — pure functions, no React. Implements the
// Trelleborg O-Rings design guide (April 2007) method:
//  - Installed stretch / circumferential compression per seal configuration
//    (B.2.3/B.2.4): outer radial seals stretch d1 onto the groove root (max
//    installed 8% below d1=50, 6% above); inner radial seals seat by slight
//    circumferential compression of the OD (max 3%); axial face seals seat
//    against the pressure-side groove wall (OD 1-2% over the outer groove
//    diameter for internal pressure, d1 1-3% under the inner groove diameter
//    for external pressure); non-circular face grooves compare the O-Ring
//    neutral-axis (centreline) circumference π·(d1+d2) with the groove
//    centreline path length.
//  - Cross-section change with stretch: Δd2 ≈ −0.5% per 1% stretch (the guide's
//    stated approximation of its exact reduction formula); symmetric bulge
//    applied for circumferential compression.
//  - Initial squeeze = (d2_eff − gland height)/d2_eff, checked against the
//    guide's Figure 15/16 bands per cross-section and application.
//  - Gland fill = O-Ring cross-section area / rectangular groove area, checked
//    at nominal (≤75% recommended) and worst-case (≤85%) — standard industry
//    limits; the groove is idealised as a rectangle (corner radii and the
//    clearance-gap volume are neglected, slightly conservative).
//  - Extrusion gap check against the guide's Table XII (70/90 Shore A).
// Worst cases use independent tolerance extremes (each dimension at its worst
// limit simultaneously) — conservative by construction.

import {
  recommendedSqueezePercent,
  maxInstalledStretchPercent,
  maxPermissibleRadialClearanceMm,
  MAX_CIRCUMFERENTIAL_COMPRESSION_PERCENT,
  MAX_GLAND_FILL_PERCENT,
  RECOMMENDED_GLAND_FILL_PERCENT,
  CORNER_RADIUS_RECOMMENDED_RATIO,
  CORNER_RADIUS_MINIMUM_RATIO,
  type SqueezeApplication,
} from './oringData';

export type SealType = 'innerRadial' | 'outerRadial' | 'axialFace' | 'nonCircularFace';
export type DutyType = 'static' | 'hydraulicDynamic' | 'pneumaticDynamic';
export type PressureDirection = 'internal' | 'external';

/** A toleranced dimension: nominal plus upper/lower deviations (mm, lower ≤ 0 ≤ upper typically). */
export interface Dim {
  nom: number;
  upper: number;
  lower: number;
}

export const dimMax = (d: Dim): number => d.nom + d.upper;
export const dimMin = (d: Dim): number => d.nom + d.lower;

export interface TriValue {
  nom: number;
  min: number;
  max: number;
}

export interface SealCheck {
  id: string;
  label: string;
  severity: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface ORingSealInput {
  sealType: SealType;
  duty: DutyType; // face seals are always static
  pressureDirection: PressureDirection; // face seals only
  // Radial seals:
  sealDiameter?: Dim; // innerRadial: rod Ø d5 · outerRadial: bore Ø
  grooveDiameter?: Dim; // innerRadial: housing groove Ø d6 · outerRadial: piston groove root Ø d3
  grooveWidth?: Dim; // b
  counterDiameter?: Dim | null; // extrusion-gap partner: housing bore Ø (innerRadial) / piston land Ø (outerRadial); null → skip gap check
  // Axial face seals:
  grooveOuterDiameter?: Dim; // d7
  grooveInnerDiameter?: Dim; // d8
  grooveDepth?: Dim; // t
  // Non-circular face seals:
  neutralPerimeter?: Dim; // groove centreline path length L
  cornerRadiusMm?: number | null;
  // O-Ring:
  d1: number;
  d1TolMm: number;
  cs: number;
  csTolMm: number;
  // Service:
  pressureMPa: number; // 0 → skip extrusion check
  shoreA: number;
}

export interface ORingSealResult {
  stretchPct: TriValue; // metric meaning depends on stretchKind
  stretchKind: 'idStretch' | 'circumferentialCompression' | 'seatInternal' | 'seatExternal' | 'centerlineStretch';
  effectiveCsMm: TriValue;
  glandHeightMm: TriValue;
  grooveWidthMm: TriValue;
  squeezePct: TriValue;
  squeezeAbsMm: TriValue;
  fillPct: { nom: number; min: number; max: number };
  widthRatio: number; // groove width / effective cs, nominal
  squeezeRec: { min: number; max: number };
  squeezeApplication: SqueezeApplication;
  extrusionGap: { actualMaxMm: number; allowableMm: number | null; backupRingsRecommended: boolean } | null;
  equivalentDiameterMm: number | null; // non-circular: L/π
  idealD1Mm: number;
  checks: SealCheck[];
  overallPass: boolean;
}

function squeezeApplicationFor(sealType: SealType, duty: DutyType): SqueezeApplication {
  if (sealType === 'axialFace' || sealType === 'nonCircularFace') return 'axial';
  if (duty === 'hydraulicDynamic') return 'hydraulicDynamic';
  if (duty === 'pneumaticDynamic') return 'pneumaticDynamic';
  return 'radialStatic';
}

/** d2 after stretch ε (%): −0.5% of d2 per +1% stretch; symmetric bulge for
 *  circumferential compression (negative ε). Guide-stated approximation. */
function effectiveCs(cs: number, stretchPct: number): number {
  return cs * (1 - 0.005 * stretchPct);
}

export function solveORingSeal(input: ORingSealInput): ORingSealResult {
  const checks: SealCheck[] = [];
  const { sealType, d1, d1TolMm, cs, csTolMm } = input;
  const d1Min = d1 - d1TolMm;
  const d1Max = d1 + d1TolMm;
  const csMin = cs - csTolMm;
  const csMax = cs + csTolMm;
  const oringOd = d1 + 2 * cs;
  const oringOdMin = d1Min + 2 * csMin;
  const oringOdMax = d1Max + 2 * csMax;

  let stretchKind: ORingSealResult['stretchKind'];
  let stretchPct: TriValue;
  let glandHeight: TriValue;
  let grooveWidth: TriValue;
  let idealD1: number;
  let equivalentDiameterMm: number | null = null;

  if (sealType === 'innerRadial' || sealType === 'outerRadial') {
    const seal = input.sealDiameter!;
    const groove = input.grooveDiameter!;
    grooveWidth = { nom: input.grooveWidth!.nom, min: dimMin(input.grooveWidth!), max: dimMax(input.grooveWidth!) };

    if (sealType === 'outerRadial') {
      // Piston seal: d1 stretched over the groove root Ø d3 (d1 ≤ d3 per guide).
      stretchKind = 'idStretch';
      stretchPct = {
        nom: ((groove.nom - d1) / d1) * 100,
        min: ((dimMin(groove) - d1Max) / d1Max) * 100,
        max: ((dimMax(groove) - d1Min) / d1Min) * 100,
      };
      // Gland height between groove root and bore.
      glandHeight = {
        nom: (seal.nom - groove.nom) / 2,
        min: (dimMin(seal) - dimMax(groove)) / 2,
        max: (dimMax(seal) - dimMin(groove)) / 2,
      };
      idealD1 = groove.nom / 1.02; // ≈2% installed stretch
    } else {
      // Rod seal: O-Ring OD circumferentially compressed into the housing groove Ø d6;
      // negative stretch metric = compression (guide max 3%).
      stretchKind = 'circumferentialCompression';
      stretchPct = {
        nom: ((groove.nom - oringOd) / oringOd) * 100,
        min: ((dimMin(groove) - oringOdMax) / oringOdMax) * 100,
        max: ((dimMax(groove) - oringOdMin) / oringOdMin) * 100,
      };
      glandHeight = {
        nom: (groove.nom - seal.nom) / 2,
        min: (dimMin(groove) - dimMax(seal)) / 2,
        max: (dimMax(groove) - dimMin(seal)) / 2,
      };
      // Guide: ring OD ≈ groove Ø d6 (slightly larger to seat, compression ≤3%),
      // so the circumference is set by the OD/groove contact, not the rod.
      idealD1 = 1.01 * groove.nom - 2 * cs;
    }
  } else {
    // Axial face seals (circular or non-circular path)
    const depth = input.grooveDepth!;
    glandHeight = { nom: depth.nom, min: dimMin(depth), max: dimMax(depth) };

    if (sealType === 'axialFace') {
      const d7 = input.grooveOuterDiameter!;
      const d8 = input.grooveInnerDiameter!;
      grooveWidth = {
        nom: (d7.nom - d8.nom) / 2,
        min: (dimMin(d7) - dimMax(d8)) / 2,
        max: (dimMax(d7) - dimMin(d8)) / 2,
      };
      if (input.pressureDirection === 'internal') {
        // O-Ring OD should be ~1-2% larger than the outer groove Ø d7 (seats on outer wall).
        stretchKind = 'seatInternal';
        stretchPct = {
          nom: ((oringOd - d7.nom) / d7.nom) * 100,
          min: ((oringOdMin - dimMax(d7)) / dimMax(d7)) * 100,
          max: ((oringOdMax - dimMin(d7)) / dimMin(d7)) * 100,
        };
        idealD1 = 1.015 * d7.nom - 2 * cs;
      } else {
        // d1 should be ~1-3% smaller than the inner groove Ø d8 (seats on inner wall).
        stretchKind = 'seatExternal';
        stretchPct = {
          nom: ((d8.nom - d1) / d8.nom) * 100,
          min: ((dimMin(d8) - d1Max) / dimMin(d8)) * 100,
          max: ((dimMax(d8) - d1Min) / dimMax(d8)) * 100,
        };
        idealD1 = 0.98 * d8.nom;
      }
    } else {
      // Non-circular: compare O-Ring centreline circumference π(d1+d2) to the
      // groove centreline path length L.
      const L = input.neutralPerimeter!;
      equivalentDiameterMm = L.nom / Math.PI;
      grooveWidth = { nom: input.grooveWidth!.nom, min: dimMin(input.grooveWidth!), max: dimMax(input.grooveWidth!) };
      stretchKind = 'centerlineStretch';
      const ringCl = Math.PI * (d1 + cs);
      const ringClMin = Math.PI * (d1Min + csMin);
      const ringClMax = Math.PI * (d1Max + csMax);
      stretchPct = {
        nom: ((L.nom - ringCl) / ringCl) * 100,
        min: ((dimMin(L) - ringClMax) / ringClMax) * 100,
        max: ((dimMax(L) - ringClMin) / ringClMin) * 100,
      };
      idealD1 = equivalentDiameterMm / 1.02 - cs; // ≈2% centreline stretch
    }
  }

  // Effective cross-section after stretch/compression. Positive stretch thins
  // the ring (0.5%/1%); circumferential compression bulges it by the same factor.
  // A loose ring (metric on the "wrong side" of zero) is dimensionally unchanged,
  // so the strain is clamped to the physically meaningful side per seal kind.
  // Worst-case pairing: thinnest ring = min cs + most thinning strain; thickest
  // ring = max cs + least thinning / most bulging strain.
  let effectiveCsMm: TriValue;
  if (stretchKind === 'idStretch' || stretchKind === 'centerlineStretch') {
    effectiveCsMm = {
      nom: effectiveCs(cs, Math.max(stretchPct.nom, 0)),
      min: effectiveCs(csMin, Math.max(stretchPct.max, 0)),
      max: effectiveCs(csMax, Math.max(stretchPct.min, 0)),
    };
  } else if (stretchKind === 'circumferentialCompression') {
    effectiveCsMm = {
      nom: effectiveCs(cs, Math.min(stretchPct.nom, 0)),
      min: effectiveCs(csMin, Math.min(stretchPct.max, 0)),
      max: effectiveCs(csMax, Math.min(stretchPct.min, 0)),
    };
  } else {
    // Seat-based face metrics: body strain negligible; raw cross-section.
    effectiveCsMm = { nom: cs, min: csMin, max: csMax };
  }

  // Squeeze
  const squeezePct: TriValue = {
    nom: ((effectiveCsMm.nom - glandHeight.nom) / effectiveCsMm.nom) * 100,
    min: ((effectiveCsMm.min - glandHeight.max) / effectiveCsMm.min) * 100,
    max: ((effectiveCsMm.max - glandHeight.min) / effectiveCsMm.max) * 100,
  };
  const squeezeAbsMm: TriValue = {
    nom: effectiveCsMm.nom - glandHeight.nom,
    min: effectiveCsMm.min - glandHeight.max,
    max: effectiveCsMm.max - glandHeight.min,
  };

  // Gland fill (rectangular groove idealisation). Max (worst) fill = biggest
  // ring in the smallest groove; min (best) fill = smallest ring in the biggest
  // groove — both from independent tolerance extremes, matching how the other
  // metrics stack their worst/best cases.
  const ringArea = (Math.PI / 4) * effectiveCsMm.nom * effectiveCsMm.nom;
  const ringAreaMax = (Math.PI / 4) * effectiveCsMm.max * effectiveCsMm.max;
  const ringAreaMin = (Math.PI / 4) * effectiveCsMm.min * effectiveCsMm.min;
  const fillNom = (ringArea / (grooveWidth.nom * glandHeight.nom)) * 100;
  const fillWorst = (ringAreaMax / (grooveWidth.min * glandHeight.min)) * 100;
  const fillMin = (ringAreaMin / (grooveWidth.max * glandHeight.max)) * 100;

  const widthRatio = grooveWidth.nom / effectiveCsMm.nom;

  const squeezeApplication = squeezeApplicationFor(sealType, input.duty);
  const squeezeRec = recommendedSqueezePercent(squeezeApplication, cs);

  // ---- Checks ----
  // Stretch / seating
  if (stretchKind === 'idStretch') {
    const maxAllowed = maxInstalledStretchPercent(d1);
    if (stretchPct.max > maxAllowed) {
      checks.push({ id: 'stretch', label: 'Installed stretch', severity: 'fail', detail: `Worst-case stretch ${stretchPct.max.toFixed(1)}% exceeds the guide limit of ${maxAllowed}% for d1 ${d1 < 50 ? '<' : '>'} 50 mm — pick a larger d1.` });
    } else if (stretchPct.nom > 5) {
      checks.push({ id: 'stretch', label: 'Installed stretch', severity: 'warn', detail: `Nominal stretch ${stretchPct.nom.toFixed(1)}% is above the ~2–5% usually targeted — cross-section thinning (~${(stretchPct.nom * 0.5).toFixed(1)}%) is eating into the squeeze.` });
    } else if (stretchPct.min < 0) {
      checks.push({ id: 'stretch', label: 'Installed stretch', severity: 'warn', detail: `At worst-case tolerances the ring is loose on the groove root (stretch ${stretchPct.min.toFixed(1)}%) and may not stay seated during assembly.` });
    } else {
      checks.push({ id: 'stretch', label: 'Installed stretch', severity: 'pass', detail: `Stretch ${stretchPct.nom.toFixed(1)}% nominal (${stretchPct.min.toFixed(1)}–${stretchPct.max.toFixed(1)}% across tolerances) — within the guide limit of ${maxInstalledStretchPercent(d1)}%.` });
    }
  } else if (stretchKind === 'circumferentialCompression') {
    const comp = -stretchPct.min; // most negative = most compressed
    if (comp > MAX_CIRCUMFERENTIAL_COMPRESSION_PERCENT) {
      checks.push({ id: 'stretch', label: 'Circumferential compression', severity: 'fail', detail: `Worst-case circumferential compression ${comp.toFixed(1)}% exceeds the guide maximum of 3% — the ring can buckle/wave in the groove. Pick a smaller d1.` });
    } else if (stretchPct.max > 0.5) {
      checks.push({ id: 'stretch', label: 'Circumferential compression', severity: 'warn', detail: `The O-Ring OD is smaller than the housing groove Ø at worst case (${stretchPct.max.toFixed(1)}% clearance) — the ring may fall out of the groove during assembly. Prefer d1 giving slight (0–3%) compression.` });
    } else {
      checks.push({ id: 'stretch', label: 'Circumferential compression', severity: 'pass', detail: `Circumferential compression ${(-stretchPct.nom).toFixed(1)}% nominal — within the guide maximum of 3%.` });
    }
  } else if (stretchKind === 'seatInternal') {
    if (stretchPct.nom < 0) {
      checks.push({ id: 'stretch', label: 'Seat against outer groove wall', severity: 'warn', detail: `With internal pressure the O-Ring OD should be ~1–2% larger than the outer groove Ø, but it is ${(-stretchPct.nom).toFixed(1)}% smaller — the ring will shift under pressure before sealing.` });
    } else if (stretchPct.nom > 3) {
      checks.push({ id: 'stretch', label: 'Seat against outer groove wall', severity: 'warn', detail: `O-Ring OD is ${stretchPct.nom.toFixed(1)}% larger than the outer groove Ø (target ~1–2%) — installation gets awkward and the ring may wrinkle.` });
    } else {
      checks.push({ id: 'stretch', label: 'Seat against outer groove wall', severity: 'pass', detail: `O-Ring OD is ${stretchPct.nom.toFixed(1)}% larger than the outer groove Ø — seats on the outer wall as recommended for internal pressure (target 1–2%).` });
    }
  } else if (stretchKind === 'seatExternal') {
    if (stretchPct.nom < 0) {
      checks.push({ id: 'stretch', label: 'Seat against inner groove wall', severity: 'warn', detail: `With external pressure d1 should be ~1–3% smaller than the inner groove Ø, but it is larger — the ring will shift under pressure before sealing.` });
    } else if (stretchPct.nom > 5) {
      checks.push({ id: 'stretch', label: 'Seat against inner groove wall', severity: 'warn', detail: `d1 is ${stretchPct.nom.toFixed(1)}% smaller than the inner groove Ø (target ~1–3%) — excessive stretch thins the section.` });
    } else {
      checks.push({ id: 'stretch', label: 'Seat against inner groove wall', severity: 'pass', detail: `d1 is ${stretchPct.nom.toFixed(1)}% smaller than the inner groove Ø — seats on the inner wall as recommended for external pressure (target 1–3%).` });
    }
  } else {
    // centerlineStretch
    const maxAllowed = maxInstalledStretchPercent(d1);
    if (stretchPct.max > maxAllowed) {
      checks.push({ id: 'stretch', label: 'Centreline stretch', severity: 'fail', detail: `Worst-case centreline stretch ${stretchPct.max.toFixed(1)}% exceeds the ${maxAllowed}% installed-stretch limit — pick a larger d1.` });
    } else if (stretchPct.nom < 0) {
      checks.push({ id: 'stretch', label: 'Centreline stretch', severity: 'warn', detail: `The O-Ring centreline is longer than the groove path (${stretchPct.nom.toFixed(1)}%) — the ring will bunch/wave in the groove. Pick a smaller d1 for slight (1–3%) stretch.` });
    } else if (stretchPct.nom > 5) {
      checks.push({ id: 'stretch', label: 'Centreline stretch', severity: 'warn', detail: `Nominal centreline stretch ${stretchPct.nom.toFixed(1)}% is above the ~1–3% typically targeted for non-circular grooves.` });
    } else {
      checks.push({ id: 'stretch', label: 'Centreline stretch', severity: 'pass', detail: `Centreline stretch ${stretchPct.nom.toFixed(1)}% nominal — the ring hugs the groove path (target ~1–3%).` });
    }
  }

  // Squeeze band
  if (squeezePct.min <= 0) {
    checks.push({ id: 'squeeze', label: 'Initial squeeze', severity: 'fail', detail: `At worst-case tolerances the squeeze drops to ${squeezePct.min.toFixed(1)}% — the seal can lose contact entirely. Reduce the gland height or use a larger cross-section.` });
  } else if (squeezePct.nom < squeezeRec.min || squeezePct.nom > squeezeRec.max) {
    checks.push({ id: 'squeeze', label: 'Initial squeeze', severity: squeezePct.nom > squeezeRec.max * 1.2 || squeezePct.nom < squeezeRec.min * 0.6 ? 'fail' : 'warn', detail: `Nominal squeeze ${squeezePct.nom.toFixed(1)}% is outside the guide band of ${squeezeRec.min.toFixed(0)}–${squeezeRec.max.toFixed(0)}% for this cross-section and application.` });
  } else {
    checks.push({ id: 'squeeze', label: 'Initial squeeze', severity: 'pass', detail: `Squeeze ${squeezePct.nom.toFixed(1)}% nominal (${squeezePct.min.toFixed(1)}–${squeezePct.max.toFixed(1)}% across tolerances) — within the guide band of ${squeezeRec.min.toFixed(0)}–${squeezeRec.max.toFixed(0)}%.` });
  }
  if (squeezeAbsMm.min < 0.1 && squeezeAbsMm.min > 0) {
    checks.push({ id: 'squeezeAbs', label: 'Minimum absolute squeeze', severity: 'warn', detail: `Worst-case squeeze is only ${(squeezeAbsMm.min * 1000).toFixed(0)} µm — very small absolute compressions struggle to bridge surface finish and compression set. Aim for ≥0.1 mm.` });
  }

  // Gland fill
  if (fillWorst > MAX_GLAND_FILL_PERCENT) {
    checks.push({ id: 'fill', label: 'Gland fill', severity: 'fail', detail: `Worst-case fill ${fillWorst.toFixed(0)}% exceeds the ${MAX_GLAND_FILL_PERCENT}% ceiling — no room for thermal expansion or media swell; the groove needs to be wider.` });
  } else if (fillNom > RECOMMENDED_GLAND_FILL_PERCENT) {
    checks.push({ id: 'fill', label: 'Gland fill', severity: 'warn', detail: `Nominal fill ${fillNom.toFixed(0)}% is above the ~${RECOMMENDED_GLAND_FILL_PERCENT}% design target (worst case ${fillWorst.toFixed(0)}%) — fine for low-swell media, tight for anything that swells.` });
  } else {
    checks.push({ id: 'fill', label: 'Gland fill', severity: 'pass', detail: `Fill ${fillNom.toFixed(0)}% nominal, ${fillWorst.toFixed(0)}% worst-case — within the ${RECOMMENDED_GLAND_FILL_PERCENT}%/${MAX_GLAND_FILL_PERCENT}% limits.` });
  }

  // Groove width sanity
  if (grooveWidth.min < csMax) {
    checks.push({ id: 'width', label: 'Groove width', severity: 'fail', detail: `Groove width (${grooveWidth.min.toFixed(2)} mm min) is narrower than the O-Ring cross-section (${csMax.toFixed(2)} mm max) — the ring cannot seat.` });
  } else if (widthRatio < 1.25) {
    checks.push({ id: 'width', label: 'Groove width', severity: 'warn', detail: `Groove width is ${widthRatio.toFixed(2)}× the squeezed cross-section — the guide's tables use ~1.3–1.4× to leave room for deformation and swell.` });
  }

  // Extrusion gap (radial seals with a counter diameter and pressure)
  let extrusionGap: ORingSealResult['extrusionGap'] = null;
  if ((sealType === 'innerRadial' || sealType === 'outerRadial') && input.counterDiameter) {
    const counter = input.counterDiameter;
    const seal = input.sealDiameter!;
    // Radial clearance between the two sliding/static parts adjacent to the groove.
    const gapMax = sealType === 'innerRadial'
      ? (dimMax(counter) - dimMin(seal)) / 2 // housing bore vs rod
      : (dimMax(seal) - dimMin(counter)) / 2; // bore vs piston land
    const allowable = input.pressureMPa > 0 ? maxPermissibleRadialClearanceMm(cs, input.pressureMPa, input.shoreA) : null;
    const backupRecommended = input.pressureMPa > (d1 > 50 ? 5 : 10);
    extrusionGap = { actualMaxMm: gapMax, allowableMm: allowable, backupRingsRecommended: backupRecommended };
    if (input.pressureMPa > 0) {
      if (allowable === null) {
        checks.push({ id: 'extrusion', label: 'Extrusion gap', severity: 'warn', detail: `${input.pressureMPa} MPa is beyond the guide's Table XII clearance table for ${input.shoreA} Shore A — use back-up rings and/or a harder compound.` });
      } else if (gapMax > allowable) {
        checks.push({ id: 'extrusion', label: 'Extrusion gap', severity: 'fail', detail: `Worst-case radial clearance ${gapMax.toFixed(3)} mm exceeds the permissible ${allowable.toFixed(2)} mm at ${input.pressureMPa} MPa / ${input.shoreA} Shore A — extrusion risk. Tighten the clearance fit, use a harder compound, or add back-up rings.` });
      } else {
        checks.push({ id: 'extrusion', label: 'Extrusion gap', severity: 'pass', detail: `Worst-case radial clearance ${gapMax.toFixed(3)} mm is within the permissible ${allowable.toFixed(2)} mm at ${input.pressureMPa} MPa / ${input.shoreA} Shore A.` });
      }
      if (backupRecommended) {
        checks.push({ id: 'backup', label: 'Back-up rings', severity: 'warn', detail: `Above ${d1 > 50 ? 5 : 10} MPa for this ring size the guide recommends back-up rings regardless of clearance.` });
      }
    }
  }

  // Non-circular corner radius
  if (sealType === 'nonCircularFace' && input.cornerRadiusMm != null && input.cornerRadiusMm > 0) {
    const r = input.cornerRadiusMm;
    if (r < CORNER_RADIUS_MINIMUM_RATIO * cs) {
      checks.push({ id: 'corner', label: 'Corner radius', severity: 'fail', detail: `Corner radius ${r.toFixed(1)} mm is below ${CORNER_RADIUS_MINIMUM_RATIO}×d2 (${(CORNER_RADIUS_MINIMUM_RATIO * cs).toFixed(1)} mm) — the ring will be over-strained and lift at the corners.` });
    } else if (r < CORNER_RADIUS_RECOMMENDED_RATIO * cs) {
      checks.push({ id: 'corner', label: 'Corner radius', severity: 'warn', detail: `Corner radius ${r.toFixed(1)} mm is below the recommended ${CORNER_RADIUS_RECOMMENDED_RATIO}×d2 (${(CORNER_RADIUS_RECOMMENDED_RATIO * cs).toFixed(1)} mm) — acceptable but harder on the ring at the corners.` });
    } else {
      checks.push({ id: 'corner', label: 'Corner radius', severity: 'pass', detail: `Corner radius ${r.toFixed(1)} mm meets the recommended ≥${CORNER_RADIUS_RECOMMENDED_RATIO}×d2 (${(CORNER_RADIUS_RECOMMENDED_RATIO * cs).toFixed(1)} mm).` });
    }
  }

  const overallPass = !checks.some((c) => c.severity === 'fail');

  return {
    stretchPct,
    stretchKind,
    effectiveCsMm,
    glandHeightMm: glandHeight,
    grooveWidthMm: grooveWidth,
    squeezePct,
    squeezeAbsMm,
    fillPct: { nom: fillNom, min: fillMin, max: fillWorst },
    widthRatio,
    squeezeRec,
    squeezeApplication,
    extrusionGap,
    equivalentDiameterMm,
    idealD1Mm: idealD1,
    checks,
    overallPass,
  };
}

/** Centreline path length of a rounded-rectangle groove (W×H outer envelope of
 *  the centreline, corner radius r measured on the centreline). */
export function roundedRectPerimeterMm(widthMm: number, heightMm: number, cornerRadiusMm: number): number {
  const r = Math.min(cornerRadiusMm, widthMm / 2, heightMm / 2);
  return 2 * (widthMm - 2 * r) + 2 * (heightMm - 2 * r) + 2 * Math.PI * r;
}
