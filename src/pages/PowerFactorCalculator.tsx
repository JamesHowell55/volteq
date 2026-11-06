import { useCallback, useMemo, useState } from 'react';
import PowerTriangle from '../components/PowerTriangle';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import InfoTooltip from '../components/InfoTooltip';
import PremiumGate from '../components/PremiumGate';
import { useTheme } from '../lib/ThemeContext';
import { deriveAccentOnLight } from '../lib/theme';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportDiagram } from '../lib/pdfExport';
import { renderPowerTriangleSvg } from '../lib/pdfDiagrams';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import {
  powerTriangleFromPS,
  decomposeHarmonics,
  powerFactorCorrection,
  lineCurrentA,
  type SupplyPhases,
  type CapacitorConnection,
} from '../lib/powerFactorPhysics';

type Prefix = '' | 'k' | 'M';
const PREFIX_MULT: Record<Prefix, number> = { '': 1, k: 1e3, M: 1e6 };
type LoadType = 'lagging' | 'leading';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '∞';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Engineering-prefixed power string, e.g. 60000 + 'var' -> "60 kvar". */
function fmtEng(value: number, unit: 'W' | 'VA' | 'var', digits = 2): string {
  const a = Math.abs(value);
  if (a >= 1e6) return `${fmt(value / 1e6, digits)} M${unit}`;
  if (a >= 1e3) return `${fmt(value / 1e3, digits)} k${unit}`;
  return `${fmt(value, digits)} ${unit}`;
}

export default function PowerFactorCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [prefix, setPrefix] = useState<Prefix>('k');
  const [pInput, setPInput] = useState<number | ''>(80);
  const [sInput, setSInput] = useState<number | ''>(100);
  const [loadType, setLoadType] = useState<LoadType>('lagging');

  const [harmonicsOn, setHarmonicsOn] = useState(false);
  const [thdIPercent, setThdIPercent] = useState(30);

  const [correctionOn, setCorrectionOn] = useState(false);
  const [targetPf, setTargetPf] = useState(0.95);
  const [phases, setPhases] = useState<SupplyPhases>('three');
  const [connection, setConnection] = useState<CapacitorConnection>('delta');
  const [voltageV, setVoltageV] = useState(400);
  const [frequencyHz, setFrequencyHz] = useState(50);

  const getInputs = useCallback((): Record<string, unknown> => ({
    prefix, pInput, sInput, loadType, harmonicsOn, thdIPercent,
    correctionOn, targetPf, phases, connection, voltageV, frequencyHz,
  }), [prefix, pInput, sInput, loadType, harmonicsOn, thdIPercent, correctionOn, targetPf, phases, connection, voltageV, frequencyHz]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.prefix != null) setPrefix(v.prefix);
    if (v.pInput != null) setPInput(v.pInput);
    if (v.sInput != null) setSInput(v.sInput);
    if (v.loadType) setLoadType(v.loadType);
    if (v.harmonicsOn != null) setHarmonicsOn(v.harmonicsOn);
    if (v.thdIPercent != null) setThdIPercent(v.thdIPercent);
    if (v.correctionOn != null) setCorrectionOn(v.correctionOn);
    if (v.targetPf != null) setTargetPf(v.targetPf);
    if (v.phases) setPhases(v.phases);
    if (v.connection) setConnection(v.connection);
    if (v.voltageV != null) setVoltageV(v.voltageV);
    if (v.frequencyHz != null) setFrequencyHz(v.frequencyHz);
  }, []);

  const saved = useSavedCalculations('power-factor');
  const shareLink = useShareableLink(restoreInputs);

  const mult = PREFIX_MULT[prefix];
  const pUnit = `${prefix}W`;
  const sUnit = `${prefix}VA`;
  const lagging = loadType === 'lagging';

  const result = useMemo(
    () => powerTriangleFromPS(pInput === '' ? NaN : pInput * mult, sInput === '' ? NaN : sInput * mult),
    [pInput, sInput, mult],
  );
  const triangle = result.ok ? result.triangle : null;

  const harmonics = useMemo(
    () => (triangle && harmonicsOn ? decomposeHarmonics(triangle, thdIPercent) : null),
    [triangle, harmonicsOn, thdIPercent],
  );

  // Capacitors act on the fundamental, so when a THD figure is supplied the correction
  // starts from (and targets) the displacement power factor, not the true one.
  const basePf = triangle ? (harmonics ? harmonics.displacementPf : triangle.pf) : 0;
  const correction = useMemo(
    () => (triangle && correctionOn && lagging
      ? powerFactorCorrection(triangle.pW, basePf, targetPf, voltageV, frequencyHz, phases, connection)
      : null),
    [triangle, correctionOn, lagging, basePf, targetPf, voltageV, frequencyHz, phases, connection],
  );
  const correctionNote = !triangle || !correctionOn ? null
    : !lagging ? 'The load is leading (capacitive) — adding capacitors would worsen it. Correct a leading load by removing capacitance or adding inductive reactance (shunt reactor).'
    : targetPf > 1 || !(voltageV > 0) || !(frequencyHz > 0) ? 'Enter a target power factor up to 1.000, and a positive voltage and frequency.'
    : basePf >= targetPf ? `The ${harmonics ? 'displacement ' : ''}power factor (${fmt(basePf, 3)}) is already at or above the target (${fmt(targetPf, 3)}).`
    : null;

  const trueAfterCorrection = correction && harmonics ? correction.newPf * harmonics.distortionFactor : null;
  const iBefore = triangle && correction ? lineCurrentA(triangle.sVA, voltageV, phases) : null;
  const iAfter = correction ? lineCurrentA(correction.newSVA, voltageV, phases) : null;

  const pfClass = !triangle ? '' : triangle.pf >= 0.95 ? 'pos' : triangle.pf < 0.9 ? 'warn' : '';

  const calculationSteps: CalcStepData[] = useMemo(() => {
    if (!triangle) return [];
    const out: CalcStepData[] = [
      {
        title: 'Power factor',
        formula: 'PF = P / S',
        substitution: `P = ${fmtEng(triangle.pW, 'W')}, S = ${fmtEng(triangle.sVA, 'VA')}`,
        result: `PF = ${fmt(triangle.pf, 4)} (${lagging ? 'lagging' : 'leading'})`,
      },
      {
        title: 'Phase angle',
        formula: 'φ = arccos(PF)',
        substitution: `arccos(${fmt(triangle.pf, 4)})`,
        result: `φ = ${fmt(triangle.phiDeg, 2)}°`,
      },
      {
        title: 'Reactive power',
        formula: 'Q = √(S² − P²)',
        substitution: `√((${fmtEng(triangle.sVA, 'VA')})² − (${fmtEng(triangle.pW, 'W')})²)`,
        result: `Q = ${fmtEng(triangle.qVar, 'var')} ${lagging ? '(inductive)' : '(capacitive)'}`,
      },
    ];
    if (harmonics) {
      out.push({
        title: 'Split true power factor into displacement and distortion (sinusoidal supply voltage assumed)',
        formula: 'k_dist = 1 / √(1 + THDi²);  DPF = PF / k_dist;  S² = P² + Q₁² + D²',
        substitution: `THDi = ${fmt(thdIPercent, 1)}%, PF = ${fmt(triangle.pf, 4)}`,
        result: harmonics.consistent
          ? `k_dist = ${fmt(harmonics.distortionFactor, 4)}, DPF = cos φ₁ = ${fmt(harmonics.displacementPf, 4)}, Q₁ = ${fmtEng(harmonics.fundamentalQVar, 'var')}, D = ${fmtEng(harmonics.distortionVA, 'VA')}`
          : `Inconsistent: PF / k_dist = ${fmt(triangle.pf / harmonics.distortionFactor, 3)} exceeds 1 — the THDi is too high for this P and S. DPF capped at 1.`,
      });
    }
    if (correction) {
      out.push(
        {
          title: 'Capacitive reactive power to install',
          formula: 'Qc = P · (tan φ₁ − tan φ₂)',
          substitution: `P = ${fmtEng(triangle.pW, 'W')}, φ₁ = arccos(${fmt(basePf, 4)}) = ${fmt((Math.acos(basePf) * 180) / Math.PI, 2)}°, φ₂ = arccos(${fmt(targetPf, 4)}) = ${fmt((Math.acos(targetPf) * 180) / Math.PI, 2)}°`,
          result: `Qc = ${fmtEng(correction.qcVar, 'var')}`,
        },
        {
          title: phases === 'single' ? 'Capacitance' : connection === 'delta' ? 'Capacitance per phase (delta-connected)' : 'Capacitance per phase (star-connected)',
          formula: phases === 'three' && connection === 'delta' ? 'C = Qc / (3 · 2πf · V²)' : 'C = Qc / (2πf · V²)',
          substitution: `Qc = ${fmtEng(correction.qcVar, 'var')}, V = ${fmt(voltageV, 1)} V, f = ${fmt(frequencyHz, 1)} Hz`,
          result: `C = ${fmt(correction.capacitanceF * 1e6, 1)} µF`,
        },
        {
          title: 'Supply after correction (same real power)',
          formula: 'S₂ = P / PF₂;  I₂/I₁ = S₂/S₁',
          substitution: `S₂ = ${fmtEng(triangle.pW, 'W')} / ${fmt(targetPf, 4)}`,
          result: `S₂ = ${fmtEng(correction.newSVA, 'VA')}, line current ${fmt(iBefore ?? 0, 1)} A → ${fmt(iAfter ?? 0, 1)} A (−${fmt(correction.currentReductionPct, 1)}%)`,
        },
      );
    }
    return out;
  }, [triangle, lagging, harmonics, thdIPercent, correction, basePf, targetPf, phases, connection, voltageV, frequencyHz, iBefore, iAfter]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Real power P', value: pInput === '' ? '—' : `${fmt(pInput, 4)} ${pUnit}` },
      { label: 'Apparent power S', value: sInput === '' ? '—' : `${fmt(sInput, 4)} ${sUnit}` },
      { label: 'Load type', value: lagging ? 'Lagging (inductive)' : 'Leading (capacitive)' },
    ];
    if (harmonicsOn) rows.push({ label: 'Current THD (THDi)', value: `${fmt(thdIPercent, 1)} %` });
    if (correctionOn) {
      rows.push(
        { label: 'Target displacement power factor', value: fmt(targetPf, 3) },
        { label: 'Supply', value: phases === 'three' ? `Three-phase, ${connection}-connected capacitors` : 'Single-phase' },
        { label: phases === 'three' ? 'Line-to-line voltage' : 'Voltage', value: `${fmt(voltageV, 1)} V` },
        { label: 'Frequency', value: `${fmt(frequencyHz, 1)} Hz` },
      );
    }
    return [{ heading: 'Inputs', rows }];
  }, [pInput, sInput, pUnit, sUnit, lagging, harmonicsOn, thdIPercent, correctionOn, targetPf, phases, connection, voltageV, frequencyHz]);

  const outputSections: ReportSection[] = useMemo(() => {
    if (!triangle) return [];
    const rows: ReportRow[] = [
      { label: 'Power factor', value: `${fmt(triangle.pf, 4)} ${lagging ? 'lagging' : 'leading'}` },
      { label: 'Phase angle φ', value: `${fmt(triangle.phiDeg, 2)}°` },
      { label: 'Reactive power Q', value: fmtEng(triangle.qVar, 'var') },
    ];
    if (harmonics) {
      rows.push(
        { label: 'Displacement power factor (cos φ₁)', value: fmt(harmonics.displacementPf, 4) },
        { label: 'Distortion factor', value: fmt(harmonics.distortionFactor, 4) },
        { label: 'Distortion power D', value: fmtEng(harmonics.distortionVA, 'VA') },
      );
    }
    const sections: ReportSection[] = [{ heading: 'Results', rows }];
    if (correction) {
      const crow: ReportRow[] = [
        { label: 'Capacitor bank required Qc', value: fmtEng(correction.qcVar, 'var') },
        { label: phases === 'three' ? `Capacitance per phase (${connection})` : 'Capacitance', value: `${fmt(correction.capacitanceF * 1e6, 1)} µF` },
        { label: 'Apparent power after correction', value: fmtEng(correction.newSVA, 'VA') },
        { label: 'Line current before → after', value: `${fmt(iBefore ?? 0, 1)} A → ${fmt(iAfter ?? 0, 1)} A (−${fmt(correction.currentReductionPct, 1)}%)` },
      ];
      if (trueAfterCorrection !== null) crow.push({ label: 'True power factor after correction (THDi unchanged)', value: fmt(trueAfterCorrection, 4) });
      sections.push({ heading: 'Power-factor correction', rows: crow });
    }
    return sections;
  }, [triangle, lagging, harmonics, correction, phases, connection, iBefore, iAfter, trueAfterCorrection]);

  const handleExportPdf = () => {
    if (!triangle) return;
    const pdfAccent = deriveAccentOnLight(accentHex);
    const diagrams: ReportDiagram[] = [{
      title: 'Power triangle',
      svgMarkup: renderPowerTriangleSvg(
        triangle.pW, triangle.qVar, triangle.sVA, lagging,
        { p: fmtEng(triangle.pW, 'W'), q: fmtEng(triangle.qVar, 'var'), s: fmtEng(triangle.sVA, 'VA'), phiDeg: triangle.phiDeg },
        correction ? { qVar: correction.newQVar, sVA: correction.newSVA, sLabel: fmtEng(correction.newSVA, 'VA'), phiDeg: (Math.acos(correction.newPf) * 180) / Math.PI } : null,
        pdfAccent,
      ),
    }];
    exportReportToPdf({
      tabName: 'Power_Factor_Calculator',
      pageTitle: 'Power Factor Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams,
      disclaimer: 'Engineering estimation tool. Power factor PF = P/S from real and apparent power. Reactive power is reported as a magnitude; whether it is inductive or capacitive is taken from the load type you select. Correction sizing assumes the capacitors are rated for the stated voltage and acts on the fundamental frequency only; with significant harmonic current a capacitor bank can resonate with the supply inductance, so check for harmonic resonance and consider detuned (reactor-fitted) capacitors. Verify supply-authority tariff and connection requirements before installing correction equipment.',
      ...branding,
    });
  };

  const corrected = correction ? { qVar: correction.newQVar, sVA: correction.newSVA } : null;

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Power Factor Calculator</div>
          <h1>Power Factor Calculator</h1>
          <p>
            Power factor from real and apparent power — PF = P / S — with the phase angle and reactive power,
            and (Premium) harmonic decomposition and capacitor sizing to correct it to a target.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} disabled={!triangle} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Power</span></div>
            <div className="field">
              <label>Power unit</label>
              <div className="segmented">
                <button className={prefix === '' ? 'active' : ''} onClick={() => setPrefix('')}>W / VA</button>
                <button className={prefix === 'k' ? 'active' : ''} onClick={() => setPrefix('k')}>kW / kVA</button>
                <button className={prefix === 'M' ? 'active' : ''} onClick={() => setPrefix('M')}>MW / MVA</button>
              </div>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.85rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Real power P ({pUnit})
                  <InfoTooltip>The useful power doing work, as read from a wattmeter or the equipment nameplate. For a three-phase load this is the total across all three phases.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step="any" value={pInput} onChange={e => setPInput(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Apparent power S ({sUnit})
                  <InfoTooltip>The product of rms voltage and rms current (√3 · V<sub>LL</sub> · I for a balanced three-phase load). It is never less than the real power.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step="any" value={sInput} onChange={e => setSInput(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            <div className="field" style={{ marginTop: '0.85rem' }}>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Load type
                <InfoTooltip>Lagging: current lags voltage — inductive loads such as motors, transformers and chokes. Leading: current leads voltage — capacitive loads such as capacitor banks, long lightly-loaded cables, and some electronic supplies. P and S alone cannot tell the two apart.</InfoTooltip>
              </label>
              <div className="segmented">
                <button className={lagging ? 'active' : ''} onClick={() => setLoadType('lagging')}>Lagging (inductive)</button>
                <button className={!lagging ? 'active' : ''} onClick={() => setLoadType('leading')}>Leading (capacitive)</button>
              </div>
            </div>
            {!result.ok && <p className="note" style={{ color: 'var(--neg)', marginTop: '0.75rem' }}>{result.error}</p>}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Harmonic distortion (optional)</span></div>
            <PremiumGate feature="Harmonic decomposition">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
                <input type="checkbox" checked={harmonicsOn} onChange={e => setHarmonicsOn(e.target.checked)} style={{ width: 'auto' }} />
                Split true power factor into displacement and distortion
              </label>
              {harmonicsOn && (
                <div className="field" style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center' }}>
                    Current THD, THDi (%)
                    <InfoTooltip>Total harmonic distortion of the load current, from a power analyser. P/S already includes the effect of harmonics (it is the true power factor); this splits it into the part capacitors can correct (displacement, cos φ₁) and the part they cannot (distortion). Assumes a sinusoidal supply voltage.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} step={1} value={thdIPercent} onChange={e => setThdIPercent(Number(e.target.value))} />
                </div>
              )}
            </PremiumGate>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Power-factor correction (optional)</span></div>
            <PremiumGate feature="Power-factor correction sizing">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
                <input type="checkbox" checked={correctionOn} onChange={e => setCorrectionOn(e.target.checked)} style={{ width: 'auto' }} />
                Size a capacitor bank to reach a target power factor
              </label>
              {correctionOn && (
                <>
                  <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Target power factor
                        <InfoTooltip>Many supply authorities and tariffs look for 0.95 or better; check your own. Correcting all the way to 1.000 is rarely worthwhile and risks over-correction (leading power factor) at light load.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0.01} max={1} step={0.01} value={targetPf} onChange={e => setTargetPf(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Supply</label>
                      <select value={phases} onChange={e => setPhases(e.target.value as SupplyPhases)}>
                        <option value="three">Three-phase</option>
                        <option value="single">Single-phase</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>{phases === 'three' ? 'Line-to-line voltage (V)' : 'Voltage (V)'}</label>
                      <input autoComplete="off" type="number" min={0} value={voltageV} onChange={e => setVoltageV(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Frequency (Hz)</label>
                      <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={e => setFrequencyHz(Number(e.target.value))} />
                    </div>
                    {phases === 'three' && (
                      <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center' }}>
                          Capacitor connection
                          <InfoTooltip>Delta capacitors see the full line voltage, so each needs only a third of the capacitance of a star connection for the same kvar (but a higher voltage rating).</InfoTooltip>
                        </label>
                        <select value={connection} onChange={e => setConnection(e.target.value as CapacitorConnection)}>
                          <option value="delta">Delta</option>
                          <option value="star">Star</option>
                        </select>
                      </div>
                    )}
                  </div>
                </>
              )}
            </PremiumGate>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            {triangle ? (
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Power factor</div>
                  <div className={`value ${pfClass}`}>{fmt(triangle.pf, 3)}</div>
                  <div className="hint">{lagging ? 'lagging' : 'leading'} · cos φ = P / S</div>
                </div>
                <div className="result-tile">
                  <div className="label">Phase angle φ</div>
                  <div className="value">{fmt(triangle.phiDeg, 2)}<span className="unit">°</span></div>
                  <div className="hint">arccos(PF)</div>
                </div>
                <div className="result-tile">
                  <div className="label">Reactive power Q</div>
                  <div className="value">{fmtEng(triangle.qVar, 'var')}</div>
                  <div className="hint">{lagging ? 'inductive' : 'capacitive'} · √(S² − P²)</div>
                </div>
                {harmonics && (
                  <>
                    <div className="result-tile">
                      <div className="label">Displacement PF (cos φ₁)</div>
                      <div className="value">{fmt(harmonics.displacementPf, 3)}</div>
                      <div className="hint">{harmonics.consistent ? 'correctable with capacitors' : '⚠ THDi too high for this P and S — capped at 1'}</div>
                    </div>
                    <div className="result-tile">
                      <div className="label">Distortion factor</div>
                      <div className="value">{fmt(harmonics.distortionFactor, 3)}</div>
                      <div className="hint">1 / √(1 + THDi²) — not correctable with capacitors</div>
                    </div>
                    <div className="result-tile">
                      <div className="label">Distortion power D</div>
                      <div className="value">{fmtEng(harmonics.distortionVA, 'VA')}</div>
                      <div className="hint">S² = P² + Q₁² + D²</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="note">Enter real and apparent power to see the power factor.</p>
            )}
            {triangle && triangle.pf < 0.9 && (
              <p className="note" style={{ marginTop: '0.75rem' }}>
                A power factor below about 0.9 means the supply must carry noticeably more current than the real power needs — larger cables and switchgear, more I²R loss, and in many places a reactive-power charge.
              </p>
            )}
          </div>

          {(correction || correctionNote) && (
            <div className="card">
              <div className="card-title">Power-factor correction</div>
              {correction && triangle ? (
                <div className="result-grid">
                  <div className="result-tile">
                    <div className="label">Capacitor bank Qc</div>
                    <div className="value">{fmtEng(correction.qcVar, 'var')}</div>
                    <div className="hint">{fmt(basePf, 3)} → {fmt(targetPf, 3)}{harmonics ? ' (displacement)' : ''}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">{phases === 'three' ? `Capacitance per phase (${connection})` : 'Capacitance'}</div>
                    <div className="value">{fmt(correction.capacitanceF * 1e6, 1)}<span className="unit">µF</span></div>
                    <div className="hint">at {fmt(voltageV, 0)} V, {fmt(frequencyHz, 0)} Hz</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Apparent power after</div>
                    <div className="value">{fmtEng(correction.newSVA, 'VA')}</div>
                    <div className="hint">was {fmtEng(triangle.sVA, 'VA')}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Line current</div>
                    <div className="value pos">−{fmt(correction.currentReductionPct, 1)}<span className="unit">%</span></div>
                    <div className="hint">{fmt(iBefore ?? 0, 1)} A → {fmt(iAfter ?? 0, 1)} A</div>
                  </div>
                  {trueAfterCorrection !== null && (
                    <div className="result-tile">
                      <div className="label">True PF after</div>
                      <div className="value">{fmt(trueAfterCorrection, 3)}</div>
                      <div className="hint">harmonic current unchanged</div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="note">{correctionNote}</p>
              )}
              {correction && harmonicsOn && thdIPercent >= 20 && (
                <p className="note" style={{ marginTop: '0.75rem' }}>
                  ⚠ With this much harmonic current a plain capacitor bank can resonate with the supply inductance and amplify harmonics. Detuned (reactor-fitted) or filtered capacitor banks are usually specified in this situation.
                </p>
              )}
            </div>
          )}

          {triangle && (
            <div className="card">
              <div className="card-title">Power triangle</div>
              <PowerTriangle
                pW={triangle.pW} qVar={triangle.qVar} sVA={triangle.sVA} lagging={lagging}
                corrected={corrected} phiDeg={triangle.phiDeg}
                pLabel={fmtEng(triangle.pW, 'W')} qLabel={fmtEng(triangle.qVar, 'var')} sLabel={fmtEng(triangle.sVA, 'VA')}
                correctedPhiDeg={correction ? (Math.acos(correction.newPf) * 180) / Math.PI : null}
                correctedSLabel={correction ? fmtEng(correction.newSVA, 'VA') : undefined}
              />
            </div>
          )}
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/power-factor" />
        <p className="note">
          Power factor is the fraction of the apparent power (S = V<sub>rms</sub>·I<sub>rms</sub>, in VA) that does
          useful work (real power P, in W): <strong>PF = P / S = cos φ</strong>. The remainder is reactive power
          Q = √(S² − P²) (var), which sloshes back and forth between source and load without doing work but still
          has to be carried by the cables, switchgear and transformers. The three form the power triangle,
          S² = P² + Q². This tool takes P and S, so it gives the <em>true</em> power factor, harmonics included.
          P and S alone cannot say whether the load is inductive (current lagging) or capacitive (leading), so you
          choose that; it only matters for the diagram and for correction.
        </p>
        <p className="note">
          Correction with shunt capacitors cancels fundamental reactive power at constant real power:
          Qc = P·(tan φ₁ − tan φ₂). Each capacitor then carries Qc = ω·C·V², so C = Qc/(ω·V²) for a single-phase
          bank or a star-connected three-phase bank, and C = Qc/(3·ω·V²) per phase for delta (V being the
          line-to-line voltage). A capacitor delivers kvar in proportion to V², so one rated at a different voltage
          from the supply will deliver correspondingly more or less than its nameplate. Current falls in proportion
          to S, so I₂/I₁ = PF₁/PF₂. With distorted current the true PF equals the displacement PF multiplied by
          the distortion factor 1/√(1 + THDi²) (sinusoidal voltage assumed); capacitors can only improve the
          displacement part. This tool supports engineering estimation — confirm with the supply authority's
          requirements and the capacitor manufacturer for any installation.
        </p>
        <p className="note">
          <b>Validated:</b> checked against hand calculations — 80 kW at 100 kVA gives PF 0.800, φ = 36.87° and
          Q = 60 kvar; correcting 80 kW from 0.80 to 0.95 needs 33.7 kvar, i.e. 223.5 µF per phase (delta) or
          670.5 µF (star) at 400 V, 50 Hz, with the line current falling 15.8%; and a true PF of 0.80 with 30% THDi
          splits into a displacement PF of 0.835 and a distortion factor of 0.958.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Calculation steps</div>
        {calculationSteps.length === 0 && <p className="note">Enter valid real and apparent power to see the working.</p>}
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
