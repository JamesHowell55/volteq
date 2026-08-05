import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_AREA } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { solveSlotAperture, solveVentPanel, type HoleShape } from '../lib/apertureShieldingPhysics';

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

type OpeningMode = 'slot' | 'vent';

export default function ApertureShieldingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();

  const [frequencyHz, setFrequencyHz] = useState(300e6);
  const [mode, setMode] = useState<OpeningMode>('slot');

  // Slot / gap (free)
  const [slotMaxDimensionMm, setSlotMaxDimensionMm] = useState(50);

  // Vent panel (premium)
  const [holeShape, setHoleShape] = useState<HoleShape>('round');
  const [holeDiameterMm, setHoleDiameterMm] = useState(3);
  const [panelThicknessMm, setPanelThicknessMm] = useState(10);
  const [holeCount, setHoleCount] = useState(50);
  const [panelAreaMm2, setPanelAreaMm2] = useState(2500);

  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setMode((prev) => (prev === 'vent' ? 'slot' : prev));
  }, [isPremium, entitlementLoading]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    frequencyHz, mode, slotMaxDimensionMm,
    holeShape, holeDiameterMm, panelThicknessMm, holeCount, panelAreaMm2,
  }), [frequencyHz, mode, slotMaxDimensionMm, holeShape, holeDiameterMm, panelThicknessMm, holeCount, panelAreaMm2]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.frequencyHz != null) setFrequencyHz(v.frequencyHz);
    if (v.mode != null) setMode(v.mode);
    if (v.slotMaxDimensionMm != null) setSlotMaxDimensionMm(v.slotMaxDimensionMm);
    if (v.holeShape != null) setHoleShape(v.holeShape);
    if (v.holeDiameterMm != null) setHoleDiameterMm(v.holeDiameterMm);
    if (v.panelThicknessMm != null) setPanelThicknessMm(v.panelThicknessMm);
    if (v.holeCount != null) setHoleCount(v.holeCount);
    if (v.panelAreaMm2 != null) setPanelAreaMm2(v.panelAreaMm2);
  }, []);

  const saved = useSavedCalculations('aperture-shielding');
  const shareLink = useShareableLink(restoreInputs);

  const slotResult = useMemo(() => solveSlotAperture(slotMaxDimensionMm, frequencyHz), [slotMaxDimensionMm, frequencyHz]);
  const ventResult = useMemo(
    () => solveVentPanel({ holeShape, holeDiameterMm, panelThicknessMm, holeCount, panelAreaMm2 }, frequencyHz),
    [holeShape, holeDiameterMm, panelThicknessMm, holeCount, panelAreaMm2, frequencyHz],
  );

  const totalSeDb = mode === 'slot' ? slotResult.seDb : ventResult.totalSeDb;
  const cutoffMarginLow = mode === 'vent' && ventResult.belowCutoffMargin < 3;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    if (mode === 'slot') {
      return [{
        title: 'Thin slot / gap radiating-aperture leakage',
        formula: 'SE = 20·log₁₀(λ / (2·d)) for d < λ/2, else SE = 0dB',
        substitution: `f = ${fmtHz(frequencyHz)} → λ = ${fmt(slotResult.wavelengthM * 1000, 1)} mm, λ/2 = ${fmt(slotResult.halfWavelengthMm, 1)} mm, d = ${fmt(slotMaxDimensionMm, 1)} mm`,
        result: `SE = ${fmt(slotResult.seDb, 2)} dB${slotResult.atOrBeyondHalfWavelength ? ' (opening ≥ λ/2 — no shielding, acts as a resonant slot antenna)' : ''}`,
      }];
    }
    return [
      {
        title: 'Per-hole waveguide-below-cutoff attenuation',
        formula: 'A = k·(t/D),  k = 32 (round/hex) or 27.3 (square)',
        substitution: `${holeShape} hole, D = ${fmt(holeDiameterMm, 2)} mm, t = ${fmt(panelThicknessMm, 2)} mm, k = ${holeShape === 'round' ? 32 : 27.3}`,
        result: `A = ${fmt(ventResult.perHoleAttenuationDb, 2)} dB`,
      },
      {
        title: 'Array reduction for N close-packed holes',
        formula: 'reduction = 10·log₁₀(N)',
        substitution: `N = ${holeCount}`,
        result: `−${fmt(ventResult.arrayReductionDb, 2)} dB`,
      },
      {
        title: 'Hole cutoff frequency check',
        formula: 'fc = c / (1.706·D)',
        substitution: `D = ${fmt(holeDiameterMm, 2)} mm`,
        result: `fc = ${fmtHz(ventResult.cutoffFrequencyHz)} — operating at ${fmtHz(frequencyHz)}, ${fmt(ventResult.belowCutoffMargin, 1)}× below cutoff${cutoffMarginLow ? ' (⚠ margin below 3× — waveguide-below-cutoff theory weakens as frequency approaches fc)' : ''}`,
      },
      {
        title: 'Total vent panel shielding effectiveness',
        formula: 'SE = max(0, per-hole A − array reduction)',
        substitution: '',
        result: `SE = ${fmt(ventResult.totalSeDb, 2)} dB`,
      },
    ];
  }, [mode, frequencyHz, slotResult, slotMaxDimensionMm, holeShape, holeDiameterMm, panelThicknessMm, holeCount, ventResult, cutoffMarginLow]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Frequency', value: fmtHz(frequencyHz) },
      { label: 'Opening type', value: mode === 'slot' ? 'Thin slot / gap' : 'Vent panel (waveguide-below-cutoff)' },
    ];
    if (mode === 'slot') {
      rows.push({ label: 'Max linear dimension', value: `${fmt(toDisplay(slotMaxDimensionMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
    } else {
      rows.push(
        { label: 'Hole shape', value: holeShape },
        { label: 'Hole size', value: `${fmt(toDisplay(holeDiameterMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
        { label: 'Panel thickness', value: `${fmt(toDisplay(panelThicknessMm, unitSystem, UNIT_LENGTH), 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
        { label: 'Hole count', value: `${holeCount}` },
      );
    }
    return [{ heading: 'Inputs', rows }];
  }, [frequencyHz, mode, slotMaxDimensionMm, holeShape, holeDiameterMm, panelThicknessMm, holeCount, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: mode === 'slot'
      ? [{ label: 'Shielding effectiveness', value: `${fmt(slotResult.seDb, 2)} dB` }]
      : [
        { label: 'Per-hole attenuation', value: `${fmt(ventResult.perHoleAttenuationDb, 2)} dB` },
        { label: 'Array reduction', value: `−${fmt(ventResult.arrayReductionDb, 2)} dB` },
        { label: 'Total shielding effectiveness', value: `${fmt(ventResult.totalSeDb, 2)} dB` },
        { label: 'Open area', value: ventResult.openAreaPercent != null ? `${fmt(ventResult.openAreaPercent, 2)}%` : '—' },
      ],
  }]), [mode, slotResult, ventResult]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Aperture_Shielding_Calculator',
      pageTitle: 'EMC Aperture & Vent Panel Shielding Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Two distinct models: a thin slot/gap radiates like a slot antenna (SE=20log10(wavelength/2d), zero once the opening reaches half a wavelength); a vent panel with real depth (drilled/punched holes or honeycomb) is modelled as an array of short waveguide-below-cutoff sections (A=k*t/D per hole, minus a 10*log10(N) array reduction for N close-packed holes) and is only valid well below each hole\'s own cutoff frequency. Neither model accounts for gasket/seam contact impedance. A real enclosure\'s achievable shielding is normally set by whichever opening (aperture, seam, or vent) is weakest, not by the solid barrier — use alongside the Shielding Effectiveness calculator.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Aperture &amp; Vent Panel Shielding Calculator</div>
          <h1>EMC Aperture &amp; Vent Panel Shielding Calculator</h1>
          <p>
            Leakage through openings in an EMC shield — a thin slot or gap (radiating-aperture theory), or a
            vent panel/honeycomb with real depth (waveguide-below-cutoff), pairing EMC shielding with cooling
            vent design.
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
            <div className="card-title"><span><span className="step-num">1</span>Frequency</span></div>
            <div className="field">
              <label>Frequency (Hz)</label>
              <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={(e) => setFrequencyHz(Number(e.target.value))} />
              <span className="hint">{fmtHz(frequencyHz)}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Opening</span></div>
            <div className="segmented">
              <button className={mode === 'slot' ? 'active' : ''} onClick={() => setMode('slot')}>Thin slot / gap</button>
              <PremiumGate feature="Vent panel / honeycomb designer">
                <button className={mode === 'vent' ? 'active' : ''} onClick={() => setMode('vent')}>Vent panel (waveguide-below-cutoff)</button>
              </PremiumGate>
            </div>

            {mode === 'slot' ? (
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Max linear dimension ({unitLabel(unitSystem, UNIT_LENGTH)})
                  <InfoTooltip>The opening's longest dimension governs, not its area — a long thin slot leaks far more than a compact hole of the same area.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(slotMaxDimensionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setSlotMaxDimensionMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Hole shape</label>
                  <div className="segmented">
                    <button className={holeShape === 'round' ? 'active' : ''} onClick={() => setHoleShape('round')}>Round / hex</button>
                    <button className={holeShape === 'square' ? 'active' : ''} onClick={() => setHoleShape('square')}>Square</button>
                  </div>
                </div>
                <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
                  <div className="field">
                    <label>Hole size ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0.01} step={0.1} value={toDisplay(holeDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setHoleDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Panel thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(panelThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setPanelThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Hole count</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={holeCount} onChange={(e) => setHoleCount(Math.max(1, Math.round(Number(e.target.value))))} />
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      Panel area ({unitLabel(unitSystem, UNIT_AREA)})
                      <InfoTooltip>Optional — only used to report open-area % for airflow context.</InfoTooltip>
                    </label>
                    <input autoComplete="off" type="number" min={0} step={1} value={toDisplay(panelAreaMm2, unitSystem, UNIT_AREA)} onChange={(e) => setPanelAreaMm2(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA))} />
                  </div>
                </div>
                {cutoffMarginLow && (
                  <span className="hint" style={{ color: 'var(--warn)', display: 'block', marginTop: '0.4rem' }}>
                    ⚠ Operating frequency is within 3× of the hole's own cutoff frequency — waveguide-below-cutoff
                    theory weakens as frequency approaches cutoff. Use a smaller hole diameter for margin.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Shielding effectiveness</div>
                <div className="value">{fmt(totalSeDb, 1)}<span className="unit">dB</span></div>
                {mode === 'slot' && slotResult.atOrBeyondHalfWavelength && (
                  <div className="hint" style={{ color: 'var(--warn)' }}>⚠ opening ≥ λ/2 — resonant slot antenna, no shielding</div>
                )}
              </div>
              {mode === 'vent' && (
                <>
                  <div className="result-tile">
                    <div className="label">Per-hole attenuation</div>
                    <div className="value">{fmt(ventResult.perHoleAttenuationDb, 2)}<span className="unit">dB</span></div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Array reduction (N={holeCount})</div>
                    <div className="value">−{fmt(ventResult.arrayReductionDb, 2)}<span className="unit">dB</span></div>
                  </div>
                  {ventResult.openAreaPercent != null && (
                    <div className="result-tile">
                      <div className="label">Open area</div>
                      <div className="value">{fmt(ventResult.openAreaPercent, 2)}<span className="unit">%</span></div>
                      <div className="hint">for airflow context</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/aperture-shielding" />
        <p className="note">
          Two distinct models, from the Acorn EMC Design Guidelines (Gibling, 1993), a standard EMC-course-style
          reference: a thin slot/gap (negligible depth) radiates like a slot antenna,
          SE = 20·log₁₀(λ/(2·d)) — d is the opening's <em>maximum linear dimension</em>, not its area, and SE
          reaches 0dB once d equals half a wavelength. A vent panel or honeycomb with real depth is instead
          modelled as an array of short waveguide-below-cutoff sections — each hole attenuates by
          k·(t/D) dB (k=32 round/hex, 27.3 square), and N close-packed holes lose a further 10·log₁₀(N) dB
          versus a single hole, per the same source. This tool deliberately does not implement the source's
          more granular hole-spacing (centre-to-centre distance C) formula — the scanned original was
          internally inconsistent about which terms carry a squared exponent, so the unambiguous hole-count
          form (stated clearly in the source's prose as "proportional to the square root of N") is used
          instead. Neither model covers gasket/seam contact impedance, which depends on the specific gasket
          material and compression and needs manufacturer data. A real enclosure's achievable shielding is
          normally set by whichever opening is weakest — pair this with the Shielding Effectiveness calculator
          for the solid-barrier number, and the Enclosure Cavity Resonance calculator for resonance effects.
        </p>
        <p className="note">
          <b>Validated:</b> the slot/gap formula reproduces the primary source's own published Table 2
          (max slot length for 20dB shielding at 30/100/300/500/1000MHz — 457/152/51/30/15mm) to within
          0.8dB of 20dB at every point; SE is exactly 0dB at and beyond d=λ/2. The vent-panel formula
          reproduces an independently-sourced worked example (6mm-diameter round hole, 20mm depth →
          106.67dB) exactly, and the array-reduction term was checked to give exactly 10·log₁₀(4)=6.02dB
          less shielding for 4 holes versus 1 (matching "proportional to √N"). The cutoff-frequency formula
          fc=c/(1.706·D) was checked against the independently-published circular-waveguide TE11 result.
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
