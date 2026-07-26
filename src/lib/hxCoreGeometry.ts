// Core geometry for the Heat Exchanger Sizing Calculator — three liquid-to-air core types,
// all reduced to the same underlying "duct-flow" idealization (see heatExchangerPhysics.ts):
// air flows through a set of parallel rectangular channels formed between fin plates, and each
// fin conducts from a tube/port wall (its base) out to the adiabatic midpoint between two
// rows (its tip) — the standard straight-fin symmetry argument for a repeating tube/fin array.
//
// This first-principles duct-flow treatment was chosen deliberately over the industry-standard
// Zukauskas tube-bank / Kays & London empirical-surface approach: that approach needs large
// multi-row empirical tables (C/m constants per Reynolds range x tube arrangement, row-count
// correction factors) that could not be reliably sourced and independently verified this session
// — see heatExchangerPhysics.ts's file header for the full disclosure.
//
// Round-tube (plain and louvered fin) and microchannel (flat tube) share an identical geometric
// treatment: a "row pitch" (spacing between tube rows / flat tubes) and a "row blockage"
// dimension (tube OD / flat-tube height) play the same structural role in both, so one internal
// helper computes the duct/fin geometry for both profiles — only which raw dimensions feed it
// differs.

export type HxCoreProfileId = 'roundTubePlateFin' | 'roundTubeLouveredFin' | 'microchannelFlatTube';

export interface HxCoreProfileDef {
  id: HxCoreProfileId;
  label: string;
  description: string;
}

export const HX_CORE_PROFILES: HxCoreProfileDef[] = [
  {
    id: 'roundTubePlateFin',
    label: 'Round tube, plate fin',
    description: 'Round coolant tubes with continuous flat fins between rows. Air side modelled as duct flow through the fin channels (Dittus-Boelter/laminar-constant), not a tube-bank correlation — see Reference & assumptions.',
  },
  {
    id: 'roundTubeLouveredFin',
    label: 'Round tube, louvered fin',
    description: 'Same geometry as plate fin, plus a disclosed literature-typical air-side heat-transfer enhancement factor (louvers are not modelled from first principles — see Reference & assumptions).',
  },
  {
    id: 'microchannelFlatTube',
    label: 'Microchannel, flat tube',
    description: 'Flat extruded tubes with multiple internal coolant ports, corrugated fin between tubes. Same duct-flow air-side treatment as the round-tube types.',
  },
];

export interface RoundTubeDimensions {
  profile: 'roundTubePlateFin' | 'roundTubeLouveredFin';
  tubeRunMm: number;        // tube length; also the direction fin plates repeat along (pitch = finPitchMm)
  stackMm: number;          // frontal dimension tube rows are stacked across (pitch = transversePitchMm)
  coreDepthMm: number;      // air flow-path length through the core
  tubeOdMm: number;
  tubeWallMm: number;
  transversePitchMm: number; // tube row center-to-center spacing across stackMm
  finPitchMm: number;
  finThicknessMm: number;
  louverEnhancementFactor?: number; // roundTubeLouveredFin only; typical published range ~2-3x, default 2.2
}

export interface MicrochannelDimensions {
  profile: 'microchannelFlatTube';
  tubeRunMm: number;         // tube length; also the direction corrugated-fin legs repeat along (pitch = finPitchMm)
  stackMm: number;           // frontal dimension flat tubes are stacked across (pitch = tubeSpacingMm)
  tubeWidthMm: number;       // flat tube's width = the air flow-path length through the core
  tubeHeightMm: number;      // flat tube's thin (stacked) dimension
  tubeSpacingMm: number;     // flat-tube center-to-center spacing across stackMm
  portWidthMm: number;
  portHeightMm: number;
  portsPerTube: number;
  finPitchMm: number;
  finThicknessMm: number;
}

export type HxCoreDimensions = RoundTubeDimensions | MicrochannelDimensions;

export interface HxCoreGeometryResult {
  frontalAreaM2: number;
  coreDepthM: number;
  nTubes: number;
  sigma: number;              // free-flow area fraction (frontal -> in-core open area)
  freeFlowAreaM2: number;
  geometryValid: boolean;     // false if entered dimensions physically overlap (clamped sigma, flag in UI)
  airDuctDhM: number;         // hydraulic diameter of the air-side fin channel (parallel-plate duct)
  airFinRawAreaM2: number;    // total fin area, both faces, pre-efficiency
  airFinEquivHeightM: number; // straight-fin equivalent length fed into finEfficiency()
  airFinThicknessM: number;   // fed into finEfficiency() alongside airFinEquivHeightM
  coolantFlowAreaM2: number;
  coolantDuctDhM: number;
  coolantWettedAreaM2: number;
}

function clampSigma(raw: number): { sigma: number; valid: boolean } {
  if (!isFinite(raw) || raw <= 0 || raw >= 1) return { sigma: Math.min(Math.max(raw, 0.02), 0.98), valid: false };
  return { sigma: raw, valid: true };
}

// Shared air-side duct/fin geometry — identical role for both profiles: `rowPitchMm` is the
// spacing between tube rows (round tube) or flat tubes (microchannel); `rowBlockageMm` is the
// dimension of the tube/flat-tube itself that blocks that row pitch (tube OD / flat-tube height).
function computeAirSideGeometry(params: {
  tubeRunMm: number; stackMm: number; coreDepthMm: number;
  rowPitchMm: number; rowBlockageMm: number; finPitchMm: number; finThicknessMm: number;
}) {
  const { tubeRunMm, stackMm, coreDepthMm, rowPitchMm, rowBlockageMm, finPitchMm, finThicknessMm } = params;
  const frontalAreaM2 = (tubeRunMm / 1000) * (stackMm / 1000);
  const coreDepthM = coreDepthMm / 1000;
  const nTubes = Math.max(1, Math.round(stackMm / rowPitchMm));

  const finBlockageFrac = (finPitchMm - finThicknessMm) / finPitchMm;
  const rowBlockageFrac = (rowPitchMm - rowBlockageMm) / rowPitchMm;
  const { sigma, valid } = clampSigma(finBlockageFrac * rowBlockageFrac);

  const airDuctDhM = 2 * (finPitchMm - finThicknessMm) / 1000;
  const airFinEquivHeightM = Math.max(rowPitchMm - rowBlockageMm, 0) / 2 / 1000;
  const nFinLayers = Math.max(1, Math.round(tubeRunMm / finPitchMm));
  const airFinRawAreaM2 = nFinLayers * 2 * (stackMm / 1000) * coreDepthM;

  return {
    frontalAreaM2, coreDepthM, nTubes, sigma, geometryValid: valid,
    freeFlowAreaM2: frontalAreaM2 * sigma, airDuctDhM, airFinEquivHeightM, airFinRawAreaM2,
    airFinThicknessM: finThicknessMm / 1000,
  };
}

export function computeHxCoreGeometry(dims: HxCoreDimensions): HxCoreGeometryResult {
  if (dims.profile === 'microchannelFlatTube') {
    const air = computeAirSideGeometry({
      tubeRunMm: dims.tubeRunMm, stackMm: dims.stackMm, coreDepthMm: dims.tubeWidthMm,
      rowPitchMm: dims.tubeSpacingMm, rowBlockageMm: dims.tubeHeightMm,
      finPitchMm: dims.finPitchMm, finThicknessMm: dims.finThicknessMm,
    });
    const portWM = dims.portWidthMm / 1000;
    const portHM = dims.portHeightMm / 1000;
    const nPorts = air.nTubes * Math.max(1, Math.round(dims.portsPerTube));
    return {
      ...air,
      coolantFlowAreaM2: nPorts * portWM * portHM,
      coolantDuctDhM: (2 * portWM * portHM) / (portWM + portHM),
      coolantWettedAreaM2: nPorts * 2 * (portWM + portHM) * (dims.tubeRunMm / 1000),
    };
  }

  const air = computeAirSideGeometry({
    tubeRunMm: dims.tubeRunMm, stackMm: dims.stackMm, coreDepthMm: dims.coreDepthMm,
    rowPitchMm: dims.transversePitchMm, rowBlockageMm: dims.tubeOdMm,
    finPitchMm: dims.finPitchMm, finThicknessMm: dims.finThicknessMm,
  });
  const idM = (dims.tubeOdMm - 2 * dims.tubeWallMm) / 1000;
  return {
    ...air,
    coolantFlowAreaM2: air.nTubes * (Math.PI / 4) * idM * idM,
    coolantDuctDhM: idM,
    coolantWettedAreaM2: air.nTubes * Math.PI * idM * (dims.tubeRunMm / 1000),
  };
}

export function defaultDimensionsForHxProfile(profile: HxCoreProfileId): HxCoreDimensions {
  switch (profile) {
    case 'roundTubePlateFin':
      return {
        profile, tubeRunMm: 300, stackMm: 300, coreDepthMm: 25,
        tubeOdMm: 8, tubeWallMm: 0.4, transversePitchMm: 12.7, finPitchMm: 2, finThicknessMm: 0.15,
      };
    case 'roundTubeLouveredFin':
      return {
        profile, tubeRunMm: 300, stackMm: 300, coreDepthMm: 25,
        tubeOdMm: 8, tubeWallMm: 0.4, transversePitchMm: 12.7, finPitchMm: 2, finThicknessMm: 0.15,
        louverEnhancementFactor: 2.2,
      };
    case 'microchannelFlatTube':
      return {
        profile, tubeRunMm: 300, stackMm: 300,
        tubeWidthMm: 20, tubeHeightMm: 2, tubeSpacingMm: 10,
        portWidthMm: 0.8, portHeightMm: 1.5, portsPerTube: 12,
        finPitchMm: 1.2, finThicknessMm: 0.1,
      };
  }
}
