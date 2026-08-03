// Reference data for the Spline Sizing calculator: standard involute-spline
// profile parameters (ISO 4156 / ANSI B92.2M metric module, side fit), spline
// material design strengths, and the SAE/Dudley torque-capacity factor tables
// (application, load-distribution, fatigue-life and wear-life factors) as
// summarised by RoyMech from SAE/ANSI B92.1 practice.
//
// Sources cross-checked while building this file:
//  - ISO 4156-1:2021 Table 1 (formulae for basic dimensions) and ISO 4156-2:2021
//    dimension tables (used to validate the geometry engine — see splinePhysics.ts).
//  - RoyMech "Key and Spline Strength" + "Spline Factors" pages (SAE/Dudley method).

export type PressureAngleDeg = 30 | 37.5 | 45;
export type RootType = 'flat' | 'fillet';
export type SplineFitType = 'fixed' | 'flexible';

export interface PressureAngleMeta {
  deg: PressureAngleDeg;
  label: string;
  // External spline (shaft) major-diameter addendum coefficient: Dee = m*(z + addCoeff).
  addCoeff: number;
  // Dedendum coefficient by root type: internal major Dei = m*(z + dedCoeff),
  // external minor (root) Die = m*(z - dedCoeff). Flat root only defined at 30°.
  dedCoeff: Record<RootType, number | null>;
  // Form tooth height hs (ISO 4156, used for the form-diameter reference).
  formToothHeightCoeff: number;
  roots: RootType[];
}

// ISO 4156 defines three standard pressure angles. The 30° profile (with a flat
// or fillet root) is by far the most common (and is the ANSI B92.1 / DIN 5480
// angle); 37.5° and 45° use progressively shorter, stubbier teeth (fillet root
// only) for higher tooth counts and thinner-walled hubs.
export const PRESSURE_ANGLES: Record<string, PressureAngleMeta> = {
  '30': {
    deg: 30, label: '30°',
    addCoeff: 1.0,
    dedCoeff: { flat: 1.5, fillet: 1.8 },
    formToothHeightCoeff: 0.6,
    roots: ['flat', 'fillet'],
  },
  '37.5': {
    deg: 37.5, label: '37.5°',
    addCoeff: 0.9,
    dedCoeff: { flat: null, fillet: 1.4 },
    formToothHeightCoeff: 0.55,
    roots: ['fillet'],
  },
  '45': {
    deg: 45, label: '45°',
    addCoeff: 0.8,
    dedCoeff: { flat: null, fillet: 1.2 },
    formToothHeightCoeff: 0.5,
    roots: ['fillet'],
  },
};

export const PRESSURE_ANGLE_LIST = [PRESSURE_ANGLES['30'], PRESSURE_ANGLES['37.5'], PRESSURE_ANGLES['45']];

// Radial depth of flank engagement h used for the bearing (compressive) stress
// area, per RoyMech/SAE: 0.9*m for a 30° flat root, 1.0*m for a fillet root.
export function engagementHeightMm(moduleMm: number, root: RootType): number {
  return root === 'flat' ? 0.9 * moduleMm : 1.0 * moduleMm;
}

// Preferred module series (ISO 4156 / general engineering), in mm.
export const STANDARD_MODULES = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10,
];

export interface SplineMaterial {
  id: string;
  label: string;
  hardness: string;
  utsMPa: number;
  // Allowable design stresses per RoyMech (SAE/Dudley practice), MPa.
  allowCompressiveMPa: number; // bearing / wear limit on the tooth flanks
  allowShearMPa: number;       // tooth shear and shaft-core torsional shear limit
}

// Spline material design strengths (RoyMech "Spline Factors", SAE/Dudley basis).
export const SPLINE_MATERIALS: SplineMaterial[] = [
  { id: 'structural', label: 'Structural steel', hardness: '150–200 HB', utsMPa: 350, allowCompressiveMPa: 90, allowShearMPa: 140 },
  { id: 'carbon', label: 'Carbon steel (e.g. C45)', hardness: '220–270 HB', utsMPa: 500, allowCompressiveMPa: 130, allowShearMPa: 200 },
  { id: 'alloy', label: 'Alloy steel, hardened', hardness: '300–350 HB (33–38 HRC)', utsMPa: 600, allowCompressiveMPa: 200, allowShearMPa: 275 },
  { id: 'surface-hardened', label: 'Surface-hardened steel', hardness: '~650 HB (45–53 HRC)', utsMPa: 650, allowCompressiveMPa: 250, allowShearMPa: 275 },
  { id: 'cast-iron-sg', label: 'Cast iron (spheroidal graphite)', hardness: '~400 HB', utsMPa: 400, allowCompressiveMPa: 135, allowShearMPa: 140 },
];

// ---- SAE/Dudley torque-capacity factor tables (RoyMech) ----

export interface ApplicationFactorRow {
  id: string;
  powerSource: string;
  uniform: number;
  lightShock: number;
  intermittentShock: number;
  heavyShock: number;
}

// Application factor Ka: power source (rows) x driven-load character (columns).
export const APPLICATION_FACTORS: ApplicationFactorRow[] = [
  { id: 'uniform', powerSource: 'Uniform (turbine, electric motor)', uniform: 1.0, lightShock: 1.2, intermittentShock: 1.5, heavyShock: 1.8 },
  { id: 'light', powerSource: 'Light shock (hydraulic motor)', uniform: 1.2, lightShock: 1.3, intermittentShock: 1.8, heavyShock: 2.1 },
  { id: 'medium', powerSource: 'Medium shock (IC engine)', uniform: 2.0, lightShock: 2.2, intermittentShock: 2.4, heavyShock: 2.8 },
];

export const LOAD_CHARACTERS = [
  { id: 'uniform', label: 'Uniform load' },
  { id: 'lightShock', label: 'Light shock' },
  { id: 'intermittentShock', label: 'Intermittent shock' },
  { id: 'heavyShock', label: 'Heavy shock' },
] as const;
export type LoadCharacterId = typeof LOAD_CHARACTERS[number]['id'];

export function applicationFactor(powerSourceId: string, loadId: LoadCharacterId): number {
  const row = APPLICATION_FACTORS.find((r) => r.id === powerSourceId) ?? APPLICATION_FACTORS[0];
  return row[loadId];
}

// Fatigue-life factor Kf (fixed splines): torque cycles vs unidirectional /
// fully-reversed loading. Kf < 1 derates capacity for high cycle counts.
export const FATIGUE_LIFE_FACTORS = [
  { cycles: 1e3, unidirectional: 1.8, reversed: 1.8 },
  { cycles: 1e4, unidirectional: 1.0, reversed: 1.0 },
  { cycles: 1e5, unidirectional: 0.5, reversed: 0.4 },
  { cycles: 1e6, unidirectional: 0.4, reversed: 0.3 },
  { cycles: 1e7, unidirectional: 0.3, reversed: 0.2 },
];

// Wear-life factor Kw (flexible/sliding splines): revolutions under load.
export const WEAR_LIFE_FACTORS = [
  { revolutions: 1e4, factor: 4.0 },
  { revolutions: 1e5, factor: 2.8 },
  { revolutions: 1e6, factor: 2.0 },
  { revolutions: 1e7, factor: 1.4 },
  { revolutions: 1e8, factor: 1.0 },
  { revolutions: 1e9, factor: 0.7 },
  { revolutions: 1e10, factor: 0.5 },
];

// Log-interpolate a life factor from a (x -> factor) table (x on a log scale).
function logInterp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (Math.log10(x) - Math.log10(xs[i])) / (Math.log10(xs[i + 1]) - Math.log10(xs[i]));
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

export function fatigueLifeFactor(cycles: number, reversed: boolean): number {
  return logInterp(cycles, FATIGUE_LIFE_FACTORS.map((r) => r.cycles), FATIGUE_LIFE_FACTORS.map((r) => (reversed ? r.reversed : r.unidirectional)));
}

export function wearLifeFactor(revolutions: number): number {
  return logInterp(revolutions, WEAR_LIFE_FACTORS.map((r) => r.revolutions), WEAR_LIFE_FACTORS.map((r) => r.factor));
}
