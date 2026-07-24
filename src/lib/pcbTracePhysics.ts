// PCB copper trace current-carrying capacity and required trace width, from the
// classic IPC-2221 (formerly IPC-D-275) empirical curve fit — the same closed-form
// equation implemented by virtually every published PCB trace-width calculator:
//
//   I = k · ΔT^0.44 · A^0.725      (k = 0.048 external layers, 0.024 internal layers)
//
// where I is current in amps, ΔT is the trace's temperature rise above ambient in
// °C, and A is the trace's cross-sectional area in mil² (width × copper thickness).
// This is a curve fit to IPC's original thermal test data, not a first-principles
// derivation: modelling how a trace actually sheds heat (in-plane spreading through
// copper pours/plane layers, through-thickness conduction into FR4 at ~0.3 W/m·K,
// heat paths out through connectors/vias) is a full 3-D FEA problem with no closed
// form — which is exactly why IPC's newer IPC-2152 standard (refined test data,
// accounting for board thickness, adjacent plane layers, and trace length) publishes
// only charts, not a formula. This tool computes from the disclosed IPC-2221
// equation rather than transcribing unverifiable IPC-2152 chart readings — the same
// "borrow a published standard reference, disclose it" approach already used for
// this project's NEC bundling-derating table and VDI 2230 prevailing-torque data.
// Internal-layer traces use half the external k-constant because they can only shed
// heat by conducting through the board to both surfaces, rather than
// convecting/radiating directly into air like an external trace does.
//
// Trace resistance, voltage drop, and power dissipation ARE first-principles —
// computed from the same temperature-dependent copper resistivity model already
// used by the Busbar and Cable/Wire Sizing calculators (`dcResistancePerMetre`).

import { dcResistancePerMetre } from './busbarPhysics';
import { MATERIALS } from './materials';

export type LayerType = 'external' | 'internal';
export type SolveMode = 'current' | 'width' | 'tempRise';

const K_EXTERNAL = 0.048;
const K_INTERNAL = 0.024;
const AREA_EXPONENT = 0.725;
const TEMP_EXPONENT = 0.44;

export const MM_PER_MIL = 0.0254;
// Standard PCB industry copper-weight-to-thickness conversion: 1 oz/ft² of copper
// spread evenly is ~1.37 mil (~0.0348 mm) thick.
const MM_PER_OZ = 0.0348;

export function ozToMm(oz: number): number {
  return oz * MM_PER_OZ;
}

export interface CopperWeightPreset {
  id: string;
  label: string;
  oz: number;
}

export const COPPER_WEIGHT_PRESETS: CopperWeightPreset[] = [
  { id: 'half', label: '0.5 oz/ft²', oz: 0.5 },
  { id: 'one', label: '1 oz/ft²', oz: 1 },
  { id: 'two', label: '2 oz/ft²', oz: 2 },
  { id: 'three', label: '3 oz/ft²', oz: 3 },
  { id: 'four', label: '4 oz/ft²', oz: 4 },
  { id: 'custom', label: 'Custom', oz: 1 },
];

export function getCopperWeightPreset(id: string): CopperWeightPreset {
  return COPPER_WEIGHT_PRESETS.find((p) => p.id === id) ?? COPPER_WEIGHT_PRESETS[1];
}

function kFor(layer: LayerType): number {
  return layer === 'external' ? K_EXTERNAL : K_INTERNAL;
}

export function currentFromAreaAndDeltaT(areaMils2: number, deltaTC: number, layer: LayerType): number {
  if (areaMils2 <= 0 || deltaTC <= 0) return 0;
  return kFor(layer) * Math.pow(deltaTC, TEMP_EXPONENT) * Math.pow(areaMils2, AREA_EXPONENT);
}

export function areaFromCurrentAndDeltaT(currentA: number, deltaTC: number, layer: LayerType): number {
  if (currentA <= 0 || deltaTC <= 0) return 0;
  const k = kFor(layer);
  return Math.pow(currentA / (k * Math.pow(deltaTC, TEMP_EXPONENT)), 1 / AREA_EXPONENT);
}

export function deltaTFromCurrentAndArea(currentA: number, areaMils2: number, layer: LayerType): number {
  if (currentA <= 0 || areaMils2 <= 0) return 0;
  const k = kFor(layer);
  return Math.pow(currentA / (k * Math.pow(areaMils2, AREA_EXPONENT)), 1 / TEMP_EXPONENT);
}

export interface PcbTraceInput {
  mode: SolveMode;
  layer: LayerType;
  thicknessMm: number;
  ambientTempC: number;
  maxBoardTempC: number;
  lengthMm: number;
  widthMm: number;  // input for 'current'/'tempRise' modes; solved output for 'width'
  currentA: number; // input for 'width'/'tempRise' modes; solved output for 'current'
  deltaTC: number;  // input for 'current'/'width' modes; solved output for 'tempRise'
}

export interface PcbTraceResult {
  widthMm: number;
  currentA: number;
  deltaTC: number;
  finalTempC: number;
  withinMaxTempC: boolean;
  areaMils2: number;
  crossSectionMm2: number;
  resistancePerMetre: number;
  totalResistance: number;
  voltageDropV: number;
  powerDissipationW: number;
}

export function solveTrace(input: PcbTraceInput): PcbTraceResult {
  const thicknessMils = input.thicknessMm / MM_PER_MIL;

  let widthMm = input.widthMm;
  let currentA = input.currentA;
  let deltaTC = input.deltaTC;
  let areaMils2: number;

  if (input.mode === 'current') {
    areaMils2 = (widthMm / MM_PER_MIL) * thicknessMils;
    currentA = currentFromAreaAndDeltaT(areaMils2, deltaTC, input.layer);
  } else if (input.mode === 'width') {
    areaMils2 = areaFromCurrentAndDeltaT(currentA, deltaTC, input.layer);
    widthMm = thicknessMils > 0 ? (areaMils2 / thicknessMils) * MM_PER_MIL : 0;
  } else {
    areaMils2 = (widthMm / MM_PER_MIL) * thicknessMils;
    deltaTC = deltaTFromCurrentAndArea(currentA, areaMils2, input.layer);
  }

  const crossSectionMm2 = widthMm * input.thicknessMm;
  const finalTempC = input.ambientTempC + deltaTC;
  const resistancePerMetre = dcResistancePerMetre(MATERIALS.copper, finalTempC, crossSectionMm2);
  const totalResistance = resistancePerMetre * (input.lengthMm / 1000);
  const voltageDropV = currentA * totalResistance;
  const powerDissipationW = currentA * currentA * totalResistance;

  return {
    widthMm,
    currentA,
    deltaTC,
    finalTempC,
    withinMaxTempC: finalTempC <= input.maxBoardTempC,
    areaMils2,
    crossSectionMm2,
    resistancePerMetre,
    totalResistance,
    voltageDropV,
    powerDissipationW,
  };
}
