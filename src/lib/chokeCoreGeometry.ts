// Simplified 2D-profile core geometry for the Choke Sizing Calculator.
//
// Toroidal and Oval/racetrack use exact closed-form geometry from the entered
// dimensions. U-core and E-core are approximated as a simple rectangular
// magnetic loop — real datasheets publish part-specific Ae/le/Wa, and there
// is no single universal formula for those families the way there is for a
// toroid, so this is a disclosed simplification (see UI hint text).

export type CoreProfileId = 'toroidal' | 'oval' | 'ucore' | 'ecore';

export interface CoreProfileDef {
  id: CoreProfileId;
  label: string;
  description: string;
}

export const CORE_PROFILES: CoreProfileDef[] = [
  { id: 'toroidal', label: 'Toroidal', description: 'Closed ring core. Ae/le/Wa from a rectangular (square-cut) annulus — exact for ferrite and tape-wound/nanocrystalline toroids; rounded-cross-section powder toroids (MPP/Kool Mµ) typically have ~15-30% less real Ae than this estimate for the same OD/ID/height, so treat as an upper bound for powder cores.' },
  { id: 'oval', label: 'Oval / racetrack', description: 'Two semicircular ends joined by straight sections. Exact geometry from straight length, inner/outer radius, and height.' },
  { id: 'ucore', label: 'U-core', description: 'Two U-shaped halves forming a rectangular loop. Approximated as a simple rectangular magnetic circuit — cross-check against manufacturer Ae/le/Wa for a final design.' },
  { id: 'ecore', label: 'E-core', description: 'Two E-shaped halves; the winding/busbar sits on the center leg. Approximated as a simple rectangular magnetic circuit with flux splitting through two outer legs — cross-check against manufacturer Ae/le/Wa for a final design.' },
];

export interface ToroidalDimensions {
  profile: 'toroidal';
  outerDiameterMm: number;
  innerDiameterMm: number;
  heightMm: number;
}

export interface OvalDimensions {
  profile: 'oval';
  straightLengthMm: number;
  innerRadiusMm: number;
  outerRadiusMm: number;
  heightMm: number;
}

export interface UCoreDimensions {
  profile: 'ucore';
  legWidthMm: number;
  stackDepthMm: number;
  windowHeightMm: number;
  windowWidthMm: number;
}

export interface ECoreDimensions {
  profile: 'ecore';
  centerLegWidthMm: number;
  stackDepthMm: number;
  windowHeightMm: number;
  windowWidthMm: number;
}

export type CoreDimensions = ToroidalDimensions | OvalDimensions | UCoreDimensions | ECoreDimensions;

export interface CoreGeometryResult {
  effectiveAreaMm2: number; // Ae
  pathLengthMm: number; // le
  windowAreaMm2: number; // Wa
  volumeMm3: number; // Ve = Ae * le
}

export function computeCoreGeometry(dims: CoreDimensions): CoreGeometryResult {
  let effectiveAreaMm2: number;
  let pathLengthMm: number;
  let windowAreaMm2: number;

  switch (dims.profile) {
    case 'toroidal': {
      const { outerDiameterMm: od, innerDiameterMm: id, heightMm: h } = dims;
      effectiveAreaMm2 = h * (od - id) / 2;
      pathLengthMm = Math.PI * (od + id) / 2;
      windowAreaMm2 = Math.PI * (id / 2) ** 2;
      break;
    }
    case 'oval': {
      const { straightLengthMm: s, innerRadiusMm: ri, outerRadiusMm: ro, heightMm: h } = dims;
      effectiveAreaMm2 = h * (ro - ri);
      pathLengthMm = 2 * s + Math.PI * (ro + ri);
      windowAreaMm2 = 2 * ri * s + Math.PI * ri ** 2;
      break;
    }
    case 'ucore': {
      const { legWidthMm: a, stackDepthMm: d, windowHeightMm: hw, windowWidthMm: ww } = dims;
      effectiveAreaMm2 = a * d;
      pathLengthMm = 2 * (hw + ww);
      windowAreaMm2 = hw * ww;
      break;
    }
    case 'ecore': {
      const { centerLegWidthMm: a, stackDepthMm: d, windowHeightMm: hw, windowWidthMm: ww } = dims;
      effectiveAreaMm2 = a * d;
      pathLengthMm = 2 * hw + ww;
      windowAreaMm2 = 2 * hw * ww;
      break;
    }
  }

  return {
    effectiveAreaMm2,
    pathLengthMm,
    windowAreaMm2,
    volumeMm3: effectiveAreaMm2 * pathLengthMm,
  };
}

export function defaultDimensionsForProfile(profile: CoreProfileId): CoreDimensions {
  switch (profile) {
    case 'toroidal':
      return { profile, outerDiameterMm: 40, innerDiameterMm: 24, heightMm: 15 };
    case 'oval':
      return { profile, straightLengthMm: 20, innerRadiusMm: 12, outerRadiusMm: 20, heightMm: 15 };
    case 'ucore':
      return { profile, legWidthMm: 15, stackDepthMm: 20, windowHeightMm: 25, windowWidthMm: 15 };
    case 'ecore':
      return { profile, centerLegWidthMm: 12, stackDepthMm: 20, windowHeightMm: 20, windowWidthMm: 12 };
  }
}
