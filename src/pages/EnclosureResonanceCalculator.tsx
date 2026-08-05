import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { solveCavityModes } from '../lib/cavityResonancePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtHz(hz: number): string {
  if (!isFinite(hz)) return '—';
  if (hz >= 1e9) return `${fmt(hz / 1e9, 3)} GHz`;
  if (hz >= 1e6) return `${fmt(hz / 1e6, 2)} MHz`;
  if (hz >= 1e3) return `${fmt(hz / 1e3, 2)} kHz`;
  return `${fmt(hz, 1)} Hz`;
}

export default function EnclosureResonanceCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium } = useEntitlement();

  const [lengthMm, setLengthMm] = useState(300);
  const [heightMm, setHeightMm] = useState(200);
  const [widthMm, setWidthMm] = useState(100);
  const [checkFrequencyHz, setCheckFrequencyHz] = useState(0);

  const getInputs = useCallback((): Record<string, unknown> => ({
    lengthMm, heightMm, widthMm, checkFrequencyHz,
  }), [lengthMm, heightMm, widthMm, checkFrequencyHz]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.lengthMm != null) setLengthMm(v.lengthMm);
    if (v.heightMm != null) setHeightMm(v.heightMm);
    if (v.widthMm != null) setWidthMm(v.widthMm);
    if (v.checkFrequencyHz != null) setCheckFrequencyHz(v.checkFrequencyHz);
  }, []);

  const saved = useSavedCalculations('enclosure-resonance');
  const shareLink = useShareableLink(restoreInputs);

  const allModes = useMemo(() => solveCavityModes(lengthMm, heightMm, widthMm, 3, 12), [lengthMm, heightMm, widthMm]);
  const lowestMode = allModes[0];
  const modesToShow = isPremium ? allModes : allModes.slice(0, 1);

  const nearestModeToCheck = useMemo(() => {
    if (checkFrequencyHz <= 0 || allModes.length === 0) return null;
    return allModes.reduce((best, m) => (Math.abs(m.frequencyHz - checkFrequencyHz) < Math.abs(best.frequencyHz - checkFrequencyHz) ? m : best));
  }, [allModes, checkFrequencyHz]);
  const proximityWarning = nearestModeToCheck != null && checkFrequencyHz > 0
    && Math.abs(nearestModeToCheck.frequencyHz - checkFrequencyHz) / checkFrequencyHz < 0.1;

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Rectangular cavity resonant mode frequencies',
      formula: 'f(m,n,p) = (c/2)·√((m/l)² + (n/h)² + (p/w)²), at least two of m,n,p nonzero',
      substitution: `l = ${fmt(lengthMm, 1)} mm, h = ${fmt(heightMm, 1)} mm, w = ${fmt(widthMm, 1)} mm`,
      result: lowestMode ? `Lowest mode (${lowestMode.m},${lowestMode.n},${lowestMode.p}): f = ${fmtHz(lowestMode.frequencyHz)}` : '—',
    },
  ], [lengthMm, heightMm, widthMm, lowestMode]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Inputs',
    rows: [
      { label: 'Internal length', value: `${fmt(toDisplay(lengthMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Internal height', value: `${fmt(toDisplay(heightMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Internal width', value: `${fmt(toDisplay(widthMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
    ],
  }]), [lengthMm, heightMm, widthMm, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: modesToShow.map((m) => ({ label: `Mode (${m.m},${m.n},${m.p})`, value: fmtHz(m.frequencyHz) })),
  }]), [modesToShow]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Enclosure_Resonance_Calculator',
      pageTitle: 'EMC Enclosure Cavity Resonance Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Idealized empty rectangular metal cavity. Real enclosures are lower in resonant frequency than this calculation once loaded with PCBs and components (added dielectric raises the effective permittivity), and resonance peaks are damped (lower Q, less severe) by absorptive materials, cable losses, and non-ideal (lossy) walls. Treat these frequencies as where resonance COULD occur, not a certainty in a populated enclosure — verify with near-field probing or full-wave simulation for compliance-critical designs.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Enclosure Cavity Resonance Calculator</div>
          <h1>EMC Enclosure Cavity Resonance Calculator</h1>
          <p>
            A shielded enclosure is also a cavity resonator — at its resonant frequencies, shielding
            effectiveness can collapse toward 0dB regardless of the barrier material. Find the resonant
            mode frequencies of a rectangular enclosure from its internal dimensions.
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
            <div className="card-title"><span><span className="step-num">1</span>Internal dimensions</span></div>
            <div className="grid grid-3">
              <div className="field">
                <label>Length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(heightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            </div>
            <span className="hint">Use internal dimensions (the actual cavity), not the enclosure's outer envelope.</span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Check a frequency (optional)</span></div>
            <div className="field">
              <label>Frequency of interest (Hz)</label>
              <input autoComplete="off" type="number" min={0} value={checkFrequencyHz || ''} onChange={(e) => setCheckFrequencyHz(Number(e.target.value))} placeholder="e.g. a switching harmonic or susceptibility test frequency" />
              <span className="hint">{checkFrequencyHz > 0 ? fmtHz(checkFrequencyHz) : 'Leave blank to just see the mode table'}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Lowest resonant mode</div>
                <div className="value">{lowestMode ? fmtHz(lowestMode.frequencyHz) : '—'}<span className="unit"></span></div>
                <div className="hint">mode ({lowestMode?.m},{lowestMode?.n},{lowestMode?.p})</div>
              </div>
              {checkFrequencyHz > 0 && nearestModeToCheck && (
                <div className="result-tile">
                  <div className="label">Nearest mode to check frequency</div>
                  <div className={`value ${proximityWarning ? 'neg' : 'pos'}`}>{fmtHz(nearestModeToCheck.frequencyHz)}</div>
                  <div className="hint">mode ({nearestModeToCheck.m},{nearestModeToCheck.n},{nearestModeToCheck.p}) — {fmt(Math.abs(nearestModeToCheck.frequencyHz - checkFrequencyHz) / checkFrequencyHz * 100, 1)}% away</div>
                </div>
              )}
            </div>
            {checkFrequencyHz > 0 && (
              <div className={`status-banner ${proximityWarning ? 'fail' : 'pass'}`} style={{ marginTop: '0.75rem' }}>
                {proximityWarning
                  ? `⚠ Your check frequency is within 10% of resonant mode (${nearestModeToCheck?.m},${nearestModeToCheck?.n},${nearestModeToCheck?.p}) — expect degraded shielding effectiveness near this frequency.`
                  : '✓ No resonant mode within 10% of your check frequency (among the modes checked).'}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Resonant modes</div>
            <table className="data-table">
              <thead><tr><th>Mode (m,n,p)</th><th>Frequency</th></tr></thead>
              <tbody>
                {modesToShow.map((m) => (
                  <tr key={`${m.m}-${m.n}-${m.p}`}>
                    <td>({m.m},{m.n},{m.p})</td>
                    <td>{fmtHz(m.frequencyHz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isPremium && allModes.length > 1 && (
              <PremiumGate feature="Full resonant mode table">
                <table className="data-table" style={{ marginTop: '0.5rem' }}>
                  <tbody>
                    {allModes.slice(1).map((m) => (
                      <tr key={`${m.m}-${m.n}-${m.p}`}>
                        <td>({m.m},{m.n},{m.p})</td>
                        <td>{fmtHz(m.frequencyHz)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PremiumGate>
            )}
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/enclosure-resonance" />
        <p className="note">
          A rectangular metal enclosure forms a cavity resonator with resonant mode frequencies
          f(m,n,p) = (c/2)·√((m/l)² + (n/h)² + (p/w)²), where l/h/w are the internal dimensions and
          m/n/p are non-negative mode indices with at least two nonzero (a resonant mode needs field
          variation in at least two dimensions). At these specific frequencies the enclosure behaves
          like a resonant antenna rather than a barrier, and shielding effectiveness (see the
          Shielding Effectiveness calculator) can collapse toward 0dB or worse — independent of how
          good the barrier material or thickness is. This is an idealized empty-cavity calculation:
          a real enclosure loaded with PCBs and components shifts resonances lower (added dielectric
          raises the effective permittivity) and damps them (lower Q, less severe) via lossy walls,
          cables, and absorptive materials — treat these frequencies as where resonance could occur,
          not a certainty in a populated enclosure.
        </p>
        <p className="note">
          <b>Validated:</b> reproduces the well-known EMC rule of thumb (Tim Williams, "EMC for
          Product Designers") that a 1m cubic enclosure has a lowest resonance of approximately
          212MHz — this calculator returns 211.99MHz for that exact case, and confirms the three
          degenerate cube modes (1,1,0), (1,0,1), (0,1,1) are numerically identical as required by
          symmetry.
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
