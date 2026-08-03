// Plating/coating and surface-condition presets for the Bolted Joint
// Calculator's electrical contact resistance sub-feature. Mirrors the
// clampedMaterials.ts convention of a closed preset set plus an editable
// 'custom' entry. Resistivity values are standard published bulk resistivities
// (CRC-handbook order of magnitude); hardness and filmFactor are literature-
// typical approximations for the PLATED/soft condition, not certified
// datasheet numbers — see contactResistancePhysics.ts for how they're used
// and what the resulting number does/doesn't mean.

export type PlatingId = 'bareCopper' | 'bareAluminum' | 'bareSteel' | 'tin' | 'nickel' | 'silver' | 'silverNiStrike' | 'gold' | 'custom';

export interface PlatingPreset {
  id: PlatingId;
  label: string;
  resistivityOhmM: number; // bulk resistivity of the current-carrying layer, Ω·m
  hardnessMPa: number;     // indentation hardness of the softer/outer layer — drives constriction resistance
  filmFactor: number;      // lumped multiplier for oxide/tarnish film resistance; 1.0 = noble/no-film baseline
  agingNote: string;
  citation: string;
}

export const PLATING_PRESETS: Record<PlatingId, PlatingPreset> = {
  bareCopper: {
    id: 'bareCopper', label: 'Bare copper',
    resistivityOhmM: 16.8e-9, hardnessMPa: 90, filmFactor: 8,
    agingNote: 'Oxidizes readily once exposed to air/moisture — not recommended uncoated for a critical or long-service joint.',
    citation: 'CRC bulk resistivity; oxidation behavior per general bolted-joint plating literature (Braunovic).',
  },
  bareAluminum: {
    id: 'bareAluminum', label: 'Bare aluminum',
    resistivityOhmM: 28.2e-9, hardnessMPa: 160, filmFactor: 12,
    agingNote: 'Al₂O₃ is a strong, self-reforming insulating film — the classic bolted-joint failure mode. Field studies show bare aluminum busbar joints climbing from tens of µΩ fresh to 400–750 µΩ over service life.',
    citation: 'CRC bulk resistivity; aging figures per published busbar aging studies (nickel-plated-vs-bare comparison).',
  },
  bareSteel: {
    id: 'bareSteel', label: 'Bare steel',
    resistivityOhmM: 150e-9, hardnessMPa: 700, filmFactor: 10,
    agingNote: 'Hard (poor real contact area) and oxidizes — the worst practical combination of the three bare options.',
    citation: 'CRC bulk resistivity for structural/mild steel.',
  },
  tin: {
    id: 'tin', label: 'Tin plating',
    resistivityOhmM: 115e-9, hardnessMPa: 15, filmFactor: 2.5,
    agingNote: 'Industry-standard, cost-effective. Soft enough to deform and increase real contact area; native oxide (~10-30 nm) is thin and self-limiting when undisturbed, but grows moderately under fretting/vibration or thermal cycling.',
    citation: 'CRC bulk resistivity; oxide-film behavior per tin-plated-contact fretting-corrosion literature.',
  },
  nickel: {
    id: 'nickel', label: 'Nickel plating',
    resistivityOhmM: 69e-9, hardnessMPa: 638, filmFactor: 1.8,
    agingNote: 'Hard relative to tin/silver/gold, so constriction resistance starts higher — but among the most stable long-term: one field study held ~15 µΩ stable under continuous current where a comparable bare-aluminum joint climbed to 400–750 µΩ.',
    citation: 'ASTM B733 class; long-term stability documented in published busbar aging/plating studies.',
  },
  silver: {
    id: 'silver', label: 'Silver plating',
    resistivityOhmM: 15.9e-9, hardnessMPa: 25, filmFactor: 1.3,
    agingNote: 'Lowest resistivity of any practical plating, plus soft enough to deform into excellent real contact area. Can tarnish (Ag₂S film) over years in sulfur-containing atmospheres — pair with a nickel strike underneath for the best long-term result (see that preset).',
    citation: 'ASTM B700; tarnish-film aging is the documented long-term risk for plain silver.',
  },
  silverNiStrike: {
    id: 'silverNiStrike', label: 'Silver w/ nickel strike undercoat (ASTM B700 Type 1 Grade D Class T)',
    resistivityOhmM: 15.9e-9, hardnessMPa: 25, filmFactor: 1.05,
    agingNote: 'Best real-world industrial practice for critical joints — the nickel strike barrier blocks substrate diffusion, giving the lowest AND most stable measured contact resistance of all options (<5 µΩ typical in published torque/plating studies).',
    citation: 'ASTM B700 Type 1 Grade D Class T; best performer in published torque/plating contact-resistance studies.',
  },
  gold: {
    id: 'gold', label: 'Gold plating',
    resistivityOhmM: 22.1e-9, hardnessMPa: 69, filmFactor: 1.0,
    agingNote: 'Noble metal — does not oxidize, so this is the reference "no film" baseline and the most stable option available. Higher bulk resistivity than silver, but for high-current power joints silver (or silver + Ni strike) is the more common industrial choice; gold is more typical for small/instrument-class contacts.',
    citation: 'Standard reference/instrument-connector plating; noble-metal baseline throughout contact-resistance literature (Holm).',
  },
  custom: {
    id: 'custom', label: 'Custom',
    resistivityOhmM: 100e-9, hardnessMPa: 100, filmFactor: 2.0,
    agingNote: 'User-entered values — verify against a datasheet or measurement for the specific finish.',
    citation: '',
  },
};

export const PLATING_LIST: PlatingPreset[] = Object.values(PLATING_PRESETS);

export function getPlating(id: PlatingId): PlatingPreset {
  return PLATING_PRESETS[id];
}

export type RoughnessPresetId = 'polished' | 'machined' | 'rough' | 'custom';

export interface RoughnessPreset {
  id: RoughnessPresetId;
  label: string;
  raMicrons: number;
  multiplier: number; // approximate correction on constriction resistance relative to the "machined" baseline (1.0)
}

export const ROUGHNESS_PRESETS: Record<RoughnessPresetId, RoughnessPreset> = {
  polished: { id: 'polished', label: 'Ground / polished (Ra ~0.2-0.8 µm)', raMicrons: 0.4, multiplier: 0.75 },
  machined: { id: 'machined', label: 'Machined (Ra ~1.6-3.2 µm) — typical baseline', raMicrons: 2.0, multiplier: 1.0 },
  rough: { id: 'rough', label: 'As-sawn / rough machined (Ra 6.3+ µm)', raMicrons: 6.3, multiplier: 1.75 },
  custom: { id: 'custom', label: 'Custom Ra', raMicrons: 2.0, multiplier: 1.0 },
};

export const ROUGHNESS_LIST: RoughnessPreset[] = Object.values(ROUGHNESS_PRESETS);

export type FlatnessPresetId = 'good' | 'fair' | 'poor';

export interface FlatnessPreset {
  id: FlatnessPresetId;
  label: string;
  multiplier: number;
}

export const FLATNESS_PRESETS: Record<FlatnessPresetId, FlatnessPreset> = {
  good: { id: 'good', label: 'Good — flat within machining tolerance, no visible gap under a straightedge', multiplier: 1.0 },
  fair: { id: 'fair', label: 'Fair — slight bow/waviness, small visible gap away from the bolt', multiplier: 1.4 },
  poor: { id: 'poor', label: 'Poor — noticeable bow/warp, only partial contact even fully torqued', multiplier: 2.2 },
};

export const FLATNESS_LIST: FlatnessPreset[] = Object.values(FLATNESS_PRESETS);
