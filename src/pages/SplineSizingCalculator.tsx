import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TORQUE, UNIT_STRESS } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData, type ReportGridTable } from '../lib/pdfExport';
import { renderSplineProfileSvg } from '../lib/pdfDiagrams';
import { deriveAccentOnLight } from '../lib/theme';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SplineProfileDiagram from '../components/SplineProfileDiagram';
import {
  PRESSURE_ANGLE_LIST, STANDARD_MODULES, SPLINE_MATERIALS, APPLICATION_FACTORS, LOAD_CHARACTERS,
  type PressureAngleDeg, type RootType, type SplineFitType, type LoadCharacterId,
} from '../lib/splineData';
import {
  computeGeometry, computeTorqueRating, torqueDiameterSweep, smallestSplineForTorque,
  type TorqueRatingInput,
} from '../lib/splinePhysics';
import { downloadSplineDxf } from '../lib/splineDxf';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

type UnitSystemT = ReturnType<typeof useUnitSystem>['unitSystem'];
function lenU(mm: number, us: UnitSystemT, digits = 2): string { return fmt(toDisplay(mm, us, UNIT_LENGTH), us === 'imperial' ? digits + 1 : digits); }

export default function SplineSizingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const torqueUnit = unitLabel(unitSystem, UNIT_TORQUE);
  const stressUnit = unitLabel(unitSystem, UNIT_STRESS);

  // Profile
  const [moduleMm, setModuleMm] = useState(2);
  const [teeth, setTeeth] = useState(18);
  const [pressureAngleDeg, setPressureAngleDeg] = useState<PressureAngleDeg>(30);
  const [root, setRoot] = useState<RootType>('fillet');
  const [pinAutoMultiple, setPinAutoMultiple] = useState(true);
  const [pinDiameterMm, setPinDiameterMm] = useState(3.84); // 1.92·m default

  // Load & duty
  const [appliedTorqueNm, setAppliedTorqueNm] = useState(500);
  const [engagementLengthMm, setEngagementLengthMm] = useState(30);
  const [fitType, setFitType] = useState<SplineFitType>('fixed');
  const [powerSourceId, setPowerSourceId] = useState('uniform');
  const [loadCharacterId, setLoadCharacterId] = useState<LoadCharacterId>('uniform');
  const [loadDistributionFactor, setLoadDistributionFactor] = useState(1.0);
  const [designFactor, setDesignFactor] = useState(1.0);
  const [torqueCycles, setTorqueCycles] = useState(100000);
  const [reversed, setReversed] = useState(false);
  const [wearRevolutions, setWearRevolutions] = useState(1000000);

  // Material
  const [materialId, setMaterialId] = useState('carbon');
  const [customMaterial, setCustomMaterial] = useState(false);
  const [customCompMPa, setCustomCompMPa] = useState(130);
  const [customShearMPa, setCustomShearMPa] = useState(200);

  const [sweepMode, setSweepMode] = useState(false);

  const { isPremium, loading: entitlementLoading } = useEntitlement();
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setSweepMode(false);
    setCustomMaterial(false);
  }, [isPremium, entitlementLoading]);

  const meta = PRESSURE_ANGLE_LIST.find((p) => p.deg === pressureAngleDeg)!;
  // Flat root only exists at 30°; force fillet otherwise.
  useEffect(() => {
    if (!meta.roots.includes(root)) setRoot('fillet');
  }, [meta, root]);
  // Keep the default pin diameter at 1.92·module unless the user overrides it.
  useEffect(() => {
    if (pinAutoMultiple) setPinDiameterMm(Number((1.92 * moduleMm).toFixed(4)));
  }, [pinAutoMultiple, moduleMm]);

  const baseMaterial = SPLINE_MATERIALS.find((m) => m.id === materialId) ?? SPLINE_MATERIALS[1];
  const material = useMemo(() => (
    customMaterial && isPremium
      ? { ...baseMaterial, id: 'custom', label: 'Custom material', allowCompressiveMPa: customCompMPa, allowShearMPa: customShearMPa }
      : baseMaterial
  ), [customMaterial, isPremium, baseMaterial, customCompMPa, customShearMPa]);

  const geometry = useMemo(() => computeGeometry({ moduleMm, teeth, pressureAngleDeg, root, pinDiameterMm }), [moduleMm, teeth, pressureAngleDeg, root, pinDiameterMm]);

  const ratingInput: TorqueRatingInput = useMemo(() => ({
    geometry, engagementLengthMm, material, fitType, powerSourceId, loadCharacterId,
    loadDistributionFactor, designFactor, torqueCycles, reversed, wearRevolutions, appliedTorqueNm,
  }), [geometry, engagementLengthMm, material, fitType, powerSourceId, loadCharacterId, loadDistributionFactor, designFactor, torqueCycles, reversed, wearRevolutions, appliedTorqueNm]);

  const rating = useMemo(() => computeTorqueRating(ratingInput), [ratingInput]);

  const sweepTeeth = useMemo(() => {
    const list: number[] = [];
    for (let z = 6; z <= 60; z += 3) list.push(z);
    return list;
  }, []);
  const sweep = useMemo(() => (sweepMode && isPremium ? torqueDiameterSweep(ratingInput, sweepTeeth, appliedTorqueNm) : null), [sweepMode, isPremium, ratingInput, sweepTeeth, appliedTorqueNm]);
  const smallestForTorque = useMemo(() => smallestSplineForTorque(ratingInput, sweepTeeth, appliedTorqueNm), [ratingInput, sweepTeeth, appliedTorqueNm]);

  const designation = `${teeth} × m${moduleMm} × ${pressureAngleDeg}° ${root} root`;

  const getInputs = useCallback((): Record<string, unknown> => ({
    moduleMm, teeth, pressureAngleDeg, root, pinAutoMultiple, pinDiameterMm, appliedTorqueNm, engagementLengthMm,
    fitType, powerSourceId, loadCharacterId, loadDistributionFactor, designFactor, torqueCycles, reversed,
    wearRevolutions, materialId, customMaterial, customCompMPa, customShearMPa, sweepMode,
  }), [moduleMm, teeth, pressureAngleDeg, root, pinAutoMultiple, pinDiameterMm, appliedTorqueNm, engagementLengthMm,
    fitType, powerSourceId, loadCharacterId, loadDistributionFactor, designFactor, torqueCycles, reversed,
    wearRevolutions, materialId, customMaterial, customCompMPa, customShearMPa, sweepMode]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.moduleMm != null) setModuleMm(v.moduleMm);
    if (v.teeth != null) setTeeth(v.teeth);
    if (v.pressureAngleDeg != null) setPressureAngleDeg(v.pressureAngleDeg);
    if (v.root) setRoot(v.root);
    if (v.pinAutoMultiple != null) setPinAutoMultiple(v.pinAutoMultiple);
    if (v.pinDiameterMm != null) setPinDiameterMm(v.pinDiameterMm);
    if (v.appliedTorqueNm != null) setAppliedTorqueNm(v.appliedTorqueNm);
    if (v.engagementLengthMm != null) setEngagementLengthMm(v.engagementLengthMm);
    if (v.fitType) setFitType(v.fitType);
    if (v.powerSourceId) setPowerSourceId(v.powerSourceId);
    if (v.loadCharacterId) setLoadCharacterId(v.loadCharacterId);
    if (v.loadDistributionFactor != null) setLoadDistributionFactor(v.loadDistributionFactor);
    if (v.designFactor != null) setDesignFactor(v.designFactor);
    if (v.torqueCycles != null) setTorqueCycles(v.torqueCycles);
    if (v.reversed != null) setReversed(v.reversed);
    if (v.wearRevolutions != null) setWearRevolutions(v.wearRevolutions);
    if (v.materialId) setMaterialId(v.materialId);
    if (v.customMaterial != null) setCustomMaterial(v.customMaterial);
    if (v.customCompMPa != null) setCustomCompMPa(v.customCompMPa);
    if (v.customShearMPa != null) setCustomShearMPa(v.customShearMPa);
    if (v.sweepMode != null) setSweepMode(v.sweepMode);
  }, []);

  const saved = useSavedCalculations('spline-sizing');
  const shareLink = useShareableLink(restoreInputs);

  // ---- Drawing-ready dimension rows ----
  const dimensionRows: Array<{ label: string; value: string }> = useMemo(() => [
    { label: 'Designation (z × m × α, root)', value: designation },
    { label: 'Number of teeth z', value: String(teeth) },
    { label: 'Module m', value: `${fmt(moduleMm, 3)} mm` },
    { label: 'Pressure angle α', value: `${pressureAngleDeg}°` },
    { label: 'Pitch (reference) diameter D', value: `${lenU(geometry.pitchDiaMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Base diameter Db', value: `${lenU(geometry.baseDiaMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Major (tip) diameter Dee', value: `${lenU(geometry.majorDiaMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Minor (root) diameter Die', value: `${lenU(geometry.minorDiaMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Form diameter DFe', value: `${lenU(geometry.formDiaMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Circular tooth thickness s', value: `${lenU(geometry.toothThicknessMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Circular space width E', value: `${lenU(geometry.spaceWidthMm, unitSystem, 3)} ${lenUnit}` },
    { label: 'Base pitch pb', value: `${lenU(geometry.basePitchMm, unitSystem, 3)} ${lenUnit}` },
    { label: `Measurement over pins MRe (Ø${fmt(geometry.pinDiameterMm, 3)} mm)`, value: `${lenU(geometry.measurementOverPinsMm, unitSystem, 3)} ${lenUnit}` },
  ], [designation, teeth, moduleMm, pressureAngleDeg, geometry, unitSystem, lenUnit]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Spline profile',
      rows: [
        { label: 'Standard', value: 'ISO 4156 / ANSI B92.2M (metric module, side fit)' },
        { label: 'Designation', value: designation },
        { label: 'Measuring pin Ø', value: `${fmt(geometry.pinDiameterMm, 3)} mm` },
      ],
    },
    {
      heading: 'Load and duty',
      rows: [
        { label: 'Applied torque', value: `${fmt(appliedTorqueNm, 1)} N·m` },
        { label: 'Engagement length L', value: `${fmt(engagementLengthMm, 2)} mm` },
        { label: 'Fit type', value: fitType === 'fixed' ? 'Fixed (non-sliding)' : 'Flexible (sliding)' },
        { label: 'Application (Ka)', value: `${APPLICATION_FACTORS.find((r) => r.id === powerSourceId)?.powerSource}, ${LOAD_CHARACTERS.find((l) => l.id === loadCharacterId)?.label} → Ka=${fmt(rating.Ka, 2)}` },
        fitType === 'fixed'
          ? { label: 'Fatigue (Kf)', value: `${fmt(torqueCycles, 0)} cycles ${reversed ? 'reversed' : 'unidirectional'} → Kf=${fmt(rating.Kf, 2)}` }
          : { label: 'Wear (Kw)', value: `${fmt(wearRevolutions, 0)} rev → Kw=${fmt(rating.Kw, 2)}; Km=${fmt(rating.Km, 2)}` },
      ],
    },
    {
      heading: 'Material',
      rows: [
        { label: 'Material', value: material.label },
        { label: 'Allowable compressive', value: `${fmt(material.allowCompressiveMPa, 0)} MPa` },
        { label: 'Allowable shear', value: `${fmt(material.allowShearMPa, 0)} MPa` },
      ],
    },
  ], [designation, geometry, appliedTorqueNm, engagementLengthMm, fitType, powerSourceId, loadCharacterId, rating, torqueCycles, reversed, wearRevolutions, material]);

  const outputSections: ReportSection[] = useMemo(() => [
    { heading: 'Spline dimensions (drawing-ready)', rows: dimensionRows },
    {
      heading: 'Torque capacity',
      rows: [
        { label: 'Torque capacity (governing)', value: `${fmt(rating.torqueCapacityNm, 1)} N·m (${rating.governingMode})` },
        { label: 'Safety factor vs applied', value: fmt(rating.safetyFactor, 2) },
        { label: 'Tooth shear stress', value: `${fmt(rating.shearStressMPa, 1)} MPa (allow ${fmt(material.allowShearMPa, 0)})` },
        { label: 'Flank compressive stress', value: `${fmt(rating.compressiveStressMPa, 1)} MPa (allow ${fmt(material.allowCompressiveMPa, 0)})` },
        { label: 'Shaft-core torsional shear', value: `${fmt(rating.shaftCoreShearMPa, 1)} MPa` },
        { label: 'Service factor Ks', value: fmt(rating.serviceFactorKs, 2) },
      ],
    },
  ], [dimensionRows, rating, material]);

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Pitch and base diameters',
      formula: 'D = m·z ,  Db = m·z·cos α',
      substitution: `m = ${fmt(moduleMm, 3)} mm, z = ${teeth}, α = ${pressureAngleDeg}°`,
      result: `D = ${fmt(geometry.pitchDiaMm, 3)} mm, Db = ${fmt(geometry.baseDiaMm, 3)} mm`,
    },
    {
      title: 'Tip, root and tooth thickness',
      formula: 'Dee = m·(z + a),  Die = m·(z − b),  s = 0.5·π·m',
      substitution: `a (addendum) = ${fmt(meta.addCoeff, 2)}, b (dedendum) = ${fmt((geometry.majorDiaMm - geometry.pitchDiaMm) === 0 ? 0 : (geometry.pitchDiaMm - geometry.minorDiaMm) / moduleMm, 2)}`,
      result: `Dee = ${fmt(geometry.majorDiaMm, 3)} mm, Die = ${fmt(geometry.minorDiaMm, 3)} mm, s = ${fmt(geometry.toothThicknessMm, 3)} mm`,
    },
    {
      title: 'Measurement over pins (external spline)',
      formula: 'inv φ = s/D + inv α + DR/Db − π/z ,  MRe = Db/cos φ + DR (even z)',
      substitution: `DR = ${fmt(geometry.pinDiameterMm, 3)} mm, φ = ${fmt(geometry.pinContactAngleDeg, 3)}° at pin centre`,
      result: `MRe = ${fmt(geometry.measurementOverPinsMm, 3)} mm${geometry.pinContactValid ? '' : ' (pin contact outside the flank — adjust pin Ø)'}`,
    },
    {
      title: 'Service factor',
      formula: fitType === 'fixed' ? 'Ks = Ka / Kf' : 'Ks = Ka·Km·Kd / Kw',
      substitution: fitType === 'fixed'
        ? `Ka = ${fmt(rating.Ka, 2)}, Kf = ${fmt(rating.Kf, 2)}`
        : `Ka = ${fmt(rating.Ka, 2)}, Km = ${fmt(rating.Km, 2)}, Kd = ${fmt(rating.Kd, 2)}, Kw = ${fmt(rating.Kw, 2)}`,
      result: `Ks = ${fmt(rating.serviceFactorKs, 3)}`,
    },
    {
      title: 'Tooth shear and flank bearing stress',
      formula: 'τ = 2·T·Ks/(L·z·t·D) ,  σc = 2·T·Ks/(L·z·h·D)',
      substitution: `T = ${fmt(appliedTorqueNm, 1)} N·m, L = ${fmt(engagementLengthMm, 2)} mm, t = ${fmt(rating.toothThicknessMm, 3)} mm, h = ${fmt(rating.engagementHeightMm, 3)} mm`,
      result: `τ = ${fmt(rating.shearStressMPa, 1)} MPa, σc = ${fmt(rating.compressiveStressMPa, 1)} MPa`,
    },
    {
      title: 'Governing torque capacity',
      formula: 'T_cap = min(tooth shear, flank bearing, shaft core)',
      substitution: `shear ${fmt(rating.torqueCapShearNm, 0)} · bearing ${fmt(rating.torqueCapCompressiveNm, 0)} · shaft core ${fmt(rating.torqueCapShaftCoreNm, 0)} N·m`,
      result: `T_cap = ${fmt(rating.torqueCapacityNm, 1)} N·m (${rating.governingMode}), SF = ${fmt(rating.safetyFactor, 2)}`,
    },
  ], [moduleMm, teeth, pressureAngleDeg, geometry, meta, fitType, rating, appliedTorqueNm, engagementLengthMm]);

  const handleExportPdf = () => {
    const accentOnLight = deriveAccentOnLight(accentHex);
    const gridTables: ReportGridTable[] = [];
    if (sweep) {
      gridTables.push({
        title: 'Torque capacity vs pitch diameter (this module & profile)',
        rowLabels: sweep.map((s) => `z=${s.teeth}`),
        colLabels: ['Pitch Ø (mm)', 'Major Ø (mm)', 'Capacity (N·m)', 'Meets target'],
        cellValues: sweep.map((s) => [fmt(s.pitchDiaMm, 2), fmt(s.majorDiaMm, 2), fmt(s.torqueCapacityNm, 0), s.meetsTarget ? 'yes' : 'no']),
      });
    }
    exportReportToPdf({
      tabName: 'Spline_Sizing',
      pageTitle: 'Spline Sizing Calculator',
      accentHex,
      passStatus: { pass: rating.pass, label: rating.pass ? `Capacity ${fmt(rating.torqueCapacityNm, 0)} N·m ≥ applied ${fmt(appliedTorqueNm, 0)} N·m (SF ${fmt(rating.safetyFactor, 2)})` : `Capacity ${fmt(rating.torqueCapacityNm, 0)} N·m below applied ${fmt(appliedTorqueNm, 0)} N·m (${rating.governingMode})` },
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [{ title: 'External spline profile (to scale)', svgMarkup: renderSplineProfileSvg(geometry, accentOnLight) }],
      gridTables,
      disclaimer:
        'Engineering sizing/guidance tool for straight (non-helical) involute splines to ISO 4156 / ANSI B92.2M (metric module, side fit). Geometry (pitch, base, major, minor, form diameters, tooth thickness and measurement over pins) follows the ISO 4156-1 basic-dimension formulae and is validated against the ISO 4156-2 dimension tables; the nominal minor/form diameters and measurement-over-pins are computed at the basic (maximum-material) tooth thickness — the toleranced range for a chosen fit and tolerance class is per ISO 4156-2. Torque capacity uses the SAE/ANSI B92.1 (Dudley) method: tooth shear τ = 2·T·Ks/(L·z·t·D), flank compressive (bearing) stress σc = 2·T·Ks/(L·z·h·D), and a torsional-shear check on the shaft core at the minor diameter, with the application, load-distribution, fatigue-life and wear-life factors rolled into a service factor Ks and compared against representative material design strengths. It assumes all teeth share load (the load-distribution factor Km captures misalignment for flexible splines); real spline life also depends on tooth-spacing accuracy, surface finish, lubrication, fretting and precise misalignment, which are not modelled here. The DXF profile is a nominal involute outline for reference/CAM starting geometry — not a toleranced manufacturing drawing. Confirm the final spline against the applicable standard and a detailed stress/durability assessment before production use.',
      ...branding,
    });
  };

  const anyContactWarn = !geometry.pinContactValid;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Spline Sizing Calculator</div>
          <h1>Spline Sizing Calculator</h1>
          <p>
            Size a straight involute spline (ISO 4156 / ANSI B92.2M, metric module) from torque and diameter —
            get a drawing-ready dimension table including measurement over pins, an SAE/Dudley torque capacity
            with the governing failure mode, and a to-scale tooth profile you can export to DXF.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="DXF export">
            <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => downloadSplineDxf(geometry, `spline_${teeth}x${moduleMm}x${pressureAngleDeg}.dxf`)}>Export DXF</button>
          </PremiumGate>
          <PremiumGate feature="PDF export">
            <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">1</span>Spline profile
                <InfoTooltip>ISO 4156 (metric module, side fit) — the 30° involute geometry is shared by ANSI B92.1 and DIN 5480. Pick the module, tooth count, pressure angle and root form; the pitch diameter is D = m·z.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Module m (mm)</label>
                <select value={moduleMm} onChange={(e) => setModuleMm(Number(e.target.value))}>
                  {STANDARD_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Number of teeth z</label>
                <input autoComplete="off" type="number" min={6} max={120} value={teeth} onChange={(e) => setTeeth(Math.max(3, Math.round(Number(e.target.value))))} />
              </div>
            </div>
            <div className="field">
              <label>Pressure angle α</label>
              <div className="segmented">
                {PRESSURE_ANGLE_LIST.map((p) => (
                  <button key={p.deg} className={pressureAngleDeg === p.deg ? 'active' : ''} onClick={() => setPressureAngleDeg(p.deg)}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Root form</label>
              <div className="segmented">
                <button className={root === 'flat' ? 'active' : ''} disabled={!meta.roots.includes('flat')} onClick={() => setRoot('flat')}>Flat root</button>
                <button className={root === 'fillet' ? 'active' : ''} onClick={() => setRoot('fillet')}>Fillet root</button>
              </div>
              <span className="hint">{meta.roots.includes('flat') ? 'Flat root is stronger in bending; fillet root is more common and easier to hob.' : `${pressureAngleDeg}° profiles use a fillet root only.`}</span>
            </div>
            <div className="field">
              <label>
                Measuring pin diameter DR ({lenUnit})
                <InfoTooltip>The ball/pin used to measure the spline over two pins. Defaults to 1.92·module (a typical 30° gauge pin). ISO 4156-2 tabulates a specific pin size per spline — enter your gauge value to match. Measurement over pins is computed exactly for whatever pin diameter is entered.</InfoTooltip>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input autoComplete="off" type="number" min={0.1} step={0.01} disabled={pinAutoMultiple} value={toDisplay(pinDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setPinDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={pinAutoMultiple} onChange={(e) => setPinAutoMultiple(e.target.checked)} /> 1.92·m
                </label>
              </div>
              {anyContactWarn && <span className="hint" style={{ color: 'var(--warn)' }}>⚠ This pin contacts outside the usable flank (form–tip) — adjust the pin diameter for a valid measurement.</span>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Torque and duty
                <InfoTooltip>The transmitted torque, the flank engagement length (roughly the pitch diameter is a common starting point), and the duty factors that scale the design stress: application (Ka), and either fatigue life (Kf, fixed splines) or misalignment + wear (Km, Kw, sliding splines).</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Applied torque ({torqueUnit})</label>
                <input autoComplete="off" type="number" min={0} value={toDisplay(appliedTorqueNm, unitSystem, UNIT_TORQUE)} onChange={(e) => setAppliedTorqueNm(fromDisplay(Number(e.target.value), unitSystem, UNIT_TORQUE))} />
              </div>
              <div className="field">
                <label>Engagement length L ({lenUnit})</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(engagementLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setEngagementLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  <button className="btn small" title="Set L equal to the pitch diameter" onClick={() => setEngagementLengthMm(geometry.pitchDiaMm)}>= D</button>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Fit type</label>
              <div className="segmented">
                <button className={fitType === 'fixed' ? 'active' : ''} onClick={() => setFitType('fixed')}>Fixed (non-sliding)</button>
                <button className={fitType === 'flexible' ? 'active' : ''} onClick={() => setFitType('flexible')}>Flexible (sliding)</button>
              </div>
              <span className="hint">{fitType === 'fixed' ? 'Fatigue governs: Ks = Ka/Kf.' : 'Wear governs: Ks = Ka·Km·Kd/Kw.'}</span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Power source</label>
                <select value={powerSourceId} onChange={(e) => setPowerSourceId(e.target.value)}>
                  {APPLICATION_FACTORS.map((r) => <option key={r.id} value={r.id}>{r.powerSource}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Driven load</label>
                <select value={loadCharacterId} onChange={(e) => setLoadCharacterId(e.target.value as LoadCharacterId)}>
                  {LOAD_CHARACTERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
            </div>
            {fitType === 'fixed' ? (
              <div className="grid grid-2">
                <div className="field">
                  <label>Torque cycles</label>
                  <input autoComplete="off" type="number" min={1} value={torqueCycles} onChange={(e) => setTorqueCycles(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Load direction</label>
                  <div className="segmented">
                    <button className={!reversed ? 'active' : ''} onClick={() => setReversed(false)}>Unidirectional</button>
                    <button className={reversed ? 'active' : ''} onClick={() => setReversed(true)}>Reversed</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="field">
                  <label>Wear cycles (revolutions)</label>
                  <input autoComplete="off" type="number" min={1} value={wearRevolutions} onChange={(e) => setWearRevolutions(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Load distribution Km</label>
                  <input autoComplete="off" type="number" min={1} max={4} step={0.1} value={loadDistributionFactor} onChange={(e) => setLoadDistributionFactor(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Material</span></div>
            <div className="field">
              <label>Spline material</label>
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={customMaterial}>
                {SPLINE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <span className="hint">{baseMaterial.hardness} · UTS {fmt(baseMaterial.utsMPa, 0)} MPa · allow σc {fmt(baseMaterial.allowCompressiveMPa, 0)} / τ {fmt(baseMaterial.allowShearMPa, 0)} MPa</span>
            </div>
            <PremiumGate feature="Custom spline material">
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem', marginBottom: customMaterial ? '0.5rem' : 0 }}>
                <input type="checkbox" checked={customMaterial} onChange={(e) => setCustomMaterial(e.target.checked)} /> Enter custom allowable stresses
              </label>
              {customMaterial && (
                <div className="grid grid-2">
                  <div className="field">
                    <label>Allowable compressive ({stressUnit})</label>
                    <input autoComplete="off" type="number" min={1} value={toDisplay(customCompMPa, unitSystem, UNIT_STRESS)} onChange={(e) => setCustomCompMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                  </div>
                  <div className="field">
                    <label>Allowable shear ({stressUnit})</label>
                    <input autoComplete="off" type="number" min={1} value={toDisplay(customShearMPa, unitSystem, UNIT_STRESS)} onChange={(e) => setCustomShearMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                  </div>
                </div>
              )}
            </PremiumGate>
          </div>
        </div>

        {/* RIGHT — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className={`status-banner ${rating.pass ? 'pass' : 'fail'}`}>
              {rating.pass
                ? `✓ Capacity ${fmt(rating.torqueCapacityNm, 0)} N·m ≥ applied ${fmt(appliedTorqueNm, 0)} N·m — SF ${fmt(rating.safetyFactor, 2)}`
                : `✗ Capacity ${fmt(rating.torqueCapacityNm, 0)} N·m below applied ${fmt(appliedTorqueNm, 0)} N·m — governed by ${rating.governingMode}`}
            </div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Torque capacity</div>
                <div className={`value ${rating.pass ? 'pos' : 'neg'}`}>{fmt(toDisplay(rating.torqueCapacityNm, unitSystem, UNIT_TORQUE), 0)}<span className="unit">{torqueUnit}</span></div>
                <div className="hint">governed by {rating.governingMode}</div>
              </div>
              <div className="result-tile">
                <div className="label">Safety factor</div>
                <div className={`value ${rating.pass ? 'pos' : 'neg'}`}>{fmt(rating.safetyFactor, 2)}</div>
                <div className="hint">capacity / applied torque</div>
              </div>
              <div className="result-tile">
                <div className="label">Pitch diameter D</div>
                <div className="value">{lenU(geometry.pitchDiaMm, unitSystem, 2)}<span className="unit">{lenUnit}</span></div>
                <div className="hint">major Dee {lenU(geometry.majorDiaMm, unitSystem, 2)} {lenUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Measurement over pins</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>{lenU(geometry.measurementOverPinsMm, unitSystem, 3)}<span className="unit">{lenUnit}</span></div>
                <div className="hint">over Ø{fmt(geometry.pinDiameterMm, 3)} mm pins</div>
              </div>
              <div className="result-tile">
                <div className="label">Tooth shear stress</div>
                <div className={`value ${rating.shearStressMPa <= material.allowShearMPa ? 'pos' : 'neg'}`}>{fmt(toDisplay(rating.shearStressMPa, unitSystem, UNIT_STRESS), 1)}<span className="unit">{stressUnit}</span></div>
                <div className="hint">allow {fmt(toDisplay(material.allowShearMPa, unitSystem, UNIT_STRESS), 0)} {stressUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Flank bearing stress</div>
                <div className={`value ${rating.compressiveStressMPa <= material.allowCompressiveMPa ? 'pos' : 'neg'}`}>{fmt(toDisplay(rating.compressiveStressMPa, unitSystem, UNIT_STRESS), 1)}<span className="unit">{stressUnit}</span></div>
                <div className="hint">allow {fmt(toDisplay(material.allowCompressiveMPa, unitSystem, UNIT_STRESS), 0)} {stressUnit}</div>
              </div>
            </div>
            {smallestForTorque && !rating.pass && (
              <p className="note" style={{ color: 'var(--warn)' }}>
                ⚠ At this module and profile, the smallest spline meeting {fmt(appliedTorqueNm, 0)} N·m is z = {smallestForTorque.teeth} (pitch Ø {fmt(smallestForTorque.pitchDiaMm, 1)} mm). Increase tooth count, module, engagement length, or use a stronger material.
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-title">Spline dimensions (drawing-ready)</div>
            <table className="data-table">
              <tbody>
                {dimensionRows.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{r.value}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Nominal (basic / maximum-material) dimensions. The toleranced range for a chosen fit and tolerance class (4H/4h…7H/7h) is per ISO 4156-2.</p>
          </div>

          <div className="card">
            <div className="card-title">Tooth profile</div>
            <SplineProfileDiagram geometry={geometry} unitSystem={unitSystem} />
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Mating hub & torque-vs-diameter
                <InfoTooltip>The internal (hub) mating dimensions to pair with this shaft spline, and how torque capacity grows with pitch diameter across the standard tooth-count series at this module.</InfoTooltip>
              </span>
            </div>
            <PremiumGate feature="Mating hub dimensions & torque-vs-diameter sweep">
              <table className="data-table">
                <tbody>
                  <tr><td>Internal major (hub root) Dei</td><td style={{ textAlign: 'right' }}>{lenU(geometry.internalMajorDiaMm, unitSystem, 3)} {lenUnit}</td></tr>
                  <tr><td>Internal minor (hub tip) Dii</td><td style={{ textAlign: 'right' }}>{lenU(geometry.internalMinorDiaMm, unitSystem, 3)} {lenUnit}</td></tr>
                  <tr><td>Base circle Db</td><td style={{ textAlign: 'right' }}>{lenU(geometry.baseDiaMm, unitSystem, 3)} {lenUnit}</td></tr>
                </tbody>
              </table>
              <button className={`btn small ${sweepMode ? 'primary' : ''}`} style={{ marginTop: '0.6rem' }} onClick={() => setSweepMode((v) => !v)}>
                {sweepMode ? 'Hide torque-vs-diameter sweep' : 'Show torque-vs-diameter sweep'}
              </button>
              {sweep && (
                <table className="data-table" style={{ marginTop: '0.6rem' }}>
                  <thead><tr><th>z</th><th>Pitch Ø</th><th>Major Ø</th><th>Capacity</th><th>Meets {fmt(appliedTorqueNm, 0)} N·m</th></tr></thead>
                  <tbody>
                    {sweep.map((s) => (
                      <tr key={s.teeth}>
                        <td>{s.teeth}</td>
                        <td>{lenU(s.pitchDiaMm, unitSystem, 1)} {lenUnit}</td>
                        <td>{lenU(s.majorDiaMm, unitSystem, 1)} {lenUnit}</td>
                        <td>{fmt(toDisplay(s.torqueCapacityNm, unitSystem, UNIT_TORQUE), 0)} {torqueUnit}</td>
                        <td className={s.meetsTarget ? 'pass' : 'fail'}>{s.meetsTarget ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PremiumGate>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/spline-sizing" />
        <p className="note">
          Geometry follows <b>ISO 4156-1 / ANSI B92.2M</b> (straight cylindrical involute splines, metric
          module, side fit): pitch diameter D = m·z, base diameter Db = m·z·cos α, external major diameter
          Dee = m·(z + a) and root diameter Die = m·(z − b) with the standard addendum/dedendum coefficients
          for the 30°, 37.5° and 45° pressure angles, basic circular tooth thickness s = 0.5·π·m, and the
          measurement over two pins from inv φ = s/D + inv α + DR/Db − π/z, MRe = Db/cos φ + DR (even tooth
          counts; the odd-count form multiplies by cos(90°/z)). The 30° profile is shared by ANSI B92.1 and
          DIN 5480. Torque capacity uses the <b>SAE / ANSI B92.1 (Dudley)</b> method: tooth shear
          τ = 2·T·Ks/(L·z·t·D), flank compressive (bearing) stress σc = 2·T·Ks/(L·z·h·D) with engagement
          height h = 0.9·m (flat root) or 1.0·m (fillet root), and a torsional-shear check on the shaft core
          at the minor diameter τ = 16·T·Ks/(π·Die³). The service factor rolls up the application factor Ka,
          load-distribution factor Km, fatigue-life factor Kf and wear-life factor Kw (Ks = Ka/Kf for a fixed
          spline, Ka·Km·Kd/Kw for a sliding one) and is compared against representative material design
          strengths. Nominal minor/form diameters and the measurement over pins are at the basic
          (maximum-material) tooth thickness; the toleranced range for a chosen fit/tolerance class is per
          ISO 4156-2. The DXF profile is a nominal involute outline (reference/CAM starting geometry), not a
          toleranced manufacturing drawing.
        </p>
        <p className="note">
          <b>Validated:</b> for a 30° flat-root spline with module m = 0.5 mm and z = 10 teeth, this tool
          returns D = 5.000 mm, Db = 4.330 mm and Dee = 5.500 mm, matching the ISO 4156-2:2021 dimension
          table exactly, and a measurement over Ø1.06 mm pins of 6.716 mm — reproducing the standard's
          tabulated MRe (4h class, 6.683–6.701 mm at the toleranced tooth thickness) once the basic
          maximum-material tooth thickness is used. The odd-tooth case (z = 11, Ø1.00 mm pins) returns
          7.005 mm against the standard's 6.966–6.989 mm band, and the SAE torque-capacity formulae reproduce
          hand calculations for the flank-bearing and tooth-shear limits.
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
