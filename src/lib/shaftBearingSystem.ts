// Shaft + bearing SYSTEM engine — composes the shaft statics (bearing reactions
// and thrust routing) with the ISO 281 bearing-selection/life engine to size a
// front/rear bearing pair for a supported shaft, and combines them into a system
// rating life. Handles the two axial-location strategies:
//
//  • Fixed–floating: one bearing (the locating bearing) reacts all external
//    thrust; the other floats (pure radial) and absorbs thermal axial growth.
//  • Opposed angular-contact / tapered-roller pair (back-to-back "O" or
//    face-to-face "X"): each bearing induces an internal axial load from its
//    radial load (Ja = 0.5·Fr/Y), and the external thrust Ka is distributed
//    between the two per SKF General Catalogue table 11 (load cases 1a–2c).
//
// Also estimates the shaft's thermal axial growth between the bearings (which the
// floating bearing must accommodate) and reuses the bearing engine's differential-
// expansion clearance advisory.

import { BEARING_TYPES, type BearingTypeId } from './bearingData';
import {
  resolveBearingType, selectBearing, thermalAdvisory,
  type ContactAngleOption, type BearingSelectionInput, type BearingCandidateResult,
} from './bearingPhysics';

export type Arrangement = 'fixed-floating' | 'back-to-back' | 'face-to-face';

export interface SystemLoad {
  id: string;
  label: string;
  positionMm: number;   // measured along the shaft (bearing A is the datum)
  radialN: number;      // resultant transverse force
  angleDeg: number;     // plane: 0 = vertical, 90 = horizontal
  axialN: number;       // thrust component along the shaft (signed: + toward B)
}

export interface SystemInput {
  bearingAPosMm: number;
  bearingBPosMm: number;
  shaftDiaAMm: number;
  shaftDiaBMm: number;
  loads: SystemLoad[];
  spanMm: number;               // A→B distance (for thermal growth)
  arrangement: Arrangement;
  locatingBearing: 'A' | 'B';   // fixed–floating: which bearing locates axially
  bearingTypeA: BearingTypeId;
  bearingTypeB: BearingTypeId;
  contactAngleDeg: ContactAngleOption;
  speedRpm: number;
  targetL10Hours: number;
  reliabilityPct: number;
  dutyFactorId: 'steady' | 'light-shock' | 'heavy-shock';
  staticDutyId: 'low' | 'normal' | 'heavy';
  lubricationMethod: 'sealed' | 'grease' | 'oil';
  housingTempC: number;
  shaftTempC: number;
  shaftCtePerC: number;         // ×10⁻⁶/°C handled by caller (pass absolute 1/°C)
  thermalRefTempC: number;
}

export interface BearingAxial { radialN: number; axialN: number; inducedN: number; }

export interface SystemResult {
  reactionAN: number;
  reactionBN: number;
  externalThrustN: number;
  axialA: BearingAxial;
  axialB: BearingAxial;
  loadCase: string;
  bearingA: BearingCandidateResult;
  bearingB: BearingCandidateResult;
  systemL10Hours: number;
  systemReliabilityNote: string;
  thermalGrowthMm: number;
  clearanceAdvisory?: string;
  thrustAdvisory?: string;
  warnings: string[];
}

// Weibull dispersion exponent for rolling-bearing life (ISO 281): the system
// rating life for bearings in series is L = (Σ Li^−e)^(−1/e).
const WEIBULL_E = 1.5;

function planeReactions(loads: { pos: number; comp: number }[], a: number, b: number): { ra: number; rb: number } {
  const sumF = loads.reduce((s, l) => s + l.comp, 0);
  const sumM = loads.reduce((s, l) => s + l.comp * (l.pos - a), 0); // about A
  const rb = sumM / (b - a);
  const ra = sumF - rb;
  return { ra, rb };
}

// Axial factor Y for a bearing type (for the induced axial load Ja = 0.5·Fr/Y).
function axialY(typeId: BearingTypeId, contactAngleDeg: ContactAngleOption): number {
  const t = resolveBearingType(typeId, contactAngleDeg);
  const m = t.dynamicFactors;
  if (m.kind === 'combined-fixed') return m.y2;
  if (m.kind === 'double-row') return m.y2;
  return 0.57; // fallback (40° angular contact)
}

export function solveSystem(input: SystemInput): SystemResult {
  const warnings: string[] = [];
  const a = input.bearingAPosMm, b = input.bearingBPosMm;
  if (b <= a) warnings.push('Bearing B must be positioned after bearing A.');

  // Radial reactions in the two planes → resultant.
  const yLoads = input.loads.map((l) => ({ pos: l.positionMm, comp: l.radialN * Math.cos(l.angleDeg * Math.PI / 180) }));
  const zLoads = input.loads.map((l) => ({ pos: l.positionMm, comp: l.radialN * Math.sin(l.angleDeg * Math.PI / 180) }));
  const ry = planeReactions(yLoads, a, b);
  const rz = planeReactions(zLoads, a, b);
  const reactionAN = Math.hypot(ry.ra, rz.ra);
  const reactionBN = Math.hypot(ry.rb, rz.rb);

  // External thrust (net axial along the shaft; + toward B).
  const Ka = input.loads.reduce((s, l) => s + l.axialN, 0);

  // Distribute axial load per arrangement.
  let axialA: BearingAxial, axialB: BearingAxial, loadCase: string;
  if (input.arrangement === 'fixed-floating') {
    const locA = input.locatingBearing === 'A';
    axialA = { radialN: reactionAN, axialN: locA ? Math.abs(Ka) : 0, inducedN: 0 };
    axialB = { radialN: reactionBN, axialN: locA ? 0 : Math.abs(Ka), inducedN: 0 };
    loadCase = `Fixed–floating (bearing ${input.locatingBearing} locates)`;
  } else {
    // Opposed pair: induced axial Ja = 0.5·Fr/Y.
    const Ya = axialY(input.bearingTypeA, input.contactAngleDeg);
    const Yb = axialY(input.bearingTypeB, input.contactAngleDeg);
    const jA = 0.5 * reactionAN / Ya;
    const jB = 0.5 * reactionBN / Yb;
    // SKF table 11: the external thrust Ka is reacted by one bearing depending on
    // its sign and the arrangement. Normalise so that the "reacting" bearing is R
    // and the other is F; Ka >= 0 is taken up by bearing B for back-to-back with
    // +toward-B (and A for face-to-face) — we resolve to A/B via reactsAtB.
    const reactsAtB = (input.arrangement === 'back-to-back') === (Ka >= 0);
    const K = Math.abs(Ka);
    let FaA: number, FaB: number;
    if (reactsAtB) {
      // Ka reacted at B (cases 1a/1b/1c)
      if (K >= jB - jA) { FaA = jA; FaB = jA + K; loadCase = 'Opposed pair, case 1a/1b (thrust at B)'; }
      else { FaB = jB; FaA = jB - K; loadCase = 'Opposed pair, case 1c (thrust at B)'; }
    } else {
      // Ka reacted at A (cases 2a/2b/2c)
      if (K >= jA - jB) { FaB = jB; FaA = jB + K; loadCase = 'Opposed pair, case 2a/2b (thrust at A)'; }
      else { FaA = jA; FaB = jA - K; loadCase = 'Opposed pair, case 2c (thrust at A)'; }
    }
    axialA = { radialN: reactionAN, axialN: Math.max(0, FaA), inducedN: jA };
    axialB = { radialN: reactionBN, axialN: Math.max(0, FaB), inducedN: jB };
  }

  const baseSel = (dia: number, ax: BearingAxial, typeId: BearingTypeId): BearingCandidateResult => {
    const sel: BearingSelectionInput = {
      shaftDiameterMm: dia, radialLoadN: ax.radialN, axialLoadN: ax.axialN, speedRpm: input.speedRpm,
      targetL10Hours: input.targetL10Hours, reliabilityPct: input.reliabilityPct, dutyFactorId: input.dutyFactorId,
      staticDutyId: input.staticDutyId, lubricationMethod: input.lubricationMethod, housingTempC: input.housingTempC,
    };
    return selectBearing(resolveBearingType(typeId, input.contactAngleDeg), sel);
  };

  const bearingA = baseSel(input.shaftDiaAMm, axialA, input.bearingTypeA);
  const bearingB = baseSel(input.shaftDiaBMm, axialB, input.bearingTypeB);

  // System rating life (bearings in series).
  const la = bearingA.achievedL10hAdjusted, lb = bearingB.achievedL10hAdjusted;
  const systemL10Hours = (isFinite(la) && isFinite(lb))
    ? Math.pow(Math.pow(la, -WEIBULL_E) + Math.pow(lb, -WEIBULL_E), -1 / WEIBULL_E)
    : Math.min(la, lb);

  // Thermal axial growth of the shaft between the bearings.
  const thermalGrowthMm = input.shaftCtePerC * input.spanMm * (input.shaftTempC - input.thermalRefTempC);
  const clearanceAdvisory = thermalAdvisory(input.shaftTempC, input.housingTempC);
  let thrustAdvisory: string | undefined;
  if (input.arrangement === 'fixed-floating' && Math.abs(thermalGrowthMm) > 0.02) {
    const floatB = input.locatingBearing === 'A';
    thrustAdvisory = `The shaft grows ${thermalGrowthMm >= 0 ? '' : ''}${thermalGrowthMm.toFixed(3)} mm between the bearings over this temperature rise — the floating bearing (${floatB ? 'B' : 'A'}) must accommodate this axial movement (a non-locating cylindrical-roller bearing, or a sliding outer-ring fit).`;
  }

  // Warn if a locating bearing was asked to react thrust it can't take.
  for (const [lbl, ax, typeId] of [['A', axialA, input.bearingTypeA], ['B', axialB, input.bearingTypeB]] as const) {
    const meta = BEARING_TYPES[typeId];
    if (ax.axialN > 1 && meta.axial === 'none') {
      warnings.push(`Bearing ${lbl} (${meta.label}) carries no thrust, but is assigned ${ax.axialN.toFixed(0)} N of axial load — locate the shaft on the other bearing, or use a thrust-capable type.`);
    }
  }

  return {
    reactionAN, reactionBN, externalThrustN: Ka, axialA, axialB, loadCase,
    bearingA, bearingB, systemL10Hours,
    systemReliabilityNote: `System L10 combines the two bearings in series via L = (L_A⁻ᵉ + L_B⁻ᵉ)⁻¹ᐟᵉ with the ISO 281 Weibull slope e = ${WEIBULL_E}.`,
    thermalGrowthMm, clearanceAdvisory, thrustAdvisory, warnings,
  };
}
