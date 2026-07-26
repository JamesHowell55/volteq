// Heat Exchanger Sizing — liquid-to-air core (radiator / oil cooler / chiller core style).
//
// Method: effectiveness-NTU, crossflow with both fluids unmixed (Incropera Table 11.4
// approximation) — the standard closed-form method for a single-pass finned-tube/microchannel
// core, confirmed via multiple independent sources.
//
// Convection treatment — a DELIBERATE, DISCLOSED SIMPLIFICATION: the industry-standard approach
// for real finned-tube heat exchanger design (Zukauskas tube-bank correlation + Kays & London
// empirical fin-surface j/f data) requires large multi-row empirical tables (C/m constants per
// Reynolds range x tube arrangement, row-count correction factors) that could not be reliably
// sourced and independently verified this session (repeated attempts to pull clean tabular data
// from published sources failed). Rather than hardcode those specific numbers from memory with
// real hallucination risk on a rigor-critical feature, this file instead treats BOTH the air-side
// fin channels and the coolant-side tubes/ports as simple ducts, using two independently-verified,
// textbook-standard correlations for both sides:
//   - Turbulent (Re >= 2300): Dittus-Boelter, Nu = 0.023*Re^0.8*Pr^n (n=0.4 heating / 0.3 cooling).
//   - Laminar (Re < 2300, simple threshold switch, not the more complex Gnielinski transitional
//     correlation): fixed fully-developed Nu = 3.66 (circular duct / port) or 7.54 (wide
//     parallel-plate fin channel) — Incropera Table 8.1, confirmed via multiple sources.
// This is a reasonable first-pass sizing accuracy trade-off, not a claim of Kays-London-grade
// surface-specific accuracy — disclosed in the calculator's Reference & assumptions card.
//
// Fin efficiency reuses the existing validated straight-fin formula (heatsinkThermalPhysics.ts)
// with an equivalent length = half the tube/port row pitch minus half the row's own blocking
// dimension (adiabatic-tip symmetry between two rows) — a disclosed simplification of the true
// annular/sector-fin problem around a round tube.
//
// The "louvered fin" core type applies one further disclosed simplification: rather than the full
// multi-parameter Chang & Wang louver correlation (needs louver angle/pitch data not reliably
// sourced this session), it applies a literature-cited typical air-side h enhancement multiplier
// (published experimental comparisons report roughly 2-3x, 2.2-2.8x across tested Reynolds ranges,
// for louvered vs. plain fins) on top of the same base duct-flow physics — same "borrow a
// documented range as a disclosed simplification" idiom already used for the bundling-derating
// table in cableSizingPhysics.ts.

import { airProperties } from './cableSizingPhysics';
import { finEfficiency } from './heatsinkThermalPhysics';
import type { HxCoreGeometryResult } from './hxCoreGeometry';

export const AIR_CP_J_PER_KGK = 1007; // dry air, typical automotive-relevant temperature range

// Ideal-gas air density — an independently-verifiable identity (R_specific,air = 287.05 J/kg-K,
// P = 101325 Pa standard atmosphere), not a lookup: gives ~1.225 kg/m3 at 15C, the standard ISA
// sea-level reference value.
export function airDensityKgPerM3(tempC: number): number {
  return 101325 / (287.05 * (tempC + 273.15));
}

export interface CoolantTransport {
  nu: number; // m^2/s
  k: number;  // W/(m*K)
  pr: number;
}

// Water: Incropera Table A.6 saturated-liquid values, linearly interpolated (same idiom as
// cableSizingPhysics.ts's airProperties table) and clamped at the ends.
const WATER_TRANSPORT_POINTS: { tC: number; nu: number; k: number; pr: number }[] = [
  { tC: 0, nu: 1.750e-6, k: 0.569, pr: 12.99 },
  { tC: 20, nu: 1.004e-6, k: 0.598, pr: 7.01 },
  { tC: 40, nu: 0.658e-6, k: 0.628, pr: 4.34 },
  { tC: 60, nu: 0.474e-6, k: 0.654, pr: 2.98 },
  { tC: 80, nu: 0.365e-6, k: 0.670, pr: 2.22 },
  { tC: 100, nu: 0.294e-6, k: 0.679, pr: 1.75 },
];

// glycol50/oil: single representative point (typical 50/50 ethylene-glycol/water and typical
// dielectric/transformer oil, respectively), NOT temperature-interpolated — disclosed as "typical,
// user-editable" in the UI, same idiom as this project's other coarse material presets
// (TIM_PRESETS, COATING_PRESETS in materials.ts).
const GLYCOL50_TRANSPORT: CoolantTransport = { nu: 3.0e-6, k: 0.40, pr: 26.2 };
const OIL_TRANSPORT: CoolantTransport = { nu: 12.0e-6, k: 0.13, pr: 150.8 };

export function coolantTransportProperties(coolantId: string, tempC: number): CoolantTransport {
  if (coolantId === 'glycol50') return GLYCOL50_TRANSPORT;
  if (coolantId === 'oil') return OIL_TRANSPORT;
  const pts = WATER_TRANSPORT_POINTS;
  if (tempC <= pts[0].tC) return { nu: pts[0].nu, k: pts[0].k, pr: pts[0].pr };
  if (tempC >= pts[pts.length - 1].tC) return { nu: pts[pts.length - 1].nu, k: pts[pts.length - 1].k, pr: pts[pts.length - 1].pr };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (tempC >= a.tC && tempC <= b.tC) {
      const t = (tempC - a.tC) / (b.tC - a.tC);
      return { nu: a.nu + t * (b.nu - a.nu), k: a.k + t * (b.k - a.k), pr: a.pr + t * (b.pr - a.pr) };
    }
  }
  return { nu: pts[0].nu, k: pts[0].k, pr: pts[0].pr };
}

export interface DuctConvectionResult {
  reynolds: number;
  nusselt: number;
  h: number;
  regime: 'laminar' | 'turbulent';
}

const RE_LAMINAR_TURBULENT_THRESHOLD = 2300;

// Shared forced-convection duct correlation for both the air side (through fin channels) and the
// coolant side (through tubes/ports) — see file header for the full disclosure of this treatment.
export function ductConvection(
  velocityMPerS: number, dhM: number, nu: number, k: number, pr: number,
  laminarNusselt: number, turbulentPrExponent: number,
): DuctConvectionResult {
  const reynolds = dhM > 0 && nu > 0 ? (velocityMPerS * dhM) / nu : 0;
  const turbulent = reynolds >= RE_LAMINAR_TURBULENT_THRESHOLD;
  const nusselt = turbulent
    ? 0.023 * Math.pow(reynolds, 0.8) * Math.pow(pr, turbulentPrExponent)
    : laminarNusselt;
  const h = dhM > 0 ? (nusselt * k) / dhM : 0;
  return { reynolds, nusselt, h, regime: turbulent ? 'turbulent' : 'laminar' };
}

// Effectiveness-NTU, crossflow, both fluids unmixed (Incropera Table 11.4 approximation).
// Cr=0 reduces exactly to the exact closed-form 1-exp(-NTU) identity (used in validation).
export function effectivenessCrossflowBothUnmixed(ntu: number, cr: number): number {
  if (ntu <= 0) return 0;
  if (cr <= 0) return 1 - Math.exp(-ntu);
  return 1 - Math.exp((1 / cr) * Math.pow(ntu, 0.22) * (Math.exp(-cr * Math.pow(ntu, 0.78)) - 1));
}

export interface HeatExchangerInput {
  geometry: HxCoreGeometryResult;
  finThermalConductivityWPerMK: number;
  louverEnhancementFactor: number; // 1.0 for non-louvered core types
  coolant: { densityKgPerM3: number; specificHeatJPerKgK: number; nu: number; k: number; pr: number };
  coolantInletTempC: number;
  coolantFlowRateLPerMin: number;
  airInletTempC: number;
  airFaceVelocityMPerS: number;
}

export interface HeatExchangerResult {
  airMassFlowKgPerS: number;
  coolantMassFlowKgPerS: number;
  airChannelVelocityMPerS: number;
  coolantChannelVelocityMPerS: number;
  air: DuctConvectionResult;
  airHEnhancedWPerM2K: number;
  coolantSide: DuctConvectionResult;
  airFinEfficiency: number;
  airSideEffectiveAreaM2: number;
  uaWPerK: number;
  cAirWPerK: number;
  cCoolantWPerK: number;
  cMinWPerK: number;
  cMaxWPerK: number;
  crRatio: number;
  ntu: number;
  effectiveness: number;
  heatRejectedW: number;
  coolantOutletTempC: number;
  airOutletTempC: number;
}

// Pure forward solve — no iteration needed (unlike the Heatsink calculator's base-temperature
// bisection): effectiveness-NTU is closed-form once UA is known, and properties are evaluated at
// the known inlet temperatures rather than an unknown surface temperature.
export function solveHeatExchanger(input: HeatExchangerInput): HeatExchangerResult {
  const g = input.geometry;

  const rhoAir = airDensityKgPerM3(input.airInletTempC);
  const airMassFlowKgPerS = rhoAir * input.airFaceVelocityMPerS * g.frontalAreaM2;
  // L/min -> m^3/s -> kg/s, same idiom as busbarPhysics.ts's coolantTemperatureRiseK.
  const coolantMassFlowKgPerS = (input.coolantFlowRateLPerMin / 60000) * input.coolant.densityKgPerM3;

  const airChannelVelocityMPerS = g.sigma > 0 ? input.airFaceVelocityMPerS / g.sigma : 0;
  const coolantChannelVelocityMPerS = g.coolantFlowAreaM2 > 0
    ? coolantMassFlowKgPerS / (input.coolant.densityKgPerM3 * g.coolantFlowAreaM2)
    : 0;

  const { nu: airNu, k: airK, pr: airPr } = airProperties(input.airInletTempC);
  const air = ductConvection(airChannelVelocityMPerS, g.airDuctDhM, airNu, airK, airPr, 7.54, 0.4);
  const airHEnhancedWPerM2K = air.h * input.louverEnhancementFactor;

  const coolantSide = ductConvection(
    coolantChannelVelocityMPerS, g.coolantDuctDhM,
    input.coolant.nu, input.coolant.k, input.coolant.pr, 3.66, 0.3,
  );

  const { eta: airFinEfficiency } = finEfficiency(
    airHEnhancedWPerM2K, input.finThermalConductivityWPerMK, g.airFinThicknessM, g.airFinEquivHeightM,
  );
  const airSideEffectiveAreaM2 = airFinEfficiency * g.airFinRawAreaM2;

  // Plain two-resistance series network — tube/fin wall conduction neglected (thin metal, 1-2
  // orders of magnitude below either convective film resistance), disclosed simplification.
  const uaWPerK = 1 / (
    1 / (airHEnhancedWPerM2K * airSideEffectiveAreaM2) + 1 / (coolantSide.h * g.coolantWettedAreaM2)
  );

  const cAirWPerK = airMassFlowKgPerS * AIR_CP_J_PER_KGK;
  const cCoolantWPerK = coolantMassFlowKgPerS * input.coolant.specificHeatJPerKgK;
  const cMinWPerK = Math.min(cAirWPerK, cCoolantWPerK);
  const cMaxWPerK = Math.max(cAirWPerK, cCoolantWPerK);
  const crRatio = cMaxWPerK > 0 ? cMinWPerK / cMaxWPerK : 0;
  const ntu = cMinWPerK > 0 ? uaWPerK / cMinWPerK : 0;
  const effectiveness = effectivenessCrossflowBothUnmixed(ntu, crRatio);

  const heatRejectedW = effectiveness * cMinWPerK * (input.coolantInletTempC - input.airInletTempC);
  const coolantOutletTempC = cCoolantWPerK > 0 ? input.coolantInletTempC - heatRejectedW / cCoolantWPerK : input.coolantInletTempC;
  const airOutletTempC = cAirWPerK > 0 ? input.airInletTempC + heatRejectedW / cAirWPerK : input.airInletTempC;

  return {
    airMassFlowKgPerS, coolantMassFlowKgPerS, airChannelVelocityMPerS, coolantChannelVelocityMPerS,
    air, airHEnhancedWPerM2K, coolantSide, airFinEfficiency, airSideEffectiveAreaM2,
    uaWPerK, cAirWPerK, cCoolantWPerK, cMinWPerK, cMaxWPerK, crRatio, ntu, effectiveness,
    heatRejectedW, coolantOutletTempC, airOutletTempC,
  };
}
