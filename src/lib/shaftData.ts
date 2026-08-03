// Reference data for the Shaft Sizing calculator: shaft materials (strength +
// stiffness + density), the Marin endurance-limit modifiers (surface finish,
// reliability), and the stress-concentration feature library used at each
// evaluation station. Method follows Shigley's Mechanical Engineering Design
// (Ch. 6 fatigue, Ch. 7 shafts) / ASME B106.1M.
//
// The surface-finish and notch-sensitivity constants below were cross-checked
// against the worked examples in Shigley Ch. 7 (e.g. machined ka = 4.51·Sut^−0.265
// → 0.84 at Sut = 560 MPa; Neuber q → 0.72 bending / 0.77 torsion for the same
// case) — see the validation note in shaftPhysics.ts.

export interface ShaftMaterial {
  id: string;
  label: string;
  utsMPa: number;   // Sut
  yieldMPa: number; // Sy
  eMPa: number;     // Young's modulus E
  gMPa: number;     // shear modulus G
  densityKgM3: number;
}

// Representative handbook values (Shigley Table A-20 / manufacturer typical) —
// a starting point, not a substitute for a mill certificate on a real design.
export const SHAFT_MATERIALS: ShaftMaterial[] = [
  { id: '1018cd', label: 'AISI 1018 CD steel', utsMPa: 440, yieldMPa: 370, eMPa: 205000, gMPa: 80000, densityKgM3: 7870 },
  { id: '1045cd', label: 'AISI 1045 CD steel', utsMPa: 630, yieldMPa: 530, eMPa: 205000, gMPa: 80000, densityKgM3: 7870 },
  { id: '4140qt', label: 'AISI 4140 Q&T steel', utsMPa: 1020, yieldMPa: 655, eMPa: 205000, gMPa: 80000, densityKgM3: 7850 },
  { id: '4340qt', label: 'AISI 4340 Q&T steel', utsMPa: 1240, yieldMPa: 1070, eMPa: 205000, gMPa: 80000, densityKgM3: 7850 },
  { id: '304ss', label: 'AISI 304 stainless', utsMPa: 515, yieldMPa: 205, eMPa: 193000, gMPa: 74000, densityKgM3: 8000 },
  { id: '17-4ph', label: '17-4 PH stainless (H900)', utsMPa: 1310, yieldMPa: 1170, eMPa: 197000, gMPa: 77000, densityKgM3: 7800 },
  { id: '7075t6', label: 'Aluminium 7075-T6', utsMPa: 572, yieldMPa: 503, eMPa: 71700, gMPa: 26900, densityKgM3: 2810 },
  { id: 'ti6al4v', label: 'Titanium Ti-6Al-4V', utsMPa: 950, yieldMPa: 880, eMPa: 114000, gMPa: 44000, densityKgM3: 4430 },
];

// Marin surface-finish factor ka = a·Sut^b (Sut in MPa), Shigley Table 6-2 (SI).
export interface SurfaceFinish { id: string; label: string; a: number; b: number; }
export const SURFACE_FINISHES: SurfaceFinish[] = [
  { id: 'ground', label: 'Ground', a: 1.58, b: -0.085 },
  { id: 'machined', label: 'Machined / cold-drawn', a: 4.51, b: -0.265 },
  { id: 'hot-rolled', label: 'Hot-rolled', a: 57.7, b: -0.718 },
  { id: 'forged', label: 'As-forged', a: 272, b: -0.995 },
];

// Marin reliability factor ke, Shigley Table 6-5.
export interface ReliabilityOption { pct: number; ke: number; }
export const RELIABILITY_OPTIONS: ReliabilityOption[] = [
  { pct: 50, ke: 1.0 },
  { pct: 90, ke: 0.897 },
  { pct: 95, ke: 0.868 },
  { pct: 99, ke: 0.814 },
  { pct: 99.9, ke: 0.753 },
];

// Stress-concentration feature at an evaluation station. 'shoulder-fillet' uses
// the Peterson/Pilkey curve fits (from D/d and the fillet radius); the others
// use Shigley Table 7-1 first-iteration estimates; 'custom' takes user Kt/Kts.
export type StressFeatureId = 'shoulder-fillet' | 'keyseat-profile' | 'keyseat-sled' | 'groove' | 'none' | 'custom';

export interface StressFeature {
  id: StressFeatureId;
  label: string;
  // Table 7-1 quick estimates (used when not the Peterson-fit shoulder fillet).
  ktBending?: number;
  ktsTorsion?: number;
  note: string;
}

export const STRESS_FEATURES: Record<StressFeatureId, StressFeature> = {
  'shoulder-fillet': { id: 'shoulder-fillet', label: 'Shoulder fillet (step)', note: 'Kt from the Peterson/Pilkey fit for the diameter ratio D/d and fillet radius r.' },
  'keyseat-profile': { id: 'keyseat-profile', label: 'Profile (end-mill) keyseat', ktBending: 2.14, ktsTorsion: 3.0, note: 'Shigley Table 7-1 first-iteration estimate for an end-milled keyseat.' },
  'keyseat-sled': { id: 'keyseat-sled', label: 'Sled-runner keyseat', ktBending: 1.7, ktsTorsion: 3.0, note: 'Shigley Table 7-1 first-iteration estimate for a sled-runner keyseat.' },
  'groove': { id: 'groove', label: 'Retaining-ring groove', ktBending: 5.0, ktsTorsion: 3.0, note: 'Shigley Table 7-1 first-iteration estimate for a retaining-ring groove — a severe riser.' },
  'none': { id: 'none', label: 'Plain (no riser)', ktBending: 1.0, ktsTorsion: 1.0, note: 'No stress concentration (a plain cylindrical section).' },
  'custom': { id: 'custom', label: 'Custom Kt / Kts', note: 'Enter the theoretical stress-concentration factors directly (e.g. from Peterson for a cross-hole).' },
};

export const STRESS_FEATURE_LIST = Object.values(STRESS_FEATURES);

// Fatigue failure criteria (Shigley Eqs 7-8..7-15).
export type FatigueCriterionId = 'goodman' | 'gerber' | 'elliptic' | 'soderberg';
export const FATIGUE_CRITERIA: { id: FatigueCriterionId; label: string; note: string }[] = [
  { id: 'goodman', label: 'DE-Goodman', note: 'Distortion-energy Goodman — the standard, slightly conservative default.' },
  { id: 'gerber', label: 'DE-Gerber', note: 'Distortion-energy Gerber — less conservative (parabolic mean-stress line).' },
  { id: 'elliptic', label: 'DE-ASME elliptic', note: 'Distortion-energy ASME-elliptic — common for ductile shafts.' },
  { id: 'soderberg', label: 'DE-Soderberg', note: 'Distortion-energy Soderberg — most conservative (guards against yield).' },
];
