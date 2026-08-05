// EMC shielding effectiveness for a solid planar barrier — the classical Schelkunoff
// decomposition SE = A + R + B (all dB):
//
//  A (absorption loss): the field decays exponentially through the barrier's thickness,
//    A = 8.686·(t/δ), where δ is the classical skin depth. Reuses this project's existing
//    skinDepthPhysics.ts directly (same material presets, same formula) rather than
//    re-deriving skin depth — a barrier absorbs exactly as fast as it conducts.
//
//  R (reflection loss): set by the impedance mismatch between the incident wave and the
//    barrier, R = 20·log10(Zw / (4·|Zs|)), where |Zs| = sqrt(ωμ/σ) is the shield's own
//    intrinsic (surface) impedance and Zw is the wave impedance of the *source field* —
//    377Ω for a far-field plane wave, but distance- and frequency-dependent in the near
//    field: ZwE = 1/(2πfε0r) for a high-impedance electric-dipole-like source (e.g. a
//    high-voltage, low-current PCB trace), ZwH = 2πfμ0r for a low-impedance
//    magnetic-dipole-like source (e.g. a current loop or busbar) — both from the standard
//    near-field wave-impedance formulas (LearnEMC eq. 26/27), each valid at distance r from
//    the source. This single Zw/Zs-ratio form is the "precise" formulation (matches the
//    LearnEMC and Clemson CVEL online SE calculators) and unifies far-field/near-field
//    into one formula, rather than the older set of separate empirical constants
//    (168/322/14.6) some references use for the same physics.
//
//  B (multiple-reflection correction): only material for thin/high-frequency barriers
//    where A < ~15dB (re-reflections inside the barrier haven't fully decayed before
//    reaching the far face); becomes negligible (→0dB) for thick low-frequency barriers.
//    Uses the standard closed form B = min(0, 10·log10((1−x·cosθ)² + (x·sinθ)²)) with
//    x = 10^(−A/10), θ = 0.23026·A — algebraically equivalent to LearnEMC's
//    reflection-coefficient/e^(−2γt) form (both were cross-checked to agree).
//
// Sources cross-checked: calcengineer.com's EMI Shielding Effectiveness calculator (gives
// the full Zw/Zs formula set with explicit units) and learnemc.com/shielding-theory
// (Ott/Schelkunoff's textbook equations) — the two were independently dimensionally
// reconciled (Zw formulas, shield-impedance formula, and the B correction all reduce to
// the same expressions) before implementing here.

import { skinDepthMm, MU0 } from './skinDepthPhysics';

export const Z0_FREE_SPACE_OHM = 376.730313668; // Ω, sqrt(μ0/ε0) — far-field plane-wave wave impedance
const EPS0 = 8.8541878128e-12; // F/m

export type SourceType = 'planeWave' | 'electricNearField' | 'magneticNearField';

export interface ShieldingInput {
  thicknessMm: number;
  frequencyHz: number;
  rhoOhmMm2PerM: number; // material resistivity (Ω·mm²/m), same convention as skinDepthPhysics presets
  muR: number;
  sourceType: SourceType;
  distanceMm: number; // distance from source to shield — only used for the two near-field source types
}

export interface ShieldingResult {
  skinDepthMmValue: number;
  absorptionLossDb: number;
  shieldImpedanceOhm: number;
  waveImpedanceOhm: number;
  reflectionLossDb: number;
  multiReflectionCorrectionDb: number;
  totalSeDb: number;
  thinBarrierWarning: boolean; // |B| is non-negligible (A < 15dB) — multiple reflections matter
}

/** Wave impedance of the source field at the shield, Ω. Far field: constant 377Ω.
 *  Near field: distance- and frequency-dependent, per LearnEMC eq. 26 (electric dipole)
 *  and eq. 27 (magnetic dipole). */
export function waveImpedanceOhm(sourceType: SourceType, frequencyHz: number, distanceMm: number): number {
  if (sourceType === 'planeWave') return Z0_FREE_SPACE_OHM;
  const distanceM = distanceMm / 1000;
  if (distanceM <= 0 || frequencyHz <= 0) return Z0_FREE_SPACE_OHM;
  const omega = 2 * Math.PI * frequencyHz;
  if (sourceType === 'electricNearField') return 1 / (omega * EPS0 * distanceM);
  return omega * MU0 * distanceM; // magneticNearField
}

/** Shield's own intrinsic (surface) impedance |Zs| = sqrt(ωμ/σ), Ω. */
export function shieldImpedanceOhm(rhoOhmMm2PerM: number, frequencyHz: number, muR: number): number {
  if (frequencyHz <= 0 || rhoOhmMm2PerM <= 0) return Infinity;
  const rhoOhmM = rhoOhmMm2PerM * 1e-6;
  const sigma = 1 / rhoOhmM; // S/m
  const omega = 2 * Math.PI * frequencyHz;
  const mu = MU0 * Math.max(muR, 1e-6);
  return Math.sqrt((omega * mu) / sigma);
}

export function solveShieldingEffectiveness(input: ShieldingInput): ShieldingResult {
  const skinDepthMmValue = skinDepthMm(input.rhoOhmMm2PerM, input.frequencyHz, input.muR);
  const absorptionLossDb = isFinite(skinDepthMmValue) && skinDepthMmValue > 0
    ? 8.686 * (input.thicknessMm / skinDepthMmValue)
    : 0;

  const zs = shieldImpedanceOhm(input.rhoOhmMm2PerM, input.frequencyHz, input.muR);
  const zw = waveImpedanceOhm(input.sourceType, input.frequencyHz, input.distanceMm);
  const reflectionLossDb = isFinite(zs) && zs > 0
    ? Math.max(0, 20 * Math.log10(zw / (4 * zs)))
    : 0;

  const x = Math.pow(10, -absorptionLossDb / 10);
  const theta = 0.23026 * absorptionLossDb;
  const multiReflectionCorrectionDb = Math.min(
    0,
    10 * Math.log10(Math.pow(1 - x * Math.cos(theta), 2) + Math.pow(x * Math.sin(theta), 2)),
  );

  const totalSeDb = absorptionLossDb + reflectionLossDb + multiReflectionCorrectionDb;

  return {
    skinDepthMmValue,
    absorptionLossDb,
    shieldImpedanceOhm: zs,
    waveImpedanceOhm: zw,
    reflectionLossDb,
    multiReflectionCorrectionDb,
    totalSeDb,
    thinBarrierWarning: absorptionLossDb < 15,
  };
}

/** Convenience sweep for a frequency-vs-SE chart (premium). Log-spaced points from
 *  fMinHz to fMaxHz inclusive. */
export function sweepFrequency(
  input: Omit<ShieldingInput, 'frequencyHz'>,
  fMinHz: number,
  fMaxHz: number,
  points = 40,
): { frequencyHz: number; totalSeDb: number }[] {
  const logMin = Math.log10(Math.max(fMinHz, 1));
  const logMax = Math.log10(Math.max(fMaxHz, fMinHz + 1));
  const out: { frequencyHz: number; totalSeDb: number }[] = [];
  for (let i = 0; i < points; i++) {
    const logF = logMin + ((logMax - logMin) * i) / (points - 1);
    const frequencyHz = Math.pow(10, logF);
    out.push({ frequencyHz, totalSeDb: solveShieldingEffectiveness({ ...input, frequencyHz }).totalSeDb });
  }
  return out;
}
