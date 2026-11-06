// Power-factor physics. For a load drawing real power P (W) and apparent power
// S (VA = Vrms · Irms, harmonics included), the power factor is simply PF = P / S
// and the reactive power is Q = √(S² − P²). Power-factor correction with shunt
// capacitors removes fundamental reactive power Qc = P · (tan φ₁ − tan φ₂) so
// the supply sees a new, higher power factor cos φ₂ at the same real power.
//
// Non-sinusoidal currents: the measured ratio P/S is the TRUE power factor. It
// splits into a displacement factor (the cos φ₁ of the fundamental, which
// capacitors can correct) and a distortion factor 1/√(1 + THDi²) (which they
// cannot), assuming a sinusoidal supply voltage.

export type SupplyPhases = 'single' | 'three';
export type CapacitorConnection = 'delta' | 'star';

export interface PowerTriangle {
  pW: number;
  sVA: number;
  qVar: number;
  pf: number;
  phiDeg: number;
}

export type PowerTriangleResult =
  | { ok: true; triangle: PowerTriangle }
  | { ok: false; error: string };

/** PF = P/S, Q = √(S² − P²), φ = arccos(PF). Rejects P > S (PF would exceed 1). */
export function powerTriangleFromPS(pW: number, sVA: number): PowerTriangleResult {
  if (!isFinite(pW) || !isFinite(sVA)) return { ok: false, error: 'Enter both real and apparent power.' };
  if (sVA <= 0) return { ok: false, error: 'Apparent power must be greater than zero.' };
  if (pW < 0) return { ok: false, error: 'Real power must not be negative (this tool handles a load drawing power).' };
  // Tolerate round-off when P and S are meant to be equal (unity power factor).
  if (pW > sVA * (1 + 1e-9)) {
    return { ok: false, error: 'Real power cannot exceed apparent power (it would give a power factor above 1). Check the values and units.' };
  }
  const p = Math.min(pW, sVA);
  const pf = p / sVA;
  const qVar = Math.sqrt(Math.max(sVA * sVA - p * p, 0));
  return { ok: true, triangle: { pW: p, sVA, qVar, pf, phiDeg: (Math.acos(pf) * 180) / Math.PI } };
}

/** Displacement PF, distortion factor and distortion power from a measured true PF and current THD. */
export interface HarmonicDecomposition {
  distortionFactor: number;      // 1 / √(1 + THDi²)
  displacementPf: number;        // true PF / distortion factor (cos φ₁)
  fundamentalQVar: number;       // P · tan φ₁
  distortionVA: number;          // D = √(S² − P² − Q₁²)
  consistent: boolean;           // false if the implied displacement PF exceeds 1
}

export function decomposeHarmonics(t: PowerTriangle, thdIPercent: number): HarmonicDecomposition {
  const thd = Math.max(thdIPercent, 0) / 100;
  const distortionFactor = 1 / Math.sqrt(1 + thd * thd);
  const dpfRaw = t.pf / distortionFactor;
  const consistent = dpfRaw <= 1 + 1e-9;
  const displacementPf = Math.min(dpfRaw, 1);
  const q1 = t.pW * Math.tan(Math.acos(displacementPf));
  const distortionVA = Math.sqrt(Math.max(t.sVA * t.sVA - t.pW * t.pW - q1 * q1, 0));
  return { distortionFactor, displacementPf, fundamentalQVar: q1, distortionVA, consistent };
}

export interface CorrectionResult {
  qcVar: number;           // capacitive kvar to install (in var)
  newSVA: number;
  newQVar: number;
  newPf: number;           // displacement PF achieved
  currentReductionPct: number;
  capacitanceF: number;    // per capacitor (per phase for 3-phase)
}

/**
 * Capacitor bank to take a load from displacement pfOld to pfNew at constant real power:
 * Qc = P · (tan φ₁ − tan φ₂). Capacitance from Qc = ω·C·V² per capacitor:
 *   single phase               C = Qc / (ω V²)
 *   three phase, delta (V=VLL) C = Qc / (3 ω V²)
 *   three phase, star          C = Qc / (ω V²)    (each cap sees V/√3, three of them)
 */
export function powerFactorCorrection(
  pW: number,
  pfOld: number,
  pfNew: number,
  voltageV: number,
  frequencyHz: number,
  phases: SupplyPhases,
  connection: CapacitorConnection,
): CorrectionResult | null {
  if (!(pW > 0) || !(pfOld > 0) || pfOld >= 1 || !(pfNew > pfOld) || pfNew > 1) return null;
  if (!(voltageV > 0) || !(frequencyHz > 0)) return null;
  const qOld = pW * Math.tan(Math.acos(pfOld));
  const qNew = pW * Math.tan(Math.acos(pfNew));
  const qc = qOld - qNew;
  const omega = 2 * Math.PI * frequencyHz;
  const divisor = phases === 'three' && connection === 'delta' ? 3 : 1;
  return {
    qcVar: qc,
    newSVA: pW / pfNew,
    newQVar: qNew,
    newPf: pfNew,
    currentReductionPct: (1 - pfOld / pfNew) * 100,
    capacitanceF: qc / (divisor * omega * voltageV * voltageV),
  };
}

/** Line current (A) for apparent power S at line voltage V. */
export function lineCurrentA(sVA: number, voltageV: number, phases: SupplyPhases): number {
  return phases === 'three' ? sVA / (Math.sqrt(3) * voltageV) : sVA / voltageV;
}
