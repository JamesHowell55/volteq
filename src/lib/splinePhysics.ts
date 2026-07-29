// Involute spline geometry + torque-capacity engine, ISO 4156 (metric module,
// side fit) geometry with the SAE/Dudley torque-capacity method.
//
// Geometry is validated against the published ISO 4156-2:2021 dimension tables
// (see the scratch validation script / the "Validated" note on the page):
//   α=30°, m=0.5, z=10  ->  D=5.000, Db=4.330, Dee=5.50, and the measurement over
//   1.06 mm pins reproduces the standard's MRe table value to within its tooth-
//   thickness tolerance band.
//
// Torque capacity follows the SAE/ANSI B92.1 (Dudley) method as summarised by
// RoyMech: tooth shear and flank compressive (bearing) stress, with application,
// load-distribution, fatigue-life and wear-life factors rolled into a service
// factor Ks, plus a torsional-shear check on the shaft core at the minor diameter.

import {
  engagementHeightMm, PRESSURE_ANGLES, applicationFactor, fatigueLifeFactor, wearLifeFactor,
  type PressureAngleDeg, type RootType, type SplineFitType, type SplineMaterial, type LoadCharacterId,
} from './splineData';

const DEG = Math.PI / 180;

// Involute function inv(a) = tan(a) - a, with a in radians.
export function involute(aRad: number): number {
  return Math.tan(aRad) - aRad;
}

// Inverse involute: solve inv(a) = value for a (radians), via Newton's method.
// d/da[tan a - a] = tan^2 a, so the update is stable for 0 < a < 80°-ish.
export function inverseInvolute(value: number): number {
  if (value <= 0) return 0;
  let a = Math.cbrt(3 * value); // good initial guess for small angles
  for (let i = 0; i < 60; i++) {
    const f = Math.tan(a) - a - value;
    const df = Math.tan(a) ** 2;
    const step = f / df;
    a -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return a;
}

export interface SplineGeometryInput {
  moduleMm: number;
  teeth: number;
  pressureAngleDeg: PressureAngleDeg;
  root: RootType;
  pinDiameterMm: number; // measuring ball/pin diameter for measurement over pins
}

export interface SplineGeometry {
  moduleMm: number;
  teeth: number;
  pressureAngleDeg: PressureAngleDeg;
  root: RootType;
  pitchDiaMm: number;        // D  = m·z (reference diameter)
  baseDiaMm: number;         // Db = m·z·cos α
  majorDiaMm: number;        // Dee external tip diameter
  minorDiaMm: number;        // Die external root (minor) diameter, nominal
  formDiaMm: number;         // DFe external form diameter (start of true involute)
  internalMajorDiaMm: number;// Dei internal major (hub root) diameter, nominal
  internalMinorDiaMm: number;// Dii internal minor (hub tooth tip) diameter, nominal
  circularPitchMm: number;   // p  = π·m
  basePitchMm: number;       // pb = π·m·cos α
  toothThicknessMm: number;  // s  = basic circular tooth thickness at D (= 0.5·π·m)
  spaceWidthMm: number;      // E  = basic circular space width (= 0.5·π·m)
  pinDiameterMm: number;
  measurementOverPinsMm: number; // MRe over two pins (external spline)
  pinContactAngleDeg: number;    // pressure angle at pin centre
  contactDiaMm: number;          // diameter at which the pin touches the flank
  pinContactValid: boolean;      // pin touches between form and tip diameters
}

export function computeGeometry(input: SplineGeometryInput): SplineGeometry {
  const { moduleMm: m, teeth: z, pressureAngleDeg, root, pinDiameterMm } = input;
  const meta = PRESSURE_ANGLES[String(pressureAngleDeg)];
  const alpha = pressureAngleDeg * DEG;
  const dedCoeff = meta.dedCoeff[root] ?? meta.dedCoeff.fillet ?? 1.5;

  const D = m * z;
  const Db = m * z * Math.cos(alpha);
  const p = Math.PI * m;
  const pb = Math.PI * m * Math.cos(alpha);
  const s = 0.5 * Math.PI * m; // basic circular tooth thickness
  const E = 0.5 * Math.PI * m; // basic circular space width

  const Dee = m * (z + meta.addCoeff);       // external tip
  const Die = m * (z - dedCoeff);            // external root (minor), nominal
  const Dei = m * (z + dedCoeff);            // internal major (hub root), nominal
  // External form diameter: bottom of the usable involute flank. Taken at the
  // reference dedendum less the ISO form clearance (~0.1·m), i.e. one module
  // below the pitch line for a 30° profile.
  const DFe = m * (z - meta.addCoeff) + 0.2 * m;
  const Dii = m * (z - meta.addCoeff);       // internal minor (hub tip), nominal

  // ---- Measurement over pins (external spline), ISO 4156-3 method ----
  // inv(φ) = s/D + inv(α) + DR/Db − π/z ; φ = pressure angle at the pin centre.
  const invPhi = s / D + involute(alpha) + pinDiameterMm / Db - Math.PI / z;
  const phi = inverseInvolute(invPhi);
  const pinCentreCircle = Db / Math.cos(phi);
  const even = z % 2 === 0;
  const MRe = even
    ? pinCentreCircle + pinDiameterMm
    : pinCentreCircle * Math.cos(Math.PI / (2 * z)) + pinDiameterMm;
  // Diameter at which the pin actually contacts the flank. The contact point sits
  // inboard of the pin centre along the same line of action (tangent to the base
  // circle): tan(α_contact) = tan(φ) − DR/Db, and dce = Db / cos(α_contact). The
  // pin is a valid gauge if that lands on the true involute flank (form..tip).
  const tanContact = Math.tan(phi) - pinDiameterMm / Db;
  const alphaContact = Math.atan(Math.max(0, tanContact));
  const contactDia = Db / Math.cos(alphaContact);
  const pinContactValid = contactDia >= DFe - 1e-6 && contactDia <= Dee + 1e-6;

  return {
    moduleMm: m, teeth: z, pressureAngleDeg, root,
    pitchDiaMm: D, baseDiaMm: Db, majorDiaMm: Dee, minorDiaMm: Die, formDiaMm: DFe,
    internalMajorDiaMm: Dei, internalMinorDiaMm: Dii,
    circularPitchMm: p, basePitchMm: pb, toothThicknessMm: s, spaceWidthMm: E,
    pinDiameterMm, measurementOverPinsMm: MRe, pinContactAngleDeg: phi / DEG,
    contactDiaMm: contactDia, pinContactValid,
  };
}

// ---- Torque capacity (SAE / Dudley, per RoyMech) ----

export interface TorqueRatingInput {
  geometry: SplineGeometry;
  engagementLengthMm: number;  // L, effective flank length in mesh
  material: SplineMaterial;
  fitType: SplineFitType;      // fixed (non-sliding) vs flexible (sliding)
  powerSourceId: string;       // application-factor row
  loadCharacterId: LoadCharacterId;
  loadDistributionFactor: number; // Km (misalignment / face-width)
  designFactor: number;           // Kd (overload), typically 1.0
  torqueCycles: number;        // for Kf (fixed splines)
  reversed: boolean;
  wearRevolutions: number;     // for Kw (flexible splines)
  appliedTorqueNm: number;
}

export interface TorqueRatingResult {
  Ka: number;
  Km: number;
  Kf: number;
  Kw: number;
  Kd: number;
  serviceFactorKs: number;
  engagementHeightMm: number;
  toothThicknessMm: number;
  // Stresses at the applied torque (MPa).
  shearStressMPa: number;
  compressiveStressMPa: number;
  shaftCoreShearMPa: number;
  // Allowable-limited torque capacities (N·m).
  torqueCapShearNm: number;
  torqueCapCompressiveNm: number;
  torqueCapShaftCoreNm: number;
  torqueCapacityNm: number;      // governing (minimum)
  governingMode: 'tooth shear' | 'flank bearing' | 'shaft core';
  safetyFactor: number;          // capacity / applied
  pass: boolean;
}

export function computeTorqueRating(input: TorqueRatingInput): TorqueRatingResult {
  const g = input.geometry;
  const Ka = applicationFactor(input.powerSourceId, input.loadCharacterId);
  const Km = input.loadDistributionFactor;
  const Kd = input.designFactor;
  const Kf = fatigueLifeFactor(input.torqueCycles, input.reversed);
  const Kw = wearLifeFactor(input.wearRevolutions);

  // Service factor Ks (RoyMech): fixed/close-fit spline Ks = Ka/Kf, flexible/
  // sliding spline Ks = Ka·Km·Kd/Kw. Ks scales the stress (equivalently derates
  // the allowable) for the chosen duty.
  const Ks = input.fitType === 'fixed'
    ? (Ka / Kf)
    : (Ka * Km * Kd / Kw);

  const D = g.pitchDiaMm;
  const z = g.teeth;
  const L = input.engagementLengthMm;
  const t = g.toothThicknessMm;
  const h = engagementHeightMm(g.moduleMm, g.root);
  const Die = g.minorDiaMm;

  // Applied torque in N·mm for stress in MPa (N/mm²).
  const T = input.appliedTorqueNm * 1000;

  // Tooth shear at the pitch line: τ = 2·T·Ks / (L·z·t·D)
  const shear = (2 * T * Ks) / (L * z * t * D);
  // Flank bearing (compressive) stress: σc = 2·T·Ks / (L·z·h·D)
  const compressive = (2 * T * Ks) / (L * z * h * D);
  // Shaft core torsional shear at the minor diameter: τ = 16·T·Ks / (π·Die³)
  const shaftCore = (16 * T * Ks) / (Math.PI * Die ** 3);

  const allowShear = input.material.allowShearMPa;
  const allowComp = input.material.allowCompressiveMPa;

  // Invert each check to a torque capacity (N·m).
  const capShear = (allowShear * L * z * t * D) / (2 * Ks) / 1000;
  const capComp = (allowComp * L * z * h * D) / (2 * Ks) / 1000;
  const capShaft = (allowShear * Math.PI * Die ** 3) / (16 * Ks) / 1000;

  const caps: Array<{ mode: TorqueRatingResult['governingMode']; cap: number }> = [
    { mode: 'tooth shear', cap: capShear },
    { mode: 'flank bearing', cap: capComp },
    { mode: 'shaft core', cap: capShaft },
  ];
  const governing = caps.reduce((a, b) => (b.cap < a.cap ? b : a));
  const capacity = governing.cap;
  const applied = input.appliedTorqueNm;
  const safety = applied > 0 ? capacity / applied : Infinity;

  return {
    Ka, Km, Kf, Kw, Kd, serviceFactorKs: Ks,
    engagementHeightMm: h, toothThicknessMm: t,
    shearStressMPa: shear, compressiveStressMPa: compressive, shaftCoreShearMPa: shaftCore,
    torqueCapShearNm: capShear, torqueCapCompressiveNm: capComp, torqueCapShaftCoreNm: capShaft,
    torqueCapacityNm: capacity, governingMode: governing.mode,
    safetyFactor: safety, pass: capacity >= applied,
  };
}

// ---- Torque vs diameter sweep across a standard tooth-count series ----
// At a fixed module and profile, capacity grows with tooth count (hence pitch
// diameter). This answers "what pitch diameter do I need for this torque?".
export interface SweepPoint {
  teeth: number;
  pitchDiaMm: number;
  majorDiaMm: number;
  torqueCapacityNm: number;
  governingMode: TorqueRatingResult['governingMode'];
  meetsTarget: boolean;
}

export function torqueDiameterSweep(base: TorqueRatingInput, teethList: number[], targetTorqueNm: number): SweepPoint[] {
  return teethList.map((z) => {
    const geometry = computeGeometry({
      moduleMm: base.geometry.moduleMm, teeth: z, pressureAngleDeg: base.geometry.pressureAngleDeg,
      root: base.geometry.root, pinDiameterMm: base.geometry.pinDiameterMm,
    });
    const r = computeTorqueRating({ ...base, geometry });
    return {
      teeth: z, pitchDiaMm: geometry.pitchDiaMm, majorDiaMm: geometry.majorDiaMm,
      torqueCapacityNm: r.torqueCapacityNm, governingMode: r.governingMode,
      meetsTarget: r.torqueCapacityNm >= targetTorqueNm,
    };
  });
}

// Smallest tooth count (from a candidate list) whose capacity meets the target.
export function smallestSplineForTorque(base: TorqueRatingInput, teethList: number[], targetTorqueNm: number): SweepPoint | null {
  const sweep = torqueDiameterSweep(base, teethList, targetTorqueNm);
  return sweep.find((p) => p.meetsTarget) ?? null;
}

// ---- Tooth-profile point generation (shared by the SVG diagram and DXF export) ----
// Returns the closed outline of the external spline end-view as [x,y] points (mm),
// centred on the axis, plus the key reference-circle diameters.
export interface ProfilePoint { x: number; y: number; }

export function generateProfilePoints(g: SplineGeometry, flankSteps = 12): ProfilePoint[] {
  const rb = g.baseDiaMm / 2;
  const rTip = g.majorDiaMm / 2;
  const rForm = Math.max(g.formDiaMm / 2, rb + 1e-4); // involute only exists above rb
  const rRoot = g.minorDiaMm / 2;
  const alpha = g.pressureAngleDeg * DEG;
  const halfToothAnglePitch = g.toothThicknessMm / g.pitchDiaMm; // (s/2)/(D/2)
  const invAlpha = involute(alpha);
  const pitchAngle = (2 * Math.PI) / g.teeth;

  // Angular position of the right flank at radius r, measured from tooth centre.
  const flankAngle = (r: number): number => {
    const ar = Math.acos(Math.min(1, rb / r));
    return halfToothAnglePitch + invAlpha - involute(ar);
  };

  const pts: ProfilePoint[] = [];
  const push = (r: number, ang: number) => pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });

  // Traverse each tooth counter-clockwise (low angle -> high angle): up the left
  // flank, across the tip land, down the right flank, then into the root valley.
  // Consecutive teeth join across the root circle automatically.
  for (let i = 0; i < g.teeth; i++) {
    const centre = i * pitchAngle;
    push(rRoot, centre - flankAngle(rForm));            // left flank root
    for (let s = 0; s <= flankSteps; s++) {             // left flank: form -> tip
      const r = rForm + (rTip - rForm) * (s / flankSteps);
      push(r, centre - flankAngle(r));
    }
    push(rTip, centre + flankAngle(rTip));              // tip land (left -> right)
    for (let s = flankSteps; s >= 0; s--) {             // right flank: tip -> form
      const r = rForm + (rTip - rForm) * (s / flankSteps);
      push(r, centre + flankAngle(r));
    }
    push(rRoot, centre + flankAngle(rForm));            // right flank root
  }
  return pts;
}
