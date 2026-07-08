// Wire construction and bundle-covering data shared by the Bundle Diameter
// Calculator and Harness Designer.
//
// Sourcing notes (so future edits know what's exact vs. representative):
//  - M22759 Table I fields (standard designation, voltage/temp rating, conductor
//    material, plating, insulation polymer) are transcribed from Glenair's
//    M22759 wire datasheet. Wall thickness is NOT in that table; the "standard
//    wall" figure (0.25mm) is back-calculated from a real M22759/11-20 anchor
//    point (20 AWG, finished OD 0.058in / conductor ~0.0385in average ->
//    wall ~0.010in), applied to the standard (non-lightweight) constructions.
//    The "thin wall" XL-ETFE lightweight class (0.20mm) is a representative
//    class figure for aerospace weight-reduction constructions (/32,/33,/34,/44)
//    — not independently anchored — flagged with sourced:false.
//  - Spec 55 (Boeing BMS13-48 / Raychem/TE) wall thicknesses (10 mil / 8 mil)
//    and temp range are directly sourced from the TE Spec 55 product catalog.
//  - Heat-shrink RNF-100 sizes up to 1" are the real published expanded/
//    recovered ID + wall-thickness table; sizes above 1" continue the same
//    ~2:1 ratio and are extrapolated (flagged). RNF-3000's real size chart
//    wasn't accessible — its sizes are derived from RNF-100's recovered-ID
//    targets at the confirmed 3:1 ratio with a thinner representative wall
//    (flagged). HTAT's "supplied/recovered" mm naming convention and 4:1
//    ratio are sourced; the specific sizes are a representative series at
//    that ratio (flagged).
//  - Nomex sleeving and shield/jacket add-on thicknesses are representative
//    (the braided-sleeving expansion-range and shield-thickness figures are
//    typical values, not a specific vendor's published table) — flagged.

export function awgToDiameterMm(awg: number): number {
  const diameterIn = 0.005 * Math.pow(92, (36 - awg) / 39);
  return diameterIn * 25.4;
}

export type WireCategory = 'single' | 'twistedPair' | 'shielded' | 'twistedShieldedPair' | 'canBus';

export interface WireConstructionPreset {
  id: string;
  label: string;
  standard: string;
  category: WireCategory;
  insulation: string;
  tempRatingC: number;
  voltageRatingV: number;
  platingLabel: string;
  wallThicknessMm: number;
  shieldAddMm?: number;
  jacketAddMm?: number;
  sourced: boolean;
  notes: string;
}

export const WIRE_CONSTRUCTIONS: WireConstructionPreset[] = [
  { id: 'm22759-16', label: 'M22759/16 (ETFE, standard wall)', standard: 'M22759/16', category: 'single', insulation: 'ETFE', tempRatingC: 150, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.25, sourced: false, notes: 'Electrical ratings from the M22759 Table I datasheet (sourced). Wall thickness is the standard-wall class figure back-calculated from a real M22759/11-20 anchor point.' },
  { id: 'm22759-32', label: 'M22759/32 (XL-ETFE, thin wall)', standard: 'M22759/32', category: 'single', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, sourced: false, notes: 'Electrical ratings sourced. Wall thickness is a representative thin-wall lightweight-construction figure — refine from the /32 detail sheet for precision work.' },
  { id: 'm22759-33', label: 'M22759/33 (XL-ETFE, high-strength Cu, thin wall)', standard: 'M22759/33', category: 'single', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Silver', wallThicknessMm: 0.20, sourced: false, notes: 'Electrical ratings sourced. Wall thickness representative thin-wall figure.' },
  { id: 'm22759-34', label: 'M22759/34 (XL-ETFE, thin wall)', standard: 'M22759/34', category: 'single', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, sourced: false, notes: 'Electrical ratings sourced. Wall thickness representative thin-wall figure.' },
  { id: 'm22759-41', label: 'M22759/41 (XL-ETFE, standard wall)', standard: 'M22759/41', category: 'single', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Nickel', wallThicknessMm: 0.25, sourced: false, notes: 'Electrical ratings sourced. Wall thickness standard-wall class figure.' },
  { id: 'm22759-44', label: 'M22759/44 (XL-ETFE, thin wall)', standard: 'M22759/44', category: 'single', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Silver', wallThicknessMm: 0.20, sourced: false, notes: 'Electrical ratings sourced. Wall thickness representative thin-wall figure.' },
  { id: 'spec55-10mil', label: 'Spec 55, 10-mil wall (BMS13-48)', standard: 'Spec 55 / 55A08xx', category: 'single', insulation: 'Cross-linked ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin/Silver', wallThicknessMm: 0.254, sourced: true, notes: 'Wall thickness and -65 to 200°C temp range directly sourced from the TE Spec 55 product catalog (10-mil standard-wall construction, 55A08xx).' },
  { id: 'spec55-8mil', label: 'Spec 55, 8-mil wall (BMS13-48, lightweight)', standard: 'Spec 55 / 55A02xx', category: 'single', insulation: 'Cross-linked ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin/Silver', wallThicknessMm: 0.203, sourced: true, notes: 'Wall thickness and temp range directly sourced from the TE Spec 55 product catalog (8-mil lightweight construction, 55A02xx, developed for the 777).' },
  { id: 'twisted-pair-m22759-34', label: 'Twisted pair, M22759/34 conductors', standard: 'M22759/34 (twisted)', category: 'twistedPair', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, sourced: false, notes: 'Two M22759/34 conductors twisted together; overall OD uses the exact two-touching-equal-circles geometric bound (2× insulated OD), not a fudge factor.' },
  { id: 'twisted-shielded-pair', label: 'Twisted shielded pair, general purpose', standard: 'Generic TSP', category: 'twistedShieldedPair', insulation: 'ETFE', tempRatingC: 150, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, shieldAddMm: 0.20, jacketAddMm: 0.25, sourced: false, notes: 'Representative shield-braid and overall-jacket thickness — typical values, not a specific vendor table. Refine for a specific cable part number.' },
  { id: 'shielded-single', label: 'Shielded single conductor, general purpose', standard: 'Generic shielded', category: 'shielded', insulation: 'ETFE', tempRatingC: 150, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, shieldAddMm: 0.20, jacketAddMm: 0.25, sourced: false, notes: 'Representative shield-braid and jacket thickness.' },
  { id: 'can-bus-120r', label: 'CAN bus, 120 Ω twisted pair', standard: 'Twisted-pair CAN (120 Ω system)', category: 'canBus', insulation: 'XL-ETFE', tempRatingC: 200, voltageRatingV: 600, platingLabel: 'Tin', wallThicknessMm: 0.20, sourced: false, notes: 'Modelled as a twisted pair of thin-wall aerospace hookup wire; 120 Ω is a characteristic-impedance/termination property of the CAN bus system, not a diameter driver — carried here for labelling/documentation only.' },
  { id: 'custom', label: 'Custom', standard: 'Custom', category: 'single', insulation: 'Custom', tempRatingC: 150, voltageRatingV: 600, platingLabel: 'Custom', wallThicknessMm: 0.25, sourced: false, notes: 'Enter wall thickness (and shield/jacket add-ons if applicable) from your wire’s datasheet.' },
];

export function getWireConstruction(id: string): WireConstructionPreset {
  return WIRE_CONSTRUCTIONS.find((w) => w.id === id) ?? WIRE_CONSTRUCTIONS[WIRE_CONSTRUCTIONS.length - 1];
}

/** Overall finished OD (mm) of one wire/cable assembly for a given construction + AWG.
 *  Twisted categories use the exact bounding-circle identity for two touching
 *  equal circles of diameter d (bounding circle diameter = 2d), not an
 *  approximation. Shielded categories add the shield/jacket concentrically. */
export function wireOverallDiameterMm(construction: WireConstructionPreset, awg: number): number {
  const insulatedOD = awgToDiameterMm(awg) + 2 * construction.wallThicknessMm;
  let od = insulatedOD;
  if (construction.category === 'twistedPair' || construction.category === 'twistedShieldedPair' || construction.category === 'canBus') {
    od = 2 * insulatedOD;
  }
  if (construction.category === 'shielded' || construction.category === 'twistedShieldedPair') {
    od += 2 * (construction.shieldAddMm ?? 0) + 2 * (construction.jacketAddMm ?? 0);
  }
  return od;
}

// ---------------- Bundle coverings ----------------

export interface OverbraidPreset {
  id: string;
  label: string;
  thicknessMm: number;
  sourced: boolean;
}
export const OVERBRAID_PRESETS: OverbraidPreset[] = [
  { id: 'none', label: 'None', thicknessMm: 0, sourced: true },
  { id: 'tin-cu', label: 'Tin-plated copper braid', thicknessMm: 0.35, sourced: false },
  { id: 'nickel-cu', label: 'Nickel-plated copper braid', thicknessMm: 0.35, sourced: false },
];
export function getOverbraid(id: string): OverbraidPreset {
  return OVERBRAID_PRESETS.find((o) => o.id === id) ?? OVERBRAID_PRESETS[0];
}

export interface CoveringSize {
  label: string;
  expandedIdMm: number; // as-supplied ID — must be >= the bundle OD it covers
  recoveredIdMm: number; // fully-shrunk ID — informational
  wallMm: number;
  sourced: boolean;
}
export interface CoveringFamily {
  id: string;
  label: string;
  shrinkRatioLabel: string;
  tempRangeC: string;
  sizes: CoveringSize[];
}
export const COVERING_FAMILIES: CoveringFamily[] = [
  {
    id: 'rnf-100', label: 'RNF-100 heat shrink (TE/Raychem)', shrinkRatioLabel: '2:1', tempRangeC: '-55 to 135',
    sizes: [
      { label: '1/8"', expandedIdMm: 3.2, recoveredIdMm: 1.6, wallMm: 0.51, sourced: true },
      { label: '3/16"', expandedIdMm: 4.8, recoveredIdMm: 2.4, wallMm: 0.51, sourced: true },
      { label: '1/4"', expandedIdMm: 6.4, recoveredIdMm: 3.2, wallMm: 0.64, sourced: true },
      { label: '3/8"', expandedIdMm: 9.5, recoveredIdMm: 4.8, wallMm: 0.64, sourced: true },
      { label: '1/2"', expandedIdMm: 12.7, recoveredIdMm: 6.4, wallMm: 0.64, sourced: true },
      { label: '3/4"', expandedIdMm: 19.1, recoveredIdMm: 9.5, wallMm: 0.76, sourced: true },
      { label: '1"', expandedIdMm: 25.4, recoveredIdMm: 12.7, wallMm: 0.89, sourced: true },
      { label: '1.5"', expandedIdMm: 38.1, recoveredIdMm: 19.1, wallMm: 1.0, sourced: false },
      { label: '2"', expandedIdMm: 50.8, recoveredIdMm: 25.4, wallMm: 1.1, sourced: false },
    ],
  },
  {
    id: 'rnf-3000', label: 'RNF-3000 heat shrink (TE/Raychem, thin wall)', shrinkRatioLabel: '3:1', tempRangeC: '-55 to 135',
    sizes: [
      { label: '3/16"', expandedIdMm: 7.2, recoveredIdMm: 2.4, wallMm: 0.36, sourced: false },
      { label: '1/4"', expandedIdMm: 9.6, recoveredIdMm: 3.2, wallMm: 0.45, sourced: false },
      { label: '3/8"', expandedIdMm: 14.3, recoveredIdMm: 4.8, wallMm: 0.45, sourced: false },
      { label: '1/2"', expandedIdMm: 19.1, recoveredIdMm: 6.4, wallMm: 0.45, sourced: false },
      { label: '3/4"', expandedIdMm: 28.6, recoveredIdMm: 9.5, wallMm: 0.53, sourced: false },
      { label: '1"', expandedIdMm: 38.1, recoveredIdMm: 12.7, wallMm: 0.62, sourced: false },
    ],
  },
  {
    id: 'htat', label: 'HTAT heat shrink, dual-wall adhesive-lined (TE/Raychem)', shrinkRatioLabel: '4:1', tempRangeC: '-55 to 125',
    sizes: [
      { label: 'HTAT-6/1.5', expandedIdMm: 6, recoveredIdMm: 1.5, wallMm: 1.0, sourced: false },
      { label: 'HTAT-9/2.3', expandedIdMm: 9, recoveredIdMm: 2.3, wallMm: 1.1, sourced: false },
      { label: 'HTAT-12/3', expandedIdMm: 12, recoveredIdMm: 3, wallMm: 1.2, sourced: true },
      { label: 'HTAT-19/4.5', expandedIdMm: 19, recoveredIdMm: 4.5, wallMm: 1.3, sourced: false },
      { label: 'HTAT-25/6', expandedIdMm: 25, recoveredIdMm: 6, wallMm: 1.4, sourced: false },
      { label: 'HTAT-38/9.5', expandedIdMm: 38, recoveredIdMm: 9.5, wallMm: 1.5, sourced: false },
      { label: 'HTAT-51/12.7', expandedIdMm: 51, recoveredIdMm: 12.7, wallMm: 1.6, sourced: false },
    ],
  },
  {
    id: 'nomex', label: 'Nomex braided sleeving', shrinkRatioLabel: 'N/A (expandable braid)', tempRangeC: 'up to 350',
    sizes: [
      { label: '3 mm nominal', expandedIdMm: 4.8, recoveredIdMm: 2.1, wallMm: 0.3, sourced: false },
      { label: '6 mm nominal', expandedIdMm: 9.6, recoveredIdMm: 4.2, wallMm: 0.3, sourced: false },
      { label: '10 mm nominal', expandedIdMm: 16.0, recoveredIdMm: 7.0, wallMm: 0.35, sourced: false },
      { label: '16 mm nominal', expandedIdMm: 25.6, recoveredIdMm: 11.2, wallMm: 0.35, sourced: false },
      { label: '25 mm nominal', expandedIdMm: 40.0, recoveredIdMm: 17.5, wallMm: 0.4, sourced: false },
      { label: '40 mm nominal', expandedIdMm: 64.0, recoveredIdMm: 28.0, wallMm: 0.4, sourced: false },
    ],
  },
];
export function getCoveringFamily(id: string): CoveringFamily | undefined {
  return COVERING_FAMILIES.find((f) => f.id === id);
}
/** Smallest size in a family whose expanded (as-supplied) ID is >= the bundle OD it must cover. */
export function selectCoveringSize(family: CoveringFamily, bundleOdMm: number): CoveringSize | null {
  const fits = family.sizes.filter((s) => s.expandedIdMm >= bundleOdMm).sort((a, b) => a.expandedIdMm - b.expandedIdMm);
  return fits[0] ?? null;
}

export interface PartMarkingPreset {
  id: string;
  label: string;
  notes: string;
}
export const PART_MARKING_PRESETS: PartMarkingPreset[] = [
  { id: 'none', label: 'None', notes: '' },
  { id: 'tms-sce', label: 'TE TMS-SCE part-marking sleeve', notes: 'Thin-wall, printable legend sleeve (2:1 or 3:1 shrink ratio, per SAE-AMS-DTL-23053/5 class 1) applied locally at the marking point — a documentation/BOM item, not a full-length covering, so it does not contribute to the finished bundle OD.' },
];
