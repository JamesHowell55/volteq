// Bundle diameter estimation: a real published industry multiplication-factor
// table (fast, statistical) cross-checked against an actual 2D circle-packing
// computation (slower, geometric — this is what drives the cross-section
// diagram, since the user asked to see every wire drawn in the bundle).

// Source: Glenair "Wire Bundle Diameter Calculator" reference guide —
// bundleDiameter = averageWireDiameter x factor(N). Table reproduced exactly;
// interpolated for N between listed points, extrapolated past N=300 by
// continuing the table's own trend (factor scales ~sqrt(N) at the top end:
// 21.0 = k*sqrt(300) => k=1.2124, matched exactly at N=300 so the
// extrapolation has no discontinuity with the sourced data).
export const BUNDLE_FACTOR_TABLE: { n: number; factor: number }[] = [
  { n: 1, factor: 1.0 }, { n: 2, factor: 2.0 }, { n: 3, factor: 2.2 }, { n: 4, factor: 2.4 },
  { n: 5, factor: 2.7 }, { n: 6, factor: 2.9 }, { n: 7, factor: 3.0 }, { n: 8, factor: 3.3 },
  { n: 9, factor: 3.8 }, { n: 10, factor: 4.0 }, { n: 12, factor: 4.3 }, { n: 14, factor: 4.6 },
  { n: 16, factor: 5.0 }, { n: 18, factor: 5.3 }, { n: 20, factor: 5.6 }, { n: 24, factor: 6.0 },
  { n: 28, factor: 6.5 }, { n: 32, factor: 6.9 }, { n: 36, factor: 7.4 }, { n: 40, factor: 7.7 },
  { n: 45, factor: 8.1 }, { n: 50, factor: 8.5 }, { n: 55, factor: 8.9 }, { n: 60, factor: 9.3 },
  { n: 65, factor: 9.7 }, { n: 70, factor: 10.1 }, { n: 75, factor: 10.5 }, { n: 80, factor: 10.9 },
  { n: 90, factor: 11.6 }, { n: 100, factor: 12.2 }, { n: 125, factor: 13.7 }, { n: 150, factor: 15.0 },
  { n: 175, factor: 16.1 }, { n: 200, factor: 17.2 }, { n: 250, factor: 19.3 }, { n: 300, factor: 21.0 },
];

export function bundleFactor(n: number): number {
  if (n <= 1) return 1.0;
  const table = BUNDLE_FACTOR_TABLE;
  if (n >= table[table.length - 1].n) {
    const last = table[table.length - 1];
    return last.factor * Math.sqrt(n / last.n);
  }
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (n >= a.n && n <= b.n) {
      const t = (n - a.n) / (b.n - a.n);
      return a.factor + t * (b.factor - a.factor);
    }
  }
  return table[0].factor;
}

export interface GlenairEstimate {
  avgDiameterMm: number;
  factor: number;
  bundleDiameterMm: number;
}

/** Glenair's documented mixed-diameter method: arithmetic mean of all wire
 *  diameters (not area-weighted), times the count-dependent factor. */
export function glenairFactorEstimate(diametersMm: number[]): GlenairEstimate {
  const n = diametersMm.length;
  if (n === 0) return { avgDiameterMm: 0, factor: 1, bundleDiameterMm: 0 };
  const avgDiameterMm = diametersMm.reduce((a, d) => a + d, 0) / n;
  const factor = bundleFactor(n);
  return { avgDiameterMm, factor, bundleDiameterMm: avgDiameterMm * factor };
}

export interface PackedWire {
  id: number;
  x: number;
  y: number;
  d: number;
}
export interface PackResult {
  positions: PackedWire[];
  bundleDiameterMm: number;
  centerX: number;
  centerY: number;
}

interface TangentPoint { x: number; y: number }

/** Points where a circle of radius rk is externally tangent to both circle 1
 *  (x1,y1,r1) and circle 2 (x2,y2,r2) — the intersection of two circles of
 *  radius (r1+rk) and (r2+rk) centered at the two existing circles' centers. */
function tangentCandidates(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, rk: number): TangentPoint[] {
  const R1 = r1 + rk;
  const R2 = r2 + rk;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > R1 + R2 + 1e-9 || d < Math.abs(R1 - R2) - 1e-9) return [];
  const a = (R1 * R1 - R2 * R2 + d * d) / (2 * d);
  const hSq = R1 * R1 - a * a;
  const h = Math.sqrt(Math.max(hSq, 0));
  const mx = x1 + (a * dx) / d;
  const my = y1 + (a * dy) / d;
  const px = -dy / d;
  const py = dx / d;
  if (h < 1e-9) return [{ x: mx, y: my }];
  return [
    { x: mx + h * px, y: my + h * py },
    { x: mx - h * px, y: my - h * py },
  ];
}

/** Real (not simulated/approximate-only) greedy tangent-placement circle
 *  packing: place the largest wires first, then for every subsequent wire try
 *  every pair of already-placed wires as a tangent anchor, keep the
 *  non-overlapping candidate closest to the running centroid. This is a
 *  heuristic — not a proven globally-optimal packing — disclosed in the UI.
 *  Bundle boundary: a decaying-step "move toward the farthest circle" search
 *  for the enclosing-circle center, with the final radius always recomputed
 *  as the true max reach (guarantees every wire is actually contained,
 *  regardless of how well the center search converged). */
export function packCircles(diametersMm: number[]): PackResult {
  const n = diametersMm.length;
  if (n === 0) return { positions: [], bundleDiameterMm: 0, centerX: 0, centerY: 0 };

  const order = diametersMm.map((_, i) => i).sort((a, b) => diametersMm[b] - diametersMm[a]);
  const placed: { x: number; y: number; r: number; id: number }[] = [];

  const r0 = diametersMm[order[0]] / 2;
  placed.push({ x: 0, y: 0, r: r0, id: order[0] });

  if (n > 1) {
    const r1 = diametersMm[order[1]] / 2;
    placed.push({ x: r0 + r1, y: 0, r: r1, id: order[1] });
  }

  for (let k = 2; k < n; k++) {
    const idx = order[k];
    const rk = diametersMm[idx] / 2;
    const cx = placed.reduce((s, c) => s + c.x, 0) / placed.length;
    const cy = placed.reduce((s, c) => s + c.y, 0) / placed.length;

    let best: TangentPoint | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const c1 = placed[i];
        const c2 = placed[j];
        const candidates = tangentCandidates(c1.x, c1.y, c1.r, c2.x, c2.y, c2.r, rk);
        for (const cand of candidates) {
          let overlaps = false;
          for (const p of placed) {
            if (Math.hypot(cand.x - p.x, cand.y - p.y) < p.r + rk - 1e-6) { overlaps = true; break; }
          }
          if (overlaps) continue;
          const distToCentroid = Math.hypot(cand.x - cx, cand.y - cy);
          if (distToCentroid < bestDist) { bestDist = distToCentroid; best = cand; }
        }
      }
    }
    if (!best) {
      // Fallback (should be rare): tangent to whichever placed circle is
      // closest to the centroid, along the centroid->circle direction.
      let closest = placed[0];
      let cd = Infinity;
      for (const p of placed) {
        const dd = Math.hypot(p.x - cx, p.y - cy);
        if (dd < cd) { cd = dd; closest = p; }
      }
      const angle = Math.atan2(closest.y - cy, closest.x - cx) || 0;
      best = { x: closest.x + (closest.r + rk) * Math.cos(angle), y: closest.y + (closest.r + rk) * Math.sin(angle) };
    }
    placed.push({ x: best.x, y: best.y, r: rk, id: idx });
  }

  const maxReach = (center: { x: number; y: number }) => {
    let radius = 0;
    let worst = placed[0];
    for (const p of placed) {
      const reach = Math.hypot(p.x - center.x, p.y - center.y) + p.r;
      if (reach > radius) { radius = reach; worst = p; }
    }
    return { radius, worst };
  };

  // Initialise at the exact minimal-enclosing-circle solution for the two
  // most mutually distant (edge-to-edge) placed circles — exact for N<=2,
  // and a strong starting point otherwise — then hill-climb (accept only
  // improving moves, halve the step on rejection) rather than blindly
  // stepping with a decaying-but-unconditional move, which can leave a
  // residual oscillation even in the trivial two-circle case.
  let extremeI = 0;
  let extremeJ = Math.min(1, placed.length - 1);
  let extremeReach = -Infinity;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const reach = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) + placed[i].r + placed[j].r;
      if (reach > extremeReach) { extremeReach = reach; extremeI = i; extremeJ = j; }
    }
  }
  const ci = placed[extremeI];
  const cj = placed[extremeJ];
  const dij = Math.hypot(cj.x - ci.x, cj.y - ci.y) || 1;
  const ux = (cj.x - ci.x) / dij;
  const uy = (cj.y - ci.y) / dij;
  const pointAx = ci.x - ci.r * ux;
  const pointAy = ci.y - ci.r * uy;
  const pointBx = cj.x + cj.r * ux;
  const pointBy = cj.y + cj.r * uy;
  let center = { x: (pointAx + pointBx) / 2, y: (pointAy + pointBy) / 2 };

  let step = Math.max(...diametersMm);
  for (let iter = 0; iter < 300 && step > 1e-9; iter++) {
    const { radius, worst } = maxReach(center);
    const dx = worst.x - center.x;
    const dy = worst.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) break;
    const candidate = { x: center.x + (dx / dist) * step, y: center.y + (dy / dist) * step };
    const candidateReach = maxReach(candidate).radius;
    if (candidateReach < radius - 1e-12) center = candidate; else step *= 0.5;
  }
  const finalReach = maxReach(center);

  return {
    positions: placed.map((p) => ({ id: p.id, x: p.x, y: p.y, d: p.r * 2 })).sort((a, b) => a.id - b.id),
    bundleDiameterMm: finalReach.radius * 2,
    centerX: center.x,
    centerY: center.y,
  };
}
