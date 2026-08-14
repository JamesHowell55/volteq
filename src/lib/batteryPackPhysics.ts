// Battery pack series/parallel (SxP) sizing — standard series/parallel circuit
// combination rules applied to a single cell's spec, not a novel derivation:
//  - S cells in series: voltages add, internal resistances add.
//  - P cells in parallel: capacity (charge) adds, internal resistance divides by P.
// So for an SxP pack (S series strings, each string P cells in parallel — the
// standard "P then S" topology): pack voltage = S*Vcell, pack capacity = P*Ahcell,
// pack resistance = S*(Rcell/P).

export type CellGeometry = 'cylindrical' | 'prismatic' | 'pouch';

export interface CellPreset {
  id: string;
  label: string;
  nominalVoltage: number; // V
  capacityAh: number;
  internalResistanceMOhm: number;
  massG: number;
  maxContinuousDischargeC: number; // C-rate, i.e. max continuous current = C * capacityAh
  chemistry: string;
  // Geometry + anisotropic thermal conductivity — used by the Battery Cell Cooling
  // calculator. Optional so this stays a strict superset of the original SxP-only
  // fields. kPrimary = radial (cylindrical) / through-thickness (prismatic, pouch);
  // kSecondary = axial (cylindrical) / in-plane (prismatic, pouch). Sourced from a
  // dedicated research pass (see BATTERY_COOLING project memory) — cylindrical
  // radial conductivity is well-constrained in the literature (~0.2-0.5 W/m·K);
  // axial is genuinely contested across measurement methods (published range
  // ~1.5-30 W/m·K) and defaulted here toward the higher, most-cited value since it
  // barely affects the recommended side-cooling path. Prismatic/pouch through-
  // thickness ~0.5-0.8, in-plane ~20 W/m·K, both representative/disclosed ranges,
  // not a specific manufacturer's datasheet value.
  geometry?: CellGeometry;
  diameterMm?: number;      // cylindrical
  lengthMm?: number;        // cylindrical: axial height; prismatic/pouch: in-plane "tall" dimension
  widthMm?: number;         // prismatic/pouch: in-plane "wide" dimension
  thicknessMm?: number;     // prismatic/pouch: through-plane (stacking-direction) dimension
  kPrimaryWPerMK?: number;
  kSecondaryWPerMK?: number;
  kNote?: string;           // disclosure for extrapolated/uncertain conductivity data
}

// Representative typical values for common cell formats — real cells vary by
// specific part number/manufacturer; treat these as reasonable starting points,
// not a substitute for the actual datasheet of the cell being used.
export const CELL_PRESETS: CellPreset[] = [
  { id: '18650_liion', label: '18650 Li-ion (~3000 mAh)', nominalVoltage: 3.6, capacityAh: 3.0, internalResistanceMOhm: 35, massG: 45, maxContinuousDischargeC: 2, chemistry: 'NMC/NCA',
    geometry: 'cylindrical', diameterMm: 18, lengthMm: 65, kPrimaryWPerMK: 0.35, kSecondaryWPerMK: 27 },
  { id: '21700_liion', label: '21700 Li-ion (~5000 mAh)', nominalVoltage: 3.6, capacityAh: 5.0, internalResistanceMOhm: 20, massG: 70, maxContinuousDischargeC: 3, chemistry: 'NMC/NCA',
    geometry: 'cylindrical', diameterMm: 21, lengthMm: 70, kPrimaryWPerMK: 0.35, kSecondaryWPerMK: 27 },
  { id: '26650_lifepo4', label: '26650 LiFePO4 (~4000 mAh)', nominalVoltage: 3.2, capacityAh: 4.0, internalResistanceMOhm: 12, massG: 85, maxContinuousDischargeC: 3, chemistry: 'LFP',
    geometry: 'cylindrical', diameterMm: 26, lengthMm: 65, kPrimaryWPerMK: 0.2, kSecondaryWPerMK: 30 },
  { id: '4680_liion', label: '4680 Li-ion tabless (~26000 mAh)', nominalVoltage: 3.6, capacityAh: 26, internalResistanceMOhm: 2.5, massG: 355, maxContinuousDischargeC: 3, chemistry: 'NMC/NCA',
    geometry: 'cylindrical', diameterMm: 46, lengthMm: 80, kPrimaryWPerMK: 0.35, kSecondaryWPerMK: 27,
    kNote: '4680\'s tabless construction has no published anisotropic-conductivity measurement yet — these values are extrapolated from 21700-class jellyroll data, not 4680-specific.' },
  { id: 'pouch_liion', label: 'Li-ion pouch cell (~10 Ah)', nominalVoltage: 3.7, capacityAh: 10, internalResistanceMOhm: 3, massG: 180, maxContinuousDischargeC: 3, chemistry: 'NMC',
    geometry: 'pouch', widthMm: 150, lengthMm: 100, thicknessMm: 12, kPrimaryWPerMK: 0.6, kSecondaryWPerMK: 20 },
  { id: 'lifepo4_prismatic', label: 'LiFePO4 prismatic (~100 Ah)', nominalVoltage: 3.2, capacityAh: 100, internalResistanceMOhm: 0.5, massG: 1900, maxContinuousDischargeC: 1, chemistry: 'LFP',
    geometry: 'prismatic', widthMm: 150, lengthMm: 95, thicknessMm: 27, kPrimaryWPerMK: 0.6, kSecondaryWPerMK: 20 },
  { id: 'custom', label: 'Custom', nominalVoltage: 3.7, capacityAh: 3.0, internalResistanceMOhm: 30, massG: 45, maxContinuousDischargeC: 2, chemistry: 'Custom',
    geometry: 'cylindrical', diameterMm: 18, lengthMm: 65, kPrimaryWPerMK: 0.35, kSecondaryWPerMK: 27 },
];

export function getCellPreset(id: string): CellPreset {
  return CELL_PRESETS.find((p) => p.id === id) ?? CELL_PRESETS[0];
}

export interface PackConfig {
  cell: CellPreset;
  seriesCount: number; // S
  parallelCount: number; // P
}

export interface PackResult {
  totalCells: number;
  packVoltageNominal: number; // V
  packCapacityAh: number;
  packEnergyWh: number;
  packInternalResistanceMOhm: number;
  packMassKg: number;
  packMaxContinuousDischargeA: number;
  voltageSagAtLoadV: number | null;
  loadedVoltageV: number | null;
}

export function solveBatteryPack(config: PackConfig, loadCurrentA?: number): PackResult {
  const { cell, seriesCount, parallelCount } = config;
  const S = Math.max(1, seriesCount);
  const P = Math.max(1, parallelCount);

  const totalCells = S * P;
  const packVoltageNominal = S * cell.nominalVoltage;
  const packCapacityAh = P * cell.capacityAh;
  const packEnergyWh = packVoltageNominal * packCapacityAh;
  const packInternalResistanceMOhm = S * (cell.internalResistanceMOhm / P);
  const packMassKg = (totalCells * cell.massG) / 1000;
  const packMaxContinuousDischargeA = P * cell.capacityAh * cell.maxContinuousDischargeC;

  let voltageSagAtLoadV: number | null = null;
  let loadedVoltageV: number | null = null;
  if (loadCurrentA !== undefined && loadCurrentA > 0) {
    voltageSagAtLoadV = loadCurrentA * (packInternalResistanceMOhm / 1000);
    loadedVoltageV = packVoltageNominal - voltageSagAtLoadV;
  }

  return {
    totalCells,
    packVoltageNominal,
    packCapacityAh,
    packEnergyWh,
    packInternalResistanceMOhm,
    packMassKg,
    packMaxContinuousDischargeA,
    voltageSagAtLoadV,
    loadedVoltageV,
  };
}
