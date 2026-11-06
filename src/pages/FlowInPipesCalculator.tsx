import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_LENGTH_M, UNIT_TEMP } from '../lib/globalUnits';
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
import { COOLANT_PRESETS } from '../lib/materials';
import {
  fluidProperties, PIPE_ROUGHNESS_MM, roughnessMm, FITTING_K, solveFlowInPipes,
} from '../lib/flowInPipesPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

const COOLANT_OPTIONS = COOLANT_PRESETS.filter((c) => c.id !== 'custom');

export default function FlowInPipesCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const lenMUnit = unitLabel(unitSystem, UNIT_LENGTH_M);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  // Fluid
  const [coolantId, setCoolantId] = useState('water');
  const [tempC, setTempC] = useState(60);
  const [customRho, setCustomRho] = useState(998);
  const [customNuCst, setCustomNuCst] = useState(1.0); // centistokes (mm²/s)

  // Pipe
  const [roughId, setRoughId] = useState('drawn');
  const [customRoughMm, setCustomRoughMm] = useState(0.0015);
  const [pipeDiameterMm, setPipeDiameterMm] = useState(12);
  const [pipeLengthM, setPipeLengthM] = useState(3);

  // Flow / duty
  const [flowLpm, setFlowLpm] = useState(10);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [pumpEfficiency, setPumpEfficiency] = useState(0.6);

  // Minor losses
  const [minorMode, setMinorMode] = useState<'total' | 'builder'>('total');
  const [totalK, setTotalK] = useState(5);
  const [fittingCounts, setFittingCounts] = useState<Record<string, number>>({ elbow90: 4, teeRun: 2 });

  // Safety net: leave the premium fitting-builder mode / custom-fluid on entitlement lapse.
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setMinorMode((prev) => (prev === 'builder' ? 'total' : prev));
    setCoolantId((prev) => (prev === 'custom' ? 'water' : prev));
  }, [isPremium, entitlementLoading]);

  const builderK = useMemo(
    () => FITTING_K.reduce((sum, f) => sum + (fittingCounts[f.id] ?? 0) * f.k, 0),
    [fittingCounts],
  );
  const sumK = minorMode === 'builder' ? builderK : Math.max(totalK, 0);

  const fluid = useMemo(() => {
    if (coolantId === 'custom') return { rho: customRho, nu: customNuCst * 1e-6 }; // cSt → m²/s
    return fluidProperties(coolantId, tempC);
  }, [coolantId, tempC, customRho, customNuCst]);

  const epsMm = roughId === 'custom' ? customRoughMm : roughnessMm(roughId);

  const result = useMemo(() => solveFlowInPipes({
    rho: fluid.rho, nu: fluid.nu, pipeDiameterMm, pipeLengthM, roughnessMm: epsMm,
    volumetricFlowLpm: flowLpm, sumK, elevationGainM, pumpEfficiency,
  }), [fluid, pipeDiameterMm, pipeLengthM, epsMm, flowLpm, sumK, elevationGainM, pumpEfficiency]);

  // Velocity advisory: liquid-cooling lines are usually run at ~1–3 m/s (below
  // ~1 keeps sediment/air; above ~3–4 the pressure drop and erosion rise fast).
  const velocityAdvisory = result.velocityMPerS < 0.7 ? 'warn-low'
    : result.velocityMPerS > 3.5 ? 'warn-high' : 'ok';

  const getInputs = useCallback((): Record<string, unknown> => ({
    coolantId, tempC, customRho, customNuCst, roughId, customRoughMm, pipeDiameterMm, pipeLengthM,
    flowLpm, elevationGainM, pumpEfficiency, minorMode, totalK, fittingCounts,
  }), [coolantId, tempC, customRho, customNuCst, roughId, customRoughMm, pipeDiameterMm, pipeLengthM,
    flowLpm, elevationGainM, pumpEfficiency, minorMode, totalK, fittingCounts]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.coolantId != null) setCoolantId(v.coolantId);
    if (v.tempC != null) setTempC(v.tempC);
    if (v.customRho != null) setCustomRho(v.customRho);
    if (v.customNuCst != null) setCustomNuCst(v.customNuCst);
    if (v.roughId != null) setRoughId(v.roughId);
    if (v.customRoughMm != null) setCustomRoughMm(v.customRoughMm);
    if (v.pipeDiameterMm != null) setPipeDiameterMm(v.pipeDiameterMm);
    if (v.pipeLengthM != null) setPipeLengthM(v.pipeLengthM);
    if (v.flowLpm != null) setFlowLpm(v.flowLpm);
    if (v.elevationGainM != null) setElevationGainM(v.elevationGainM);
    if (v.pumpEfficiency != null) setPumpEfficiency(v.pumpEfficiency);
    if (v.minorMode != null) setMinorMode(v.minorMode);
    if (v.totalK != null) setTotalK(v.totalK);
    if (v.fittingCounts != null) setFittingCounts(v.fittingCounts);
  }, []);

  const saved = useSavedCalculations('flow-in-pipes');
  const shareLink = useShareableLink(restoreInputs);

  const kPa = (pa: number) => pa / 1000;

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Flow velocity from volumetric flow',
      formula: 'v = Q / A,  A = π·D²/4',
      substitution: `Q = ${fmt(flowLpm, 1)} L/min, D = ${fmt(pipeDiameterMm, 1)} mm`,
      result: `v = ${fmt(result.velocityMPerS, 3)} m/s`,
    },
    {
      title: 'Reynolds number & flow regime',
      formula: 'Re = v·D/ν',
      substitution: `ν = ${fluid.nu.toExponential(3)} m²/s`,
      result: `Re = ${fmt(result.reynolds, 0)} → ${result.regime}`,
    },
    {
      title: 'Darcy friction factor',
      formula: result.regime === 'laminar' ? 'f = 64/Re (laminar)' : 'f = 0.25 / [log₁₀(ε/(3.7·D) + 5.74/Re^0.9)]² (Swamee-Jain)',
      substitution: `ε = ${fmt(epsMm, 4)} mm, ε/D = ${fmt((epsMm / pipeDiameterMm), 5)}`,
      result: `f = ${fmt(result.frictionFactor, 4)}`,
    },
    {
      title: 'Pressure drop (Darcy-Weisbach + minor + static)',
      formula: 'ΔP = f·(L/D)·(ρ·v²/2) + ΣK·(ρ·v²/2) + ρ·g·Δz',
      substitution: `L = ${fmt(pipeLengthM, 2)} m, ΣK = ${fmt(sumK, 2)}, Δz = ${fmt(elevationGainM, 2)} m, ρ = ${fmt(fluid.rho, 0)} kg/m³`,
      result: `major ${fmt(kPa(result.majorDropPa), 2)} + minor ${fmt(kPa(result.minorDropPa), 2)} + static ${fmt(kPa(result.staticDropPa), 2)} = ${fmt(kPa(result.totalDropPa), 2)} kPa`,
    },
    {
      title: 'Pump head and power',
      formula: 'H = ΔP/(ρ·g),  P_hyd = ΔP·Q,  P_shaft = P_hyd/η',
      substitution: `Q = ${(flowLpm / 1000 / 60).toExponential(3)} m³/s, η = ${fmt(pumpEfficiency * 100, 0)}%`,
      result: `H = ${fmt(result.pumpHeadM, 2)} m, P_hyd = ${fmt(result.hydraulicPowerW, 1)} W, P_shaft = ${fmt(result.shaftPowerW, 1)} W`,
    },
  ], [flowLpm, pipeDiameterMm, result, fluid, epsMm, pipeLengthM, sumK, elevationGainM, pumpEfficiency]);

  const inputSections: ReportSection[] = useMemo(() => ([
    {
      heading: 'Fluid & pipe',
      rows: [
        { label: 'Coolant', value: coolantId === 'custom' ? 'Custom' : (COOLANT_OPTIONS.find((c) => c.id === coolantId)?.label ?? coolantId) },
        { label: 'Temperature', value: `${fmtU(tempC, unitSystem, UNIT_TEMP, 0)}${tempUnit}` },
        { label: 'Properties (ρ / ν)', value: `${fmt(fluid.rho, 0)} kg/m³ / ${(fluid.nu * 1e6).toFixed(3)} cSt` },
        { label: 'Pipe', value: `${fmt(pipeDiameterMm, 1)} mm ID × ${fmt(pipeLengthM, 2)} m, ε = ${fmt(epsMm, 4)} mm` },
        { label: 'Volumetric flow', value: `${fmt(flowLpm, 1)} L/min` },
        { label: 'Minor losses ΣK', value: `${fmt(sumK, 2)}${minorMode === 'builder' ? ' (from fittings)' : ''}` },
        { label: 'Elevation gain', value: `${fmt(elevationGainM, 2)} m` },
        { label: 'Pump efficiency', value: `${fmt(pumpEfficiency * 100, 0)}%` },
      ] as ReportRow[],
    },
  ]), [coolantId, tempC, fluid, pipeDiameterMm, pipeLengthM, epsMm, flowLpm, sumK, minorMode, elevationGainM, pumpEfficiency, unitSystem, tempUnit]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Flow velocity', value: `${fmt(result.velocityMPerS, 3)} m/s` },
      { label: 'Reynolds number', value: `${fmt(result.reynolds, 0)} (${result.regime})` },
      { label: 'Friction factor', value: fmt(result.frictionFactor, 4) },
      { label: 'Pressure drop (major/minor/static)', value: `${fmt(kPa(result.majorDropPa), 2)} / ${fmt(kPa(result.minorDropPa), 2)} / ${fmt(kPa(result.staticDropPa), 2)} kPa` },
      { label: 'Total pressure drop', value: `${fmt(kPa(result.totalDropPa), 2)} kPa (${fmt(result.totalDropPa / 100000, 3)} bar)` },
      { label: 'Required pump head', value: `${fmt(result.pumpHeadM, 2)} m` },
      { label: 'Hydraulic / shaft power', value: `${fmt(result.hydraulicPowerW, 1)} W / ${fmt(result.shaftPowerW, 1)} W` },
    ] as ReportRow[],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Flow_In_Pipes_Calculator',
      pageTitle: 'Flow in Pipes / Coolant Pump Sizing',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Steady incompressible fully-developed flow of a Newtonian fluid in a single uniform-diameter pipe. Friction factor from f = 64/Re (laminar, Re < 2300) and the Swamee-Jain explicit fit to Colebrook-White (turbulent, Re ≥ 4000), interpolated across the transitional band (2300–4000) — real transitional flow is not predictable. Fitting minor-loss K values are representative textbook/Crane TP-410 figures and vary by source, connection type and size; use the manufacturer\'s K where available. Pipe roughness is the classic Moody value for new, clean pipe — aged/corroded/scaled pipe is rougher. Fluid density is a single representative value (temperature dependence, ~4% for water over 0–100 °C, not captured); kinematic viscosity is temperature-interpolated. Pump power assumes a constant pump efficiency. Verify against the pump curve and the real plumbing for a final design.',
      ...branding,
    });
  };

  const setFittingCount = (id: string, n: number) => setFittingCounts((prev) => ({ ...prev, [id]: Math.max(0, Math.round(n)) }));

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Flow in Pipes Calculator</div>
          <h1>Flow in Pipes / Coolant Pump Sizing</h1>
          <p>
            Pressure drop of a liquid flowing through a pipe or hose run (Darcy-Weisbach with the Swamee-Jain
            friction factor, plus fitting minor losses and static head), and the pump head and power needed to
            drive it — pairs with the Heatsink and Heat Exchanger calculators to size a whole liquid-cooling loop.
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
            <div className="card-title"><span><span className="step-num">1</span>Fluid</span></div>
            <div className="field">
              <label>Coolant</label>
              <select value={coolantId} onChange={(e) => { if (e.target.value === 'custom' && !isPremium) return; setCoolantId(e.target.value); }}>
                {COOLANT_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                <option value="custom">Custom (Premium)</option>
              </select>
            </div>
            {coolantId === 'custom' ? (
              <PremiumGate feature="Custom fluid properties">
                <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="field">
                    <label>Density (kg/m³)</label>
                    <input autoComplete="off" type="number" min={1} value={customRho} onChange={(e) => setCustomRho(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Kinematic viscosity (cSt)<InfoTooltip>Centistokes = mm²/s. Water at 20 °C ≈ 1 cSt; 50/50 glycol ≈ 3–4 cSt; oils are much higher (10–100+ cSt).</InfoTooltip></label>
                    <input autoComplete="off" type="number" min={0.01} step={0.1} value={customNuCst} onChange={(e) => setCustomNuCst(Number(e.target.value))} />
                  </div>
                </div>
              </PremiumGate>
            ) : (
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <label>Temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(tempC, unitSystem, UNIT_TEMP)} onChange={(e) => setTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                <span className="hint">ρ = {fmt(fluid.rho, 0)} kg/m³, ν = {(fluid.nu * 1e6).toFixed(3)} cSt</span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Pipe</span></div>
            <div className="field">
              <label>Material / roughness</label>
              <select value={roughId} onChange={(e) => setRoughId(e.target.value)}>
                {PIPE_ROUGHNESS_MM.filter((r) => r.id !== 'custom').map((r) => <option key={r.id} value={r.id}>{r.label} (ε = {r.epsMm} mm)</option>)}
                <option value="custom">Custom roughness</option>
              </select>
              {roughId === 'custom' && (
                <input autoComplete="off" type="number" min={0} step={0.001} value={customRoughMm} onChange={(e) => setCustomRoughMm(Number(e.target.value))} style={{ marginTop: '0.4rem' }} placeholder="ε (mm)" />
              )}
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Inner diameter ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(pipeDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setPipeDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Length ({lenMUnit})</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={toDisplay(pipeLengthM, unitSystem, UNIT_LENGTH_M)} onChange={(e) => setPipeLengthM(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH_M))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Flow &amp; pump</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Volumetric flow (L/min)</label>
                <input autoComplete="off" type="number" min={0} step={1} value={flowLpm} onChange={(e) => setFlowLpm(Number(e.target.value))} />
                <span className="hint">v = {fmt(result.velocityMPerS, 2)} m/s</span>
              </div>
              <div className="field">
                <label>Elevation gain ({lenMUnit})<InfoTooltip>Static lift the pump must overcome (outlet height − inlet height). Negative for a net drop. Zero for a closed horizontal loop.</InfoTooltip></label>
                <input autoComplete="off" type="number" step={0.1} value={toDisplay(elevationGainM, unitSystem, UNIT_LENGTH_M)} onChange={(e) => setElevationGainM(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH_M))} />
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>Pump efficiency (%)<InfoTooltip>Small coolant pumps ~30–60%.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={1} max={100} value={Math.round(pumpEfficiency * 100)} onChange={(e) => setPumpEfficiency(Math.min(1, Math.max(0.01, Number(e.target.value) / 100)))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Minor losses</span></div>
            <div className="segmented">
              <button className={minorMode === 'total' ? 'active' : ''} onClick={() => setMinorMode('total')}>Total K</button>
              <PremiumGate feature="Fitting-by-fitting builder">
                <button className={minorMode === 'builder' ? 'active' : ''} onClick={() => setMinorMode('builder')}>Build from fittings</button>
              </PremiumGate>
            </div>
            {minorMode === 'total' ? (
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label>Total minor-loss coefficient ΣK<InfoTooltip>Sum of the K values of every fitting, bend and valve in the run, plus entrance/exit. Enter 0 for a straight pipe only. Switch to "Build from fittings" to add them up from a library.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={totalK} onChange={(e) => setTotalK(Number(e.target.value))} />
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="grid grid-2">
                  {FITTING_K.map((f) => (
                    <div className="field" key={f.id}>
                      <label style={{ fontSize: '0.78rem' }}>{f.label} <span style={{ color: 'var(--text-3)' }}>K={f.k}</span></label>
                      <input autoComplete="off" type="number" min={0} step={1} value={fittingCounts[f.id] ?? 0} onChange={(e) => setFittingCount(f.id, Number(e.target.value))} />
                    </div>
                  ))}
                </div>
                <span className="hint" style={{ display: 'block', marginTop: '0.4rem' }}>ΣK = {fmt(builderK, 2)} from the fittings above.</span>
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
                <div className="label">Total pressure drop</div>
                <div className="value">{fmt(kPa(result.totalDropPa), 2)}<span className="unit">kPa</span></div>
                <div className="hint">{fmt(result.totalDropPa / 100000, 3)} bar · {fmt(result.totalDropPa / 6894.757, 2)} psi</div>
              </div>
              <div className="result-tile">
                <div className="label">Required pump head</div>
                <div className="value">{fmt(result.pumpHeadM, 2)}<span className="unit">m</span></div>
                <div className="hint">of {coolantId === 'custom' ? 'fluid' : (COOLANT_OPTIONS.find((c) => c.id === coolantId)?.label ?? '')}</div>
              </div>
              <div className="result-tile">
                <div className="label">Flow velocity</div>
                <div className={`value ${velocityAdvisory === 'ok' ? 'pos' : 'warn'}`}>{fmt(result.velocityMPerS, 2)}<span className="unit">m/s</span></div>
                <div className="hint">{velocityAdvisory === 'warn-low' ? '⚠ low — may not clear air/sediment' : velocityAdvisory === 'warn-high' ? '⚠ high — pressure drop & erosion rise' : 'within typical 1–3 m/s'}</div>
              </div>
              <div className="result-tile">
                <div className="label">Reynolds number</div>
                <div className="value">{fmt(result.reynolds, 0)}<span className="unit"></span></div>
                <div className="hint">{result.regime} (f = {fmt(result.frictionFactor, 4)})</div>
              </div>
              <div className="result-tile">
                <div className="label">Shaft power</div>
                <div className="value">{fmt(result.shaftPowerW, 1)}<span className="unit">W</span></div>
                <div className="hint">hydraulic {fmt(result.hydraulicPowerW, 1)} W ÷ {fmt(pumpEfficiency * 100, 0)}%</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Pressure-drop breakdown</div>
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>Component</th><th style={{ textAlign: 'right' }}>kPa</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
              <tbody>
                <tr><td>Major (pipe friction)</td><td style={{ textAlign: 'right' }}>{fmt(kPa(result.majorDropPa), 2)}</td><td style={{ textAlign: 'right' }}>{fmt(result.totalDropPa !== 0 ? (result.majorDropPa / result.totalDropPa) * 100 : 0, 0)}</td></tr>
                <tr><td>Minor (fittings, ΣK={fmt(sumK, 1)})</td><td style={{ textAlign: 'right' }}>{fmt(kPa(result.minorDropPa), 2)}</td><td style={{ textAlign: 'right' }}>{fmt(result.totalDropPa !== 0 ? (result.minorDropPa / result.totalDropPa) * 100 : 0, 0)}</td></tr>
                <tr><td>Static (elevation {fmt(elevationGainM, 2)} m)</td><td style={{ textAlign: 'right' }}>{fmt(kPa(result.staticDropPa), 2)}</td><td style={{ textAlign: 'right' }}>{fmt(result.totalDropPa !== 0 ? (result.staticDropPa / result.totalDropPa) * 100 : 0, 0)}</td></tr>
                <tr style={{ fontWeight: 700 }}><td>Total</td><td style={{ textAlign: 'right' }}>{fmt(kPa(result.totalDropPa), 2)}</td><td style={{ textAlign: 'right' }}>100</td></tr>
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
        <GuideBacklink calculatorPath="/flow-in-pipes" />
        <p className="note">
          Steady incompressible fully-developed flow of a Newtonian fluid in a single uniform-diameter pipe.
          Pressure drop is Darcy-Weisbach, ΔP = f·(L/D)·(ρ·v²/2), with the Darcy friction factor from f = 64/Re
          for laminar flow (Re &lt; 2300) and the Swamee-Jain explicit fit to Colebrook-White,
          f = 0.25/[log₁₀(ε/(3.7·D) + 5.74/Re^0.9)]², for turbulent flow (Re ≥ 4000); the transitional band
          (2300–4000) is linearly interpolated, since real transitional flow isn't predictable. Fitting minor
          losses use ΣK·(ρ·v²/2) with representative textbook / Crane TP-410 K values — these vary materially by
          source, connection type and size, so use the manufacturer's K where available. Pipe roughness values
          are the classic Moody figures for new, clean pipe; aged, corroded or scaled pipe is rougher. Static
          head is ρ·g·Δz. Fluid density reuses this site's coolant presets (a single representative value — for
          water it doesn't capture the ~4% density change over 0–100 °C) and kinematic viscosity reuses the Heat
          Exchanger calculator's temperature-interpolated transport table, so the two tools agree on fluid data.
          Pump duty is H = ΔP/(ρ·g), hydraulic power ΔP·Q, and shaft power ÷ a constant assumed pump efficiency —
          size the real pump against its published head-vs-flow curve at this operating point.
        </p>
        <p className="note">
          <b>Validated:</b> reproduces a hand-worked textbook case — water at 20 °C (ρ ≈ 998 kg/m³, ν = 1.004×10⁻⁶
          m²/s) flowing at 2.0 m/s through 100 m of 50 mm commercial-steel pipe (ε = 0.046 mm) gives Re ≈ 99,600
          (turbulent), Swamee-Jain f = 0.0221 (matching the Moody chart), a major pressure drop of ≈ 88 kPa and a
          pump head of ≈ 9.0 m — all reproduced exactly. The laminar branch returns f = 64/Re exactly (Re = 100 →
          f = 0.64), and the minor-loss and static-head terms were checked against hand calculation.
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
