// Bolted joint physics engine — VDI 2230 "cone of compression" concept realized via
// Shigley's Mechanical Engineering Design closed-form frustum stiffness and
// torque-preload equations (chosen over an ambiguous VDI2230-web-search formula
// variant; Shigley's form is a clean, verifiable, widely-taught realization of the
// same underlying physics). Pure functions only — no React, no formatting, no
// calculation-step narrative (the page builds that from these flat outputs).
//
// Method summary and disclosed simplifications:
//  - Frustum (cone of compression) stiffness uses a fixed 30 deg half-angle:
//      k = (0.5774 * pi * E * d) / ln{ [(1.155t + D - d)(D + d)] / [(1.155t + D + d)(D - d)] }
//    This is the standard simplified single-frustum formula (Shigley Eq. 8-20 class).
//  - For a nut-and-bolt joint, the clamped stack is modelled as TWO cones (one from
//    the head bearing face, one from the nut bearing face) meeting at the stack
//    mid-plane. Where the mid-plane falls inside a clamped section (the common case
//    with 2+ sections), each side's cone is *chained* through as many sections as it
//    spans: each subsequent segment's base diameter is the previous segment's
//    diameter at its widest point (D + 2*t*tan(30)), not the original bearing
//    diameter — this correctly extends the method to heterogeneous multi-plate
//    stacks while remaining the same 2-sided (head/nut) cone method.
//  - For a tapped or threaded-insert joint (no nut), there is no counter-bearing
//    face, so only ONE cone is modelled: from the head bearing face down to the
//    mid-point of the engaged thread length in the tapped member — a common
//    simplification representing the effective centroid of the distributed thread
//    reaction.
//  - Bolt (fastener) stiffness is a two-segment series-spring model: unthreaded
//    shank (nominal diameter area) + threaded engagement length (tensile stress
//    area As).
//  - Torque-preload relationship uses Shigley's exact closed form (30 deg thread
//    half-angle, sec(30) ~ 1.1547); preloadFromTorque is a direct algebraic
//    inversion (T is linear in F for fixed geometry/friction), not iterative.
//  - Minimum thread engagement length uses a first-principles-scaled rule: required
//    engagement grows in proportion to how much weaker the tapped/insert material is
//    than the bolt (by proof-stress / yield-stress ratio), floored at 1x nominal
//    diameter (the common minimum-engagement guideline for matched-strength
//    materials). This is an engineering approximation, not a full thread-shear-area
//    derivation — verify for critical joints.
//  - Clamped-member bearing stress is checked only at the two outer bearing faces
//    (head-side and nut-side/tapped-entry), not at interior plate-to-plate
//    interfaces (those have much larger nominal contact area and rarely govern).

import type { ClampedMaterial, ClampedMaterialId } from './clampedMaterials';
import { getClampedMaterial } from './clampedMaterials';
import type { FastenerSize, HeadType, PropertyClass } from './fastenerStandards';
import type { NutPreset, ThreadedInsertPreset, WasherPreset } from './fastenerHardware';

const DEG30_SEC = 1 / Math.cos(Math.PI / 6); // sec(30deg) ~ 1.1547
const TAN30 = Math.tan(Math.PI / 6); // ~0.5774

export type SolveMode = 'torqueToPreload' | 'preloadToTorque' | 'torqueAndAngle';
export type ThreadEngagementMode = 'nutAndBolt' | 'tappedBlindOrThrough' | 'threadedInsert';
export type ScatterConvention = 'nominalToMax' | 'symmetric';

export interface ClampedSectionInput {
  id: string;
  materialId: ClampedMaterialId;
  customE?: number; // GPa, used when materialId === 'custom'
  customYield?: number; // MPa
  thermalExpansionPerC?: number; // 1/°C, advanced-mode override of the preset CTE
  thicknessMm: number;
  holeDiameterMm: number;
  outerDiameterMm: number;
}

export interface ThermalInput {
  assemblyTempC: number;
  operatingTempC: number;
  boltThermalExpansionPerC: number; // 1/°C
}

export interface JointInput {
  mode: SolveMode;
  size: FastenerSize;
  headType: HeadType;
  propertyClass: PropertyClass;

  clampedSections: ClampedSectionInput[]; // ordered head-side to nut/tapped-side

  underHeadWasher: WasherPreset | null;
  underNutWasher: WasherPreset | null;
  includeSpringWasherCompliance: boolean;

  threadEngagementMode: ThreadEngagementMode;
  nut: NutPreset | null; // used when nutAndBolt
  threadedInsert?: ThreadedInsertPreset | null; // used when threadedInsert
  engagementLengthMm?: number; // user-entered; required for tappedBlindOrThrough, optional override for threadedInsert

  threadFrictionMu: number;
  bearingFrictionMu: number;

  targetPreloadN?: number;
  targetTorqueNm?: number;
  snugTorqueNm?: number; // torqueAndAngle only
  additionalAngleDeg?: number; // torqueAndAngle only

  tighteningMethodAlphaAMax: number;
  scatterConvention: ScatterConvention;

  externalAxialLoadN: number;
  safetyFactorTarget: number;

  thermal?: ThermalInput | null;
}

export interface FrustumSegment {
  fromBearingFace: 'head' | 'nut';
  thicknessMm: number;
  baseDiameterMm: number;
  holeDiameterMm: number;
  stiffnessNPerMm: number;
}

export interface BoltElasticSegment {
  label: string;
  areaMm2: number;
  lengthMm: number;
  stiffnessNPerMm: number;
}

export interface GeometryValidity {
  holeClearanceOk: boolean;
  holeClearanceRadialMm: number;
  minEngagementLengthMm: number;
  engagementLengthOk: boolean;
  gripLengthExceedsFastenerOk: boolean;
  frustumBaseExceedsMemberOdWarning: boolean;
}

export interface BoltedJointResult {
  boltSegments: BoltElasticSegment[];
  kBoltNPerMm: number;
  frustumSegments: FrustumSegment[];
  kMembersNPerMm: number;
  jointStiffnessC: number;

  preloadN: number;
  torqueNm: number;
  torqueBreakdown: { threadTermNm: number; bearingTermNm: number };
  simplifiedKFactor: number;
  combinedStiffnessNPerMm: number;
  angleInducedForceN: number; // torqueAndAngle only, else 0
  yieldOnsetTorqueNm: number;
  yieldOnsetAngleDegFromSnug: number | null; // torqueAndAngle only, else null
  springWasherStiffnessNPerMm: { head: number | null; nut: number | null };
  preloadScatterBand: { minN: number; maxN: number };
  preloadPercentOfProof: number;

  boltForceUnderLoadN: number;
  memberForceUnderLoadN: number;
  jointSeparationMarginN: number;
  jointSeparates: boolean;

  boltTensileStressMPa: number;
  boltStressSafetyFactor: number;
  boltStressPass: boolean;
  memberBearingStressMPa: number[];
  memberBearingSafetyFactor: number[];
  memberBearingPass: boolean[];
  threadShearCheck: { requiredEngagementMm: number; providedEngagementMm: number; pass: boolean } | null;

  geometryValidity: GeometryValidity;
  overallPass: boolean;

  thermalResult: {
    deltaForceN: number;
    preloadN: number;
    boltStressSafetyFactor: number;
    boltStressPass: boolean;
    memberBearingSafetyFactor: number[];
    memberBearingPass: boolean[];
    jointSeparates: boolean;
    overallPass: boolean;
  } | null;
}

function resolveSectionMaterial(section: ClampedSectionInput): ClampedMaterial {
  const preset = getClampedMaterial(section.materialId);
  // customE/customYield/thermalExpansionPerC override the preset regardless of
  // materialId (not just for the dedicated 'custom' entry) — this is what powers
  // the page's advanced-mode per-material property override.
  return {
    ...preset,
    elasticModulusGPa: section.customE ?? preset.elasticModulusGPa,
    yieldStrengthMPa: section.customYield ?? preset.yieldStrengthMPa,
    thermalExpansionPerC: section.thermalExpansionPerC ?? preset.thermalExpansionPerC,
  };
}

interface StressCheckResult {
  boltForceUnderLoadN: number;
  memberForceUnderLoadN: number;
  jointSeparationMarginN: number;
  jointSeparates: boolean;
  boltTensileStressMPa: number;
  boltStressSafetyFactor: number;
  boltStressPass: boolean;
  memberBearingStressMPa: number[];
  memberBearingSafetyFactor: number[];
  memberBearingPass: boolean[];
}

// Shared by the baseline (assembly-temperature) solve and, when thermal effects are
// enabled, a second pass at the thermally-adjusted preload — both need exactly the
// same stress/bearing checks against a different F.
function computeStressChecks(
  preloadN: number,
  externalAxialLoadN: number,
  jointStiffnessC: number,
  clampedSections: ClampedSectionInput[],
  headBearingDiameterMm: number,
  nutBearingDiameterMm: number,
  threadEngagementMode: ThreadEngagementMode,
  proofStrengthMPa: number,
  tensileStressAreaMm2: number,
  safetyFactorTarget: number
): StressCheckResult {
  const boltForceUnderLoadN = preloadN + jointStiffnessC * externalAxialLoadN;
  const memberForceUnderLoadN = preloadN - (1 - jointStiffnessC) * externalAxialLoadN;
  const jointSeparationMarginN = memberForceUnderLoadN;
  const jointSeparates = memberForceUnderLoadN <= 0;

  const boltTensileStressMPa = boltForceUnderLoadN / tensileStressAreaMm2;
  const boltStressSafetyFactor = proofStrengthMPa / boltTensileStressMPa;
  const boltStressPass = boltStressSafetyFactor >= safetyFactorTarget;

  const memberBearingStressMPa: number[] = [];
  const memberBearingSafetyFactor: number[] = [];
  const memberBearingPass: boolean[] = [];

  clampedSections.forEach((section, i) => {
    const isHeadFace = i === 0;
    const isNutFace = i === clampedSections.length - 1 && threadEngagementMode === 'nutAndBolt';
    if (!isHeadFace && !isNutFace) {
      memberBearingStressMPa.push(NaN);
      memberBearingSafetyFactor.push(NaN);
      memberBearingPass.push(true);
      return;
    }
    const bearingDiameterMm = isHeadFace ? headBearingDiameterMm : nutBearingDiameterMm;
    const bearingAreaMm2 = (Math.PI / 4) * (bearingDiameterMm * bearingDiameterMm - section.holeDiameterMm * section.holeDiameterMm);
    const stress = boltForceUnderLoadN / bearingAreaMm2;
    const material = resolveSectionMaterial(section);
    const sf = material.yieldStrengthMPa / stress;
    memberBearingStressMPa.push(stress);
    memberBearingSafetyFactor.push(sf);
    memberBearingPass.push(sf >= safetyFactorTarget);
  });

  return {
    boltForceUnderLoadN,
    memberForceUnderLoadN,
    jointSeparationMarginN,
    jointSeparates,
    boltTensileStressMPa,
    boltStressSafetyFactor,
    boltStressPass,
    memberBearingStressMPa,
    memberBearingSafetyFactor,
    memberBearingPass,
  };
}

// Simplified linear axial stiffness estimate for spring-type washers (Belleville,
// split-ring) when the user opts to include their compliance in the stack. Real
// Belleville washers have a strongly nonlinear load-deflection curve — this is a
// bounded, order-of-magnitude default (treats the washer as a stiff disc of typical
// spring-steel modulus) intended to be overridden with a real catalog spring rate
// via WasherPreset.customStiffnessNPerMm when better data is available.
const SPRING_STEEL_E_MPA = 206000;

export function computeWasherStiffness(washer: WasherPreset | null | undefined): number | null {
  if (!washer) return null;
  if (washer.type !== 'belleville' && washer.type !== 'splitRingSpring') return null;
  if (washer.customStiffnessNPerMm) return washer.customStiffnessNPerMm;
  const areaMm2 = (Math.PI / 4) * (washer.odMm * washer.odMm - washer.idMm * washer.idMm);
  return (areaMm2 * SPRING_STEEL_E_MPA) / washer.thicknessMm;
}

export function computeFrustumStiffness(thicknessMm: number, baseDiameterMm: number, holeDiameterMm: number, elasticModulusMPa: number): number {
  const t = thicknessMm;
  const D = baseDiameterMm;
  const d = holeDiameterMm;
  const num = (1.155 * t + D - d) * (D + d);
  const den = (1.155 * t + D + d) * (D - d);
  const lnTerm = Math.log(num / den);
  return (TAN30 * Math.PI * elasticModulusMPa * d) / lnTerm;
}

export function computeBoltStiffness(segments: { label: string; areaMm2: number; lengthMm: number }[], elasticModulusMPa: number): BoltElasticSegment[] {
  return segments
    .filter((s) => s.lengthMm > 1e-6)
    .map((s) => ({ ...s, stiffnessNPerMm: (s.areaMm2 * elasticModulusMPa) / s.lengthMm }));
}

function seriesCombine(stiffnesses: number[]): number {
  const valid = stiffnesses.filter((k) => k > 0 && isFinite(k));
  if (valid.length === 0) return 0;
  return 1 / valid.reduce((sum, k) => sum + 1 / k, 0);
}

interface FrustumWalkResult {
  segments: FrustumSegment[];
  exceedsMemberOd: boolean;
}

function walkFrustumChain(
  fromBearingFace: 'head' | 'nut',
  orderedSections: { thicknessMm: number; outerDiameterMm: number; elasticModulusMPa: number }[],
  startDiameterMm: number,
  holeDiameterMm: number,
  totalDistanceMm: number
): FrustumWalkResult {
  const segments: FrustumSegment[] = [];
  let currentD = startDiameterMm;
  let remaining = totalDistanceMm;
  let exceedsMemberOd = false;

  for (const section of orderedSections) {
    if (remaining <= 1e-9) break;
    const segThickness = Math.min(section.thicknessMm, remaining);
    if (segThickness <= 1e-9) continue;
    if (currentD > section.outerDiameterMm) exceedsMemberOd = true;
    const k = computeFrustumStiffness(segThickness, currentD, holeDiameterMm, section.elasticModulusMPa);
    segments.push({ fromBearingFace, thicknessMm: segThickness, baseDiameterMm: currentD, holeDiameterMm, stiffnessNPerMm: k });
    currentD = currentD + 2 * segThickness * TAN30;
    remaining -= segThickness;
  }
  return { segments, exceedsMemberOd };
}

export function torqueFromPreload(preloadN: number, pitchDiameterMm: number, pitchMm: number, threadFrictionMu: number, bearingDiameterMm: number, bearingFrictionMu: number) {
  const dm = pitchDiameterMm;
  const l = pitchMm; // single-start thread: lead = pitch
  const threadNumerator = l + Math.PI * threadFrictionMu * dm * DEG30_SEC;
  const threadDenominator = Math.PI * dm - threadFrictionMu * l * DEG30_SEC;
  const threadTermNmm = (preloadN * dm) / 2 * (threadNumerator / threadDenominator);
  const bearingTermNmm = (preloadN * bearingFrictionMu * bearingDiameterMm) / 2;
  return {
    torqueNm: (threadTermNmm + bearingTermNmm) / 1000,
    threadTermNm: threadTermNmm / 1000,
    bearingTermNm: bearingTermNmm / 1000,
  };
}

export function preloadFromTorque(torqueNm: number, pitchDiameterMm: number, pitchMm: number, threadFrictionMu: number, bearingDiameterMm: number, bearingFrictionMu: number) {
  const dm = pitchDiameterMm;
  const l = pitchMm;
  const threadNumerator = l + Math.PI * threadFrictionMu * dm * DEG30_SEC;
  const threadDenominator = Math.PI * dm - threadFrictionMu * l * DEG30_SEC;
  const threadCoeff = (dm / 2) * (threadNumerator / threadDenominator);
  const bearingCoeff = (bearingFrictionMu * bearingDiameterMm) / 2;
  const torqueNmm = torqueNm * 1000;
  return torqueNmm / (threadCoeff + bearingCoeff);
}

export function minThreadEngagementLength(nominalDiameterMm: number, boltProofStrengthMPa: number, materialYieldStrengthMPa: number, deratingFactor = 1.0): number {
  const effectiveMaterialStrength = materialYieldStrengthMPa * deratingFactor;
  const ratio = boltProofStrengthMPa / effectiveMaterialStrength;
  return Math.max(nominalDiameterMm, nominalDiameterMm * ratio);
}

export function checkGeometryValidity(input: JointInput): GeometryValidity {
  const { size, clampedSections, threadEngagementMode } = input;
  const d = size.nominalDiameterMm;

  const sectionsNeedingClearance = threadEngagementMode === 'nutAndBolt' ? clampedSections : clampedSections.slice(0, -1);
  const radialClearances = sectionsNeedingClearance.map((s) => (s.holeDiameterMm - d) / 2);
  const holeClearanceRadialMm = radialClearances.length > 0 ? Math.min(...radialClearances) : (d + 0.5 - d) / 2;
  const holeClearanceOk = holeClearanceRadialMm >= 0.1;

  const lastSection = clampedSections[clampedSections.length - 1];
  const lastMaterial = lastSection ? resolveSectionMaterial(lastSection) : null;
  let minEngagementLengthMm = d;
  let engagementLengthOk = true;
  let gripLengthExceedsFastenerOk = true;

  if (threadEngagementMode !== 'nutAndBolt' && lastSection && lastMaterial) {
    const derating = threadEngagementMode === 'threadedInsert' ? (input.threadedInsert?.engagementStrengthDeratingFactor ?? 1.0) : 1.0;
    minEngagementLengthMm = minThreadEngagementLength(d, input.propertyClass.proofStrengthMPa, lastMaterial.yieldStrengthMPa, derating);
    const provided = input.engagementLengthMm ?? 0;
    engagementLengthOk = provided >= minEngagementLengthMm;
    gripLengthExceedsFastenerOk = provided <= lastSection.thicknessMm + 1e-6;
  }

  return {
    holeClearanceOk,
    holeClearanceRadialMm,
    minEngagementLengthMm,
    engagementLengthOk,
    gripLengthExceedsFastenerOk,
    frustumBaseExceedsMemberOdWarning: false, // filled in by solveBoltedJoint once the frustum chain is walked
  };
}

export function solveBoltedJoint(input: JointInput): BoltedJointResult {
  const { size, propertyClass, clampedSections, headType } = input;
  const d = size.nominalDiameterMm;
  const boltE_MPa = propertyClass.elasticModulusGPa * 1000;

  const headBearingDiameterMm = input.underHeadWasher?.odMm ?? size.headFlatsAcrossMm[headType];
  const nutBearingDiameterMm =
    input.underNutWasher?.odMm ?? (input.threadEngagementMode === 'nutAndBolt' ? (input.nut?.flatsAcrossMm ?? size.headFlatsAcrossMm[headType]) : d);

  const sectionsWithMaterial = clampedSections.map((s) => {
    const mat = resolveSectionMaterial(s);
    return { thicknessMm: s.thicknessMm, outerDiameterMm: s.outerDiameterMm, elasticModulusMPa: mat.elasticModulusGPa * 1000 };
  });

  const holeDiameterMm = clampedSections[0]?.holeDiameterMm ?? d + 0.5;
  const totalGripMm = clampedSections.reduce((sum, s) => sum + s.thicknessMm, 0);

  let frustumSegments: FrustumSegment[] = [];
  let exceedsMemberOd = false;

  if (input.threadEngagementMode === 'nutAndBolt') {
    const halfGrip = totalGripMm / 2;
    const headWalk = walkFrustumChain('head', sectionsWithMaterial, headBearingDiameterMm, holeDiameterMm, halfGrip);
    const nutWalk = walkFrustumChain('nut', [...sectionsWithMaterial].reverse(), nutBearingDiameterMm, holeDiameterMm, totalGripMm - halfGrip);
    frustumSegments = [...headWalk.segments, ...nutWalk.segments];
    exceedsMemberOd = headWalk.exceedsMemberOd || nutWalk.exceedsMemberOd;
  } else {
    // Tapped / threaded-insert: single cone from the head down to the mid-point of
    // the engaged thread length in the last (tapped) member.
    const lastSection = clampedSections[clampedSections.length - 1];
    const engagement = input.engagementLengthMm ?? 0;
    const upperSections = sectionsWithMaterial.slice(0, -1);
    const distanceToMidEngagement =
      upperSections.reduce((sum, s) => sum + s.thicknessMm, 0) + engagement / 2;
    const chainSections = [...upperSections, { ...sectionsWithMaterial[sectionsWithMaterial.length - 1], thicknessMm: lastSection?.thicknessMm ?? 0 }];
    const headWalk = walkFrustumChain('head', chainSections, headBearingDiameterMm, holeDiameterMm, distanceToMidEngagement);
    frustumSegments = headWalk.segments;
    exceedsMemberOd = headWalk.exceedsMemberOd;
  }

  const springWasherStiffnessNPerMm: { head: number | null; nut: number | null } = { head: null, nut: null };
  if (input.includeSpringWasherCompliance) {
    springWasherStiffnessNPerMm.head = computeWasherStiffness(input.underHeadWasher);
    springWasherStiffnessNPerMm.nut = computeWasherStiffness(input.threadEngagementMode === 'nutAndBolt' ? input.underNutWasher : null);
  }
  const kMembersNPerMm = seriesCombine([
    ...frustumSegments.map((s) => s.stiffnessNPerMm),
    ...(springWasherStiffnessNPerMm.head ? [springWasherStiffnessNPerMm.head] : []),
    ...(springWasherStiffnessNPerMm.nut ? [springWasherStiffnessNPerMm.nut] : []),
  ]);

  const effectiveEngagementMm =
    input.threadEngagementMode === 'nutAndBolt' ? (input.nut?.heightMm ?? d) : (input.engagementLengthMm ?? d);
  const shankLengthMm = Math.max(0, totalGripMm - effectiveEngagementMm);
  const shankAreaMm2 = (Math.PI / 4) * d * d;
  const threadAreaMm2 = size.tensileStressAreaMm2;

  const boltSegments = computeBoltStiffness(
    [
      { label: 'Unthreaded shank', areaMm2: shankAreaMm2, lengthMm: shankLengthMm },
      { label: 'Threaded engagement', areaMm2: threadAreaMm2, lengthMm: effectiveEngagementMm },
    ],
    boltE_MPa
  );
  const kBoltNPerMm = seriesCombine(boltSegments.map((s) => s.stiffnessNPerMm));

  const jointStiffnessC = kBoltNPerMm / (kBoltNPerMm + kMembersNPerMm);
  const combinedStiffnessNPerMm = seriesCombine([kBoltNPerMm, kMembersNPerMm]);

  let preloadN: number;
  let torqueNm: number;
  let torqueBreakdown: { threadTermNm: number; bearingTermNm: number };
  let angleInducedForceN = 0;

  if (input.mode === 'preloadToTorque') {
    preloadN = input.targetPreloadN ?? 0;
    const t = torqueFromPreload(preloadN, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    torqueNm = t.torqueNm;
    torqueBreakdown = { threadTermNm: t.threadTermNm, bearingTermNm: t.bearingTermNm };
  } else if (input.mode === 'torqueAndAngle') {
    // Turn-of-nut method: snug torque takes up slack and establishes an initial
    // (small) preload via the usual torque-preload relation; the additional
    // rotation then advances the nut by deltaL = (angle/360)*pitch, which the bolt
    // and members share via their *combined series stiffness* — this is standard
    // turn-of-nut mechanics, not an approximation specific to this tool.
    const snugTorqueNm = input.snugTorqueNm ?? 0;
    const snugPreloadN = preloadFromTorque(snugTorqueNm, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    const deltaLMm = ((input.additionalAngleDeg ?? 0) / 360) * size.pitchMm;
    angleInducedForceN = deltaLMm * combinedStiffnessNPerMm;
    preloadN = snugPreloadN + angleInducedForceN;
    const t = torqueFromPreload(preloadN, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    torqueNm = t.torqueNm;
    torqueBreakdown = { threadTermNm: t.threadTermNm, bearingTermNm: t.bearingTermNm };
  } else {
    torqueNm = input.targetTorqueNm ?? 0;
    preloadN = preloadFromTorque(torqueNm, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    const t = torqueFromPreload(preloadN, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    torqueBreakdown = { threadTermNm: t.threadTermNm, bearingTermNm: t.bearingTermNm };
  }

  const simplifiedKFactor = preloadN > 0 ? (torqueNm * 1000) / (preloadN * d) : 0;

  // Yield-onset ("breakoff") torque: the torque that would just bring the bolt to
  // its proof strength (before any external load is applied) — a safe ceiling
  // reference for any tightening method, and the basis of real yield-controlled/
  // gradient tightening tools.
  const forceAtYieldN = propertyClass.proofStrengthMPa * size.tensileStressAreaMm2;
  const yieldOnsetTorqueNm = torqueFromPreload(forceAtYieldN, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu).torqueNm;
  let yieldOnsetAngleDegFromSnug: number | null = null;
  if (input.mode === 'torqueAndAngle') {
    const snugPreloadN = preloadFromTorque(input.snugTorqueNm ?? 0, size.pitchDiameterMm, size.pitchMm, input.threadFrictionMu, nutBearingDiameterMm, input.bearingFrictionMu);
    const remainingForceN = forceAtYieldN - snugPreloadN;
    yieldOnsetAngleDegFromSnug = remainingForceN > 0 && combinedStiffnessNPerMm > 0 ? (remainingForceN / combinedStiffnessNPerMm / size.pitchMm) * 360 : 0;
  }

  const alphaA = input.tighteningMethodAlphaAMax;
  const preloadScatterBand =
    input.scatterConvention === 'nominalToMax'
      ? { minN: preloadN, maxN: preloadN * alphaA }
      : { minN: preloadN / Math.sqrt(alphaA), maxN: preloadN * Math.sqrt(alphaA) };

  const preloadPercentOfProof = (preloadN / (propertyClass.proofStrengthMPa * size.tensileStressAreaMm2)) * 100;

  const baseline = computeStressChecks(
    preloadN,
    input.externalAxialLoadN,
    jointStiffnessC,
    clampedSections,
    headBearingDiameterMm,
    nutBearingDiameterMm,
    input.threadEngagementMode,
    propertyClass.proofStrengthMPa,
    size.tensileStressAreaMm2,
    input.safetyFactorTarget
  );
  const {
    boltForceUnderLoadN,
    memberForceUnderLoadN,
    jointSeparationMarginN,
    jointSeparates,
    boltTensileStressMPa,
    boltStressSafetyFactor,
    boltStressPass,
    memberBearingStressMPa,
    memberBearingSafetyFactor,
    memberBearingPass,
  } = baseline;

  // Thermal effects: differential expansion between the bolt and clamped stack
  // (assembly -> operating temperature) adds/removes clamping force via the same
  // combined-stiffness relationship used for the turn-of-nut angle effect. Standard
  // bolted-joint thermal-loading treatment (VDI 2230's own approach), not a novel
  // derivation.
  let thermalResult: BoltedJointResult['thermalResult'] = null;
  if (input.thermal) {
    const deltaT = input.thermal.operatingTempC - input.thermal.assemblyTempC;
    const membersFreeExpansionMm =
      clampedSections.reduce((sum, section) => sum + resolveSectionMaterial(section).thermalExpansionPerC * section.thicknessMm, 0) * deltaT;
    const boltFreeExpansionMm = input.thermal.boltThermalExpansionPerC * totalGripMm * deltaT;
    const deltaForceN = combinedStiffnessNPerMm * (membersFreeExpansionMm - boltFreeExpansionMm);
    const thermalPreloadN = preloadN + deltaForceN;
    const thermalChecks = computeStressChecks(
      thermalPreloadN,
      input.externalAxialLoadN,
      jointStiffnessC,
      clampedSections,
      headBearingDiameterMm,
      nutBearingDiameterMm,
      input.threadEngagementMode,
      propertyClass.proofStrengthMPa,
      size.tensileStressAreaMm2,
      input.safetyFactorTarget
    );
    thermalResult = {
      deltaForceN,
      preloadN: thermalPreloadN,
      boltStressSafetyFactor: thermalChecks.boltStressSafetyFactor,
      boltStressPass: thermalChecks.boltStressPass,
      memberBearingSafetyFactor: thermalChecks.memberBearingSafetyFactor,
      memberBearingPass: thermalChecks.memberBearingPass,
      jointSeparates: thermalChecks.jointSeparates,
      overallPass: thermalChecks.boltStressPass && thermalChecks.memberBearingPass.every(Boolean) && !thermalChecks.jointSeparates,
    };
  }

  let threadShearCheck: BoltedJointResult['threadShearCheck'] = null;
  const geometryValidity = checkGeometryValidity(input);
  geometryValidity.frustumBaseExceedsMemberOdWarning = exceedsMemberOd;

  if (input.threadEngagementMode !== 'nutAndBolt') {
    threadShearCheck = {
      requiredEngagementMm: geometryValidity.minEngagementLengthMm,
      providedEngagementMm: input.engagementLengthMm ?? 0,
      pass: geometryValidity.engagementLengthOk,
    };
  }

  const overallPass =
    boltStressPass &&
    memberBearingPass.every(Boolean) &&
    (threadShearCheck ? threadShearCheck.pass : true) &&
    geometryValidity.holeClearanceOk &&
    geometryValidity.gripLengthExceedsFastenerOk &&
    !jointSeparates &&
    (thermalResult ? thermalResult.overallPass : true);

  return {
    boltSegments,
    kBoltNPerMm,
    frustumSegments,
    kMembersNPerMm,
    jointStiffnessC,
    preloadN,
    torqueNm,
    torqueBreakdown,
    simplifiedKFactor,
    combinedStiffnessNPerMm,
    angleInducedForceN,
    yieldOnsetTorqueNm,
    yieldOnsetAngleDegFromSnug,
    springWasherStiffnessNPerMm,
    preloadScatterBand,
    preloadPercentOfProof,
    boltForceUnderLoadN,
    memberForceUnderLoadN,
    jointSeparationMarginN,
    jointSeparates,
    boltTensileStressMPa,
    boltStressSafetyFactor,
    boltStressPass,
    memberBearingStressMPa,
    memberBearingSafetyFactor,
    memberBearingPass,
    threadShearCheck,
    geometryValidity,
    overallPass,
    thermalResult,
  };
}
