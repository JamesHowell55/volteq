// Bolt-group ("bolt pattern") analysis under general 3-D loading — the classic
// "eccentrically loaded fastener group" problem covered in Shigley's Mechanical
// Engineering Design (Ch. 8, bolted/riveted joints loaded in shear), Blodgett's
// Design of Weldments (the identical method applied to weld groups), the AISC
// Steel Construction Manual's elastic method for bolt groups, and MechaniCalc's
// "Bolt Pattern Force Distribution" reference. Cross-checked against all of the
// above during development.
//
// Convention: the bolt pattern lies in the local x-y plane (the joint interface —
// e.g. a flange face or baseplate), with +z the bolt axis (out of the joint). All
// bolts are assumed identical (same size/grade/preload) and are treated as unit
// "point areas" — standard practice for this elementary method, since a bolt's own
// cross-section polar moment of inertia about its own centre is negligible next to
// the pattern's spread (Σ r²) once bolts are more than a diameter or two apart.
//
//   Fx, Fy  — in-plane (shear-plane) force components
//   Fz      — out-of-plane (joint-normal) force, +z = tension (pulling the joint apart)
//   Mz      — in-plane moment/torque about the joint normal -> causes secondary
//             ("torsional") shear in each bolt, via the elastic/polar method
//   Mx, My  — out-of-plane bending moments -> vary each bolt's axial (tension/
//             compression) demand linearly with position, via the general
//             (possibly unsymmetric) bending formula
//
// Shear (primary + secondary, elastic method):
//   Direct:     Fx,direct = Fx/n,  Fy,direct = Fy/n
//   Polar "moment of inertia" (bolts as points): J = Σ ri² = Ixx + Iyy
//   Torsional:  Fx,torsion,i = -Mz·(yi-ȳ)/J,  Fy,torsion,i = Mz·(xi-x̄)/J
//   Combine vectorially per bolt; the bolt farthest from the centroid IN THE
//   DIRECTION the torsional term adds to the direct term is usually critical.
//
// Axial/tension (bending, general unsymmetric-bending formula):
//   Ixx = Σ(yi-ȳ)²,  Iyy = Σ(xi-x̄)²,  Ixy = Σ(xi-x̄)(yi-ȳ)  [treating bolt area = 1]
//   F_axial,i = Fz/n + [ (Mx·Iyy - My·Ixy)·(yi-ȳ) + (My·Ixx - Mx·Ixy)·(xi-x̄) ]
//                      / (Ixx·Iyy - Ixy²)
//   This reduces to the familiar Mx·y/Ixx + My·x/Iyy superposition when Ixy = 0
//   (any pattern symmetric about the x or y axis) and generalises correctly for a
//   genuinely asymmetric custom layout — MechaniCalc's published method explicitly
//   assumes Ixy = 0 (principal axes aligned with the pattern), so this goes further
//   for a fully custom bolt layout.
//   Assumes the joint faces remain in contact (the applied moment doesn't exceed
//   what the preload can react before the joint starts to open) — the standard
//   "neutral axis at the centroid" elastic model used in Shigley/Bickford/NASA
//   fastener-group references, not a concrete-anchor "prying/cracked-section"
//   analysis.
//
// Combined per-bolt tension + shear check reuses the SAME von Mises + joint-
// stiffness-ratio convention as this site's Bolted Joint Calculator
// (boltedJointPhysics.ts) for internal consistency: Fb = Fi + C·P (external
// tension only partially adds to bolt tension, per the joint's stiffness ratio
// C), separation when Fi - (1-C)·P <= 0, and sqrt(tensile² + 3·shear²) against
// proof strength (distortion-energy / von Mises yield criterion).

import { torqueFromPreload, preloadFromTorque } from './boltedJointPhysics';

export interface BoltPoint {
  id: number;
  xMm: number;
  yMm: number;
}

// ---------------------------------------------------------------------------
// Pattern generators
// ---------------------------------------------------------------------------

export interface RectangularPatternInput {
  columns: number; // >= 1, along x
  rows: number; // >= 1, along y
  spacingXmm: number;
  spacingYmm: number;
}

export function generateRectangularPattern(inp: RectangularPatternInput): BoltPoint[] {
  const cols = Math.max(1, Math.round(inp.columns));
  const rows = Math.max(1, Math.round(inp.rows));
  const w = (cols - 1) * inp.spacingXmm;
  const h = (rows - 1) * inp.spacingYmm;
  const pts: BoltPoint[] = [];
  let id = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({ id: id++, xMm: c * inp.spacingXmm - w / 2, yMm: r * inp.spacingYmm - h / 2 });
    }
  }
  return pts;
}

export interface PerimeterPatternInput {
  widthMm: number; // x extent (centre-to-centre of corner bolts)
  heightMm: number; // y extent
  boltsPerXSide: number; // bolts along each of the top/bottom (x-running) edges, >= 2 (includes corners)
  boltsPerYSide: number; // bolts along each of the left/right (y-running) edges, >= 2 (includes corners)
}

// Bolts evenly spaced around the perimeter of a rectangle (a common real flange/
// cover-plate layout, e.g. 8 bolts around a square cover — distinct from a filled
// grid, which would also place bolts in the unused interior).
export function generatePerimeterPattern(inp: PerimeterPatternInput): BoltPoint[] {
  const nx = Math.max(2, Math.round(inp.boltsPerXSide));
  const ny = Math.max(2, Math.round(inp.boltsPerYSide));
  const hw = inp.widthMm / 2;
  const hh = inp.heightMm / 2;
  const pts: BoltPoint[] = [];
  const seen = new Set<string>();
  let id = 0;
  const push = (x: number, y: number) => {
    const key = `${x.toFixed(4)},${y.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pts.push({ id: id++, xMm: x, yMm: y });
  };
  // Top and bottom edges (y = +hh / -hh), nx bolts each, evenly spaced including corners.
  for (let i = 0; i < nx; i++) {
    const x = -hw + (i * (2 * hw)) / (nx - 1);
    push(x, hh);
    push(x, -hh);
  }
  // Left and right edges (x = -hw / +hw), ny bolts each — corners already placed above.
  for (let i = 1; i < ny - 1; i++) {
    const y = -hh + (i * (2 * hh)) / (ny - 1);
    push(hw, y);
    push(-hw, y);
  }
  return pts;
}

export interface CircularPatternInput {
  boltCount: number; // >= 2
  diameterMm: number; // bolt circle (pitch circle) diameter
  startAngleDeg: number; // angle of the first bolt, measured CCW from +x
}

export function generateCircularPattern(inp: CircularPatternInput): BoltPoint[] {
  const n = Math.max(2, Math.round(inp.boltCount));
  const r = inp.diameterMm / 2;
  const start = (inp.startAngleDeg * Math.PI) / 180;
  const pts: BoltPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (2 * Math.PI * i) / n;
    pts.push({ id: i, xMm: r * Math.cos(a), yMm: r * Math.sin(a) });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Section (pattern) geometry
// ---------------------------------------------------------------------------

export interface PatternGeometry {
  count: number;
  centroidXmm: number;
  centroidYmm: number;
  ixxMm2: number; // Σ(y-ȳ)² — resists Mx
  iyyMm2: number; // Σ(x-x̄)² — resists My
  ixyMm2: number; // Σ(x-x̄)(y-ȳ) — product of inertia (0 for a symmetric pattern)
  polarJmm2: number; // ixx + iyy — resists Mz (torsion)
  bendingResistant: boolean; // false if ixx*iyy - ixy^2 ~ 0 (e.g. colinear bolts) — can't react general bending
}

export function computePatternGeometry(points: BoltPoint[]): PatternGeometry {
  const n = points.length;
  const cx = n > 0 ? points.reduce((s, p) => s + p.xMm, 0) / n : 0;
  const cy = n > 0 ? points.reduce((s, p) => s + p.yMm, 0) / n : 0;
  let ixx = 0, iyy = 0, ixy = 0;
  for (const p of points) {
    const dx = p.xMm - cx;
    const dy = p.yMm - cy;
    ixx += dy * dy;
    iyy += dx * dx;
    ixy += dx * dy;
  }
  const det = ixx * iyy - ixy * ixy;
  return {
    count: n,
    centroidXmm: cx,
    centroidYmm: cy,
    ixxMm2: ixx,
    iyyMm2: iyy,
    ixyMm2: ixy,
    polarJmm2: ixx + iyy,
    bendingResistant: Math.abs(det) > 1e-6 * Math.max(ixx * iyy, 1),
  };
}

// ---------------------------------------------------------------------------
// Reduce an applied force (at an offset point) + a direct moment to an
// equivalent force + moment acting at the pattern centroid — standard statics
// (moment transfer / "reduction of a force system to a single force and couple").
// ---------------------------------------------------------------------------

export interface AppliedLoadInput {
  forceXN: number;
  forceYN: number;
  forceZN: number; // +z = tension (pulls the joint apart)
  appXmm: number; // application point, relative to the pattern centroid
  appYmm: number;
  appZmm: number; // standoff from the joint plane (+z = away from the joint, toward the load)
  momentXNmm: number; // additional DIRECT moment (e.g. a shaft torque), already at the app. point
  momentYNmm: number;
  momentZNmm: number;
}

export interface EquivalentLoad {
  fxN: number;
  fyN: number;
  fzN: number;
  mxNmm: number;
  myNmm: number;
  mzNmm: number;
}

export function resolveLoadToCentroid(inp: AppliedLoadInput): EquivalentLoad {
  // Moment of the offset force about the centroid: r x F (moments are free vectors,
  // so the direct moment just carries straight across unchanged).
  const rx = inp.appXmm, ry = inp.appYmm, rz = inp.appZmm;
  const fx = inp.forceXN, fy = inp.forceYN, fz = inp.forceZN;
  const mxFromForce = ry * fz - rz * fy;
  const myFromForce = rz * fx - rx * fz;
  const mzFromForce = rx * fy - ry * fx;
  return {
    fxN: fx,
    fyN: fy,
    fzN: fz,
    mxNmm: inp.momentXNmm + mxFromForce,
    myNmm: inp.momentYNmm + myFromForce,
    mzNmm: inp.momentZNmm + mzFromForce,
  };
}

export function boltShankAreaMm2(nominalDiameterMm: number): number {
  return (Math.PI / 4) * nominalDiameterMm * nominalDiameterMm;
}

// ---------------------------------------------------------------------------
// Bolt spec / preload
// ---------------------------------------------------------------------------

export interface BoltSpecInput {
  nominalDiameterMm: number;
  pitchMm: number;
  pitchDiameterMm: number;
  tensileStressAreaMm2: number;
  bearingDiameterMm: number; // under-head bearing face diameter, for torque<->preload
  frictionMu: number; // same coefficient used for both thread and bearing (simplified vs. the twin-mu Bolted Joint Calculator)
  proofStrengthMPa: number;
}

export function preloadFromTorqueSimple(torqueNm: number, spec: BoltSpecInput): number {
  return preloadFromTorque(torqueNm, spec.pitchDiameterMm, spec.pitchMm, spec.frictionMu, spec.bearingDiameterMm, spec.frictionMu);
}

export function torqueFromPreloadSimple(preloadN: number, spec: BoltSpecInput): number {
  return torqueFromPreload(preloadN, spec.pitchDiameterMm, spec.pitchMm, spec.frictionMu, spec.bearingDiameterMm, spec.frictionMu).torqueNm;
}

// ---------------------------------------------------------------------------
// Full solve
// ---------------------------------------------------------------------------

export interface BoltLoadResult {
  id: number;
  xMm: number;
  yMm: number;
  rFromCentroidMm: number;
  directShearXN: number;
  directShearYN: number;
  torsionalShearXN: number;
  torsionalShearYN: number;
  totalShearXN: number;
  totalShearYN: number;
  resultantShearN: number;
  axialFromExternalN: number; // + tension, - compression side; from Fz + bending superposition
  preloadN: number;
  boltTensionN: number; // Fi + C * axialFromExternalN
  residualClampN: number; // Fi - (1-C) * axialFromExternalN — <=0 means this bolt's joint face has separated
  separated: boolean;
  shearStressMPa: number;
  tensileStressMPa: number;
  vonMisesStressMPa: number;
  vonMisesSafetyFactor: number;
  separationSafetyFactor: number;
}

export interface BoltPatternResult {
  geometry: PatternGeometry;
  equivalentLoad: EquivalentLoad;
  bolts: BoltLoadResult[];
  criticalBoltId: number; // lowest von Mises safety factor
  minSeparationBoltId: number; // lowest separation safety factor
  overallVonMisesSafetyFactor: number;
  overallSeparationSafetyFactor: number;
}

export function solveBoltPattern(
  points: BoltPoint[],
  geometry: PatternGeometry,
  load: EquivalentLoad,
  preloadN: number,
  jointStiffnessC: number,
  spec: BoltSpecInput,
  shankAreaMm2: number
): BoltPatternResult {
  const n = points.length;
  const { centroidXmm: cx, centroidYmm: cy, ixxMm2: ixx, iyyMm2: iyy, ixyMm2: ixy, polarJmm2: J } = geometry;
  const det = ixx * iyy - ixy * ixy;

  const directShearX = n > 0 ? load.fxN / n : 0;
  const directShearY = n > 0 ? load.fyN / n : 0;
  const directAxial = n > 0 ? load.fzN / n : 0;

  const bolts: BoltLoadResult[] = points.map((p) => {
    const dx = p.xMm - cx;
    const dy = p.yMm - cy;
    const r = Math.hypot(dx, dy);

    const torsionX = J > 1e-9 ? (-load.mzNmm * dy) / J : 0;
    const torsionY = J > 1e-9 ? (load.mzNmm * dx) / J : 0;
    const totalShearX = directShearX + torsionX;
    const totalShearY = directShearY + torsionY;
    const resultantShear = Math.hypot(totalShearX, totalShearY);

    const bendingAxial =
      Math.abs(det) > 1e-9
        ? ((load.mxNmm * iyy - load.myNmm * ixy) * dy + (load.myNmm * ixx - load.mxNmm * ixy) * dx) / det
        : 0;
    const axialFromExternal = directAxial + bendingAxial;

    const boltTension = preloadN + jointStiffnessC * axialFromExternal;
    const residualClamp = preloadN - (1 - jointStiffnessC) * axialFromExternal;
    const separated = residualClamp <= 0;

    const shearStressMPa = shankAreaMm2 > 0 ? resultantShear / shankAreaMm2 : 0;
    const tensileStressMPa = spec.tensileStressAreaMm2 > 0 ? Math.max(boltTension, 0) / spec.tensileStressAreaMm2 : 0;
    const vonMisesStressMPa = Math.sqrt(tensileStressMPa * tensileStressMPa + 3 * shearStressMPa * shearStressMPa);
    const vonMisesSafetyFactor = vonMisesStressMPa > 1e-9 ? spec.proofStrengthMPa / vonMisesStressMPa : Infinity;
    const separatingForce = (1 - jointStiffnessC) * axialFromExternal;
    const separationSafetyFactor = separatingForce > 1e-9 ? preloadN / separatingForce : Infinity;

    return {
      id: p.id,
      xMm: p.xMm,
      yMm: p.yMm,
      rFromCentroidMm: r,
      directShearXN: directShearX,
      directShearYN: directShearY,
      torsionalShearXN: torsionX,
      torsionalShearYN: torsionY,
      totalShearXN: totalShearX,
      totalShearYN: totalShearY,
      resultantShearN: resultantShear,
      axialFromExternalN: axialFromExternal,
      preloadN,
      boltTensionN: boltTension,
      residualClampN: residualClamp,
      separated,
      shearStressMPa,
      tensileStressMPa,
      vonMisesStressMPa,
      vonMisesSafetyFactor,
      separationSafetyFactor,
    };
  });

  let criticalBoltId = bolts.length > 0 ? bolts[0].id : -1;
  let minSeparationBoltId = bolts.length > 0 ? bolts[0].id : -1;
  let overallVM = Infinity;
  let overallSep = Infinity;
  for (const b of bolts) {
    if (b.vonMisesSafetyFactor < overallVM) { overallVM = b.vonMisesSafetyFactor; criticalBoltId = b.id; }
    if (b.separationSafetyFactor < overallSep) { overallSep = b.separationSafetyFactor; minSeparationBoltId = b.id; }
  }

  return {
    geometry,
    equivalentLoad: load,
    bolts,
    criticalBoltId,
    minSeparationBoltId,
    overallVonMisesSafetyFactor: overallVM,
    overallSeparationSafetyFactor: overallSep,
  };
}
