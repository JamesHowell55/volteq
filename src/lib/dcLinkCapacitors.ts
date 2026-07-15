// DC-link film-capacitor library for the DC-Link Sizing calculator.
//
// Primary data set: KEMET C4AQ-M "Miniaturized DC-Link" metallized-polypropylene
// (PP) film capacitors, radial 2/4-lead, automotive grade (AEC-Q200), rated
// 500–1,200 VDC. Values transcribed from the KEMET C4AQ-M datasheet
// (document F3125_C4AQ_M, 5/5/2025), Table 1 "Ratings & Part Number Reference".
// ESR and Irms are the datasheet's 10 kHz / 70 °C figures; Irms is the value
// that produces a ~30 °C hot-spot rise (ΔT = ESR·Irms²·Rth). Rth is the
// hot-spot-to-ambient thermal resistance for a single, freely-cooled part.
//
// A representative spread across each voltage class is included (small → large
// capacitance) rather than the full ~110-part table; the "Custom" path lets a
// user enter any part's C / ESR / Rth / Irms / dimensions and a reference
// part number.

export interface DcLinkCapacitor {
  partNumber: string;
  supplier: string;
  series: string;
  capacitanceUf: number;
  ratedVoltageVdc: number; // VNDC (rated at 85 °C hot spot)
  esrMohm: number;         // ESR at 10 kHz, 70 °C
  irmsRatedA: number;      // RMS current for ~30 °C rise, 10 kHz, 70 °C
  rthCW: number;           // hot-spot → ambient, °C/W, single freely-cooled part
  eslNh: number;           // self-inductance
  boxThicknessMm: number;  // T
  boxHeightMm: number;     // H (tallest — stands off the PCB)
  boxLengthMm: number;     // L
  leads: 2 | 4;
}

// [C(µF), V, ESR(mΩ), Irms(A), Rth(°C/W), ESL(nH), T, H, L, part]
type Row = [number, number, number, number, number, number, number, number, number, string];

const C4AQ_M_ROWS: Row[] = [
  // 500 VDC
  [10, 500, 7.8, 9.6, 36, 22, 13, 25, 31.5, 'C4AQLBU5100M1XK'],
  [25, 500, 4.4, 16.0, 23, 28, 22, 37, 31.5, 'C4AQLBU5250M12K'],
  [50, 500, 2.8, 22.8, 18, 10, 28, 37, 42, 'C4AQLBW5500M3JK'],
  [80, 500, 1.8, 32.4, 14, 13, 35, 46, 42, 'C4AQLBW5800M36K'],
  [110, 500, 1.4, 40.8, 11, 17, 38, 57, 42, 'C4AQLEW6110M3CK'],
  [130, 500, 2.3, 33.3, 10, 15, 35, 50, 57.5, 'C4AQLBW6130M3NK'],
  [210, 500, 1.6, 47.7, 7, 19, 45, 65, 57.5, 'C4AQLEW6210M3BK'],
  // 700 VDC
  [10, 700, 6.8, 11.7, 29, 25, 19, 29, 31.5, 'C4AQJBU5100M11J'],
  [25, 700, 4.3, 17.4, 20, 12, 20, 40, 42, 'C4AQJBW5250M3FJ'],
  [50, 700, 2.3, 29.9, 13, 13, 35, 50, 42, 'C4AQJBW5500M3OJ'],
  [75, 700, 3.1, 28.7, 10, 15, 35, 50, 57.5, 'C4AQJBW5750M3NJ'],
  [110, 700, 2.2, 37.9, 8, 17, 45, 56, 57.5, 'C4AQJEW6110M3AJ'],
  [130, 700, 1.9, 42.9, 7, 19, 45, 65, 57.5, 'C4AQJEW6130M3BJ'],
  // 800 VDC
  [15, 800, 6.2, 14.5, 20, 12, 20, 40, 42, 'C4AQIBW5150M3FJ'],
  [30, 800, 3.2, 23.2, 15, 13, 30, 45, 42, 'C4AQIBW5300M3LJ'],
  [40, 800, 2.5, 28.7, 13, 13, 35, 50, 42, 'C4AQIBW5400M3OJ'],
  [60, 800, 3.3, 27.5, 10, 15, 35, 50, 57.5, 'C4AQIBW5600M3NJ'],
  [85, 800, 2.5, 35.8, 8, 17, 45, 56, 57.5, 'C4AQIEW5850M3AJ'],
  [100, 800, 2.2, 40.6, 7, 19, 45, 65, 57.5, 'C4AQIEW6100M3BJ'],
  // 900 VDC
  [14, 900, 6.0, 14.8, 20, 12, 20, 40, 42, 'C4AQOBW5140M3FJ'],
  [25, 900, 3.5, 22.4, 15, 13, 30, 45, 42, 'C4AQOBW5250M3LJ'],
  [40, 900, 2.3, 32.4, 11, 17, 38, 57, 42, 'C4AQOEW5400M3CJ'],
  [45, 900, 3.9, 25.4, 10, 15, 35, 50, 57.5, 'C4AQOBW5450M3NJ'],
  [65, 900, 2.8, 33.5, 8, 17, 45, 56, 57.5, 'C4AQOEW5650M3AJ'],
  [80, 900, 2.4, 38.7, 7, 19, 45, 65, 57.5, 'C4AQOEW5800M3BJ'],
  // 1000 VDC
  [12, 1000, 6.3, 14.4, 20, 12, 20, 40, 42, 'C4AQNBW5120M3FJ'],
  [20, 1000, 3.9, 21.2, 15, 13, 30, 45, 42, 'C4AQNBW5200M3LJ'],
  [33, 1000, 2.5, 31.1, 11, 17, 38, 57, 42, 'C4AQNEW5330M3CJ'],
  [40, 1000, 4.0, 25.2, 10, 15, 35, 50, 57.5, 'C4AQNBW5400M3NJ'],
  [55, 1000, 3.0, 32.5, 8, 17, 45, 56, 57.5, 'C4AQNEW5550M3AJ'],
  [65, 1000, 2.6, 37.0, 7, 19, 45, 65, 57.5, 'C4AQNEW5650M3BJ'],
  // 1100 VDC
  [16, 1100, 4.4, 19.9, 15, 13, 30, 45, 42, 'C4AQQBW5160M3LJ'],
  [27, 1100, 2.8, 29.6, 11, 17, 38, 57, 42, 'C4AQQEW5270M3CJ'],
  [30, 1100, 4.8, 23.0, 10, 15, 35, 50, 57.5, 'C4AQQBW5300M3NJ'],
  [45, 1100, 3.3, 31.0, 8, 17, 45, 56, 57.5, 'C4AQQEW5450M3AJ'],
  [55, 1100, 2.8, 35.8, 7, 19, 45, 65, 57.5, 'C4AQQEW5550M3BJ'],
];

export const DC_LINK_CAPACITORS: DcLinkCapacitor[] = C4AQ_M_ROWS.map(
  ([c, v, esr, irms, rth, esl, t, h, l, pn]) => ({
    partNumber: pn,
    supplier: 'KEMET',
    series: 'C4AQ-M',
    capacitanceUf: c,
    ratedVoltageVdc: v,
    esrMohm: esr,
    irmsRatedA: irms,
    rthCW: rth,
    eslNh: esl,
    boxThicknessMm: t,
    boxHeightMm: h,
    boxLengthMm: l,
    leads: 4,
  })
);

export const CAP_SUPPLIERS = ['KEMET'] as const;
export const CAP_SERIES = ['C4AQ-M'] as const;

export function seriesForSupplier(supplier: string): string[] {
  return [...new Set(DC_LINK_CAPACITORS.filter((c) => c.supplier === supplier).map((c) => c.series))];
}

export function voltagesForSeries(supplier: string, series: string): number[] {
  return [...new Set(DC_LINK_CAPACITORS.filter((c) => c.supplier === supplier && c.series === series).map((c) => c.ratedVoltageVdc))].sort((a, b) => a - b);
}

export function partsFor(supplier: string, series: string, voltageVdc: number, leads: number): DcLinkCapacitor[] {
  return DC_LINK_CAPACITORS
    .filter((c) => c.supplier === supplier && c.series === series && c.ratedVoltageVdc === voltageVdc && c.leads === leads)
    .sort((a, b) => a.capacitanceUf - b.capacitanceUf);
}

// KEMET C4AQ-M operating-voltage-vs-hot-spot-temperature derating (datasheet):
// VOP70 (70 °C) = 1.2·VNDC, VNDC = rated (85 °C), VOP105 (105 °C) = 0.7·VNDC.
// Linear between the anchor points. Returns the max permissible DC voltage at a
// given hot-spot temperature for a part of the given rated voltage.
export function maxOperatingVoltage(ratedVoltageVdc: number, hotSpotTempC: number): number {
  const vndc = ratedVoltageVdc;
  if (hotSpotTempC <= 70) return 1.2 * vndc;
  if (hotSpotTempC <= 85) return vndc * (1.2 + (1.0 - 1.2) * ((hotSpotTempC - 70) / 15));
  if (hotSpotTempC <= 105) return vndc * (1.0 + (0.7 - 1.0) * ((hotSpotTempC - 85) / 20));
  return 0.7 * vndc * Math.max(0, 1 - (hotSpotTempC - 105) / 20); // beyond 105 °C: extrapolate toward 0 by 125 °C
}

// PP-film life model anchored to the C4AQ-M datasheet:
//   120,000 h at V_rated at hot-spot 70 °C, halving every ~15 °C (60,000 h @ 85 °C),
//   with a voltage-acceleration factor (V_rated/V_applied)^n, n ≈ 7 typical for PP film.
// L = L_base · 2^((T_ref − T_HS)/dT) · (V_rated/V_applied)^n
export const LIFE_BASE_HOURS = 120000;
export const LIFE_REF_HOTSPOT_C = 70;
export const LIFE_TEMP_DOUBLING_C = 15;
export const LIFE_VOLTAGE_EXPONENT = 7;

export function estimateLifeHours(hotSpotTempC: number, appliedVoltageVdc: number, ratedVoltageVdc: number): number {
  const tempFactor = Math.pow(2, (LIFE_REF_HOTSPOT_C - hotSpotTempC) / LIFE_TEMP_DOUBLING_C);
  const vRatio = ratedVoltageVdc > 0 ? Math.max(appliedVoltageVdc, 1) / ratedVoltageVdc : 1;
  const voltageFactor = Math.pow(Math.min(1 / vRatio, 3), LIFE_VOLTAGE_EXPONENT); // derating below rated adds life; cap the bonus
  return LIFE_BASE_HOURS * tempFactor * voltageFactor;
}
