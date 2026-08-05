import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH } from '../lib/globalUnits';
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
import { SKIN_DEPTH_MATERIALS, getSkinDepthMaterial } from '../lib/skinDepthPhysics';
import { solveShieldingEffectiveness, sweepFrequency, type SourceType } from '../lib/shieldingEffectivenessPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtHz(hz: number): string {
  if (hz >= 1e9) return `${fmt(hz / 1e9, 2)} GHz`;
  if (hz >= 1e6) return `${fmt(hz / 1e6, 2)} MHz`;
  if (hz >= 1e3) return `${fmt(hz / 1e3, 2)} kHz`;
  return `${fmt(hz, 1)} Hz`;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  planeWave: 'Plane wave (far field)',
  electricNearField: 'Electric dipole (near field)',
  magneticNearField: 'Magnetic dipole (near field)',
};

const SWEEP_FREQS_HZ = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];

export default function ShieldingEffectivenessCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();

  const [materialId, setMaterialId] = useState('copper');
  const preset = getSkinDepthMaterial(materialId);
  const [rho20, setRho20] = useState(preset.rho20OhmMm2PerM);
  const [muR, setMuR] = useState(preset.muR);
  const handleMaterialChange = (id: string) => {
    setMaterialId(id);
    const p = getSkinDepthMaterial(id);
    setRho20(p.rho20OhmMm2PerM);
    setMuR(p.muR);
  };

  const [thicknessMm, setThicknessMm] = useState(1);
  const [frequencyHz, setFrequencyHz] = useState(1e6);

  const [sourceType, setSourceType] = useState<SourceType>('planeWave');
  const [distanceMm, setDistanceMm] = useState(100);

  // Safety net: bail out of a near-field source type (premium) and back to the free
  // plane-wave case if entitlement lapses mid-session, or a `?share=`/old save carries a
  // premium user's mode — mirrors HeatsinkThermalCalculator's mode safety-net useEffect.
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setSourceType((prev) => (prev === 'planeWave' ? prev : 'planeWave'));
    if (materialId === 'custom') handleMaterialChange('copper');
  }, [isPremium, entitlementLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const getInputs = useCallback((): Record<string, unknown> => ({
    materialId, rho20, muR, thicknessMm, frequencyHz, sourceType, distanceMm,
  }), [materialId, rho20, muR, thicknessMm, frequencyHz, sourceType, distanceMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.materialId != null) { setMaterialId(v.materialId); const p = getSkinDepthMaterial(v.materialId); setRho20(p.rho20OhmMm2PerM); setMuR(p.muR); }
    if (v.rho20 != null) setRho20(v.rho20);
    if (v.muR != null) setMuR(v.muR);
    if (v.thicknessMm != null) setThicknessMm(v.thicknessMm);
    if (v.frequencyHz != null) setFrequencyHz(v.frequencyHz);
    if (v.sourceType != null) setSourceType(v.sourceType);
    if (v.distanceMm != null) setDistanceMm(v.distanceMm);
  }, []);

  const saved = useSavedCalculations('shielding-effectiveness');
  const shareLink = useShareableLink(restoreInputs);

  const result = useMemo(
    () => solveShieldingEffectiveness({ thicknessMm, frequencyHz, rhoOhmMm2PerM: rho20, muR, sourceType, distanceMm }),
    [thicknessMm, frequencyHz, rho20, muR, sourceType, distanceMm],
  );

  const sweep = useMemo(
    () => SWEEP_FREQS_HZ.map((f) => ({
      frequencyHz: f,
      totalSeDb: solveShieldingEffectiveness({ thicknessMm, frequencyHz: f, rhoOhmMm2PerM: rho20, muR, sourceType, distanceMm }).totalSeDb,
    })),
    [thicknessMm, rho20, muR, sourceType, distanceMm],
  );
  void sweepFrequency; // exported for reuse by other calculators (e.g. a future combined enclosure view)

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Skin depth & absorption loss',
      formula: 'δ = √(ρ / (π·f·µ₀·µr));  A = 8.686·(t/δ)',
      substitution: `${getSkinDepthMaterial(materialId).name}: ρ = ${fmt(rho20, 4)} Ω·mm²/m, µr = ${fmt(muR, 2)}, f = ${fmtHz(frequencyHz)}, t = ${fmt(thicknessMm, 3)} mm`,
      result: `δ = ${fmt(result.skinDepthMmValue, 4)} mm → A = ${fmt(result.absorptionLossDb, 2)} dB`,
    },
    {
      title: 'Shield intrinsic impedance',
      formula: '|Zs| = √(ωµ / σ)',
      substitution: `ω = 2π·f, µ = µ₀·µr, σ = 1/ρ`,
      result: `|Zs| = ${result.shieldImpedanceOhm.toExponential(3)} Ω`,
    },
    {
      title: 'Wave impedance of the source field',
      formula: sourceType === 'planeWave'
        ? 'Zw = 377 Ω (far-field plane wave)'
        : sourceType === 'electricNearField'
          ? 'Zw = 1 / (2π·f·ε₀·r)  (high-impedance electric-dipole source)'
          : 'Zw = 2π·f·µ₀·r  (low-impedance magnetic-dipole source)',
      substitution: sourceType === 'planeWave' ? '' : `f = ${fmtHz(frequencyHz)}, r = ${fmt(distanceMm, 1)} mm`,
      result: `Zw = ${fmt(result.waveImpedanceOhm, 2)} Ω`,
    },
    {
      title: 'Reflection loss & multiple-reflection correction',
      formula: 'R = max(0, 20·log₁₀(Zw / (4·|Zs|)));  B = min(0, 10·log₁₀((1−x·cosθ)² + (x·sinθ)²)), x=10^(−A/10), θ=0.23026·A',
      substitution: '',
      result: `R = ${fmt(result.reflectionLossDb, 2)} dB, B = ${fmt(result.multiReflectionCorrectionDb, 3)} dB`,
    },
    {
      title: 'Total shielding effectiveness',
      formula: 'SE = A + R + B',
      substitution: '',
      result: `SE = ${fmt(result.totalSeDb, 1)} dB`,
    },
  ], [materialId, rho20, muR, frequencyHz, thicknessMm, result, sourceType, distanceMm]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Material', value: getSkinDepthMaterial(materialId).name },
      { label: 'Resistivity', value: `${fmt(rho20, 4)} Ω·mm²/m` },
      { label: 'Relative permeability µr', value: fmt(muR, 3) },
      { label: 'Thickness', value: `${fmtU(thicknessMm)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Frequency', value: fmtHz(frequencyHz) },
      { label: 'Source type', value: SOURCE_LABELS[sourceType] },
    ];
    if (sourceType !== 'planeWave') rows.push({ label: 'Distance from source', value: `${fmtU(distanceMm)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
    return [{ heading: 'Inputs', rows }];
    function fmtU(mm: number) { return fmt(toDisplay(mm, unitSystem, UNIT_LENGTH), 3); }
  }, [materialId, rho20, muR, thicknessMm, frequencyHz, sourceType, distanceMm, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Absorption loss (A)', value: `${fmt(result.absorptionLossDb, 2)} dB` },
      { label: 'Reflection loss (R)', value: `${fmt(result.reflectionLossDb, 2)} dB` },
      { label: 'Multiple-reflection correction (B)', value: `${fmt(result.multiReflectionCorrectionDb, 3)} dB` },
      { label: 'Total shielding effectiveness (SE)', value: `${fmt(result.totalSeDb, 1)} dB` },
    ],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Shielding_Effectiveness_Calculator',
      pageTitle: 'EMC Shielding Effectiveness Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Classical Schelkunoff shielding-effectiveness theory for a solid, uninterrupted planar barrier (SE = A + R + B). Does not account for apertures, seams, or cable penetrations — in a real enclosure these almost always limit the achievable shielding far below what a solid barrier alone would suggest (see this project\'s Aperture & Vent Leakage calculator). The multiple-reflection correction B can become numerically extreme for barriers far thinner than the skin depth (A well under 1dB) — a known limitation of this classical closed-form model, not a literal physical prediction; treat any resulting negative total SE as "no meaningful shielding" rather than a precise figure. Near-field formulas assume an idealized electric- or magnetic-dipole source at a single distance r; a real source is usually a mix of both.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Shielding Effectiveness Calculator</div>
          <h1>EMC Shielding Effectiveness Calculator</h1>
          <p>
            Classical Schelkunoff shielding effectiveness (SE = absorption + reflection + multiple-reflection
            correction) for a solid metal barrier — far-field plane wave, or near-field electric-/magnetic-dipole
            source at a given distance.
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
            <div className="card-title"><span><span className="step-num">1</span>Barrier material &amp; thickness</span></div>
            <div className="field">
              <label>Material</label>
              <select value={materialId} onChange={(e) => {
                if (e.target.value === 'custom' && !isPremium) return;
                handleMaterialChange(e.target.value);
              }}>
                {SKIN_DEPTH_MATERIALS.filter((m) => m.id !== 'custom').map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <span className="hint">{preset.sourced ? preset.notes : `⚠ ${preset.notes}`}</span>
            </div>
            <PremiumGate feature="Custom shield material">
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <button className={materialId === 'custom' ? 'active' : ''} onClick={() => handleMaterialChange('custom')}>Use custom material</button>
                {materialId === 'custom' && (
                  <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Resistivity
                        <InfoTooltip>Ω·mm²/m — copper is 0.0172.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step={0.0001} value={rho20} onChange={(e) => setRho20(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Relative permeability µr</label>
                      <input autoComplete="off" type="number" min={0.000001} step={0.01} value={muR} onChange={(e) => setMuR(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>
            </PremiumGate>
            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label>Thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
              <input autoComplete="off" type="number" min={0.001} step={0.01} value={toDisplay(thicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Frequency &amp; source</span></div>
            <div className="field">
              <label>Frequency (Hz)</label>
              <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={(e) => setFrequencyHz(Number(e.target.value))} />
              <span className="hint">{fmtHz(frequencyHz)}</span>
            </div>
            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label>Source field type</label>
              <div className="segmented">
                <button className={sourceType === 'planeWave' ? 'active' : ''} onClick={() => setSourceType('planeWave')}>Plane wave (far field)</button>
                <PremiumGate feature="Near-field source types">
                  <button className={sourceType === 'electricNearField' ? 'active' : ''} onClick={() => setSourceType('electricNearField')}>Electric dipole (near field)</button>
                </PremiumGate>
                <PremiumGate feature="Near-field source types">
                  <button className={sourceType === 'magneticNearField' ? 'active' : ''} onClick={() => setSourceType('magneticNearField')}>Magnetic dipole (near field)</button>
                </PremiumGate>
              </div>
              <span className="hint">
                Far field (plane wave) applies once the shield is roughly a wavelength or more from the source.
                Closer in, use electric dipole for a high-voltage/low-current source (e.g. a PCB trace) or magnetic
                dipole for a low-voltage/high-current source (e.g. a current loop or busbar).
              </span>
            </div>
            {sourceType !== 'planeWave' && (
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <label>Distance from source ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0.1} step={1} value={toDisplay(distanceMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDistanceMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
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
                <div className="label">Total shielding effectiveness</div>
                <div className="value">{fmt(result.totalSeDb, 1)}<span className="unit">dB</span></div>
                {result.thinBarrierWarning && (
                  <div className="hint" style={{ color: 'var(--warn)' }}>⚠ thin/high-frequency regime — multiple-reflection correction is significant</div>
                )}
              </div>
              <div className="result-tile">
                <div className="label">Absorption loss (A)</div>
                <div className="value">{fmt(result.absorptionLossDb, 2)}<span className="unit">dB</span></div>
                <div className="hint">δ = {fmt(result.skinDepthMmValue, 4)} mm</div>
              </div>
              <div className="result-tile">
                <div className="label">Reflection loss (R)</div>
                <div className="value">{fmt(result.reflectionLossDb, 2)}<span className="unit">dB</span></div>
                <div className="hint">Zw = {fmt(result.waveImpedanceOhm, 1)} Ω, |Zs| = {result.shieldImpedanceOhm.toExponential(2)} Ω</div>
              </div>
              <div className="result-tile">
                <div className="label">Multi-reflection correction (B)</div>
                <div className="value">{fmt(result.multiReflectionCorrectionDb, 3)}<span className="unit">dB</span></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">SE vs. frequency</div>
            <PremiumGate feature="Frequency sweep">
              <table className="data-table">
                <thead><tr><th>Frequency</th><th>SE (dB)</th></tr></thead>
                <tbody>
                  {sweep.map((p) => (
                    <tr key={p.frequencyHz}>
                      <td>{fmtHz(p.frequencyHz)}</td>
                      <td>{fmt(p.totalSeDb, 1)}</td>
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
        <GuideBacklink calculatorPath="/shielding-effectiveness" />
        <p className="note">
          Classical Schelkunoff decomposition SE = A + R + B for a solid, uninterrupted planar barrier.
          Absorption loss A = 8.686·(t/δ) reuses this site's Skin Depth Calculator's classical skin-depth
          formula directly. Reflection loss R = 20·log₁₀(Zw/(4·|Zs|)) compares the source field's wave
          impedance Zw against the shield's own intrinsic impedance |Zs| = √(ωµ/σ) — 377Ω for a far-field
          plane wave, or a distance- and frequency-dependent value for a near-field electric-dipole
          (high-impedance) or magnetic-dipole (low-impedance) source. The multiple-reflection correction B
          only matters for thin/high-frequency barriers (A below roughly 15dB) and is otherwise negligible.
          This model covers a solid barrier only — real enclosures are almost always limited by apertures,
          seams, and cable penetrations rather than the solid wall (see the companion Aperture &amp; Vent
          Leakage calculator), and by cavity resonance at specific frequencies (see the Enclosure Cavity
          Resonance calculator).
        </p>
        <p className="note">
          <b>Validated:</b> cross-checked the reflection/absorption/multiple-reflection formulas against two
          independent sources (calcengineer.com's explicit-unit Zw/Zs formulation and learnemc.com's
          Ott/Schelkunoff textbook equations) — both reduce to the same expressions once reconciled. Verified
          numerically: 1mm copper at 1MHz (plane wave) gives A=131.6dB, R=108.2dB matching hand calculation
          exactly; the near-field electric- and magnetic-dipole wave-impedance formulas satisfy the required
          physical identity Zw(E)·Zw(H) = Z₀² at every frequency/distance, and both converge to the 377Ω
          far-field impedance at the classical near-field/far-field boundary r = λ/(2π).
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
