// Bearing sizing engine: ISO 281 equivalent dynamic/static load and rating life,
// a real SKF-catalogue lookup (see bearingCatalogue.ts), lubrication-method
// suitability (speed factor n.dm and temperature limits), and the plain-bush PV
// method for sleeve bearings.
import {
  BEARING_TYPES, RELIABILITY_A1, DUTY_FACTORS, STATIC_SAFETY_TARGET,
  type BearingTypeMeta, type BearingTypeId, type LubricationMethod, type BushMaterial,
} from './bearingData';
import { SKF_CATALOGUE, type CatalogueBearing } from './bearingCatalogue';

function interpTable(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

// ---- Angular-contact ball bearing: X/Y/e factor set depends on contact angle ----
export type ContactAngleOption = 25 | 40;

export function resolveBearingType(typeId: BearingTypeId, contactAngleDeg: ContactAngleOption = 40): BearingTypeMeta {
  const base = BEARING_TYPES[typeId];
  if (typeId !== 'angular-contact-ball') return base;
  // 40° (7xxx B): e=1.14, X=0.35, Y=0.57, Y0=0.26. 25° (7xxx ...CD): e=0.68,
  // X=0.41, Y=0.87, Y0=0.38 (ISO/SKF single-row angular-contact factors).
  if (contactAngleDeg === 25) {
    return {
      ...base,
      dynamicFactors: { kind: 'combined-fixed', e: 0.68, x2: 0.41, y2: 0.87 },
      staticFactors: { x0: 0.5, y0: 0.38 },
      contactAngleDeg: 25,
    };
  }
  return base;
}

export type CatalogueEntry = {
  designation: string;
  boreMm: number;
  odMm: number;
  widthMm: number;
  dynamicN: number;
  staticN: number;
  limitingSpeedRpm: number | null;
};

function toEntry(b: CatalogueBearing): CatalogueEntry {
  return {
    designation: b.des,
    boreMm: b.d,
    odMm: b.D,
    widthMm: b.B,
    dynamicN: b.C * 1000,
    staticN: b.C0 * 1000,
    limitingSpeedRpm: b.nlim ?? null,
  };
}

// ---- Equivalent dynamic load P = X.Fr + Y.Fa ----
export interface EquivalentLoadResult {
  P_N: number;
  X: number;
  Y: number;
  e: number;
  warning?: string;
}

export function equivalentDynamicLoad(type: BearingTypeMeta, staticN: number, radialLoadN: number, axialLoadN: number): EquivalentLoadResult {
  const model = type.dynamicFactors;
  if (model.kind === 'radial-only') {
    return {
      P_N: radialLoadN, X: 1, Y: 0, e: 0,
      warning: axialLoadN > 0 ? `${type.label} bearings cannot react axial load — the ${axialLoadN.toFixed(0)} N axial load is not carried here and needs a separate locating bearing.` : undefined,
    };
  }
  if (model.kind === 'axial-only') {
    return {
      P_N: axialLoadN, X: 0, Y: 1, e: 0,
      warning: radialLoadN > 0 ? `${type.label} bearings cannot react radial load — the ${radialLoadN.toFixed(0)} N radial load needs a separate radial bearing.` : undefined,
    };
  }
  const ratio = radialLoadN > 0 ? axialLoadN / radialLoadN : (axialLoadN > 0 ? Infinity : 0);
  if (model.kind === 'double-row') {
    // Both rows react axial load even below e.
    if (ratio <= model.e) return { P_N: radialLoadN + model.y1 * axialLoadN, X: 1, Y: model.y1, e: model.e };
    return { P_N: model.x2 * radialLoadN + model.y2 * axialLoadN, X: model.x2, Y: model.y2, e: model.e };
  }
  let e: number, x2: number, y2: number;
  if (model.kind === 'combined-fixed') {
    ({ e, x2, y2 } = model);
  } else {
    const f0FaOverC0 = staticN > 0 ? (model.f0 * axialLoadN / staticN) : 0;
    e = interpTable(f0FaOverC0, model.faOverC0, model.eTable);
    y2 = interpTable(f0FaOverC0, model.faOverC0, model.y2Table);
    x2 = model.x2;
  }
  if (ratio <= e) return { P_N: radialLoadN, X: 1, Y: 0, e };
  return { P_N: x2 * radialLoadN + y2 * axialLoadN, X: x2, Y: y2, e };
}

export function equivalentStaticLoad(type: BearingTypeMeta, radialLoadN: number, axialLoadN: number): number {
  if (type.dynamicFactors.kind === 'radial-only') return radialLoadN;
  if (type.dynamicFactors.kind === 'axial-only') return axialLoadN;
  const { x0, y0 } = type.staticFactors;
  return Math.max(x0 * radialLoadN + y0 * axialLoadN, radialLoadN);
}

// ---- ISO 281 rating life ----
export function lifeExponent(type: BearingTypeMeta): number {
  return type.rollingElement === 'ball' ? 3 : 10 / 3;
}

export function l10MillionRev(dynamicN: number, loadN: number, p: number): number {
  if (loadN <= 0) return Infinity;
  return Math.pow(dynamicN / loadN, p);
}

export function l10Hours(l10Mrev: number, speedRpm: number): number {
  if (speedRpm <= 0) return Infinity;
  return (1e6 / (60 * speedRpm)) * l10Mrev;
}

export function a1For(reliabilityPct: number): number {
  const row = RELIABILITY_A1.find((r) => r.reliabilityPct === reliabilityPct);
  return row ? row.a1 : 1.0;
}

export function dutyFactorFor(id: 'steady' | 'light-shock' | 'heavy-shock'): number {
  return DUTY_FACTORS.find((d) => d.id === id)?.factor ?? 1.0;
}

export function staticSafetyTarget(id: 'low' | 'normal' | 'heavy', isRoller: boolean): number {
  const row = STATIC_SAFETY_TARGET.find((r) => r.id === id)!;
  return isRoller ? row.ballTarget * row.rollerMultiplier : row.ballTarget;
}

// ---- Lubrication ----
export function speedFactorNdm(odMm: number, boreMm: number, speedRpm: number): number {
  return ((odMm + boreMm) / 2) * speedRpm;
}

const GREASE_MAX_TEMP_C = 120;
const SEAL_MAX_TEMP_C = 110;

// Representative grease-lubrication n.dm ceiling by bearing family (SKF: deep
// groove ball grease-lubricated limited to n.dm 250,000-500,000 mm/min; slower
// families lower). Oil raises the ceiling by ~1.3-1.4x.
function greaseNdmLimit(type: BearingTypeMeta): number {
  switch (type.rollingElement) {
    case 'ball': return type.contactAngleDeg === 90 ? 120000 : 500000;
    case 'cylindrical-roller': return 400000;
    case 'needle': return 300000;
    case 'tapered-roller': return 350000;
    case 'spherical-roller': return 350000;
    default: return 400000;
  }
}

export interface LubricationCheck {
  ndm: number;
  ndmLimit: number;
  catalogueLimitRpm: number | null;
  ok: boolean;
  notes: string[];
}

export function lubricationSuitability(method: LubricationMethod, type: BearingTypeMeta, entry: CatalogueEntry, speedRpm: number, housingTempC: number): LubricationCheck {
  const notes: string[] = [];
  let ok = true;
  const ndm = speedFactorNdm(entry.odMm, entry.boreMm, speedRpm);
  const ndmLimit = greaseNdmLimit(type) * (method === 'oil' ? 1.35 : 1);
  if (ndm > ndmLimit) {
    ok = false;
    notes.push(`Speed factor n·dm (${ndm.toFixed(0)} mm·rpm) exceeds a typical ${method === 'oil' ? 'oil' : 'grease'} limit for ${type.label.toLowerCase()} bearings (~${ndmLimit.toFixed(0)}) — ${method === 'oil' ? 'consider circulating/jet oil with cooling, or a lower-friction bearing type.' : 'switch to oil lubrication, or a lower-friction bearing type.'}`);
  }
  if (entry.limitingSpeedRpm != null && speedRpm > entry.limitingSpeedRpm) {
    ok = false;
    notes.push(`Speed (${speedRpm.toFixed(0)} rpm) exceeds the catalogue limiting speed for ${entry.designation} (${entry.limitingSpeedRpm.toFixed(0)} rpm) — a mechanical limit that should not be exceeded.`);
  }
  if (method !== 'oil' && housingTempC > GREASE_MAX_TEMP_C) {
    ok = false;
    notes.push(`Housing temperature (${housingTempC.toFixed(0)}°C) exceeds a typical standard-grease service limit (~${GREASE_MAX_TEMP_C}°C) — specify a high-temperature grease, or switch to oil lubrication.`);
  }
  if (method === 'sealed' && housingTempC > SEAL_MAX_TEMP_C) {
    notes.push(`Housing temperature (${housingTempC.toFixed(0)}°C) is above a typical standard (NBR) seal's service limit (~${SEAL_MAX_TEMP_C}°C) — specify FKM/Viton seals for a sealed-for-life bearing at this temperature.`);
  }
  return { ndm, ndmLimit, catalogueLimitRpm: entry.limitingSpeedRpm, ok, notes };
}

// Grease relubrication interval, calibrated to the published SKF trend (deep
// groove ball: ~10,000 h at n.dm=200,000, ~4,000 h at n.dm=400,000) with a
// rule-of-thumb temperature correction (halves per 15°C above 70°C). Indicative.
export function greaseRelubeIntervalHours(ndm: number, housingTempC: number): number {
  if (ndm <= 0) return Infinity;
  const base = 10000 * Math.pow(200000 / ndm, 1.3219);
  const tempSteps = Math.max(0, (housingTempC - 70) / 15);
  return base * Math.pow(0.5, tempSteps);
}

export function recommendedIsoVg(ndm: number): string {
  if (ndm < 50000) return 'ISO VG 220-320';
  if (ndm < 200000) return 'ISO VG 100-150';
  if (ndm < 500000) return 'ISO VG 32-68';
  return 'ISO VG 15-32';
}

export function thermalAdvisory(shaftTempC: number, housingTempC: number): string | undefined {
  const diff = shaftTempC - housingTempC;
  if (diff > 20) return `Shaft running ${diff.toFixed(0)}°C hotter than the housing — the inner ring grows faster than the outer, reducing internal running clearance. Consider a larger initial clearance class (e.g. C3/C4) to avoid preload.`;
  if (diff < -20) return `Housing running ${Math.abs(diff).toFixed(0)}°C hotter than the shaft — the outer ring grows faster than the inner, increasing internal running clearance. Verify running clearance and preload retention.`;
  return undefined;
}

// ---- Bearing selection (rolling-element types) ----
export interface BearingSelectionInput {
  shaftDiameterMm: number;
  radialLoadN: number;
  axialLoadN: number;
  speedRpm: number;
  targetL10Hours: number;
  reliabilityPct: number;
  dutyFactorId: 'steady' | 'light-shock' | 'heavy-shock';
  staticDutyId: 'low' | 'normal' | 'heavy';
  lubricationMethod: LubricationMethod;
  housingTempC: number;
}

export interface BearingCandidateResult {
  typeId: BearingTypeId;
  entry: CatalogueEntry;
  equivalentLoad: EquivalentLoadResult;
  effectiveLoadN: number;
  staticLoadN: number;
  requiredDynamicN: number;
  requiredStaticN: number;
  dynamicPass: boolean;
  staticPass: boolean;
  achievedL10Mrev: number;
  achievedL10h: number;
  achievedL10hAdjusted: number;
  staticSafetyFactorAchieved: number;
  lubrication: LubricationCheck;
  overallPass: boolean;
  sizedUp: boolean;
  a1: number;
  dutyFactor: number;
  p: number;
  noCandidate?: boolean;
}

function evaluate(type: BearingTypeMeta, entry: CatalogueEntry, input: BearingSelectionInput, p: number, a1: number, dutyFactor: number, staticTarget: number, smallestBoreForShaft: number): BearingCandidateResult {
  const eq = equivalentDynamicLoad(type, entry.staticN, input.radialLoadN, input.axialLoadN);
  const effectiveLoadN = eq.P_N * dutyFactor;
  const staticLoadN = equivalentStaticLoad(type, input.radialLoadN, input.axialLoadN);
  const targetMrev = input.speedRpm > 0 ? ((input.targetL10Hours / a1) * 60 * input.speedRpm) / 1e6 : 0;
  const requiredDynamicN = effectiveLoadN * Math.pow(Math.max(targetMrev, 1e-9), 1 / p);
  const requiredStaticN = staticTarget * staticLoadN;
  const dynamicPass = entry.dynamicN >= requiredDynamicN;
  const staticPass = entry.staticN >= requiredStaticN;
  const achievedL10Mrev = l10MillionRev(entry.dynamicN, effectiveLoadN, p);
  const achievedL10h = l10Hours(achievedL10Mrev, input.speedRpm);
  const lubrication = lubricationSuitability(input.lubricationMethod, type, entry, input.speedRpm, input.housingTempC);
  return {
    typeId: type.id, entry, equivalentLoad: eq, effectiveLoadN, staticLoadN,
    requiredDynamicN, requiredStaticN, dynamicPass, staticPass,
    achievedL10Mrev, achievedL10h, achievedL10hAdjusted: achievedL10h * a1,
    staticSafetyFactorAchieved: staticLoadN > 0 ? entry.staticN / staticLoadN : Infinity,
    lubrication, overallPass: dynamicPass && staticPass, sizedUp: entry.boreMm > smallestBoreForShaft,
    a1, dutyFactor, p,
  };
}

export function selectBearing(type: BearingTypeMeta, input: BearingSelectionInput): BearingCandidateResult {
  const p = lifeExponent(type);
  const isRoller = type.rollingElement !== 'ball';
  const a1 = a1For(input.reliabilityPct);
  const dutyFactor = dutyFactorFor(input.dutyFactorId);
  const staticTarget = staticSafetyTarget(input.staticDutyId, isRoller);

  // Real catalogue: candidates whose bore fits the shaft. Order by bore first,
  // then capacity — so the search tries every series at the smallest fitting bore
  // before stepping up to a larger bore (a real engineer sizes up in bore only
  // when no series at the current bore is strong enough, rather than putting an
  // oversized-bore bearing on a small shaft just because its C is marginally lower).
  const catalogue = (SKF_CATALOGUE[type.id] ?? []).map(toEntry);
  const fitting = catalogue.filter((b) => b.boreMm >= input.shaftDiameterMm - 0.01).sort((a, b) => a.boreMm - b.boreMm || a.dynamicN - b.dynamicN);

  if (fitting.length === 0) {
    // No catalogue bearing large enough — return the biggest available, flagged.
    const biggest = catalogue.slice().sort((a, b) => b.boreMm - a.boreMm)[0];
    if (!biggest) return { noCandidate: true } as unknown as BearingCandidateResult;
    const r = evaluate(type, biggest, input, p, a1, dutyFactor, staticTarget, biggest.boreMm);
    return { ...r, overallPass: false, noCandidate: true };
  }

  const smallestBoreForShaft = Math.min(...fitting.map((b) => b.boreMm));
  for (const entry of fitting) {
    const r = evaluate(type, entry, input, p, a1, dutyFactor, staticTarget, smallestBoreForShaft);
    if (r.overallPass) return r;
  }
  // Nothing met the target — return the highest-capacity fitting bearing (best effort).
  const largest = fitting.slice().sort((a, b) => b.dynamicN - a.dynamicN)[0];
  return evaluate(type, largest, input, p, a1, dutyFactor, staticTarget, smallestBoreForShaft);
}

export function compareAllTypes(input: BearingSelectionInput, contactAngleDeg: ContactAngleOption): BearingCandidateResult[] {
  const ids: BearingTypeId[] = ['deep-groove-ball', 'angular-contact-ball', 'cylindrical-roller', 'tapered-roller', 'spherical-roller', 'needle-roller', 'thrust-ball'];
  return ids.map((id) => selectBearing(resolveBearingType(id, contactAngleDeg), input)).filter((r) => !r.noCandidate);
}

// ---- Plain bush (PV method) ----
export interface BushSelectionResult {
  boreMm: number;
  odMm: number;
  lengthMm: number;
  pressureMPa: number;
  velocityMs: number;
  pv: number;
  pOk: boolean;
  vOk: boolean;
  pvOk: boolean;
  overallPass: boolean;
  material: BushMaterial;
}

export function selectPlainBush(material: BushMaterial, shaftDiameterMm: number, radialLoadN: number, speedRpm: number, lengthToDiameterRatio: number): BushSelectionResult {
  const boreMm = shaftDiameterMm;
  const lengthMm = boreMm * lengthToDiameterRatio;
  const odMm = boreMm * 1.2 + 4;
  const pressureMPa = lengthMm > 0 ? radialLoadN / (boreMm * lengthMm) : Infinity;
  const velocityMs = (Math.PI * boreMm * speedRpm) / 60000;
  const pv = pressureMPa * velocityMs;
  const pOk = pressureMPa <= material.pMaxMPa;
  const vOk = velocityMs <= material.vMaxMs;
  const pvOk = pv <= material.pvMaxMPaMs;
  return { boreMm, odMm, lengthMm, pressureMPa, velocityMs, pv, pOk, vOk, pvOk, overallPass: pOk && vOk && pvOk, material };
}
