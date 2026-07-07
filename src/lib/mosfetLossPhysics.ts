// SiC MOSFET loss engine for a 2-level, 3-phase voltage-source inverter with
// sinusoidal PWM — the standard analytical per-device loss equations used in
// manufacturer application notes, evaluated per switch position and scaled to
// the whole inverter.
//
// Sign convention: cosPhi > 0 = motoring, cosPhi < 0 = generating. With
// synchronous rectification ON (the normal way to run SiC), total conduction
// loss is independent of m and cosφ — each device in a leg conducts exactly
// half the fundamental period through its channel regardless of current
// direction — so motoring and generating produce the same TOTAL losses; the
// classic (sync-rect OFF) split shows the motor/generator difference between
// channel and body-diode conduction explicitly.
import type { SicDevicePreset } from './sicDevices';

/** MOSFET channel conduction with synchronous rectification (channel carries both directions). */
export function conductionLossSyncRectW(rdsOnOhm: number, irmsDeviceA: number): number {
  return rdsOnOhm * (irmsDeviceA * irmsDeviceA) / 2;
}

/** Classic split, channel part: device conducts only when duty-cycle-modulated as a switch. */
export function conductionLossClassicChannelW(rdsOnOhm: number, ipkDeviceA: number, modulationIndex: number, cosPhi: number): number {
  return ipkDeviceA * ipkDeviceA * rdsOnOhm * (1 / 8 + (modulationIndex * cosPhi) / (3 * Math.PI));
}

/** Classic split, body-diode part: diode freewheels the complementary interval. */
export function conductionLossClassicDiodeW(vsdV: number, ipkDeviceA: number, modulationIndex: number, cosPhi: number): number {
  return Math.max(vsdV * ipkDeviceA * (1 / (2 * Math.PI) - (modulationIndex * cosPhi) / 8), 0);
}

/** Body-diode conduction during the two dead-time intervals per switching period. */
export function deadTimeDiodeLossW(vsdV: number, ipkDeviceA: number, deadTimeNs: number, switchingFreqHz: number): number {
  // average |i| over the half-cycle a given device freewheels = (2/π)·Ipk; each of the two
  // leg devices carries half the fundamental period -> factor (2/π)·(1/2) = 1/π
  return vsdV * (ipkDeviceA / Math.PI) * 2 * (deadTimeNs * 1e-9) * switchingFreqHz;
}

/** Hard-switching loss averaged over the fundamental: E scales linearly with current, (V/Vtest)^kv with voltage. */
export function switchingLossW(
  eOnPlusEOffMj: number, switchingFreqHz: number, vdcV: number, ipkDeviceA: number,
  eTestVdcV: number, eTestCurrentA: number, voltageExponent: number
): number {
  if (eTestVdcV <= 0 || eTestCurrentA <= 0) return 0;
  const eJ = eOnPlusEOffMj * 1e-3;
  return switchingFreqHz * eJ * Math.pow(vdcV / eTestVdcV, voltageExponent) * (ipkDeviceA / (Math.PI * eTestCurrentA));
}

/** Reverse-recovery loss dissipated in the hard-turning-on device. Uses Err when published; falls
 *  back to the standard soft-recovery approximation Err ≈ Qrr·Vdc/4 when only Qrr is available. */
export function reverseRecoveryLossW(
  eRrMj: number, qrrUc: number, switchingFreqHz: number, vdcV: number, ipkDeviceA: number,
  eTestVdcV: number, eTestCurrentA: number, voltageExponent: number
): number {
  if (eTestVdcV <= 0 || eTestCurrentA <= 0) return 0;
  const currentScale = ipkDeviceA / (Math.PI * eTestCurrentA);
  if (eRrMj > 0) {
    return switchingFreqHz * (eRrMj * 1e-3) * Math.pow(vdcV / eTestVdcV, voltageExponent) * currentScale;
  }
  // Qrr fallback: E_rr ≈ Qrr·Vdc/4 evaluated directly at the working bus voltage
  return switchingFreqHz * ((qrrUc * 1e-6) * vdcV / 4) * currentScale;
}

/** Gate-drive loss per device — dissipated in the driver and gate resistors, not the die. */
export function gateDriveLossW(qgNc: number, vgsOnV: number, vgsOffV: number, switchingFreqHz: number): number {
  return (qgNc * 1e-9) * (vgsOnV - vgsOffV) * switchingFreqHz;
}

/** Rdson at junction temperature: linear interpolation/extrapolation between the 25°C and hot datasheet points. */
export function rdsOnAtTempOhm(rdsOn25mOhm: number, rdsOnHotmOhm: number, rdsOnHotTempC: number, tjC: number): number {
  const slope = (rdsOnHotmOhm - rdsOn25mOhm) / Math.max(rdsOnHotTempC - 25, 1);
  return (rdsOn25mOhm + slope * (tjC - 25)) * 1e-3;
}

/** Inverter fundamental output power: 3 phases × (m·Vdc/(2√2)) line-neutral RMS × Irms × |cosφ|. */
export function inverterOutputPowerW(vdcV: number, modulationIndex: number, phaseCurrentArms: number, cosPhi: number): number {
  return 3 * (modulationIndex * vdcV / (2 * Math.SQRT2)) * phaseCurrentArms * Math.abs(cosPhi);
}

export interface OperatingPoint {
  vdcV: number;
  phaseCurrentArms: number;
  switchingFreqHz: number;
  modulationIndex: number;
  cosPhi: number; // signed: >0 motoring, <0 generating
  deadTimeNs: number;
  caseTempC: number;
  syncRect: boolean;
  voltageExponent: number;
  parallelCount: number;
}

export interface DeviceLossResult {
  conductionChannelW: number;
  conductionDiodeW: number; // classic split only (0 with sync rect)
  deadTimeDiodeW: number;
  switchingW: number;
  reverseRecoveryW: number;
  gateDriveW: number; // informational — NOT included in the die dissipation / Tj solve
  totalDeviceDieW: number; // conduction + dead-time diode + switching + reverse recovery
  junctionTempC: number;
  rdsOnUsedmOhm: number;
  converged: boolean;
  inverterTotalW: number; // 6 × parallelCount × totalDeviceDieW
  outputPowerW: number;
  efficiencyPercent: number;
}

/** Full per-device solve with fixed-point junction-temperature iteration:
 *  Tj = Tcase + P_die·RthJC, Rdson(Tj) interpolated from the two datasheet points.
 *  Switching energies are held temperature-independent (disclosed — datasheet Eon/Eoff
 *  vary only weakly with Tvj for SiC, e.g. CAB450M12XM3: 25.4→24.4 mJ across 25→175 °C). */
export function solveDeviceLosses(device: SicDevicePreset, op: OperatingPoint): DeviceLossResult {
  const n = Math.max(1, Math.round(op.parallelCount));
  const irmsDev = op.phaseCurrentArms / n;
  const ipkDev = Math.SQRT2 * irmsDev;

  const gateDriveW = gateDriveLossW(device.qgNc, device.vgsOnV, device.vgsOffV, op.switchingFreqHz);
  const switchingW = switchingLossW(
    device.eOnMj + device.eOffMj, op.switchingFreqHz, op.vdcV, ipkDev,
    device.eTestVdcV, device.eTestCurrentA, op.voltageExponent
  );
  const reverseRecoveryW = reverseRecoveryLossW(
    device.eRrMj, device.qrrUc, op.switchingFreqHz, op.vdcV, ipkDev,
    device.eTestVdcV, device.eTestCurrentA, op.voltageExponent
  );
  const deadTimeDiodeW = op.syncRect
    ? deadTimeDiodeLossW(device.vsdV, ipkDev, op.deadTimeNs, op.switchingFreqHz)
    : 0;

  let tj = op.caseTempC + 10;
  let conductionChannelW = 0;
  let conductionDiodeW = 0;
  let rdsOnOhm = rdsOnAtTempOhm(device.rdsOn25mOhm, device.rdsOnHotmOhm, device.rdsOnHotTempC, tj);
  let converged = false;

  for (let i = 0; i < 30; i++) {
    rdsOnOhm = rdsOnAtTempOhm(device.rdsOn25mOhm, device.rdsOnHotmOhm, device.rdsOnHotTempC, tj);
    if (op.syncRect) {
      conductionChannelW = conductionLossSyncRectW(rdsOnOhm, irmsDev);
      conductionDiodeW = 0;
    } else {
      conductionChannelW = conductionLossClassicChannelW(rdsOnOhm, ipkDev, op.modulationIndex, op.cosPhi);
      conductionDiodeW = conductionLossClassicDiodeW(device.vsdV, ipkDev, op.modulationIndex, op.cosPhi);
    }
    const dieW = conductionChannelW + conductionDiodeW + deadTimeDiodeW + switchingW + reverseRecoveryW;
    const tjNext = op.caseTempC + dieW * device.rthJcKPerW;
    if (Math.abs(tjNext - tj) < 0.01) {
      tj = tjNext;
      converged = true;
      break;
    }
    tj = tjNext;
  }

  const totalDeviceDieW = conductionChannelW + conductionDiodeW + deadTimeDiodeW + switchingW + reverseRecoveryW;
  const inverterTotalW = 6 * n * totalDeviceDieW;
  const outputPowerW = inverterOutputPowerW(op.vdcV, op.modulationIndex, op.phaseCurrentArms, op.cosPhi);
  const efficiencyPercent = outputPowerW + inverterTotalW > 0
    ? (outputPowerW / (outputPowerW + inverterTotalW)) * 100
    : 0;

  return {
    conductionChannelW, conductionDiodeW, deadTimeDiodeW, switchingW, reverseRecoveryW, gateDriveW,
    totalDeviceDieW, junctionTempC: tj, rdsOnUsedmOhm: rdsOnOhm * 1e3, converged,
    inverterTotalW, outputPowerW, efficiencyPercent,
  };
}

export interface DutyStep {
  phaseCurrentArms: number;
  modulationIndex: number;
  mode: 'motor' | 'generator';
  durationS: number;
}

export interface DutyCycleResult {
  perStep: DeviceLossResult[];
  timeWeightedInverterLossW: number;
  timeWeightedEfficiencyPercent: number;
  totalEnergyLossKj: number;
  totalDurationS: number;
  worstStepIndex: number; // by junction temperature
}

/** Runs each duty step as its own quasi-steady operating point (each step is assumed long
 *  relative to the device thermal time constant — disclosed simplification; module-level
 *  thermal time constants are typically well under a second). */
export function solveDutyCycle(device: SicDevicePreset, base: OperatingPoint, steps: DutyStep[]): DutyCycleResult {
  const perStep = steps.map((s) => solveDeviceLosses(device, {
    ...base,
    phaseCurrentArms: s.phaseCurrentArms,
    modulationIndex: s.modulationIndex,
    cosPhi: s.mode === 'generator' ? -Math.abs(base.cosPhi) : Math.abs(base.cosPhi),
  }));
  const totalDurationS = steps.reduce((a, s) => a + s.durationS, 0);
  const timeWeightedInverterLossW = totalDurationS > 0
    ? steps.reduce((a, s, i) => a + perStep[i].inverterTotalW * s.durationS, 0) / totalDurationS
    : 0;
  const totalOutputEnergy = steps.reduce((a, s, i) => a + perStep[i].outputPowerW * s.durationS, 0);
  const totalLossEnergy = steps.reduce((a, s, i) => a + perStep[i].inverterTotalW * s.durationS, 0);
  const timeWeightedEfficiencyPercent = totalOutputEnergy + totalLossEnergy > 0
    ? (totalOutputEnergy / (totalOutputEnergy + totalLossEnergy)) * 100
    : 0;
  let worstStepIndex = 0;
  perStep.forEach((r, i) => { if (r.junctionTempC > perStep[worstStepIndex].junctionTempC) worstStepIndex = i; });
  return { perStep, timeWeightedInverterLossW, timeWeightedEfficiencyPercent, totalEnergyLossKj: totalLossEnergy / 1000, totalDurationS, worstStepIndex };
}
