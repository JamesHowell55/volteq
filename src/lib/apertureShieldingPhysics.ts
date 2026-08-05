// EMC aperture & vent-panel shielding leakage — two distinct physical regimes for openings
// in an otherwise-solid shield, per the 1993 Acorn EMC Design Guidelines (V. Gibling), a
// primary EMC-course-style reference whose formulas were extracted via pdftotext and cross-
// checked against the honeycomb-vent constants independently confirmed from MAJR/RF Essentials
// waveguide-below-cutoff design references:
//
//  1. Thin slot/seam/gap (negligible depth, e.g. a seam or an unfilled panel cutout): the
//     opening radiates like a slot antenna. SE(dB) = 20·log10(λ/(2·d)) for the opening's
//     maximum linear dimension d < λ/2, and SE = 0dB once d ≥ λ/2 (the classic "half-wavelength"
//     radiating-slot limit — this exact formula, verbatim, from the primary source).
//
//  2. Vent panel / honeycomb (real depth t, e.g. a drilled/punched perforated panel or a
//     honeycomb waveguide vent): each hole acts as a short section of circular or square
//     waveguide operating below its cutoff frequency, giving a per-hole attenuation
//     A(dB) = k·(t/D), k = 32 for round/hexagonal holes, 27.3 for square holes (both values
//     independently confirmed against multiple sources — this is the standard "waveguide
//     below cutoff" result, not the thin-slot formula above, and only valid well below the
//     hole's own cutoff frequency fc = c/(1.706·D) for a round/hex hole). For N identical
//     holes packed within about a wavelength of each other, the primary source states the
//     array's shielding effectiveness additionally falls by an amount "approximately
//     proportional to the square root of N" — i.e. a further 10·log10(N) dB reduction.
//     NOTE: the same primary source also gives a more granular formula using hole-to-hole
//     centre spacing (SE = k·(t/D) + 20·log10(C²/D)) for irregular/non-close-packed arrays,
//     but the OCR-extracted text was internally inconsistent about which terms carry a
//     squared exponent, so it was deliberately NOT implemented here — this tool uses the
//     unambiguous hole-COUNT form (stated clearly in the source's prose) instead. See the
//     calculator's "Reference & assumptions" note.

export const SPEED_OF_LIGHT_M_S = 299792458;

// ---------- 1. Single aperture / slot (thin panel) ----------

export interface SlotApertureResult {
  wavelengthM: number;
  halfWavelengthMm: number;
  seDb: number; // 0 once the opening reaches/exceeds half a wavelength
  atOrBeyondHalfWavelength: boolean;
}

/** Thin slot/gap/seam radiating-aperture leakage. maxDimensionMm = the opening's longest
 *  linear dimension (NOT area — a long thin slot is far worse than a compact hole of the
 *  same area). */
export function solveSlotAperture(maxDimensionMm: number, frequencyHz: number): SlotApertureResult {
  const wavelengthM = frequencyHz > 0 ? SPEED_OF_LIGHT_M_S / frequencyHz : Infinity;
  const halfWavelengthMm = isFinite(wavelengthM) ? (wavelengthM * 1000) / 2 : Infinity;
  const atOrBeyondHalfWavelength = maxDimensionMm >= halfWavelengthMm;
  // SE = 20*log10(lambda / (2*d)) === 20*log10(halfWavelength / d), the primary source's formula verbatim.
  const seDb = atOrBeyondHalfWavelength || maxDimensionMm <= 0 ? 0 : Math.max(0, 20 * Math.log10(halfWavelengthMm / maxDimensionMm));
  return { wavelengthM, halfWavelengthMm, seDb, atOrBeyondHalfWavelength };
}

// ---------- 2. Vent panel: array of waveguide-below-cutoff holes ----------

export type HoleShape = 'round' | 'square';

const WAVEGUIDE_K: Record<HoleShape, number> = { round: 32, square: 27.3 };

export interface VentPanelInput {
  holeShape: HoleShape;
  holeDiameterMm: number; // diameter (round) or side width (square)
  panelThicknessMm: number; // depth of each hole = waveguide length
  holeCount: number; // N holes, assumed packed within about a wavelength of each other
  panelAreaMm2?: number; // optional, for open-area-% reporting only
}

export interface VentPanelResult {
  cutoffFrequencyHz: number; // TE11 (round) / TE10 (square, using the same 1.706 constant as an engineering approximation)
  perHoleAttenuationDb: number;
  arrayReductionDb: number; // 10*log10(N), N>=1
  totalSeDb: number;
  belowCutoffMargin: number; // cutoffFrequencyHz / operatingFrequencyHz — should be well above 1 for the model to hold
  openAreaPercent: number | null;
}

/** Cutoff frequency for the dominant mode of a single hole, fc = c / (1.706 * D). This is the
 *  exact TE11 result for a round waveguide; used as a standard engineering approximation for
 *  square/hex holes too (both close to 1.7-1.8x the hole's characteristic dimension in the
 *  published waveguide-vent literature). */
export function holeCutoffFrequencyHz(holeDiameterMm: number): number {
  if (holeDiameterMm <= 0) return Infinity;
  const holeDiameterM = holeDiameterMm / 1000;
  return SPEED_OF_LIGHT_M_S / (1.706 * holeDiameterM);
}

export function solveVentPanel(input: VentPanelInput, operatingFrequencyHz: number): VentPanelResult {
  const k = WAVEGUIDE_K[input.holeShape];
  const perHoleAttenuationDb = input.holeDiameterMm > 0 ? k * (input.panelThicknessMm / input.holeDiameterMm) : 0;
  const n = Math.max(1, input.holeCount);
  const arrayReductionDb = 10 * Math.log10(n);
  const totalSeDb = Math.max(0, perHoleAttenuationDb - arrayReductionDb);
  const cutoffFrequencyHz = holeCutoffFrequencyHz(input.holeDiameterMm);
  const belowCutoffMargin = operatingFrequencyHz > 0 ? cutoffFrequencyHz / operatingFrequencyHz : Infinity;

  let openAreaPercent: number | null = null;
  if (input.panelAreaMm2 && input.panelAreaMm2 > 0) {
    const holeAreaMm2 = input.holeShape === 'round'
      ? Math.PI * (input.holeDiameterMm / 2) ** 2
      : input.holeDiameterMm ** 2;
    openAreaPercent = Math.min(100, (n * holeAreaMm2 / input.panelAreaMm2) * 100);
  }

  return { cutoffFrequencyHz, perHoleAttenuationDb, arrayReductionDb, totalSeDb, belowCutoffMargin, openAreaPercent };
}
