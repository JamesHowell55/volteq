// Battery cell cooling — the steady-state thermal path from a cell's internally-
// generated heat, through the cell's own (anisotropic) conduction, a thermal
// interface material, and out to a liquid coolant or ambient air.
//
// Heat generation: P = I²·R_internal (Joule/ohmic heating), the standard and
// dominant term for battery thermal management sizing. The reversible/entropic
// term (driven by the cell's OCV-vs-temperature slope) is typically only ~10-15%
// of ohmic heating at the moderate-to-high C-rates a cooling system is sized
// against, and can flip sign with SOC/charge-discharge direction — omitted here
// by default (disclosed), offered as an optional add-on.
//
// Internal conduction: cell heat generation is DISTRIBUTED (roughly uniform
// through the cell volume), not a point source at the core — so the correct
// resistance from the hottest interior point to a cooled face is a FRACTION of
// the naive point-source R=L/(kA), not the naive value itself:
//   - Solid cylinder, uniform generation, cooled uniformly around the full
//     lateral (radial) surface: ΔT = Q/(4π·k·L)  ⟹  R = 1/(4π·k·L)
//     (radius cancels — a useful self-check).
//   - Slab of thickness t, uniform generation, cooled from ONE face (other
//     face adiabatic): R = t/(2·k·A).
//   - Slab of thickness t, cooled from BOTH faces (peak at mid-plane):
//     R = t/(8·k·A) — a further 4x reduction vs one-face cooling, not 2x.
// Both derivable from 1-D conduction with uniform volumetric generation
// (q'''=Q/V), solving d²T/dx² = -q'''/k with the appropriate boundary
// conditions — the classic "distributed generation" result that a naive
// point-source model gets wrong by 2-8x.
//
// Cylindrical cells: side (radial-to-can) cooling uses the cylinder form with
// k_radial; base/top (axial, through the jellyroll to one end) cooling uses the
// slab form with k_axial and "thickness"=cell length. Cylindrical cells are, in
// real pack designs, side- or tab-cooled — NOT conduction-cooled end-to-end
// through the jellyroll — because the axial path is long and (depending on
// which of the literature's contested axial-conductivity values applies) can be
// a poor path; this file defaults cylindrical cells to side cooling and flags a
// warning if base/top is selected.
//
// Prismatic/pouch cells: the stacking direction (thin dimension, "thickness")
// is the LOW-conductivity through-plane axis — cooling the large flat faces
// ("side" in this file's face convention) is the short, low-resistance path and
// matches how these cells are built into real packs (cold plates sandwiched
// between cells). Base/top cooling instead conducts along the HIGH-conductivity
// in-plane axis but over the cell's full height — the length that matters here.
//
// Ambient (natural convection): reuses this project's existing Churchill-Chu
// correlations — the horizontal-cylinder form (cableSizingPhysics.ts) for
// cylindrical cells, the vertical-flat-plate form (heatsinkThermalPhysics.ts)
// for prismatic/pouch — solved by bisection on surface temperature, exactly
// the same pattern already used by the Heatsink Thermal calculator.
//
// Liquid coolant: free tier takes a directly-entered representative heat-
// transfer coefficient (no channel geometry needed, avoiding re-deriving the
// Cold Plate/Flow-in-Pipes channel-flow physics inside a battery calculator);
// premium can instead derive h from a flow velocity via the existing duct-
// convection correlation and this site's coolant transport-property data.

import { horizontalCylinderConvection } from './cableSizingPhysics';
import { verticalPlateConvection, type ConvectionResult } from './heatsinkThermalPhysics';
import { ductConvection } from './heatExchangerPhysics';
import type { CellGeometry } from './batteryPackPhysics';

export type CoolingFace = 'side' | 'base' | 'top';
export type CoolingMode = 'liquid' | 'ambient';

export interface CellGeometryInput {
  geometry: CellGeometry;
  diameterMm: number;   // cylindrical
  lengthMm: number;     // cylindrical: axial length; prismatic/pouch: in-plane "tall" dimension
  widthMm: number;      // prismatic/pouch
  thicknessMm: number;  // prismatic/pouch: through-plane (stacking) dimension
  kPrimaryWPerMK: number;   // radial (cylindrical) / through-thickness (prismatic, pouch)
  kSecondaryWPerMK: number; // axial (cylindrical) / in-plane (prismatic, pouch)
}

export interface ConductionPathResult {
  rCondKPerW: number;
  contactAreaM2: number; // area of the cooled face(s), used downstream for TIM + convection
  poorPathWarning: string | null;
}

/** Cylindrical cell: side = radial-to-can (cylinder form, k_radial); base/top =
 *  axial-to-one-end (slab form, k_axial, "thickness" = cell length). */
export function cylindricalConductionPath(
  input: CellGeometryInput, face: CoolingFace, bothFaces: boolean, contactFraction: number,
): ConductionPathResult {
  const rM = input.diameterMm / 2000;
  const lM = input.lengthMm / 1000;
  if (face === 'side') {
    const rCond = 1 / (4 * Math.PI * input.kPrimaryWPerMK * lM);
    const fullLateralAreaM2 = Math.PI * input.diameterMm / 1000 * lM;
    const frac = Math.min(1, Math.max(0.05, contactFraction));
    return {
      rCondKPerW: rCond, contactAreaM2: fullLateralAreaM2 * frac,
      poorPathWarning: frac < 0.95 ? `Only ${Math.round(frac * 100)}% of the can circumference is in contact — the uncooled portion sees a locally hotter can wall than this average-ΔT model shows.` : null,
    };
  }
  const faceAreaM2 = Math.PI * rM * rM;
  const denomFactor = bothFaces ? 8 : 2;
  const rCond = lM / (denomFactor * input.kSecondaryWPerMK * Math.PI * rM * rM);
  return {
    rCondKPerW: rCond, contactAreaM2: faceAreaM2 * (bothFaces ? 2 : 1),
    poorPathWarning: 'Base/top cooling conducts along the full cell length through the jellyroll\'s axial path — a long, often poor route compared to side (can-wall) cooling for cylindrical cells. Real packs almost always side- or tab-cool cylindrical cells; treat this result with caution.',
  };
}

/** Prismatic/pouch cell: side = through-thickness to a large face (short path,
 *  low k, the standard real-pack cooling route); base/top = in-plane along the
 *  full cell length to a small end face (long path, high k). */
export function slabConductionPath(
  input: CellGeometryInput, face: CoolingFace, bothFaces: boolean,
): ConductionPathResult {
  const wM = input.widthMm / 1000, lM = input.lengthMm / 1000, tM = input.thicknessMm / 1000;
  const denomFactor = bothFaces ? 8 : 2;
  if (face === 'side') {
    const faceAreaM2 = wM * lM;
    const rCond = tM / (denomFactor * input.kPrimaryWPerMK * faceAreaM2);
    return { rCondKPerW: rCond, contactAreaM2: faceAreaM2 * (bothFaces ? 2 : 1), poorPathWarning: null };
  }
  const faceAreaM2 = wM * tM;
  const rCond = lM / (denomFactor * input.kSecondaryWPerMK * faceAreaM2);
  return {
    rCondKPerW: rCond, contactAreaM2: faceAreaM2 * (bothFaces ? 2 : 1),
    poorPathWarning: 'Base/top cooling conducts along the cell\'s full height (in-plane) to a small end face — a much smaller contact area than side (large-face) cooling. Real prismatic/pouch packs are almost always cooled from the large flat faces; treat this result with caution.',
  };
}

export function solveConductionPath(
  geomInput: CellGeometryInput, face: CoolingFace, bothFaces: boolean, contactFraction: number,
): ConductionPathResult {
  return geomInput.geometry === 'cylindrical'
    ? cylindricalConductionPath(geomInput, face, bothFaces, contactFraction)
    : slabConductionPath(geomInput, face, bothFaces);
}

export function timResistanceKPerW(thicknessMm: number, conductivityWPerMK: number, areaM2: number): number {
  if (areaM2 <= 0 || conductivityWPerMK <= 0) return 0;
  return (thicknessMm / 1000) / (conductivityWPerMK * areaM2);
}

export interface LiquidCoolingInput {
  mode: 'liquid';
  hWPerM2K: number;
  coolantTempC: number;
}
export interface AmbientCoolingInput {
  mode: 'ambient';
  ambientTempC: number;
}
export type CoolingInput = LiquidCoolingInput | AmbientCoolingInput;

/** Premium: derive h from a flow velocity past the cell using this site's
 *  existing duct-convection correlation, treating the flow gap next to the
 *  cell as the hydraulic diameter (a simplified single-passage model — for a
 *  real multi-cell channel geometry, the Flow-in-Pipes / Cold Plate calculators
 *  give a fuller treatment). */
export function liquidHFromVelocity(velocityMPerS: number, hydraulicDiameterM: number, nu: number, k: number, pr: number): number {
  // Laminar Nusselt 3.66 (uniform wall temperature, round-duct asymptote) is a
  // reasonable default for a simplified single-passage estimate; turbulent
  // kicks in automatically inside ductConvection via the Reynolds threshold.
  return ductConvection(velocityMPerS, hydraulicDiameterM, nu, k, pr, 3.66, 0.4).h;
}

export interface BatteryCoolingResult {
  heatGenerationW: number;
  rCondKPerW: number;
  rTimKPerW: number;
  rConvKPerW: number;
  rTotalKPerW: number;
  contactAreaM2: number;
  hWPerM2K: number;
  surfaceTempC: number;   // outer cooled-face temperature
  hotspotTempC: number;   // internal hot-spot (core) temperature
  coolantOrAmbientTempC: number;
  dominantTerm: 'conduction' | 'tim' | 'convection';
  poorPathWarning: string | null;
}

export function solveBatteryCellCooling(
  geomInput: CellGeometryInput, face: CoolingFace, bothFaces: boolean, contactFraction: number,
  internalResistanceMOhm: number, currentA: number,
  timThicknessMm: number, timConductivityWPerMK: number,
  cooling: CoolingInput,
): BatteryCoolingResult {
  const heatGenerationW = currentA * currentA * (internalResistanceMOhm / 1000);
  const path = solveConductionPath(geomInput, face, bothFaces, contactFraction);
  const rTim = timResistanceKPerW(timThicknessMm, timConductivityWPerMK, path.contactAreaM2);

  let rConv: number, hWPerM2K: number, surfaceTempC: number, refTempC: number;

  if (cooling.mode === 'liquid') {
    hWPerM2K = cooling.hWPerM2K;
    rConv = hWPerM2K > 0 && path.contactAreaM2 > 0 ? 1 / (hWPerM2K * path.contactAreaM2) : Infinity;
    refTempC = cooling.coolantTempC;
    surfaceTempC = refTempC + heatGenerationW * rConv;
  } else {
    refTempC = cooling.ambientTempC;
    let lo = refTempC + 0.001, hi = refTempC + 300;
    let convection: ConvectionResult = { h: 0, nusselt: 0, rayleigh: 0 };
    let mid = lo;
    for (let i = 0; i < 60; i++) {
      mid = (lo + hi) / 2;
      convection = geomInput.geometry === 'cylindrical'
        ? horizontalCylinderConvection(mid, refTempC, geomInput.diameterMm / 1000)
        : verticalPlateConvection(mid, refTempC, geomInput.lengthMm / 1000);
      const qConv = convection.h * path.contactAreaM2 * (mid - refTempC);
      if (qConv > heatGenerationW) hi = mid; else lo = mid;
    }
    surfaceTempC = mid;
    hWPerM2K = convection.h;
    rConv = hWPerM2K > 0 && path.contactAreaM2 > 0 ? 1 / (hWPerM2K * path.contactAreaM2) : Infinity;
  }

  const hotspotTempC = surfaceTempC + heatGenerationW * (path.rCondKPerW + rTim);
  const rTotal = path.rCondKPerW + rTim + rConv;

  const terms: Array<['conduction' | 'tim' | 'convection', number]> = [
    ['conduction', path.rCondKPerW], ['tim', rTim], ['convection', rConv],
  ];
  terms.sort((a, b) => b[1] - a[1]);

  return {
    heatGenerationW, rCondKPerW: path.rCondKPerW, rTimKPerW: rTim, rConvKPerW: rConv,
    rTotalKPerW: rTotal, contactAreaM2: path.contactAreaM2, hWPerM2K,
    surfaceTempC, hotspotTempC, coolantOrAmbientTempC: refTempC,
    dominantTerm: terms[0][0], poorPathWarning: path.poorPathWarning,
  };
}
