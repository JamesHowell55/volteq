// Core material presets for the Choke Sizing Calculator.
//
// Permeability and saturation flux density figures are representative for
// each material class (actual values vary by specific part/grade — treat
// presets as a starting point, editable, especially for a final design).
// Core loss uses a Steinmetz-style fit: Pv [mW/cm3] = lossCoeffK * f[kHz]^lossExpFreq * B[T]^lossExpFlux.
// These coefficients are representative/order-of-magnitude, not manufacturer-verified
// loss curves — refine against a datasheet loss curve for a final design.

export interface CoreMaterialPreset {
  id: string;
  label: string;
  relativePermeability: number;
  saturationFluxDensityT: number;
  lossCoeffK: number;
  lossExpFreq: number;
  lossExpFlux: number;
}

export const CORE_MATERIAL_PRESETS: CoreMaterialPreset[] = [
  { id: 'ferrite', label: 'Power ferrite (µi ≈ 2000)', relativePermeability: 2000, saturationFluxDensityT: 0.4, lossCoeffK: 32, lossExpFreq: 1.3, lossExpFlux: 2.5 },
  { id: 'nanocrystalline', label: 'Nanocrystalline (µi ≈ 60)', relativePermeability: 60, saturationFluxDensityT: 1.2, lossCoeffK: 6, lossExpFreq: 1.5, lossExpFlux: 2.0 },
  { id: 'mpp', label: 'MPP powder (µi ≈ 125)', relativePermeability: 125, saturationFluxDensityT: 0.7, lossCoeffK: 20, lossExpFreq: 1.4, lossExpFlux: 2.3 },
  { id: 'koolmu', label: 'Kool Mµ / sendust powder (µi ≈ 125)', relativePermeability: 125, saturationFluxDensityT: 1.05, lossCoeffK: 35, lossExpFreq: 1.4, lossExpFlux: 2.3 },
  { id: 'custom', label: 'Custom', relativePermeability: 100, saturationFluxDensityT: 1.0, lossCoeffK: 25, lossExpFreq: 1.4, lossExpFlux: 2.3 },
];

// Suggested starting target common-mode impedance by CISPR 25 class, at a
// reference frequency (default 150 kHz, the low end of the CISPR 25
// conducted-emissions band). This is a filter-design rule-of-thumb starting
// point, NOT a CISPR 25 clause value — CISPR 25 specifies conducted/radiated
// emission limits in dBµV, not component impedance. Refine against an actual
// conducted-emissions measurement for final sign-off.
export interface Cispr25ClassPreset {
  id: string;
  label: string;
  targetImpedanceOhm: number;
}

export const CISPR25_CLASSES: Cispr25ClassPreset[] = [
  { id: 'class1', label: 'Class 1 (least strict)', targetImpedanceOhm: 20 },
  { id: 'class3', label: 'Class 3 (typical passenger EV)', targetImpedanceOhm: 50 },
  { id: 'class5', label: 'Class 5 (most strict)', targetImpedanceOhm: 100 },
  { id: 'custom', label: 'Custom target', targetImpedanceOhm: 50 },
];
