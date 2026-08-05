// Rectangular enclosure cavity resonance — a shielded enclosure is also a cavity resonator,
// and at its resonant frequencies it behaves like an antenna rather than a barrier: shielding
// effectiveness (see shieldingEffectivenessPhysics.ts) can collapse to near 0dB, or worse,
// right at these specific frequencies regardless of how good the barrier material is. This is
// the standard rectangular-cavity eigenfrequency result, textbook electromagnetics (Pozar,
// Ott) and independently confirmed via the commonly-cited EMC rule of thumb (Tim Williams,
// "EMC for Product Designers"): f(MHz) = 150·√((m/l)² + (n/h)² + (p/w)²), l/h/w in metres,
// m/n/p non-negative integers with at least two nonzero (a mode needs two transverse field
// variations to exist) — giving the well-known ≈212MHz lowest resonance for a 1m cube.

export const SPEED_OF_LIGHT_M_S = 299792458;

export interface CavityMode {
  m: number;
  n: number;
  p: number;
  frequencyHz: number;
}

/** Resonant frequency of a single (m,n,p) mode. Dimensions in mm (this project's base length
 *  unit) for convenience at the call site; converted to metres internally. */
export function modeFrequencyHz(lengthMm: number, heightMm: number, widthMm: number, m: number, n: number, p: number): number {
  const l = lengthMm / 1000;
  const h = heightMm / 1000;
  const w = widthMm / 1000;
  const term = (m / l) ** 2 + (n / h) ** 2 + (p / w) ** 2;
  return (SPEED_OF_LIGHT_M_S / 2) * Math.sqrt(term);
}

/** Every valid (m,n,p) mode (at least two of the three indices nonzero) up to maxIndex,
 *  sorted ascending by frequency and capped to the requested count. */
export function solveCavityModes(lengthMm: number, heightMm: number, widthMm: number, maxIndex = 3, count = 10): CavityMode[] {
  const modes: CavityMode[] = [];
  for (let m = 0; m <= maxIndex; m++) {
    for (let n = 0; n <= maxIndex; n++) {
      for (let p = 0; p <= maxIndex; p++) {
        const nonZeroCount = (m > 0 ? 1 : 0) + (n > 0 ? 1 : 0) + (p > 0 ? 1 : 0);
        if (nonZeroCount < 2) continue; // a resonant mode needs at least two nonzero indices
        modes.push({ m, n, p, frequencyHz: modeFrequencyHz(lengthMm, heightMm, widthMm, m, n, p) });
      }
    }
  }
  modes.sort((a, b) => a.frequencyHz - b.frequencyHz);
  return modes.slice(0, count);
}

export function lowestCavityMode(lengthMm: number, heightMm: number, widthMm: number): CavityMode {
  return solveCavityModes(lengthMm, heightMm, widthMm, 3, 1)[0];
}
