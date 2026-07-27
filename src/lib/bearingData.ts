// Reference data for the Bearing Calculator: bearing-type metadata, a parametric
// catalogue model (envelope + dynamic/static load rating vs. bore, calibrated to
// published reference bearings), ISO/DIN designation coding, ISO 281 equivalent
// dynamic/static load factors, and plain-bush (sleeve bearing) material limits.
//
// The load-rating tables below are NOT a literal transcription of the current SKF
// catalogue — that runs to thousands of designations and updates over time. Instead
// each rolling-element type is calibrated at a d = 25 mm reference bearing against a
// real, published bore/OD/width/dynamic-rating combination (e.g. 6205: d25 D52 B15
// C14.8kN is a widely published deep-groove figure), then scaled to other bore sizes
// with standard catalogue growth trends (capacity ~ d^1.8-1.9, envelope growth
// tapering off at larger bores). This gives a realistic, internally consistent,
// continuously-scaling candidate for any shaft diameter — but the exact designation
// returned is a representative candidate, not a guaranteed-accurate catalogue
// lookup. Always confirm the final designation's dimensions and ratings against the
// current SKF (or equivalent) product datasheet before procurement or final design.

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

// Equivalent dynamic load P = X.Fr + Y.Fa. Three shapes cover every rolling-element
// type here:
//  - 'radial-only': the bearing type cannot react thrust at all (X=1, Y=0 always) —
//    cylindrical roller (NU) and needle roller.
//  - 'axial-only': the bearing type cannot react radial load at all (X=0, Y=1
//    always) — thrust ball.
//  - 'combined-fixed' / 'combined-table': X1=1,Y1=0 while Fa/Fr <= e; above e,
//    X2/Y2 apply. 'combined-table' additionally varies e and Y2 with Fa/C0
//    (deep-groove ball's classic behaviour); 'combined-fixed' uses one e/X2/Y2
//    triple regardless of load ratio (typical of how a single angular-contact/
//    tapered/spherical-roller series is presented).
export type DynamicFactorModel =
  | { kind: 'radial-only' }
  | { kind: 'axial-only' }
  | { kind: 'combined-fixed'; e: number; x2: number; y2: number }
  | { kind: 'combined-table'; faOverC0: readonly number[]; eTable: readonly number[]; y2Table: readonly number[]; x2: number };

export interface StaticFactors {
  x0: number;
  y0: number;
}

export interface CatalogueReference {
  boreMm: number; // calibration bore, mm
  odMm: number; // D at calibration bore
  widthMm: number; // B (or T for tapered, overall height for thrust), at calibration bore
  dynamicKN: number; // C at calibration bore
  staticOverDynamic: number; // C0 / C, held constant across bore range
  capacityExponent: number; // C(d) = dynamicKN * (d / boreMm) ^ capacityExponent
  envelopeExponent: number; // radial build height & width scale as (d / boreMm) ^ this
  greaseLimitRpmAtRef: number; // limiting speed (grease) at the calibration bore
  speedExponent: number; // n_lim(d) = greaseLimitRpmAtRef * (boreMm / d) ^ speedExponent
  oilLimitFactor: number; // oil limiting speed = grease limit * this factor
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
  designation: (boreMm: number) => string;
  reference: CatalogueReference;
  dynamicFactors: DynamicFactorModel;
  staticFactors: StaticFactors;
  contactAngleDeg: number; // 0 for pure-radial types, 90 for thrust, else nominal ball/roller contact angle
  mountingNote?: string;
}

// ---- ISO/DIN bore coding (metric bearings, bore 10-495 mm) ----
// Bore codes 00/01/02/03 = 10/12/15/17 mm; from 20 mm up in 5 mm steps the code is
// bore/5 (e.g. 25 mm -> '05', 100 mm -> '20'). This part of the designation is a
// fixed, deterministic industry convention, not an estimate.
export function boreCode(dMm: number): string {
  const rounded = Math.round(dMm * 100) / 100;
  if (rounded === 10) return '00';
  if (rounded === 12) return '01';
  if (rounded === 15) return '02';
  if (rounded === 17) return '03';
  return String(Math.round(dMm / 5)).padStart(2, '0');
}

// Standard bore progression this tool searches over when proposing a bearing.
export const STANDARD_BORES_MM: number[] = [
  10, 12, 15, 17, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 120, 130, 140, 150,
];

const DEEP_GROOVE_TABLE = {
  faOverC0: [0.014, 0.028, 0.056, 0.084, 0.11, 0.17, 0.28, 0.42, 0.56],
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
    designation: (d) => `62${boreCode(d)}`,
    reference: { boreMm: 25, odMm: 52, widthMm: 15, dynamicKN: 14.8, staticOverDynamic: 0.53, capacityExponent: 1.8, envelopeExponent: 0.75, greaseLimitRpmAtRef: 15000, speedExponent: 0.85, oilLimitFactor: 1.3 },
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
    designation: (d) => `72${boreCode(d)} B`,
    reference: { boreMm: 25, odMm: 52, widthMm: 15, dynamicKN: 14.5, staticOverDynamic: 0.64, capacityExponent: 1.8, envelopeExponent: 0.75, greaseLimitRpmAtRef: 13000, speedExponent: 0.85, oilLimitFactor: 1.3 },
    dynamicFactors: { kind: 'combined-fixed', e: 0.68, x2: 0.41, y2: 0.87 },
    staticFactors: { x0: 0.5, y0: 0.26 },
    contactAngleDeg: 25,
    mountingNote: 'Single row shown — carries axial load in one direction only. Pair back-to-back/face-to-face for both directions.',
  },
  'cylindrical-roller': {
    id: 'cylindrical-roller',
    label: 'Cylindrical roller',
    shortLabel: 'Cylindrical roller',
    description: 'Line-contact roller bearing (NU type): high radial capacity in a compact envelope, but no axial (thrust) capacity at all — a separate bearing must locate the shaft axially.',
    rollingElement: 'cylindrical-roller',
    rowCount: 1,
    axial: 'none',
    isFatigueRated: true,
    designation: (d) => `NU 2${boreCode(d)} ECP`,
    reference: { boreMm: 25, odMm: 52, widthMm: 15, dynamicKN: 28.0, staticOverDynamic: 1.07, capacityExponent: 1.9, envelopeExponent: 0.75, greaseLimitRpmAtRef: 12000, speedExponent: 0.85, oilLimitFactor: 1.35 },
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
    designation: (d) => `302${boreCode(d)}`,
    reference: { boreMm: 25, odMm: 52, widthMm: 16.25, dynamicKN: 28.0, staticOverDynamic: 1.09, capacityExponent: 1.9, envelopeExponent: 0.75, greaseLimitRpmAtRef: 10000, speedExponent: 0.85, oilLimitFactor: 1.35 },
    dynamicFactors: { kind: 'combined-fixed', e: 0.37, x2: 0.4, y2: 1.6 },
    staticFactors: { x0: 0.5, y0: 1.0 },
    contactAngleDeg: 15,
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
    designation: (d) => `222${boreCode(d)} E`,
    reference: { boreMm: 25, odMm: 52, widthMm: 18, dynamicKN: 44.0, staticOverDynamic: 1.09, capacityExponent: 1.9, envelopeExponent: 0.78, greaseLimitRpmAtRef: 8000, speedExponent: 0.85, oilLimitFactor: 1.35 },
    dynamicFactors: { kind: 'combined-fixed', e: 0.30, x2: 0.67, y2: 2.6 },
    staticFactors: { x0: 0.5, y0: 2.5 },
    contactAngleDeg: 10,
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
    designation: (d) => `NA 49${boreCode(d)}`,
    reference: { boreMm: 25, odMm: 42, widthMm: 17, dynamicKN: 26.0, staticOverDynamic: 1.12, capacityExponent: 1.9, envelopeExponent: 0.7, greaseLimitRpmAtRef: 9000, speedExponent: 0.85, oilLimitFactor: 1.3 },
    dynamicFactors: { kind: 'radial-only' },
    staticFactors: { x0: 1, y0: 0 },
    contactAngleDeg: 0,
    mountingNote: 'No axial capacity — a separate bearing must locate the shaft. Usually run against a hardened, ground shaft surface (an inner ring removes that requirement).',
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
    designation: (d) => `512${boreCode(d)}`,
    reference: { boreMm: 25, odMm: 47, widthMm: 15, dynamicKN: 27.0, staticOverDynamic: 1.9, capacityExponent: 1.8, envelopeExponent: 0.7, greaseLimitRpmAtRef: 4000, speedExponent: 1.0, oilLimitFactor: 1.4 },
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
    designation: (d) => `Bush ${d.toFixed(0)}×${(d * 1.2).toFixed(0)}×${d.toFixed(0)}`,
    reference: { boreMm: 25, odMm: 30, widthMm: 25, dynamicKN: 0, staticOverDynamic: 1, capacityExponent: 1, envelopeExponent: 1, greaseLimitRpmAtRef: 0, speedExponent: 1, oilLimitFactor: 1 },
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
// Multiplies the calculated equivalent dynamic load before sizing, per the
// classic radial/shock-load guidance reproduced across bearing-selection guides
// (e.g. steady load 1.0-1.3, light shock/out-of-balance 1.3-2.0, heavy shock or
// vibration 2.0-3.0) — representative midpoints are used here.
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

// ---- Target-life presets ----
export interface LifePreset {
  id: string;
  label: string;
  hours: number;
  hint: string;
}

export const LIFE_PRESETS: LifePreset[] = [
  { id: 'intermittent', label: 'Intermittent use', hours: 1000, hint: '500-2,000 h' },
  { id: 'occasional', label: 'Occasional use', hours: 8000, hint: '5,000-10,000 h' },
  { id: 'normal', label: 'Normal operation', hours: 30000, hint: '20,000-50,000 h' },
  { id: 'continuous', label: 'Continuous operation', hours: 90000, hint: '75,000-100,000 h' },
  { id: 'high-reliability', label: 'High reliability', hours: 150000, hint: '>100,000 h' },
];

// ISO 281 reliability (a1) life-adjustment factor.
export const RELIABILITY_A1: { reliabilityPct: number; a1: number }[] = [
  { reliabilityPct: 90, a1: 1.00 },
  { reliabilityPct: 95, a1: 0.62 },
  { reliabilityPct: 96, a1: 0.53 },
  { reliabilityPct: 97, a1: 0.44 },
  { reliabilityPct: 98, a1: 0.33 },
  { reliabilityPct: 99, a1: 0.21 },
];

// Static-safety-factor guideline (duty x smoothness), representative of published
// guidance for rotating/oscillating machinery under normal duty. Roller bearings
// (line contact) conventionally want a higher static safety factor than ball
// bearings (point contact) for the same duty band — applied as a multiplier.
export const STATIC_SAFETY_TARGET: { id: 'low' | 'normal' | 'heavy'; label: string; ballTarget: number; rollerMultiplier: number }[] = [
  { id: 'low', label: 'Low — smooth, no vibration', ballTarget: 1.0, rollerMultiplier: 1.5 },
  { id: 'normal', label: 'Normal duty', ballTarget: 1.5, rollerMultiplier: 1.33 },
  { id: 'heavy', label: 'Heavy shock / high reliability', ballTarget: 2.5, rollerMultiplier: 1.2 },
];
