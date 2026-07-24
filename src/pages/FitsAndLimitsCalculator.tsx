import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP, UNIT_STRESS, UNIT_FORCE } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import FitsDiagram from '../components/FitsDiagram';
import { fitDeviationsMm, HOLE_FITS, INTERFERENCE_SHAFT_FITS } from '../lib/isoFits';
import { FITS_MATERIAL_LIST, getFitsMaterial, type FitsMaterial, type FitsMaterialId } from '../lib/fitsMaterials';
import { solveFitsCalc, type FitsInput, type FitsResult, type TemperaturePointResult } from '../lib/fitsPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type ShaftKind = 'solid' | 'hollow';

// A tolerance's editable state: either an ISO 286 fit designation or custom
// signed upper/lower deviations (mm) applied to a nominal shared with its
// mating part. Both custom deviations are independently signed (not a +/-
// magnitude pair) so a wholly-positive interference band like s6 or u6 — or a
// wholly-negative clearance band — can be entered directly, matching how real
// shaft/hole deviations work.
interface TolState {
  mode: 'iso' | 'custom';
  fit: string;
  customUpperMm: number;
  customLowerMm: number;
}

function makeTol(fit: string, customUpperMm = 0.02, customLowerMm = 0): TolState {
  return { mode: 'iso', fit, customUpperMm, customLowerMm };
}

function resolveTol(t: TolState, nominalMm: number): { upperMm: number; lowerMm: number } {
  if (t.mode === 'iso') {
    const dev = fitDeviationsMm(t.fit, nominalMm);
    if (dev) return dev;
  }
  return { upperMm: t.customUpperMm, lowerMm: t.customLowerMm };
}

interface CustomMaterialState {
  eGPa: number;
  nu: number;
  yieldMPa: number;
  cte: number;
}

function makeCustomMaterial(): CustomMaterialState {
  return { eGPa: 200, nu: 0.3, yieldMPa: 250, cte: 12.0e-6 };
}

function materialFor(id: FitsMaterialId, custom: CustomMaterialState): FitsMaterial {
  if (id === 'custom') {
    return { id: 'custom', name: 'Custom', elasticModulusGPa: custom.eGPa, poissonsRatio: custom.nu, yieldStrengthMPa: custom.yieldMPa, thermalExpansionPerC: custom.cte, isBrittle: false };
  }
  return getFitsMaterial(id);
}

export default function FitsAndLimitsCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const stressUnit = unitLabel(unitSystem, UNIT_STRESS);
  const forceUnit = unitLabel(unitSystem, UNIT_FORCE);

  const [shaftKind, setShaftKind] = useState<ShaftKind>('solid');
  const [interfaceDiameterMm, setInterfaceDiameterMm] = useState(50);
  const [shaftBoreMm, setShaftBoreMm] = useState(20);
  const [hubOuterDiameterMm, setHubOuterDiameterMm] = useState(100);
  const [engagementLengthMm, setEngagementLengthMm] = useState(50);
  const [frictionCoefficient, setFrictionCoefficient] = useState(0.12);

  const [shaftTol, setShaftTol] = useState<TolState>(makeTol('s6'));
  const [hubTol, setHubTol] = useState<TolState>(makeTol('H7'));

  const [shaftMaterialId, setShaftMaterialId] = useState<FitsMaterialId>('steelAlloy4140');
  const [shaftCustom, setShaftCustom] = useState<CustomMaterialState>(makeCustomMaterial());
  const [hubMaterialId, setHubMaterialId] = useState<FitsMaterialId>('steelGeneric');
  const [hubCustom, setHubCustom] = useState<CustomMaterialState>(makeCustomMaterial());

  const [assemblyTempC, setAssemblyTempC] = useState(20);
  const [operationalTempC, setOperationalTempC] = useState(125);
  const [storageTempC, setStorageTempC] = useState(-55);

  const shaftMaterial = materialFor(shaftMaterialId, shaftCustom);
  const hubMaterial = materialFor(hubMaterialId, hubCustom);

  const shaftDev = useMemo(() => resolveTol(shaftTol, interfaceDiameterMm), [shaftTol, interfaceDiameterMm]);
  const hubDev = useMemo(() => resolveTol(hubTol, interfaceDiameterMm), [hubTol, interfaceDiameterMm]);

  const fitsInput: FitsInput = useMemo(() => ({
    interfaceDiameterMm,
    shaftTolUpperMm: shaftDev.upperMm,
    shaftTolLowerMm: shaftDev.lowerMm,
    hubTolUpperMm: hubDev.upperMm,
    hubTolLowerMm: hubDev.lowerMm,
    shaftBoreMm: shaftKind === 'hollow' ? shaftBoreMm : 0,
    hubOuterDiameterMm,
    engagementLengthMm,
    frictionCoefficient,
    shaftMaterial,
    hubMaterial,
    assemblyTempC,
    operationalTempC,
    storageTempC,
  }), [interfaceDiameterMm, shaftDev, hubDev, shaftKind, shaftBoreMm, hubOuterDiameterMm, engagementLengthMm,
    frictionCoefficient, shaftMaterial, hubMaterial, assemblyTempC, operationalTempC, storageTempC]);

  const result: FitsResult = useMemo(() => solveFitsCalc(fitsInput), [fitsInput]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    shaftKind, interfaceDiameterMm, shaftBoreMm, hubOuterDiameterMm, engagementLengthMm, frictionCoefficient,
    shaftTol, hubTol, shaftMaterialId, shaftCustom, hubMaterialId, hubCustom,
    assemblyTempC, operationalTempC, storageTempC,
  }), [shaftKind, interfaceDiameterMm, shaftBoreMm, hubOuterDiameterMm, engagementLengthMm, frictionCoefficient,
    shaftTol, hubTol, shaftMaterialId, shaftCustom, hubMaterialId, hubCustom, assemblyTempC, operationalTempC, storageTempC]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.shaftKind) setShaftKind(v.shaftKind);
    if (v.interfaceDiameterMm != null) setInterfaceDiameterMm(v.interfaceDiameterMm);
    if (v.shaftBoreMm != null) setShaftBoreMm(v.shaftBoreMm);
    if (v.hubOuterDiameterMm != null) setHubOuterDiameterMm(v.hubOuterDiameterMm);
    if (v.engagementLengthMm != null) setEngagementLengthMm(v.engagementLengthMm);
    if (v.frictionCoefficient != null) setFrictionCoefficient(v.frictionCoefficient);
    if (v.shaftTol) setShaftTol(v.shaftTol);
    if (v.hubTol) setHubTol(v.hubTol);
    if (v.shaftMaterialId) setShaftMaterialId(v.shaftMaterialId);
    if (v.shaftCustom) setShaftCustom(v.shaftCustom);
    if (v.hubMaterialId) setHubMaterialId(v.hubMaterialId);
    if (v.hubCustom) setHubCustom(v.hubCustom);
    if (v.assemblyTempC != null) setAssemblyTempC(v.assemblyTempC);
    if (v.operationalTempC != null) setOperationalTempC(v.operationalTempC);
    if (v.storageTempC != null) setStorageTempC(v.storageTempC);
  }, []);

  const saved = useSavedCalculations('fits-and-limits');

  // ---- Reusable toleranced-fit input (nominal shared with the mating part) ----
  function TolInput({ label, tol, onChange, fitOptions, hint }: {
    label: string;
    tol: TolState;
    onChange: (t: TolState) => void;
    fitOptions: readonly string[];
    hint?: string;
  }) {
    const resolved = resolveTol(tol, interfaceDiameterMm);
    return (
      <div className="field">
        <label>{label}</label>
        <div className="segmented">
          <button className={tol.mode === 'iso' ? 'active' : ''} onClick={() => onChange({ ...tol, mode: 'iso' })}>ISO fit</button>
          <button className={tol.mode === 'custom' ? 'active' : ''} onClick={() => onChange({ ...tol, mode: 'custom' })}>Custom</button>
        </div>
        {tol.mode === 'iso' ? (
          <>
            <select style={{ marginTop: '0.35rem' }} value={tol.fit} onChange={(e) => onChange({ ...tol, fit: e.target.value })}>
              {fitOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="hint">
              {tol.fit}: {resolved.upperMm >= 0 ? '+' : ''}{fmtU(resolved.upperMm, unitSystem, UNIT_LENGTH, 4)} / {resolved.lowerMm >= 0 ? '+' : ''}{fmtU(resolved.lowerMm, unitSystem, UNIT_LENGTH, 4)} {lenUnit}
            </span>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center' }}>
            <span className="hint">upper</span>
            <input autoComplete="off" type="number" step={0.001}
              value={toDisplay(tol.customUpperMm, unitSystem, UNIT_LENGTH)}
              onChange={(e) => onChange({ ...tol, mode: 'custom', customUpperMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
            <span className="hint">lower</span>
            <input autoComplete="off" type="number" step={0.001}
              value={toDisplay(tol.customLowerMm, unitSystem, UNIT_LENGTH)}
              onChange={(e) => onChange({ ...tol, mode: 'custom', customLowerMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
          </div>
        )}
        {tol.mode === 'custom' && <span className="hint">Signed deviations from nominal — both positive gives a wholly-interference band (like s6/u6), straddling zero gives clearance/transition.</span>}
        {hint && <span className="hint">{hint}</span>}
      </div>
    );
  }

  function MaterialSelect({ label, materialId, onMaterialChange, custom, onCustomChange, tooltip }: {
    label: string;
    materialId: FitsMaterialId;
    onMaterialChange: (id: FitsMaterialId) => void;
    custom: CustomMaterialState;
    onCustomChange: (c: CustomMaterialState) => void;
    tooltip?: string;
  }) {
    const mat = materialFor(materialId, custom);
    return (
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>
          {label}
          {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
        </label>
        <select value={materialId} onChange={(e) => onMaterialChange(e.target.value as FitsMaterialId)}>
          {FITS_MATERIAL_LIST.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {materialId === 'custom' ? (
          <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
            <div className="field">
              <label>E (GPa)</label>
              <input autoComplete="off" type="number" min={0.1} value={custom.eGPa} onChange={(e) => onCustomChange({ ...custom, eGPa: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Poisson's ratio ν</label>
              <input autoComplete="off" type="number" min={0} max={0.5} step={0.01} value={custom.nu} onChange={(e) => onCustomChange({ ...custom, nu: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Yield strength ({stressUnit})</label>
              <input autoComplete="off" type="number" min={1} value={toDisplay(custom.yieldMPa, unitSystem, UNIT_STRESS)} onChange={(e) => onCustomChange({ ...custom, yieldMPa: fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS) })} />
            </div>
            <div className="field">
              <label>CTE (×10⁻⁶/°C)</label>
              <input autoComplete="off" type="number" min={0} step={0.1} value={custom.cte * 1e6} onChange={(e) => onCustomChange({ ...custom, cte: Number(e.target.value) * 1e-6 })} />
            </div>
          </div>
        ) : (
          <span className="hint">E = {fmt(mat.elasticModulusGPa, 1)} GPa · ν = {fmt(mat.poissonsRatio, 2)} · yield = {fmtU(mat.yieldStrengthMPa, unitSystem, UNIT_STRESS, 0)} {stressUnit} · CTE = {fmt(mat.thermalExpansionPerC * 1e6, 1)}×10⁻⁶/°C{mat.isBrittle ? ' · brittle — no true yield point' : ''}</span>
        )}
      </div>
    );
  }

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    steps.push({
      title: 'Diametral interference at 20°C reference (as-machined)',
      formula: 'δmax = es_shaft − EI_hub (tightest: shaft max, hub min)   δmin = ei_shaft − ES_hub (loosest: shaft min, hub max)',
      substitution: `shaft ${shaftTol.mode === 'iso' ? shaftTol.fit : 'custom'}: ${shaftDev.upperMm >= 0 ? '+' : ''}${fmt(shaftDev.upperMm, 4)} / ${shaftDev.lowerMm >= 0 ? '+' : ''}${fmt(shaftDev.lowerMm, 4)} mm, hub ${hubTol.mode === 'iso' ? hubTol.fit : 'custom'}: ${hubDev.upperMm >= 0 ? '+' : ''}${fmt(hubDev.upperMm, 4)} / ${hubDev.lowerMm >= 0 ? '+' : ''}${fmt(hubDev.lowerMm, 4)} mm`,
      result: `δ = ${fmt(result.interferenceAtRefTemp.nom, 4)} mm nominal (${fmt(result.interferenceAtRefTemp.min, 4)} … ${fmt(result.interferenceAtRefTemp.max, 4)} mm)`,
    });
    steps.push({
      title: 'Thermal shift in interference',
      formula: 'δ_thermal(T) = d·(αshaft − αhub)·(T − 20°C), added to the as-machined interference',
      substitution: `d = ${fmt(interfaceDiameterMm, 2)} mm, αshaft = ${fmt(shaftMaterial.thermalExpansionPerC * 1e6, 1)}×10⁻⁶/°C, αhub = ${fmt(hubMaterial.thermalExpansionPerC * 1e6, 1)}×10⁻⁶/°C`,
      result: `At ${fmt(operationalTempC, 0)}°C: δ = ${fmt(result.operational.interferenceMm.nom, 4)} mm nominal. At ${fmt(storageTempC, 0)}°C: δ = ${fmt(result.storage.interferenceMm.nom, 4)} mm nominal.`,
    });
    steps.push({
      title: 'Contact pressure (Lamé thick-cylinder / Shigley shrink-fit equation)',
      formula: 'p = δ / { d/Eo·[(Do²+d²)/(Do²−d²) + νo] + d/Ei·[(d²+di²)/(d²−di²) − νi] }',
      substitution: `d = ${fmt(interfaceDiameterMm, 2)} mm, Do = ${fmt(hubOuterDiameterMm, 2)} mm, di = ${fmt(shaftKind === 'hollow' ? shaftBoreMm : 0, 2)} mm`,
      result: `p (assembly, nominal δ) = ${fmt(result.assembly.contactPressureMPa.nom, 1)} MPa`,
    });
    steps.push({
      title: 'Hub and shaft stresses',
      formula: 'Hub: σr(bore)=−p, σθ(bore)=+p(Do²+d²)/(Do²−d²).  Shaft: σr=−p, σθ=−p(d²+di²)/(d²−di²) (solid: σr=σθ=−p uniformly). Von Mises: √(σr²−σr·σθ+σθ²)',
      result: `At assembly: hub bore σθ = ${fmt(result.assembly.hubBore.hoopMPa.nom, 1)} MPa (SF ${fmt(result.assembly.hubBore.safetyFactor.nom, 2)}), shaft ${result.assembly.shaftBore ? 'bore' : 'interface'} von Mises = ${fmt((result.assembly.shaftBore ?? result.assembly.shaftInterface).vonMisesMPa.nom, 1)} MPa (SF ${fmt((result.assembly.shaftBore ?? result.assembly.shaftInterface).safetyFactor.nom, 2)})`,
    });
    steps.push({
      title: 'Axial press-in (insertion) force',
      formula: 'F = π·f·p·d·L',
      substitution: `f = ${fmt(frictionCoefficient, 2)}, p = ${fmt(result.assembly.contactPressureMPa.nom, 1)} MPa, d = ${fmt(interfaceDiameterMm, 2)} mm, L = ${fmt(engagementLengthMm, 2)} mm`,
      result: `F = ${fmt(result.insertionForceN.nom, 0)} N nominal (${fmt(result.insertionForceN.min, 0)} … ${fmt(result.insertionForceN.max, 0)} N)`,
    });
    return steps;
  }, [result, shaftTol, hubTol, shaftDev, hubDev, interfaceDiameterMm, shaftMaterial, hubMaterial, operationalTempC,
    storageTempC, hubOuterDiameterMm, shaftKind, shaftBoreMm, frictionCoefficient, engagementLengthMm]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Geometry',
      rows: [
        { label: 'Shaft', value: shaftKind === 'hollow' ? `Hollow, bore Ø ${fmt(shaftBoreMm, 2)} mm` : 'Solid' },
        { label: 'Interface diameter d', value: `${fmt(interfaceDiameterMm, 2)} mm` },
        { label: 'Hub outer diameter Do', value: `${fmt(hubOuterDiameterMm, 2)} mm` },
        { label: 'Engagement length L', value: `${fmt(engagementLengthMm, 2)} mm` },
        { label: 'Friction coefficient', value: fmt(frictionCoefficient, 3) },
      ],
    },
    {
      heading: 'Tolerances',
      rows: [
        { label: 'Shaft OD', value: `${shaftTol.mode === 'iso' ? shaftTol.fit : 'custom'} (${shaftDev.upperMm >= 0 ? '+' : ''}${fmt(shaftDev.upperMm, 4)} / ${shaftDev.lowerMm >= 0 ? '+' : ''}${fmt(shaftDev.lowerMm, 4)} mm)` },
        { label: 'Hub bore', value: `${hubTol.mode === 'iso' ? hubTol.fit : 'custom'} (${hubDev.upperMm >= 0 ? '+' : ''}${fmt(hubDev.upperMm, 4)} / ${hubDev.lowerMm >= 0 ? '+' : ''}${fmt(hubDev.lowerMm, 4)} mm)` },
      ],
    },
    {
      heading: 'Materials',
      rows: [
        { label: 'Shaft', value: `${shaftMaterial.name} — E ${fmt(shaftMaterial.elasticModulusGPa, 1)} GPa, ν ${fmt(shaftMaterial.poissonsRatio, 2)}, yield ${fmt(shaftMaterial.yieldStrengthMPa, 0)} MPa, CTE ${fmt(shaftMaterial.thermalExpansionPerC * 1e6, 1)}×10⁻⁶/°C` },
        { label: 'Hub', value: `${hubMaterial.name} — E ${fmt(hubMaterial.elasticModulusGPa, 1)} GPa, ν ${fmt(hubMaterial.poissonsRatio, 2)}, yield ${fmt(hubMaterial.yieldStrengthMPa, 0)} MPa, CTE ${fmt(hubMaterial.thermalExpansionPerC * 1e6, 1)}×10⁻⁶/°C` },
      ],
    },
    {
      heading: 'Temperatures',
      rows: [
        { label: 'Assembly', value: `${fmt(assemblyTempC, 0)}°C` },
        { label: 'Operational', value: `${fmt(operationalTempC, 0)}°C` },
        { label: 'Storage', value: `${fmt(storageTempC, 0)}°C` },
      ],
    },
  ], [shaftKind, shaftBoreMm, interfaceDiameterMm, hubOuterDiameterMm, engagementLengthMm, frictionCoefficient,
    shaftTol, hubTol, shaftDev, hubDev, shaftMaterial, hubMaterial, assemblyTempC, operationalTempC, storageTempC]);

  function tempPointRows(label: string, point: TemperaturePointResult): ReportRow[] {
    const shaftPoint = point.shaftBore ?? point.shaftInterface;
    const shaftLoc = point.shaftBore ? 'bore' : 'interface';
    return [
      { label: `${label} — Interference [mm]`, value: `${fmt(point.interferenceMm.nom, 4)} (${fmt(point.interferenceMm.min, 4)} … ${fmt(point.interferenceMm.max, 4)})` },
      { label: `${label} — Contact pressure [MPa]`, value: `${fmt(point.contactPressureMPa.nom, 1)} (${fmt(point.contactPressureMPa.min, 1)} … ${fmt(point.contactPressureMPa.max, 1)})` },
      { label: `${label} — Hub bore hoop stress [MPa]`, value: `${fmt(point.hubBore.hoopMPa.nom, 1)} · SF ${fmt(point.hubBore.safetyFactor.nom, 2)}` },
      { label: `${label} — Shaft ${shaftLoc} von Mises [MPa]`, value: `${fmt(shaftPoint.vonMisesMPa.nom, 1)} · SF ${fmt(shaftPoint.safetyFactor.nom, 2)}` },
    ];
  }

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Insertion force',
      rows: [
        { label: 'Force [N]', value: `${fmt(result.insertionForceN.nom, 0)} (${fmt(result.insertionForceN.min, 0)} … ${fmt(result.insertionForceN.max, 0)})` },
      ],
    },
    {
      heading: 'Assembly / operational / storage',
      rows: [
        ...tempPointRows('Assembly', result.assembly),
        ...tempPointRows('Operational', result.operational),
        ...tempPointRows('Storage', result.storage),
      ],
    },
    {
      heading: 'Checks',
      rows: result.checks.map((c) => ({ label: `${c.severity === 'pass' ? '✓' : c.severity === 'warn' ? '⚠' : '✗'} ${c.label}`, value: c.detail })),
    },
  ], [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Fits_And_Limits_Calculator',
      pageTitle: 'Fits & Limits Calculator',
      accentHex,
      passStatus: { pass: result.overallPass, label: result.overallPass ? 'Fit within limits across the temperature range' : 'Fit fails one or more checks — see below' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Engineering estimation tool for cylindrical interference (press/shrink) fits, using classical Lamé thick-walled-cylinder theory (Shigley\'s Mechanical Engineering Design, "Press and Shrink Fits") for contact pressure and hoop/radial stress in a shaft (solid or hollow) pressed into a hub of finite outer diameter, and F = π·f·p·d·L for the axial insertion force. Stresses assume plane stress (free ends, no additional axial load) and use the von Mises criterion. ISO 286 hole fits (H) are computed from the standard\'s formulas; shaft interference fits (k6/m6/n6/p6/r6/s6/t6/u6) are transcribed from the published ANSI B4.2 / ISO 286-1 tolerance-zone tables, which reproduce the ISO values exactly. Thermal effects use each material\'s room-temperature CTE across the full range (temperature-dependent property variation is not modelled). Material properties are typical published values — verify against the specific material datasheet/certificate, and note that brittle materials (e.g. grey cast iron) have no well-defined yield point in compression. Have the final fit reviewed against your application\'s holding-force and fatigue requirements.',
      ...branding,
    });
  };

  const failingChecks = result.checks.filter((c) => c.severity === 'fail');
  const warningChecks = result.checks.filter((c) => c.severity === 'warn');
  const safetyFactorTarget = 1.5;

  function tempTable(label: string, tempC: number, point: TemperaturePointResult) {
    const shaftPoint = point.shaftBore ?? point.shaftInterface;
    const shaftLoc = point.shaftBore ? 'Shaft Bore (Hollow)' : 'Shaft Interface (Solid)';
    return (
      <div className="card">
        <div className="card-title">
          <span>
            {label} ({fmt(tempC, 0)}°C)
            {!point.fitRetainedAtMin && <span className="tag" style={{ marginLeft: '0.5rem', background: 'rgba(248,113,113,0.12)', color: 'var(--neg)', borderColor: 'transparent' }}>fit lost at worst-case tolerance</span>}
          </span>
        </div>
        <table className="data-table">
          <thead><tr><th>Metric</th><th>Nominal</th><th>Min</th><th>Max</th></tr></thead>
          <tbody>
            <tr>
              <td>Interference [{lenUnit}]</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k} className={point.interferenceMm[k] <= 0 ? 'fail' : undefined}>{fmtU(point.interferenceMm[k], unitSystem, UNIT_LENGTH, 4)}</td>
              ))}
            </tr>
            <tr>
              <td>Contact Pressure [{stressUnit}]</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k}>{fmtU(point.contactPressureMPa[k], unitSystem, UNIT_STRESS, 1)}</td>
              ))}
            </tr>
            <tr>
              <td>Hub Bore Hoop Stress [{stressUnit}]</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k}>{fmtU(point.hubBore.hoopMPa[k], unitSystem, UNIT_STRESS, 1)}</td>
              ))}
            </tr>
            <tr>
              <td>- Safety Factor</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k} className={point.hubBore.safetyFactor[k] >= safetyFactorTarget ? 'pass' : 'fail'}>{fmt(point.hubBore.safetyFactor[k], 2)}</td>
              ))}
            </tr>
            <tr>
              <td>Hub OD Hoop Stress [{stressUnit}]</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k}>{fmtU(point.hubOuterHoopMPa[k], unitSystem, UNIT_STRESS, 1)}</td>
              ))}
            </tr>
            <tr>
              <td>{shaftLoc} Von Mises [{stressUnit}]</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k}>{fmtU(shaftPoint.vonMisesMPa[k], unitSystem, UNIT_STRESS, 1)}</td>
              ))}
            </tr>
            <tr>
              <td>- Safety Factor</td>
              {(['nom', 'min', 'max'] as const).map((k) => (
                <td key={k} className={shaftPoint.safetyFactor[k] >= safetyFactorTarget ? 'pass' : 'fail'}>{fmt(shaftPoint.safetyFactor[k], 2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Fits &amp; Limits Calculator</div>
          <h1>Fits &amp; Limits Calculator</h1>
          <p>
            Interference (press/shrink) fit design for a shaft — solid or hollow — pressed into a hub or bearing
            bore. ISO 286 fits or custom tolerances on both parts, standard or custom shaft/hub materials, and
            insertion force plus hub/shaft stresses (Lamé thick-cylinder theory) across assembly, operational and
            storage temperatures.
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
                <span className="step-num">1</span>Geometry
                <InfoTooltip>The interface diameter d is the nominal shaft OD, which equals the nominal hub bore diameter — the two parts' individual tolerances (below) determine the actual interference. A hollow shaft (e.g. a bearing inner sleeve or compression limiter) has its own bore, which raises stress at that inner surface.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Shaft</label>
              <div className="segmented">
                <button className={shaftKind === 'solid' ? 'active' : ''} onClick={() => setShaftKind('solid')}>Solid</button>
                <button className={shaftKind === 'hollow' ? 'active' : ''} onClick={() => setShaftKind('hollow')}>Hollow</button>
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Interface diameter d ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0.1} value={toDisplay(interfaceDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setInterfaceDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                <span className="hint">Nominal shaft OD = nominal hub bore.</span>
              </div>
              {shaftKind === 'hollow' && (
                <div className="field">
                  <label>Shaft bore Ø ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(shaftBoreMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setShaftBoreMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              )}
              <div className="field">
                <label>Hub outer diameter Do ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0.1} value={toDisplay(hubOuterDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setHubOuterDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Engagement length L ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0.1} value={toDisplay(engagementLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setEngagementLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>
                  Friction coefficient
                  <InfoTooltip>Dry steel-on-steel is typically 0.10–0.15; lubricated assembly can drop to ~0.05, reducing insertion force but also the interference's holding/torque capacity accordingly.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} max={1} step={0.01} value={frictionCoefficient} onChange={(e) => setFrictionCoefficient(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Tolerances
                <InfoTooltip>Pick a standard ISO 286 fit for each part, or enter your own ± deviations. The shaft list covers the interference/transition range (k6 lightest through u6 heaviest force fit); the hub is conventionally an H-series hole.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <TolInput label="Shaft OD tolerance" tol={shaftTol} onChange={setShaftTol} fitOptions={INTERFERENCE_SHAFT_FITS} />
              <TolInput label="Hub bore tolerance" tol={hubTol} onChange={setHubTol} fitOptions={HOLE_FITS} />
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">3</span>Materials
                <InfoTooltip>Elastic modulus and Poisson's ratio set the contact pressure and stress split between shaft and hub; yield strength sets the safety factors; CTE drives how much the interference changes with temperature.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <MaterialSelect label="Shaft material" materialId={shaftMaterialId} onMaterialChange={setShaftMaterialId} custom={shaftCustom} onCustomChange={setShaftCustom} />
              <MaterialSelect label="Hub material" materialId={hubMaterialId} onMaterialChange={setHubMaterialId} custom={hubCustom} onCustomChange={setHubCustom} />
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">4</span>Temperatures
                <InfoTooltip>ISO 286 tolerances are referenced at 20°C. At other temperatures, differential thermal expansion between the shaft and hub materials shifts the interference — growing it if the shaft's CTE exceeds the hub's and the assembly is heated (or the reverse and it's cooled), and shrinking it otherwise.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Assembly ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(assemblyTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAssemblyTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                <span className="hint">Insertion force is evaluated at this temperature.</span>
              </div>
              <div className="field">
                <label>Operational ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(operationalTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setOperationalTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Storage ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(storageTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setStorageTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className={`status-banner ${result.overallPass ? 'pass' : 'fail'}`}>
              {result.overallPass
                ? warningChecks.length > 0
                  ? `✓ Within limits — ${warningChecks.length} advisory note${warningChecks.length === 1 ? '' : 's'} below`
                  : '✓ Fit within limits across the temperature range'
                : `✗ Fit fails ${failingChecks.length} check${failingChecks.length === 1 ? '' : 's'} — see below`}
            </div>
            {result.checks.filter((c) => c.severity !== 'pass').length > 0 && (
              <div style={{ margin: '0 0 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.checks.filter((c) => c.severity !== 'pass').map((c) => (
                  <div key={c.id} style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <div style={{ color: c.severity === 'fail' ? 'var(--neg)' : 'var(--warn)', fontWeight: 700 }}>{c.severity === 'fail' ? '✗' : '⚠'} {c.label}</div>
                    <div style={{ color: 'var(--text-2)' }}>→ {c.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Interference (assembly, nominal)</div>
                <div className="value">{fmtU(result.interferenceAtRefTemp.nom, unitSystem, UNIT_LENGTH, 4)}<span className="unit">{lenUnit}</span></div>
                <div className="hint">{fmtU(result.interferenceAtRefTemp.min, unitSystem, UNIT_LENGTH, 4)} … {fmtU(result.interferenceAtRefTemp.max, unitSystem, UNIT_LENGTH, 4)} {lenUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Contact pressure (assembly)</div>
                <div className="value">{fmtU(result.assembly.contactPressureMPa.nom, unitSystem, UNIT_STRESS, 1)}<span className="unit">{stressUnit}</span></div>
                <div className="hint">{fmtU(result.assembly.contactPressureMPa.min, unitSystem, UNIT_STRESS, 1)} … {fmtU(result.assembly.contactPressureMPa.max, unitSystem, UNIT_STRESS, 1)} {stressUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Insertion force</div>
                <div className="value">{fmtU(result.insertionForceN.nom, unitSystem, UNIT_FORCE, 0)}<span className="unit">{forceUnit}</span></div>
                <div className="hint">{fmtU(result.insertionForceN.min, unitSystem, UNIT_FORCE, 0)} … {fmtU(result.insertionForceN.max, unitSystem, UNIT_FORCE, 0)} {forceUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Hub bore SF (worst across temps)</div>
                <div className={`value ${Math.min(result.assembly.hubBore.safetyFactor.min, result.operational.hubBore.safetyFactor.min, result.storage.hubBore.safetyFactor.min) >= safetyFactorTarget ? 'pos' : 'neg'}`}>
                  {fmt(Math.min(result.assembly.hubBore.safetyFactor.min, result.operational.hubBore.safetyFactor.min, result.storage.hubBore.safetyFactor.min), 2)}
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Shaft SF (worst across temps)</div>
                <div className={`value ${Math.min(
                  (result.assembly.shaftBore ?? result.assembly.shaftInterface).safetyFactor.min,
                  (result.operational.shaftBore ?? result.operational.shaftInterface).safetyFactor.min,
                  (result.storage.shaftBore ?? result.storage.shaftInterface).safetyFactor.min,
                ) >= safetyFactorTarget ? 'pos' : 'neg'}`}>
                  {fmt(Math.min(
                    (result.assembly.shaftBore ?? result.assembly.shaftInterface).safetyFactor.min,
                    (result.operational.shaftBore ?? result.operational.shaftInterface).safetyFactor.min,
                    (result.storage.shaftBore ?? result.storage.shaftInterface).safetyFactor.min,
                  ), 2)}
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Fit retained at operating temp?</div>
                <div className={`value ${result.operational.fitRetainedAtMin ? 'pos' : 'neg'}`}>{result.operational.fitRetainedAtMin ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Insertion force
                <InfoTooltip>Axial press-in force F = π·f·p·d·L, evaluated at the assembly-temperature contact pressure. Min/Max use the loosest/tightest tolerance stack — size any press or fixture for the Max case.</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <thead><tr><th>Metric</th><th>Nominal</th><th>Min</th><th>Max</th></tr></thead>
              <tbody>
                <tr>
                  <td>Insertion Force [{forceUnit}]</td>
                  {(['nom', 'min', 'max'] as const).map((k) => (
                    <td key={k}>{fmtU(result.insertionForceN[k], unitSystem, UNIT_FORCE, 0)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {tempTable('Assembly', assemblyTempC, result.assembly)}
          {tempTable('Operational', operationalTempC, result.operational)}
          {tempTable('Storage', storageTempC, result.storage)}

          <div className="card">
            <div className="card-title">Fit cross-section</div>
            <FitsDiagram
              interfaceDiameterMm={interfaceDiameterMm}
              shaftBoreMm={shaftKind === 'hollow' ? shaftBoreMm : 0}
              hubOuterDiameterMm={hubOuterDiameterMm}
              engagementLengthMm={engagementLengthMm}
              unitSystem={unitSystem}
            />
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Contact pressure and stresses use classical Lamé thick-walled-cylinder theory for a shaft (solid or
          hollow) pressed into a hub of finite outer diameter, following the standard treatment in Shigley's
          Mechanical Engineering Design ("Press and Shrink Fits"): p = δ / {'{'} d/Eo·[(Do²+d²)/(Do²−d²) + νo] +
          d/Ei·[(d²+di²)/(d²−di²) − νi] {'}'}. Stresses assume plane stress (free ends, no additional axial
          load or torque) and the von Mises criterion; a solid shaft is under uniform hydrostatic compression
          (σr = σθ = −p) while a hollow shaft's highest stress is at its bore. Axial insertion force uses
          F = π·f·p·d·L at the assembly-temperature pressure. ISO 286 hole fits (H6–H11 etc.) are computed
          directly from the standard's formulas; the interference-range shaft fits (k6, m6, n6, p6, r6, s6, t6,
          u6) are transcribed from the published ANSI B4.2 tolerance-zone tables, which reproduce the ISO 286-1
          values for these classes exactly (these letters carry IT-grade-dependent correction terms in the
          standard's own formulas, so they are looked up rather than computed). Differential thermal expansion
          shifts the interference by d·(αshaft−αhub)·(T−20°C) at each operating temperature — a genuine failure
          mode if it drives the worst-case interference to zero or below ("fit lost"), or drives stress
          beyond yield at the opposite extreme. Material properties (E, ν, yield, CTE) are typical published
          room-temperature values for each preset and are not varied with temperature; grey cast iron and other
          brittle materials have no well-defined yield point in compression, so their check is advisory only —
          compare against the compound's actual compressive strength rating. This is an estimation tool; verify
          against the application's holding-force, torque, and fatigue requirements before production use.
        </p>
        <p className="note">
          <b>Validated:</b> a solid steel shaft (50 mm) pressed into a steel hub (100 mm OD) with a clean
          0.05 mm diametral interference should give p = δ/{'{'}(d/E)·[(Do²+d²)/(Do²−d²) + (1−ν)]{'}'} = 75.0 MPa
          by hand — this calculator returns exactly 75.0 MPa, a hub bore hoop stress of 125.0 MPa (von Mises
          175.0 MPa), and a shaft-interface von Mises stress of 75.0 MPa. That last figure checks out
          analytically too: a solid shaft is under equal radial and hoop compression (σr = σθ = −p), and the
          von Mises formula reduces exactly to p in that special case — which is exactly what came back. The
          thermal-shift term was checked separately (aluminium shaft in a steel hub at 80°C) and also matched
          the hand-calculated interference exactly.
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
