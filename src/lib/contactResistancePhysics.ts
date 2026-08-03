// Electrical contact resistance across a bolted joint's faying interface —
// a premium sub-feature of the Bolted Joint Calculator, entirely independent
// of that file's mechanical solve except for reusing its solved clamp force.
//
// Model: Holm's two-term contact-resistance model (R. Holm, "Electric
// Contacts: Theory and Application"), the foundational model reproduced
// throughout the contact-resistance literature (Braunovic's bolted-busbar-
// joint studies included):
//
//   R_total = R_constriction + R_film
//
// R_constriction is current crowding through microscopic asperity contact
// spots under plastic deformation (Holm's single-spot idealization):
//   R_c = (ρ/2)·sqrt(π·H/F)
// where ρ and H are the resistivity and indentation hardness of whichever
// contacting layer is softest/outermost (usually the plating, not the
// substrate — this is the key, non-obvious mechanism: soft coatings like
// tin/silver/gold lower resistance mainly by yielding plastically and
// INCREASING real contact area, not just by being more conductive), and F is
// the joint's clamping force.
//
// R_film is a thin oxide/tarnish layer in series. Deriving its resistivity/
// thickness/real-area independently would require a full multi-spot
// Greenwood-Williamson asperity model — out of scope for a design-estimate
// tool — so it's instead encoded as a lumped, per-coating empirical
// "filmFactor" multiplier (see contactResistanceMaterials.ts), applied to the
// SAME base constriction resistance before the roughness/flatness correction
// (film/oxide behavior is a surface-chemistry effect, not a geometric-
// contact-area effect, so it must not be scaled by those too — that would
// double-count).
//
// Roughness and flatness are real but SECONDARY effects here: a published
// torque/plating study found plating choice + clamp force together explained
// ~86% of observed contact-resistance variance, so both are modeled as simple
// empirical multipliers on R_constriction standing in for full multi-spot
// clustering (Greenwood's cluster-correction literature), not as first-class
// derived physics.
//
// IMPORTANT — this is an order-of-magnitude / trend tool, not a certified
// value. Real bolted-joint measurements commonly deviate 2-5x from a
// single-spot analytical prediction like this one, due to surface
// contamination, real multi-spot clustering, and aging — which is exactly why
// standards such as IEC 61238-1 and ASTM B667 require physical contact-
// resistance qualification testing for critical joints rather than relying on
// calculation alone. Every UI surface of this feature must carry that caveat.

import { getPlating, ROUGHNESS_PRESETS, FLATNESS_PRESETS, type PlatingId, type RoughnessPresetId, type FlatnessPresetId } from './contactResistanceMaterials';

export interface ContactResistanceInput {
  contactForceN: number; // reuse solveBoltedJoint's result.preloadN — never re-entered by the user
  platingId: PlatingId;
  customResistivityOhmM?: number;
  customHardnessMPa?: number;
  customFilmFactor?: number;
  roughnessPresetId: RoughnessPresetId;
  customRaMicrons?: number;
  flatnessPresetId: FlatnessPresetId;
}

export interface ContactResistanceResult {
  constrictionResistanceOhm: number;
  filmResistanceOhm: number;
  totalResistanceOhm: number;
  roughnessMultiplier: number;
  flatnessMultiplier: number;
  effectiveResistivityOhmM: number;
  effectiveHardnessMPa: number;
  effectiveFilmFactor: number;
  valid: boolean; // false when contactForceN <= 0 — no clamping force to constrict through
}

// Roughness anchors (Ra in µm -> multiplier), used both directly (presets)
// and as interpolation points for a custom Ra entry.
const ROUGHNESS_ANCHORS: Array<{ raMicrons: number; multiplier: number }> = [
  { raMicrons: ROUGHNESS_PRESETS.polished.raMicrons, multiplier: ROUGHNESS_PRESETS.polished.multiplier },
  { raMicrons: ROUGHNESS_PRESETS.machined.raMicrons, multiplier: ROUGHNESS_PRESETS.machined.multiplier },
  { raMicrons: ROUGHNESS_PRESETS.rough.raMicrons, multiplier: ROUGHNESS_PRESETS.rough.multiplier },
];

// Piecewise-linear interpolation over the three labeled anchors, clamped
// outside their range — a smooth UI convenience over the anchors, not an
// independently derived roughness-resistance relationship.
function interpolateRoughnessMultiplier(raMicrons: number): number {
  if (raMicrons <= ROUGHNESS_ANCHORS[0].raMicrons) return ROUGHNESS_ANCHORS[0].multiplier;
  if (raMicrons >= ROUGHNESS_ANCHORS[2].raMicrons) return ROUGHNESS_ANCHORS[2].multiplier;
  for (let i = 0; i < ROUGHNESS_ANCHORS.length - 1; i++) {
    const a = ROUGHNESS_ANCHORS[i];
    const b = ROUGHNESS_ANCHORS[i + 1];
    if (raMicrons >= a.raMicrons && raMicrons <= b.raMicrons) {
      const t = (raMicrons - a.raMicrons) / (b.raMicrons - a.raMicrons);
      return a.multiplier + t * (b.multiplier - a.multiplier);
    }
  }
  return 1.0;
}

export function computeContactResistance(input: ContactResistanceInput): ContactResistanceResult {
  const plating = getPlating(input.platingId);
  const resistivityOhmM = input.platingId === 'custom' && input.customResistivityOhmM != null ? input.customResistivityOhmM : plating.resistivityOhmM;
  const hardnessMPa = input.platingId === 'custom' && input.customHardnessMPa != null ? input.customHardnessMPa : plating.hardnessMPa;
  const filmFactor = input.platingId === 'custom' && input.customFilmFactor != null ? input.customFilmFactor : plating.filmFactor;

  const roughnessMultiplier =
    input.roughnessPresetId === 'custom'
      ? interpolateRoughnessMultiplier(input.customRaMicrons ?? ROUGHNESS_PRESETS.machined.raMicrons)
      : ROUGHNESS_PRESETS[input.roughnessPresetId].multiplier;
  const flatnessMultiplier = FLATNESS_PRESETS[input.flatnessPresetId].multiplier;

  if (input.contactForceN <= 0) {
    return {
      constrictionResistanceOhm: Infinity,
      filmResistanceOhm: Infinity,
      totalResistanceOhm: Infinity,
      roughnessMultiplier,
      flatnessMultiplier,
      effectiveResistivityOhmM: resistivityOhmM,
      effectiveHardnessMPa: hardnessMPa,
      effectiveFilmFactor: filmFactor,
      valid: false,
    };
  }

  const hardnessPa = hardnessMPa * 1e6;
  const constrictionBaseOhm = (resistivityOhmM / 2) * Math.sqrt((Math.PI * hardnessPa) / input.contactForceN);
  const constrictionResistanceOhm = constrictionBaseOhm * roughnessMultiplier * flatnessMultiplier;
  // Film resistance is kept out of the roughness/flatness scaling — see the
  // top-of-file note on why it's a separate surface-chemistry effect.
  const filmResistanceOhm = constrictionBaseOhm * (filmFactor - 1);

  return {
    constrictionResistanceOhm,
    filmResistanceOhm,
    totalResistanceOhm: constrictionResistanceOhm + filmResistanceOhm,
    roughnessMultiplier,
    flatnessMultiplier,
    effectiveResistivityOhmM: resistivityOhmM,
    effectiveHardnessMPa: hardnessMPa,
    effectiveFilmFactor: filmFactor,
    valid: true,
  };
}
