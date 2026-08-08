// Flow in pipes / coolant pump sizing — the pressure drop of a liquid flowing
// through a pipe (or hose) run, and the pump head/power needed to drive it.
// Completes this project's liquid-cooling loop alongside the Heatsink Thermal
// and Heat Exchanger Sizing calculators (size the cooler; then size the pump
// and plumbing that feeds it).
//
// Method — textbook incompressible-pipe-flow:
//  • Reynolds number Re = v·D/ν (ν kinematic viscosity). Kinematic viscosity is
//    reused directly from the Heat Exchanger calculator's coolant transport
//    table (heatExchangerPhysics.ts) so the two tools agree on fluid data;
//    density is added here (pressure drop is density-driven where Reynolds is
//    not).
//  • Darcy friction factor f:
//      - laminar (Re < 2300): f = 64/Re (exact for fully-developed laminar flow);
//      - turbulent (Re ≥ 4000): Swamee-Jain explicit fit to Colebrook-White,
//        f = 0.25 / [log10(ε/(3.7·D) + 5.74/Re^0.9)]² (Swamee & Jain, ASCE J.
//        Hydraulics Div., 1976 — the standard explicit Moody-chart approximation);
//      - transitional (2300–4000): linearly interpolated between the two, a
//        disclosed idealization since real transitional flow is not predictable.
//  • Major (friction) pressure drop, Darcy-Weisbach:  ΔP = f·(L/D)·(ρ·v²/2).
//  • Minor (fitting) losses:  ΔP = ΣK·(ρ·v²/2), K the sum of fitting loss
//    coefficients (representative textbook/Crane TP-410 values; they vary by
//    source and manufacturer — use the manufacturer's K where available).
//  • Static head (elevation gain Δz):  ΔP = ρ·g·Δz.
//  • Pump duty: head H = ΔP_total/(ρ·g); hydraulic power P_hyd = ΔP_total·Q;
//    shaft power P_shaft = P_hyd/η_pump.
// Assumes a single uniform-diameter pipe, steady incompressible fully-developed
// flow, and Newtonian fluid — the standard scope for this kind of estimate.

import { coolantTransportProperties } from './heatExchangerPhysics';
import { COOLANT_PRESETS } from './materials';

export const GRAVITY = 9.80665; // m/s²

// Fluid properties reuse the app's existing coolant data so every tool agrees:
// density from materials.ts COOLANT_PRESETS (the same single-point values the
// Busbar and Heat Exchanger calculators use — representative, not temperature-
// interpolated), and kinematic viscosity ν from the Heat Exchanger transport
// table (temperature-interpolated for water). Density has a small (~4% over
// 0–100 °C) temperature dependence for water that this single-point value does
// not capture — disclosed in the calculator's reference notes.
export interface FluidProps {
  rho: number; // kg/m³
  nu: number;  // m²/s
}

export function fluidProperties(coolantId: string, tempC: number): FluidProps {
  const preset = COOLANT_PRESETS.find((p) => p.id === coolantId) ?? COOLANT_PRESETS[0];
  return { rho: preset.densityKgPerM3, nu: coolantTransportProperties(coolantId, tempC).nu };
}

// ── Pipe roughness (mm) ─────────────────────────────────────────────────────
// Classic Moody-chart absolute roughness values for new, clean pipe. Aged /
// corroded / scaled pipe can be far rougher — disclosed in the UI.
export const PIPE_ROUGHNESS_MM: { id: string; label: string; epsMm: number }[] = [
  { id: 'drawn', label: 'Drawn tubing (copper, aluminium, brass)', epsMm: 0.0015 },
  { id: 'plastic', label: 'Plastic (PVC, PE, PTFE) / glass', epsMm: 0.0015 },
  { id: 'stainless', label: 'Stainless steel', epsMm: 0.015 },
  { id: 'steel', label: 'Commercial / welded steel', epsMm: 0.046 },
  { id: 'galvanized', label: 'Galvanised steel', epsMm: 0.15 },
  { id: 'castiron', label: 'Cast iron', epsMm: 0.26 },
  { id: 'flexhose', label: 'Flexible rubber / reinforced hose', epsMm: 0.03 },
  { id: 'custom', label: 'Custom', epsMm: 0.0015 },
];

export function roughnessMm(id: string): number {
  return (PIPE_ROUGHNESS_MM.find((r) => r.id === id) ?? PIPE_ROUGHNESS_MM[0]).epsMm;
}

// ── Fitting minor-loss K coefficients ───────────────────────────────────────
// Representative textbook / Crane TP-410 values. Published K values vary
// materially by source, connection type and size — disclosed; use a
// manufacturer K where available.
export const FITTING_K: { id: string; label: string; k: number }[] = [
  { id: 'elbow90', label: '90° elbow (standard)', k: 0.9 },
  { id: 'elbow90lr', label: '90° elbow (long radius)', k: 0.6 },
  { id: 'elbow45', label: '45° elbow', k: 0.4 },
  { id: 'teeRun', label: 'Tee (run / straight-through)', k: 0.9 },
  { id: 'teeBranch', label: 'Tee (branch / side flow)', k: 2.0 },
  { id: 'gateValve', label: 'Gate valve (fully open)', k: 0.15 },
  { id: 'ballValve', label: 'Ball valve (fully open)', k: 0.05 },
  { id: 'globeValve', label: 'Globe valve (fully open)', k: 10 },
  { id: 'butterflyValve', label: 'Butterfly valve (open)', k: 0.8 },
  { id: 'checkValve', label: 'Check valve (swing)', k: 2.0 },
  { id: 'entrySharp', label: 'Entrance (sharp-edged)', k: 0.5 },
  { id: 'entryRounded', label: 'Entrance (rounded)', k: 0.2 },
  { id: 'exit', label: 'Exit into tank/plenum', k: 1.0 },
  { id: 'unionCoupling', label: 'Union / coupling', k: 0.08 },
];

export function fittingK(id: string): number {
  return (FITTING_K.find((f) => f.id === id) ?? { k: 0 }).k;
}

/** Darcy friction factor with a laminar/transitional/turbulent split. */
export function frictionFactor(reynolds: number, relativeRoughness: number): number {
  if (reynolds <= 0) return 0;
  if (reynolds < 2300) return 64 / reynolds;
  const swameeJain = (re: number) =>
    0.25 / Math.pow(Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(re, 0.9)), 2);
  if (reynolds >= 4000) return swameeJain(reynolds);
  // Transitional 2300–4000: interpolate between laminar f(2300) and turbulent f(4000).
  const fLam = 64 / 2300;
  const fTurb = swameeJain(4000);
  const t = (reynolds - 2300) / (4000 - 2300);
  return fLam + t * (fTurb - fLam);
}

export type FlowRegime = 'laminar' | 'transitional' | 'turbulent';

export interface FlowInput {
  rho: number;              // kg/m³
  nu: number;               // m²/s
  pipeDiameterMm: number;   // inner diameter
  pipeLengthM: number;
  roughnessMm: number;      // absolute
  volumetricFlowLpm: number; // litres/min
  sumK: number;             // total minor-loss coefficient
  elevationGainM: number;   // static lift (can be negative for a drop)
  pumpEfficiency: number;   // 0–1
}

export interface FlowResult {
  velocityMPerS: number;
  reynolds: number;
  regime: FlowRegime;
  frictionFactor: number;
  majorDropPa: number;
  minorDropPa: number;
  staticDropPa: number;
  totalDropPa: number;
  dynamicPressurePa: number;   // ρ·v²/2
  pumpHeadM: number;
  hydraulicPowerW: number;
  shaftPowerW: number;
}

export function solveFlowInPipes(inp: FlowInput): FlowResult {
  const dM = inp.pipeDiameterMm / 1000;
  const areaM2 = Math.PI * dM * dM / 4;
  const qM3s = inp.volumetricFlowLpm / 1000 / 60;
  const velocity = areaM2 > 0 ? qM3s / areaM2 : 0;

  const reynolds = inp.nu > 0 && dM > 0 ? (velocity * dM) / inp.nu : 0;
  const relRough = dM > 0 ? (inp.roughnessMm / 1000) / dM : 0;
  const f = frictionFactor(reynolds, relRough);

  const regime: FlowRegime = reynolds < 2300 ? 'laminar' : reynolds < 4000 ? 'transitional' : 'turbulent';

  const dynamicPressure = 0.5 * inp.rho * velocity * velocity;
  const majorDrop = dM > 0 ? f * (inp.pipeLengthM / dM) * dynamicPressure : 0;
  const minorDrop = Math.max(inp.sumK, 0) * dynamicPressure;
  const staticDrop = inp.rho * GRAVITY * inp.elevationGainM;
  const totalDrop = majorDrop + minorDrop + staticDrop;

  const pumpHead = inp.rho > 0 ? totalDrop / (inp.rho * GRAVITY) : 0;
  const hydraulicPower = totalDrop * qM3s;
  const shaftPower = inp.pumpEfficiency > 0 ? hydraulicPower / inp.pumpEfficiency : 0;

  return {
    velocityMPerS: velocity,
    reynolds,
    regime,
    frictionFactor: f,
    majorDropPa: majorDrop,
    minorDropPa: minorDrop,
    staticDropPa: staticDrop,
    totalDropPa: totalDrop,
    dynamicPressurePa: dynamicPressure,
    pumpHeadM: pumpHead,
    hydraulicPowerW: hydraulicPower,
    shaftPowerW: shaftPower,
  };
}
