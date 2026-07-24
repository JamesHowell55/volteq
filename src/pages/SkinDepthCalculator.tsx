import { useCallback, useMemo, useState } from 'react';
import SkinDepthCrossSection from '../components/SkinDepthCrossSection';
import SavedCalculations from '../components/SavedCalculations';
import InfoTooltip from '../components/InfoTooltip';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_AREA, UNIT_TEMP } from '../lib/globalUnits';
import { deriveAccentOnLight } from '../lib/theme';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportDiagram } from '../lib/pdfExport';
import { renderSkinDepthCrossSectionSvg } from '../lib/pdfDiagrams';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import {
  SKIN_DEPTH_MATERIALS,
  getSkinDepthMaterial,
  resistivityAtOhmMm2PerM,
  skinDepthMm,
  effectiveAnnularAreaMm2,
} from '../lib/skinDepthPhysics';
import { fundamentalElectricalFreqHz } from '../lib/chokePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '∞';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type FrequencySource = 'direct' | 'motor';

export default function SkinDepthCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [materialId, setMaterialId] = useState('copper');
  const preset = getSkinDepthMaterial(materialId);
  const [rho20, setRho20] = useState(preset.rho20OhmMm2PerM);
  const [beta, setBeta] = useState(preset.beta);
  const [muR, setMuR] = useState(preset.muR);
  const handleMaterialChange = (id: string) => {
    setMaterialId(id);
    const p = getSkinDepthMaterial(id);
    setRho20(p.rho20OhmMm2PerM);
    setBeta(p.beta);
    setMuR(p.muR);
  };
  const [tempC, setTempC] = useState(20);

  const [frequencySource, setFrequencySource] = useState<FrequencySource>('direct');
  const [directFrequencyHz, setDirectFrequencyHz] = useState(50);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(6000);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const motorFrequencyHz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);
  const frequencyHz = frequencySource === 'direct' ? directFrequencyHz : motorFrequencyHz;

  const [conductorDiameterMm, setConductorDiameterMm] = useState<number | ''>('');

  const getInputs = useCallback((): Record<string, unknown> => ({
    materialId, rho20, beta, muR, tempC, frequencySource, directFrequencyHz,
    motorSpeedRpm, motorPolePairs, conductorDiameterMm,
  }), [materialId, rho20, beta, muR, tempC, frequencySource, directFrequencyHz, motorSpeedRpm, motorPolePairs, conductorDiameterMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.materialId) { setMaterialId(v.materialId); const p = getSkinDepthMaterial(v.materialId); setRho20(p.rho20OhmMm2PerM); setBeta(p.beta); setMuR(p.muR); }
    if (v.rho20 != null) setRho20(v.rho20);
    if (v.beta != null) setBeta(v.beta);
    if (v.muR != null) setMuR(v.muR);
    if (v.tempC != null) setTempC(v.tempC);
    if (v.frequencySource) setFrequencySource(v.frequencySource);
    if (v.directFrequencyHz != null) setDirectFrequencyHz(v.directFrequencyHz);
    if (v.motorSpeedRpm != null) setMotorSpeedRpm(v.motorSpeedRpm);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
    if (v.conductorDiameterMm != null) setConductorDiameterMm(v.conductorDiameterMm);
  }, []);

  const saved = useSavedCalculations('skin-depth');

  const rhoAtTemp = useMemo(() => resistivityAtOhmMm2PerM(rho20, beta, tempC), [rho20, beta, tempC]);
  const skinDepthMmValue = useMemo(() => skinDepthMm(rhoAtTemp, frequencyHz, muR), [rhoAtTemp, frequencyHz, muR]);

  const hasConductorSize = conductorDiameterMm !== '' && conductorDiameterMm > 0;
  const radiusMm = hasConductorSize ? (conductorDiameterMm as number) / 2 : Math.max(isFinite(skinDepthMmValue) ? skinDepthMmValue * 3 : 10, 3);
  const effectiveAreaMm2 = hasConductorSize ? effectiveAnnularAreaMm2(radiusMm, skinDepthMmValue) : null;
  const fullAreaMm2 = hasConductorSize ? Math.PI * radiusMm * radiusMm : null;
  const areaUtilizationPercent = effectiveAreaMm2 !== null && fullAreaMm2 !== null ? (effectiveAreaMm2 / fullAreaMm2) * 100 : null;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const stepsOut: CalcStepData[] = [
      {
        title: 'Resistivity at operating temperature',
        formula: 'ρ(θ) = ρ₂₀ · (β + θ) / (β + 20)',
        substitution: `${getSkinDepthMaterial(materialId).name}: ρ₂₀ = ${fmt(rho20, 4)} Ω·mm²/m, β = ${fmt(beta, 0)}°C, θ = ${fmt(tempC, 0)}°C`,
        result: `ρ(θ) = ${fmt(rhoAtTemp, 4)} Ω·mm²/m = ${(rhoAtTemp * 1e-6).toExponential(3)} Ω·m`,
      },
    ];
    if (frequencySource === 'motor') {
      stepsOut.push({
        title: 'Fundamental electrical frequency from motor speed',
        formula: 'f = (speed / 60) × pole pairs',
        substitution: `${motorSpeedRpm} rpm / 60 × ${motorPolePairs} pole pairs`,
        result: `f = ${fmt(motorFrequencyHz, 1)} Hz`,
      });
    }
    stepsOut.push({
      title: 'Classical skin depth',
      formula: 'δ = √(ρ(θ) / (π · f · µ₀ · µr))',
      substitution: `ρ(θ) = ${(rhoAtTemp * 1e-6).toExponential(3)} Ω·m, f = ${fmt(frequencyHz, 1)} Hz, µ₀ = 4π×10⁻⁷ H/m, µr = ${fmt(muR, 3)}`,
      result: isFinite(skinDepthMmValue) ? `δ = ${fmt(skinDepthMmValue, 4)} mm (${fmt(skinDepthMmValue * 1000, 1)} µm, ${fmt(skinDepthMmValue / 25.4, 4)} in)` : 'δ = ∞ (DC — no skin effect)',
    });
    if (hasConductorSize && effectiveAreaMm2 !== null && fullAreaMm2 !== null && areaUtilizationPercent !== null) {
      stepsOut.push({
        title: 'Illustrative effective conduction area (simplified geometric estimate, not the precise Bessel-function AC/DC resistance ratio)',
        formula: 'A_eff = π · (r² − max(r−δ, 0)²), capped at the full solid area once δ ≥ r',
        substitution: `r = ${fmt(radiusMm, 3)} mm, δ = ${isFinite(skinDepthMmValue) ? fmt(skinDepthMmValue, 3) : '∞'} mm`,
        result: `A_eff = ${fmt(effectiveAreaMm2, 3)} mm² of ${fmt(fullAreaMm2, 3)} mm² total (${fmt(areaUtilizationPercent, 1)}%)`,
      });
    }
    return stepsOut;
  }, [materialId, rho20, beta, tempC, rhoAtTemp, frequencySource, motorSpeedRpm, motorPolePairs, motorFrequencyHz, frequencyHz, muR, skinDepthMmValue, hasConductorSize, effectiveAreaMm2, fullAreaMm2, areaUtilizationPercent, radiusMm]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Material', value: getSkinDepthMaterial(materialId).name },
      { label: 'Resistivity (20°C)', value: `${fmt(rho20, 4)} Ω·mm²/m` },
      { label: 'Relative permeability µr', value: fmt(muR, 3) },
      { label: 'Operating temperature', value: `${fmtU(tempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Frequency source', value: frequencySource === 'direct' ? 'Direct entry' : `Motor speed (${motorSpeedRpm} rpm, ${motorPolePairs} pole pairs)` },
      { label: 'Frequency', value: `${fmt(frequencyHz, 1)} Hz` },
    ];
    if (hasConductorSize) rows.push({ label: 'Conductor diameter', value: `${fmtU(conductorDiameterMm as number, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
    return [{ heading: 'Inputs', rows }];
  }, [materialId, rho20, muR, tempC, frequencySource, motorSpeedRpm, motorPolePairs, frequencyHz, hasConductorSize, conductorDiameterMm, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Skin depth', value: isFinite(skinDepthMmValue) ? `${fmt(skinDepthMmValue, 4)} mm (${fmt(skinDepthMmValue * 1000, 1)} µm, ${fmt(skinDepthMmValue / 25.4, 4)} in)` : '∞ (DC)' },
      { label: 'Resistivity at operating temperature', value: `${fmt(rhoAtTemp, 4)} Ω·mm²/m` },
    ];
    if (hasConductorSize && effectiveAreaMm2 !== null && fullAreaMm2 !== null && areaUtilizationPercent !== null) {
      rows.push({ label: 'Effective conduction area', value: `${fmtU(effectiveAreaMm2, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)} of ${fmtU(fullAreaMm2, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)} (${fmt(areaUtilizationPercent, 1)}%)` });
    }
    return [{ heading: 'Results', rows }];
  }, [skinDepthMmValue, rhoAtTemp, hasConductorSize, effectiveAreaMm2, fullAreaMm2, areaUtilizationPercent, unitSystem]);

  const handleExportPdf = () => {
    const pdfAccent = deriveAccentOnLight(accentHex);
    const diagrams: ReportDiagram[] = [
      { title: 'Skin depth cross-section', svgMarkup: renderSkinDepthCrossSectionSvg(radiusMm, skinDepthMmValue, !hasConductorSize, pdfAccent) },
    ];
    exportReportToPdf({
      tabName: 'Skin_Depth_Calculator',
      pageTitle: 'Skin Depth Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams,
      disclaimer: 'Engineering estimation tool. Classical skin depth δ = √(ρ/(π·f·µ₀·µr)) — a material/frequency property, independent of conductor size or shape. For ferromagnetic materials, µr is not a true material constant (it varies with field strength, saturates, and is itself frequency-dependent) — treat any magnetic-material result as illustrative only and verify against real B-H and resistivity data for your specific alloy. The effective-conduction-area figure (when a conductor diameter is entered) is a simplified geometric estimate, not the precise Bessel-function AC/DC resistance ratio — for busbar/cable AC resistance, use this site\'s Busbar Calculator or Cable/Wire Sizing tool, which apply the IEC 60287-1-1 empirical ks correction for a real conductor geometry.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Skin Depth Calculator</div>
          <h1>Skin Depth Calculator</h1>
          <p>
            The classical AC skin depth of a conductor — the depth beneath the surface at which current density
            has fallen to 1/e (~37%) of its surface value — from a material's resistivity and relative
            permeability at a given frequency, direct-entered or derived from motor speed and pole pairs.
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
            <div className="card-title"><span><span className="step-num">1</span>Material</span></div>
            <div className="field">
              <label>Material</label>
              <select value={materialId} onChange={(e) => handleMaterialChange(e.target.value)}>
                {SKIN_DEPTH_MATERIALS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <span className="hint">{preset.sourced ? preset.notes : `⚠ ${preset.notes}`}</span>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Resistivity @ 20°C
                  <InfoTooltip>Resistivity in Ω·mm²/m — the common cable/wire engineering unit (numerically = Ω·m × 10⁶). Copper is 0.0172 Ω·mm²/m; that is 1.72×10⁻⁸ Ω·m.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.0001} value={rho20} onChange={e => setRho20(Number(e.target.value))} />
                <span className="hint">Ω·mm²/m</span>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Relative permeability µr
                  <InfoTooltip>1.0 for all non-magnetic conductors (copper, aluminium, silver, gold, brass, austenitic stainless). Only ferromagnetic materials (steel, nickel, etc.) have µr {'>'} 1 — and for those it is not a fixed constant, varying with field strength and saturating well below the values sometimes quoted for DC.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0.000001} step={0.01} value={muR} onChange={e => setMuR(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>β (IEC 60865-style temp. reference)</label>
                <input autoComplete="off" type="number" value={beta} onChange={e => setBeta(Number(e.target.value))} />
                <span className="hint">°C — used only for the ρ(θ) temperature correction below.</span>
              </div>
              <div className="field">
                <label>Operating temperature</label>
                <input autoComplete="off" type="number" value={toDisplay(tempC, unitSystem, UNIT_TEMP)} onChange={e => setTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                <span className="hint">{unitLabel(unitSystem, UNIT_TEMP)} — resistivity (and so skin depth) rises somewhat with temperature.</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Frequency</span></div>
            <div className="segmented">
              <button className={frequencySource === 'direct' ? 'active' : ''} onClick={() => setFrequencySource('direct')}>Direct entry</button>
              <button className={frequencySource === 'motor' ? 'active' : ''} onClick={() => setFrequencySource('motor')}>From motor speed</button>
            </div>
            {frequencySource === 'direct' ? (
              <div className="field" style={{ marginTop: '0.85rem' }}>
                <label>Frequency</label>
                <input autoComplete="off" type="number" min={0} value={directFrequencyHz} onChange={e => setDirectFrequencyHz(Number(e.target.value))} />
                <span className="hint">Hz — mains (50/60 Hz), inverter switching frequency, or any AC source.</span>
              </div>
            ) : (
              <div className="grid grid-2" style={{ marginTop: '0.85rem' }}>
                <div className="field">
                  <label>Motor speed</label>
                  <input autoComplete="off" type="number" min={0} value={motorSpeedRpm} onChange={e => setMotorSpeedRpm(Number(e.target.value))} />
                  <span className="hint">rpm</span>
                </div>
                <div className="field">
                  <label>Pole pairs</label>
                  <input autoComplete="off" type="number" min={1} step={1} value={motorPolePairs} onChange={e => setMotorPolePairs(Number(e.target.value))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="hint">f = ({motorSpeedRpm} / 60) × {motorPolePairs} = {fmt(motorFrequencyHz, 1)} Hz — fundamental electrical frequency</span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Conductor size (optional)</span></div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Conductor diameter
                <InfoTooltip>Skin depth itself doesn't depend on conductor size — but entering a real diameter scales the graphic accurately and computes an illustrative "how much of my conductor is actually carrying current" area estimate. Leave blank to just see the skin depth number and a generic (proportionally-scaled) illustration.</InfoTooltip>
              </label>
              <input autoComplete="off" type="number" min={0} step={0.1} value={conductorDiameterMm === '' ? '' : toDisplay(conductorDiameterMm, unitSystem, UNIT_LENGTH)} onChange={e => setConductorDiameterMm(e.target.value === '' ? '' : fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} placeholder={unitSystem === 'imperial' ? 'e.g. 0.4' : 'e.g. 10'} />
              <span className="hint">{unitLabel(unitSystem, UNIT_LENGTH)} — round conductor assumed. Leave blank for an illustrative-only graphic.</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Skin depth</div>
                <div className="value">{isFinite(skinDepthMmValue) ? fmtU(skinDepthMmValue, unitSystem, UNIT_LENGTH, 4) : '∞'}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                <div className="hint">
                  {isFinite(skinDepthMmValue) ? `${fmt(skinDepthMmValue * 1000, 1)} µm · ${fmt(skinDepthMmValue / 25.4, 4)} in` : 'DC — no skin effect'}
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Resistivity @ {fmtU(tempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}</div>
                <div className="value">{fmt(rhoAtTemp, 4)}<span className="unit">Ω·mm²/m</span></div>
                <div className="hint">{(rhoAtTemp * 1e-6).toExponential(3)} Ω·m</div>
              </div>
              {hasConductorSize && effectiveAreaMm2 !== null && fullAreaMm2 !== null && areaUtilizationPercent !== null && (
                <div className="result-tile">
                  <div className="label">Effective conduction area</div>
                  <div className="value">{fmt(areaUtilizationPercent, 1)}<span className="unit">%</span></div>
                  <div className="hint">{fmtU(effectiveAreaMm2, unitSystem, UNIT_AREA, 3)} {unitLabel(unitSystem, UNIT_AREA)} of {fmtU(fullAreaMm2, unitSystem, UNIT_AREA, 3)} {unitLabel(unitSystem, UNIT_AREA)} total</div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Cross-section</div>
            <SkinDepthCrossSection radiusMm={radiusMm} skinDepthMm={skinDepthMmValue} isIllustrative={!hasConductorSize} />
          </div>

        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Skin effect is the tendency of AC current to concentrate near a conductor's surface as frequency
          rises, driven by the conductor's own changing magnetic field inducing eddy currents that oppose
          current flow in its centre. Skin depth δ is the depth at which current density has fallen to 1/e
          (about 37%) of its value at the surface — it is a property of the material and frequency alone
          (via resistivity ρ and relative permeability µr), <strong>not of the conductor's size or shape</strong>.
          δ = √(ρ/(π·f·µ₀·µr)), with µ₀ = 4π×10⁻⁷ H/m the permeability of free space. Non-magnetic conductors
          (copper, aluminium, silver, gold, brass, austenitic stainless) have µr = 1; ferromagnetic materials
          (steel, nickel) have µr {'>'} 1, which sharply reduces skin depth — but µr for these materials is not a
          fixed constant: it depends on field strength, saturates well below the values often quoted for DC,
          and is itself somewhat frequency-dependent, so any result for a magnetic material here should be
          treated as illustrative only. The effective-conduction-area figure (shown when a conductor diameter
          is entered) is a simplified geometric approximation — the true current-density profile falls off
          smoothly rather than as a step function, and real AC/DC resistance ratios for a given conductor
          geometry require a full Bessel-function solution. For an exact busbar or cable AC resistance ratio,
          use this site's Busbar Calculator or Cable/Wire Sizing tool, both of which apply the IEC 60287-1-1
          empirical kₛ correction for a real conductor cross-section. This tool supports engineering
          estimation — verify against manufacturer/material data for critical designs.
        </p>
        <p className="note">
          <b>Validated:</b> checked against the widely-published reference skin-depth values for copper —
          8.5 mm at 60 Hz, 9.3 mm at 50 Hz, 0.66 mm at 10 kHz, and 66 µm at 1 MHz (the classic ~1/√10-per-decade
          progression found in most AC power/RF references) — this calculator returns 8.52 mm, 9.33 mm,
          0.660 mm, and 0.0660 mm respectively for those exact frequencies.
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
