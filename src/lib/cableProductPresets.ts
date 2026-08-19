// Named manufacturer cable products for the Cable/Wire Sizing calculator —
// sourced from real datasheets rather than the tool's own first-principles
// heat-balance model, so a user can check a specific real product directly.
//
// Two rating kinds, because the underlying manufacturer data is genuinely NOT
// uniform in quality, and this project's discipline is to disclose that rather
// than paper over it with fabricated precision:
//
//  - 'lookup': the manufacturer publishes a real, tabulated ampacity number
//    per size (Glenair TurboFlex) — used directly, bypassing this tool's own
//    physics model, plus the manufacturer's own published ambient-temperature
//    correction-factor table for conditions other than the rating baseline.
//  - 'construction': the manufacturer publishes only a simulated derating
//    CURVE (conductor temperature vs current at a few fixed ambients), not a
//    tabulated ampacity value — reading a single number off such a chart is
//    only accurate to roughly ±15 A and was not done for every cross-section,
//    so rather than present an approximate chart-read as if it were a precise
//    datasheet figure, this preset instead feeds the product's real, sourced
//    CONSTRUCTION (conductor material, insulation temperature class, and — for
//    Coroflex specifically — the same silicone-family thermal conductivity
//    already used by this tool's "Silicone (ISO 6722 Class F)" preset) into
//    the existing validated first-principles solver. One anchor chart-read
//    point is retained per product purely as a disclosed cross-check, clearly
//    labelled as approximate, never as the calculator's own result.

export interface CableProductAmpacityRow {
  awg?: number;             // this project's convention: -1=1/0, -2=2/0, -3=3/0, -4=4/0
  crossSectionMm2?: number; // for mm²-native products
  ampacityLowA: number;
  ampacityHighA: number;    // equals ampacityLowA when the datasheet gives a single number
  dcResistanceOhmPerKm?: number; // = mΩ/m numerically
}

export interface CableProductVariant {
  id: string;
  label: string;
  maxTempC: number;
  ampacityRows?: CableProductAmpacityRow[]; // 'lookup' kind only
}

export interface CableTemperatureDeratingBand {
  minC: number;
  maxC: number;
  factor: number;
}
export interface CableTemperatureDeratingPoint {
  tempC: number;
  factor: number;
}
// Two derating table SHAPES, because manufacturers publish genuinely different
// things: 'bands' is a coarse step function (Glenair — wide ranges, one factor
// each, read as-published); 'points' is a dense sampled curve (Huber+Suhner
// RADOX — 5°C spacing) meant to be linearly interpolated between points, not
// treated as step bands. Using the wrong shape for either would misrepresent
// the source table.
export type CableTemperatureDerating =
  | { kind: 'bands'; bands: CableTemperatureDeratingBand[] }
  | { kind: 'points'; points: CableTemperatureDeratingPoint[] };

export type CableProductRatingKind = 'lookup' | 'construction';

export interface CableProduct {
  id: string;
  manufacturer: string;
  productName: string;
  typeDesignation?: string;
  ratingKind: CableProductRatingKind;
  sizeUnit: 'mm2' | 'awg';
  ratingBaselineTempC: number;
  ratingConductorTempC: number; // the conductor temperature the base ampacity table assumes (not always = variant maxTempC)
  ratingBasisNote: string;
  temperatureDerating: CableTemperatureDerating | null;
  derivedDeratingDisclosure?: string; // shown when this tool applies its OWN derating rather than a manufacturer-published one
  variants: CableProductVariant[];
  constructionMaterialId?: 'copper' | 'aluminium';
  constructionInsulationThermalConductivity?: number;
  constructionNote?: string;
  approximateDisclosure?: string;
  sourceUrl: string;
  sourceLabel: string;
}

// Glenair TurboFlex (Series 96, Duralectric D insulation) — AWG 20 through 4/0.
// Ampacity rows and the temperature-correction table are transcribed directly
// from the manufacturer's published tables (961-003/961-004/961-065
// datasheets), not derived or estimated. DC resistance (Ω/1000ft, converted to
// Ω/km = ×3.2808) is given only where the datasheet publishes it for that
// specific plating; left undefined rather than guessed where it doesn't.
const GLENAIR_AMPACITY_NI_AG: CableProductAmpacityRow[] = [
  { awg: 20, ampacityLowA: 10, ampacityHighA: 25 },
  { awg: 16, ampacityLowA: 15, ampacityHighA: 35, dcResistanceOhmPerKm: 14.933 },
  { awg: 14, ampacityLowA: 20, ampacityHighA: 50, dcResistanceOhmPerKm: 9.334 },
  { awg: 12, ampacityLowA: 30, ampacityHighA: 70, dcResistanceOhmPerKm: 6.053 },
  { awg: 10, ampacityLowA: 40, ampacityHighA: 90, dcResistanceOhmPerKm: 3.795 },
  { awg: 8, ampacityLowA: 55, ampacityHighA: 135, dcResistanceOhmPerKm: 2.358 },
  { awg: 6, ampacityLowA: 75, ampacityHighA: 185, dcResistanceOhmPerKm: 1.493 },
  { awg: 4, ampacityLowA: 105, ampacityHighA: 250, dcResistanceOhmPerKm: 0.9774 },
  { awg: 2, ampacityLowA: 145, ampacityHighA: 345, dcResistanceOhmPerKm: 0.6155 },
  { awg: -1, ampacityLowA: 195, ampacityHighA: 465, dcResistanceOhmPerKm: 0.3865 },
  { awg: -2, ampacityLowA: 225, ampacityHighA: 540, dcResistanceOhmPerKm: 0.3077 },
  { awg: -3, ampacityLowA: 260, ampacityHighA: 640, dcResistanceOhmPerKm: 0.2421 },
  { awg: -4, ampacityLowA: 310, ampacityHighA: 755, dcResistanceOhmPerKm: 0.1929 },
];
const GLENAIR_AMPACITY_TIN: CableProductAmpacityRow[] = [
  { awg: 20, ampacityLowA: 10, ampacityHighA: 20 },
  { awg: 16, ampacityLowA: 15, ampacityHighA: 30 },
  { awg: 14, ampacityLowA: 20, ampacityHighA: 45 },
  { awg: 12, ampacityLowA: 30, ampacityHighA: 60 },
  { awg: 10, ampacityLowA: 40, ampacityHighA: 75 },
  { awg: 8, ampacityLowA: 55, ampacityHighA: 115 },
  { awg: 6, ampacityLowA: 75, ampacityHighA: 155 },
  { awg: 4, ampacityLowA: 105, ampacityHighA: 215 },
  { awg: 2, ampacityLowA: 145, ampacityHighA: 290 },
  { awg: -1, ampacityLowA: 195, ampacityHighA: 395 },
  { awg: -2, ampacityLowA: 225, ampacityHighA: 460 },
  { awg: -3, ampacityLowA: 260, ampacityHighA: 540 },
  { awg: -4, ampacityLowA: 310, ampacityHighA: 640 },
];
// Correction factors for ambient temperatures above the 40°C rating baseline
// (Glenair 961-065, "Ambient Temperature Correction Factors" table, p.62) — a
// coarse step function, read exactly as Glenair publishes it (not interpolated).
// Bands above 180°C are blank on the datasheet (not rated) for any variant;
// the 150°C Tin/Copper variant is additionally capped by its own maxTempC.
const GLENAIR_DERATING: CableTemperatureDerating = {
  kind: 'bands',
  bands: [
    { minC: 41, maxC: 50, factor: 0.97 },
    { minC: 51, maxC: 60, factor: 0.94 },
    { minC: 61, maxC: 70, factor: 0.90 },
    { minC: 71, maxC: 80, factor: 0.87 },
    { minC: 81, maxC: 90, factor: 0.83 },
    { minC: 91, maxC: 100, factor: 0.79 },
    { minC: 101, maxC: 120, factor: 0.71 },
    { minC: 121, maxC: 140, factor: 0.61 },
    { minC: 141, maxC: 160, factor: 0.50 },
    { minC: 161, maxC: 180, factor: 0.35 },
  ],
};

// Huber+Suhner RADOX 125 & RADOX 4/9 GKW-AX (traction) — tin-plated copper,
// IEC 60287 rating basis (single cable, free air, 30°C ambient, 120°C
// conductor). Both product families publish the IDENTICAL ambient-derating
// (f1) curve, transcribed verbatim as a dense 5°C-spaced table meant to be
// interpolated, not read as step bands, per the source datasheet's own
// intent. Conductor-temperature derating (f2, for running below the 120°C
// table basis), bundling (f3/f4), and — for GKW-AX — frequency derating are
// all separately published but NOT implemented here; disclosed via
// derivedDeratingDisclosure rather than silently omitted.
const RADOX_AMBIENT_DERATING: CableTemperatureDerating = {
  kind: 'points',
  points: [
    { tempC: 30, factor: 1.00 }, { tempC: 35, factor: 0.97 }, { tempC: 40, factor: 0.94 },
    { tempC: 45, factor: 0.91 }, { tempC: 50, factor: 0.88 }, { tempC: 55, factor: 0.85 },
    { tempC: 60, factor: 0.82 }, { tempC: 65, factor: 0.78 }, { tempC: 70, factor: 0.75 },
    { tempC: 75, factor: 0.71 }, { tempC: 80, factor: 0.67 }, { tempC: 85, factor: 0.62 },
    { tempC: 90, factor: 0.58 }, { tempC: 95, factor: 0.53 }, { tempC: 100, factor: 0.47 },
    { tempC: 105, factor: 0.41 }, { tempC: 110, factor: 0.33 }, { tempC: 115, factor: 0.22 },
  ],
};
const RADOX_125_AMPACITY: CableProductAmpacityRow[] = [
  { crossSectionMm2: 0.5, ampacityLowA: 19, ampacityHighA: 19 },
  { crossSectionMm2: 0.75, ampacityLowA: 24, ampacityHighA: 24 },
  { crossSectionMm2: 1, ampacityLowA: 29, ampacityHighA: 29 },
  { crossSectionMm2: 1.5, ampacityLowA: 36, ampacityHighA: 36 },
  { crossSectionMm2: 2.5, ampacityLowA: 49, ampacityHighA: 49 },
  { crossSectionMm2: 4, ampacityLowA: 66, ampacityHighA: 66 },
  { crossSectionMm2: 6, ampacityLowA: 85, ampacityHighA: 85 },
  { crossSectionMm2: 10, ampacityLowA: 121, ampacityHighA: 121 },
  { crossSectionMm2: 16, ampacityLowA: 163, ampacityHighA: 163 },
  { crossSectionMm2: 25, ampacityLowA: 219, ampacityHighA: 219 },
  { crossSectionMm2: 35, ampacityLowA: 272, ampacityHighA: 272 },
  { crossSectionMm2: 50, ampacityLowA: 344, ampacityHighA: 344 },
  { crossSectionMm2: 70, ampacityLowA: 439, ampacityHighA: 439 },
  { crossSectionMm2: 95, ampacityLowA: 523, ampacityHighA: 523 },
  { crossSectionMm2: 120, ampacityLowA: 621, ampacityHighA: 621 },
  { crossSectionMm2: 150, ampacityLowA: 723, ampacityHighA: 723 },
  { crossSectionMm2: 185, ampacityLowA: 825, ampacityHighA: 825 },
  { crossSectionMm2: 240, ampacityLowA: 996, ampacityHighA: 996 },
  { crossSectionMm2: 300, ampacityLowA: 1150, ampacityHighA: 1150 },
];
const RADOX_GKW_AX_AMPACITY: CableProductAmpacityRow[] = [
  { crossSectionMm2: 1.5, ampacityLowA: 37, ampacityHighA: 37 },
  { crossSectionMm2: 2.5, ampacityLowA: 50, ampacityHighA: 50 },
  { crossSectionMm2: 4, ampacityLowA: 68, ampacityHighA: 68 },
  { crossSectionMm2: 6, ampacityLowA: 87, ampacityHighA: 87 },
  { crossSectionMm2: 10, ampacityLowA: 123, ampacityHighA: 123 },
  { crossSectionMm2: 16, ampacityLowA: 168, ampacityHighA: 168 },
  { crossSectionMm2: 25, ampacityLowA: 225, ampacityHighA: 225 },
  { crossSectionMm2: 35, ampacityLowA: 280, ampacityHighA: 280 },
  { crossSectionMm2: 50, ampacityLowA: 355, ampacityHighA: 355 },
  { crossSectionMm2: 70, ampacityLowA: 446, ampacityHighA: 446 },
  { crossSectionMm2: 95, ampacityLowA: 530, ampacityHighA: 530 },
  { crossSectionMm2: 120, ampacityLowA: 626, ampacityHighA: 626 },
  { crossSectionMm2: 150, ampacityLowA: 728, ampacityHighA: 728 },
  { crossSectionMm2: 185, ampacityLowA: 831, ampacityHighA: 831 },
  { crossSectionMm2: 240, ampacityLowA: 1000, ampacityHighA: 1000 },
  { crossSectionMm2: 300, ampacityLowA: 1160, ampacityHighA: 1160 },
  { crossSectionMm2: 400, ampacityLowA: 1420, ampacityHighA: 1420 },
];

// Champlain Cable EXRAD 150 XLE / FX — bare copper, AWG-sized, SAE J-1127/
// J-1654. Both XLE (extra-flexible) and FX (high-speed-strip) variants
// publish an IDENTICAL ampacity table, so represented as one product with
// distinguishing variant labels. Rated 40°C ambient, free air, single cable,
// 150°C insulation limit. No derating curve is published for any other
// ambient — confirmed absent, not omitted by oversight.
const EXRAD_AMPACITY: CableProductAmpacityRow[] = [
  { awg: 10, ampacityLowA: 80, ampacityHighA: 80 },
  { awg: 8, ampacityLowA: 106, ampacityHighA: 106 },
  { awg: 6, ampacityLowA: 155, ampacityHighA: 155 },
  { awg: 4, ampacityLowA: 190, ampacityHighA: 190 },
  { awg: 2, ampacityLowA: 255, ampacityHighA: 255 },
  { awg: 1, ampacityLowA: 293, ampacityHighA: 293 },
  { awg: -1, ampacityLowA: 339, ampacityHighA: 339 },
  { awg: -2, ampacityLowA: 390, ampacityHighA: 390 },
  { awg: -3, ampacityLowA: 451, ampacityHighA: 451 },
  { awg: -4, ampacityLowA: 529, ampacityHighA: 529 },
];

export const CABLE_PRODUCTS: CableProduct[] = [
  {
    id: 'glenair-turboflex',
    manufacturer: 'Glenair',
    productName: 'TurboFlex (Series 96)',
    typeDesignation: '961-003 / 961-004 / 961-065, Duralectric D insulation',
    ratingKind: 'lookup',
    sizeUnit: 'awg',
    ratingBaselineTempC: 40,
    ratingConductorTempC: 200, // table basis; the Tin/Cu variant's own 150°C limit further caps its column
    ratingBasisNote: 'Single cable, free air, sea level, 40°C ambient baseline (as printed on the datasheet). Each AWG size is rated as a range — Glenair does not explicitly define what the low and high bounds represent; the low bound is common to both plating options, the high bound is set by each plating\'s own temperature limit (150°C Tin vs 200°C Nickel/Silver).',
    temperatureDerating: GLENAIR_DERATING,
    variants: [
      { id: 'ni-ag', label: 'Nickel/Silver-plated copper (200°C)', maxTempC: 200, ampacityRows: GLENAIR_AMPACITY_NI_AG },
      { id: 'tin', label: 'Tin-plated copper (150°C)', maxTempC: 150, ampacityRows: GLENAIR_AMPACITY_TIN },
    ],
    sourceUrl: 'https://www.glenair.com/turboflex/pdf/961-065.pdf',
    sourceLabel: 'Glenair TurboFlex 961-003 / 961-004 / 961-065 datasheets (2024-2025 revisions)',
  },
  {
    id: 'coroflex-180hv-ssc',
    manufacturer: 'Coroplast (rebranded Coroflex, 2020)',
    productName: 'Coroflex 180HV SSC',
    typeDesignation: 'FHLR2GCB2G, part no. 9-2611 family',
    ratingKind: 'construction',
    sizeUnit: 'mm2',
    ratingBaselineTempC: 20,
    ratingConductorTempC: 180,
    ratingBasisNote: 'Coroflex publishes only LV112-3 simulated derating CURVES (conductor temperature vs continuous current, at fixed ambients of +20/+85/+125/+140°C) — not a tabulated ampacity number per cross-section. Reading a precise figure off such a chart is only accurate to roughly ±15 A and was only done for one size, so this preset instead applies the product\'s real, sourced construction to this calculator\'s own first-principles model rather than presenting a chart-read as if it were a datasheet figure.',
    temperatureDerating: null,
    variants: [{ id: 'bare-cu', label: 'Bare copper conductor, T180 silicone (180°C)', maxTempC: 180 }],
    constructionMaterialId: 'copper',
    constructionInsulationThermalConductivity: 0.25, // matches this tool's existing Silicone (ISO 6722 Class F) preset — same material family
    constructionNote: 'Sets conductor = bare copper, insulation = custom 180°C / silicone-family thermal conductivity (0.25 W/m·K) — set the insulation thickness for your actual cable, then this tool computes ampacity the same way it does for any other cable.',
    approximateDisclosure: 'Cross-check only, not used in this tool\'s result — Coroflex\'s own published 50 mm² curve reads approximately 430-440 A at +20°C ambient, ~300 A at +85°C, ~255-270 A at +125°C, and ~215-225 A at +140°C (read directly off the manufacturer\'s chart, ±~15 A).',
    sourceUrl: 'https://citini.com/wp-content/uploads/2022/07/HV50SSC.pdf',
    sourceLabel: 'Coroflex 9-2611 (50 mm²) Technical Information Rev A17 (2022-03-23), LV112-3 derating curves',
  },
  {
    id: 'radox-125',
    manufacturer: 'Huber+Suhner',
    productName: 'RADOX 125',
    typeDesignation: 'Single-core connecting lead, datasheet 586 776 A(e) / 559 926 P(e)',
    ratingKind: 'lookup',
    sizeUnit: 'mm2',
    ratingBaselineTempC: 30,
    ratingConductorTempC: 120, // the ampacity table's own computed basis — the material itself is rated to 125°C, disclosed below
    ratingBasisNote: 'Single conductor, free air, unrestricted heat dissipation, 30°C ambient, computed to a 120°C conductor temperature (per IEC 60287) — this is the table\'s own stated basis, not the material\'s full 125°C rating, kept distinct so the ampacity figures stay self-consistent with how Huber+Suhner actually derived them.',
    temperatureDerating: RADOX_AMBIENT_DERATING,
    derivedDeratingDisclosure: 'Huber+Suhner also publishes a conductor-temperature factor (f2, for running below the 120°C table basis), a bundling factor (f3), and separate on-floor/ceiling/conduit installation tables — none of those are applied here; only the ambient-temperature factor (f1) is. See the datasheet directly if those matter for your installation.',
    variants: [{ id: 'tin-cu', label: 'Tin-plated copper', maxTempC: 125, ampacityRows: RADOX_125_AMPACITY }],
    sourceUrl: 'https://bartec.com/wp-content/uploads/2025/12/RADOX_125_Current_rating_for_single_core__e___5_.pdf',
    sourceLabel: 'Huber+Suhner RADOX 125 Technical Datasheet 586 776 A(e), issue 03.05.2018',
  },
  {
    id: 'radox-gkw-ax',
    manufacturer: 'Huber+Suhner',
    productName: 'RADOX 4/9 GKW-AX (traction)',
    typeDesignation: 'EN 50264-3-1, datasheet 557 578 G(e)',
    ratingKind: 'lookup',
    sizeUnit: 'mm2',
    ratingBaselineTempC: 30,
    ratingConductorTempC: 120,
    ratingBasisNote: 'Single conductor, free air, 30°C ambient, computed to a 120°C conductor temperature (per IEC 60287) — same rating methodology and ambient/conductor-temperature derating curves as RADOX 125, in a wider cross-section range aimed at rail traction / heavy-EV use.',
    temperatureDerating: RADOX_AMBIENT_DERATING,
    derivedDeratingDisclosure: 'Also publishes conductor-temperature (f2), bundling (f4), and — uniquely for this traction product — an inverter-frequency derating table (f3, 400 Hz-10 kHz) not applied here. See the datasheet directly if those matter for your installation.',
    variants: [{ id: 'tin-cu', label: 'Tin-plated copper', maxTempC: 125, ampacityRows: RADOX_GKW_AX_AMPACITY }],
    sourceUrl: 'https://bartec.com/wp-content/uploads/2025/12/Current_rating_single_core_RADOX_4-9_GKW-AX.pdf',
    sourceLabel: 'Huber+Suhner RADOX 4/9 GKW-AX Technical Datasheet 557 578 G(e), issue 03.06.2005',
  },
  {
    id: 'amphenol-powerlink-hv',
    manufacturer: 'Amphenol (Times Fiber Communications)',
    productName: 'PowerLink HV USA (Shielded)',
    typeDesignation: 'TFC-HV-35S-OR ... TFC-HV-150S-OR — designed for Amphenol PowerLok G1/G2 connectors',
    ratingKind: 'construction',
    sizeUnit: 'mm2',
    ratingBaselineTempC: 20, // DC resistance is the only temperature-anchored figure this cable publishes (measured at 20°C) — no ampacity baseline exists to anchor to
    ratingConductorTempC: 150,
    ratingBasisNote: 'Amphenol does not publish an ampacity/current-rating table — or even an approximate derating chart — for this cable in any sourced document, only construction and dimensional data (conductor strand count/diameter, DC resistance, insulation/jacket thickness, sizes 35-150mm²). Confirmed absent across BOTH the US-made "PowerLink HV USA" line used here (Amphenol TFC, Chatham VA — "Powerlink HV USA Shielded 100124 Rev 05") and the separately-branded global "PowerLink HV Cable" line (Amphenol GEC|TPI, Document 8P1132 Rev A, 2.5-150mm², rated 125°C/ISO 6722 Class C rather than this one\'s 150°C/Class D) — so this preset feeds the real, sourced construction into this tool\'s own validated first-principles model rather than fabricating a table.',
    temperatureDerating: null,
    derivedDeratingDisclosure: 'No ambient-temperature derating curve or chart is published for this cable at all — unlike some other construction-only presets in this tool, there is no approximate cross-check value available either. Ampacity shown is entirely this tool\'s own physics calculation for the stated construction, not a manufacturer figure.',
    variants: [{ id: 'bare-cu', label: 'Bare copper conductor, XLPO insulation (150°C, ISO 6722 Class D)', maxTempC: 150 }],
    constructionMaterialId: 'copper',
    constructionInsulationThermalConductivity: 0.33, // matches this tool's existing XLPE (ISO 6722 Class D, 150°C) preset — same insulation family/class as printed on the datasheet
    constructionNote: 'Sets conductor = bare copper, insulation = custom 150°C / XLPE-family thermal conductivity (0.33 W/m·K) — set the insulation thickness for your actual cable size (1.5mm avg. wall on the 150mm² shielded construction, per datasheet), then this tool computes ampacity the same way it does for any other cable.',
    sourceUrl: 'https://www.amphenolbroadband.com/wp-content/uploads/2024/10/PowerLink-HV-USA-Shielded-High-Voltage-Power-Cable-Data-Sheet.pdf',
    sourceLabel: 'Amphenol TFC "PowerLink HV USA Shielded High Voltage (HV) Power Cable" datasheet, Powerlink HV USA Shielded 100124 Rev 05',
  },
  {
    id: 'exrad-150',
    manufacturer: 'Champlain Cable',
    productName: 'EXRAD 150 XLE / FX',
    typeDesignation: 'SAE J-1127 / J-1654 high-voltage battery cable',
    ratingKind: 'lookup',
    sizeUnit: 'awg',
    ratingBaselineTempC: 40,
    ratingConductorTempC: 150,
    ratingBasisNote: 'Single cable, free air, 40°C ambient, 150°C insulation limit (as printed on the datasheet). XLE (extra-flexible) and FX (high-speed-strip) constructions publish an identical ampacity table.',
    temperatureDerating: null,
    derivedDeratingDisclosure: 'Champlain publishes NO ambient-temperature derating curve for this product — confirmed absent from both datasheets, not an omission. This rating is only manufacturer-confirmed at the 40°C baseline; using it at a higher ambient without derating is optimistic.',
    variants: [{ id: 'bare-cu', label: 'Bare copper', maxTempC: 150, ampacityRows: EXRAD_AMPACITY }],
    sourceUrl: 'https://www.champcable.com/wp-content/uploads/2018/08/204.-EXRAD-XLE-SAE-Batt-HV-R1.pdf',
    sourceLabel: 'Champlain Cable EXRAD 150 XLE/FX datasheets',
  },
];

export function getCableProduct(id: string): CableProduct | undefined {
  return CABLE_PRODUCTS.find((p) => p.id === id);
}

/** Ambient-temperature correction factor for a lookup-kind product. 1.0 at or
 *  below the rating baseline; beyond the published table's range: 0 for a
 *  'bands' table (explicitly not rated), or the last point's factor is NOT
 *  extrapolated for a 'points' table — also returns 0 (manufacturer didn't
 *  publish beyond that point, so this tool won't guess past it either). */
export function deratingFactorForAmbient(derating: CableTemperatureDerating | null, ambientTempC: number, baselineTempC: number): number {
  if (!derating || ambientTempC <= baselineTempC) return 1.0;
  if (derating.kind === 'bands') {
    for (const b of derating.bands) {
      if (ambientTempC >= b.minC && ambientTempC <= b.maxC) return b.factor;
    }
    const last = derating.bands[derating.bands.length - 1];
    return ambientTempC > last.maxC ? 0 : 1.0;
  }
  const pts = derating.points;
  if (ambientTempC > pts[pts.length - 1].tempC) return 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (ambientTempC >= a.tempC && ambientTempC <= b.tempC) {
      const t = (ambientTempC - a.tempC) / (b.tempC - a.tempC);
      return a.factor + t * (b.factor - a.factor);
    }
  }
  return 1.0;
}

export function findAmpacityRow(rows: CableProductAmpacityRow[], awg?: number, crossSectionMm2?: number): CableProductAmpacityRow | undefined {
  if (awg != null) return rows.find((r) => r.awg === awg);
  if (crossSectionMm2 != null) return rows.find((r) => r.crossSectionMm2 === crossSectionMm2);
  return undefined;
}
