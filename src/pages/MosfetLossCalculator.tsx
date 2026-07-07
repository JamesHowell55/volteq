import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import InfoTooltip from '../components/InfoTooltip';
import LossBreakdownBars, { type LossBar } from '../components/LossBreakdownBars';
import { renderLossBreakdownSvg, type PdfLossBar } from '../lib/pdfDiagrams';
import { SIC_DEVICE_PRESETS, getSicDevice, inverterStructureLabel, type SicDevicePreset } from '../lib/sicDevices';
import { fundamentalElectricalFreqHz } from '../lib/chokePhysics';
import {
  solveDeviceLosses, solveDutyCycle,
  type OperatingPoint, type DutyStep, type DeviceLossResult,
} from '../lib/mosfetLossPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

type AnalysisMode = 'single' | 'duty';
type DriveMode = 'motor' | 'generator';

const MANUFACTURER_ORDER = ['Wolfspeed', 'Infineon', 'ST', 'Hitachi Energy', 'Custom'];

export default function MosfetLossCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

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
  const [deadTimeNs, setDeadTimeNs] = useState(500);
  const [caseTempC, setCaseTempC] = useState(65);
  const [syncRect, setSyncRect] = useState(true);
  const [voltageExponent, setVoltageExponent] = useState(1.0);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(6000);
  const f1Hz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);

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
    caseTempC,
    syncRect,
    voltageExponent,
    parallelCount,
  }), [vdc, phaseCurrentArms, switchingFreqKhz, modulationIndex, driveMode, cosPhiMag, deadTimeNs, caseTempC, syncRect, voltageExponent, parallelCount]);

  const single: DeviceLossResult = useMemo(() => solveDeviceLosses(device, baseOp), [device, baseOp]);
  const duty = useMemo(() => solveDutyCycle(device, baseOp, dutySteps), [device, baseOp, dutySteps]);

  const isDuty = analysisMode === 'duty';
  const headline: DeviceLossResult = isDuty ? duty.perStep[duty.worstStepIndex] ?? single : single;
  const worstTj = headline.junctionTempC;
  const tjPass = worstTj <= device.tvjMaxC;
  const devicePeakCurrentA = Math.SQRT2 * (isDuty ? Math.max(...dutySteps.map((s) => s.phaseCurrentArms), 0) : phaseCurrentArms) / Math.max(parallelCount, 1);
  const currentPass = devicePeakCurrentA <= device.currentRatingA * Math.SQRT2; // peak vs DC rating with crest allowance
  const overallPass = tjPass && currentPass;

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
    steps.push({
      title: 'Junction temperature (fixed-point iteration)',
      formula: 'Tj = T_case + P_die · RthJC, RDS(on)(Tj) re-evaluated each pass until converged',
      substitution: `T_case = ${fmt(caseTempC, 0)}°C, RthJC = ${fmt(device.rthJcKPerW, 3)} K/W, P_die = ${fmt(r.totalDeviceDieW, 2)} W`,
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
  }, [parallelCount, isDuty, dutySteps, duty, phaseCurrentArms, headline, syncRect, device, modulationIndex, baseOp.cosPhi, deadTimeNs, switchingFreqKhz, vdc, voltageExponent, caseTempC, tjPass]);

  const inputSections: ReportSection[] = useMemo(() => {
    const deviceRows: ReportRow[] = [
      { label: 'Device', value: `${device.manufacturer} ${device.partNumber}` },
      { label: 'Package / topology', value: `${device.packageLabel}${device.topsideCooled ? ' (top-side cooled)' : ''}` },
      { label: 'Structure', value: inverterStructureLabel(device.topology, parallelCount) },
      { label: 'RDS(on)', value: `${fmt(device.rdsOn25mOhm, 2)} mΩ @25°C / ${fmt(device.rdsOnHotmOhm, 2)} mΩ @${device.rdsOnHotTempC}°C` },
      { label: 'Eon / Eoff', value: `${fmt(device.eOnMj, 2)} / ${fmt(device.eOffMj, 2)} mJ @ ${device.eTestVdcV} V, ${device.eTestCurrentA} A` },
      { label: 'Err / Qrr', value: `${device.eRrMj > 0 ? `${fmt(device.eRrMj, 2)} mJ` : '—'} / ${fmt(device.qrrUc, 2)} µC` },
      { label: 'VSD / RthJC / Tvj(max)', value: `${fmt(device.vsdV, 1)} V / ${fmt(device.rthJcKPerW, 3)} K/W / ${fmt(device.tvjMaxC, 0)}°C` },
      { label: 'Parameter provenance', value: device.sourced ? 'Datasheet-transcribed values' : 'Representative estimates (headline specs verified) — refine from the device datasheet' },
    ];
    const opRows: ReportRow[] = [
      { label: 'DC bus voltage', value: `${fmt(vdc, 0)} V` },
      { label: 'Switching frequency', value: `${fmt(switchingFreqKhz, 1)} kHz` },
      { label: 'Modulation index / |cosφ|', value: `${fmt(modulationIndex, 2)} / ${fmt(cosPhiMag, 2)}` },
      { label: 'Dead time', value: `${fmt(deadTimeNs, 0)} ns` },
      { label: 'Case/heatsink temperature', value: `${fmt(caseTempC, 0)}°C` },
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
  }, [device, parallelCount, vdc, switchingFreqKhz, modulationIndex, cosPhiMag, deadTimeNs, caseTempC, syncRect, voltageExponent, motorSpeedRpm, motorPolePairs, f1Hz, isDuty, dutySteps, phaseCurrentArms, driveMode]);

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
      { label: 'Junction temperature', value: `${fmt(r.junctionTempC, 1)}°C (limit ${fmt(device.tvjMaxC, 0)}°C)` },
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
  }, [headline, device.tvjMaxC, isDuty, duty]);

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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● MOSFET Loss Calculator</div>
          <h1>MOSFET Loss Calculator (1200 V SiC Inverter)</h1>
          <p>
            Conduction, switching, reverse-recovery, dead-time, and gate losses for an EV traction inverter —
            1200 V SiC devices from Wolfspeed, Infineon, ST, and Hitachi Energy across discrete, top-side-cooled,
            half-bridge, and six-pack packages, with parallel devices, motoring/generating operation, and duty-cycle profiles.
          </p>
        </div>
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

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
                <label>Hot temp (°C)</label>
                <input autoComplete="off" type="number" min={26} value={device.rdsOnHotTempC} onChange={(e) => setDeviceField('rdsOnHotTempC', Number(e.target.value))} />
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
                <label>Tvj max (°C)</label>
                <input autoComplete="off" type="number" min={0} value={device.tvjMaxC} onChange={(e) => setDeviceField('tvjMaxC', Number(e.target.value))} />
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
              <div className="field">
                <label>Case/heatsink temperature (°C)</label>
                <input autoComplete="off" type="number" value={caseTempC} onChange={(e) => setCaseTempC(Number(e.target.value))} />
              </div>
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
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Load / simulation</span></div>
            <div className="segmented">
              <button className={analysisMode === 'single' ? 'active' : ''} onClick={() => setAnalysisMode('single')}>Single point</button>
              <button className={analysisMode === 'duty' ? 'active' : ''} onClick={() => setAnalysisMode('duty')}>Duty cycle profile</button>
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
                ? `✓ Tj ${fmt(worstTj, 1)}°C within Tvj(max) ${fmt(device.tvjMaxC, 0)}°C`
                : `✗ ${!tjPass ? `Tj ${fmt(worstTj, 1)}°C exceeds Tvj(max) ${fmt(device.tvjMaxC, 0)}°C` : `Device peak current ${fmt(devicePeakCurrentA, 0)} A exceeds rating`}`}
            </div>

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Per-device die loss</div>
                <div className="value">{fmt(headline.totalDeviceDieW, 1)}<span className="unit">W</span></div>
                <div className="hint">RDS(on) used: {fmt(headline.rdsOnUsedmOhm, 2)} mΩ</div>
              </div>
              <div className="result-tile">
                <div className="label">Whole-inverter loss</div>
                <div className="value">{fmt(headline.inverterTotalW, 0)}<span className="unit">W</span></div>
                <div className="hint">{inverterStructureLabel(device.topology, parallelCount)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Junction temperature</div>
                <div className={`value ${tjPass ? 'pos' : 'neg'}`}>{fmt(worstTj, 1)}<span className="unit">°C</span></div>
                <div className="hint">case {fmt(caseTempC, 0)}°C, RthJC {fmt(device.rthJcKPerW, 3)} K/W</div>
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
            <LossBreakdownBars bars={lossBars} />
          </div>

          {isDuty && (
            <div className="card">
              <div className="card-title">Duty cycle steps</div>
              <table className="results-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr><th>Step</th><th>Load</th><th>Loss (W)</th><th>Tj (°C)</th><th>η (%)</th></tr>
                </thead>
                <tbody>
                  {duty.perStep.map((r, i) => (
                    <tr key={i} style={i === duty.worstStepIndex ? { color: 'var(--warn)' } : undefined}>
                      <td>{i + 1}{i === duty.worstStepIndex ? ' ★' : ''}</td>
                      <td>{fmt(dutySteps[i].phaseCurrentArms, 0)} A, m={fmt(dutySteps[i].modulationIndex, 2)}, {dutySteps[i].mode === 'generator' ? 'gen' : 'mot'}</td>
                      <td>{fmt(r.inverterTotalW, 0)}</td>
                      <td>{fmt(r.junctionTempC, 1)}</td>
                      <td>{fmt(r.efficiencyPercent, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="hint">★ = worst step by junction temperature. Each step is solved quasi-steady (assumes steps long vs the device thermal time constant).</span>
            </div>
          )}

          <div className="card">
            <div className="card-title">Reference &amp; assumptions</div>
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
          </div>
        </div>
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
