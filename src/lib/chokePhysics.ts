// Choke (inductor) sizing physics: reluctance-model inductance, differential-mode
// ripple sizing, common-mode impedance sizing, saturation, core loss, and winding fit.
export const MU0 = 4 * Math.PI * 1e-7; // H/m

export interface SteinmetzCoefficients {
  lossCoeffK: number;
  lossExpFreq: number;
  lossExpFlux: number;
}

/** L = mu0 * mur * Ae * N^2 / le (reluctance model, single-path core) */
export function inductanceH(effectiveAreaMm2: number, pathLengthMm: number, relativePermeability: number, turns: number): number {
  const aeM2 = effectiveAreaMm2 * 1e-6;
  const leM = pathLengthMm * 1e-3;
  if (leM <= 0) return 0;
  return (MU0 * relativePermeability * aeM2 * turns * turns) / leM;
}

/** N required to hit a target inductance on a given core (exact inverse of inductanceH). */
export function turnsRequired(targetInductanceH: number, effectiveAreaMm2: number, pathLengthMm: number, relativePermeability: number): number {
  const aeM2 = effectiveAreaMm2 * 1e-6;
  const leM = pathLengthMm * 1e-3;
  if (aeM2 <= 0 || relativePermeability <= 0) return 0;
  return Math.sqrt((targetInductanceH * leM) / (MU0 * relativePermeability * aeM2));
}

/** Peak flux density B = L*I/(N*Ae) for a given peak current through N turns. */
export function peakFluxDensityT(inductanceH: number, turns: number, peakCurrentA: number, effectiveAreaMm2: number): number {
  const aeM2 = effectiveAreaMm2 * 1e-6;
  if (turns <= 0 || aeM2 <= 0) return 0;
  return (inductanceH * peakCurrentA) / (turns * aeM2);
}

/** DM ripple sizing: L required to hold peak-peak ripple to a target, given the inverter-leg volt-second balance. */
export function requiredInductanceForRippleH(vDcV: number, dutyCycle: number, targetRippleA: number, switchingFreqHz: number): number {
  if (targetRippleA <= 0 || switchingFreqHz <= 0) return 0;
  return (vDcV * dutyCycle * (1 - dutyCycle)) / (targetRippleA * switchingFreqHz);
}

/** Achieved DM ripple current for a given inductance (inverse of requiredInductanceForRippleH). */
export function differentialRippleCurrentA(vDcV: number, dutyCycle: number, inductanceH: number, switchingFreqHz: number): number {
  if (inductanceH <= 0 || switchingFreqHz <= 0) return 0;
  return (vDcV * dutyCycle * (1 - dutyCycle)) / (inductanceH * switchingFreqHz);
}

/** CM sizing: L required to hit a target impedance at a reference frequency. */
export function requiredInductanceForImpedanceH(targetImpedanceOhm: number, referenceFreqHz: number): number {
  if (referenceFreqHz <= 0) return 0;
  return targetImpedanceOhm / (2 * Math.PI * referenceFreqHz);
}

/** Achieved impedance |Z| = 2*pi*f*L at a given frequency (inverse of requiredInductanceForImpedanceH). */
export function achievedImpedanceOhm(inductanceH: number, freqHz: number): number {
  return 2 * Math.PI * freqHz * inductanceH;
}

/** Steinmetz-style core loss density: Pv[mW/cm3] = k * f[kHz]^a * B[T]^b, returned in W/m3. */
export function coreLossDensityWPerM3(freqKHz: number, fluxDensityPeakT: number, material: SteinmetzCoefficients): number {
  if (freqKHz <= 0 || fluxDensityPeakT <= 0) return 0;
  const mwPerCm3 = material.lossCoeffK * Math.pow(freqKHz, material.lossExpFreq) * Math.pow(fluxDensityPeakT, material.lossExpFlux);
  return mwPerCm3 * 1000; // 1 mW/cm3 = 1000 W/m3
}

export function totalCoreLossW(lossDensityWPerM3: number, volumeMm3: number): number {
  return lossDensityWPerM3 * (volumeMm3 * 1e-9);
}

/** Fundamental electrical frequency from motor speed and pole-pair count — contextual display only. */
export function fundamentalElectricalFreqHz(motorSpeedRpm: number, polePairs: number): number {
  return (motorSpeedRpm / 60) * polePairs;
}

export function windingCopperAreaMm2(turns: number, conductorCrossSectionMm2: number): number {
  return turns * conductorCrossSectionMm2;
}

/** Fraction of the window area occupied by the winding conductor(s) — typical acceptable fill factor <= ~0.3-0.4 for a wound choke. */
export function windowFillFactor(copperAreaMm2: number, windowAreaMm2: number): number {
  if (windowAreaMm2 <= 0) return 0;
  return copperAreaMm2 / windowAreaMm2;
}
