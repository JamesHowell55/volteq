// Data sourced from IEC 60664-1 (Insulation coordination for equipment within
// low-voltage supply systems) and IEC 60335-1:2001+A1:2004 Tables 16-18, which
// reproduce the IEC 60664-1 creepage/clearance methodology (material group CTI
// bands per IEC 60664-1 subclause 2.7.1.3). See the in-app reference notes.

export type PollutionDegree = 1 | 2 | 3 | 4;
export type MaterialGroup = 'I' | 'II' | 'IIIa' | 'IIIb';

export const MATERIAL_GROUP_CTI: Record<MaterialGroup, { min: number; max: number | null; label: string }> = {
  I: { min: 600, max: null, label: 'Group I (CTI ≥ 600)' },
  II: { min: 400, max: 600, label: 'Group II (400 ≤ CTI < 600)' },
  IIIa: { min: 175, max: 400, label: 'Group IIIa (175 ≤ CTI < 400)' },
  IIIb: { min: 100, max: 175, label: 'Group IIIb (100 ≤ CTI < 175)' },
};

export function materialGroupFromCti(cti: number): MaterialGroup {
  if (cti >= 600) return 'I';
  if (cti >= 400) return 'II';
  if (cti >= 175) return 'IIIa';
  return 'IIIb';
}

/** IEC 60664-1 clause 4.8.1.3 — verbatim: "materials are classified into four
 *  groups according to their CTI values [per IEC 60112 using solution A]." */
export const MATERIAL_GROUP_DESCRIPTION =
  'IEC 60664-1 classifies insulating materials into four groups by their Comparative Tracking Index (CTI, per IEC 60112 using solution A) — a measure of resistance to surface tracking (the progressive formation of a conductive path from electrical stress + surface contamination): Group I (CTI ≥ 600), Group II (400 ≤ CTI < 600), Group IIIa (175 ≤ CTI < 400), Group IIIb (100 ≤ CTI < 175). Lower CTI (IIIb) needs more creepage distance for the same voltage/pollution degree. Use Group IIIb if the material is unknown.';

/** IEC 60664-1 clause 4.6.2 — verbatim wording for each of the four pollution degrees. */
export const POLLUTION_DEGREE_DESCRIPTIONS: Record<PollutionDegree, string> = {
  1: 'No pollution or only dry, non-conductive pollution occurs. The pollution has no influence.',
  2: 'Only non-conductive pollution occurs except that occasionally a temporary conductivity caused by condensation is to be expected.',
  3: 'Conductive pollution occurs or dry non-conductive pollution occurs which becomes conductive due to condensation which is to be expected.',
  4: 'Continuous conductivity occurs due to conductive dust, rain or other wet conditions.',
};

export type FieldCondition = 'A' | 'B';

/** IEC 60664-1 clause 3.14/3.15 — verbatim definitions (verified against the
 *  full standard text), used for the in-app tooltips. */
export const FIELD_CONDITION_DESCRIPTIONS: Record<FieldCondition, { title: string; body: string }> = {
  A: {
    title: 'Inhomogeneous field (Case A)',
    body: '"Electric field which does not have an essentially constant voltage gradient between electrodes (non-uniform field)" (clause 3.15). Represented by a 30 μm-radius point electrode against a 1 m × 1 m plane — the worst case for voltage withstand. Clearances at or above the Case A values in Table F.2 can be used for any electrode shape/arrangement, without a voltage-withstand test (clause 5.1.3.2) — the safe default.',
  },
  B: {
    title: 'Homogeneous field (Case B)',
    body: '"Electric field which has an essentially constant voltage gradient between electrodes (uniform field), such as that between two spheres where the radius of each sphere is greater than the distance between them" (clause 3.14). Case B permits smaller clearances, but only where the geometry is specifically designed to achieve this uniform field, and the standard requires it to be verified by an actual voltage-withstand test (clause 5.1.3.3) — don\'t select it just because the numbers are smaller.',
  },
};

/** IEC 60664-1 Table F.2 — minimum clearance (mm) vs required impulse
 *  withstand voltage (kV), at the 2000 m reference altitude. Verified against
 *  the full text of IEC 60664-1:2007 (the normative Table F.2, not the
 *  informative Annex A experimental data it's derived from).
 *
 *  Case A (inhomogeneous field) can always be used, for any electrode shape/
 *  arrangement, without a voltage-withstand test — it's the standard's
 *  no-questions-asked default (clause 5.1.3.2).
 *  Case B (homogeneous field) permits smaller clearances, but ONLY applies
 *  where the geometry is specifically designed to give an essentially
 *  constant voltage gradient (e.g. parallel plates) — clause 5.1.3.3 requires
 *  it to be verified by an actual voltage-withstand test, not just assumed. */
export const CLEARANCE_TABLE_CASE_A: { kV: number; mm: number }[] = [
  { kV: 0.33, mm: 0.01 },
  { kV: 0.4, mm: 0.02 },
  { kV: 0.5, mm: 0.04 },
  { kV: 0.6, mm: 0.06 },
  { kV: 0.8, mm: 0.10 },
  { kV: 1.0, mm: 0.15 },
  { kV: 1.2, mm: 0.25 },
  { kV: 1.5, mm: 0.5 },
  { kV: 2.0, mm: 1.0 },
  { kV: 2.5, mm: 1.5 },
  { kV: 3.0, mm: 2.0 },
  { kV: 4.0, mm: 3.0 },
  { kV: 5.0, mm: 4.0 },
  { kV: 6.0, mm: 5.5 },
  { kV: 8.0, mm: 8.0 },
  { kV: 10.0, mm: 11.0 },
  { kV: 12.0, mm: 14.0 },
  { kV: 15.0, mm: 18.0 },
  { kV: 20.0, mm: 25.0 },
  { kV: 25.0, mm: 33.0 },
  { kV: 30.0, mm: 40.0 },
  { kV: 40.0, mm: 60.0 },
  { kV: 50.0, mm: 75.0 },
  { kV: 60.0, mm: 90.0 },
  { kV: 80.0, mm: 130.0 },
  { kV: 100.0, mm: 170.0 },
];

export const CLEARANCE_TABLE_CASE_B: { kV: number; mm: number }[] = [
  { kV: 0.33, mm: 0.01 },
  { kV: 0.4, mm: 0.02 },
  { kV: 0.5, mm: 0.04 },
  { kV: 0.6, mm: 0.06 },
  { kV: 0.8, mm: 0.10 },
  { kV: 1.0, mm: 0.15 },
  { kV: 1.2, mm: 0.2 },
  { kV: 1.5, mm: 0.3 },
  { kV: 2.0, mm: 0.45 },
  { kV: 2.5, mm: 0.6 },
  { kV: 3.0, mm: 0.8 },
  { kV: 4.0, mm: 1.2 },
  { kV: 5.0, mm: 1.5 },
  { kV: 6.0, mm: 2.0 },
  { kV: 8.0, mm: 3.0 },
  { kV: 10.0, mm: 3.5 },
  { kV: 12.0, mm: 4.5 },
  { kV: 15.0, mm: 5.5 },
  { kV: 20.0, mm: 8.0 },
  { kV: 25.0, mm: 10.0 },
  { kV: 30.0, mm: 12.5 },
  { kV: 40.0, mm: 17.0 },
  { kV: 50.0, mm: 22.0 },
  { kV: 60.0, mm: 27.0 },
  { kV: 80.0, mm: 35.0 },
  { kV: 100.0, mm: 45.0 },
];

/** IEC 60664-1 Table F.10 (Edition 3) / Table A.2 (Edition 2) — altitude
 *  correction (multiplication) factors for clearance. Cross-checked against
 *  standard-atmosphere barometric pressure at each altitude. Below 2000 m no
 *  correction applies (that is the standard's native reference condition). */
export const ALTITUDE_CORRECTION_TABLE: { m: number; factor: number }[] = [
  { m: 2000, factor: 1.00 },
  { m: 3000, factor: 1.14 },
  { m: 4000, factor: 1.29 },
  { m: 5000, factor: 1.48 },
  { m: 6000, factor: 1.70 },
  { m: 7000, factor: 1.95 },
  { m: 8000, factor: 2.25 },
  { m: 9000, factor: 2.62 },
  { m: 10000, factor: 3.02 },
  { m: 15000, factor: 6.67 },
  { m: 20000, factor: 14.5 },
];

interface CreepageRow {
  maxV: number;
  pd1: number;
  pd2: { I: number; II: number; IIIab: number };
  pd3: { I: number; II: number; IIIab: number };
}

/** IEC 60335-1 Table 17 — creepage for basic/supplementary insulation. This
 *  table explicitly cross-references IEC 60664-1's CTI/pollution-degree
 *  methodology (subclause 2.7.1.3) and is used here as the general-purpose
 *  table for all insulation types except where the appliance-specific
 *  functional-insulation allowance below is deliberately opted into. */
export const CREEPAGE_TABLE_BASIC: CreepageRow[] = [
  { maxV: 50, pd1: 0.2, pd2: { I: 0.6, II: 0.9, IIIab: 1.2 }, pd3: { I: 1.5, II: 1.7, IIIab: 1.9 } },
  { maxV: 125, pd1: 0.3, pd2: { I: 0.8, II: 1.1, IIIab: 1.5 }, pd3: { I: 1.9, II: 2.1, IIIab: 2.4 } },
  { maxV: 250, pd1: 0.6, pd2: { I: 1.3, II: 1.8, IIIab: 2.5 }, pd3: { I: 3.2, II: 3.6, IIIab: 4.0 } },
  { maxV: 400, pd1: 1.0, pd2: { I: 2.0, II: 2.8, IIIab: 4.0 }, pd3: { I: 5.0, II: 5.6, IIIab: 6.3 } },
  { maxV: 500, pd1: 1.3, pd2: { I: 2.5, II: 3.6, IIIab: 5.0 }, pd3: { I: 6.3, II: 7.1, IIIab: 8.0 } },
  { maxV: 800, pd1: 1.8, pd2: { I: 3.2, II: 4.5, IIIab: 6.3 }, pd3: { I: 8.0, II: 9.0, IIIab: 10.0 } },
  { maxV: 1000, pd1: 2.4, pd2: { I: 4.0, II: 5.6, IIIab: 8.0 }, pd3: { I: 10.0, II: 11.0, IIIab: 12.5 } },
  { maxV: 1250, pd1: 3.2, pd2: { I: 5.0, II: 7.1, IIIab: 10.0 }, pd3: { I: 12.5, II: 14.0, IIIab: 16.0 } },
  { maxV: 1600, pd1: 4.2, pd2: { I: 6.3, II: 9.0, IIIab: 12.5 }, pd3: { I: 16.0, II: 18.0, IIIab: 20.0 } },
  { maxV: 2000, pd1: 5.6, pd2: { I: 8.0, II: 11.0, IIIab: 16.0 }, pd3: { I: 20.0, II: 22.0, IIIab: 25.0 } },
  { maxV: 2500, pd1: 7.5, pd2: { I: 10.0, II: 14.0, IIIab: 20.0 }, pd3: { I: 25.0, II: 28.0, IIIab: 32.0 } },
  { maxV: 3200, pd1: 10.0, pd2: { I: 12.5, II: 18.0, IIIab: 25.0 }, pd3: { I: 32.0, II: 36.0, IIIab: 40.0 } },
  { maxV: 4000, pd1: 12.5, pd2: { I: 16.0, II: 22.0, IIIab: 32.0 }, pd3: { I: 40.0, II: 45.0, IIIab: 50.0 } },
  { maxV: 5000, pd1: 16.0, pd2: { I: 20.0, II: 28.0, IIIab: 40.0 }, pd3: { I: 50.0, II: 56.0, IIIab: 63.0 } },
  { maxV: 6300, pd1: 20.0, pd2: { I: 25.0, II: 36.0, IIIab: 50.0 }, pd3: { I: 63.0, II: 71.0, IIIab: 80.0 } },
  { maxV: 8000, pd1: 25.0, pd2: { I: 32.0, II: 45.0, IIIab: 63.0 }, pd3: { I: 80.0, II: 90.0, IIIab: 100.0 } },
  { maxV: 10000, pd1: 32.0, pd2: { I: 40.0, II: 56.0, IIIab: 80.0 }, pd3: { I: 100.0, II: 110.0, IIIab: 125.0 } },
  { maxV: 12500, pd1: 40.0, pd2: { I: 50.0, II: 71.0, IIIab: 100.0 }, pd3: { I: 125.0, II: 140.0, IIIab: 160.0 } },
];

/** IEC 60335-1 Table 18 — a household-appliance-specific relaxation permitting
 *  smaller creepage for functional insulation at lower voltages (converging
 *  with Table 17 from 800 V up). This is NOT confirmed to be IEC 60664-1's own
 *  general position — IEC 60664-1's own Annex F lists a single Table F.5, and
 *  its clause 5.3.4 (functional) vs 5.3.5 (basic/supplementary/reinforced)
 *  split could not be confirmed from open sources to use different numeric
 *  values rather than just a different voltage basis. Only apply this outside
 *  an appliance context if your specific product standard permits it. */
export const CREEPAGE_TABLE_APPLIANCE_FUNCTIONAL_ALLOWANCE: CreepageRow[] = [
  { maxV: 50, pd1: 0.2, pd2: { I: 0.6, II: 0.8, IIIab: 1.1 }, pd3: { I: 1.4, II: 1.6, IIIab: 1.8 } },
  { maxV: 125, pd1: 0.3, pd2: { I: 0.7, II: 1.0, IIIab: 1.4 }, pd3: { I: 1.8, II: 2.0, IIIab: 2.2 } },
  { maxV: 250, pd1: 0.4, pd2: { I: 1.0, II: 1.4, IIIab: 2.0 }, pd3: { I: 2.5, II: 2.8, IIIab: 3.2 } },
  { maxV: 400, pd1: 0.8, pd2: { I: 1.6, II: 2.2, IIIab: 3.2 }, pd3: { I: 4.0, II: 4.5, IIIab: 5.0 } },
  { maxV: 500, pd1: 1.0, pd2: { I: 2.0, II: 2.8, IIIab: 4.0 }, pd3: { I: 5.0, II: 5.6, IIIab: 6.3 } },
  { maxV: 800, pd1: 1.8, pd2: { I: 3.2, II: 4.5, IIIab: 6.3 }, pd3: { I: 8.0, II: 9.0, IIIab: 10.0 } },
  { maxV: 1000, pd1: 2.4, pd2: { I: 4.0, II: 5.6, IIIab: 8.0 }, pd3: { I: 10.0, II: 11.0, IIIab: 12.5 } },
  { maxV: 1250, pd1: 3.2, pd2: { I: 5.0, II: 7.1, IIIab: 10.0 }, pd3: { I: 12.5, II: 14.0, IIIab: 16.0 } },
  { maxV: 1600, pd1: 4.2, pd2: { I: 6.3, II: 9.0, IIIab: 12.5 }, pd3: { I: 16.0, II: 18.0, IIIab: 20.0 } },
  { maxV: 2000, pd1: 5.6, pd2: { I: 8.0, II: 11.0, IIIab: 16.0 }, pd3: { I: 20.0, II: 22.0, IIIab: 25.0 } },
  { maxV: 2500, pd1: 7.5, pd2: { I: 10.0, II: 14.0, IIIab: 20.0 }, pd3: { I: 25.0, II: 28.0, IIIab: 32.0 } },
  { maxV: 3200, pd1: 10.0, pd2: { I: 12.5, II: 18.0, IIIab: 25.0 }, pd3: { I: 32.0, II: 36.0, IIIab: 40.0 } },
  { maxV: 4000, pd1: 12.5, pd2: { I: 16.0, II: 22.0, IIIab: 32.0 }, pd3: { I: 40.0, II: 45.0, IIIab: 50.0 } },
  { maxV: 5000, pd1: 16.0, pd2: { I: 20.0, II: 28.0, IIIab: 40.0 }, pd3: { I: 50.0, II: 56.0, IIIab: 63.0 } },
  { maxV: 6300, pd1: 20.0, pd2: { I: 25.0, II: 36.0, IIIab: 50.0 }, pd3: { I: 63.0, II: 71.0, IIIab: 80.0 } },
  { maxV: 8000, pd1: 25.0, pd2: { I: 32.0, II: 45.0, IIIab: 63.0 }, pd3: { I: 80.0, II: 90.0, IIIab: 100.0 } },
  { maxV: 10000, pd1: 32.0, pd2: { I: 40.0, II: 56.0, IIIab: 80.0 }, pd3: { I: 100.0, II: 110.0, IIIab: 125.0 } },
  { maxV: 12500, pd1: 40.0, pd2: { I: 50.0, II: 71.0, IIIab: 100.0 }, pd3: { I: 125.0, II: 140.0, IIIab: 160.0 } },
];

/** Power-law (log-log / "ratio-preserving") interpolation and extrapolation.
 *  Finds the bracketing table pair, derives the local scaling exponent
 *  implied by their ratio (b = ln(y1/y0)/ln(x1/x0)), and applies
 *  y = y0*(x/x0)^b. For x outside the table, the same exponent from the
 *  nearest edge pair is extended outward. This preserves the ratio-based
 *  scaling between table entries rather than distorting it the way linear
 *  interpolation would — appropriate since these withstand-voltage tables
 *  approximate a power-law relationship, not a straight line. */
function powerLawInterpolate(points: { x: number; y: number }[], x: number): { y: number; extrapolated: boolean } {
  let i0: number;
  let i1: number;
  let extrapolated: boolean;
  if (x <= points[0].x) {
    i0 = 0; i1 = 1;
    extrapolated = x < points[0].x;
  } else if (x >= points[points.length - 1].x) {
    i0 = points.length - 2; i1 = points.length - 1;
    extrapolated = x > points[points.length - 1].x;
  } else {
    i0 = 0; i1 = 1; extrapolated = false;
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) { i0 = i; i1 = i + 1; break; }
    }
  }
  const { x: x0, y: y0 } = points[i0];
  const { x: x1, y: y1 } = points[i1];
  const b = Math.log(y1 / y0) / Math.log(x1 / x0);
  const y = y0 * Math.pow(x / x0, b);
  return { y, extrapolated };
}

/** Piecewise-linear interpolation (used for the altitude correction table,
 *  whose x-axis is altitude rather than voltage). */
function linearInterpolate(points: { x: number; y: number }[], x: number): { y: number; extrapolated: boolean } {
  if (x <= points[0].x) return { y: points[0].y, extrapolated: x < points[0].x };
  const last = points[points.length - 1];
  if (x >= last.x) {
    const prev = points[points.length - 2];
    const slope = (last.y - prev.y) / (last.x - prev.x);
    return { y: last.y + slope * (x - last.x), extrapolated: x > last.x };
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return { y: a.y + t * (b.y - a.y), extrapolated: false };
    }
  }
  return { y: last.y, extrapolated: true };
}

export function getAltitudeCorrectionFactor(altitudeM: number): { factor: number; extrapolated: boolean } {
  if (altitudeM <= 2000) return { factor: 1.0, extrapolated: false };
  const { y, extrapolated } = linearInterpolate(ALTITUDE_CORRECTION_TABLE.map(r => ({ x: r.m, y: r.factor })), altitudeM);
  return { factor: y, extrapolated };
}

/** IEC 60664-1 Table F.2's own footnote 6 gives pollution degree 4 as "the
 *  same as pollution degree 3, except that the minimum clearance is 1,6 mm";
 *  footnote 4 similarly floors pollution degrees 2/3 at 0,2 mm / 0,8 mm
 *  ("based on the reduced withstand characteristics of the associated
 *  creepage distance under humidity conditions") wherever the voltage-based
 *  curve would otherwise give a smaller value — small clearances can be
 *  bridged completely by particles/condensation regardless of the transient
 *  voltage the gap otherwise has to withstand (clause 4.6.1). Applied
 *  identically to both field cases here since the standard's own text ties
 *  the floor to particle-bridging risk, not field homogeneity, though the
 *  exact case-by-case breakpoints were not fully resolvable from the
 *  available table layout — flagged as a disclosed simplification. */
export const CLEARANCE_POLLUTION_FLOOR_MM: Record<PollutionDegree, number> = { 1: 0, 2: 0.2, 3: 0.8, 4: 1.6 };

export function getClearance(requiredVoltageKV: number, fieldCondition: FieldCondition = 'A', pollutionDegree: PollutionDegree = 1): { mm: number; extrapolated: boolean; floorApplied: boolean } {
  const table = fieldCondition === 'B' ? CLEARANCE_TABLE_CASE_B : CLEARANCE_TABLE_CASE_A;
  const { y, extrapolated } = powerLawInterpolate(table.map(r => ({ x: r.kV, y: r.mm })), requiredVoltageKV);
  const floor = CLEARANCE_POLLUTION_FLOOR_MM[pollutionDegree];
  const mm = Math.max(y, floor);
  return { mm, extrapolated, floorApplied: floor > y };
}

function creepageColumn(table: CreepageRow[], pollutionDegree: 1 | 2 | 3, materialGroup: MaterialGroup): { x: number; y: number }[] {
  const bucket = materialGroup === 'I' ? 'I' : materialGroup === 'II' ? 'II' : 'IIIab';
  return table.map(r => ({ x: r.maxV, y: pollutionDegree === 1 ? r.pd1 : (pollutionDegree === 2 ? r.pd2[bucket] : r.pd3[bucket]) }));
}

/** Creepage per IEC 60335-1 Table 17 (default) — power-law interpolated
 *  between the standard's tabulated voltage-band points rather than taking
 *  the next-higher band's value, so a working voltage between two tabulated
 *  points (e.g. 900 V, between the 800 V and 1000 V rows) gets its own
 *  interpolated value instead of the more conservative 1000 V-band figure.
 *  This tool assumes functional insulation throughout (no basic/
 *  supplementary/reinforced distinction) — see the in-app reference notes
 *  for why IEC 60664-1's own functional-vs-other split isn't applied here. */
export function getCreepage(workingVoltageV: number, pollutionDegree: 1 | 2 | 3, materialGroup: MaterialGroup, useApplianceFunctionalAllowance = false): { mm: number; extrapolated: boolean } {
  const table = useApplianceFunctionalAllowance ? CREEPAGE_TABLE_APPLIANCE_FUNCTIONAL_ALLOWANCE : CREEPAGE_TABLE_BASIC;
  const { y, extrapolated } = powerLawInterpolate(creepageColumn(table, pollutionDegree, materialGroup), workingVoltageV);
  return { mm: y, extrapolated };
}
