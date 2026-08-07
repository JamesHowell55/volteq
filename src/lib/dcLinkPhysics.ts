// DC-link capacitor sizing physics for a three-phase voltage-source inverter
// (motor controller). Covers: the DC-link RMS ripple current (Kolar & Round
// closed form), the capacitance needed to hold the switching-frequency voltage
// ripple, the source-cable-inductance / LC-resonance constraint, and — once a
// specific capacitor is chosen — the parallel count, loss, hot-spot temperature
// (with array thermal-derating and a cooling option) and an expected-life
// estimate, plus a mechanical grid layout and envelope.
//
// RMS ripple current — Kolar & Round, "Analytical Calculation of the RMS
// Current Stress on the DC-Link Capacitor of Voltage-PWM Converter Systems"
// (IEE Proc. Electr. Power Appl., 2006), Eq. 28:
//
//   I_C,rms = I_ph,rms · sqrt{ 2·M·[ √3/(4π) + cos²φ·( √3/π − 9·M/16 ) ] }
//
// with I_ph,rms the RMS output phase current, M the modulation index (space-
// vector depth, 0…~1.15) and cos φ the load power factor. The ratio peaks near
// M ≈ 0.6, reaching ~0.6–0.65 · I_ph,rms — the classic motor-drive result.

import type { DcLinkCapacitor } from './dcLinkCapacitors';
import { indicativeCapCostUsd } from './dcLinkCapacitors';

const SQRT3 = Math.sqrt(3);

export interface DcLinkInput {
  busVoltageV: number;         // nominal DC-link voltage
  rippleVoltagePkPkV: number;  // allowed peak-to-peak DC-link voltage ripple
  outputFreqHz: number;        // motor fundamental output frequency (informational)
  switchingFreqHz: number;     // inverter PWM switching frequency
  phaseCurrentRmsA: number;    // RMS output phase current
  powerFactor: number;         // cos φ (0–1)
  modulationIndex: number;     // M (0–~1.15)
  cableInductanceH: number;    // DC-side source/cable stray inductance
}

export interface DcLinkSizing {
  rippleCurrentRmsA: number;   // I_C,rms the capacitor bank must carry (Kolar Eq. 28)
  rippleCurrentRatio: number;  // I_C,rms / I_ph,rms
  capForVoltageRippleUf: number; // C to hold the switching-ripple within limit
  capForDecouplingUf: number;  // min C so the LC resonance stays below f_sw
  requiredCapacitanceUf: number; // governing value = max of the two
  governedBy: 'voltage ripple' | 'source decoupling';
  storedEnergyJ: number;       // ½·C·V² at the required capacitance
}

/** LC resonance of the source cable inductance with a given bank capacitance. */
export function resonanceHz(cableInductanceH: number, capacitanceUf: number): number {
  const C = capacitanceUf * 1e-6;
  if (cableInductanceH <= 0 || C <= 0) return Infinity;
  return 1 / (2 * Math.PI * Math.sqrt(cableInductanceH * C));
}

/** DC-link RMS ripple current, Kolar & Round Eq. 28. */
export function dcLinkRippleCurrentA(phaseCurrentRmsA: number, modulationIndex: number, powerFactor: number): number {
  const M = Math.max(modulationIndex, 0);
  const cos2 = powerFactor * powerFactor;
  const inner = SQRT3 / (4 * Math.PI) + cos2 * (SQRT3 / Math.PI - (9 * M) / 16);
  const val = 2 * M * inner;
  return phaseCurrentRmsA * Math.sqrt(Math.max(val, 0));
}

export function solveDcLinkSizing(inp: DcLinkInput): DcLinkSizing {
  const iRms = dcLinkRippleCurrentA(inp.phaseCurrentRmsA, inp.modulationIndex, inp.powerFactor);

  // Voltage-ripple sizing: treat the capacitor reactance as the dominant
  // impedance at the switching frequency, so the RMS ripple current across it
  // produces the allowed RMS ripple voltage. V_rip,rms ≈ ΔV_pp / (2√2).
  // C = I_C,rms / (2π·f_sw·V_rip,rms). Conservative (all ripple taken at f_sw).
  const vRipRms = inp.rippleVoltagePkPkV / (2 * Math.SQRT2);
  const capRippleF = vRipRms > 0 && inp.switchingFreqHz > 0
    ? iRms / (2 * Math.PI * inp.switchingFreqHz * vRipRms)
    : 0;

  // Source-decoupling minimum: keep the source-cable-inductance ↔ cap resonance
  // below the switching frequency so the cap (not the source) supplies the HF
  // ripple. At f_res = f_sw the cap and cable reactances are equal, so
  //   C ≥ 1/(L·(2π·f_sw)²)  gives f_res ≤ f_sw. This is usually a small minimum;
  // a further factor of ~2–3 of margin is good practice (reported separately).
  const capDecoupleF = inp.cableInductanceH > 0 && inp.switchingFreqHz > 0
    ? 1 / (inp.cableInductanceH * Math.pow(2 * Math.PI * inp.switchingFreqHz, 2))
    : 0;

  const requiredF = Math.max(capRippleF, capDecoupleF);
  const governedBy: DcLinkSizing['governedBy'] = capDecoupleF > capRippleF ? 'source decoupling' : 'voltage ripple';

  return {
    rippleCurrentRmsA: iRms,
    rippleCurrentRatio: inp.phaseCurrentRmsA > 0 ? iRms / inp.phaseCurrentRmsA : 0,
    capForVoltageRippleUf: capRippleF * 1e6,
    capForDecouplingUf: capDecoupleF * 1e6,
    requiredCapacitanceUf: requiredF * 1e6,
    governedBy,
    storedEnergyJ: 0.5 * requiredF * inp.busVoltageV * inp.busVoltageV,
  };
}

// ── Capacitor bank: parallel count, thermal, life ──────────────────────────

export type CoolingMethod = 'natural' | 'forcedAir' | 'strongForcedAir' | 'conduction';

export interface CapBankInput {
  requiredCapacitanceUf: number;
  rippleCurrentRmsA: number;
  busVoltageV: number;
  ambientTempC: number;
  // per-capacitor properties
  capUf: number;
  ratedVoltageVdc: number;
  esrMohm: number;
  eslNh: number;
  irmsRatedA: number;
  rthCW: number;               // single freely-cooled part, HS→ambient
  boxLengthMm: number;
  boxThicknessMm: number;
  boxHeightMm: number;
  // layout & cooling
  columns: number;             // 0 = auto (ceil√N)
  spacingMm: number;
  coolingMethod: CoolingMethod;
  conductionRthCW: number;     // used when coolingMethod === 'conduction' (per-cap HS→sink)
}

export interface CapBankResult {
  count: number;
  countForCapacitance: number;
  countForCurrent: number;
  totalCapacitanceUf: number;
  bankEsrMohm: number;         // parallel ESR
  bankEslNh: number;           // parallel ESL (interconnect not included)
  bankMassG: number;           // estimated bank mass
  currentPerCapA: number;
  lossPerCapW: number;
  lossTotalW: number;
  rthSinglaCW: number;         // effective single-part R_th after cooling
  rthWorstCW: number;          // worst (most-enclosed) cap after array derating + cooling
  hotSpotRiseC: number;        // worst-case ΔT
  hotSpotTempC: number;        // worst-case T_HS
  exposedFaceEq: number;       // effective exposed faces of the worst cap (of 5)
  // layout
  columnsUsed: number;
  rows: number;
  lastRowCount: number;
  envelopeWmm: number;
  envelopeDmm: number;
  envelopeHmm: number;
}

function coolingMultiplier(method: CoolingMethod): number {
  switch (method) {
    case 'forcedAir': return 0.6;
    case 'strongForcedAir': return 0.4;
    default: return 1; // natural (conduction handled separately)
  }
}

/** Effective exposed faces (of 5: 4 sides + top) for the most-enclosed cap in a
 *  rows×cols grid. A blocked side facing a neighbour across the gap still cools
 *  partially — the gap factor grows with spacing. Baseline single part = 5. */
function worstCapExposedFaces(rows: number, cols: number, spacingMm: number): number {
  const blockedAlongCols = cols >= 3 ? 2 : cols === 2 ? 1 : 0;
  const blockedAlongRows = rows >= 3 ? 2 : rows === 2 ? 1 : 0;
  const blocked = Math.min(4, blockedAlongCols + blockedAlongRows);
  const openSides = 4 - blocked;
  const gapFactor = Math.min(0.7, Math.max(0.3, 0.25 + spacingMm / 20));
  return 1 /* top */ + openSides * 1.0 + blocked * gapFactor;
}

export function solveCapBank(inp: CapBankInput): CapBankResult {
  const countForCapacitance = inp.capUf > 0 ? Math.ceil(inp.requiredCapacitanceUf / inp.capUf) : 1;
  const countForCurrent = inp.irmsRatedA > 0 ? Math.ceil(inp.rippleCurrentRmsA / inp.irmsRatedA) : 1;
  const count = Math.max(1, countForCapacitance, countForCurrent);

  const totalCapacitanceUf = count * inp.capUf;
  const bankEsrMohm = inp.esrMohm / count;
  const bankEslNh = inp.eslNh / count;
  const bankMassG = count * ((inp.boxLengthMm * inp.boxThicknessMm * inp.boxHeightMm) / 1000) * CAP_MASS_DENSITY_G_PER_CM3;
  const currentPerCapA = inp.rippleCurrentRmsA / count;
  const lossPerCapW = Math.pow(currentPerCapA, 2) * (inp.esrMohm / 1000);
  const lossTotalW = lossPerCapW * count;

  // Layout: default to a near-square grid (cols = ceil√N) unless overridden.
  const columnsUsed = Math.max(1, inp.columns > 0 ? Math.round(inp.columns) : Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columnsUsed);
  const lastRowCount = count - (rows - 1) * columnsUsed;

  // Effective single-part R_th after the cooling method.
  let rthSingle: number;
  if (inp.coolingMethod === 'conduction') {
    rthSingle = inp.conductionRthCW; // cap → cold surface; array air-side derating not applied
  } else {
    rthSingle = inp.rthCW * coolingMultiplier(inp.coolingMethod);
  }

  // Array derating (air cooling only): the most-enclosed cap loses cooling area.
  let rthWorst = rthSingle;
  let exposedFaceEq = 5;
  if (inp.coolingMethod !== 'conduction' && count > 1) {
    exposedFaceEq = worstCapExposedFaces(rows, columnsUsed, inp.spacingMm);
    rthWorst = rthSingle * (5 / exposedFaceEq);
  }

  const hotSpotRiseC = lossPerCapW * rthWorst;
  const hotSpotTempC = inp.ambientTempC + hotSpotRiseC;

  const s = inp.spacingMm;
  const envelopeWmm = columnsUsed * inp.boxLengthMm + (columnsUsed - 1) * s;
  const envelopeDmm = rows * inp.boxThicknessMm + (rows - 1) * s;

  return {
    count,
    countForCapacitance,
    countForCurrent,
    totalCapacitanceUf,
    bankEsrMohm,
    bankEslNh,
    bankMassG,
    currentPerCapA,
    lossPerCapW,
    lossTotalW,
    rthSinglaCW: rthSingle,
    rthWorstCW: rthWorst,
    hotSpotRiseC,
    hotSpotTempC,
    exposedFaceEq,
    columnsUsed,
    rows,
    lastRowCount,
    envelopeWmm,
    envelopeDmm,
    envelopeHmm: inp.boxHeightMm,
  };
}

// ── Package optimizer ──────────────────────────────────────────────────────
// Search the catalog for the smallest bank that meets the required capacitance,
// ripple current and a hot-spot-temperature target while fitting inside a
// bounding envelope. For each part the minimum feasible parallel count is found
// (raising the count above the capacitance/current minimum only if needed to
// meet the temperature target by lowering the per-cap current), laid out in the
// most compact grid that fits the envelope, then all parts are ranked by the
// chosen objective.

export type OptimizeObjective = 'volume' | 'area' | 'count' | 'coolest' | 'mass' | 'cost';

// Effective packaged density of a box-type metallized-PP-film DC-link capacitor
// (film + resin fill + plastic box + terminals), used to estimate mass from the
// box envelope volume. ~1.35 g/cm³ is representative and calibrated against
// typical published part weights; disclosed as an estimate.
export const CAP_MASS_DENSITY_G_PER_CM3 = 1.35;

export function capMassG(cap: DcLinkCapacitor): number {
  const boxVolCm3 = (cap.boxLengthMm * cap.boxThicknessMm * cap.boxHeightMm) / 1000;
  return boxVolCm3 * CAP_MASS_DENSITY_G_PER_CM3;
}

export interface OptimizeInput {
  requiredCapacitanceUf: number;
  rippleCurrentRmsA: number;
  peakVoltageV: number;        // V_dc + ripple/2 — the rating must exceed this (hard floor)
  minRatedVoltageV: number;    // extra voltage-margin floor: caps must also be rated >= this (0 = ignore)
  ambientTempC: number;
  coolingMethod: CoolingMethod;
  conductionRthCW: number;
  spacingMm: number;
  maxWidthMm: number;   // along the box length L (columns); 0 = unconstrained
  maxDepthMm: number;   // along the box thickness T (rows); 0 = unconstrained
  maxHeightMm: number;  // box height H; 0 = unconstrained
  maxHotSpotTempC: number;
  objective: OptimizeObjective;
}

export interface OptimizeCandidate {
  cap: DcLinkCapacitor;
  count: number;
  columns: number;
  rows: number;
  envelopeWmm: number;
  envelopeDmm: number;
  envelopeHmm: number;
  volumeCm3: number;
  areaCm2: number;
  massG: number;
  hotSpotTempC: number;
  totalCapacitanceUf: number;
  bankEsrMohm: number;
  bankEslNh: number;
  lossTotalW: number;
  capDensityUfPerCm3: number;
  costUsd: number;             // indicative bank cost = count × per-cap indicative cost (see dcLinkCapacitors)
}

function gridHotSpotC(cap: DcLinkCapacitor, count: number, cols: number, rows: number, inp: OptimizeInput): number {
  const currentPerCap = inp.rippleCurrentRmsA / count;
  const lossPerCap = currentPerCap * currentPerCap * (cap.esrMohm / 1000);
  let rth = inp.coolingMethod === 'conduction' ? inp.conductionRthCW : cap.rthCW * coolingMultiplier(inp.coolingMethod);
  if (inp.coolingMethod !== 'conduction' && count > 1) {
    rth *= 5 / worstCapExposedFaces(rows, cols, inp.spacingMm);
  }
  return inp.ambientTempC + lossPerCap * rth;
}

export function optimizeDcLinkBank(caps: DcLinkCapacitor[], inp: OptimizeInput): OptimizeCandidate[] {
  const s = inp.spacingMm;
  const out: OptimizeCandidate[] = [];

  const voltageFloor = Math.max(inp.peakVoltageV, inp.minRatedVoltageV);
  for (const cap of caps) {
    if (cap.ratedVoltageVdc < voltageFloor) continue;                    // rating must exceed the peak (DC + ripple/2) and any extra margin floor
    if (inp.maxHeightMm > 0 && cap.boxHeightMm > inp.maxHeightMm) continue;

    const colsMax = inp.maxWidthMm > 0 ? Math.floor((inp.maxWidthMm + s) / (cap.boxLengthMm + s)) : 1000;
    const rowsMax = inp.maxDepthMm > 0 ? Math.floor((inp.maxDepthMm + s) / (cap.boxThicknessMm + s)) : 1000;
    if (colsMax < 1 || rowsMax < 1) continue;                            // a single part doesn't fit
    const fitCap = colsMax * rowsMax;

    const nCap = cap.capacitanceUf > 0 ? Math.ceil(inp.requiredCapacitanceUf / cap.capacitanceUf) : 1;
    const nCur = cap.irmsRatedA > 0 ? Math.ceil(inp.rippleCurrentRmsA / cap.irmsRatedA) : 1;
    const nMin = Math.max(1, nCap, nCur);
    if (nMin > fitCap) continue;                                         // can't fit enough parts

    // Raise the count from nMin only as far as needed to meet the temperature
    // target (more parts → lower per-cap current → cooler), bounded by what fits.
    let chosen: OptimizeCandidate | null = null;
    for (let n = nMin; n <= Math.min(fitCap, nMin + 60); n++) {
      let best: { cols: number; rows: number; envW: number; envD: number; hs: number } | null = null;
      for (let cols = 1; cols <= Math.min(colsMax, n); cols++) {
        const rows = Math.ceil(n / cols);
        if (rows > rowsMax) continue;
        const hs = gridHotSpotC(cap, n, cols, rows, inp);
        if (hs > inp.maxHotSpotTempC) continue;
        const envW = cols * cap.boxLengthMm + (cols - 1) * s;
        const envD = rows * cap.boxThicknessMm + (rows - 1) * s;
        // Most compact grid at this count (smallest occupied footprint).
        if (!best || envW * envD < best.envW * best.envD) best = { cols, rows, envW, envD, hs };
      }
      if (best) {
        const volumeCm3 = (best.envW * best.envD * cap.boxHeightMm) / 1000;
        const totalC = n * cap.capacitanceUf;
        chosen = {
          cap, count: n, columns: best.cols, rows: best.rows,
          envelopeWmm: best.envW, envelopeDmm: best.envD, envelopeHmm: cap.boxHeightMm,
          volumeCm3, areaCm2: (best.envW * best.envD) / 100, massG: n * capMassG(cap),
          hotSpotTempC: best.hs, totalCapacitanceUf: totalC,
          bankEsrMohm: cap.esrMohm / n, bankEslNh: cap.eslNh / n,
          lossTotalW: Math.pow(inp.rippleCurrentRmsA / n, 2) * (cap.esrMohm / 1000) * n,
          capDensityUfPerCm3: volumeCm3 > 0 ? totalC / volumeCm3 : 0,
          costUsd: n * indicativeCapCostUsd(cap),
        };
        break; // minimum feasible count for this part
      }
    }
    if (chosen) out.push(chosen);
  }

  const cmp: Record<OptimizeObjective, (a: OptimizeCandidate, b: OptimizeCandidate) => number> = {
    volume: (a, b) => a.volumeCm3 - b.volumeCm3,
    area: (a, b) => a.areaCm2 - b.areaCm2,
    count: (a, b) => a.count - b.count || a.volumeCm3 - b.volumeCm3,
    coolest: (a, b) => a.hotSpotTempC - b.hotSpotTempC || a.volumeCm3 - b.volumeCm3,
    mass: (a, b) => a.massG - b.massG,
    cost: (a, b) => a.costUsd - b.costUsd || a.volumeCm3 - b.volumeCm3,
  };
  out.sort(cmp[inp.objective]);
  return out.slice(0, 6);
}

// ── Switching overshoot ────────────────────────────────────────────────────
// When a switch turns off, the current through it collapses at a rate di/dt.
// The parasitic commutation-loop inductance L_loop (busbar + capacitor ESL +
// module stray) resists that change and produces a voltage spike ΔV = L·di/dt
// on top of the DC bus. The DEVICE sees the full loop spike (V_bus + L_loop·di/dt
// — the main driver of the required device voltage margin); the CAPACITOR sees
// only the part developed across its own ESL (ESL_bank·di/dt), added to the DC
// bus and ripple. Because this repeats every switching cycle it must stay within
// the rated voltage (the 1.5×V_rated surge allowance is for rare events only).

const MU0 = 4 * Math.PI * 1e-7;

/** Parallel-plate laminated-busbar loop inductance (go + return conductors):
 *  L = µ0 · separation · length / width. Returns nH. */
export function busbarLoopInductanceNh(lengthMm: number, widthMm: number, separationMm: number): number {
  if (widthMm <= 0) return 0;
  const L = MU0 * (separationMm / 1000) * (lengthMm / 1000) / (widthMm / 1000);
  return L * 1e9;
}

export interface OvershootInput {
  busVoltageV: number;
  rippleVoltagePkPkV: number;
  loopInductanceNh: number;  // total commutation-loop inductance
  bankEslNh: number;         // capacitor-bank ESL (part of the loop; sets the cap-terminal spike)
  diDtAPerUs: number;        // turn-off current slew rate
}

export interface OvershootResult {
  diDtAPerUs: number;
  overshootDeviceV: number;   // L_loop · di/dt
  devicePeakV: number;        // V_bus + overshoot
  capTerminalSpikeV: number;  // ESL_bank · di/dt
  capPeakTransientV: number;  // V_bus + ½·ripple + cap-terminal spike
}

export function solveSwitchingOvershoot(inp: OvershootInput): OvershootResult {
  const diDt = inp.diDtAPerUs * 1e6; // A/s
  const overshootDeviceV = (inp.loopInductanceNh * 1e-9) * diDt;
  const capSpike = (inp.bankEslNh * 1e-9) * diDt;
  return {
    diDtAPerUs: inp.diDtAPerUs,
    overshootDeviceV,
    devicePeakV: inp.busVoltageV + overshootDeviceV,
    capTerminalSpikeV: capSpike,
    capPeakTransientV: inp.busVoltageV + inp.rippleVoltagePkPkV / 2 + capSpike,
  };
}

/** di/dt from the commutated current and the device current fall time. A/µs. */
export function diDtFromFallTime(switchedCurrentA: number, fallTimeNs: number): number {
  if (fallTimeNs <= 0) return 0;
  return (switchedCurrentA / fallTimeNs) * 1000; // A/ns → A/µs
}
