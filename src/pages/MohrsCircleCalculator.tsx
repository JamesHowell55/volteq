import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_STRESS } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import MohrsCircleDiagram from '../components/MohrsCircleDiagram';
import { solveMohrsCircle, transformStress, type StressState2D } from '../lib/mohrsCirclePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  const v = n === 0 ? 0 : n; // normalise -0 -> 0
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

export default function MohrsCircleCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const stressUnit = unitLabel(unitSystem, UNIT_STRESS);
  const fmtStress = useCallback((mpa: number) => `${fmtU(mpa, unitSystem, UNIT_STRESS, 1)} ${stressUnit}`, [unitSystem, stressUnit]);

  // --- inputs (stresses stored in SI MPa; angle in degrees) ---
  const [sigmaXMPa, setSigmaXMPa] = useState(90);
  const [sigmaYMPa, setSigmaYMPa] = useState(20);
  const [tauXYMPa, setTauXYMPa] = useState(60);
  const [rotationDeg, setRotationDeg] = useState(30);

  const state: StressState2D = useMemo(() => ({ sigmaXMPa, sigmaYMPa, tauXYMPa }), [sigmaXMPa, sigmaYMPa, tauXYMPa]);
  const result = useMemo(() => solveMohrsCircle(state), [state]);
  const transformed = useMemo(() => transformStress(state, rotationDeg), [state, rotationDeg]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    sigmaXMPa, sigmaYMPa, tauXYMPa, rotationDeg,
  }), [sigmaXMPa, sigmaYMPa, tauXYMPa, rotationDeg]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.sigmaXMPa != null) setSigmaXMPa(v.sigmaXMPa);
    if (v.sigmaYMPa != null) setSigmaYMPa(v.sigmaYMPa);
    if (v.tauXYMPa != null) setTauXYMPa(v.tauXYMPa);
    if (v.rotationDeg != null) setRotationDeg(v.rotationDeg);
  }, []);

  const saved = useSavedCalculations('mohrs-circle');

  const sameSign = result.sigma1MPa * result.sigma2MPa > 0;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    steps.push({
      title: 'Circle centre and radius',
      formula: 'σavg = (σx + σy)/2,  R = √[ ((σx − σy)/2)² + τxy² ]',
      substitution: `σx = ${fmt(sigmaXMPa, 1)}, σy = ${fmt(sigmaYMPa, 1)}, τxy = ${fmt(tauXYMPa, 1)} MPa`,
      result: `σavg = ${fmt(result.centerMPa, 2)} MPa, R = ${fmt(result.radiusMPa, 2)} MPa`,
    });
    steps.push({
      title: 'Principal stresses',
      formula: 'σ1 = σavg + R,  σ2 = σavg − R  (σ3 = 0 for plane stress)',
      substitution: `σavg = ${fmt(result.centerMPa, 2)} MPa, R = ${fmt(result.radiusMPa, 2)} MPa`,
      result: `σ1 = ${fmt(result.sigma1MPa, 2)} MPa, σ2 = ${fmt(result.sigma2MPa, 2)} MPa`,
    });
    steps.push({
      title: 'Principal orientation',
      formula: 'θp = ½·atan2(2τxy, σx − σy)  (CCW from x-axis to the σ1 plane)',
      substitution: `2τxy = ${fmt(2 * tauXYMPa, 1)}, σx − σy = ${fmt(sigmaXMPa - sigmaYMPa, 1)} MPa`,
      result: `θp1 = ${fmt(result.thetaP1Deg, 2)}° (σ1), θp2 = ${fmt(result.thetaP2Deg, 2)}° (σ2)`,
    });
    steps.push({
      title: 'Maximum shear stress',
      formula: 'τmax(in-plane) = R;  τabs,max = (σmax − σmin)/2 over {σ1, σ2, 0}',
      substitution: `σ1 = ${fmt(result.sigma1MPa, 2)}, σ2 = ${fmt(result.sigma2MPa, 2)}, σ3 = 0 MPa`,
      result: `τmax(in-plane) = ${fmt(result.maxShearInPlaneMPa, 2)} MPa at θs = ${fmt(result.thetaSDeg, 2)}° (σ = σavg = ${fmt(result.normalAtMaxShearMPa, 2)} MPa)${sameSign ? `; τabs,max = ${fmt(result.absMaxShearMPa, 2)} MPa is OUT-OF-PLANE (σ1, σ2 same sign)` : `; τabs,max = ${fmt(result.absMaxShearMPa, 2)} MPa (= in-plane)`}`,
    });
    steps.push({
      title: `Stress transformation at θ = ${fmt(rotationDeg, 1)}°`,
      formula: "σx' = σavg + (σx−σy)/2·cos2θ + τxy·sin2θ;  τx'y' = −(σx−σy)/2·sin2θ + τxy·cos2θ",
      substitution: `θ = ${fmt(rotationDeg, 1)}° (CCW)`,
      result: `σx' = ${fmt(transformed.sigmaXpMPa, 2)}, σy' = ${fmt(transformed.sigmaYpMPa, 2)}, τx'y' = ${fmt(transformed.tauXpYpMPa, 2)} MPa`,
    });
    steps.push({
      title: 'Equivalent stresses',
      formula: 'von Mises = √(σ1² − σ1σ2 + σ2²);  Tresca = 2·τabs,max = σmax − σmin',
      substitution: `σ1 = ${fmt(result.sigma1MPa, 2)}, σ2 = ${fmt(result.sigma2MPa, 2)} MPa`,
      result: `σ_vM = ${fmt(result.vonMisesMPa, 2)} MPa, σ_Tresca = ${fmt(result.trescaMPa, 2)} MPa`,
    });
    return steps;
  }, [sigmaXMPa, sigmaYMPa, tauXYMPa, rotationDeg, result, transformed, sameSign]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: `Normal stress σx (${stressUnit})`, value: fmtU(sigmaXMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `Normal stress σy (${stressUnit})`, value: fmtU(sigmaYMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `Shear stress τxy (${stressUnit})`, value: fmtU(tauXYMPa, unitSystem, UNIT_STRESS, 2) },
      { label: 'Rotation angle θ', value: `${fmt(rotationDeg, 2)}°` },
    ];
    return [{ heading: 'Applied 2-D stress state', rows }];
  }, [sigmaXMPa, sigmaYMPa, tauXYMPa, rotationDeg, unitSystem, stressUnit]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: `Max principal σ1 (${stressUnit})`, value: fmtU(result.sigma1MPa, unitSystem, UNIT_STRESS, 2) },
      { label: `Min principal σ2 (${stressUnit})`, value: fmtU(result.sigma2MPa, unitSystem, UNIT_STRESS, 2) },
      { label: `Mean stress σavg (${stressUnit})`, value: fmtU(result.centerMPa, unitSystem, UNIT_STRESS, 2) },
      { label: 'Principal angle θp1 (to σ1)', value: `${fmt(result.thetaP1Deg, 2)}°` },
      { label: 'Principal angle θp2 (to σ2)', value: `${fmt(result.thetaP2Deg, 2)}°` },
      { label: `Max in-plane shear τmax (${stressUnit})`, value: fmtU(result.maxShearInPlaneMPa, unitSystem, UNIT_STRESS, 2) },
      { label: 'Max-shear plane angle θs', value: `${fmt(result.thetaSDeg, 2)}°` },
      { label: `Absolute max shear (3-D) (${stressUnit})`, value: fmtU(result.absMaxShearMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `von Mises equivalent (${stressUnit})`, value: fmtU(result.vonMisesMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `Tresca equivalent (${stressUnit})`, value: fmtU(result.trescaMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `σx' at θ=${fmt(rotationDeg, 1)}° (${stressUnit})`, value: fmtU(transformed.sigmaXpMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `σy' at θ=${fmt(rotationDeg, 1)}° (${stressUnit})`, value: fmtU(transformed.sigmaYpMPa, unitSystem, UNIT_STRESS, 2) },
      { label: `τx'y' at θ=${fmt(rotationDeg, 1)}° (${stressUnit})`, value: fmtU(transformed.tauXpYpMPa, unitSystem, UNIT_STRESS, 2) },
    ];
    return [{ heading: 'Results', rows }];
  }, [result, transformed, rotationDeg, unitSystem, stressUnit]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Mohrs_Circle_Calculator',
      pageTitle: "Mohr's Circle Stress Calculator",
      accentHex,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        "Plane-stress (2-D) transformation and Mohr's circle from the standard stress-transformation equations. " +
        'Sign convention: tension positive; τxy positive on the +x face acting in +y; rotation angle θ positive counter-clockwise. ' +
        'Principal stresses σ1,2 = σavg ± R with σavg = (σx+σy)/2 and R = √[((σx−σy)/2)²+τxy²]; the principal orientation is θp = ½·atan2(2τxy, σx−σy). ' +
        'The maximum in-plane shear equals R and acts on planes 45° from the principal planes; the reported absolute maximum shear also considers the zero out-of-plane principal stress (σ3 = 0), which governs when σ1 and σ2 share the same sign. ' +
        'von Mises uses the plane-stress form √(σ1²−σ1σ2+σ2²) and Tresca is σmax−σmin over {σ1,σ2,0}. ' +
        'Assumes a linear-elastic, homogeneous material in a state of plane stress (σz = τxz = τyz = 0); it does not account for plane strain, three-dimensional loading beyond the zero third principal, stress concentrations, or material yielding. Use the equivalent stresses with the appropriate material allowable for a yield check.',
      ...branding,
    });
  };

  const tiles = [
    { label: 'σ1 (max principal)', value: fmtU(result.sigma1MPa, unitSystem, UNIT_STRESS, 1), unit: stressUnit, cls: 'accent' },
    { label: 'σ2 (min principal)', value: fmtU(result.sigma2MPa, unitSystem, UNIT_STRESS, 1), unit: stressUnit, cls: 'accent' },
    { label: 'τmax (in-plane)', value: fmtU(result.maxShearInPlaneMPa, unitSystem, UNIT_STRESS, 1), unit: stressUnit, cls: '' },
    { label: 'θp (to σ1)', value: fmt(result.thetaP1Deg, 2), unit: '°', cls: '' },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Mohr's Circle Calculator</div>
          <h1>Mohr's Circle Stress Calculator</h1>
          <p>
            Enter a 2-D (plane) stress state — normal stresses σx, σy and shear τxy — to get the principal
            stresses, maximum shear, and their orientations, with the transformed stresses on any rotated
            plane and a to-scale Mohr's circle showing the whole geometry.
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
                <span className="step-num">1</span>Stress state
                <InfoTooltip>The three components of a 2-D (plane) stress state at a point. Tension is positive. τxy is the shear on the x-face acting along +y (the complementary shear on the y-face is equal). These are the stresses resolved on the x/y faces of your element — Mohr's circle then gives them on any other plane.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Normal stress σx ({stressUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(sigmaXMPa, unitSystem, UNIT_STRESS)} onChange={(e) => setSigmaXMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                <span className="hint">Tension +, compression −.</span>
              </div>
              <div className="field">
                <label>Normal stress σy ({stressUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(sigmaYMPa, unitSystem, UNIT_STRESS)} onChange={(e) => setSigmaYMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                <span className="hint">Tension +, compression −.</span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Shear stress τxy ({stressUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(tauXYMPa, unitSystem, UNIT_STRESS)} onChange={(e) => setTauXYMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                <span className="hint">+x face acting in +y (right-hand convention).</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Plane rotation
                <InfoTooltip>Rotate the element (its axes) counter-clockwise by θ to read the normal and shear stresses on the rotated faces — the X′ point on the circle. Set θ = θp to land on the principal plane (τ → 0), or θ = θs for the maximum-shear plane. This does not change the circle, only which point on it you are reading.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Rotation angle θ (° CCW)</label>
              <input autoComplete="off" type="number" value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value))} />
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                <button className="btn ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setRotationDeg(Number(result.thetaP1Deg.toFixed(2)))}>Snap to θp (σ1)</button>
                <button className="btn ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setRotationDeg(Number(result.thetaSDeg.toFixed(2)))}>Snap to θs (τmax)</button>
                <button className="btn ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setRotationDeg(0)}>Reset 0°</button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Principal &amp; shear results</div>
            <div className="result-grid">
              {tiles.map((t) => (
                <div className="result-tile" key={t.label}>
                  <div className="label">{t.label}</div>
                  <div className="value">{t.value}<span className="unit">{t.unit}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Mohr's circle</div>
            <MohrsCircleDiagram state={state} result={result} rotationDeg={rotationDeg} transformed={transformed} fmtStress={fmtStress} stressUnit={stressUnit} />
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Principal &amp; maximum shear
                <InfoTooltip>Principal stresses are the extreme normal stresses (where shear vanishes); the maximum in-plane shear is the circle radius and acts 45° from the principal planes, carrying a normal stress equal to σavg. The absolute maximum shear also accounts for the zero out-of-plane principal (σ3 = 0) and governs when σ1 and σ2 have the same sign.</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <tbody>
                <tr><td>Max principal σ1</td><td><b>{fmtU(result.sigma1MPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</b></td></tr>
                <tr><td>Min principal σ2</td><td><b>{fmtU(result.sigma2MPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</b></td></tr>
                <tr><td>Mean stress σavg (centre)</td><td>{fmtU(result.centerMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr><td>Principal angle θp1 / θp2</td><td>{fmt(result.thetaP1Deg, 2)}° / {fmt(result.thetaP2Deg, 2)}°</td></tr>
                <tr><td>Max in-plane shear τmax</td><td>{fmtU(result.maxShearInPlaneMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr><td>Max-shear plane angle θs</td><td>{fmt(result.thetaSDeg, 2)}°</td></tr>
                <tr><td>Normal stress at τmax</td><td>{fmtU(result.normalAtMaxShearMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr>
                  <td>Absolute max shear (3-D)</td>
                  <td>{fmtU(result.absMaxShearMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}{sameSign ? ' *' : ''}</td>
                </tr>
              </tbody>
            </table>
            {sameSign && <span className="hint">* σ1 and σ2 have the same sign, so the governing shear is out-of-plane (through σ3 = 0) and exceeds the in-plane τmax.</span>}
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Stresses on the rotated plane (θ = {fmt(rotationDeg, 1)}°)
                <InfoTooltip>The normal and shear stresses on the element after rotating its axes counter-clockwise by θ — i.e. the X′/Y′ points on the circle. Note σx′ + σy′ = σx + σy always (the first stress invariant).</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <tbody>
                <tr><td>σx′ (rotated x-face)</td><td>{fmtU(transformed.sigmaXpMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr><td>σy′ (rotated y-face)</td><td>{fmtU(transformed.sigmaYpMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr><td>τx′y′ (rotated shear)</td><td>{fmtU(transformed.tauXpYpMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Failure-criterion equivalents
                <InfoTooltip>Single-number equivalent stresses for comparing against a uniaxial material allowable. von Mises (distortion-energy) suits ductile metals; Tresca (maximum-shear) is more conservative. Both use the full principal set including σ3 = 0.</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <tbody>
                <tr><td>von Mises equivalent</td><td>{fmtU(result.vonMisesMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
                <tr><td>Tresca equivalent</td><td>{fmtU(result.trescaMPa, unitSystem, UNIT_STRESS, 2)} {stressUnit}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          This tool applies the standard plane-stress transformation equations and their Mohr's-circle
          construction (Gere &amp; Goodno, <i>Mechanics of Materials</i>; Hibbeler, <i>Mechanics of Materials</i>, Ch. 9).
          Sign convention: normal stress tension-positive; τxy positive on the +x face acting in the +y direction;
          the rotation angle θ positive counter-clockwise (the transformed x′ face is the x face rotated CCW by θ).
          The circle centre is σavg = (σx + σy)/2 and its radius is R = √[((σx − σy)/2)² + τxy²]; the principal
          stresses are σ1,2 = σavg ± R and the principal orientation is θp = ½·atan2(2τxy, σx − σy), with the σ1
          and σ2 planes 90° apart. The maximum in-plane shear equals R and acts on planes 45° from the principal
          planes, where the normal stress is σavg. Because this is a plane-stress state the third principal stress
          is zero; the <i>absolute</i> maximum shear is taken over the full set {'{'}σ1, σ2, 0{'}'} and therefore
          exceeds the in-plane value whenever σ1 and σ2 share the same sign (the governing shear plane is then
          out-of-plane). The von Mises equivalent uses the plane-stress form √(σ1² − σ1σ2 + σ2²) and the Tresca
          equivalent is σmax − σmin over the same principal set. On the diagram the horizontal axis is normal stress
          (tension right) and the vertical axis is shear (positive up); the x-face is plotted at (σx, τxy) and the
          y-face at (σy, −τxy). Idealisations: a linear-elastic, homogeneous, isotropic material in true plane
          stress (σz = τxz = τyz = 0); no stress concentrations, plane-strain effects, or fully three-dimensional
          stress states beyond the zero third principal, and no yielding. Use the equivalent stresses together with
          the relevant material allowable and factor of safety for a strength check.
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
