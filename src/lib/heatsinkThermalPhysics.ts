// Heatsink / junction-to-ambient thermal — pairs with the MOSFET Loss calculator
// (feed a device's dissipated power in, get the sink thermal budget or a sized
// fin-array's resulting junction temperature out).
//
// Two independent solves:
//
//  1. Rth budget (free): plain series thermal-resistance algebra —
//     Tj = Ta + P·(Rjc + Rcs + Rsa) — either solving for the max Rsa the budget
//     allows, or checking a candidate Rsa against Tj_max. TIM (case-to-sink)
//     resistance can optionally be derived from a pad thickness/conductivity/area
//     via the same t/(k·A) idiom already used for COATING_PRESETS/TIM_PRESETS.
//
//  2. Fin-array natural convection (premium): sizes an extruded rectangular-fin
//     heatsink. Each inter-fin gap is treated as an isolated vertical flat plate
//     (Churchill-Chu correlation, Incropera Eq. 9.26 — the vertical-plate analog
//     of the horizontal-cylinder correlation already used in cableSizingPhysics.ts,
//     same functional form with 0.825/0.492 in place of 0.6/0.559) — a disclosed
//     simplification that ignores inter-fin channeling (the Elenbaas/Bar-Cohen
//     effect that reduces h at very tight spacing). It is accurate for the
//     commonly-cited near-optimal spacing range (~6-12mm) and above; a warning
//     flag is raised below that range where channeling would matter and this
//     model over-predicts h. Fin efficiency uses the standard rectangular-fin,
//     adiabatic-tip-corrected-length formula (Incropera Table 3.5:
//     Lc = L + t/2, m = sqrt(2h/(k·t)), η = tanh(mLc)/(mLc)). Radiation reuses
//     this project's existing Stefan-Boltzmann treatment (busbarPhysics.ts),
//     applied over the same effective area as a disclosed simplification (exact
//     per-fin radiation view-factor/local-temperature modelling is out of scope).
//     Base temperature is solved by bisection so the model works forward
//     (geometry -> resulting Rsa/Tj) without assuming linearity.

import { airProperties, GRAVITY } from './cableSizingPhysics';
import { STEFAN_BOLTZMANN } from './busbarPhysics';
import type { TimPreset } from './materials';

// ---------- 1. Rth budget (free) ----------

export interface RthBudgetInput {
  pLossW: number;
  tjMaxC: number;
  ambientTempC: number;
  rthJcKPerW: number;
  rthCsKPerW: number;
  actualRthSaKPerW: number; // 0 => required-Rsa-only mode, no margin check
}

export interface RthBudgetResult {
  totalRthAllowedKPerW: number; // (Tj_max - Ta) / P — the whole junction-to-ambient budget
  requiredRthSaKPerW: number;   // budget left over for the sink after Rjc + Rcs
  resultingTjC: number | null;
  marginC: number | null;       // Tj_max - resultingTj; negative = over budget
  pass: boolean | null;
}

export function solveRthBudget(input: RthBudgetInput): RthBudgetResult {
  const totalRthAllowedKPerW = input.pLossW > 0
    ? (input.tjMaxC - input.ambientTempC) / input.pLossW
    : Infinity;
  const requiredRthSaKPerW = totalRthAllowedKPerW - input.rthJcKPerW - input.rthCsKPerW;

  let resultingTjC: number | null = null;
  let marginC: number | null = null;
  let pass: boolean | null = null;
  if (input.actualRthSaKPerW > 0) {
    const totalRth = input.rthJcKPerW + input.rthCsKPerW + input.actualRthSaKPerW;
    resultingTjC = input.ambientTempC + input.pLossW * totalRth;
    marginC = input.tjMaxC - resultingTjC;
    pass = resultingTjC <= input.tjMaxC;
  }

  return { totalRthAllowedKPerW, requiredRthSaKPerW, resultingTjC, marginC, pass };
}

/** TIM (case-to-sink) conduction resistance from pad thickness/conductivity/contact area — same t/(k·A) idiom as COATING_PRESETS. */
export function timResistanceKPerW(tim: TimPreset, contactAreaMm2: number): number {
  if (contactAreaMm2 <= 0) return 0;
  const areaM2 = contactAreaMm2 * 1e-6;
  return (tim.thicknessMm * 1e-3) / (tim.thermalConductivity * areaM2);
}

// ---------- 2. Fin-array natural convection sizing (premium) ----------

export interface ConvectionResult {
  h: number; // W/(m²K)
  nusselt: number;
  rayleigh: number;
}

// Churchill-Chu correlation for a vertical isothermal plate (Incropera Eq. 9.26),
// valid for all Ra_L. Same air-property table and functional form as the
// horizontal-cylinder correlation in cableSizingPhysics.ts, with the vertical-
// plate constants (0.825, 0.492) in place of the cylinder's (0.6, 0.559).
export function verticalPlateConvection(surfaceTempC: number, ambientTempC: number, heightM: number): ConvectionResult {
  const deltaT = Math.max(surfaceTempC - ambientTempC, 0.001);
  const filmTempC = (surfaceTempC + ambientTempC) / 2;
  const filmTempK = filmTempC + 273.15;
  const { nu, k, pr } = airProperties(filmTempC);
  const beta = 1 / filmTempK;
  const rayleigh = (GRAVITY * beta * deltaT * heightM ** 3 * pr) / (nu * nu);
  const denom = Math.pow(1 + Math.pow(0.492 / pr, 9 / 16), 8 / 27);
  const nusselt = Math.pow(0.825 + (0.387 * Math.pow(rayleigh, 1 / 6)) / denom, 2);
  const h = (nusselt * k) / heightM;
  return { h, nusselt, rayleigh };
}

/** Rectangular-fin efficiency, adiabatic-tip-corrected length (Incropera Table 3.5). */
export function finEfficiency(hWPerM2K: number, kFinWPerMK: number, finThicknessM: number, finHeightM: number): { eta: number; m: number; lc: number } {
  const lc = finHeightM + finThicknessM / 2;
  const m = Math.sqrt((2 * hWPerM2K) / (kFinWPerMK * finThicknessM));
  const mlc = m * lc;
  const eta = mlc > 0 ? Math.tanh(mlc) / mlc : 1;
  return { eta, m, lc };
}

export interface FinArrayInput {
  finHeightMm: number;   // vertical extent (convection characteristic length & fin length)
  finThicknessMm: number;
  finSpacingMm: number;  // gap between adjacent fins
  finCountN: number;
  finDepthMm: number;    // extent along the base (adds area; not in the convection correlation)
  finThermalConductivityWPerMK: number;
  emissivity: number;
  ambientTempC: number;
  pLossW: number;
}

export interface FinArrayResult {
  baseWidthMm: number;
  finRawAreaM2: number;     // both sides of all fins, corrected length (Lc), before efficiency
  exposedBaseAreaM2: number;
  effectiveAreaM2: number;  // efficiency-weighted fin area + exposed base area, used for both convection and radiation
  finEfficiency: number;
  baseTempC: number;
  convection: ConvectionResult;
  radiationCoeffWPerM2K: number;
  rthSaKPerW: number;
  tightSpacingWarning: boolean; // spacing below ~6mm: isolated-plate model likely over-predicts h (channeling not modelled)
}

export function solveFinArrayNaturalConvection(input: FinArrayInput): FinArrayResult {
  const n = Math.max(1, Math.round(input.finCountN));
  const heightM = input.finHeightMm / 1000;
  const thicknessM = input.finThicknessMm / 1000;
  const spacingM = input.finSpacingMm / 1000;
  const depthM = input.finDepthMm / 1000;

  const baseWidthMm = n * input.finThicknessMm + (n - 1) * input.finSpacingMm;
  const exposedBaseAreaM2 = Math.max(n - 1, 0) * spacingM * depthM;

  let baseTempC = input.ambientTempC + 10;
  let convection: ConvectionResult = { h: 0, nusselt: 0, rayleigh: 0 };
  let effectiveAreaM2 = 0;
  let finArrayEta = 1;
  let finRawAreaM2 = 0;
  let radiationCoeffWPerM2K = 0;

  let lo = input.ambientTempC + 0.001;
  let hi = input.ambientTempC + 300;
  for (let i = 0; i < 60; i++) {
    baseTempC = (lo + hi) / 2;
    convection = verticalPlateConvection(baseTempC, input.ambientTempC, heightM);
    finArrayEta = finEfficiency(convection.h, input.finThermalConductivityWPerMK, thicknessM, heightM).eta;
    const lcM = heightM + thicknessM / 2;
    finRawAreaM2 = n * 2 * lcM * depthM;
    effectiveAreaM2 = finArrayEta * finRawAreaM2 + exposedBaseAreaM2;

    const ts = baseTempC + 273.15;
    const ta = input.ambientTempC + 273.15;
    radiationCoeffWPerM2K = input.emissivity * STEFAN_BOLTZMANN * (ts * ts + ta * ta) * (ts + ta);

    const qConvW = convection.h * effectiveAreaM2 * (baseTempC - input.ambientTempC);
    const qRadW = radiationCoeffWPerM2K * effectiveAreaM2 * (baseTempC - input.ambientTempC);
    const qTotalW = qConvW + qRadW;

    if (qTotalW > input.pLossW) hi = baseTempC; else lo = baseTempC;
  }

  const rthSaKPerW = input.pLossW > 0 ? (baseTempC - input.ambientTempC) / input.pLossW : Infinity;

  return {
    baseWidthMm,
    finRawAreaM2,
    exposedBaseAreaM2,
    effectiveAreaM2,
    finEfficiency: finArrayEta,
    baseTempC,
    convection,
    radiationCoeffWPerM2K,
    rthSaKPerW,
    tightSpacingWarning: input.finSpacingMm < 6,
  };
}
