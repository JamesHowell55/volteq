// Cable/wire sizing physics for EV powertrain cables (battery interconnects,
// battery-to-inverter, inverter-to-motor) — NOT household/building wiring, so this
// does not use NEC Table 310-style fixed ampacity tables. Ampacity and conductor
// temperature are computed from first-principles steady-state heat balance for a
// round insulated conductor, anchored to automotive-specific standards:
//
//  - ISO 6722 (road vehicle single-core cables) temperature classes set the
//    conductor's maximum allowable operating temperature by insulation type.
//  - IEC 60228 defines the standard metric cross-section series used here.
//  - Natural convection from the cable's round outer surface uses the Churchill-Chu
//    correlation for a long horizontal cylinder (Incropera/Cengel — the correct,
//    standard correlation for this geometry; the flat-plate McAdams formula used
//    for the Busbar calculator does NOT apply to round cable). Air properties
//    (kinematic viscosity, thermal conductivity, Prandtl number) are linearly
//    interpolated from standard tabulated reference points (Incropera Table A.4).
//  - Radiation uses the same Stefan-Boltzmann constant as the Busbar calculator,
//    with the exact (non-linearised) T^4 difference, factored as
//    εσ(Ts²+T∞²)(Ts+Ts∞) so no separate linear approximation is needed.
//  - Skin effect reuses this project's existing IEC 60287-1-1 implementation
//    (`skinEffectFactor` in busbarPhysics.ts) rather than re-deriving it — the
//    formula is geometry-agnostic (depends only on Rdc and frequency).
//  - Bundling derating (multiple cables run together in a harness/loom) reuses the
//    widely-published NEC 310.15(B)(3)(a) adjustment-factor table as a disclosed
//    standard reference multiplier, since first-principles modelling of mutual
//    heating between N bundled round cables is a CFD-scale problem out of scope
//    here — the same "borrow a standard table, disclose it" approach already used
//    for the Bolted Joint calculator's prevailing-torque nut data.
//
// Both solve directions (ampacity from conditions, or conductor temperature from a
// given current) properly account for the outer-surface temperature being lower
// than the conductor temperature (heat drops across the insulation wall before it
// reaches the convecting/radiating surface) via a short fixed-point iteration —
// not a one-shot approximation that would silently overstate ampacity.

import { dcResistancePerMetre, skinEffectFactor, STEFAN_BOLTZMANN } from './busbarPhysics';
import type { Material } from './materials';

const GRAVITY = 9.81; // m/s²
const EMISSIVITY_JACKET = 0.9; // typical dark rubber/plastic cable jacket, matches this project's existing "painted/matte dark" preset

export interface InsulationPreset {
  id: string;
  label: string;
  maxTempC: number; // ISO 6722 temperature class ceiling for this insulation
  thermalConductivity: number; // W/(m·K)
}

// PVC value matches this project's own existing PVC/heat-shrink coating preset
// (materials.ts COATING_PRESETS) — consistent order of magnitude, not a coincidence.
export const INSULATION_PRESETS: InsulationPreset[] = [
  { id: 'pvc', label: 'PVC (ISO 6722 Class B, 100°C)', maxTempC: 100, thermalConductivity: 0.17 },
  { id: 'xlpe', label: 'XLPE (ISO 6722 Class D, 150°C)', maxTempC: 150, thermalConductivity: 0.33 },
  { id: 'silicone', label: 'Silicone (ISO 6722 Class F, 200°C)', maxTempC: 200, thermalConductivity: 0.25 },
  { id: 'custom', label: 'Custom', maxTempC: 125, thermalConductivity: 0.25 },
];

export function getInsulationPreset(id: string): InsulationPreset {
  return INSULATION_PRESETS.find((p) => p.id === id) ?? INSULATION_PRESETS[0];
}

// IEC 60228 standard metric conductor cross-section series (representative range for EV power cabling).
export const STANDARD_CROSS_SECTIONS_MM2 = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

export interface AmbientPreset {
  id: string;
  label: string;
  tempC: number;
}
export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: 'cabin', label: 'Cabin / passenger compartment (~25°C)', tempC: 25 },
  { id: 'battery', label: 'Battery pack enclosure (~45°C)', tempC: 45 },
  { id: 'underhood', label: 'Underhood / engine bay (~85°C)', tempC: 85 },
  { id: 'custom', label: 'Custom', tempC: 40 },
];

// NEC 310.15(B)(3)(a)-style bundling derating — a standard, widely-published
// reference table, not a first-principles bundle-thermal derivation.
export function bundlingDeratingFactor(conductorCount: number): number {
  if (conductorCount <= 3) return 1.0;
  if (conductorCount <= 6) return 0.8;
  if (conductorCount <= 9) return 0.7;
  if (conductorCount <= 20) return 0.5;
  if (conductorCount <= 30) return 0.45;
  if (conductorCount <= 40) return 0.4;
  return 0.35;
}

// Air properties at atmospheric pressure, standard tabulated reference points
// (Incropera-style table), linearly interpolated between points and clamped at
// the ends for the -40°C..230°C range relevant to EV underhood/cabin/battery use.
const AIR_PROPERTY_POINTS: { tC: number; nu: number; k: number; pr: number }[] = [
  { tC: -23, nu: 9.49e-6, k: 22.3e-3, pr: 0.72 },
  { tC: 27, nu: 15.89e-6, k: 26.3e-3, pr: 0.707 },
  { tC: 77, nu: 20.92e-6, k: 30.0e-3, pr: 0.7 },
  { tC: 127, nu: 26.41e-6, k: 33.8e-3, pr: 0.69 },
  { tC: 177, nu: 32.39e-6, k: 37.3e-3, pr: 0.686 },
  { tC: 227, nu: 38.79e-6, k: 40.7e-3, pr: 0.684 },
];

function airProperties(filmTempC: number): { nu: number; k: number; pr: number } {
  const pts = AIR_PROPERTY_POINTS;
  if (filmTempC <= pts[0].tC) return { nu: pts[0].nu, k: pts[0].k, pr: pts[0].pr };
  if (filmTempC >= pts[pts.length - 1].tC) return { nu: pts[pts.length - 1].nu, k: pts[pts.length - 1].k, pr: pts[pts.length - 1].pr };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (filmTempC >= a.tC && filmTempC <= b.tC) {
      const t = (filmTempC - a.tC) / (b.tC - a.tC);
      return { nu: a.nu + t * (b.nu - a.nu), k: a.k + t * (b.k - a.k), pr: a.pr + t * (b.pr - a.pr) };
    }
  }
  return pts[0];
}

export interface ConvectionResult {
  h: number; // W/(m²K)
  nusselt: number;
  rayleigh: number;
}

// Churchill-Chu correlation for natural convection from a long horizontal cylinder,
// valid for Ra_D <= 1e12 (covers the entire practical range for cable diameters).
export function horizontalCylinderConvection(surfaceTempC: number, ambientTempC: number, diameterM: number): ConvectionResult {
  const deltaT = Math.max(surfaceTempC - ambientTempC, 0.001);
  const filmTempC = (surfaceTempC + ambientTempC) / 2;
  const filmTempK = filmTempC + 273.15;
  const { nu, k, pr } = airProperties(filmTempC);
  const beta = 1 / filmTempK; // ideal-gas approximation
  const rayleigh = (GRAVITY * beta * deltaT * diameterM ** 3 * pr) / (nu * nu);
  const denom = Math.pow(1 + Math.pow(0.559 / pr, 9 / 16), 8 / 27);
  const nusselt = Math.pow(0.6 + (0.387 * Math.pow(rayleigh, 1 / 6)) / denom, 2);
  const h = (nusselt * k) / diameterM;
  return { h, nusselt, rayleigh };
}

function radiationCoefficient(surfaceTempC: number, ambientTempC: number): number {
  const ts = surfaceTempC + 273.15;
  const ta = ambientTempC + 273.15;
  return EMISSIVITY_JACKET * STEFAN_BOLTZMANN * (ts * ts + ta * ta) * (ts + ta);
}

export interface CableInput {
  material: Material;
  crossSectionMm2: number;
  insulation: InsulationPreset;
  insulationThicknessMm: number;
  currentType: 'ac' | 'dc';
  frequencyHz: number;
  ambientTempC: number;
  conductorCountInBundle: number;
  lengthM: number;
  twoConductorCircuit: boolean;
}

export interface CableResult {
  conductorDiameterMm: number;
  outerDiameterMm: number;
  rdcPerMetre: number;
  skinEffectYs: number;
  racPerMetre: number;
  insulationThermalResistancePerMetre: number;
  convection: ConvectionResult;
  filmResistancePerMetre: number;
  totalThermalResistancePerMetre: number;
  bundlingFactor: number;
  ampacityA: number;
  conductorTempC: number | null;
  voltageDropV: number | null;
  voltageDropPercent: number | null;
  conductorTempPass: boolean | null;
}

function conductorDiameterFromArea(areaMm2: number): number {
  return Math.sqrt((4 * areaMm2) / Math.PI);
}

function insulationResistancePerMetre(dConductorM: number, dOuterM: number, kInsulation: number): number {
  return Math.log(dOuterM / dConductorM) / (2 * Math.PI * kInsulation);
}

// Fixed-point solve for the outer-surface temperature given a fixed conductor
// temperature and the resulting heat flow — the film sees a smaller ΔT than the
// conductor-to-ambient total because part of that ΔT drops across the insulation.
function solveSurfaceTemp(conductorTempC: number, ambientTempC: number, dOuterM: number, rInsulation: number): { surfaceTempC: number; filmR: number } {
  let surfaceTempC = (conductorTempC + ambientTempC) / 2;
  let filmR = 0;
  for (let i = 0; i < 8; i++) {
    const conv = horizontalCylinderConvection(surfaceTempC, ambientTempC, dOuterM);
    const rad = radiationCoefficient(surfaceTempC, ambientTempC);
    const hTotal = conv.h + rad;
    filmR = 1 / (hTotal * Math.PI * dOuterM);
    const rTotal = rInsulation + filmR;
    const deltaTTotal = conductorTempC - ambientTempC;
    const deltaTFilm = rTotal > 0 ? deltaTTotal * (filmR / rTotal) : 0;
    surfaceTempC = ambientTempC + deltaTFilm;
  }
  return { surfaceTempC, filmR };
}

export function solveAmpacity(input: CableInput): CableResult {
  const dConductorMm = conductorDiameterFromArea(input.crossSectionMm2);
  const dOuterMm = dConductorMm + 2 * input.insulationThicknessMm;
  const dConductorM = dConductorMm / 1000;
  const dOuterM = dOuterMm / 1000;

  const maxTempC = input.insulation.maxTempC;
  const rInsulation = insulationResistancePerMetre(dConductorM, dOuterM, input.insulation.thermalConductivity);
  const { surfaceTempC, filmR } = solveSurfaceTemp(maxTempC, input.ambientTempC, dOuterM, rInsulation);
  const convection = horizontalCylinderConvection(surfaceTempC, input.ambientTempC, dOuterM);
  const rTotal = rInsulation + filmR;

  const rdc = dcResistancePerMetre(input.material, maxTempC, input.crossSectionMm2);
  const skin = input.currentType === 'ac' ? skinEffectFactor(rdc, input.frequencyHz) : { ys: 0, ks: 1 };
  const rac = rdc * skin.ks;

  const deltaT = maxTempC - input.ambientTempC;
  const ampacitySingle = deltaT > 0 && rac > 0 && rTotal > 0 ? Math.sqrt(deltaT / (rac * rTotal)) : 0;
  const bundlingFactor = bundlingDeratingFactor(input.conductorCountInBundle);
  const ampacityA = ampacitySingle * bundlingFactor;

  return {
    conductorDiameterMm: dConductorMm,
    outerDiameterMm: dOuterMm,
    rdcPerMetre: rdc,
    skinEffectYs: skin.ys,
    racPerMetre: rac,
    insulationThermalResistancePerMetre: rInsulation,
    convection,
    filmResistancePerMetre: filmR,
    totalThermalResistancePerMetre: rTotal,
    bundlingFactor,
    ampacityA,
    conductorTempC: null,
    voltageDropV: null,
    voltageDropPercent: null,
    conductorTempPass: null,
  };
}

export function solveCheckCurrent(input: CableInput, targetCurrentA: number, systemVoltage?: number): CableResult {
  const dConductorMm = conductorDiameterFromArea(input.crossSectionMm2);
  const dOuterMm = dConductorMm + 2 * input.insulationThicknessMm;
  const dConductorM = dConductorMm / 1000;
  const dOuterM = dOuterMm / 1000;
  const rInsulation = insulationResistancePerMetre(dConductorM, dOuterM, input.insulation.thermalConductivity);
  const bundlingFactor = bundlingDeratingFactor(input.conductorCountInBundle);
  // The current a bundled cable can be driven with, referenced back to an
  // equivalent single-cable heat-balance problem (dividing by the derating factor
  // is the forward-direction counterpart of the ampacity mode's multiplication).
  const effectiveCurrentForHeatBalance = bundlingFactor > 0 ? targetCurrentA / bundlingFactor : targetCurrentA;

  let conductorTempC = input.ambientTempC + 10;
  let rac = 0;
  let convection: ConvectionResult = { h: 0, nusselt: 0, rayleigh: 0 };
  let filmR = 0;
  for (let i = 0; i < 20; i++) {
    const rdc = dcResistancePerMetre(input.material, conductorTempC, input.crossSectionMm2);
    const skin = input.currentType === 'ac' ? skinEffectFactor(rdc, input.frequencyHz) : { ys: 0, ks: 1 };
    rac = rdc * skin.ks;
    const { surfaceTempC, filmR: fr } = solveSurfaceTemp(conductorTempC, input.ambientTempC, dOuterM, rInsulation);
    filmR = fr;
    convection = horizontalCylinderConvection(surfaceTempC, input.ambientTempC, dOuterM);
    const rTotal = rInsulation + filmR;
    const newConductorTempC = input.ambientTempC + effectiveCurrentForHeatBalance * effectiveCurrentForHeatBalance * rac * rTotal;
    conductorTempC = (conductorTempC + newConductorTempC) / 2; // damped update for stability
  }

  const rTotal = rInsulation + filmR;
  const voltageDropV = rac * input.lengthM * (input.twoConductorCircuit ? 2 : 1) * targetCurrentA;
  const voltageDropPercent = systemVoltage && systemVoltage > 0 ? (voltageDropV / systemVoltage) * 100 : null;

  return {
    conductorDiameterMm: dConductorMm,
    outerDiameterMm: dOuterMm,
    rdcPerMetre: dcResistancePerMetre(input.material, conductorTempC, input.crossSectionMm2),
    skinEffectYs: input.currentType === 'ac' ? skinEffectFactor(rac, input.frequencyHz).ys : 0,
    racPerMetre: rac,
    insulationThermalResistancePerMetre: rInsulation,
    convection,
    filmResistancePerMetre: filmR,
    totalThermalResistancePerMetre: rTotal,
    bundlingFactor,
    ampacityA: 0,
    conductorTempC,
    voltageDropV,
    voltageDropPercent,
    conductorTempPass: conductorTempC <= input.insulation.maxTempC,
  };
}
