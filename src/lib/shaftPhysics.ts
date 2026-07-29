// Stepped-shaft analysis engine — Shigley's Mechanical Engineering Design
// (Ch. 6 fatigue, Ch. 7 shafts) / ASME B106.1M.
//
// Handles a shaft built from cylindrical sections (solid or hollow), carried on
// two bearings, under transverse point loads (any plane orientation) and torque.
// It resolves the bearing reactions and the two-plane bending-moment and torque
// diagrams, then at each evaluation station (every shoulder plus any keyway /
// groove / custom feature) computes the static (first-cycle yield) and fatigue
// factors of safety, using the distortion-energy (von Mises) combination with a
// full Marin endurance limit and the Peterson/Pilkey fillet stress-concentration
// fits. It also gives the bending deflection and slope, the angle of twist, and
// the first lateral critical speed by Rayleigh's method.
//
// Validated against Shigley Ch. 7 worked examples (see the "Validated" note on
// the calculator page): the DE-Goodman/Gerber/elliptic/Soderberg diameter for
// Prob. 7-1, the Marin factors and Neuber notch sensitivity for Prob. 7-2, and
// the uniform-shaft critical speed of Prob. 7-28.

import {
  SURFACE_FINISHES, RELIABILITY_OPTIONS, STRESS_FEATURES,
  type ShaftMaterial, type StressFeatureId, type FatigueCriterionId,
} from './shaftData';

const DEG = Math.PI / 180;
const G_ACCEL = 9806.65; // mm/s²

// ── Model ───────────────────────────────────────────────────────────────────
export interface ShaftSection {
  id: string;
  lengthMm: number;
  odMm: number;
  idMm: number;          // 0 = solid
  filletRadiusMm: number; // fillet at the step to the NEXT (right) section
}

export interface TransverseLoad {
  id: string;
  label: string;
  positionMm: number;
  magnitudeN: number;    // resultant transverse force
  angleDeg: number;      // 0 = vertical (y), 90 = horizontal (z)
}

export interface TorqueLoad {
  id: string;
  label: string;
  positionMm: number;
  torqueNm: number;      // signed; +in / −out. The running sum is the torque diagram.
}

export interface Disk {
  id: string;
  label: string;
  positionMm: number;
  massKg: number;
}

// A user-declared stress riser overriding the auto shoulder feature at a station.
export interface StationFeature {
  id: string;
  positionMm: number;
  featureId: StressFeatureId;
  customKt?: number;
  customKts?: number;
}

export interface ShaftInput {
  sections: ShaftSection[];
  bearingAPosMm: number;
  bearingBPosMm: number;
  loads: TransverseLoad[];
  torques: TorqueLoad[];
  disks: Disk[];
  features: StationFeature[];
  material: ShaftMaterial;
  surfaceFinishId: string;
  reliabilityPct: number;
  targetSafetyFactor: number;
  fatigueCriterion: FatigueCriterionId;
  includeSelfWeight: boolean;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
export interface GeomAt { odMm: number; idMm: number; I: number; J: number; area: number; }

function sectionBoundaries(sections: ShaftSection[]): number[] {
  const b = [0];
  let x = 0;
  for (const s of sections) { x += s.lengthMm; b.push(x); }
  return b;
}
export function totalLength(sections: ShaftSection[]): number {
  return sections.reduce((a, s) => a + s.lengthMm, 0);
}

// Section index containing x (right-continuous; a boundary belongs to the section
// on its right, except the very end).
function sectionIndexAt(sections: ShaftSection[], bounds: number[], x: number): number {
  for (let i = 0; i < sections.length; i++) {
    if (x < bounds[i + 1] - 1e-9) return i;
  }
  return sections.length - 1;
}

function geomOf(s: ShaftSection): GeomAt {
  const I = (Math.PI * (s.odMm ** 4 - s.idMm ** 4)) / 64;
  const J = (Math.PI * (s.odMm ** 4 - s.idMm ** 4)) / 32;
  const area = (Math.PI * (s.odMm ** 2 - s.idMm ** 2)) / 4;
  return { odMm: s.odMm, idMm: s.idMm, I, J, area };
}

// ── Single-plane statics + variable-EI deflection ───────────────────────────
interface PointForce { position: number; up: number; } // up = upward-positive force

interface PlaneResult {
  reactionA: number;
  reactionB: number;
  xs: number[];
  moment: number[];      // N·mm, sagging-positive
  deflection: number[];  // mm
}

// Reactions for two simple supports at a<b under upward-positive point forces.
function reactions2(loads: PointForce[], a: number, b: number): { ra: number; rb: number } {
  const sumF = loads.reduce((s, l) => s + l.up, 0);       // upward
  const sumM = loads.reduce((s, l) => s + l.up * (l.position - a), 0); // about A
  const rb = -sumM / (b - a);
  const ra = -sumF - rb;
  return { ra, rb };
}

function momentAt(x: number, forces: PointForce[]): number {
  let m = 0;
  for (const f of forces) if (f.position <= x) m += f.up * (x - f.position);
  return m;
}

function cumTrap(xs: number[], v: number[]): number[] {
  const out = new Array(xs.length).fill(0);
  for (let i = 1; i < xs.length; i++) out[i] = out[i - 1] + ((v[i] + v[i - 1]) / 2) * (xs[i] - xs[i - 1]);
  return out;
}
function interp(xs: number[], v: number[], x: number): number {
  if (x <= xs[0]) return v[0];
  if (x >= xs[xs.length - 1]) return v[xs.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return v[lo] + t * (v[hi] - v[lo]);
}

function solvePlane(
  sections: ShaftSection[], bounds: number[], xs: number[], eMPa: number,
  appliedLoads: PointForce[], a: number, b: number,
): PlaneResult {
  const { ra, rb } = reactions2(appliedLoads, a, b);
  const allForces: PointForce[] = [...appliedLoads, { position: a, up: ra }, { position: b, up: rb }];
  const moment = xs.map((x) => momentAt(x, allForces));

  // Deflection: y'' = M/(E·I(x)); integrate twice; fix δ(a)=δ(b)=0.
  const curvature = xs.map((x, i) => {
    const si = sectionIndexAt(sections, bounds, x);
    const I = geomOf(sections[si]).I;
    return moment[i] / (eMPa * I);
  });
  const slope0 = cumTrap(xs, curvature);       // θ assuming θ(0)=0
  const defl0 = cumTrap(xs, slope0);           // y assuming θ(0)=0, y(0)=0
  const yA = interp(xs, defl0, a), yB = interp(xs, defl0, b);
  // y(x) = C2 + C1·x + defl0; enforce y(a)=y(b)=0.
  const C1 = -(yB - yA) / (b - a);
  const C2 = -(yA + C1 * a);
  const deflection = xs.map((x, i) => C2 + C1 * x + defl0[i]);
  return { reactionA: ra, reactionB: rb, xs, moment, deflection };
}

function buildGrid(bounds: number[], extra: number[], samples = 400): number[] {
  const L = bounds[bounds.length - 1];
  const pts = new Set<number>([0, L]);
  bounds.forEach((x) => pts.add(x));
  extra.forEach((x) => pts.add(Math.max(0, Math.min(L, x))));
  for (let i = 0; i <= samples; i++) pts.add((i / samples) * L);
  return Array.from(pts).sort((p, q) => p - q);
}

// ── Peterson/Pilkey shoulder-fillet Kt (bending & torsion) ──────────────────
function poly(cs: number[], t: number): number { return cs[0] + cs[1] * t + cs[2] * t * t + cs[3] * t * t * t; }

export function shoulderKtBending(bigD: number, smallD: number, r: number): number {
  const h = (bigD - smallD) / 2;
  if (h <= 0 || r <= 0) return 1;
  const hr = Math.min(Math.max(h / r, 0.1), 20);
  const s = Math.sqrt(hr);
  const cs = hr <= 2.0
    ? [0.947 + 1.206 * s - 0.131 * hr, 0.022 - 3.405 * s + 0.915 * hr, 0.869 + 1.777 * s - 0.555 * hr, -0.810 + 0.422 * s - 0.260 * hr]
    : [1.232 + 0.832 * s - 0.008 * hr, -3.813 + 0.968 * s - 0.260 * hr, 7.423 - 4.868 * s + 0.869 * hr, -3.839 + 3.070 * s - 0.600 * hr];
  return Math.max(1, poly(cs, 2 * h / bigD));
}

export function shoulderKtTorsion(bigD: number, smallD: number, r: number): number {
  const h = (bigD - smallD) / 2;
  if (h <= 0 || r <= 0) return 1;
  const hr = Math.min(Math.max(h / r, 0.25), 4);
  const s = Math.sqrt(hr);
  const cs = [0.905 + 0.783 * s - 0.075 * hr, -0.437 - 1.969 * s + 0.553 * hr, 1.557 + 1.073 * s - 0.578 * hr, -1.061 + 0.171 * s + 0.086 * hr];
  return Math.max(1, poly(cs, 2 * h / bigD));
}

// ── Neuber notch sensitivity (Shigley Eq. 6-34/6-35a, imperial √a fit) ───────
// r in mm; returns q in [0,1]. Converts to inches internally.
function neuberSqrtA(sutMPa: number, torsion: boolean): number {
  const sut = sutMPa / 6.894757; // kpsi
  const c = torsion
    ? [0.190, -2.51e-3, 1.35e-5, -2.67e-8]
    : [0.246, -3.08e-3, 1.51e-5, -2.67e-8];
  return c[0] + c[1] * sut + c[2] * sut * sut + c[3] * sut ** 3; // √in
}
export function notchSensitivity(sutMPa: number, rMm: number, torsion: boolean): number {
  if (rMm <= 0) return 0;
  const rIn = rMm / 25.4;
  const q = 1 / (1 + neuberSqrtA(sutMPa, torsion) / Math.sqrt(rIn));
  return Math.min(1, Math.max(0, q));
}

// ── Marin endurance limit ────────────────────────────────────────────────────
export function enduranceLimit(material: ShaftMaterial, surfaceFinishId: string, reliabilityPct: number, diaMm: number): { se: number; ka: number; kb: number; ke: number; sePrime: number } {
  const sut = material.utsMPa;
  const sePrime = Math.min(0.5 * sut, 700); // steel; capped at 700 MPa
  const sf = SURFACE_FINISHES.find((s) => s.id === surfaceFinishId) ?? SURFACE_FINISHES[1];
  const ka = sf.a * Math.pow(sut, sf.b);
  const d = Math.max(diaMm, 2.79);
  const kb = d <= 51 ? Math.pow(d / 7.62, -0.107) : 1.51 * Math.pow(d, -0.157);
  const ke = (RELIABILITY_OPTIONS.find((r) => r.pct === reliabilityPct) ?? RELIABILITY_OPTIONS[0]).ke;
  // kc = 1 (load factor is carried by the von Mises combination), kd = 1 (room temp).
  const se = ka * kb * ke * sePrime;
  return { se, ka, kb, ke, sePrime };
}

// ── Fatigue safety factor for a station (distortion-energy criteria) ─────────
function fatigueSafety(criterion: FatigueCriterionId, sigmaA: number, sigmaM: number, se: number, sut: number, sy: number): number {
  // von Mises equivalent alternating/midrange already folded into sigmaA/sigmaM.
  if (sigmaA <= 0 && sigmaM <= 0) return Infinity;
  switch (criterion) {
    case 'goodman': return 1 / (sigmaA / se + sigmaM / sut);
    case 'soderberg': return 1 / (sigmaA / se + sigmaM / sy);
    case 'elliptic': return 1 / Math.sqrt((sigmaA / se) ** 2 + (sigmaM / sy) ** 2);
    case 'gerber': {
      if (sigmaM <= 0) return se / sigmaA;
      const r = (2 * sigmaM * se) / (sut * sigmaA);
      return 0.5 * (sut / sigmaM) ** 2 * (sigmaA / se) * (-1 + Math.sqrt(1 + r * r));
    }
  }
}

// ── Station evaluation ───────────────────────────────────────────────────────
export interface StationResult {
  positionMm: number;
  label: string;
  featureId: StressFeatureId;
  odMm: number;
  idMm: number;
  bendingMomentNmm: number;   // resultant
  torqueNmm: number;
  Kt: number; Kts: number; Kf: number; Kfs: number;
  seMPa: number;
  sigmaAMPa: number;          // von Mises alternating
  sigmaMMPa: number;          // von Mises midrange
  staticVonMisesMPa: number;
  fatigueSafety: number;
  staticSafety: number;
  requiredDiaMm: number;      // solid dia to reach the target SF (DE-Goodman) at this station
  governing: boolean;
}

function sectionModulusNet(od: number, id: number): { ZbendEff: number; ZtorsEff: number } {
  // I/c and J/c for bending and torsion stress (handles hollow).
  const I = (Math.PI * (od ** 4 - id ** 4)) / 64;
  const J = (Math.PI * (od ** 4 - id ** 4)) / 32;
  return { ZbendEff: I / (od / 2), ZtorsEff: J / (od / 2) };
}

// ── Top-level result ─────────────────────────────────────────────────────────
export interface ShaftResult {
  lengthMm: number;
  reactionAyN: number; reactionAzN: number; reactionA_N: number;
  reactionByN: number; reactionBzN: number; reactionB_N: number;
  xs: number[];
  momentY: number[]; momentZ: number[]; momentRes: number[];
  torque: number[];          // N·mm
  deflRes: number[];         // mm (resultant)
  slopeADeg: number; slopeBDeg: number;
  maxDeflMm: number; maxDeflAtMm: number;
  maxMomentNmm: number; maxMomentAtMm: number;
  angleOfTwistDeg: number;
  stations: StationResult[];
  governing: StationResult | null;
  criticalSpeedRpm: number | null;
  warnings: string[];
}

export function solveShaft(input: ShaftInput): ShaftResult {
  const { sections, material } = input;
  const warnings: string[] = [];
  const L = totalLength(sections);
  const bounds = sectionBoundaries(sections);
  const a = input.bearingAPosMm, b = input.bearingBPosMm;

  // Self-weight lumped at section centroids (vertical), if requested.
  const selfWeightForces: PointForce[] = input.includeSelfWeight
    ? sections.map((s, i) => {
        const g = geomOf(s);
        const massKg = (material.densityKgM3 * (g.area * 1e-6) * (s.lengthMm * 1e-3)); // kg
        const centroid = (bounds[i] + bounds[i + 1]) / 2;
        return { position: centroid, up: -(massKg * 9.80665) }; // N downward
      })
    : [];

  const extra = [a, b, ...input.loads.map((l) => l.positionMm), ...input.torques.map((t) => t.positionMm),
    ...input.disks.map((d) => d.positionMm), ...input.features.map((f) => f.positionMm)];
  const xs = buildGrid(bounds, extra);

  // Two planes: y (vertical, includes self-weight) and z (horizontal).
  const loadsY: PointForce[] = input.loads.map((l) => ({ position: l.positionMm, up: -l.magnitudeN * Math.cos(l.angleDeg * DEG) }));
  const loadsZ: PointForce[] = input.loads.map((l) => ({ position: l.positionMm, up: -l.magnitudeN * Math.sin(l.angleDeg * DEG) }));
  const planeY = solvePlane(sections, bounds, xs, material.eMPa, [...loadsY, ...selfWeightForces], a, b);
  const planeZ = solvePlane(sections, bounds, xs, material.eMPa, loadsZ, a, b);

  const momentRes = xs.map((_, i) => Math.hypot(planeY.moment[i], planeZ.moment[i]));
  const deflRes = xs.map((_, i) => Math.hypot(planeY.deflection[i], planeZ.deflection[i]));

  // Torque diagram: running sum of applied torques to the left (N·mm).
  const sortedT = [...input.torques].sort((p, q) => p.positionMm - q.positionMm);
  const torque = xs.map((x) => sortedT.reduce((s, t) => (t.positionMm <= x ? s + t.torqueNm * 1000 : s), 0));
  const torqueBalance = input.torques.reduce((s, t) => s + t.torqueNm, 0);
  if (input.torques.length > 0 && Math.abs(torqueBalance) > 1e-6 * (1 + Math.abs(input.torques[0].torqueNm))) {
    warnings.push(`Applied torques don't balance (net ${torqueBalance.toFixed(1)} N·m) — a real shaft's input torque must equal the sum of the output torques. Add the reacting torque at the driven end.`);
  }

  // Slopes at the bearings (deg), resultant.
  const slopeAt = (pos: number) => {
    const dx = Math.max(L * 1e-3, 0.05);
    const dY = (interp(xs, planeY.deflection, pos + dx) - interp(xs, planeY.deflection, pos - dx)) / (2 * dx);
    const dZ = (interp(xs, planeZ.deflection, pos + dx) - interp(xs, planeZ.deflection, pos - dx)) / (2 * dx);
    return Math.hypot(dY, dZ);
  };
  const slopeADeg = Math.atan(slopeAt(a)) / DEG;
  const slopeBDeg = Math.atan(slopeAt(b)) / DEG;

  let maxDeflMm = 0, maxDeflAtMm = 0, maxMomentNmm = 0, maxMomentAtMm = 0;
  xs.forEach((x, i) => {
    if (deflRes[i] > maxDeflMm) { maxDeflMm = deflRes[i]; maxDeflAtMm = x; }
    if (momentRes[i] > maxMomentNmm) { maxMomentNmm = momentRes[i]; maxMomentAtMm = x; }
  });

  // Angle of twist: ∫ T/(G·J) dx (deg).
  const twistIntegrand = xs.map((x, i) => {
    const si = sectionIndexAt(sections, bounds, x);
    const J = geomOf(sections[si]).J;
    return torque[i] / (material.gMPa * J);
  });
  const angleOfTwistDeg = cumTrap(xs, twistIntegrand)[xs.length - 1] / DEG;

  // ── Evaluation stations: interior shoulders + user features ──────────────
  type StationDef = { pos: number; featureId: StressFeatureId; label: string; customKt?: number; customKts?: number; bigD?: number; smallD?: number; smallId?: number; r?: number };
  const defs: StationDef[] = [];
  // Interior shoulders (diameter changes)
  for (let i = 0; i < sections.length - 1; i++) {
    const left = sections[i], right = sections[i + 1];
    if (Math.abs(left.odMm - right.odMm) < 1e-6) continue;
    const smallSec = left.odMm <= right.odMm ? left : right;
    const bigD = Math.max(left.odMm, right.odMm), smallD = Math.min(left.odMm, right.odMm);
    defs.push({ pos: bounds[i + 1], featureId: 'shoulder-fillet', label: `Shoulder ${left.odMm}→${right.odMm} mm`, bigD, smallD, smallId: smallSec.idMm, r: left.filletRadiusMm });
  }
  // User features
  for (const f of input.features) {
    const si = sectionIndexAt(sections, bounds, f.positionMm);
    defs.push({ pos: f.positionMm, featureId: f.featureId, label: STRESS_FEATURES[f.featureId].label, customKt: f.customKt, customKts: f.customKts });
    void si;
  }
  // Always include the max-moment location as a plain station if far from others.
  if (!defs.some((d) => Math.abs(d.pos - maxMomentAtMm) < 1e-3)) {
    defs.push({ pos: maxMomentAtMm, featureId: 'none', label: 'Max bending moment' });
  }

  const surface = input.surfaceFinishId;
  const stations: StationResult[] = defs.map((d) => {
    const si = sectionIndexAt(sections, bounds, Math.min(d.pos, L - 1e-6));
    // At a shoulder the riser is on the smaller shaft — use the smaller diameter.
    const od = d.smallD ?? sections[si].odMm;
    const rawId = d.smallD != null ? (d.smallId ?? 0) : sections[si].idMm;
    const id = rawId >= od ? 0 : rawId;
    const M = interp(xs, momentRes, d.pos);
    const T = interp(xs, torque, d.pos);

    // Kt / Kts
    let Kt: number, Kts: number;
    if (d.featureId === 'shoulder-fillet' && d.bigD && d.smallD) {
      Kt = shoulderKtBending(d.bigD, d.smallD, d.r ?? 0);
      Kts = shoulderKtTorsion(d.bigD, d.smallD, d.r ?? 0);
    } else if (d.featureId === 'custom') {
      Kt = d.customKt ?? 1; Kts = d.customKts ?? 1;
    } else {
      Kt = STRESS_FEATURES[d.featureId].ktBending ?? 1;
      Kts = STRESS_FEATURES[d.featureId].ktsTorsion ?? 1;
    }
    // Notch sensitivity → Kf. Use the fillet radius where known, else a sharp default.
    const rForQ = d.r && d.r > 0 ? d.r : 0.02 * od;
    const q = notchSensitivity(material.utsMPa, rForQ, false);
    const qs = notchSensitivity(material.utsMPa, rForQ, true);
    const Kf = 1 + q * (Kt - 1);
    const Kfs = 1 + qs * (Kts - 1);

    const { ZbendEff, ZtorsEff } = sectionModulusNet(od, id);
    // Rotating shaft: fully-reversed bending (Ma = M, Mm = 0), steady torque (Ta = 0, Tm = T).
    const sigmaA = Kf * M / ZbendEff;                 // von Mises alternating (τa = 0)
    const tauM = Kfs * T / ZtorsEff;
    const sigmaM = Math.sqrt(3) * tauM;               // von Mises midrange (σm = 0)
    const { se } = enduranceLimit(material, surface, input.reliabilityPct, od);

    const nf = fatigueSafety(input.fatigueCriterion, sigmaA, sigmaM, se, material.utsMPa, material.yieldMPa);
    // Static first-cycle yield: peak von Mises with Kf/Kfs applied (conservative).
    const sigmaMaxVM = Math.sqrt((Kf * M / ZbendEff) ** 2 + 3 * (Kfs * T / ZtorsEff) ** 2);
    const ny = material.yieldMPa / (sigmaMaxVM || 1e-9);

    // Required solid diameter for the target SF (DE-Goodman closed form).
    const A = 2 * Kf * (M / 1000); // N·m (Ma only, ×2 from von Mises)
    const B = Math.sqrt(3) * Kfs * (T / 1000);
    const reqD = Math.cbrt((16 * input.targetSafetyFactor / Math.PI) * (A / (se * 1e6) + B / (material.utsMPa * 1e6))) * 1000;

    return {
      positionMm: d.pos, label: d.label, featureId: d.featureId, odMm: od, idMm: id,
      bendingMomentNmm: M, torqueNmm: T, Kt, Kts, Kf, Kfs, seMPa: se,
      sigmaAMPa: sigmaA, sigmaMMPa: sigmaM, staticVonMisesMPa: sigmaMaxVM,
      fatigueSafety: nf, staticSafety: ny, requiredDiaMm: reqD, governing: false,
    };
  });

  let governing: StationResult | null = null;
  for (const s of stations) if (!governing || s.fatigueSafety < governing.fatigueSafety) governing = s;
  if (governing) governing.governing = true;

  // ── First lateral critical speed (Rayleigh) ──────────────────────────────
  const criticalSpeedRpm = rayleighCriticalSpeed(sections, bounds, xs, material, a, b, input.disks);

  return {
    lengthMm: L,
    reactionAyN: planeY.reactionA, reactionAzN: planeZ.reactionA, reactionA_N: Math.hypot(planeY.reactionA, planeZ.reactionA),
    reactionByN: planeY.reactionB, reactionBzN: planeZ.reactionB, reactionB_N: Math.hypot(planeY.reactionB, planeZ.reactionB),
    xs, momentY: planeY.moment, momentZ: planeZ.moment, momentRes, torque, deflRes,
    slopeADeg, slopeBDeg, maxDeflMm, maxDeflAtMm, maxMomentNmm, maxMomentAtMm,
    angleOfTwistDeg, stations, governing, criticalSpeedRpm, warnings,
  };
}

function rayleighCriticalSpeed(sections: ShaftSection[], bounds: number[], xs: number[], material: ShaftMaterial, a: number, b: number, disks: Disk[]): number | null {
  // Lumped masses: shaft self-weight per section (at centroid) + disks.
  const masses: { position: number; weightN: number }[] = [];
  sections.forEach((s, i) => {
    const g = geomOf(s);
    const massKg = material.densityKgM3 * (g.area * 1e-6) * (s.lengthMm * 1e-3);
    if (massKg > 0) masses.push({ position: (bounds[i] + bounds[i + 1]) / 2, weightN: massKg * 9.80665 });
  });
  for (const d of disks) if (d.massKg > 0) masses.push({ position: d.positionMm, weightN: d.massKg * 9.80665 });
  if (masses.length === 0) return null;

  // Static deflection under all the lumped weights (vertical plane).
  const forces: PointForce[] = masses.map((m) => ({ position: m.position, up: -m.weightN }));
  const plane = solvePlane(sections, bounds, xs, material.eMPa, forces, a, b);
  const deltas = masses.map((m) => Math.abs(interp(xs, plane.deflection, m.position)));

  let num = 0, den = 0;
  masses.forEach((m, i) => { num += m.weightN * deltas[i]; den += m.weightN * deltas[i] * deltas[i]; });
  if (den <= 0) return null;
  const omega = Math.sqrt((G_ACCEL * num) / den); // rad/s (g in mm/s², δ in mm)
  return (omega * 60) / (2 * Math.PI);
}
