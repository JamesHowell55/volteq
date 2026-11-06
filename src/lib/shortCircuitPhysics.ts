// Prospective short-circuit (fault) current by Ohm's Law: I = V / Z, where Z is the
// total impedance of the fault loop from the source to the fault. Impedances in
// series add as complex numbers (R + jX), so the magnitude is |Z| = √(R² + X²).
//
//   three-phase (balanced, bolted)  I″k = c · V_LL / (√3 · |Z|)   — Z is the per-phase impedance
//   single-phase                    I″k = c · V / |Z_loop|         — loop includes the return conductor
//   DC                              I   = V / R                    — reactance does not apply
//
// c is the voltage factor (1.00 = plain Ohm's Law; IEC 60909 uses c_max = 1.05 or
// 1.10 for LV maximum-current calculations). The peak (first half-cycle) current
// uses the IEC 60909-0 factor κ = 1.02 + 0.98·e^(−3R/X), which applies to a
// single non-meshed fault path.

export type SystemType = 'three_phase' | 'single_phase' | 'dc';

export interface Impedance {
  r: number; // Ω
  x: number; // Ω
}

export const ZERO_Z: Impedance = { r: 0, x: 0 };

export function addZ(a: Impedance, b: Impedance): Impedance {
  return { r: a.r + b.r, x: a.x + b.x };
}

export function zMagnitude(z: Impedance): number {
  return Math.hypot(z.r, z.x);
}

/** Split an impedance magnitude into R and X from its X/R ratio. */
export function impedanceFromMagnitude(zOhm: number, xOverR: number): Impedance {
  const k = Math.max(xOverR, 0);
  const r = zOhm / Math.sqrt(1 + k * k);
  return { r, x: r * k };
}

/** Base impedance V²/S of a transformer or source (works for 1-phase V,S and 3-phase V_LL,S). */
export function baseImpedanceOhm(voltageV: number, sVA: number): number {
  return (voltageV * voltageV) / sVA;
}

/** Transformer impedance referred to the secondary: Z = (Z% / 100) · V²/S. */
export function transformerImpedance(sVA: number, secondaryV: number, zPercent: number, xOverR: number): Impedance {
  return impedanceFromMagnitude((zPercent / 100) * baseImpedanceOhm(secondaryV, sVA), xOverR);
}

/** Transformer full-load secondary current. */
export function transformerFullLoadA(sVA: number, secondaryV: number, system: SystemType): number {
  return system === 'three_phase' ? sVA / (Math.sqrt(3) * secondaryV) : sVA / secondaryV;
}

/** Upstream network from its short-circuit level S_k: Z = V²/S_k. */
export function utilityImpedance(skVA: number, voltageV: number, xOverR: number): Impedance {
  return impedanceFromMagnitude(baseImpedanceOhm(voltageV, skVA), xOverR);
}

/** ρ(θ) = ρ₂₀ · (β + θ) / (β + 20), same convention as the Busbar and Skin Depth calculators. */
export function resistivityAt(rho20OhmMm2PerM: number, beta: number, tempC: number): number {
  return rho20OhmMm2PerM * (beta + tempC) / (beta + 20);
}

export interface CableRunInput {
  lengthM: number;
  areaMm2: number;
  parallelConductors: number;
  rhoOhmMm2PerM: number; // already corrected to the chosen temperature
  reactanceOhmPerKm: number;
}

/**
 * Impedance of a cable run for ONE conductor path. R = ρ·L/(A·n), X = x'·L/n.
 * For single-phase and DC faults the current also returns on a conductor of the
 * same size, so the caller multiplies by `loopFactor` = 2.
 */
export function cableRunImpedance(c: CableRunInput, loopFactor: 1 | 2): Impedance {
  const n = Math.max(Math.round(c.parallelConductors), 1);
  const r = (c.rhoOhmMm2PerM * c.lengthM) / (c.areaMm2 * n);
  const x = (c.reactanceOhmPerKm * (c.lengthM / 1000)) / n;
  return { r: r * loopFactor, x: x * loopFactor };
}

/** Prospective symmetrical fault current (A, rms for AC). */
export function faultCurrentA(voltageV: number, z: Impedance, system: SystemType, c = 1): number {
  if (system === 'dc') return z.r > 0 ? voltageV / z.r : Infinity;
  const zm = zMagnitude(z);
  if (!(zm > 0)) return Infinity;
  return system === 'three_phase' ? (c * voltageV) / (Math.sqrt(3) * zm) : (c * voltageV) / zm;
}

/** Fault level S_k in VA (AC) or W (DC). */
export function faultPowerVA(voltageV: number, faultA: number, system: SystemType): number {
  return system === 'three_phase' ? Math.sqrt(3) * voltageV * faultA : voltageV * faultA;
}

/** IEC 60909-0 peak factor κ = 1.02 + 0.98·e^(−3R/X); tends to 2 as R/X → 0 and to 1.02 as X/R → 0. */
export function peakFactorKappa(z: Impedance): number {
  if (!(z.x > 0)) return 1.02;
  if (!(z.r > 0)) return 2;
  return 1.02 + 0.98 * Math.exp((-3 * z.r) / z.x);
}

/** Peak first-half-cycle current i_p = κ·√2·I″k. */
export function peakCurrentA(symmetricalA: number, kappa: number): number {
  return kappa * Math.SQRT2 * symmetricalA;
}
