// Motor stator winding copper loss — DC resistance plus the AC-resistance
// inflation from skin and proximity effect, for three winding conductor
// types: round magnet wire, flat/hairpin (rectangular) conductors, and litz
// wire. Reuses this site's existing copper resistivity/temperature data and
// skin-depth formula (skinDepthPhysics.ts) and its motor electrical-frequency
// helper (busbarPhysics.ts) rather than re-deriving them.
//
// AC-resistance method — two closed-form kernels, chosen per wire type:
//
//  1. DOWELL'S EQUATION (P.L. Dowell, "Effects of eddy currents in
//     transformer windings", Proc. IEE 113(8):1387-1394, 1966), the classical
//     m-layer foil-winding result, valid across the full frequency range:
//       F_R = Δ·[ (sinh2Δ+sin2Δ)/(cosh2Δ−cos2Δ)
//                 + (2/3)(m²−1)·(sinhΔ−sinΔ)/(coshΔ+cosΔ) ]
//     where Δ is the conductor-layer thickness measured in skin depths
//     (penetration ratio) and m is the number of conductor layers stacked
//     across the field-build direction (the slot depth). A flat/hairpin
//     conductor IS a foil layer already (no conversion needed); a layer of
//     round wire is converted to an equivalent foil of thickness
//     h_eq=(√π/2)·d with a porosity factor η so Δ=(h_eq/δ)·√η — the standard
//     Dowell round-wire treatment (cross-checked against e-magnetica.pl and
//     a Chalmers MSc thesis on AC resistance of foil/round/litz windings).
//     Verified against Dowell's own tabulated curves (F_R vs Δ at m=1,2,4,8)
//     via the validation script for this file.
//
//  2. SULLIVAN'S SINGLE-TERM PROXIMITY FORMULA (C.R. Sullivan & Y. Zhang,
//     "Simplified Design Method for Litz Wire", APEC 2014, eq. 3/10):
//       F_R = 1 + (π·n·N_s)²·d_s⁶ / (192·δ⁴·b²)
//     n = strands per turn (litz strand count, or 1 for a single round
//     wire), N_s = turns stacked across the field-build direction (the same
//     physical count as Dowell's m — see the note on solveWindingLoss),
//     d_s = strand/wire diameter, b = winding breadth (slot width). This is
//     the small-Δ (d≪δ) limit of Dowell's equation and is Sullivan's
//     recommended formula for round wire specifically because it avoids the
//     round-to-foil shape approximation; it is also the standard litz-wire
//     result (n=1 collapses it to the round-wire case, confirmed by
//     convergence with Dowell's formula at low Δ in the validation script).
//
// A user-specified "layers in slot" (m) is treated as the number of DISTINCT
// radial conductor positions in the slot's field-build direction — this is
// what drives the proximity term in both formulas; turns sitting side-by-side
// at the same radial position (e.g. multiple round wires "in hand") add
// copper area for DC resistance but are not separately modelled as
// additional proximity-coupled layers (a disclosed v1 simplification).
//
// Disclosed limitation (flat/hairpin only): this 1-D slot-field model
// assumes every conductor in the slot carries the same series current.
// Circulating currents between parallel winding paths — a real and
// sometimes dominant AC loss mechanism in badly-transposed hairpin windings
// — are NOT modelled and require FEA; see arXiv:2410.12748.

import { resistivityAtOhmMm2PerM, skinDepthMm } from './skinDepthPhysics';

export { resistivityAtOhmMm2PerM, skinDepthMm };

export type WindingWireType = 'round' | 'flat' | 'litz';

export interface RoundWireGeom {
  kind: 'round';
  diameterMm: number;
  strandsInHand: number; // parallel wires sharing the DC current (copper-area only, see file header)
  porosity: number;      // 0-1, layer fill fraction across the slot width (default ~0.8 if unknown)
}
export interface FlatWireGeom {
  kind: 'flat';
  widthMm: number;   // conductor dimension along the slot width (porosity-relevant)
  heightMm: number;  // conductor dimension along the slot depth (the Dowell foil thickness)
}
export interface LitzWireGeom {
  kind: 'litz';
  strandDiameterMm: number;
  strandCount: number;
}
export type WindingGeom = RoundWireGeom | FlatWireGeom | LitzWireGeom;

export function strandAreaMm2(geom: WindingGeom): number {
  if (geom.kind === 'round') return (Math.PI * geom.diameterMm * geom.diameterMm) / 4;
  if (geom.kind === 'flat') return geom.widthMm * geom.heightMm;
  return geom.strandCount * (Math.PI * geom.strandDiameterMm * geom.strandDiameterMm) / 4;
}

// ── Mean length per turn (MLT) ──
export interface MltEstimateInput {
  boreDiameterMm: number;
  stackLengthMm: number;
  polePairs: number;
  endWindingFactor: number; // k_ew, typical 1.2-1.6 for form-wound coils (Pyrhonen)
}

/** MLT ≈ 2·L_stack + 2·k_ew·τ_p, τ_p = π·D_bore/(2p) — a rule-of-thumb fallback
 *  (Pyrhonen, "Design of Rotating Electrical Machines") for when full slot/
 *  end-winding CAD geometry isn't available. */
export function estimateMltMm(input: MltEstimateInput): number {
  const polePitchMm = (Math.PI * input.boreDiameterMm) / (2 * Math.max(input.polePairs, 1));
  return 2 * input.stackLengthMm + 2 * input.endWindingFactor * polePitchMm;
}

// ── DC resistance ──
export function dcResistanceOhm(rhoOhmMm2PerM: number, mltMm: number, turns: number, strandArea: WindingGeom | number, nParallel: number): number {
  const areaMm2 = typeof strandArea === 'number' ? strandArea : strandAreaMm2(strandArea);
  if (areaMm2 <= 0 || nParallel <= 0) return 0;
  const mltM = mltMm / 1000;
  return (rhoOhmMm2PerM * mltM * turns) / (areaMm2 * nParallel);
}

// ── Dowell m-layer AC-resistance kernel ──
/** F_R = Rac/Rdc from Dowell's 1966 m-layer foil-winding equation. D = penetration
 *  ratio (layer thickness in skin depths), m = number of layers stacked across
 *  the field-build direction. m=1 is the skin-effect-only (isolated foil) case. */
export function dowellFR(penetrationRatio: number, layers: number): number {
  const D = penetrationRatio;
  if (!(D > 0)) return 1;
  const m = Math.max(1, layers);
  const skinBracket = (Math.sinh(2 * D) + Math.sin(2 * D)) / (Math.cosh(2 * D) - Math.cos(2 * D));
  const proxBracket = m > 1
    ? ((2 / 3) * (m * m - 1) * (Math.sinh(D) - Math.sin(D))) / (Math.cosh(D) + Math.cos(D))
    : 0;
  return D * (skinBracket + proxBracket);
}

/** Round-wire-layer → equivalent-foil penetration ratio: h_eq=(√π/2)d,
 *  η=(√π/2)(d/pitch), Δ=(h_eq/δ)·√η. pitch = slotWidthMm / conductors-per-layer,
 *  folded here into a direct porosity (0-1) input per the file header. */
export function roundWirePenetration(diameterMm: number, porosity: number, skinDepthMmVal: number): number {
  if (skinDepthMmVal <= 0) return 0;
  const hEqMm = (Math.sqrt(Math.PI) / 2) * diameterMm;
  const eta = Math.min(1, Math.max(0, porosity));
  return (hEqMm / skinDepthMmVal) * Math.sqrt(eta);
}

/** Flat/hairpin conductor penetration ratio: the conductor IS the foil layer
 *  (height = radial/slot-depth dimension), porosity = width/slotWidth (how
 *  much of the slot's cross-flow width this conductor actually fills). */
export function flatWirePenetration(heightMm: number, porosity: number, skinDepthMmVal: number): number {
  if (skinDepthMmVal <= 0) return 0;
  const eta = Math.min(1, Math.max(0, porosity));
  return (heightMm / skinDepthMmVal) * Math.sqrt(eta);
}

// ── Sullivan single-term proximity kernel (litz, and an alternative for round wire) ──
/** F_R = 1 + (π·n·N_s)²·d_s⁶/(192·δ⁴·b²) — Sullivan & Zhang 2014 eq. 3/10.
 *  n = strands per turn (1 for round wire), turnsStacked = layers across the
 *  field-build direction (Dowell's m), all lengths in the same unit (mm here). */
export function sullivanFR(strandsPerTurn: number, turnsStacked: number, strandDiameterMm: number, skinDepthMmVal: number, breadthMm: number): number {
  if (skinDepthMmVal <= 0 || breadthMm <= 0) return 1;
  const effN = strandsPerTurn * turnsStacked;
  return 1 + (Math.pow(Math.PI * effN, 2) * Math.pow(strandDiameterMm, 6)) / (192 * Math.pow(skinDepthMmVal, 4) * breadthMm * breadthMm);
}

/** Litz bundle-construction check: max strands the FIRST twisting operation can
 *  safely combine before bundle-level skin effect erodes the "ideal" result
 *  (Sullivan & Zhang eq. 4/16), n1_max = 4·δ²/d_s². */
export function litzMaxStrandsFirstOperation(strandDiameterMm: number, skinDepthMmVal: number): number {
  if (strandDiameterMm <= 0) return Infinity;
  return (4 * skinDepthMmVal * skinDepthMmVal) / (strandDiameterMm * strandDiameterMm);
}

export type RoundAcMethod = 'sullivan' | 'dowell';

export interface WindingLossInput {
  wireType: WindingWireType;
  geom: WindingGeom;
  rho20OhmMm2PerM: number;
  betaC: number;
  tempC: number;
  seriesTurns: number;      // N, total series turns (DC resistance)
  nParallel: number;        // parallel current paths beyond strandsInHand (default 1)
  layersInSlot: number;     // m, distinct radial conductor positions (AC proximity)
  slotWidthMm: number;      // breadth b, also the flat-wire porosity denominator
  roundPorosity: number;    // used only when wireType==='round'
  mltMm: number;
  currentARms: number;
  frequencyHz: number;
  roundAcMethod: RoundAcMethod; // premium toggle; ignored for flat/litz
}

export interface WindingLossResult {
  rhoOhmMm2PerM: number;
  skinDepthMmVal: number;
  strandAreaMm2: number;
  rdcOhm: number;
  penetrationRatio: number | null; // Δ, when Dowell is the active kernel
  fR: number;                      // Rac/Rdc
  racOhm: number;
  copperLossW: number;
  litzN1Max: number | null;
  litzConstructionOk: boolean | null;
}

export function solveWindingLoss(input: WindingLossInput): WindingLossResult {
  const rho = resistivityAtOhmMm2PerM(input.rho20OhmMm2PerM, input.betaC, input.tempC);
  const delta = skinDepthMm(rho, input.frequencyHz);
  const area = strandAreaMm2(input.geom);
  const nParallelTotal = input.nParallel * (input.geom.kind === 'round' ? input.geom.strandsInHand : 1);
  const rdc = dcResistanceOhm(rho, input.mltMm, input.seriesTurns, area, nParallelTotal);

  let fR = 1;
  let penetrationRatio: number | null = null;
  let litzN1Max: number | null = null;
  let litzConstructionOk: boolean | null = null;

  if (input.geom.kind === 'flat') {
    const porosity = Math.min(1, input.geom.widthMm / Math.max(input.slotWidthMm, 1e-9));
    penetrationRatio = flatWirePenetration(input.geom.heightMm, porosity, delta);
    fR = dowellFR(penetrationRatio, input.layersInSlot);
  } else if (input.geom.kind === 'litz') {
    fR = sullivanFR(input.geom.strandCount, input.layersInSlot, input.geom.strandDiameterMm, delta, input.slotWidthMm);
    litzN1Max = litzMaxStrandsFirstOperation(input.geom.strandDiameterMm, delta);
    litzConstructionOk = input.geom.strandCount <= litzN1Max;
  } else {
    // round
    if (input.roundAcMethod === 'dowell') {
      penetrationRatio = roundWirePenetration(input.geom.diameterMm, input.roundPorosity, delta);
      fR = dowellFR(penetrationRatio, input.layersInSlot);
    } else {
      fR = sullivanFR(1, input.layersInSlot, input.geom.diameterMm, delta, input.slotWidthMm);
    }
  }

  const rac = rdc * fR;
  const copperLossW = input.currentARms * input.currentARms * rac;

  return {
    rhoOhmMm2PerM: rho, skinDepthMmVal: delta, strandAreaMm2: area, rdcOhm: rdc,
    penetrationRatio, fR, racOhm: rac, copperLossW, litzN1Max, litzConstructionOk,
  };
}
