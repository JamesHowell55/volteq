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
