import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_FORCE, UNIT_TORQUE, UNIT_STRESS } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData, type ReportGridTable } from '../lib/pdfExport';
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
import BeamResponseChart from '../components/BeamResponseChart';
import ShaftElevationDiagram from '../components/ShaftElevationDiagram';
import { SHAFT_MATERIALS, SURFACE_FINISHES, RELIABILITY_OPTIONS, STRESS_FEATURE_LIST, FATIGUE_CRITERIA, type FatigueCriterionId, type StressFeatureId } from '../lib/shaftData';
import { solveShaft, totalLength, type ShaftInput, type ShaftSection, type TransverseLoad, type TorqueLoad, type Disk, type StationFeature } from '../lib/shaftPhysics';

const FREE_SECTION_CAP = 4;
const MAX_SECTION_CAP = 10;

function fmt(n: number, d = 2): string { return !isFinite(n) ? '∞' : n.toLocaleString(undefined, { maximumFractionDigits: d }); }
function uid(): string { return Math.random().toString(36).slice(2, 9); }

type US = ReturnType<typeof useUnitSystem>['unitSystem'];
const lenU = (mm: number, us: US, d = 1) => fmt(toDisplay(mm, us, UNIT_LENGTH), us === 'imperial' ? d + 1 : d);

export default function ShaftSizingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenL = unitLabel(unitSystem, UNIT_LENGTH);
  const forceL = unitLabel(unitSystem, UNIT_FORCE);
  const torqueL = unitLabel(unitSystem, UNIT_TORQUE);
  const stressL = unitLabel(unitSystem, UNIT_STRESS);

  const [sections, setSections] = useState<ShaftSection[]>([
    { id: uid(), lengthMm: 60, odMm: 30, idMm: 0, filletRadiusMm: 1.5 },
    { id: uid(), lengthMm: 120, odMm: 40, idMm: 0, filletRadiusMm: 2 },
    { id: uid(), lengthMm: 60, odMm: 30, idMm: 0, filletRadiusMm: 1.5 },
  ]);
  const [bearingAPosMm, setBearingAPosMm] = useState(20);
  const [bearingBPosMm, setBearingBPosMm] = useState(220);
  const [loads, setLoads] = useState<TransverseLoad[]>([{ id: uid(), label: 'Gear', positionMm: 120, magnitudeN: 3000, angleDeg: 0 }]);
  const [torques, setTorques] = useState<TorqueLoad[]>([
    { id: uid(), label: 'Drive in', positionMm: 20, torqueNm: 250 },
    { id: uid(), label: 'Load out', positionMm: 120, torqueNm: -250 },
  ]);
  const [disks, setDisks] = useState<Disk[]>([]);
  const [features, setFeatures] = useState<StationFeature[]>([]);
  const [materialId, setMaterialId] = useState('1045cd');
  const [customMaterial, setCustomMaterial] = useState(false);
  const [cSut, setCSut] = useState(630); const [cSy, setCSy] = useState(530);
  const [cE, setCE] = useState(205000); const [cG, setCG] = useState(80000); const [cRho, setCRho] = useState(7870);
  const [surfaceFinishId, setSurfaceFinishId] = useState('machined');
  const [reliabilityPct, setReliabilityPct] = useState(99);
  const [targetSafetyFactor, setTargetSafetyFactor] = useState(2);
  const [fatigueCriterion, setFatigueCriterion] = useState<FatigueCriterionId>('goodman');
  const [includeSelfWeight, setIncludeSelfWeight] = useState(false);

  const { isPremium, loading: entitlementLoading } = useEntitlement();
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setCustomMaterial(false);
    if (fatigueCriterion !== 'goodman') setFatigueCriterion('goodman');
    setSections((s) => (s.length > FREE_SECTION_CAP ? s.slice(0, FREE_SECTION_CAP) : s));
    if (disks.length) setDisks([]);
    if (features.length) setFeatures([]);
  }, [isPremium, entitlementLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseMat = SHAFT_MATERIALS.find((m) => m.id === materialId) ?? SHAFT_MATERIALS[1];
  const material = useMemo(() => (customMaterial && isPremium
    ? { id: 'custom', label: 'Custom material', utsMPa: cSut, yieldMPa: cSy, eMPa: cE, gMPa: cG, densityKgM3: cRho }
    : baseMat), [customMaterial, isPremium, baseMat, cSut, cSy, cE, cG, cRho]);

  const input: ShaftInput = useMemo(() => ({
    sections, bearingAPosMm, bearingBPosMm, loads, torques, disks: isPremium ? disks : [], features: isPremium ? features : [],
    material, surfaceFinishId, reliabilityPct, targetSafetyFactor, fatigueCriterion, includeSelfWeight,
  }), [sections, bearingAPosMm, bearingBPosMm, loads, torques, disks, features, isPremium, material, surfaceFinishId, reliabilityPct, targetSafetyFactor, fatigueCriterion, includeSelfWeight]);

  const result = useMemo(() => solveShaft(input), [input]);
  const gov = result.governing;
  const pass = gov ? gov.fatigueSafety >= targetSafetyFactor : true;
  const L = totalLength(sections);

  // ── list editors ──
  const patchSection = (id: string, k: keyof ShaftSection, v: number) => setSections((s) => s.map((x) => x.id === id ? { ...x, [k]: v } : x));
  const addSection = () => setSections((s) => s.length < (isPremium ? MAX_SECTION_CAP : FREE_SECTION_CAP) ? [...s, { id: uid(), lengthMm: 60, odMm: 30, idMm: 0, filletRadiusMm: 1.5 }] : s);
  const delSection = (id: string) => setSections((s) => s.length > 1 ? s.filter((x) => x.id !== id) : s);
  const patchLoad = (id: string, k: keyof TransverseLoad, v: number | string) => setLoads((s) => s.map((x) => x.id === id ? { ...x, [k]: v } : x));
  const patchTorque = (id: string, k: keyof TorqueLoad, v: number | string) => setTorques((s) => s.map((x) => x.id === id ? { ...x, [k]: v } : x));

  const getInputs = useCallback((): Record<string, unknown> => ({
    sections, bearingAPosMm, bearingBPosMm, loads, torques, disks, features, materialId, customMaterial, cSut, cSy, cE, cG, cRho,
    surfaceFinishId, reliabilityPct, targetSafetyFactor, fatigueCriterion, includeSelfWeight,
  }), [sections, bearingAPosMm, bearingBPosMm, loads, torques, disks, features, materialId, customMaterial, cSut, cSy, cE, cG, cRho, surfaceFinishId, reliabilityPct, targetSafetyFactor, fatigueCriterion, includeSelfWeight]);
  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (Array.isArray(v.sections)) setSections(v.sections);
    if (v.bearingAPosMm != null) setBearingAPosMm(v.bearingAPosMm);
    if (v.bearingBPosMm != null) setBearingBPosMm(v.bearingBPosMm);
    if (Array.isArray(v.loads)) setLoads(v.loads);
    if (Array.isArray(v.torques)) setTorques(v.torques);
    if (Array.isArray(v.disks)) setDisks(v.disks);
    if (Array.isArray(v.features)) setFeatures(v.features);
    if (v.materialId) setMaterialId(v.materialId);
    if (v.customMaterial != null) setCustomMaterial(v.customMaterial);
    if (v.cSut != null) setCSut(v.cSut); if (v.cSy != null) setCSy(v.cSy); if (v.cE != null) setCE(v.cE); if (v.cG != null) setCG(v.cG); if (v.cRho != null) setCRho(v.cRho);
    if (v.surfaceFinishId) setSurfaceFinishId(v.surfaceFinishId);
    if (v.reliabilityPct != null) setReliabilityPct(v.reliabilityPct);
    if (v.targetSafetyFactor != null) setTargetSafetyFactor(v.targetSafetyFactor);
    if (v.fatigueCriterion) setFatigueCriterion(v.fatigueCriterion);
    if (v.includeSelfWeight != null) setIncludeSelfWeight(v.includeSelfWeight);
  }, []);
  const saved = useSavedCalculations('shaft-sizing');
  const shareLink = useShareableLink(restoreInputs);

  const stationMarks = result.stations.map((s) => ({ positionMm: s.positionMm, governing: s.governing, label: s.label }));

  const calcSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      { title: 'Bearing reactions (statics)', formula: 'ΣF = 0, ΣM_A = 0 in each plane, resultant = √(Ry² + Rz²)', substitution: `loads resolved into vertical/horizontal planes`, result: `R_A = ${fmt(result.reactionA_N, 0)} N, R_B = ${fmt(result.reactionB_N, 0)} N` },
      { title: 'Resultant bending moment', formula: 'M(x) = √(M_y(x)² + M_z(x)²)', substitution: `two-plane moment diagrams`, result: `M_max = ${fmt(result.maxMomentNmm / 1000, 1)} N·m at x = ${fmt(result.maxMomentAtMm, 0)} mm` },
    ];
    if (gov) {
      steps.push(
        { title: 'Endurance limit at the governing station (Marin)', formula: "Se = ka·kb·ke·Se',  Se' = 0.5·Sut", substitution: `${material.label}, ${SURFACE_FINISHES.find((s) => s.id === surfaceFinishId)?.label} finish, ${reliabilityPct}% reliability, d = ${fmt(gov.odMm, 1)} mm`, result: `Se = ${fmt(gov.seMPa, 1)} MPa` },
        { title: 'Stress-concentration factors', formula: 'Kf = 1 + q(Kt − 1),  Kfs = 1 + qs(Kts − 1)', substitution: `${gov.label}: Kt = ${fmt(gov.Kt, 2)}, Kts = ${fmt(gov.Kts, 2)}`, result: `Kf = ${fmt(gov.Kf, 2)}, Kfs = ${fmt(gov.Kfs, 2)}` },
        { title: 'von Mises alternating & midrange stress', formula: "σ'a = Kf·32·M/(π·d³) (reversed bending), σ'm = √3·Kfs·16·T/(π·d³) (steady torque)", substitution: `M = ${fmt(gov.bendingMomentNmm / 1000, 1)} N·m, T = ${fmt(gov.torqueNmm / 1000, 1)} N·m`, result: `σ'a = ${fmt(gov.sigmaAMPa, 1)} MPa, σ'm = ${fmt(gov.sigmaMMPa, 1)} MPa` },
        { title: `Fatigue safety (${FATIGUE_CRITERIA.find((c) => c.id === fatigueCriterion)?.label})`, formula: '1/n = σ\'a/Se + σ\'m/Sut (Goodman)', substitution: `Se = ${fmt(gov.seMPa, 0)} MPa, Sut = ${fmt(material.utsMPa, 0)} MPa`, result: `n_fatigue = ${fmt(gov.fatigueSafety, 2)} · n_yield = ${fmt(gov.staticSafety, 2)}` },
      );
    }
    return steps;
  }, [result, gov, material, surfaceFinishId, reliabilityPct, fatigueCriterion]);

  const handleExportPdf = () => {
    const inputSections: ReportSection[] = [
      { heading: 'Shaft geometry', rows: sections.map((s, i) => ({ label: `Section ${i + 1}`, value: `L=${fmt(s.lengthMm, 1)} mm, Ø${fmt(s.odMm, 1)}${s.idMm > 0 ? `/${fmt(s.idMm, 1)} bore` : ''} mm, fillet r=${fmt(s.filletRadiusMm, 2)} mm` })) },
      { heading: 'Supports & material', rows: [
        { label: 'Bearings A / B', value: `${fmt(bearingAPosMm, 0)} / ${fmt(bearingBPosMm, 0)} mm` },
        { label: 'Material', value: `${material.label} (Sut ${fmt(material.utsMPa, 0)}, Sy ${fmt(material.yieldMPa, 0)} MPa)` },
        { label: 'Finish / reliability', value: `${SURFACE_FINISHES.find((s) => s.id === surfaceFinishId)?.label}, ${reliabilityPct}%` },
        { label: 'Fatigue criterion / target n', value: `${FATIGUE_CRITERIA.find((c) => c.id === fatigueCriterion)?.label}, ${fmt(targetSafetyFactor, 2)}` },
      ] },
      { heading: 'Loads', rows: [
        ...loads.map((l) => ({ label: l.label || 'Force', value: `${fmt(l.magnitudeN, 0)} N @ ${fmt(l.angleDeg, 0)}° at ${fmt(l.positionMm, 0)} mm` })),
        ...torques.map((t) => ({ label: t.label || 'Torque', value: `${fmt(t.torqueNm, 1)} N·m at ${fmt(t.positionMm, 0)} mm` })),
      ] },
    ];
    const outputSections: ReportSection[] = [{ heading: 'Results', rows: [
      { label: 'Reactions A / B', value: `${fmt(result.reactionA_N, 0)} / ${fmt(result.reactionB_N, 0)} N` },
      { label: 'Max bending moment', value: `${fmt(result.maxMomentNmm / 1000, 1)} N·m at ${fmt(result.maxMomentAtMm, 0)} mm` },
      { label: 'Governing station', value: gov ? `${gov.label} — n_fatigue ${fmt(gov.fatigueSafety, 2)}, n_yield ${fmt(gov.staticSafety, 2)}` : '—' },
      { label: 'Required Ø at governing (solid)', value: gov ? `${fmt(gov.requiredDiaMm, 1)} mm` : '—' },
      { label: 'Max deflection', value: `${fmt(result.maxDeflMm, 4)} mm at ${fmt(result.maxDeflAtMm, 0)} mm` },
      { label: 'Slope at bearings A / B', value: `${fmt(result.slopeADeg, 4)} / ${fmt(result.slopeBDeg, 4)}°` },
      { label: 'Angle of twist', value: `${fmt(result.angleOfTwistDeg, 3)}°` },
      { label: 'First critical speed', value: result.criticalSpeedRpm ? `${fmt(result.criticalSpeedRpm, 0)} rpm` : '—' },
    ] }];
    const gridTables: ReportGridTable[] = [{
      title: 'Per-station safety',
      rowLabels: result.stations.map((s) => s.label),
      colLabels: [`x (mm)`, `Ø (mm)`, 'Kf', 'Kfs', 'n_fatigue', 'n_yield', 'req Ø (mm)'],
      cellValues: result.stations.map((s) => [fmt(s.positionMm, 0), fmt(s.odMm, 1), fmt(s.Kf, 2), fmt(s.Kfs, 2), fmt(s.fatigueSafety, 2), fmt(s.staticSafety, 2), fmt(s.requiredDiaMm, 1)]),
      highlightRow: result.stations.findIndex((s) => s.governing),
    }];
    exportReportToPdf({
      tabName: 'Shaft_Sizing', pageTitle: 'Shaft Sizing Calculator', accentHex,
      passStatus: gov ? { pass, label: pass ? `Governing fatigue SF ${fmt(gov.fatigueSafety, 2)} ≥ target ${fmt(targetSafetyFactor, 2)}` : `Governing fatigue SF ${fmt(gov.fatigueSafety, 2)} below target ${fmt(targetSafetyFactor, 2)} at ${gov.label}` } : undefined,
      inputSections, outputSections, calculationSteps: calcSteps, gridTables,
      disclaimer: 'Engineering sizing/analysis tool for a rotating stepped shaft to Shigley / ASME B106.1M practice. It resolves the two-plane bending-moment and torque diagrams for a shaft on two simple bearing supports, then at each shoulder and declared feature evaluates the static (first-cycle-yield) and distortion-energy fatigue factors of safety, using a full Marin endurance limit, the Peterson/Pilkey shoulder-fillet stress-concentration fits, and Neuber notch sensitivity. It assumes a rotating shaft (fully-reversed bending, steady torque), linear-elastic behaviour, rigid bearings modelled as simple supports, and does not model axial load, gyroscopic effects, bearing stiffness, residual stress, or true multi-body torsional/lateral mode shapes (the critical speed is a first-mode Rayleigh estimate). Confirm against a detailed FEA / durability assessment and the applicable standards before production use.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Shaft Sizing Calculator</div>
          <h1>Shaft Sizing Calculator</h1>
          <p>
            Analyse a rotating stepped shaft (solid or hollow) on two bearings under combined bending and
            torsion — two-plane moment diagram, static and fatigue safety at every shoulder (Shigley / ASME
            with a full Marin endurance limit and Peterson stress-concentration factors), deflection, angle of
            twist, and the first critical speed.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
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
            <div className="card-title"><span><span className="step-num">1</span>Shaft geometry
              <InfoTooltip>Build the shaft left-to-right from cylindrical sections. Each has a length, outer diameter, optional bore (for a hollow shaft), and the fillet radius at the step to the next section (which sets the shoulder stress concentration). Diameter changes become evaluation stations.</InfoTooltip>
            </span></div>
            {sections.map((s) => (
              <div key={s.id} className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>L ({lenL})</label><input type="number" min={1} value={toDisplay(s.lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchSection(s.id, 'lengthMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>OD ({lenL})</label><input type="number" min={1} value={toDisplay(s.odMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchSection(s.id, 'odMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>bore ({lenL})</label><input type="number" min={0} value={toDisplay(s.idMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchSection(s.id, 'idMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>fillet r</label><input type="number" min={0} step={0.1} value={toDisplay(s.filletRadiusMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchSection(s.id, 'filletRadiusMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <button className="btn small" title="Remove" onClick={() => delSection(s.id)} disabled={sections.length <= 1}>✕</button>
              </div>
            ))}
            {sections.length < FREE_SECTION_CAP ? (
              <button className="btn small" onClick={addSection}>+ Add section</button>
            ) : isPremium && sections.length < MAX_SECTION_CAP ? (
              <button className="btn small" onClick={addSection}>+ Add section ({sections.length}/{MAX_SECTION_CAP})</button>
            ) : !isPremium ? (
              <PremiumGate feature={`More than ${FREE_SECTION_CAP} sections (up to ${MAX_SECTION_CAP})`}><span /></PremiumGate>
            ) : <span className="hint">Maximum {MAX_SECTION_CAP} sections.</span>}
            <div className="grid grid-2" style={{ marginTop: '0.6rem' }}>
              <div className="field"><label>Bearing A position ({lenL})</label><input type="number" min={0} value={toDisplay(bearingAPosMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBearingAPosMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
              <div className="field"><label>Bearing B position ({lenL})</label><input type="number" min={0} value={toDisplay(bearingBPosMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBearingBPosMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
            </div>
            <span className="hint">Total length {lenU(L, unitSystem, 0)} {lenL}. Bearings must sit within the shaft.</span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Transverse loads
              <InfoTooltip>Radial forces from gears, pulleys, sprockets or belt tension. The angle sets the plane (0° vertical, 90° horizontal) so combined-plane bending is handled. Position is measured from the left end.</InfoTooltip>
            </span></div>
            {loads.map((l) => (
              <div key={l.id} className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 0.9fr auto', gap: '0.4rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>label</label><input value={l.label} onChange={(e) => patchLoad(l.id, 'label', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>F ({forceL})</label><input type="number" min={0} value={toDisplay(l.magnitudeN, unitSystem, UNIT_FORCE)} onChange={(e) => patchLoad(l.id, 'magnitudeN', fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>pos ({lenL})</label><input type="number" min={0} value={toDisplay(l.positionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchLoad(l.id, 'positionMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>angle°</label><input type="number" value={l.angleDeg} onChange={(e) => patchLoad(l.id, 'angleDeg', Number(e.target.value))} /></div>
                <button className="btn small" onClick={() => setLoads((s) => s.filter((x) => x.id !== l.id))}>✕</button>
              </div>
            ))}
            <button className="btn small" onClick={() => setLoads((s) => [...s, { id: uid(), label: 'Load', positionMm: Math.round(L / 2), magnitudeN: 1000, angleDeg: 0 }])} disabled={!isPremium && loads.length >= 3}>+ Add load</button>
            {!isPremium && loads.length >= 3 && <span className="hint"> Free tier: up to 3 loads.</span>}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Torque
              <InfoTooltip>Torque enters at the drive and leaves at the driven feature(s). Enter positive for torque in, negative for torque out; the values must sum to zero. The running sum gives the torque diagram T(x).</InfoTooltip>
            </span></div>
            {torques.map((t) => (
              <div key={t.id} className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>label</label><input value={t.label} onChange={(e) => patchTorque(t.id, 'label', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>T ({torqueL})</label><input type="number" value={toDisplay(t.torqueNm, unitSystem, UNIT_TORQUE)} onChange={(e) => patchTorque(t.id, 'torqueNm', fromDisplay(Number(e.target.value), unitSystem, UNIT_TORQUE))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>pos ({lenL})</label><input type="number" min={0} value={toDisplay(t.positionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchTorque(t.id, 'positionMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <button className="btn small" onClick={() => setTorques((s) => s.filter((x) => x.id !== t.id))}>✕</button>
              </div>
            ))}
            <button className="btn small" onClick={() => setTorques((s) => [...s, { id: uid(), label: 'Torque', positionMm: Math.round(L / 2), torqueNm: 0 }])}>+ Add torque</button>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Material &amp; duty</span></div>
            <div className="field">
              <label>Material</label>
              <select value={materialId} disabled={customMaterial} onChange={(e) => setMaterialId(e.target.value)}>
                {SHAFT_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <span className="hint">Sut {fmt(baseMat.utsMPa, 0)} · Sy {fmt(baseMat.yieldMPa, 0)} MPa · E {fmt(baseMat.eMPa / 1000, 0)} GPa</span>
            </div>
            <PremiumGate feature="Custom shaft material">
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem', marginBottom: customMaterial ? '0.5rem' : 0 }}>
                <input type="checkbox" checked={customMaterial} onChange={(e) => setCustomMaterial(e.target.checked)} /> Custom material
              </label>
              {customMaterial && (
                <div className="grid grid-2">
                  <div className="field"><label>Sut ({stressL})</label><input type="number" value={toDisplay(cSut, unitSystem, UNIT_STRESS)} onChange={(e) => setCSut(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} /></div>
                  <div className="field"><label>Sy ({stressL})</label><input type="number" value={toDisplay(cSy, unitSystem, UNIT_STRESS)} onChange={(e) => setCSy(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} /></div>
                  <div className="field"><label>E (MPa)</label><input type="number" value={cE} onChange={(e) => setCE(Number(e.target.value))} /></div>
                  <div className="field"><label>ρ (kg/m³)</label><input type="number" value={cRho} onChange={(e) => setCRho(Number(e.target.value))} /></div>
                </div>
              )}
            </PremiumGate>
            <div className="grid grid-2" style={{ marginTop: '0.6rem' }}>
              <div className="field"><label>Surface finish</label><select value={surfaceFinishId} onChange={(e) => setSurfaceFinishId(e.target.value)}>{SURFACE_FINISHES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div className="field"><label>Reliability</label><select value={reliabilityPct} onChange={(e) => setReliabilityPct(Number(e.target.value))}>{RELIABILITY_OPTIONS.map((r) => <option key={r.pct} value={r.pct}>{r.pct}%</option>)}</select></div>
              <div className="field"><label>Target safety factor</label><input type="number" min={1} step={0.1} value={targetSafetyFactor} onChange={(e) => setTargetSafetyFactor(Number(e.target.value))} /></div>
              <div className="field"><label>Fatigue criterion</label>
                {isPremium ? (
                  <select value={fatigueCriterion} onChange={(e) => setFatigueCriterion(e.target.value as FatigueCriterionId)}>{FATIGUE_CRITERIA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                ) : (
                  <PremiumGate feature="Alternative fatigue criteria (Gerber / elliptic / Soderberg)"><span /></PremiumGate>
                )}
                {!isPremium && <span className="hint">DE-Goodman (free)</span>}
              </div>
            </div>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.4rem' }}>
              <input type="checkbox" checked={includeSelfWeight} onChange={(e) => setIncludeSelfWeight(e.target.checked)} /> Include shaft self-weight in bending
            </label>
          </div>

          <div className="card">
            <div className="card-title"><span>Advanced: extra risers &amp; rotor disks
              <InfoTooltip>Add keyway/groove/custom stress risers at any position, and rotor/gear disk masses for the critical-speed calculation (the shaft's own mass is always included).</InfoTooltip>
            </span></div>
            <PremiumGate feature="Keyway / groove features & rotor disks">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>Stress features</div>
              {features.map((f) => (
                <div key={f.id} className="grid" style={{ gridTemplateColumns: '1.4fr 1fr auto', gap: '0.4rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                  <div className="field" style={{ margin: 0 }}><select value={f.featureId} onChange={(e) => setFeatures((s) => s.map((x) => x.id === f.id ? { ...x, featureId: e.target.value as StressFeatureId } : x))}>{STRESS_FEATURE_LIST.filter((x) => x.id !== 'shoulder-fillet').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
                  <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>pos ({lenL})</label><input type="number" min={0} value={toDisplay(f.positionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFeatures((s) => s.map((x) => x.id === f.id ? { ...x, positionMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) } : x))} /></div>
                  <button className="btn small" onClick={() => setFeatures((s) => s.filter((x) => x.id !== f.id))}>✕</button>
                </div>
              ))}
              <button className="btn small" onClick={() => setFeatures((s) => [...s, { id: uid(), positionMm: Math.round(L / 2), featureId: 'keyseat-profile' }])}>+ Add feature</button>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.6rem 0 0.3rem' }}>Rotor disks (critical speed)</div>
              {disks.map((dk) => (
                <div key={dk.id} className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                  <div className="field" style={{ margin: 0 }}><input value={dk.label} onChange={(e) => setDisks((s) => s.map((x) => x.id === dk.id ? { ...x, label: e.target.value } : x))} /></div>
                  <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>mass (kg)</label><input type="number" min={0} value={dk.massKg} onChange={(e) => setDisks((s) => s.map((x) => x.id === dk.id ? { ...x, massKg: Number(e.target.value) } : x))} /></div>
                  <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>pos ({lenL})</label><input type="number" min={0} value={toDisplay(dk.positionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDisks((s) => s.map((x) => x.id === dk.id ? { ...x, positionMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) } : x))} /></div>
                  <button className="btn small" onClick={() => setDisks((s) => s.filter((x) => x.id !== dk.id))}>✕</button>
                </div>
              ))}
              <button className="btn small" onClick={() => setDisks((s) => [...s, { id: uid(), label: 'Rotor', positionMm: Math.round(L / 2), massKg: 10 }])}>+ Add disk</button>
            </PremiumGate>
          </div>
        </div>

        {/* RIGHT — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            {result.warnings.map((w, i) => <p key={i} className="note" style={{ color: 'var(--warn)' }}>⚠ {w}</p>)}
            {gov && (
              <div className={`status-banner ${pass ? 'pass' : 'fail'}`}>
                {pass ? `✓ Governing fatigue SF ${fmt(gov.fatigueSafety, 2)} ≥ target ${fmt(targetSafetyFactor, 2)} (${gov.label})` : `✗ Governing fatigue SF ${fmt(gov.fatigueSafety, 2)} below target ${fmt(targetSafetyFactor, 2)} at ${gov.label}`}
              </div>
            )}
            <div className="result-grid">
              <div className="result-tile"><div className="label">Governing fatigue SF</div><div className={`value ${pass ? 'pos' : 'neg'}`}>{fmt(gov?.fatigueSafety ?? 0, 2)}</div><div className="hint">{gov?.label} · Ø{fmt(gov?.odMm ?? 0, 1)} {lenL}</div></div>
              <div className="result-tile"><div className="label">Static (yield) SF</div><div className={`value ${(gov?.staticSafety ?? 0) >= 1 ? 'pos' : 'neg'}`}>{fmt(gov?.staticSafety ?? 0, 2)}</div><div className="hint">first-cycle von Mises</div></div>
              <div className="result-tile"><div className="label">Required Ø (governing)</div><div className="value">{lenU(gov?.requiredDiaMm ?? 0, unitSystem, 1)}<span className="unit">{lenL}</span></div><div className="hint">solid, for SF {fmt(targetSafetyFactor, 1)}</div></div>
              <div className="result-tile"><div className="label">Max bending moment</div><div className="value">{fmt(result.maxMomentNmm / 1000, 1)}<span className="unit">N·m</span></div><div className="hint">at {fmt(result.maxMomentAtMm, 0)} {lenL}</div></div>
              <div className="result-tile"><div className="label">Max deflection</div><div className="value">{lenU(result.maxDeflMm, unitSystem, 3)}<span className="unit">{lenL}</span></div><div className="hint">slope A/B {fmt(result.slopeADeg, 3)}/{fmt(result.slopeBDeg, 3)}°</div></div>
              <div className="result-tile"><div className="label">Angle of twist</div><div className="value">{fmt(result.angleOfTwistDeg, 3)}<span className="unit">°</span></div><div className="hint">reactions {fmt(result.reactionA_N, 0)}/{fmt(result.reactionB_N, 0)} N</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Shaft elevation</div>
            <ShaftElevationDiagram sections={sections} bearingAPosMm={bearingAPosMm} bearingBPosMm={bearingBPosMm} loads={loads} stations={stationMarks} unitSystem={unitSystem} />
          </div>

          <div className="card">
            <div className="card-title">Bending moment (resultant)</div>
            <BeamResponseChart xs={result.xs} values={result.momentRes.map((m) => m / 1000)} color="var(--accent)" unit="N·m" valueLabel="Moment" decimals={1} />
          </div>
          <div className="card">
            <div className="card-title">Torque</div>
            <BeamResponseChart xs={result.xs} values={result.torque.map((t) => t / 1000)} color="var(--warn, #e0a000)" unit="N·m" valueLabel="Torque" decimals={1} />
          </div>

          <div className="card">
            <div className="card-title"><span>Per-station safety
              <InfoTooltip>Every shoulder (and any declared keyway/groove/custom feature) is a potential fatigue site. The governing station has the lowest fatigue safety factor.</InfoTooltip>
            </span></div>
            <table className="data-table">
              <thead><tr><th>Station</th><th>x</th><th>Ø</th>{isPremium && <><th>Kf</th><th>Kfs</th><th>Se</th></>}<th>n_fat</th><th>n_yld</th><th>req Ø</th></tr></thead>
              <tbody>
                {result.stations.map((s, i) => (
                  <tr key={i} className={s.governing ? 'fail' : ''}>
                    <td>{s.label}</td>
                    <td>{lenU(s.positionMm, unitSystem, 0)}</td>
                    <td>{lenU(s.odMm, unitSystem, 1)}</td>
                    {isPremium && <><td>{fmt(s.Kf, 2)}</td><td>{fmt(s.Kfs, 2)}</td><td>{fmt(s.seMPa, 0)}</td></>}
                    <td className={s.fatigueSafety >= targetSafetyFactor ? 'pass' : 'fail'}>{fmt(s.fatigueSafety, 2)}</td>
                    <td className={s.staticSafety >= 1 ? 'pass' : 'fail'}>{fmt(s.staticSafety, 2)}</td>
                    <td>{lenU(s.requiredDiaMm, unitSystem, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isPremium && <span className="hint">Upgrade for the full station table (Kf, Kfs, Se), extra keyway/groove risers, alternative fatigue criteria, and critical speed.</span>}
          </div>

          <div className="card">
            <div className="card-title"><span>First critical speed
              <InfoTooltip>The first lateral (whirl) critical speed by Rayleigh's method, from the static deflection under the shaft's own distributed mass plus any rotor disks. Keep the operating speed well below (or above, with care) this.</InfoTooltip>
            </span></div>
            <PremiumGate feature="Critical speed (Rayleigh)">
              {result.criticalSpeedRpm ? (
                <div className="result-grid"><div className="result-tile"><div className="label">1st critical speed</div><div className="value">{fmt(result.criticalSpeedRpm, 0)}<span className="unit">rpm</span></div><div className="hint">Rayleigh · {fmt(result.criticalSpeedRpm / 60, 1)} Hz</div></div></div>
              ) : <p className="hint">Add a rotor disk (or enable self-weight) to compute the critical speed.</p>}
            </PremiumGate>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/shaft-sizing" />
        <p className="note">
          The shaft is modelled as cylindrical (solid or hollow) sections on two simple bearing supports.
          Bearing reactions and the shear/bending-moment diagrams are resolved independently in the vertical
          and horizontal planes and combined to a resultant M(x) = √(M_y² + M_z²); the torque diagram is the
          running sum of the applied torques. Bending deflection comes from numerically integrating M/(E·I(x))
          twice with the section-varying I, fixing zero deflection at the two bearings; the angle of twist is
          ∫T/(G·J) dx. Each shoulder and declared feature is checked for <b>static</b> first-cycle yield
          (peak distortion-energy stress vs Sy) and <b>fatigue</b> by the distortion-energy criteria
          (DE-Goodman / Gerber / ASME-elliptic / Soderberg, Shigley Ch. 7), assuming a rotating shaft
          (fully-reversed bending, steady torque). The endurance limit uses the Marin factors
          Se = ka·kb·ke·(0.5·Sut) with ka = a·Sut^b for the surface finish, the rotating-beam size factor kb,
          and the reliability factor ke; the load factor is carried by the von Mises combination. Fatigue
          stress-concentration factors are Kf = 1 + q(Kt − 1) with the Peterson/Pilkey shoulder-fillet Kt fits
          (or Shigley Table 7-1 estimates for keyseats/grooves) and Neuber notch sensitivity q. The first
          lateral critical speed is a Rayleigh estimate from the self-weight-plus-disk deflection. Not modelled:
          axial load, bearing/support flexibility, gyroscopic and multi-mode dynamics, residual/mean bending
          stress, and stress-concentration interaction — confirm against detailed FEA and the applicable
          standards before production.
        </p>
        <p className="note">
          <b>Validated:</b> the four distortion-energy diameter equations reproduce Shigley's <i>Mechanical
          Engineering Design</i> Prob. 7-1 (A = 338.4, B = 265.5 N·m, Se = 210, Sut = 700, Sy = 560 MPa →
          d = 27.27 mm Goodman, 25.77 mm elliptic, 27.70 mm Soderberg at n = 2); the Marin surface factor
          (machined, Sut = 560 → ka = 0.84) and Neuber notch sensitivity (r = 1.07 mm → q = 0.72 bending,
          0.77 torsion) match Prob. 7-2; and a uniform simply-supported shaft reproduces the closed-form
          reactions (W/2), moment (WL/4), central deflection (WL³/48EI) and single-mass Rayleigh critical
          speed (ωc = √(g/δ)) to machine precision.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Calculation steps</div>
        {calcSteps.map((s, i) => (
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
