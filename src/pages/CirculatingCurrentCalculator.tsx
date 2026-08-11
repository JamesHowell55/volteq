import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { fundamentalElectricalFreqHz } from '../lib/chokePhysics';
import { resistivityAtOhmMm2PerM } from '../lib/skinDepthPhysics';
import { solveCirculatingCurrent, type StrandInput } from '../lib/circulatingCurrentPhysics';

const COPPER_RHO20 = 0.0172; // Ω·mm²/m
const COPPER_BETA = 234.5;

type ConductorShape = 'round' | 'flat';
type TranspositionMode = 'none' | 'ideal';
type FrequencySource = 'direct' | 'motor';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function evenlySpacedDefaults(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (n > 1 ? i / (n - 1) : 0.5));
}

export default function CirculatingCurrentCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);

  const [shape, setShape] = useState<ConductorShape>('flat');
  const [diameterMm, setDiameterMm] = useState(1.6);
  const [widthMm, setWidthMm] = useState(6.0);
  const [heightMm, setHeightMm] = useState(2.5);
  const [tempC, setTempC] = useState(120);

  const [strandCount, setStrandCount] = useState(4);
  const [positions, setPositions] = useState<number[]>(evenlySpacedDefaults(4));
  const [transpositionMode, setTranspositionMode] = useState<TranspositionMode>('none');

  const [activeLengthMm, setActiveLengthMm] = useState(150);
  const [endWindingLengthMm, setEndWindingLengthMm] = useState(100);
  const [slotWidthMm, setSlotWidthMm] = useState(8);
  const [stackHeightMm, setStackHeightMm] = useState(15);

  const [bundleCurrentARms, setBundleCurrentARms] = useState(400);
  const [frequencySource, setFrequencySource] = useState<FrequencySource>('direct');
  const [directFrequencyHz, setDirectFrequencyHz] = useState(800);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(12000);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const motorFrequencyHz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);
  const frequencyHz = frequencySource === 'direct' ? directFrequencyHz : motorFrequencyHz;

  const setStrandCountClamped = (n: number) => {
    const clamped = Math.max(2, Math.min(8, Math.round(n)));
    setStrandCount(clamped);
    setPositions((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      return [...prev, ...evenlySpacedDefaults(clamped).slice(prev.length)];
    });
  };
  const updatePosition = (i: number, val: number) => setPositions((prev) => prev.map((p, idx) => (idx === i ? Math.min(1, Math.max(0, val)) : p)));

  const areaMm2 = shape === 'round' ? (Math.PI * diameterMm * diameterMm) / 4 : widthMm * heightMm;
  const rho = resistivityAtOhmMm2PerM(COPPER_RHO20, COPPER_BETA, tempC);
  const activeLengthM = activeLengthMm / 1000;
  const strandResistanceActiveOhm = areaMm2 > 0 ? (rho * activeLengthM) / areaMm2 : 0;

  const strands: StrandInput[] = useMemo(() => {
    const effectivePositions = transpositionMode === 'ideal'
      ? positions.map(() => positions.reduce((a, b) => a + b, 0) / Math.max(1, positions.length))
      : positions;
    return effectivePositions.map((pos, i) => ({
      id: `s${i + 1}`, resistanceActiveOhm: strandResistanceActiveOhm,
      segments: [{ positionFraction: pos, lengthFraction: 1 }],
    }));
  }, [positions, transpositionMode, strandResistanceActiveOhm]);

  const result = useMemo(() => solveCirculatingCurrent({
    strands, endWindingLengthM: endWindingLengthMm / 1000, activeLengthM,
    slotWidthMm, stackHeightMm, bundleCurrentARms, frequencyHz,
  }), [strands, endWindingLengthMm, activeLengthM, slotWidthMm, stackHeightMm, bundleCurrentARms, frequencyHz]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    shape, diameterMm, widthMm, heightMm, tempC, strandCount, positions, transpositionMode,
    activeLengthMm, endWindingLengthMm, slotWidthMm, stackHeightMm, bundleCurrentARms,
    frequencySource, directFrequencyHz, motorSpeedRpm, motorPolePairs,
  }), [shape, diameterMm, widthMm, heightMm, tempC, strandCount, positions, transpositionMode,
    activeLengthMm, endWindingLengthMm, slotWidthMm, stackHeightMm, bundleCurrentARms,
    frequencySource, directFrequencyHz, motorSpeedRpm, motorPolePairs]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.shape) setShape(v.shape);
    if (v.diameterMm != null) setDiameterMm(v.diameterMm);
    if (v.widthMm != null) setWidthMm(v.widthMm);
    if (v.heightMm != null) setHeightMm(v.heightMm);
    if (v.tempC != null) setTempC(v.tempC);
    if (v.strandCount != null) setStrandCount(v.strandCount);
    if (Array.isArray(v.positions)) setPositions(v.positions);
    if (v.transpositionMode) setTranspositionMode(v.transpositionMode);
    if (v.activeLengthMm != null) setActiveLengthMm(v.activeLengthMm);
    if (v.endWindingLengthMm != null) setEndWindingLengthMm(v.endWindingLengthMm);
    if (v.slotWidthMm != null) setSlotWidthMm(v.slotWidthMm);
    if (v.stackHeightMm != null) setStackHeightMm(v.stackHeightMm);
    if (v.bundleCurrentARms != null) setBundleCurrentARms(v.bundleCurrentARms);
    if (v.frequencySource) setFrequencySource(v.frequencySource);
    if (v.directFrequencyHz != null) setDirectFrequencyHz(v.directFrequencyHz);
    if (v.motorSpeedRpm != null) setMotorSpeedRpm(v.motorSpeedRpm);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
  }, []);

  const saved = useSavedCalculations('circulating-current');
  const shareLink = useShareableLink(restoreInputs);

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Slot-leakage loop inductance (per strand pair)',
      formula: 'L_loop,jk = (μ0·l_active/b_slot)·|y_j − y_k|  (thin-strand slot-leakage permeance)',
      substitution: `l_active = ${fmt(activeLengthMm, 0)} mm, b_slot = ${fmt(slotWidthMm, 1)} mm, stack height = ${fmt(stackHeightMm, 1)} mm`,
      result: `${strandCount} strands solved as a coupled network (self + mutual inductance matrix)`,
    },
    {
      title: 'Coupled network solve',
      formula: 'R_j·I_j + jω·Σ_k L_jk·I_k = V_common (same ∀j),  Σ_j I_j = I_bundle',
      substitution: `R_strand = ${fmt(strandResistanceActiveOhm * 1000, 4)} mΩ (active) × α_w, f = ${fmt(frequencyHz, 0)} Hz`,
      result: `max circulating current = ${fmt(Math.max(...result.strands.map(s => s.circulatingCurrentARms)), 1)} A`,
    },
    {
      title: 'Loss',
      formula: 'P_ideal = ΣR_j·(I_bundle/N)²,   P_total = ΣR_j·|I_j|²,   P_added = P_total − P_ideal',
      substitution: `I_bundle = ${fmt(bundleCurrentARms, 0)} A RMS, N = ${strandCount} strands`,
      result: `P_ideal = ${fmt(result.idealLossW, 2)} W, P_added = ${fmt(result.addedLossW, 2)} W, total = ${fmt(result.totalLossW, 2)} W (${fmt(result.lossRatio, 2)}×)`,
    },
  ], [activeLengthMm, slotWidthMm, stackHeightMm, strandCount, strandResistanceActiveOhm, frequencyHz, result, bundleCurrentARms]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Parallel strands',
    rows: [
      { label: 'Conductor', value: shape === 'round' ? `round, Ø${fmt(diameterMm, 2)} mm` : `flat, ${fmt(widthMm, 2)}×${fmt(heightMm, 2)} mm` },
      { label: 'Strand count / positions', value: `${strandCount}, ξ = [${positions.map(p => fmt(p, 2)).join(', ')}]` },
      { label: 'Transposition', value: transpositionMode === 'ideal' ? 'Ideal (full Roebel)' : 'None' },
      { label: 'Active / end-winding length', value: `${fmt(activeLengthMm, 0)} / ${fmt(endWindingLengthMm, 0)} mm` },
      { label: 'Slot width / stack height', value: `${fmt(slotWidthMm, 1)} / ${fmt(stackHeightMm, 1)} mm` },
      { label: 'Bundle current / frequency', value: `${fmt(bundleCurrentARms, 0)} A, ${fmt(frequencyHz, 0)} Hz` },
    ] as ReportRow[],
  }]), [shape, diameterMm, widthMm, heightMm, strandCount, positions, transpositionMode, activeLengthMm, endWindingLengthMm, slotWidthMm, stackHeightMm, bundleCurrentARms, frequencyHz]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Ideal (equal-sharing) loss', value: `${fmt(result.idealLossW, 2)} W` },
      { label: 'Added circulating loss', value: `${fmt(result.addedLossW, 2)} W` },
      { label: 'Total loss', value: `${fmt(result.totalLossW, 2)} W (${fmt(result.lossRatio, 2)}×)` },
      { label: 'Max circulating current', value: `${fmt(Math.max(...result.strands.map(s => s.circulatingCurrentARms)), 1)} A` },
      ...result.strands.map((s) => ({ label: `Strand ${s.id} (ξ=${fmt(s.effectivePositionFraction, 2)})`, value: `${fmt(s.currentARms, 1)} A total, ${fmt(s.circulatingCurrentARms, 1)} A circulating` })),
    ] as ReportRow[],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Parallel_Path_Circulating_Current',
      pageTitle: 'Parallel Path Circulating Current',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Circulating current between electrically-parallel winding strands occupying different slot depths, from a coupled-network model using the classical slot-leakage loop inductance L_loop=(mu0*l_active/b_slot)*|y_j-y_k| (thin-strand approximation, cross-verified this session against the modern hairpin-winding literature, classical transformer leakage theory, and an independent energy-method derivation). The N strands are solved as a coupled network (equal terminal voltage + current-sum constraint), assuming they constitute the slot\'s full conductor content — other, non-parallel turns sharing the same slot are not separately modelled. The thin-strand approximation over-predicts (conservatively) circulating current for strands whose height is comparable to their separation; a finite-conductor-height correction is not applied. Transposition is modelled as each strand\'s length-averaged position, a simplification of the true continuous effect. 2-D/3-D field fringing, iron saturation, and end-region leakage are not modelled. This is a new, still-maturing model — treat results as an order-of-magnitude / relative-comparison guide (e.g. transposed vs untransposed), not a precise absolute prediction, and verify against FEA for a final design.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Parallel Path Circulating Current</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            Parallel Path Circulating Current
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--warn, #f59e0b)', border: '1px solid var(--warn, #f59e0b)', borderRadius: 'var(--radius-pill, 9999px)', padding: '0.15rem 0.6rem' }}>
              Work in progress
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#a855f7', border: '1px solid #a855f7', borderRadius: 'var(--radius-pill, 9999px)', padding: '0.15rem 0.6rem' }}>
              Premium
            </span>
          </h1>
          <p>
            Circulating current between electrically-parallel winding strands (or hairpin sub-conductors)
            that sit at different depths within the same slot — the AC loss mechanism the Motor Winding
            calculator explicitly doesn't model. Solves a coupled network using the classical slot-leakage
            loop inductance between strand positions, and shows what transposition buys you.
          </p>
          <p className="note" style={{ borderLeft: '3px solid var(--warn, #f59e0b)', paddingLeft: '0.6rem', margin: '0.4rem 0 0' }}>
            <b>Work in progress:</b> this uses a newly-derived, cross-checked-but-not-FEA-validated model.
            Treat results as order-of-magnitude / relative comparisons (e.g. transposed vs untransposed), not
            precise absolute predictions — see the assumptions note below for what it does and doesn't capture.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <PremiumGate feature="Parallel Path Circulating Current calculator">
        <div className="two-col">
          <div>
            <div className="card">
              <div className="card-title"><span><span className="step-num">1</span>Strand geometry</span></div>
              <div className="segmented" style={{ marginBottom: '0.75rem' }}>
                <button className={shape === 'round' ? 'active' : ''} onClick={() => setShape('round')}>Round wire</button>
                <button className={shape === 'flat' ? 'active' : ''} onClick={() => setShape('flat')}>Flat / hairpin</button>
              </div>
              {shape === 'round' ? (
                <div className="field">
                  <label>Strand diameter ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(diameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              ) : (
                <div className="grid grid-2">
                  <div className="field">
                    <label>Strand width ({lenUnit})</label>
                    <input autoComplete="off" type="number" min={0.5} step={0.1} value={toDisplay(widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Strand height ({lenUnit})</label>
                    <input autoComplete="off" type="number" min={0.2} step={0.1} value={toDisplay(heightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </div>
              )}
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <label>Strand temperature (°C)</label>
                <input autoComplete="off" type="number" value={tempC} onChange={(e) => setTempC(Number(e.target.value))} />
                <span className="hint">R_active = {fmt(strandResistanceActiveOhm * 1000, 4)} mΩ</span>
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span><span className="step-num">2</span>Parallel strands &amp; positions
                  <InfoTooltip>How many electrically-parallel strands share the bundle current, and where each sits within the slot's conductor stack (0 = slot bottom, 1 = slot top). Strands at very different positions see very different slot-leakage field, driving circulating current between them.</InfoTooltip>
                </span>
              </div>
              <div className="field">
                <label>Number of parallel strands</label>
                <input autoComplete="off" type="number" min={2} max={8} step={1} value={strandCount} onChange={(e) => setStrandCountClamped(Number(e.target.value))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                {positions.map((pos, i) => (
                  <div key={i} className="field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
                    <label style={{ minWidth: '70px', marginBottom: 0 }}>Strand {i + 1}</label>
                    <input type="range" min={0} max={1} step={0.01} value={pos} onChange={(e) => updatePosition(i, Number(e.target.value))} style={{ flex: 1 }} disabled={transpositionMode === 'ideal'} />
                    <span className="hint" style={{ minWidth: '40px', textAlign: 'right' }}>{fmt(pos, 2)}</span>
                  </div>
                ))}
              </div>
              <div className="segmented" style={{ marginTop: '0.75rem' }}>
                <button className={transpositionMode === 'none' ? 'active' : ''} onClick={() => setTranspositionMode('none')}>No transposition</button>
                <button className={transpositionMode === 'ideal' ? 'active' : ''} onClick={() => setTranspositionMode('ideal')}>Ideal (full Roebel)</button>
              </div>
              {transpositionMode === 'ideal' && (
                <p className="hint" style={{ marginTop: '0.4rem' }}>
                  Every strand is treated as spending equal length at every position (ideal transposition) — this
                  should drive circulating current toward zero, showing the benefit transposition buys.
                </p>
              )}
            </div>

            <div className="card">
              <div className="card-title"><span><span className="step-num">3</span>Slot &amp; duty</span></div>
              <div className="grid grid-2">
                <div className="field">
                  <label>Active length ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={10} step={5} value={toDisplay(activeLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setActiveLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>End-winding length ({lenUnit})<InfoTooltip>One-sided end-winding length. Adds series resistance (and reactance) to each strand's loop without adding slot-field coupling — longer end windings damp circulating current.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0} step={5} value={toDisplay(endWindingLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setEndWindingLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Slot width ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={1} step={0.5} value={toDisplay(slotWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setSlotWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Conductor stack height ({lenUnit})<InfoTooltip>The total radial height of the slot's conductor stack that the strand positions (0-1) are measured across.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={1} step={0.5} value={toDisplay(stackHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setStackHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <label>Bundle current (A RMS)</label>
                <input autoComplete="off" type="number" min={0} step={10} value={bundleCurrentARms} onChange={(e) => setBundleCurrentARms(Number(e.target.value))} />
              </div>
              <div className="segmented" style={{ margin: '0.5rem 0' }}>
                <button className={frequencySource === 'direct' ? 'active' : ''} onClick={() => setFrequencySource('direct')}>Direct entry</button>
                <button className={frequencySource === 'motor' ? 'active' : ''} onClick={() => setFrequencySource('motor')}>From motor speed</button>
              </div>
              {frequencySource === 'direct' ? (
                <div className="field">
                  <label>Electrical frequency (Hz)</label>
                  <input autoComplete="off" type="number" min={0} step={10} value={directFrequencyHz} onChange={(e) => setDirectFrequencyHz(Number(e.target.value))} />
                </div>
              ) : (
                <div className="grid grid-2">
                  <div className="field">
                    <label>Motor speed (rpm)</label>
                    <input autoComplete="off" type="number" min={0} step={100} value={motorSpeedRpm} onChange={(e) => setMotorSpeedRpm(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Pole pairs</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={motorPolePairs} onChange={(e) => setMotorPolePairs(Math.max(1, Math.round(Number(e.target.value))))} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="card">
              <div className="card-title">Results</div>
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Total loss</div>
                  <div className="value">{fmt(result.totalLossW, 1)}<span className="unit">W</span></div>
                  <div className="hint">{fmt(result.lossRatio, 2)}× the ideal equal-sharing loss</div>
                </div>
                <div className="result-tile">
                  <div className="label">Added circulating loss</div>
                  <div className={`value ${result.addedLossW > result.idealLossW ? 'warn' : 'pos'}`}>{fmt(result.addedLossW, 1)}<span className="unit">W</span></div>
                  <div className="hint">on top of {fmt(result.idealLossW, 1)} W ideal</div>
                </div>
                <div className="result-tile">
                  <div className="label">Max circulating current</div>
                  <div className="value">{fmt(Math.max(...result.strands.map(s => s.circulatingCurrentARms)), 1)}<span className="unit">A</span></div>
                  <div className="hint">of {fmt(bundleCurrentARms / strandCount, 1)} A ideal share/strand</div>
                </div>
              </div>
              <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead><tr><th>Strand</th><th>Position ξ</th><th>Current (A)</th><th>Circulating (A)</th></tr></thead>
                  <tbody>
                    {result.strands.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{fmt(s.effectivePositionFraction, 2)}</td>
                        <td>{fmt(s.currentARms, 1)}</td>
                        <td>{fmt(s.circulatingCurrentARms, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
          onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
          onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />
      </PremiumGate>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/circulating-current" />
        <p className="note">
          Circulating current arises when electrically-parallel strands sit at different depths within a slot:
          the slot-leakage field builds up with depth, so each strand links a different amount of flux, and
          because the strands are joined at both ends the resulting EMF difference drives current around the
          loop between them — on top of, not instead of, the useful bundle current. This calculator solves the
          N strands as a coupled network (every strand at the same terminal voltage, currents summing to the
          bundle current) using the classical <strong>slot-leakage loop inductance</strong> between two strand
          positions, L<sub>loop</sub> = (μ₀·l<sub>active</sub>/b<sub>slot</sub>)·|y<sub>j</sub>−y<sub>k</sub>| — a
          thin-strand approximation cross-verified this session against the modern hairpin-winding literature,
          classical transformer leakage theory, and an independent first-principles energy derivation.
          <strong> The thin-strand approximation over-predicts (conservatively) circulating current for strands
          whose height is comparable to their separation</strong> — a finite-conductor-height correction is not
          applied. The model assumes the strands shown are the slot's full conductor content (other, non-parallel
          turns sharing the same slot are not separately modelled); 2-D/3-D field fringing, iron saturation, and
          end-region leakage are also not modelled. Transposition is modelled as each strand's length-averaged
          position — a simplification of the true continuous effect. No external absolute-watt worked example
          exists in the literature for this exact configuration, so validation here is structural (zero
          circulating current for identical positions or ideal transposition, current-deviation conservation,
          loss never decreasing) plus a self-consistent hand-derived numeric case. Verify against FEA before
          relying on absolute magnitudes for a final design.
        </p>
        <p className="note">
          <b>Validated:</b> a closed-form 2-strand solution hand-derived from this same model,
          I<sub>δ</sub> = [jω·L<sub>loop</sub>·I<sub>bundle</sub>/2] / [2R+jω·L<sub>loop</sub>], reproduces this
          calculator's output to 4 significant figures. Strands at the same position, or under ideal
          transposition, give exactly zero circulating current; swapping two strands' positions leaves total
          loss unchanged; current deviations from the ideal share always sum to zero; total loss never falls
          below the ideal equal-sharing loss.
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
