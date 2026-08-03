// Bearing-type metadata and the ISO 281 / SKF factor tables used by the Bearing
// Calculator. The per-designation dimensions and load ratings now come from the
// real SKF catalogue (see bearingCatalogue.ts); this file holds the type-level
// engineering constants: equivalent-load X/Y/e factors, static-load factors,
// reliability and duty factors, and the plain-bush (PV-method) material limits.
//
// Factor sources: SKF 'Rolling bearings' catalogue (PUB BU/P1 17000/1 EN, 2018),
// section B.3 (Bearing size) and each product section's "Loads" pages. Where a
// bearing family's e/Y vary per designation in the catalogue (tapered and
// spherical roller especially), a single representative set for the mainstream
// series is used and is documented as such in the calculator's assumptions note.

export type BearingTypeId =
  | 'deep-groove-ball'
  | 'angular-contact-ball'
  | 'cylindrical-roller'
  | 'tapered-roller'
  | 'spherical-roller'
  | 'needle-roller'
  | 'thrust-ball'
  | 'plain-bush';

export type AxialCapability = 'both' | 'one-direction' | 'none' | 'axial-only';
export type RollingElementShape = 'ball' | 'cylindrical-roller' | 'tapered-roller' | 'spherical-roller' | 'needle' | 'none';

// Equivalent dynamic load P = X.Fr + Y.Fa. Shapes:
//  - 'radial-only'  : no thrust capacity (P = Fr) — cylindrical & needle roller.
//  - 'axial-only'   : no radial capacity (P = Fa) — thrust ball.
//  - 'combined-fixed': single-row combined. Fa/Fr <= e -> P = Fr; above -> X2.Fr + Y2.Fa.
//    (angular contact, tapered roller)
//  - 'combined-table': deep groove ball. e and Y vary with f0.Fa/C0 (SKF table 9,
//    Normal clearance); a representative f0 is applied since f0 is a per-bearing
//    calculation factor not carried in this model.
//  - 'double-row'   : spherical roller. Fa/Fr <= e -> P = Fr + Y1.Fa;
//    above -> X2.Fr + Y2.Fa (both rows react axial load even below e).
export type DynamicFactorModel =
  | { kind: 'radial-only' }
  | { kind: 'axial-only' }
  | { kind: 'combined-fixed'; e: number; x2: number; y2: number }
  | { kind: 'combined-table'; f0: number; faOverC0: readonly number[]; eTable: readonly number[]; y2Table: readonly number[]; x2: number }
  | { kind: 'double-row'; e: number; y1: number; x2: number; y2: number };

export interface StaticFactors {
  x0: number;
  y0: number;
}

export interface BearingTypeMeta {
  id: BearingTypeId;
  label: string;
  shortLabel: string;
  description: string;
  rollingElement: RollingElementShape;
  rowCount: 1 | 2;
  axial: AxialCapability;
  isFatigueRated: boolean;
  hasCatalogue: boolean; // false for plain bush (sized by PV, not a catalogue lookup)
  dynamicFactors: DynamicFactorModel;
  staticFactors: StaticFactors;
  contactAngleDeg: number;
  factorNote?: string; // disclosed when representative (not per-designation) factors are used
  mountingNote?: string;
}

// SKF catalogue table 9 (deep groove ball, Normal clearance, single row):
// e and Y as a function of f0.Fa/C0. X = 0.56 when Fa/Fr > e.
const DEEP_GROOVE_TABLE = {
  f0: 13, // representative calculation factor for the mainstream 60/62/63 series (catalogue range ~11-17)
  faOverC0: [0.172, 0.345, 0.689, 1.03, 1.38, 2.07, 3.45, 5.17, 6.89],
  eTable: [0.19, 0.22, 0.26, 0.28, 0.30, 0.34, 0.38, 0.42, 0.44],
  y2Table: [2.30, 1.99, 1.71, 1.55, 1.45, 1.31, 1.15, 1.04, 1.00],
  x2: 0.56,
} as const;

export const BEARING_TYPES: Record<BearingTypeId, BearingTypeMeta> = {
  'deep-groove-ball': {
    id: 'deep-groove-ball',
    label: 'Deep groove ball',
    shortLabel: 'Deep groove ball',
    description: 'General-purpose radial ball bearing. Moderate radial capacity plus meaningful axial capacity in both directions; the default choice unless load, speed, or misalignment push toward a specialised type.',
    rollingElement: 'ball',
    rowCount: 1,
    axial: 'both',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'combined-table', ...DEEP_GROOVE_TABLE },
    staticFactors: { x0: 0.6, y0: 0.5 },
    contactAngleDeg: 0,
  },
  'angular-contact-ball': {
    id: 'angular-contact-ball',
    label: 'Angular contact ball',
    shortLabel: 'Angular contact ball',
    description: 'Ball bearing with an offset contact angle for high axial capacity in one direction (plus the radial load that comes with it). A single row locates the shaft axially one way only — mount as a matched pair (back-to-back or face-to-face) for bidirectional axial location.',
    rollingElement: 'ball',
    rowCount: 1,
    axial: 'one-direction',
    isFatigueRated: true,
    hasCatalogue: true,
    // 40° contact (7xxx B series). Overridden for 25° in resolveBearingType.
    dynamicFactors: { kind: 'combined-fixed', e: 1.14, x2: 0.35, y2: 0.57 },
    staticFactors: { x0: 0.5, y0: 0.26 },
    contactAngleDeg: 40,
    mountingNote: 'Single row shown — carries axial load in one direction only. Pair back-to-back/face-to-face for both directions.',
  },
  'cylindrical-roller': {
    id: 'cylindrical-roller',
    label: 'Cylindrical roller',
    shortLabel: 'Cylindrical roller',
    description: 'Line-contact roller bearing (NU type): high radial capacity in a compact envelope, but no axial (thrust) capacity — a separate bearing must locate the shaft axially.',
    rollingElement: 'cylindrical-roller',
    rowCount: 1,
    axial: 'none',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'radial-only' },
    staticFactors: { x0: 1, y0: 0 },
    contactAngleDeg: 0,
    mountingNote: 'NU-type: no flange to react thrust. Use NJ/NUP, or a separate locating bearing, if axial location is needed.',
  },
  'tapered-roller': {
    id: 'tapered-roller',
    label: 'Tapered roller',
    shortLabel: 'Tapered roller',
    description: 'Angled line-contact roller bearing: high combined radial + axial capacity in one direction. Almost always mounted as a matched pair (direct or indirect) for a fully located shaft.',
    rollingElement: 'tapered-roller',
    rowCount: 1,
    axial: 'one-direction',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'combined-fixed', e: 0.37, x2: 0.4, y2: 1.6 },
    staticFactors: { x0: 0.5, y0: 0.8 },
    contactAngleDeg: 15,
    factorNote: 'Tapered-roller e, Y and Y0 vary per designation in the catalogue; representative mainstream-series values (e≈0.37, Y≈1.6, Y0≈0.8) are used here.',
    mountingNote: 'Single row shown — carries axial load in one direction only. Pair (direct or indirect mount) for both directions.',
  },
  'spherical-roller': {
    id: 'spherical-roller',
    label: 'Spherical roller',
    shortLabel: 'Spherical roller',
    description: 'Double-row, self-aligning roller bearing for heavy combined loads and shaft/housing misalignment. The heavy-duty choice when deep groove or cylindrical roller capacity runs out.',
    rollingElement: 'spherical-roller',
    rowCount: 2,
    axial: 'both',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'double-row', e: 0.30, y1: 2.6, x2: 0.67, y2: 3.9 },
    staticFactors: { x0: 1, y0: 2.6 },
    contactAngleDeg: 10,
    factorNote: 'Spherical-roller e, Y1, Y2 and Y0 vary per designation in the catalogue; representative mainstream-series values (e≈0.30, Y1≈2.6, Y2≈3.9, Y0≈2.6) are used here.',
  },
  'needle-roller': {
    id: 'needle-roller',
    label: 'Needle roller',
    shortLabel: 'Needle roller',
    description: 'Thin-section roller bearing giving high radial capacity in the smallest possible envelope — no axial capacity, and no self-aligning ability.',
    rollingElement: 'needle',
    rowCount: 1,
    axial: 'none',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'radial-only' },
    staticFactors: { x0: 1, y0: 0 },
    contactAngleDeg: 0,
    mountingNote: 'No axial capacity — a separate bearing must locate the shaft. SKF recommends a static safety factor s0 >= 3 for needle roller bearings.',
  },
  'thrust-ball': {
    id: 'thrust-ball',
    label: 'Thrust ball',
    shortLabel: 'Thrust ball',
    description: 'Pure axial (thrust) bearing — cannot carry any radial load. Low speed capability; needs a separate radial bearing.',
    rollingElement: 'ball',
    rowCount: 1,
    axial: 'axial-only',
    isFatigueRated: true,
    hasCatalogue: true,
    dynamicFactors: { kind: 'axial-only' },
    staticFactors: { x0: 0, y0: 1 },
    contactAngleDeg: 90,
    mountingNote: 'Single-direction thrust washer set — needs a radial bearing alongside it and a minimum axial preload to stay seated.',
  },
  'plain-bush': {
    id: 'plain-bush',
    label: 'Plain bush (sleeve)',
    shortLabel: 'Plain bush',
    description: 'Plain sliding bearing — no rolling elements, no fatigue life. Sized by bearing pressure P, surface speed V, and the PV limit of the bush material, not by ISO 281 life.',
    rollingElement: 'none',
    rowCount: 1,
    axial: 'none',
    isFatigueRated: false,
    hasCatalogue: false,
    dynamicFactors: { kind: 'radial-only' },
    staticFactors: { x0: 1, y0: 0 },
    contactAngleDeg: 0,
    mountingNote: 'No axial capacity — a separate thrust washer/collar is needed if the shaft must be located axially.',
  },
};

export const BEARING_TYPE_LIST: BearingTypeMeta[] = Object.values(BEARING_TYPES);

// ---- Plain bush materials (PV method) ----
export interface BushMaterial {
  id: string;
  label: string;
  pvMaxMPaMs: number; // continuous PV limit, MPa . m/s
  pMaxMPa: number; // max bearing (unit) pressure
  vMaxMs: number; // max surface speed
  maxTempC: number;
  description: string;
}

export const BUSH_MATERIALS: BushMaterial[] = [
  {
    id: 'sintered-bronze',
    label: 'Sintered bronze (oil-impregnated)',
    pvMaxMPaMs: 1.8,
    pMaxMPa: 25,
    vMaxMs: 6,
    maxTempC: 110,
    description: 'Porous bronze pre-loaded with oil — self-lubricating for the life of the impregnation, low cost, moderate capacity. Common in light-to-moderate duty, intermittent-relube-access applications.',
  },
  {
    id: 'cast-bronze',
    label: 'Cast/wrought bronze (grease or oil lubricated)',
    pvMaxMPaMs: 2.8,
    pMaxMPa: 18,
    vMaxMs: 5,
    maxTempC: 150,
    description: 'Solid bronze, externally lubricated (grease fitting or oil bath/groove). Higher PV capability than sintered bronze provided lubrication is maintained; loses capacity fast if lubrication is interrupted.',
  },
  {
    id: 'ptfe-composite',
    label: 'PTFE-lined composite (self-lubricating)',
    pvMaxMPaMs: 3.6,
    pMaxMPa: 140,
    vMaxMs: 2.5,
    maxTempC: 130,
    description: 'Steel-backed composite with a PTFE/fibre liner (DU/DX-style). Runs dry or with only initial lubrication, very high static/dynamic pressure capability, best at low-to-moderate surface speed.',
  },
];

// ---- Lubrication method metadata ----
export type LubricationMethod = 'sealed' | 'grease' | 'oil';

export interface LubricationMethodMeta {
  id: LubricationMethod;
  label: string;
  description: string;
}

export const LUBRICATION_METHODS: LubricationMethodMeta[] = [
  { id: 'sealed', label: 'Sealed for life', description: 'Factory-fitted seals and a fixed grease fill — no relubrication possible. Life is capped by grease/seal degradation, not just fatigue.' },
  { id: 'grease', label: 'Grease packed (relubricatable)', description: 'Open or shielded bearing, periodically relubricated with grease through the housing.' },
  { id: 'oil', label: 'Oil lubricated', description: 'Oil bath, circulating, or mist lubrication — supports the highest speeds and can also remove heat.' },
];

// ---- Duty / shock (application) factor ----
export interface DutyFactorOption {
  id: 'steady' | 'light-shock' | 'heavy-shock';
  label: string;
  factor: number;
  description: string;
}

export const DUTY_FACTORS: DutyFactorOption[] = [
  { id: 'steady', label: 'Steady, no shock', factor: 1.0, description: 'Smooth running, negligible vibration or out-of-balance loading.' },
  { id: 'light-shock', label: 'Light shock / out-of-balance', factor: 1.6, description: 'Typical rotating machinery with some out-of-balance, gearing, or belt loads.' },
  { id: 'heavy-shock', label: 'Heavy shock / vibration', factor: 2.5, description: 'Impact loading, reciprocating machinery, or significant vibration.' },
];

// ---- Target-life presets (SKF catalogue table 1, guideline specification life) ----
export interface LifePreset {
  id: string;
  label: string;
  hours: number;
  hint: string;
}

export const LIFE_PRESETS: LifePreset[] = [
  { id: 'intermittent', label: 'Intermittent use', hours: 4000, hint: '3,000-8,000 h — short-period tools' },
  { id: 'eight-hour', label: '8 h/day, industrial', hours: 20000, hint: '10,000-25,000 h — general machinery' },
  { id: 'normal', label: '8 h/day, fully utilised', hours: 30000, hint: '20,000-30,000 h' },
  { id: 'continuous', label: 'Continuous 24 h', hours: 50000, hint: '40,000-50,000 h' },
  { id: 'high-reliability', label: 'Continuous, high reliability', hours: 100000, hint: '60,000-100,000 h' },
];

// SKF catalogue table 3 (ISO 281:2007) reliability (a1) life-adjustment factor.
export const RELIABILITY_A1: { reliabilityPct: number; a1: number }[] = [
  { reliabilityPct: 90, a1: 1.00 },
  { reliabilityPct: 95, a1: 0.64 },
  { reliabilityPct: 96, a1: 0.55 },
  { reliabilityPct: 97, a1: 0.47 },
  { reliabilityPct: 98, a1: 0.37 },
  { reliabilityPct: 99, a1: 0.25 },
];

// Static-safety-factor guideline (duty x smoothness). Roller bearings (line
// contact) conventionally want a higher static safety factor than ball bearings
// (point contact) for the same duty — applied as a multiplier.
export const STATIC_SAFETY_TARGET: { id: 'low' | 'normal' | 'heavy'; label: string; ballTarget: number; rollerMultiplier: number }[] = [
  { id: 'low', label: 'Low — smooth, no vibration', ballTarget: 1.0, rollerMultiplier: 1.5 },
  { id: 'normal', label: 'Normal duty', ballTarget: 1.5, rollerMultiplier: 1.33 },
  { id: 'heavy', label: 'Heavy shock / high reliability', ballTarget: 2.5, rollerMultiplier: 1.2 },
];
