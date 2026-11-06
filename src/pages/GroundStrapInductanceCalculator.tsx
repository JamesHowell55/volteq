import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import InfoTooltip from '../components/InfoTooltip';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { strapInductanceNh, wireInductanceNh, impedanceOhm, sweepStrapVsWire } from '../lib/groundStrapInductancePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtHz(hz: number): string {
  if (!isFinite(hz)) return '—';
  if (hz >= 1e9) return `${fmt(hz / 1e9, 2)} GHz`;
  if (hz >= 1e6) return `${fmt(hz / 1e6, 2)} MHz`;
  if (hz >= 1e3) return `${fmt(hz / 1e3, 2)} kHz`;
  return `${fmt(hz, 1)} Hz`;
}

export default function GroundStrapInductanceCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [lengthMm, setLengthMm] = useState(100);
  const [widthMm, setWidthMm] = useState(10);
  const [thicknessMm, setThicknessMm] = useState(0.5);
  const [frequencyHz, setFrequencyHz] = useState(1e6);

  const [compareWireDiameterMm, setCompareWireDiameterMm] = useState(2);

  const getInputs = useCallback((): Record<string, unknown> => ({
    lengthMm, widthMm, thicknessMm, frequencyHz, compareWireDiameterMm,
  }), [lengthMm, widthMm, thicknessMm, frequencyHz, compareWireDiameterMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.lengthMm != null) setLengthMm(v.lengthMm);
    if (v.widthMm != null) setWidthMm(v.widthMm);
    if (v.thicknessMm != null) setThicknessMm(v.thicknessMm);
    if (v.frequencyHz != null) setFrequencyHz(v.frequencyHz);
    if (v.compareWireDiameterMm != null) setCompareWireDiameterMm(v.compareWireDiameterMm);
  }, []);

  const saved = useSavedCalculations('ground-strap-inductance');
  const shareLink = useShareableLink(restoreInputs);

  const inductanceNh = useMemo(() => strapInductanceNh(lengthMm, widthMm, thicknessMm), [lengthMm, widthMm, thicknessMm]);
  const impedance = useMemo(() => impedanceOhm(inductanceNh, frequencyHz), [inductanceNh, frequencyHz]);
  const wireEquivNh = useMemo(() => wireInductanceNh(lengthMm, compareWireDiameterMm), [lengthMm, compareWireDiameterMm]);
  const wireImpedance = useMemo(() => impedanceOhm(wireEquivNh, frequencyHz), [wireEquivNh, frequencyHz]);

  const sweep = useMemo(
    () => sweepStrapVsWire(lengthMm, widthMm, thicknessMm, compareWireDiameterMm, 1e4, 1e9, 6),
    [lengthMm, widthMm, thicknessMm, compareWireDiameterMm],
  );

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Flat strap self-inductance (Grover/Terman)',
      formula: 'L = 0.2·l·[ln(2l/(w+t)) + 0.2235·(w+t)/l + 0.5]  (l, w, t in mm, L in nH)',
      substitution: `l = ${fmt(lengthMm, 1)} mm, w = ${fmt(widthMm, 2)} mm, t = ${fmt(thicknessMm, 2)} mm`,
      result: `L = ${fmt(inductanceNh, 2)} nH`,
    },
    {
      title: 'Impedance at the check frequency',
      formula: 'Z = 2π·f·L',
      substitution: `f = ${fmtHz(frequencyHz)}, L = ${fmt(inductanceNh, 2)} nH`,
      result: `Z = ${fmt(impedance, 2)} Ω`,
    },
  ], [lengthMm, widthMm, thicknessMm, inductanceNh, frequencyHz, impedance]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Inputs',
    rows: [
      { label: 'Strap length', value: `${fmt(toDisplay(lengthMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Strap width', value: `${fmt(toDisplay(widthMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Strap thickness', value: `${fmt(toDisplay(thicknessMm, unitSystem, UNIT_LENGTH), 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Check frequency', value: fmtHz(frequencyHz) },
    ],
  }]), [lengthMm, widthMm, thicknessMm, frequencyHz, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Strap inductance', value: `${fmt(inductanceNh, 2)} nH` },
      { label: 'Strap impedance', value: `${fmt(impedance, 2)} Ω` },
    ],
  }]), [inductanceNh, impedance]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Ground_Strap_Inductance_Calculator',
      pageTitle: 'Grounding / Bond Strap Inductance Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Classical Grover/Terman straight-conductor self-inductance formula (external inductance, non-magnetic conductor). Does not include the connected equipment\'s own loop inductance, contact/joint resistance, or proximity effects from nearby return conductors — treat this as the strap/lead\'s own contribution to a bonding connection\'s total impedance, not the complete picture.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Grounding / Bond Strap Inductance Calculator</div>
          <h1>Grounding / Bond Strap Inductance Calculator</h1>
          <p>
            Self-inductance and impedance of a flat grounding/bonding strap — impedance, not DC resistance,
            governs how well a bond performs at RF, which is why wide flat straps outperform round-wire
            pigtails of the same length.
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
            <div className="card-title"><span><span className="step-num">1</span>Strap geometry</span></div>
            <div className="grid grid-3">
              <div className="field">
                <label>Length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0.01} step={0.1} value={toDisplay(thicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Check frequency</span></div>
            <div className="field">
              <label>Frequency (Hz)</label>
              <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={(e) => setFrequencyHz(Number(e.target.value))} />
              <span className="hint">{fmtHz(frequencyHz)}</span>
            </div>
          </div>

          <PremiumGate feature="Strap vs. wire comparison">
            <div className="card">
              <div className="card-title"><span><span className="step-num">3</span>Compare against a round wire</span></div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Equivalent wire diameter ({unitLabel(unitSystem, UNIT_LENGTH)})
                  <InfoTooltip>Same length as the strap — a round-wire pigtail is the classic (and much worse) alternative.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(compareWireDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setCompareWireDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            </div>
          </PremiumGate>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Strap inductance</div>
                <div className="value">{fmt(inductanceNh, 2)}<span className="unit">nH</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Impedance @ {fmtHz(frequencyHz)}</div>
                <div className="value">{fmt(impedance, 2)}<span className="unit">Ω</span></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Strap vs. round-wire comparison</div>
            <PremiumGate feature="Strap vs. wire comparison">
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Round wire ({fmt(toDisplay(compareWireDiameterMm, unitSystem, UNIT_LENGTH), 1)}{unitLabel(unitSystem, UNIT_LENGTH)} dia.) inductance</div>
                  <div className="value">{fmt(wireEquivNh, 2)}<span className="unit">nH</span></div>
                  <div className="hint">vs. strap {fmt(inductanceNh, 2)} nH — {fmt(wireEquivNh / Math.max(inductanceNh, 1e-9), 2)}× higher</div>
                </div>
                <div className="result-tile">
                  <div className="label">Round wire impedance @ {fmtHz(frequencyHz)}</div>
                  <div className="value">{fmt(wireImpedance, 2)}<span className="unit">Ω</span></div>
                </div>
              </div>
              <table className="data-table" style={{ marginTop: '0.75rem' }}>
                <thead><tr><th>Frequency</th><th>Strap Z (Ω)</th><th>Wire Z (Ω)</th></tr></thead>
                <tbody>
                  {sweep.map((p) => (
                    <tr key={p.frequencyHz}>
                      <td>{fmtHz(p.frequencyHz)}</td>
                      <td>{fmt(p.strapImpedanceOhm, 2)}</td>
                      <td>{fmt(p.wireImpedanceOhm, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PremiumGate>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/ground-strap-inductance" />
        <p className="note">
          Classical Grover/Terman straight-conductor self-inductance: a flat strap follows
          L(nH) = 0.2·l·[ln(2l/(w+t)) + 0.2235·(w+t)/l + 0.5] and a round wire follows
          L(nH) = 0.2·l·[ln(4l/d) − 1] (l, w, t, d all in mm) — both standard textbook results for
          the external self-inductance of a straight non-magnetic conductor. Impedance, not DC
          resistance, is what determines a grounding or bonding connection's effectiveness at RF:
          Z = 2π·f·L grows directly with frequency, so even a short lead can present meaningful
          impedance well below 100MHz — which is exactly why EMC practice favors short, wide, flat
          straps over longer or narrower alternatives, and strongly prefers a strap over a round-wire
          "pigtail" of the same length. This is the conductor's own self-inductance only — it does
          not include loop inductance from the return path, joint/contact resistance, or proximity
          effects from nearby conductors.
        </p>
        <p className="note">
          <b>Validated:</b> both formulas reproduce the widely-cited EMC rule of thumb that "10cm of
          ordinary wire has roughly 100nH of inductance, about 63Ω at 100MHz" almost exactly — a
          100mm/1mm-diameter round wire gives 99.8nH (62.7Ω at 100MHz), and a comparable 100mm/1mm×1mm
          flat strap gives 102.2nH, independently confirming both the formulas and their mm-in/nH-out
          unit convention (a detail several secondary sources reproducing this formula omit). Widening
          a strap at fixed length and thickness was checked to monotonically reduce its inductance, and
          impedance was checked to scale exactly linearly with frequency at fixed inductance.
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
