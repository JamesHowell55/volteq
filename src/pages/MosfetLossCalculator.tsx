import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_TEMP, UNIT_AREA, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import LossBreakdownBars, { type LossBar } from '../components/LossBreakdownBars';
import { renderLossBreakdownSvg, type PdfLossBar } from '../lib/pdfDiagrams';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { SIC_DEVICE_PRESETS, getSicDevice, inverterStructureLabel, type SicDevicePreset } from '../lib/sicDevices';
import { TIM_PRESETS, COOLANT_PRESETS } from '../lib/materials';
import { timResistanceKPerW } from '../lib/heatsinkThermalPhysics';
import { fundamentalElectricalFreqHz } from '../lib/chokePhysics';
import ControllerProfilePicker from '../components/ControllerProfilePicker';
import type { ControllerProfileParams } from '../lib/controllerProfiles';
import { usePowertrainPrefill } from '../lib/usePowertrainPrefill';
import {
  solveDeviceLosses, solveDutyCycle,
  type OperatingPoint, type DutyStep, type DeviceLossResult,
} from '../lib/mosfetLossPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type AnalysisMode = 'single' | 'duty';
type DriveMode = 'motor' | 'generator';

const MANUFACTURER_ORDER = ['Wolfspeed', 'Infineon', 'ST', 'Hitachi Energy', 'Custom'];

export default function MosfetLossCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  // Device selection + editable parameter copy (auto-fill-then-editable preset pattern)
  const [deviceId, setDeviceId] = useState('imbg120r008m2h');
  const [device, setDevice] = useState<SicDevicePreset>({ ...getSicDevice('imbg120r008m2h') });
  const handleDeviceChange = (id: string) => {
    setDeviceId(id);
    setDevice({ ...getSicDevice(id) });
  };
  const setDeviceField = (field: keyof SicDevicePreset, value: number) => {
    setDevice((d) => ({ ...d, [field]: value }));
  };
  const [parallelCount, setParallelCount] = useState(1);

  // Operating point
  const [vdc, setVdc] = useState(800);
  const [switchingFreqKhz, setSwitchingFreqKhz] = useState(10);
  const [modulationIndex, setModulationIndex] = useState(1.0);
  const [cosPhiMag, setCosPhiMag] = useState(0.9);

  const applyControllerProfile = (p: ControllerProfileParams) => {
    setVdc(p.maxDcVoltageV);
    if (p.switchingFrequencyKhz != null) setSwitchingFreqKhz(p.switchingFrequencyKhz);
  };
  usePowertrainPrefill({ onController: applyControllerProfile });
  const [deadTimeNs, setDeadTimeNs] = useState(500);
  const [caseTempC, setCaseTempC] = useState(65);

  // Cooling mount (Premium: TIM + baseplate stack) — direct cooling (default/free) assumes the
  // device's own RthJC/RthJHS already spans junction to coolant, so caseTempC is the coolant temp
  // directly; TIM + baseplate adds a solder/sinter/pad conduction layer between the case/baseplate
  // and the heatsink, and caseTempC becomes the heatsink-side reference temperature.
  const [coolingMount, setCoolingMount] = useState<'direct' | 'tim'>('direct');
  const [timPresetId, setTimPresetId] = useState('solder');
  const [timThicknessMm, setTimThicknessMm] = useState(TIM_PRESETS.find((p) => p.id === 'solder')!.thicknessMm);
  const [timConductivity, setTimConductivity] = useState(TIM_PRESETS.find((p) => p.id === 'solder')!.thermalConductivity);
  const [timContactAreaMm2, setTimContactAreaMm2] = useState(400);
  const onTimPresetChange = (id: string) => {
    setTimPresetId(id);
    const preset = TIM_PRESETS.find((p) => p.id === id);
    if (preset) {
      setTimThicknessMm(preset.thicknessMm);
      setTimConductivity(preset.thermalConductivity);
    }
  };
  const timRthKPerW = useMemo(
    () => (coolingMount === 'tim'
      ? timResistanceKPerW({ id: timPresetId, label: '', thicknessMm: timThicknessMm, thermalConductivity: timConductivity }, timContactAreaMm2)
      : 0),
    [coolingMount, timPresetId, timThicknessMm, timConductivity, timContactAreaMm2]
  );

  // Heatsink temperature source (Premium: derive from coolant flow instead of typing a known
  // heatsink temperature). "Known value" (free/default) uses caseTempC directly, as before.
  // "Coolant flow" works back from a coolant inlet temperature + total loop flow rate: the bulk
  // fluid rise (caloric term, mean-fluid convention: ΔT = Q_total/(2·ṁ·cp), same idiom as the Cold
  // Plate calculator) scales with ALL 6·parallelCount switch positions sharing one loop, while the
  // user-entered Rsc (heatsink-to-local-fluid convective resistance) is per-device/local — so it
  // folds cleanly into the existing extraRthKPerW additive term, reusing the same Tj iteration.
  const [tempSource, setTempSource] = useState<'known' | 'coolant'>('known');
  const [coolantId, setCoolantId] = useState('glycol50');
  const [coolantInletTempC, setCoolantInletTempC] = useState(45);
  const [coolantFlowLpm, setCoolantFlowLpm] = useState(8);
  const [coolantRscKPerW, setCoolantRscKPerW] = useState(0.05);
  const coolant = COOLANT_PRESETS.find((c) => c.id === coolantId) ?? COOLANT_PRESETS[0];
  const bulkPositions = 6 * Math.max(1, Math.round(parallelCount));
  const coolantMdotKgPerS = (coolantFlowLpm / 1000 / 60) * coolant.densityKgPerM3;
  const coolantRCaloricKPerW = coolantMdotKgPerS > 0 && coolant.specificHeatJPerKgK > 0
    ? 1 / (2 * coolantMdotKgPerS * coolant.specificHeatJPerKgK)
    : 0;
  const coolantExtraRthKPerW = coolantRscKPerW + bulkPositions * coolantRCaloricKPerW;

  const extraRthKPerW = useMemo(
    () => timRthKPerW + (tempSource === 'coolant' ? coolantExtraRthKPerW : 0),
    [timRthKPerW, tempSource, coolantExtraRthKPerW]
  );
  const effectiveCaseTempC = tempSource === 'coolant' ? coolantInletTempC : caseTempC;

  const [syncRect, setSyncRect] = useState(true);
  const [voltageExponent, setVoltageExponent] = useState(1.0);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(6000);
  const f1Hz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);

  const { isPremium, loading: entitlementLoading } = useEntitlement();

  // Analysis mode
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('single');
  const [phaseCurrentArms, setPhaseCurrentArms] = useState(300);
  const [driveMode, setDriveMode] = useState<DriveMode>('motor');
  const [dutySteps, setDutySteps] = useState<DutyStep[]>([
    { phaseCurrentArms: 150, modulationIndex: 0.5, mode: 'motor', durationS: 60 },
    { phaseCurrentArms: 400, modulationIndex: 1.0, mode: 'motor', durationS: 10 },
    { phaseCurrentArms: 200, modulationIndex: 0.8, mode: 'generator', durationS: 20 },
  ]);
  const updateStep = (i: number, patch: Partial<DutyStep>) => {
    setDutySteps((steps) => steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };

  const getInputs = useCallback((): Record<string, unknown> => ({
    deviceId, device, parallelCount, vdc, switchingFreqKhz, modulationIndex,
    cosPhiMag, deadTimeNs, caseTempC, coolingMount, timPresetId, timThicknessMm, timConductivity, timContactAreaMm2,
    tempSource, coolantId, coolantInletTempC, coolantFlowLpm, coolantRscKPerW,
    syncRect, voltageExponent,
    motorPolePairs, motorSpeedRpm, analysisMode, phaseCurrentArms, driveMode, dutySteps,
  }), [deviceId, device, parallelCount, vdc, switchingFreqKhz, modulationIndex,
    cosPhiMag, deadTimeNs, caseTempC, coolingMount, timPresetId, timThicknessMm, timConductivity, timContactAreaMm2,
    tempSource, coolantId, coolantInletTempC, coolantFlowLpm, coolantRscKPerW,
    syncRect, voltageExponent,
    motorPolePairs, motorSpeedRpm, analysisMode, phaseCurrentArms, driveMode, dutySteps]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.deviceId != null) setDeviceId(v.deviceId);
    if (v.device != null) setDevice(v.device as SicDevicePreset);
    if (v.parallelCount != null) setParallelCount(v.parallelCount);
    if (v.vdc != null) setVdc(v.vdc);
    if (v.switchingFreqKhz != null) setSwitchingFreqKhz(v.switchingFreqKhz);
    if (v.modulationIndex != null) setModulationIndex(v.modulationIndex);
    if (v.cosPhiMag != null) setCosPhiMag(v.cosPhiMag);
    if (v.deadTimeNs != null) setDeadTimeNs(v.deadTimeNs);
    if (v.caseTempC != null) setCaseTempC(v.caseTempC);
    if (v.coolingMount != null) setCoolingMount(v.coolingMount);
    if (v.timPresetId != null) setTimPresetId(v.timPresetId);
    if (v.timThicknessMm != null) setTimThicknessMm(v.timThicknessMm);
    if (v.timConductivity != null) setTimConductivity(v.timConductivity);
    if (v.timContactAreaMm2 != null) setTimContactAreaMm2(v.timContactAreaMm2);
    if (v.tempSource != null) setTempSource(v.tempSource);
    if (v.coolantId != null) setCoolantId(v.coolantId);
    if (v.coolantInletTempC != null) setCoolantInletTempC(v.coolantInletTempC);
    if (v.coolantFlowLpm != null) setCoolantFlowLpm(v.coolantFlowLpm);
    if (v.coolantRscKPerW != null) setCoolantRscKPerW(v.coolantRscKPerW);
    if (v.syncRect != null) setSyncRect(v.syncRect);
    if (v.voltageExponent != null) setVoltageExponent(v.voltageExponent);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
    if (v.motorSpeedRpm != null) setMotorSpeedRpm(v.motorSpeedRpm);
    if (v.analysisMode != null) setAnalysisMode(v.analysisMode);
    if (v.phaseCurrentArms != null) setPhaseCurrentArms(v.phaseCurrentArms);
    if (v.driveMode != null) setDriveMode(v.driveMode);
    if (v.dutySteps != null) setDutySteps(v.dutySteps);
  }, []);

  const saved = useSavedCalculations('mosfet-loss');
  const shareLink = useShareableLink(restoreInputs);

  // Safety net: bail out of Duty cycle profile mode if entitlement lapses
  // mid-session, or a `?share=` link / old save carries a premium user's mode
  // (mirrors the same guard on BusbarCalculator's Load profile mode).
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setAnalysisMode((prev) => (prev === 'duty' ? 'single' : prev));
  }, [isPremium, entitlementLoading]);

  // Safety net: bail out of the TIM + baseplate cooling mount if entitlement lapses
  // mid-session, or a `?share=` link / old save carries a premium user's mount (same
  // guard pattern as the duty-cycle mode above).
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setCoolingMount((prev) => (prev === 'tim' ? 'direct' : prev));
  }, [isPremium, entitlementLoading]);

  // Safety net: bail out of the coolant-flow heatsink-temperature source if entitlement
  // lapses mid-session, or a `?share=` link / old save carries a premium user's source.
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setTempSource((prev) => (prev === 'coolant' ? 'known' : prev));
  }, [isPremium, entitlementLoading]);

  // Reset current to something sensible when switching to a small discrete device
  useEffect(() => {
    const maxSensible = device.currentRatingA * parallelCount / Math.SQRT2;
    if (phaseCurrentArms > maxSensible * 1.5) {
      setPhaseCurrentArms(Math.round(maxSensible));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const baseOp: OperatingPoint = useMemo(() => ({
    vdcV: vdc,
    phaseCurrentArms,
    switchingFreqHz: switchingFreqKhz * 1000,
    modulationIndex,
    cosPhi: driveMode === 'generator' ? -Math.abs(cosPhiMag) : Math.abs(cosPhiMag),
    deadTimeNs,
    caseTempC: effectiveCaseTempC,
    syncRect,
    voltageExponent,
    parallelCount,
    extraRthKPerW,
  }), [vdc, phaseCurrentArms, switchingFreqKhz, modulationIndex, driveMode, cosPhiMag, deadTimeNs, effectiveCaseTempC, syncRect, voltageExponent, parallelCount, extraRthKPerW]);

  // Display-only breakdown of the temperature stack: coolant inlet -> local (bulk) coolant temp
  // -> heatsink -> case/baseplate -> junction. Each stage collapses to caseTempC/effectiveCaseTempC
  // directly when its feature isn't in use, so these are safe to call regardless of mode.
  const displayLocalCoolantTempC = (r: DeviceLossResult) => (
    tempSource === 'coolant' ? coolantInletTempC + r.totalDeviceDieW * bulkPositions * coolantRCaloricKPerW : caseTempC
  );
  const displayHeatsinkTempC = (r: DeviceLossResult) => (
    tempSource === 'coolant' ? displayLocalCoolantTempC(r) + r.totalDeviceDieW * coolantRscKPerW : caseTempC
  );
  const displayCaseTempC = (r: DeviceLossResult) => (
    coolingMount === 'tim' ? displayHeatsinkTempC(r) + r.totalDeviceDieW * timRthKPerW : displayHeatsinkTempC(r)
  );

  const single: DeviceLossResult = useMemo(() => solveDeviceLosses(device, baseOp), [device, baseOp]);
  const duty = useMemo(() => solveDutyCycle(device, baseOp, dutySteps), [device, baseOp, dutySteps]);

  const isDuty = analysisMode === 'duty';
  const headline: DeviceLossResult = isDuty ? duty.perStep[duty.worstStepIndex] ?? single : single;
  const worstTj = headline.junctionTempC;
  const tjPass = worstTj <= device.tvjMaxC;
  const thermalRunaway = !headline.converged;
  const devicePeakCurrentA = Math.SQRT2 * (isDuty ? Math.max(...dutySteps.map((s) => s.phaseCurrentArms), 0) : phaseCurrentArms) / Math.max(parallelCount, 1);
  const currentPass = devicePeakCurrentA <= device.currentRatingA * Math.SQRT2; // peak vs DC rating with crest allowance
  const overallPass = tjPass && currentPass && !thermalRunaway;

  const lossBars: LossBar[] = useMemo(() => {
    const toBar = (r: DeviceLossResult, label: string): LossBar => ({
      label,
      conductionChannelW: r.conductionChannelW,
      conductionDiodeW: r.conductionDiodeW,
      deadTimeDiodeW: r.deadTimeDiodeW,
      switchingW: r.switchingW,
      reverseRecoveryW: r.reverseRecoveryW,
    });
    return isDuty
      ? duty.perStep.map((r, i) => toBar(r, `Step ${i + 1} (${dutySteps[i].mode === 'generator' ? 'gen' : 'mot'} ${fmt(dutySteps[i].phaseCurrentArms, 0)} A)`))
      : [toBar(single, driveMode === 'generator' ? 'Generating' : 'Motoring')];
  }, [isDuty, duty, dutySteps, single, driveMode]);

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const n = Math.max(1, Math.round(parallelCount));
    const irmsDev = (isDuty ? dutySteps[duty.worstStepIndex]?.phaseCurrentArms ?? phaseCurrentArms : phaseCurrentArms) / n;
    const ipkDev = Math.SQRT2 * irmsDev;
    const r = headline;
    const steps: CalcStepData[] = [
      {
        title: 'Per-device current share',
        formula: 'Irms_dev = Irms_phase / n,  Ipk_dev = √2 · Irms_dev',
        substitution: `n = ${n} parallel per position`,
        result: `Irms_dev = ${fmt(irmsDev, 1)} A, Ipk_dev = ${fmt(ipkDev, 1)} A${isDuty ? ' (worst duty step)' : ''}`,
      },
      syncRect
        ? {
          title: 'Conduction loss (synchronous rectification)',
          formula: 'P_cond = RDS(on)(Tj) · Irms_dev² / 2 — channel conducts both directions; each leg device conducts half the period, so m and cosφ drop out',
          substitution: `RDS(on) at Tj = ${fmt(r.junctionTempC, 1)}°C → ${fmt(r.rdsOnUsedmOhm, 2)} mΩ (interpolated ${device.rdsOn25mOhm} mΩ @25°C → ${device.rdsOnHotmOhm} mΩ @${device.rdsOnHotTempC}°C)`,
          result: `P_cond = ${fmt(r.conductionChannelW, 2)} W per device`,
        }
        : {
          title: 'Conduction loss (classic split, sync rect off)',
          formula: 'P_ch = Ipk²·RDS(on)·(1/8 + m·cosφ/3π);  P_diode = VSD·Ipk·(1/2π − m·cosφ/8) — motoring (cosφ>0) loads the channel, generating (cosφ<0) loads the body diode',
          substitution: `m = ${fmt(modulationIndex, 2)}, cosφ = ${fmt(baseOp.cosPhi, 2)}, VSD = ${fmt(device.vsdV, 1)} V`,
          result: `P_ch = ${fmt(r.conductionChannelW, 2)} W, P_diode = ${fmt(r.conductionDiodeW, 2)} W per device`,
        },
    ];
    if (syncRect) {
      steps.push({
        title: 'Dead-time body-diode conduction',
        formula: 'P_dt = VSD · (Ipk_dev/π) · 2·td·fsw — two dead-time intervals per switching period carry the load current through the body diode',
        substitution: `VSD = ${fmt(device.vsdV, 1)} V, td = ${fmt(deadTimeNs, 0)} ns, fsw = ${fmt(switchingFreqKhz, 1)} kHz`,
        result: `P_dt = ${fmt(r.deadTimeDiodeW, 2)} W per device`,
      });
    }
    steps.push({
      title: 'Switching loss (Eon + Eoff)',
      formula: 'P_sw = fsw · (Eon+Eoff) · (Vdc/Vtest)^kv · Ipk_dev/(π·Itest) — linear in current; energies held temperature-independent (SiC Eon/Eoff vary only weakly with Tvj)',
      substitution: `Eon+Eoff = ${fmt(device.eOnMj + device.eOffMj, 2)} mJ @ ${device.eTestVdcV} V/${device.eTestCurrentA} A, Vdc = ${fmt(vdc, 0)} V, kv = ${fmt(voltageExponent, 2)}`,
      result: `P_sw = ${fmt(r.switchingW, 2)} W per device`,
    });
    steps.push({
      title: 'Reverse recovery loss',
      formula: device.eRrMj > 0
        ? 'P_rr = fsw · Err · (Vdc/Vtest)^kv · Ipk_dev/(π·Itest) — datasheet Err, dissipated in the hard-turning-on device'
        : 'P_rr = fsw · (Qrr·Vdc/4) · Ipk_dev/(π·Itest) — Err not published, standard soft-recovery approximation from Qrr',
      substitution: device.eRrMj > 0 ? `Err = ${fmt(device.eRrMj, 2)} mJ @ ${device.eTestVdcV} V/${device.eTestCurrentA} A` : `Qrr = ${fmt(device.qrrUc, 2)} µC`,
      result: `P_rr = ${fmt(r.reverseRecoveryW, 2)} W per device`,
    });
    steps.push({
      title: 'Gate drive loss (informational — dissipated in the driver/gate resistors, not the die)',
      formula: 'P_gate = QG · ΔVGS · fsw',
      substitution: `QG = ${fmt(device.qgNc, 0)} nC, ΔVGS = ${fmt(device.vgsOnV - device.vgsOffV, 0)} V`,
      result: `P_gate = ${fmt(r.gateDriveW, 3)} W per device`,
    });
    if (tempSource === 'coolant') {
      steps.push({
        title: 'Coolant-side thermal resistance',
        formula: 'RthCaloric = 1/(2·ṁ·cp) (bulk fluid rise, mean of inlet/outlet, scaled by all 6·n switch positions sharing the loop) + Rsc (per-device convective resistance to the local fluid)',
        substitution: `${coolant.label}: ṁ = ${fmt(coolantMdotKgPerS, 4)} kg/s (${fmt(coolantFlowLpm, 1)} Lpm), cp = ${fmt(coolant.specificHeatJPerKgK, 0)} J/kg·K, 6n = ${bulkPositions}; Rsc = ${fmt(coolantRscKPerW, 4)} K/W`,
        result: `RthCaloric·6n = ${fmt(bulkPositions * coolantRCaloricKPerW, 4)} K/W, local coolant temp ≈ ${fmt(displayLocalCoolantTempC(r), 1)}°C, heatsink temp ≈ ${fmt(displayHeatsinkTempC(r), 1)}°C`,
      });
    }
    steps.push(coolingMount === 'tim'
      ? {
        title: 'Case-to-heatsink TIM resistance',
        formula: 'RthTIM = t / (k · A) — solder/sinter/pad conduction layer between the device case/baseplate and the heatsink',
        substitution: `${TIM_PRESETS.find((p) => p.id === timPresetId)?.label ?? 'Custom'}: t = ${fmt(timThicknessMm, 3)} mm, k = ${fmt(timConductivity, 1)} W/m·K, A = ${fmt(timContactAreaMm2, 0)} mm²`,
        result: `RthTIM = ${fmt(timRthKPerW, 4)} K/W, case temp ≈ ${fmt(displayCaseTempC(r), 1)}°C`,
      }
      : {
        title: 'Cooling mount',
        formula: 'Direct cooling — RthJC already spans case to coolant (baseplate-less module, or a tab pressed straight to a cold plate)',
        substitution: `RthJC = ${fmt(device.rthJcKPerW, 3)} K/W`,
        result: 'No added TIM resistance',
      });
    steps.push({
      title: 'Junction temperature (fixed-point iteration)',
      formula: `Tj = T_ref + P_die · (RthJC${extraRthKPerW > 0 ? ' + RthExtra' : ''}), RDS(on)(Tj) re-evaluated each pass until converged`,
      substitution: `T_ref = ${fmt(effectiveCaseTempC, 0)}°C (${tempSource === 'coolant' ? 'coolant inlet' : 'known case/heatsink temp'}), RthJC = ${fmt(device.rthJcKPerW, 3)} K/W${extraRthKPerW > 0 ? `, RthExtra = ${fmt(extraRthKPerW, 4)} K/W (TIM + coolant stack combined)` : ''}, P_die = ${fmt(r.totalDeviceDieW, 2)} W`,
      result: `Tj = ${fmt(r.junctionTempC, 1)}°C vs Tvj(max) ${fmt(device.tvjMaxC, 0)}°C — ${tjPass ? 'pass' : 'FAIL'}${r.converged ? '' : ' (iteration did not converge — thermally unstable operating point)'}`,
    });
    steps.push({
      title: 'Inverter totals and efficiency',
      formula: 'P_inverter = 6·n·P_die;  P_out = 3·(m·Vdc/2√2)·Irms·|cosφ|;  η = P_out/(P_out + P_inverter)',
      substitution: `6 × ${n} devices, ${isDuty ? 'worst duty step shown' : `Irms = ${fmt(phaseCurrentArms, 0)} A`}`,
      result: `P_inverter = ${fmt(r.inverterTotalW, 1)} W, P_out = ${fmt(r.outputPowerW / 1000, 1)} kW, η = ${fmt(r.efficiencyPercent, 3)}%`,
    });
    if (isDuty) {
      steps.push({
        title: 'Duty-cycle weighting',
        formula: 'P_avg = Σ(P_step·t_step)/Σt_step;  E_loss = Σ(P_step·t_step) — each step solved quasi-steady (assumes steps long vs the device thermal time constant)',
        substitution: `${dutySteps.length} steps, total ${fmt(duty.totalDurationS, 0)} s`,
        result: `P_avg = ${fmt(duty.timeWeightedInverterLossW, 1)} W, E_loss = ${fmt(duty.totalEnergyLossKj, 2)} kJ per cycle, weighted η = ${fmt(duty.timeWeightedEfficiencyPercent, 3)}%`,
      });
    }
    return steps;
  }, [parallelCount, isDuty, dutySteps, duty, phaseCurrentArms, headline, syncRect, device, modulationIndex, baseOp.cosPhi, deadTimeNs, switchingFreqKhz, vdc, voltageExponent, caseTempC, tjPass, coolingMount, timPresetId, timThicknessMm, timConductivity, timContactAreaMm2, timRthKPerW, extraRthKPerW, tempSource, coolant, coolantFlowLpm, coolantRscKPerW, coolantMdotKgPerS, coolantRCaloricKPerW, bulkPositions, effectiveCaseTempC]);

  const inputSections: ReportSection[] = useMemo(() => {
    const deviceRows: ReportRow[] = [
      { label: 'Device', value: `${device.manufacturer} ${device.partNumber}` },
      { label: 'Package / topology', value: `${device.packageLabel}${device.topsideCooled ? ' (top-side cooled)' : ''}` },
      { label: 'Structure', value: inverterStructureLabel(device.topology, parallelCount) },
      { label: 'RDS(on)', value: `${fmt(device.rdsOn25mOhm, 2)} mΩ @25°C / ${fmt(device.rdsOnHotmOhm, 2)} mΩ @${fmtU(device.rdsOnHotTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Eon / Eoff', value: `${fmt(device.eOnMj, 2)} / ${fmt(device.eOffMj, 2)} mJ @ ${device.eTestVdcV} V, ${device.eTestCurrentA} A` },
      { label: 'Err / Qrr', value: `${device.eRrMj > 0 ? `${fmt(device.eRrMj, 2)} mJ` : '—'} / ${fmt(device.qrrUc, 2)} µC` },
      { label: 'VSD / RthJC / Tvj(max)', value: `${fmt(device.vsdV, 1)} V / ${fmt(device.rthJcKPerW, 3)} K/W / ${fmtU(device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Parameter provenance', value: device.sourced ? 'Datasheet-transcribed values' : 'Representative estimates (headline specs verified) — refine from the device datasheet' },
    ];
    const opRows: ReportRow[] = [
      { label: 'DC bus voltage', value: `${fmt(vdc, 0)} V` },
      { label: 'Switching frequency', value: `${fmt(switchingFreqKhz, 1)} kHz` },
      { label: 'Modulation index / |cosφ|', value: `${fmt(modulationIndex, 2)} / ${fmt(cosPhiMag, 2)}` },
      { label: 'Dead time', value: `${fmt(deadTimeNs, 0)} ns` },
      ...(tempSource === 'coolant' ? [
        { label: 'Coolant inlet temperature', value: `${fmtU(coolantInletTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
        { label: 'Coolant flow', value: `${coolant.label}, ${fmt(coolantFlowLpm, 1)} Lpm, Rsc = ${fmt(coolantRscKPerW, 4)} K/W` },
      ] : [
        { label: coolingMount === 'tim' ? 'Heatsink temperature' : 'Case/heatsink temperature', value: `${fmtU(caseTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      ]),
      ...(coolingMount === 'tim' ? [
        { label: 'Cooling mount', value: `TIM + baseplate — ${TIM_PRESETS.find((p) => p.id === timPresetId)?.label ?? 'Custom'}, t=${fmt(timThicknessMm, 3)} mm, A=${fmt(timContactAreaMm2, 0)} mm² (RthTIM = ${fmt(timRthKPerW, 4)} K/W)` },
      ] : [{ label: 'Cooling mount', value: 'Direct cooling (RthJC spans case to coolant)' }]),
      { label: 'Synchronous rectification', value: syncRect ? 'On' : 'Off (classic channel/diode split)' },
      { label: 'Voltage scaling exponent kv', value: fmt(voltageExponent, 2) },
      { label: 'Motor speed / pole pairs', value: `${fmt(motorSpeedRpm, 0)} rpm / ${motorPolePairs} (f1 = ${fmt(f1Hz, 1)} Hz)` },
    ];
    const loadRows: ReportRow[] = isDuty
      ? dutySteps.map((s, i) => ({
        label: `Step ${i + 1}`,
        value: `${fmt(s.phaseCurrentArms, 0)} A rms, m=${fmt(s.modulationIndex, 2)}, ${s.mode}, ${fmt(s.durationS, 0)} s`,
      }))
      : [
        { label: 'Phase current', value: `${fmt(phaseCurrentArms, 0)} A rms` },
        { label: 'Mode', value: driveMode === 'generator' ? 'Generating' : 'Motoring' },
      ];
    return [
      { heading: 'Device & topology', rows: deviceRows },
      { heading: 'Operating point', rows: opRows },
      { heading: isDuty ? 'Duty cycle profile' : 'Load condition', rows: loadRows },
    ];
  }, [device, parallelCount, vdc, switchingFreqKhz, modulationIndex, cosPhiMag, deadTimeNs, caseTempC, coolingMount, timPresetId, timThicknessMm, timContactAreaMm2, timRthKPerW, tempSource, coolant, coolantInletTempC, coolantFlowLpm, coolantRscKPerW, syncRect, voltageExponent, motorSpeedRpm, motorPolePairs, f1Hz, isDuty, dutySteps, phaseCurrentArms, driveMode, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => {
    const r = headline;
    const breakdownRows: ReportRow[] = [
      { label: 'Conduction (channel)', value: `${fmt(r.conductionChannelW, 2)} W` },
      ...(r.conductionDiodeW > 0 ? [{ label: 'Conduction (body diode)', value: `${fmt(r.conductionDiodeW, 2)} W` }] : []),
      ...(r.deadTimeDiodeW > 0 ? [{ label: 'Dead-time diode', value: `${fmt(r.deadTimeDiodeW, 2)} W` }] : []),
      { label: 'Switching (Eon+Eoff)', value: `${fmt(r.switchingW, 2)} W` },
      { label: 'Reverse recovery', value: `${fmt(r.reverseRecoveryW, 2)} W` },
      { label: 'Gate drive (in driver, not die)', value: `${fmt(r.gateDriveW, 3)} W` },
      { label: 'Total per device (die)', value: `${fmt(r.totalDeviceDieW, 2)} W` },
    ];
    const totalsRows: ReportRow[] = [
      { label: 'Whole-inverter loss', value: `${fmt(r.inverterTotalW, 1)} W` },
      { label: 'Junction temperature', value: `${fmtU(r.junctionTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} (limit ${fmtU(device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)})` },
      ...(tempSource === 'coolant' ? [{ label: 'Local coolant / heatsink temperature (implied)', value: `${fmtU(displayLocalCoolantTempC(r), unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} / ${fmtU(displayHeatsinkTempC(r), unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` }] : []),
      ...(coolingMount === 'tim' ? [{ label: 'Case/baseplate temperature (implied)', value: `${fmtU(displayCaseTempC(r), unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` }] : []),
      { label: 'Output power', value: `${fmt(r.outputPowerW / 1000, 1)} kW` },
      { label: 'Efficiency', value: `${fmt(r.efficiencyPercent, 3)}%` },
      ...(isDuty ? [
        { label: 'Duty-weighted average loss', value: `${fmt(duty.timeWeightedInverterLossW, 1)} W` },
        { label: 'Energy loss per duty cycle', value: `${fmt(duty.totalEnergyLossKj, 2)} kJ` },
        { label: 'Duty-weighted efficiency', value: `${fmt(duty.timeWeightedEfficiencyPercent, 3)}%` },
      ] : []),
    ];
    return [
      { heading: isDuty ? 'Per-device losses (worst duty step)' : 'Per-device losses', rows: breakdownRows },
      { heading: 'Inverter totals', rows: totalsRows },
    ];
  }, [headline, device.tvjMaxC, isDuty, duty, unitSystem, coolingMount, caseTempC, extraRthKPerW, tempSource, coolantInletTempC, coolantRscKPerW, bulkPositions, coolantRCaloricKPerW, timRthKPerW]);

  const handleExportPdf = () => {
    const pdfBars: PdfLossBar[] = lossBars.map((b) => ({ ...b }));
    exportReportToPdf({
      tabName: 'MOSFET_Loss_Calculator',
      pageTitle: 'MOSFET Loss Calculator (1200 V SiC Inverter)',
      accentHex,
      passStatus: { pass: overallPass, label: overallPass ? 'Junction temperature and device current within limits' : 'Junction temperature or device current exceeds limits — review' },
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [
        { title: 'Loss breakdown (per device)', svgMarkup: renderLossBreakdownSvg(pdfBars, accentHex) },
      ],
      disclaimer: 'Engineering estimation tool using the standard analytical loss equations for a 2-level, 3-phase, sinusoidal-PWM voltage-source inverter. Switching energies scale linearly with current and with (Vdc/Vtest)^kv in voltage from the datasheet test point; energies are held temperature-independent (SiC Eon/Eoff vary only weakly with Tvj). Reverse recovery uses datasheet Err where published, else the Qrr·Vdc/4 soft-recovery approximation. Duty-cycle steps are solved quasi-steady (assumes each step is long relative to the device thermal time constant). Devices flagged as representative estimates carry verified headline specifications but estimated loss parameters — transcribe the real datasheet values (field-mapping guide in sicDevices.ts) before trusting absolute numbers. Not a substitute for double-pulse characterisation or calorimetric inverter testing.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● MOSFET Loss Calculator</div>
          <h1>MOSFET Loss Calculator (1200 V SiC Inverter)</h1>
          <p>
            Conduction, switching, reverse-recovery, dead-time, and gate losses for an EV traction inverter —
            1200 V SiC devices from Wolfspeed, Infineon, ST, and Hitachi Energy across discrete, top-side-cooled,
            half-bridge, and six-pack packages, with parallel devices, motoring/generating operation, and duty-cycle profiles.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Device &amp; topology</span></div>
            <div className="field">
              <label>Device</label>
              <select value={deviceId} onChange={(e) => handleDeviceChange(e.target.value)}>
                {MANUFACTURER_ORDER.map((mfr) => (
                  <optgroup key={mfr} label={mfr}>
                    {SIC_DEVICE_PRESETS.filter((d) => d.manufacturer === mfr).map((d) => (
                      <option key={d.id} value={d.id}>{d.partNumber} — {d.packageLabel}, {d.rdsOn25mOhm} mΩ</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="hint">
                {device.sourced
                  ? 'Parameters transcribed from the manufacturer datasheet — still editable below.'
                  : '⚠ Headline specs verified; loss parameters are representative estimates — edit against the real datasheet below.'}
              </span>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Parallel devices per position</label>
                <input autoComplete="off" type="number" min={1} step={1} value={parallelCount} onChange={(e) => setParallelCount(Math.max(1, Number(e.target.value)))} />
                <span className="hint">{inverterStructureLabel(device.topology, parallelCount)}</span>
              </div>
              <div className="field">
                <label>Device current rating (A)</label>
                <input autoComplete="off" type="number" min={0} value={device.currentRatingA} onChange={(e) => setDeviceField('currentRatingA', Number(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>RDS(on) @25°C (mΩ)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={device.rdsOn25mOhm} onChange={(e) => setDeviceField('rdsOn25mOhm', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>RDS(on) hot (mΩ)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={device.rdsOnHotmOhm} onChange={(e) => setDeviceField('rdsOnHotmOhm', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Hot temp ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(device.rdsOnHotTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setDeviceField('rdsOnHotTempC', fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Eon (mJ)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={device.eOnMj} onChange={(e) => setDeviceField('eOnMj', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Eoff (mJ)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={device.eOffMj} onChange={(e) => setDeviceField('eOffMj', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>
                  E test point
                  <InfoTooltip>The VDD and ID at which the datasheet measured Eon/Eoff (and Err). The engine scales energies linearly in current and by (Vdc/Vtest)^kv in voltage from this point.</InfoTooltip>
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input autoComplete="off" type="number" min={0} value={device.eTestVdcV} onChange={(e) => setDeviceField('eTestVdcV', Number(e.target.value))} placeholder="V" />
                  <input autoComplete="off" type="number" min={0} value={device.eTestCurrentA} onChange={(e) => setDeviceField('eTestCurrentA', Number(e.target.value))} placeholder="A" />
                </div>
              </div>
              <div className="field">
                <label>
                  Err (mJ)
                  <InfoTooltip>Body-diode reverse recovery energy at the same test class. Set 0 if the datasheet only gives Qrr — the engine then uses Err ≈ Qrr·Vdc/4.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={device.eRrMj} onChange={(e) => setDeviceField('eRrMj', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Qrr (µC)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={device.qrrUc} onChange={(e) => setDeviceField('qrrUc', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>VSD body diode (V)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={device.vsdV} onChange={(e) => setDeviceField('vsdV', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>RthJC (K/W)</label>
                <input autoComplete="off" type="number" min={0} step={0.001} value={device.rthJcKPerW} onChange={(e) => setDeviceField('rthJcKPerW', Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Tvj max ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(device.tvjMaxC, unitSystem, UNIT_TEMP)} onChange={(e) => setDeviceField('tvjMaxC', fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>QG total (nC)</label>
                <input autoComplete="off" type="number" min={0} value={device.qgNc} onChange={(e) => setDeviceField('qgNc', Number(e.target.value))} />
              </div>
            </div>
            <span className="hint" style={{ marginTop: '0.5rem', display: 'block' }}>{device.notes}</span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Operating point</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>DC bus voltage (V)</label>
                <input autoComplete="off" type="number" min={0} value={vdc} onChange={(e) => setVdc(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Switching frequency (kHz)</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={switchingFreqKhz} onChange={(e) => setSwitchingFreqKhz(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>
                  Modulation index (m)
                  <InfoTooltip>0-1 for pure sinusoidal PWM; up to ~1.15 with space-vector or third-harmonic-injection modulation.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} max={1.15} step={0.01} value={modulationIndex} onChange={(e) => setModulationIndex(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Power factor |cosφ|</label>
                <input autoComplete="off" type="number" min={0} max={1} step={0.01} value={cosPhiMag} onChange={(e) => setCosPhiMag(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Dead time (ns)</label>
                <input autoComplete="off" type="number" min={0} step={50} value={deadTimeNs} onChange={(e) => setDeadTimeNs(Number(e.target.value))} />
              </div>
              {tempSource === 'known' && (
                <div className="field">
                  <label>{coolingMount === 'tim' ? `Heatsink temperature (${unitLabel(unitSystem, UNIT_TEMP)})` : `Case/heatsink temperature (${unitLabel(unitSystem, UNIT_TEMP)})`}</label>
                  <input autoComplete="off" type="number" value={toDisplay(caseTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCaseTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Heatsink temperature source
                  <InfoTooltip>Known value: type the case/heatsink temperature directly. Coolant flow: derive it instead from a coolant inlet temperature, total loop flow rate, and a heatsink-to-fluid convective resistance Rsc — the bulk fluid rise scales with all 6·n switch positions sharing the loop (mean-fluid convention, same as the Cold Plate calculator), while Rsc is the local per-device spot resistance.</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={tempSource === 'known' ? 'active' : ''} onClick={() => setTempSource('known')}>Known value</button>
                  <PremiumGate feature="Coolant-flow heatsink temperature">
                    <button className={tempSource === 'coolant' ? 'active' : ''} onClick={() => setTempSource('coolant')}>Coolant flow</button>
                  </PremiumGate>
                </div>
              </div>
              {tempSource === 'coolant' && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="grid grid-3">
                    <div className="field">
                      <label>Coolant</label>
                      <select value={coolantId} onChange={(e) => setCoolantId(e.target.value)}>
                        {COOLANT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Coolant inlet temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                      <input autoComplete="off" type="number" value={toDisplay(coolantInletTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCoolantInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                    </div>
                    <div className="field">
                      <label>Total loop flow rate (Lpm)</label>
                      <input autoComplete="off" type="number" min={0} step={0.5} value={coolantFlowLpm} onChange={(e) => setCoolantFlowLpm(Number(e.target.value))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>
                        Heatsink-to-coolant Rsc (K/W)
                        <InfoTooltip>Per-device convective resistance from the heatsink surface to the local coolant — e.g. from a cold-plate vendor's Rth-vs-flow-rate curve, or read off this app's Cold Plate calculator for your channel design.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step={0.001} value={coolantRscKPerW} onChange={(e) => setCoolantRscKPerW(Number(e.target.value))} />
                    </div>
                  </div>
                  <span className="hint">
                    ṁ = {fmt(coolantMdotKgPerS, 4)} kg/s, RthCaloric×6n = {fmt(bulkPositions * coolantRCaloricKPerW, 4)} K/W — local coolant temp ≈ {fmtU(displayLocalCoolantTempC(headline), unitSystem, UNIT_TEMP, 1)}{unitLabel(unitSystem, UNIT_TEMP)}, heatsink temp ≈ {fmtU(displayHeatsinkTempC(headline), unitSystem, UNIT_TEMP, 1)}{unitLabel(unitSystem, UNIT_TEMP)}
                  </span>
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Cooling mount
                  <InfoTooltip>Direct cooling: the device's RthJC already spans case to coolant (baseplate-less modules, or a discrete tab pressed straight to a cold plate). TIM + baseplate: models an added solder or sintered-silver interface between the device case/baseplate and the heatsink, on top of RthJC.</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={coolingMount === 'direct' ? 'active' : ''} onClick={() => setCoolingMount('direct')}>Direct cooling</button>
                  <PremiumGate feature="TIM + baseplate cooling stack">
                    <button className={coolingMount === 'tim' ? 'active' : ''} onClick={() => setCoolingMount('tim')}>TIM + baseplate</button>
                  </PremiumGate>
                </div>
              </div>
              {coolingMount === 'tim' && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="grid grid-3">
                    <div className="field">
                      <label>TIM material</label>
                      <select value={timPresetId} onChange={(e) => onTimPresetChange(e.target.value)}>
                        {TIM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>TIM thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                      <input autoComplete="off" type="number" min={0.001} step={0.01} value={toDisplay(timThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setTimThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                    </div>
                    <div className="field">
                      <label>TIM conductivity (W/m·K)</label>
                      <input autoComplete="off" type="number" min={0.01} step={0.1} value={timConductivity} onChange={(e) => setTimConductivity(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Baseplate contact area ({unitLabel(unitSystem, UNIT_AREA)})</label>
                      <input autoComplete="off" type="number" min={0} step={10} value={toDisplay(timContactAreaMm2, unitSystem, UNIT_AREA)} onChange={(e) => setTimContactAreaMm2(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA))} />
                    </div>
                  </div>
                  <span className="hint">RthTIM (computed) = {fmt(timRthKPerW, 4)} K/W — implied case/baseplate temperature ≈ {fmtU(displayCaseTempC(headline), unitSystem, UNIT_TEMP, 1)}{unitLabel(unitSystem, UNIT_TEMP)}</span>
                </div>
              )}
              <div className="field">
                <label>Motor pole pairs</label>
                <input autoComplete="off" type="number" min={1} step={1} value={motorPolePairs} onChange={(e) => setMotorPolePairs(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Motor/generator speed (rpm)</label>
                <input autoComplete="off" type="number" min={0} value={motorSpeedRpm} onChange={(e) => setMotorSpeedRpm(Number(e.target.value))} />
                <span className="hint">f1 = {fmt(f1Hz, 1)} Hz — context; the analytical loss averages hold for any f1 ≪ fsw</span>
              </div>
              <div className="field">
                <label>
                  Synchronous rectification
                  <InfoTooltip>SiC MOSFET channels conduct in reverse when gated on, so complementary (synchronous) gating is the normal way to run an inverter leg. With it ON, total losses are symmetric between motoring and generating; turn it OFF to see the classic channel/body-diode conduction split, where the motor/generator difference is explicit.</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={syncRect ? 'active' : ''} onClick={() => setSyncRect(true)}>On</button>
                  <button className={!syncRect ? 'active' : ''} onClick={() => setSyncRect(false)}>Off</button>
                </div>
              </div>
              <div className="field">
                <label>
                  Voltage scaling exponent (kv)
                  <InfoTooltip>Eon/Eoff scale as (Vdc/Vtest)^kv from the datasheet test voltage. Datasheet energy-vs-voltage curves are typically slightly superlinear (~1.2-1.4); 1.0 (linear) is the conservative default when Vdc is below the test voltage.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0.5} max={2} step={0.05} value={voltageExponent} onChange={(e) => setVoltageExponent(Number(e.target.value))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <ControllerProfilePicker onApply={applyControllerProfile} hint="Sets DC bus voltage from a saved controller profile's max DC voltage, and switching frequency if set." />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Load / simulation</span></div>
            <div className="segmented">
              <button className={analysisMode === 'single' ? 'active' : ''} onClick={() => setAnalysisMode('single')}>Single point</button>
              <PremiumGate feature="Duty cycle profile">
                <button className={analysisMode === 'duty' ? 'active' : ''} onClick={() => setAnalysisMode('duty')}>Duty cycle profile</button>
              </PremiumGate>
            </div>

            {analysisMode === 'single' ? (
              <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Phase current (A rms)</label>
                  <input autoComplete="off" type="number" min={0} value={phaseCurrentArms} onChange={(e) => setPhaseCurrentArms(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Mode</label>
                  <div className="segmented">
                    <button className={driveMode === 'motor' ? 'active' : ''} onClick={() => setDriveMode('motor')}>Motoring</button>
                    <button className={driveMode === 'generator' ? 'active' : ''} onClick={() => setDriveMode('generator')}>Generating</button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem' }}>
                {dutySteps.map((s, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.82rem' }}>Step {i + 1}</strong>
                      <button className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setDutySteps((steps) => steps.filter((_, j) => j !== i))} disabled={dutySteps.length <= 1}>Remove</button>
                    </div>
                    <div className="grid grid-3">
                      <div className="field">
                        <label>Current (A rms)</label>
                        <input autoComplete="off" type="number" min={0} value={s.phaseCurrentArms} onChange={(e) => updateStep(i, { phaseCurrentArms: Number(e.target.value) })} />
                      </div>
                      <div className="field">
                        <label>Mod. index</label>
                        <input autoComplete="off" type="number" min={0} max={1.15} step={0.01} value={s.modulationIndex} onChange={(e) => updateStep(i, { modulationIndex: Number(e.target.value) })} />
                      </div>
                      <div className="field">
                        <label>Duration (s)</label>
                        <input autoComplete="off" type="number" min={0} value={s.durationS} onChange={(e) => updateStep(i, { durationS: Number(e.target.value) })} />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <div className="segmented">
                          <button className={s.mode === 'motor' ? 'active' : ''} onClick={() => updateStep(i, { mode: 'motor' })}>Motoring</button>
                          <button className={s.mode === 'generator' ? 'active' : ''} onClick={() => updateStep(i, { mode: 'generator' })}>Generating</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {dutySteps.length < 10 && (
                  <button className="btn" onClick={() => setDutySteps((steps) => [...steps, { phaseCurrentArms: 200, modulationIndex: 0.8, mode: 'motor', durationS: 30 }])}>
                    + Add step
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results{isDuty ? ' (worst duty step)' : ''}</div>

            <div className={`status-banner ${overallPass ? 'pass' : 'fail'}`}>
              {overallPass
                ? `✓ Tj ${fmtU(worstTj, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} within Tvj(max) ${fmtU(device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}`
                : thermalRunaway
                  ? `✗ Thermal runaway — operating point exceeds device capability; Rds(on)/Tj model is invalid beyond Tvj(max) ${fmtU(device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)} (last iterated estimate ${fmtU(worstTj, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)} is not a real value)`
                  : `✗ ${!tjPass ? `Tj ${fmtU(worstTj, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} exceeds Tvj(max) ${fmtU(device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` : `Device peak current ${fmt(devicePeakCurrentA, 0)} A exceeds rating`}`}
            </div>

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Per-device die loss</div>
                <div className="value">{thermalRunaway ? 'N/A' : fmt(headline.totalDeviceDieW, 1)}{!thermalRunaway && <span className="unit">W</span>}</div>
                <div className="hint">{thermalRunaway ? 'not meaningful — see thermal runaway warning' : `RDS(on) used: ${fmt(headline.rdsOnUsedmOhm, 2)} mΩ`}</div>
              </div>
              <div className="result-tile">
                <div className="label">Whole-inverter loss</div>
                <div className="value">{thermalRunaway ? 'N/A' : fmt(headline.inverterTotalW, 0)}{!thermalRunaway && <span className="unit">W</span>}</div>
                <div className="hint">{inverterStructureLabel(device.topology, parallelCount)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Junction temperature</div>
                <div className={`value ${tjPass ? 'pos' : 'neg'}`}>
                  {thermalRunaway ? `>${fmtU(2 * device.tvjMaxC, unitSystem, UNIT_TEMP, 0)}` : fmtU(worstTj, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span>
                </div>
                <div className="hint">
                  {thermalRunaway
                    ? 'thermal runaway — model invalid beyond this point'
                    : tempSource === 'coolant'
                      ? `coolant in ${fmtU(coolantInletTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, heatsink ≈ ${fmtU(displayHeatsinkTempC(headline), unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}${coolingMount === 'tim' ? `, case ≈ ${fmtU(displayCaseTempC(headline), unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` : ''}, RthJC+extra ${fmt(device.rthJcKPerW + extraRthKPerW, 3)} K/W`
                      : coolingMount === 'tim'
                        ? `heatsink ${fmtU(caseTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, case ≈ ${fmtU(displayCaseTempC(headline), unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, RthJC+TIM ${fmt(device.rthJcKPerW + extraRthKPerW, 3)} K/W`
                        : `case ${fmtU(caseTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, RthJC ${fmt(device.rthJcKPerW, 3)} K/W`}
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Output power</div>
                <div className="value">{fmt(headline.outputPowerW / 1000, 1)}<span className="unit">kW</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Efficiency</div>
                <div className="value">{fmt(headline.efficiencyPercent, 3)}<span className="unit">%</span></div>
              </div>
              {isDuty && (
                <div className="result-tile">
                  <div className="label">Duty-weighted loss</div>
                  <div className="value">{fmt(duty.timeWeightedInverterLossW, 0)}<span className="unit">W</span></div>
                  <div className="hint">{fmt(duty.totalEnergyLossKj, 2)} kJ per {fmt(duty.totalDurationS, 0)} s cycle · η {fmt(duty.timeWeightedEfficiencyPercent, 2)}%</div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Loss breakdown</div>
            <PremiumGate feature="Loss breakdown chart">
              <LossBreakdownBars bars={lossBars} />
            </PremiumGate>
          </div>

          {isDuty && (
            <div className="card">
              <div className="card-title">Duty cycle steps</div>
              <table className="data-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr><th>Step</th><th>Load</th><th>Loss (W)</th><th>Tj ({unitLabel(unitSystem, UNIT_TEMP)})</th><th>η (%)</th></tr>
                </thead>
                <tbody>
                  {duty.perStep.map((r, i) => {
                    const stepRunaway = !r.converged;
                    return (
                      <tr key={i} style={i === duty.worstStepIndex ? { color: 'var(--warn)' } : undefined}>
                        <td>{i + 1}{i === duty.worstStepIndex ? ' ★' : ''}</td>
                        <td>{fmt(dutySteps[i].phaseCurrentArms, 0)} A, m={fmt(dutySteps[i].modulationIndex, 2)}, {dutySteps[i].mode === 'generator' ? 'gen' : 'mot'}</td>
                        <td>{stepRunaway ? 'N/A' : fmt(r.inverterTotalW, 0)}</td>
                        <td className={stepRunaway ? 'fail' : undefined}>{stepRunaway ? `>${fmtU(2 * device.tvjMaxC, unitSystem, UNIT_TEMP, 0)} ⚠` : fmtU(r.junctionTempC, unitSystem, UNIT_TEMP, 1)}</td>
                        <td>{stepRunaway ? 'N/A' : fmt(r.efficiencyPercent, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <span className="hint">★ = worst step by junction temperature. Each step is solved quasi-steady (assumes steps long vs the device thermal time constant). ⚠ = thermal runaway — operating point exceeds the device's rated capability, Rds(on)/Tj model invalid beyond Tvj(max).</span>
            </div>
          )}

        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/mosfet-loss" />
        <p className="note">
          Standard analytical loss equations for a 2-level, 3-phase, sinusoidal-PWM voltage-source inverter.
          With synchronous rectification on (the normal way to run SiC), each leg device conducts half the
          fundamental period through its channel, so total losses are symmetric between motoring and
          generating — the motor/generator distinction appears explicitly in the classic channel/body-diode
          split when sync rect is off, and in the duty-cycle profile either way. Switching energies scale
          linearly with current and by (Vdc/Vtest)^kv with voltage from the datasheet test point, and are
          held temperature-independent (SiC Eon/Eoff vary only weakly with Tvj — e.g. CAB450M12XM3 shows
          25.4→24.4 mJ across 25→175°C). Reverse recovery uses datasheet Err where published, else the
          standard Qrr·Vdc/4 soft-recovery approximation. Gate-drive loss is dissipated in the driver and
          gate resistors, not the die, and is excluded from the junction-temperature solve. Devices flagged
          with ⚠ carry verified headline specifications (part number, package, RDS(on), rating) but
          representative loss parameters — transcribe the real datasheet values (the field-mapping guide
          lives at the top of sicDevices.ts) before trusting absolute numbers. Screening tool — not a
          substitute for double-pulse characterisation or calorimetric inverter testing.
        </p>
        <p className="note">
          <b>Validated:</b> every loss equation (sync-rect and classic channel/diode conduction — the standard
          Casanellas PWM-loss form — dead-time diode conduction, test-condition-normalized switching and
          reverse-recovery loss, gate-drive loss, Rds(on) temperature interpolation, and inverter output power)
          was independently re-derived from its documented formula and matched the calculator's output exactly
          across a full set of hand-picked test cases.
        </p>
      </div>

      {/* CALCULATION STEPS */}
      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Calculation steps</div>
        {calculationSteps.map((s, i) => (
          <div className="calc-step" key={i}>
            <div className="step-title">{i + 1}. {s.title}</div>
            <div className="step-formula">{s.formula}</div>
            {s.substitution && <div className="step-sub">{s.substitution}</div>}
            <div className="step-result">{s.result}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
