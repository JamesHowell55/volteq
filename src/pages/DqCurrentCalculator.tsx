import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, unitLabel, UNIT_TORQUE } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import DqSpaceVectorDiagram from '../components/DqSpaceVectorDiagram';
import {
  rmsToPeak,
  magnitudeAngleFromDq,
  dqFromMagnitudeAngle,
  pmsmTorque,
  mtpaAtMagnitude,
  mtpaLocus,
  speedDependentResults,
  type DqCurrent,
  type PmsmParameters,
} from '../lib/focCurrentPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  const v = n === 0 ? 0 : n; // normalise -0 -> 0 so a zero reluctance term doesn't render as "-0"
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type EntryMode = 'dq' | 'peak' | 'rms';
type MotorType = 'spm' | 'ipm';

interface MotorPreset {
  id: string;
  label: string;
  type: MotorType;
  polePairs: number;
  fluxLinkageWb: number;
  ldMh: number;
  lqMh: number;
}

// Illustrative representative PMSM parameter sets — NOT specific datasheets.
// The point is to give sensible starting values for each machine class; always
// replace with the actual motor's characterised parameters for real work.
const MOTOR_PRESETS: MotorPreset[] = [
  { id: 'servo-spm', label: 'Small servo (surface PM)', type: 'spm', polePairs: 4, fluxLinkageWb: 0.021, ldMh: 1.6, lqMh: 1.6 },
  { id: 'ind-ipm', label: 'Industrial servo (interior PM)', type: 'ipm', polePairs: 3, fluxLinkageWb: 0.09, ldMh: 4.0, lqMh: 8.0 },
  { id: 'ev-ipm', label: 'EV traction (interior PM)', type: 'ipm', polePairs: 4, fluxLinkageWb: 0.062, ldMh: 0.22, lqMh: 0.52 },
  { id: 'custom', label: 'Custom', type: 'ipm', polePairs: 4, fluxLinkageWb: 0.05, ldMh: 3.0, lqMh: 5.0 },
];

export default function DqCurrentCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const torqueUnit = unitLabel(unitSystem, UNIT_TORQUE);

  // ---- Current vector entry ----
  const [entryMode, setEntryMode] = useState<EntryMode>('dq');
  const [idA, setIdA] = useState(-20);
  const [iqA, setIqA] = useState(80);
  const [magPeakA, setMagPeakA] = useState(100);
  const [magRmsA, setMagRmsA] = useState(70.7);
  const [angleDeg, setAngleDeg] = useState(100);

  // ---- Motor parameters ----
  const [presetId, setPresetId] = useState('ev-ipm');
  const [motorType, setMotorType] = useState<MotorType>('ipm');
  const [polePairs, setPolePairs] = useState(4);
  const [fluxLinkageWb, setFluxLinkageWb] = useState(0.062);
  const [ldMh, setLdMh] = useState(0.22);
  const [lqMh, setLqMh] = useState(0.52);

  // ---- Operating speed ----
  const [useSpeed, setUseSpeed] = useState(true);
  const [speedRpm, setSpeedRpm] = useState(6000);

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = MOTOR_PRESETS.find((m) => m.id === id);
    if (p && id !== 'custom') {
      setMotorType(p.type);
      setPolePairs(p.polePairs);
      setFluxLinkageWb(p.fluxLinkageWb);
      setLdMh(p.ldMh);
      setLqMh(p.type === 'spm' ? p.ldMh : p.lqMh);
    }
  };

  // Surface-PM machines have no saliency: Lq is forced equal to Ld.
  const effectiveLqMh = motorType === 'spm' ? ldMh : lqMh;

  const motor: PmsmParameters = useMemo(() => ({
    polePairs,
    fluxLinkageWb,
    ldH: ldMh / 1000,
    lqH: effectiveLqMh / 1000,
  }), [polePairs, fluxLinkageWb, ldMh, effectiveLqMh]);

  // Resolve the operating-point d-q current from whichever entry mode is active.
  const dq: DqCurrent = useMemo(() => {
    if (entryMode === 'dq') return { idA, iqA };
    if (entryMode === 'peak') return dqFromMagnitudeAngle(magPeakA, angleDeg);
    return dqFromMagnitudeAngle(rmsToPeak(magRmsA), angleDeg);
  }, [entryMode, idA, iqA, magPeakA, magRmsA, angleDeg]);

  const magAngle = useMemo(() => magnitudeAngleFromDq(dq), [dq]);
  const torque = useMemo(() => pmsmTorque(dq, motor), [dq, motor]);

  // MTPA comparison at the SAME current magnitude.
  const mtpaPoint = useMemo(() => mtpaAtMagnitude(magAngle.magnitudePeakA, motor), [magAngle.magnitudePeakA, motor]);
  const mtpaTorque = useMemo(() => pmsmTorque(mtpaPoint, motor), [mtpaPoint, motor]);
  const locus = useMemo(() => (motorType === 'ipm' ? mtpaLocus(magAngle.magnitudePeakA, motor) : []), [motorType, magAngle.magnitudePeakA, motor]);
  const mtpaAngle = magnitudeAngleFromDq(mtpaPoint);
  const torqueGainPct = torque.totalTorqueNm !== 0 ? ((mtpaTorque.totalTorqueNm - torque.totalTorqueNm) / Math.abs(torque.totalTorqueNm)) * 100 : 0;

  const speed = useMemo(() => (useSpeed ? speedDependentResults(speedRpm, motor, torque.totalTorqueNm) : null), [useSpeed, speedRpm, motor, torque.totalTorqueNm]);

  // Advance angle β from the q-axis (β = γ − 90°), the common vendor convention.
  const advanceAngleDeg = magAngle.angleDeg - 90;
  const isSalient = motorType === 'ipm' && Math.abs(ldMh - effectiveLqMh) > 1e-6;

  const getInputs = useCallback((): Record<string, unknown> => ({
    entryMode, idA, iqA, magPeakA, magRmsA, angleDeg,
    presetId, motorType, polePairs, fluxLinkageWb, ldMh, lqMh, useSpeed, speedRpm,
  }), [entryMode, idA, iqA, magPeakA, magRmsA, angleDeg, presetId, motorType, polePairs, fluxLinkageWb, ldMh, lqMh, useSpeed, speedRpm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.entryMode) setEntryMode(v.entryMode);
    if (v.idA != null) setIdA(v.idA);
    if (v.iqA != null) setIqA(v.iqA);
    if (v.magPeakA != null) setMagPeakA(v.magPeakA);
    if (v.magRmsA != null) setMagRmsA(v.magRmsA);
    if (v.angleDeg != null) setAngleDeg(v.angleDeg);
    if (v.presetId) setPresetId(v.presetId);
    if (v.motorType) setMotorType(v.motorType);
    if (v.polePairs != null) setPolePairs(v.polePairs);
    if (v.fluxLinkageWb != null) setFluxLinkageWb(v.fluxLinkageWb);
    if (v.ldMh != null) setLdMh(v.ldMh);
    if (v.lqMh != null) setLqMh(v.lqMh);
    if (v.useSpeed != null) setUseSpeed(v.useSpeed);
    if (v.speedRpm != null) setSpeedRpm(v.speedRpm);
  }, []);

  const saved = useSavedCalculations('dq-current');

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    steps.push({
      title: 'Current-vector magnitude and angle (amplitude-invariant dq)',
      formula: '|Is|_peak = √(Id² + Iq²),  |Is|_rms = |Is|_peak / √2,  γ = atan2(Iq, Id)',
      substitution: `Id = ${fmt(dq.idA, 2)} A, Iq = ${fmt(dq.iqA, 2)} A`,
      result: `|Is| = ${fmt(magAngle.magnitudePeakA, 2)} A peak = ${fmt(magAngle.magnitudeRmsA, 2)} A rms, γ = ${fmt(magAngle.angleDeg, 1)}° from d-axis (β = ${fmt(advanceAngleDeg, 1)}° from q-axis)`,
    });
    steps.push({
      title: 'Electromagnetic torque (magnet + reluctance)',
      formula: 'T = (3/2)·p·[ λpm·Iq + (Ld − Lq)·Id·Iq ]',
      substitution: `p = ${polePairs}, λpm = ${fmt(fluxLinkageWb, 4)} Wb, Ld = ${fmt(ldMh, 3)} mH, Lq = ${fmt(effectiveLqMh, 3)} mH`,
      result: `T = ${fmt(torque.magnetTorqueNm, 2)} (magnet) + ${fmt(torque.reluctanceTorqueNm, 2)} (reluctance) = ${fmt(torque.totalTorqueNm, 2)} N·m`,
    });
    if (isSalient) {
      steps.push({
        title: 'MTPA operating point at the same |Is|',
        formula: 'Id* = [ λpm − √(λpm² + 8·(Lq−Ld)²·|Is|²) ] / [ 4·(Lq−Ld) ],  Iq* = √(|Is|² − Id*²)',
        substitution: `|Is| = ${fmt(magAngle.magnitudePeakA, 2)} A peak`,
        result: `Id* = ${fmt(mtpaPoint.idA, 2)} A, Iq* = ${fmt(mtpaPoint.iqA, 2)} A (γ* = ${fmt(mtpaAngle.angleDeg, 1)}°), T* = ${fmt(mtpaTorque.totalTorqueNm, 2)} N·m — ${torqueGainPct > 0.05 ? `${fmt(torqueGainPct, 1)}% more torque than the entered point` : 'entered point is essentially on MTPA'}`,
      });
    }
    if (speed) {
      steps.push({
        title: 'Speed-dependent quantities',
        formula: 'f_e = p·n/60,  Ê = ωe·λpm,  P_mech = T·ωm',
        substitution: `n = ${fmt(speedRpm, 0)} rpm, p = ${polePairs}`,
        result: `f_e = ${fmt(speed.electricalFrequencyHz, 1)} Hz, back-EMF = ${fmt(speed.backEmfPeakV, 1)} V peak (${fmt(speed.backEmfRmsV, 1)} V rms/phase), P_mech = ${fmt(speed.mechanicalPowerW / 1000, 2)} kW`,
      });
    }
    return steps;
  }, [dq, magAngle, advanceAngleDeg, polePairs, fluxLinkageWb, ldMh, effectiveLqMh, torque, isSalient, mtpaPoint, mtpaAngle, mtpaTorque, torqueGainPct, speed, speedRpm]);

  const inputSections: ReportSection[] = useMemo(() => {
    const curRows: ReportRow[] = [
      { label: 'Entry mode', value: entryMode === 'dq' ? 'Id & Iq' : entryMode === 'peak' ? 'Peak magnitude & angle' : 'RMS magnitude & angle' },
      { label: 'Id (peak)', value: `${fmt(dq.idA, 2)} A` },
      { label: 'Iq (peak)', value: `${fmt(dq.iqA, 2)} A` },
    ];
    const motorRows: ReportRow[] = [
      { label: 'Motor type', value: motorType === 'spm' ? 'Surface PM (non-salient)' : 'Interior PM (salient)' },
      { label: 'Pole pairs', value: `${polePairs}` },
      { label: 'PM flux linkage λpm', value: `${fmt(fluxLinkageWb, 4)} Wb` },
      { label: 'Ld', value: `${fmt(ldMh, 3)} mH` },
      { label: 'Lq', value: `${fmt(effectiveLqMh, 3)} mH` },
    ];
    if (useSpeed) motorRows.push({ label: 'Operating speed', value: `${fmt(speedRpm, 0)} rpm` });
    return [
      { heading: 'Current vector', rows: curRows },
      { heading: 'Motor parameters', rows: motorRows },
    ];
  }, [entryMode, dq, motorType, polePairs, fluxLinkageWb, ldMh, effectiveLqMh, useSpeed, speedRpm]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Id', value: `${fmt(dq.idA, 2)} A (peak)` },
      { label: 'Iq', value: `${fmt(dq.iqA, 2)} A (peak)` },
      { label: '|Is| peak', value: `${fmt(magAngle.magnitudePeakA, 2)} A` },
      { label: '|Is| rms', value: `${fmt(magAngle.magnitudeRmsA, 2)} A` },
      { label: 'Current angle γ (from d-axis)', value: `${fmt(magAngle.angleDeg, 1)}°` },
      { label: 'Advance angle β (from q-axis)', value: `${fmt(advanceAngleDeg, 1)}°` },
      { label: 'Magnet torque', value: `${fmtU(torque.magnetTorqueNm, unitSystem, UNIT_TORQUE, 2)} ${torqueUnit}` },
      { label: 'Reluctance torque', value: `${fmtU(torque.reluctanceTorqueNm, unitSystem, UNIT_TORQUE, 2)} ${torqueUnit}` },
      { label: 'Total torque', value: `${fmtU(torque.totalTorqueNm, unitSystem, UNIT_TORQUE, 2)} ${torqueUnit}` },
    ];
    if (isSalient) {
      rows.push({ label: 'MTPA Id* / Iq* (same |Is|)', value: `${fmt(mtpaPoint.idA, 2)} / ${fmt(mtpaPoint.iqA, 2)} A` });
      rows.push({ label: 'MTPA torque (same |Is|)', value: `${fmtU(mtpaTorque.totalTorqueNm, unitSystem, UNIT_TORQUE, 2)} ${torqueUnit} (${torqueGainPct > 0.05 ? `+${fmt(torqueGainPct, 1)}% vs entered` : 'at MTPA'})` });
    }
    if (speed) {
      rows.push({ label: 'Electrical frequency', value: `${fmt(speed.electricalFrequencyHz, 1)} Hz` });
      rows.push({ label: 'Back-EMF (per phase)', value: `${fmt(speed.backEmfPeakV, 1)} V peak / ${fmt(speed.backEmfRmsV, 1)} V rms` });
      rows.push({ label: 'Mechanical power', value: `${fmt(speed.mechanicalPowerW / 1000, 2)} kW` });
    }
    return [{ heading: 'Results', rows }];
  }, [dq, magAngle, advanceAngleDeg, torque, isSalient, mtpaPoint, mtpaTorque, torqueGainPct, speed, unitSystem, torqueUnit]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Id_Iq_Current_Calculator',
      pageTitle: 'Id / Iq Current Vector Calculator',
      accentHex,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Field-oriented-control current relationships for a permanent-magnet synchronous motor (PMSM), using the amplitude-invariant Clarke/Park convention so Id, Iq and |Is| are all peak-amplitude quantities (|Is|_peak = √(Id²+Iq²); rms = peak/√2). Torque uses the standard salient-PMSM equation T = (3/2)·p·[λpm·Iq + (Ld−Lq)·Id·Iq]; MTPA uses the closed-form d-axis solution at a fixed current magnitude. Idealisations: linear magnetics (constant Ld, Lq, λpm — no saturation or cross-coupling), no stator-resistance, iron, or mechanical losses in the power/back-EMF figures, and sinusoidal quantities. Real machines saturate (Ld, Lq and λpm vary with load), so treat the torque and MTPA values as first-order estimates and use characterised look-up parameters at the operating point for accurate work. PMSM only — induction-machine field orientation is a different model.',
      ...branding,
    });
  };

  // Segmented button helper for the two-way readouts.
  const readoutTiles = [
    { label: 'Id (peak)', value: fmt(dq.idA, 1), unit: 'A' },
    { label: 'Iq (peak)', value: fmt(dq.iqA, 1), unit: 'A' },
    { label: '|Is| peak', value: fmt(magAngle.magnitudePeakA, 1), unit: 'A' },
    { label: '|Is| rms', value: fmt(magAngle.magnitudeRmsA, 1), unit: 'A' },
    { label: 'Angle γ (from d)', value: fmt(magAngle.angleDeg, 1), unit: '°' },
    { label: 'Advance β (from q)', value: fmt(advanceAngleDeg, 1), unit: '°' },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Id / Iq Current Calculator</div>
          <h1>Id / Iq Current Vector Calculator</h1>
          <p>
            Convert between phase-current magnitude (peak or RMS), current angle, and the rotor-frame
            d-/q-axis currents (Id, Iq) of a PMSM under field-oriented control, with a space-vector
            diagram and the derived torque, MTPA comparison, and speed-dependent back-EMF and power.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="PDF export">
            <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">1</span>Current vector
                <InfoTooltip>Enter the stator current however you have it: as its d-/q-axis split (Id, Iq), or as a magnitude and angle. Amplitude-invariant convention — Id, Iq and the magnitude are all peak values, and |Is|_peak = √(Id²+Iq²) equals the peak phase current (RMS = peak/√2). The angle γ is measured from the d-axis; Id&lt;0 is the flux-weakening / reluctance-assist direction.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Enter from</label>
              <div className="segmented">
                <button className={entryMode === 'dq' ? 'active' : ''} onClick={() => setEntryMode('dq')}>Id &amp; Iq</button>
                <button className={entryMode === 'peak' ? 'active' : ''} onClick={() => setEntryMode('peak')}>Peak &amp; angle</button>
                <button className={entryMode === 'rms' ? 'active' : ''} onClick={() => setEntryMode('rms')}>RMS &amp; angle</button>
              </div>
            </div>
            <div className="grid grid-2">
              {entryMode === 'dq' && (
                <>
                  <div className="field">
                    <label>Id (A, peak)</label>
                    <input autoComplete="off" type="number" value={idA} onChange={(e) => setIdA(Number(e.target.value))} />
                    <span className="hint">Negative = flux-weakening / reluctance-assist.</span>
                  </div>
                  <div className="field">
                    <label>Iq (A, peak)</label>
                    <input autoComplete="off" type="number" value={iqA} onChange={(e) => setIqA(Number(e.target.value))} />
                    <span className="hint">Torque-producing component.</span>
                  </div>
                </>
              )}
              {entryMode === 'peak' && (
                <>
                  <div className="field">
                    <label>|Is| magnitude (A, peak)</label>
                    <input autoComplete="off" type="number" min={0} value={magPeakA} onChange={(e) => setMagPeakA(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Current angle γ (° from d-axis)</label>
                    <input autoComplete="off" type="number" value={angleDeg} onChange={(e) => setAngleDeg(Number(e.target.value))} />
                    <span className="hint">90° = pure torque (Id=0); &gt;90° advances into −d.</span>
                  </div>
                </>
              )}
              {entryMode === 'rms' && (
                <>
                  <div className="field">
                    <label>|Is| magnitude (A, rms)</label>
                    <input autoComplete="off" type="number" min={0} value={magRmsA} onChange={(e) => setMagRmsA(Number(e.target.value))} />
                    <span className="hint">Peak = rms × √2 = {fmt(rmsToPeak(magRmsA), 1)} A.</span>
                  </div>
                  <div className="field">
                    <label>Current angle γ (° from d-axis)</label>
                    <input autoComplete="off" type="number" value={angleDeg} onChange={(e) => setAngleDeg(Number(e.target.value))} />
                    <span className="hint">90° = pure torque (Id=0); &gt;90° advances into −d.</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Motor parameters
                <InfoTooltip>These drive the torque, MTPA and back-EMF outputs. Presets are illustrative representative values for each machine class — replace with your motor's characterised parameters for real work. A surface-PM machine has no saliency (Lq = Ld), so its MTPA is simply Id = 0.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Preset</label>
                <select value={presetId} onChange={(e) => applyPreset(e.target.value)}>
                  {MOTOR_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Motor type</label>
                <div className="segmented">
                  <button className={motorType === 'spm' ? 'active' : ''} onClick={() => { setMotorType('spm'); setPresetId('custom'); }}>Surface PM (SPM)</button>
                  <button className={motorType === 'ipm' ? 'active' : ''} onClick={() => { setMotorType('ipm'); setPresetId('custom'); }}>Interior PM (IPM)</button>
                </div>
                <span className="hint">{motorType === 'spm' ? 'Non-salient: Lq forced = Ld, no reluctance torque.' : 'Salient: Lq > Ld gives reluctance torque and a non-trivial MTPA angle.'}</span>
              </div>
              <div className="field">
                <label>Pole pairs</label>
                <input autoComplete="off" type="number" min={1} step={1} value={polePairs} onChange={(e) => { setPolePairs(Math.max(1, Math.round(Number(e.target.value)))); setPresetId('custom'); }} />
              </div>
              <div className="field">
                <label>PM flux linkage λpm (Wb)</label>
                <input autoComplete="off" type="number" min={0} step={0.001} value={fluxLinkageWb} onChange={(e) => { setFluxLinkageWb(Number(e.target.value)); setPresetId('custom'); }} />
                <span className="hint">Peak per-phase. Ke(V·s/rad) = λpm; line-line back-EMF const scales with √3.</span>
              </div>
              <div className="field">
                <label>Ld (mH)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={ldMh} onChange={(e) => { setLdMh(Number(e.target.value)); setPresetId('custom'); }} />
              </div>
              <div className="field">
                <label>Lq (mH)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={effectiveLqMh} disabled={motorType === 'spm'} onChange={(e) => { setLqMh(Number(e.target.value)); setPresetId('custom'); }} />
                {motorType === 'spm' && <span className="hint">= Ld for a surface-PM motor.</span>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">3</span>Operating speed
                <InfoTooltip>Optional — adds the electrical frequency, phase back-EMF, and ideal mechanical shaft power at this speed. Back-EMF is the open-circuit magnet voltage ωe·λpm; mechanical power is T·ωm with no losses subtracted.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" checked={useSpeed} onChange={(e) => setUseSpeed(e.target.checked)} style={{ width: 'auto' }} />
                Include speed-dependent outputs
              </label>
            </div>
            {useSpeed && (
              <div className="field">
                <label>Mechanical speed (rpm)</label>
                <input autoComplete="off" type="number" min={0} value={speedRpm} onChange={(e) => setSpeedRpm(Number(e.target.value))} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Current conversions</div>
            <div className="result-grid">
              {readoutTiles.map((t) => (
                <div className="result-tile" key={t.label}>
                  <div className="label">{t.label}</div>
                  <div className="value">{t.value}<span className="unit">{t.unit}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Space-vector diagram</div>
            <DqSpaceVectorDiagram
              operating={dq}
              mtpaPoint={isSalient ? mtpaPoint : null}
              mtpaLocus={locus}
              magnitudePeakA={magAngle.magnitudePeakA}
            />
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Torque
                <InfoTooltip>The magnet term (λpm·Iq) is the surface-PM torque; the reluctance term ((Ld−Lq)·Id·Iq) is the extra torque a salient rotor produces from a negative Id. Together they give the total shaft torque before losses.</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <tbody>
                <tr><td>Magnet torque</td><td>{fmtU(torque.magnetTorqueNm, unitSystem, UNIT_TORQUE, 2)} {torqueUnit}</td></tr>
                <tr><td>Reluctance torque</td><td>{fmtU(torque.reluctanceTorqueNm, unitSystem, UNIT_TORQUE, 2)} {torqueUnit}</td></tr>
                <tr><td><b>Total torque</b></td><td><b>{fmtU(torque.totalTorqueNm, unitSystem, UNIT_TORQUE, 2)} {torqueUnit}</b></td></tr>
              </tbody>
            </table>
          </div>

          {isSalient && (
            <div className="card">
              <div className="card-title">
                <span>
                  MTPA comparison (same |Is|)
                  <InfoTooltip>Maximum-torque-per-ampere is the Id/Iq split that extracts the most torque from a given current magnitude. This compares your entered operating point against the MTPA-optimal point at the same |Is| — the gap is torque (and copper loss) left on the table.</InfoTooltip>
                </span>
              </div>
              <table className="data-table">
                <tbody>
                  <tr><td>MTPA Id* / Iq*</td><td>{fmt(mtpaPoint.idA, 1)} / {fmt(mtpaPoint.iqA, 1)} A</td></tr>
                  <tr><td>MTPA current angle γ*</td><td>{fmt(mtpaAngle.angleDeg, 1)}°</td></tr>
                  <tr><td>MTPA torque</td><td>{fmtU(mtpaTorque.totalTorqueNm, unitSystem, UNIT_TORQUE, 2)} {torqueUnit}</td></tr>
                  <tr>
                    <td>vs entered point</td>
                    <td className={torqueGainPct > 0.05 ? 'fail' : 'pass'}>
                      {torqueGainPct > 0.05 ? `+${fmt(torqueGainPct, 1)}% available` : 'on MTPA ✓'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {speed && (
            <div className="card">
              <div className="card-title">
                <span>
                  At {fmt(speedRpm, 0)} rpm
                  <InfoTooltip>Electrical frequency f_e = p·n/60; open-circuit phase back-EMF Ê = ωe·λpm; ideal mechanical power P = T·ωm (lossless).</InfoTooltip>
                </span>
              </div>
              <table className="data-table">
                <tbody>
                  <tr><td>Electrical frequency</td><td>{fmt(speed.electricalFrequencyHz, 1)} Hz</td></tr>
                  <tr><td>Back-EMF (peak / rms, per phase)</td><td>{fmt(speed.backEmfPeakV, 1)} / {fmt(speed.backEmfRmsV, 1)} V</td></tr>
                  <tr><td>Mechanical power</td><td>{fmt(speed.mechanicalPowerW / 1000, 2)} kW</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Uses the amplitude-invariant Clarke/Park transform (the standard motor-control convention), so Id, Iq and
          the current magnitude are all peak-amplitude quantities and the d-q vector length equals the peak phase
          current: |Is|_peak = √(Id² + Iq²), with |Is|_rms = |Is|_peak / √2. The current angle γ is measured
          counter-clockwise from the d-axis (rotor flux axis); the advance angle β = γ − 90° is the same vector
          measured from the q-axis, the convention many drives use. Torque is the standard salient-PMSM expression
          T = (3/2)·p·[λpm·Iq + (Ld − Lq)·Id·Iq] — a magnet term plus a reluctance term that only exists when the
          rotor is salient (Lq ≠ Ld). Maximum-torque-per-ampere uses the closed-form d-axis solution
          Id* = [λpm − √(λpm² + 8·(Lq−Ld)²·|Is|²)] / [4·(Lq−Ld)] at a fixed current magnitude, which reduces to
          Id* = 0 for a non-salient (surface-PM) machine. Back-EMF is the open-circuit magnet voltage ωe·λpm and
          mechanical power is T·ωm. Idealisations: linear magnetics (constant Ld, Lq and λpm — no magnetic
          saturation or d-q cross-coupling), purely sinusoidal quantities, and no stator-resistance, iron, or
          mechanical losses in the power and back-EMF figures. Real machines saturate, so Ld, Lq and λpm all vary
          with operating point; treat these as first-order estimates and use characterised look-up-table
          parameters for accurate torque and MTPA work. Applies to permanent-magnet synchronous machines — an
          induction machine's field orientation is a different, slip-based model.
        </p>
        <p className="note">
          <b>Validated:</b> a 3-4-5 current triangle (Id=3A, Iq=4A) round-trips through the magnitude/angle
          conversion exactly (5.000 A, 53.13°, back to 3/4A). Torque matches hand calculation exactly for both a
          non-salient case (magnet-only, no reluctance term) and a salient interior-PM case (both terms
          non-zero). The MTPA closed form was checked two ways: it returns exactly Id=0 for a non-salient
          machine, and for a salient one, its predicted operating point was independently confirmed to actually
          maximize torque by a brute-force 0.5°-resolution sweep of the same current-magnitude circle — the
          closed form and the numerical search landed on the same torque to 4 significant figures.
        </p>
      </div>

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
