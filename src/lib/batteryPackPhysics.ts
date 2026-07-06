// Battery pack series/parallel (SxP) sizing — standard series/parallel circuit
// combination rules applied to a single cell's spec, not a novel derivation:
//  - S cells in series: voltages add, internal resistances add.
//  - P cells in parallel: capacity (charge) adds, internal resistance divides by P.
// So for an SxP pack (S series strings, each string P cells in parallel — the
// standard "P then S" topology): pack voltage = S*Vcell, pack capacity = P*Ahcell,
// pack resistance = S*(Rcell/P).

export interface CellPreset {
  id: string;
  label: string;
  nominalVoltage: number; // V
  capacityAh: number;
  internalResistanceMOhm: number;
  massG: number;
  maxContinuousDischargeC: number; // C-rate, i.e. max continuous current = C * capacityAh
  chemistry: string;
}

// Representative typical values for common cell formats — real cells vary by
// specific part number/manufacturer; treat these as reasonable starting points,
// not a substitute for the actual datasheet of the cell being used.
export const CELL_PRESETS: CellPreset[] = [
  { id: '18650_liion', label: '18650 Li-ion (~3000 mAh)', nominalVoltage: 3.6, capacityAh: 3.0, internalResistanceMOhm: 35, massG: 45, maxContinuousDischargeC: 2, chemistry: 'NMC/NCA' },
  { id: '21700_liion', label: '21700 Li-ion (~5000 mAh)', nominalVoltage: 3.6, capacityAh: 5.0, internalResistanceMOhm: 20, massG: 70, maxContinuousDischargeC: 3, chemistry: 'NMC/NCA' },
  { id: 'pouch_liion', label: 'Li-ion pouch cell (~10 Ah)', nominalVoltage: 3.7, capacityAh: 10, internalResistanceMOhm: 3, massG: 180, maxContinuousDischargeC: 3, chemistry: 'NMC' },
  { id: 'lifepo4_prismatic', label: 'LiFePO4 prismatic (~100 Ah)', nominalVoltage: 3.2, capacityAh: 100, internalResistanceMOhm: 0.5, massG: 1900, maxContinuousDischargeC: 1, chemistry: 'LFP' },
  { id: 'custom', label: 'Custom', nominalVoltage: 3.7, capacityAh: 3.0, internalResistanceMOhm: 30, massG: 45, maxContinuousDischargeC: 2, chemistry: 'Custom' },
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
