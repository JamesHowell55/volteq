// Bearing sizing engine: ISO 281 equivalent dynamic/static load and rating life,
// a parametric SKF-style catalogue lookup (see bearingData.ts for the calibration
// notes and caveats), lubrication-method suitability (speed factor n.dm and
// temperature limits), and the plain-bush PV method for sleeve bearings.
import {
  BEARING_TYPES, STANDARD_BORES_MM, RELIABILITY_A1, DUTY_FACTORS, STATIC_SAFETY_TARGET, boreCode,
  type BearingTypeMeta, type BearingTypeId, type LubricationMethod, type BushMaterial,
} from './bearingData';

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

function angularContactFactors(deg: ContactAngleOption) {
  return deg === 25
    ? { e: 0.68, x2: 0.41, y2: 0.87, x0: 0.5, y0: 0.26, prefix: '72' }
    : { e: 1.14, x2: 0.35, y2: 0.57, x0: 0.5, y0: 0.34, prefix: '73' };
}

export function resolveBearingType(typeId: BearingTypeId, contactAngleDeg: ContactAngleOption = 40): BearingTypeMeta {
  const base = BEARING_TYPES[typeId];
  if (typeId !== 'angular-contact-ball') return base;
  const f = angularContactFactors(contactAngleDeg);
  return {
    ...base,
    designation: (d) => `${f.prefix}${boreCode(d)} B`,
    dynamicFactors: { kind: 'combined-fixed', e: f.e, x2: f.x2, y2: f.y2 },
    staticFactors: { x0: f.x0, y0: f.y0 },
    contactAngleDeg,
  };
}

// ---- Parametric catalogue lookup ----
export interface CatalogueEntry {
  designation: string;
  boreMm: number;
  odMm: number;
  widthMm: number;
  dynamicN: number;
  staticN: number;
  greaseLimitRpm: number;
  oilLimitRpm: number;
}

export function catalogueAt(type: BearingTypeMeta, boreMm: number): CatalogueEntry {
  const ref = type.reference;
  const ratio = boreMm / ref.boreMm;
  const halfHeightRef = (ref.odMm - ref.boreMm) / 2;
  const odMm = boreMm + 2 * halfHeightRef * Math.pow(ratio, ref.envelopeExponent);
  const widthMm = ref.widthMm * Math.pow(ratio, ref.envelopeExponent);
  const dynamicKN = ref.dynamicKN * Math.pow(ratio, ref.capacityExponent);
  const staticKN = dynamicKN * ref.staticOverDynamic;
  const greaseLimitRpm = ref.greaseLimitRpmAtRef * Math.pow(ref.boreMm / boreMm, ref.speedExponent);
  const oilLimitRpm = greaseLimitRpm * ref.oilLimitFactor;
  return {
    designation: type.designation(boreMm),
    boreMm, odMm, widthMm,
    dynamicN: dynamicKN * 1000,
    staticN: staticKN * 1000,
    greaseLimitRpm, oilLimitRpm,
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
  let e: number, x2: number, y2: number;
  if (model.kind === 'combined-fixed') {
    ({ e, x2, y2 } = model);
  } else {
    const faOverC0 = staticN > 0 ? (axialLoadN / staticN) : 0;
    e = interpTable(faOverC0, model.faOverC0, model.eTable);
    y2 = interpTable(faOverC0, model.faOverC0, model.y2Table);
    x2 = model.x2;
  }
  const ratio = radialLoadN > 0 ? axialLoadN / radialLoadN : (axialLoadN > 0 ? Infinity : 0);
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

export function requiredDynamicCapacityN(loadN: number, targetL10Mrev: number, p: number): number {
  return loadN * Math.pow(Math.max(targetL10Mrev, 1e-9), 1 / p);
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

export interface LubricationCheck {
  ndm: number;
  limitRpm: number;
  ok: boolean;
  notes: string[];
}

export function lubricationSuitability(method: LubricationMethod, entry: CatalogueEntry, speedRpm: number, housingTempC: number): LubricationCheck {
  const notes: string[] = [];
  let ok = true;
  const limitRpm = method === 'oil' ? entry.oilLimitRpm : entry.greaseLimitRpm;
  if (speedRpm > limitRpm) {
    ok = false;
    notes.push(`Speed (${speedRpm.toFixed(0)} rpm) exceeds the typical ${method === 'oil' ? 'oil' : 'grease'} limiting speed for this bearing (~${limitRpm.toFixed(0)} rpm) — ${method === 'oil' ? 'consider circulating/jet oil with cooling, or a lower-friction bearing type.' : 'switch to oil lubrication, or a lower-friction bearing type.'}`);
  }
  if (method !== 'oil' && housingTempC > GREASE_MAX_TEMP_C) {
    ok = false;
    notes.push(`Housing temperature (${housingTempC.toFixed(0)}°C) exceeds a typical standard-grease service limit (~${GREASE_MAX_TEMP_C}°C) — specify a high-temperature grease, or switch to oil lubrication.`);
  }
  if (method === 'sealed' && housingTempC > SEAL_MAX_TEMP_C) {
    notes.push(`Housing temperature (${housingTempC.toFixed(0)}°C) is above a typical standard (NBR) seal's service limit (~${SEAL_MAX_TEMP_C}°C) — specify FKM/Viton seals for a sealed-for-life bearing at this temperature.`);
  }
  return { ndm: speedFactorNdm(entry.odMm, entry.boreMm, speedRpm), limitRpm, ok, notes };
}

// Grease relubrication interval, calibrated to the widely-published SKF trend
// (deep-groove ball: ~10,000 h base interval at a speed factor n.dm=200,000,
// ~4,000 h at n.dm=400,000) with a rule-of-thumb temperature correction (interval
// halves per 15°C of housing temperature above 70°C). Indicative only.
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
}

export function selectBearing(type: BearingTypeMeta, input: BearingSelectionInput): BearingCandidateResult {
  const p = lifeExponent(type);
  const isRoller = type.rollingElement !== 'ball';
  const a1 = a1For(input.reliabilityPct);
  const dutyFactor = dutyFactorFor(input.dutyFactorId);
  const staticTarget = staticSafetyTarget(input.staticDutyId, isRoller);

  const startBore = STANDARD_BORES_MM.find((b) => b >= input.shaftDiameterMm) ?? STANDARD_BORES_MM[STANDARD_BORES_MM.length - 1];
  const candidateBores = STANDARD_BORES_MM.filter((b) => b >= startBore);

  let last: BearingCandidateResult | null = null;
  for (const bore of candidateBores) {
    const entry = catalogueAt(type, bore);
    const eq = equivalentDynamicLoad(type, entry.staticN, input.radialLoadN, input.axialLoadN);
    const effectiveLoadN = eq.P_N * dutyFactor;
    const staticLoadN = equivalentStaticLoad(type, input.radialLoadN, input.axialLoadN);
    const targetMrev = input.speedRpm > 0 ? ((input.targetL10Hours / a1) * 60 * input.speedRpm) / 1e6 : 0;
    const requiredDynamicN = requiredDynamicCapacityN(effectiveLoadN, targetMrev, p);
    const requiredStaticN = staticTarget * staticLoadN;
    const dynamicPass = entry.dynamicN >= requiredDynamicN;
    const staticPass = entry.staticN >= requiredStaticN;
    const achievedL10Mrev = l10MillionRev(entry.dynamicN, effectiveLoadN, p);
    const achievedL10h = l10Hours(achievedL10Mrev, input.speedRpm);
    const lubrication = lubricationSuitability(input.lubricationMethod, entry, input.speedRpm, input.housingTempC);

    const result: BearingCandidateResult = {
      typeId: type.id, entry, equivalentLoad: eq, effectiveLoadN, staticLoadN,
      requiredDynamicN, requiredStaticN, dynamicPass, staticPass,
      achievedL10Mrev, achievedL10h, achievedL10hAdjusted: achievedL10h * a1,
      staticSafetyFactorAchieved: staticLoadN > 0 ? entry.staticN / staticLoadN : Infinity,
      lubrication, overallPass: dynamicPass && staticPass, sizedUp: bore > startBore,
      a1, dutyFactor, p,
    };
    last = result;
    if (result.overallPass) return result;
  }
  return last!;
}

export function compareAllTypes(input: BearingSelectionInput, contactAngleDeg: ContactAngleOption): BearingCandidateResult[] {
  const ids: BearingTypeId[] = ['deep-groove-ball', 'angular-contact-ball', 'cylindrical-roller', 'tapered-roller', 'spherical-roller', 'needle-roller', 'thrust-ball'];
  return ids.map((id) => selectBearing(resolveBearingType(id, contactAngleDeg), input));
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
