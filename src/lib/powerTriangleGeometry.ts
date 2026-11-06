// Shared layout for the power-triangle diagram, used by both the live on-page
// component (themed with CSS variables) and the PDF renderer (literal colors).
// The triangle is drawn to scale: P along the horizontal, Q vertical (up for a
// lagging/inductive load, down for a leading/capacitive one), S the hypotenuse.

export const PT_W = 400;
export const PT_H = 300;

export interface TriangleInput {
  pW: number;
  qVar: number;
  sVA: number;
  lagging: boolean;
  /** Optional corrected state (same real power, smaller reactive power). */
  corrected?: { qVar: number; sVA: number } | null;
}

export interface TriangleGeometry {
  ox: number; oy: number;      // origin (start of P)
  px: number;                  // end of P on the x axis
  qy: number;                  // y of the original Q tip
  qyNew: number | null;        // y of the corrected Q tip
  sign: 1 | -1;                // -1 draws Q upward (SVG y grows downward)
  arcR: number;
  arcEndX: number; arcEndY: number;
}

export function triangleGeometry(t: TriangleInput): TriangleGeometry {
  const sign: 1 | -1 = t.lagging ? -1 : 1;
  const floor = t.sVA * 0.02;
  const ox = 50;
  const oy = t.lagging ? 235 : 70;
  const k = Math.min(290 / Math.max(t.pW, floor), 165 / Math.max(t.qVar, floor));
  const px = ox + t.pW * k;
  const qy = oy + sign * t.qVar * k;
  const qyNew = t.corrected ? oy + sign * t.corrected.qVar * k : null;
  const arcR = 38;
  const phi = Math.atan2(t.qVar, t.pW);
  return {
    ox, oy, px, qy, qyNew, sign, arcR,
    arcEndX: ox + arcR * Math.cos(phi),
    arcEndY: oy + sign * arcR * Math.sin(phi),
  };
}
