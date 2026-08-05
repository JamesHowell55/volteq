// Grounding / bond strap inductance — the classical Grover/Terman self-inductance formulas
// for a straight conductor, used throughout EMC and power-electronics grounding practice
// because impedance (not DC resistance) governs a bond's effectiveness at RF: Z = 2πfL grows
// directly with frequency, and even a short lead can present significant impedance well below
// 100MHz. Two conductor geometries:
//
//  Flat strap (rectangular cross-section, length l, width w, thickness t):
//    L(nH) = 0.2·l·[ln(2l/(w+t)) + 0.2235·(w+t)/l + 0.5], l/w/t all in mm.
//
//  Round wire (diameter d):
//    L(nH) = 0.2·l·[ln(4l/d) − 1], l/d in mm.
//
// Both dimensionally verified against the widely-cited EMC rule of thumb that "10cm of ordinary
// wire has roughly 100nH of inductance, about 63Ω at 100MHz" — a 100mm/1mm-diameter round wire
// and a 100mm/1mm×1mm flat strap both independently reproduce ~100nH via these formulas (see
// this file's validation script), and 2π·100MHz·100nH ≈ 63Ω matches the same rule of thumb
// exactly. This cross-check is what resolves the unit convention (mm in, nH out) that secondary
// sources reproducing this formula often omit.

export function strapInductanceNh(lengthMm: number, widthMm: number, thicknessMm: number): number {
  if (lengthMm <= 0 || widthMm + thicknessMm <= 0) return 0;
  const wt = widthMm + thicknessMm;
  return 0.2 * lengthMm * (Math.log((2 * lengthMm) / wt) + (0.2235 * wt) / lengthMm + 0.5);
}

export function wireInductanceNh(lengthMm: number, diameterMm: number): number {
  if (lengthMm <= 0 || diameterMm <= 0) return 0;
  return 0.2 * lengthMm * (Math.log((4 * lengthMm) / diameterMm) - 1);
}

export function impedanceOhm(inductanceNh: number, frequencyHz: number): number {
  return 2 * Math.PI * frequencyHz * (inductanceNh * 1e-9);
}

export interface StrapSweepPoint {
  frequencyHz: number;
  strapImpedanceOhm: number;
  wireImpedanceOhm: number;
}

/** Log-spaced impedance-vs-frequency sweep comparing a flat strap to an equivalent-length
 *  round wire (premium depth card). */
export function sweepStrapVsWire(
  lengthMm: number, widthMm: number, thicknessMm: number, wireDiameterMm: number,
  fMinHz: number, fMaxHz: number, points = 30,
): StrapSweepPoint[] {
  const strapNh = strapInductanceNh(lengthMm, widthMm, thicknessMm);
  const wireNh = wireInductanceNh(lengthMm, wireDiameterMm);
  const logMin = Math.log10(Math.max(fMinHz, 1));
  const logMax = Math.log10(Math.max(fMaxHz, fMinHz + 1));
  const out: StrapSweepPoint[] = [];
  for (let i = 0; i < points; i++) {
    const frequencyHz = Math.pow(10, logMin + ((logMax - logMin) * i) / (points - 1));
    out.push({
      frequencyHz,
      strapImpedanceOhm: impedanceOhm(strapNh, frequencyHz),
      wireImpedanceOhm: impedanceOhm(wireNh, frequencyHz),
    });
  }
  return out;
}
