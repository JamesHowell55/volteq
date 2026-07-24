import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_FORCE, UNIT_MOMENT, UNIT_STRESS } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportGridTable } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import BoltPatternDiagram from '../components/BoltPatternDiagram';
import { ALL_SIZES, getFastenerSize, ALL_PROPERTY_CLASSES, getPropertyClass, FRICTION_PRESETS, getFrictionPreset, type HeadType } from '../lib/fastenerStandards';
import {
  generateRectangularPattern, generatePerimeterPattern, generateCircularPattern,
  computePatternGeometry, resolveLoadToCentroid, solveBoltPattern,
  boltShankAreaMm2, preloadFromTorqueSimple, torqueFromPreloadSimple,
  type BoltPoint, type BoltSpecInput,
} from '../lib/boltPatternPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  const v = n === 0 ? 0 : n;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type PatternType = 'rectangular' | 'perimeter' | 'circular' | 'custom';
type PreloadMode = 'torque' | 'direct';

export default function BoltPatternCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const forceUnit = unitLabel(unitSystem, UNIT_FORCE);
  const momentUnit = unitLabel(unitSystem, UNIT_MOMENT);
  const stressUnit = unitLabel(unitSystem, UNIT_STRESS);

  // ---- Pattern type + generators ----
  const [patternType, setPatternType] = useState<PatternType>('rectangular');
  const [rectColumns, setRectColumns] = useState(3);
  const [rectRows, setRectRows] = useState(2);
  const [rectSpacingXmm, setRectSpacingXmm] = useState(60);
  const [rectSpacingYmm, setRectSpacingYmm] = useState(80);

  const [perimWidthMm, setPerimWidthMm] = useState(200);
  const [perimHeightMm, setPerimHeightMm] = useState(120);
  const [perimBoltsX, setPerimBoltsX] = useState(3);
  const [perimBoltsY, setPerimBoltsY] = useState(2);

  const [circCount, setCircCount] = useState(6);
  const [circDiameterMm, setCircDiameterMm] = useState(150);
  const [circStartAngleDeg, setCircStartAngleDeg] = useState(0);

  // Ids are 0-based, matching the pattern generators' convention, so the
  // shared "bolt #{id+1}" display label is consistent across all pattern types.
  const [customPoints, setCustomPoints] = useState<{ id: number; xMm: number; yMm: number }[]>([
    { id: 0, xMm: 100, yMm: 50 },
    { id: 1, xMm: 100, yMm: -50 },
    { id: 2, xMm: -100, yMm: -50 },
    { id: 3, xMm: -100, yMm: 50 },
  ]);
  const addCustomPoint = () => setCustomPoints((prev) => [...prev, { id: (Math.max(-1, ...prev.map((p) => p.id)) + 1), xMm: 0, yMm: 0 }]);
  const updateCustomPoint = (id: number, patch: Partial<{ xMm: number; yMm: number }>) =>
    setCustomPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeCustomPoint = (id: number) => setCustomPoints((prev) => prev.filter((p) => p.id !== id));

  const points: BoltPoint[] = useMemo(() => {
    if (patternType === 'rectangular') return generateRectangularPattern({ columns: rectColumns, rows: rectRows, spacingXmm: rectSpacingXmm, spacingYmm: rectSpacingYmm });
    if (patternType === 'perimeter') return generatePerimeterPattern({ widthMm: perimWidthMm, heightMm: perimHeightMm, boltsPerXSide: perimBoltsX, boltsPerYSide: perimBoltsY });
    if (patternType === 'circular') return generateCircularPattern({ boltCount: circCount, diameterMm: circDiameterMm, startAngleDeg: circStartAngleDeg });
    return customPoints.map((p) => ({ id: p.id, xMm: p.xMm, yMm: p.yMm }));
  }, [patternType, rectColumns, rectRows, rectSpacingXmm, rectSpacingYmm, perimWidthMm, perimHeightMm, perimBoltsX, perimBoltsY, circCount, circDiameterMm, circStartAngleDeg, customPoints]);

  const geometry = useMemo(() => computePatternGeometry(points), [points]);

  // ---- Bolt spec ----
  const [sizeId, setSizeId] = useState('M10');
  const [propertyClassId, setPropertyClassId] = useState('8.8');
  const [headType, setHeadType] = useState<HeadType>('hexHead');
  const [frictionPresetId, setFrictionPresetId] = useState('lightlyOiled');
  const [customMu, setCustomMu] = useState(0.15);
  const [preloadMode, setPreloadMode] = useState<PreloadMode>('torque');
  const [targetTorqueNm, setTargetTorqueNm] = useState(40);
  const [targetPreloadN, setTargetPreloadN] = useState(20000);
  const [jointStiffnessC, setJointStiffnessC] = useState(0.2);

  const size = getFastenerSize(sizeId) ?? ALL_SIZES[0];
  const propertyClass = getPropertyClass(propertyClassId) ?? ALL_PROPERTY_CLASSES[0];
  const frictionMu = frictionPresetId === 'custom' ? customMu : (getFrictionPreset(frictionPresetId)?.mu ?? 0.15);

  const spec: BoltSpecInput = useMemo(() => ({
    nominalDiameterMm: size.nominalDiameterMm,
    pitchMm: size.pitchMm,
    pitchDiameterMm: size.pitchDiameterMm,
    tensileStressAreaMm2: size.tensileStressAreaMm2,
    bearingDiameterMm: size.headFlatsAcrossMm[headType],
    frictionMu,
    proofStrengthMPa: propertyClass.proofStrengthMPa,
  }), [size, headType, frictionMu, propertyClass]);

  const shankAreaMm2 = useMemo(() => boltShankAreaMm2(size.nominalDiameterMm), [size]);

  const preloadN = useMemo(() => (preloadMode === 'direct' ? targetPreloadN : preloadFromTorqueSimple(targetTorqueNm, spec)), [preloadMode, targetPreloadN, targetTorqueNm, spec]);
  const derivedTorqueNm = useMemo(() => (preloadMode === 'torque' ? targetTorqueNm : torqueFromPreloadSimple(targetPreloadN, spec)), [preloadMode, targetTorqueNm, targetPreloadN, spec]);
  const percentOfProof = propertyClass.proofStrengthMPa > 0 ? (preloadN / (propertyClass.proofStrengthMPa * size.tensileStressAreaMm2)) * 100 : 0;

  // ---- Applied load ----
  const [forceXN, setForceXN] = useState(500);
  const [forceYN, setForceYN] = useState(0);
  const [forceZN, setForceZN] = useState(2000);
  const [appXmm, setAppXmm] = useState(100);
  const [appYmm, setAppYmm] = useState(0);
  const [appZmm, setAppZmm] = useState(0);
  const [momentXNmm, setMomentXNmm] = useState(0);
  const [momentYNmm, setMomentYNmm] = useState(0);
  const [momentZNmm, setMomentZNmm] = useState(50000);

  const hasOffsetLoad = appXmm !== 0 || appYmm !== 0 || appZmm !== 0;

  const equivalentLoad = useMemo(() => resolveLoadToCentroid({
    forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm,
  }), [forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm]);

  const result = useMemo(() => solveBoltPattern(points, geometry, equivalentLoad, preloadN, jointStiffnessC, spec, shankAreaMm2), [points, geometry, equivalentLoad, preloadN, jointStiffnessC, spec, shankAreaMm2]);

  const criticalBolt = result.bolts.find((b) => b.id === result.criticalBoltId) ?? null;
  const anySeparated = result.bolts.some((b) => b.separated);

  const getInputs = useCallback((): Record<string, unknown> => ({
    patternType, rectColumns, rectRows, rectSpacingXmm, rectSpacingYmm,
    perimWidthMm, perimHeightMm, perimBoltsX, perimBoltsY,
    circCount, circDiameterMm, circStartAngleDeg, customPoints,
    sizeId, propertyClassId, headType, frictionPresetId, customMu,
    preloadMode, targetTorqueNm, targetPreloadN, jointStiffnessC,
    forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm,
  }), [patternType, rectColumns, rectRows, rectSpacingXmm, rectSpacingYmm, perimWidthMm, perimHeightMm, perimBoltsX, perimBoltsY,
    circCount, circDiameterMm, circStartAngleDeg, customPoints, sizeId, propertyClassId, headType, frictionPresetId, customMu,
    preloadMode, targetTorqueNm, targetPreloadN, jointStiffnessC, forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.patternType) setPatternType(v.patternType);
    if (v.rectColumns != null) setRectColumns(v.rectColumns);
    if (v.rectRows != null) setRectRows(v.rectRows);
    if (v.rectSpacingXmm != null) setRectSpacingXmm(v.rectSpacingXmm);
    if (v.rectSpacingYmm != null) setRectSpacingYmm(v.rectSpacingYmm);
    if (v.perimWidthMm != null) setPerimWidthMm(v.perimWidthMm);
    if (v.perimHeightMm != null) setPerimHeightMm(v.perimHeightMm);
    if (v.perimBoltsX != null) setPerimBoltsX(v.perimBoltsX);
    if (v.perimBoltsY != null) setPerimBoltsY(v.perimBoltsY);
    if (v.circCount != null) setCircCount(v.circCount);
    if (v.circDiameterMm != null) setCircDiameterMm(v.circDiameterMm);
    if (v.circStartAngleDeg != null) setCircStartAngleDeg(v.circStartAngleDeg);
    if (Array.isArray(v.customPoints)) setCustomPoints(v.customPoints);
    if (v.sizeId) setSizeId(v.sizeId);
    if (v.propertyClassId) setPropertyClassId(v.propertyClassId);
    if (v.headType) setHeadType(v.headType);
    if (v.frictionPresetId) setFrictionPresetId(v.frictionPresetId);
    if (v.customMu != null) setCustomMu(v.customMu);
    if (v.preloadMode) setPreloadMode(v.preloadMode);
    if (v.targetTorqueNm != null) setTargetTorqueNm(v.targetTorqueNm);
    if (v.targetPreloadN != null) setTargetPreloadN(v.targetPreloadN);
    if (v.jointStiffnessC != null) setJointStiffnessC(v.jointStiffnessC);
    if (v.forceXN != null) setForceXN(v.forceXN);
    if (v.forceYN != null) setForceYN(v.forceYN);
    if (v.forceZN != null) setForceZN(v.forceZN);
    if (v.appXmm != null) setAppXmm(v.appXmm);
    if (v.appYmm != null) setAppYmm(v.appYmm);
    if (v.appZmm != null) setAppZmm(v.appZmm);
    if (v.momentXNmm != null) setMomentXNmm(v.momentXNmm);
    if (v.momentYNmm != null) setMomentYNmm(v.momentYNmm);
    if (v.momentZNmm != null) setMomentZNmm(v.momentZNmm);
  }, []);

  const saved = useSavedCalculations('bolt-pattern');

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    steps.push({
      title: 'Pattern centroid & section properties',
      formula: 'x̄=ΣxI/n, ȳ=ΣyI/n; Ixx=Σ(y-ȳ)², Iyy=Σ(x-x̄)², Ixy=Σ(x-x̄)(y-ȳ); J=Ixx+Iyy',
      substitution: `n = ${geometry.count} bolts`,
      result: `centroid = (${fmt(geometry.centroidXmm, 1)}, ${fmt(geometry.centroidYmm, 1)}) mm; Ixx=${fmt(geometry.ixxMm2, 0)}, Iyy=${fmt(geometry.iyyMm2, 0)}, Ixy=${fmt(geometry.ixyMm2, 0)} mm²; J=${fmt(geometry.polarJmm2, 0)} mm²`,
    });
    steps.push({
      title: 'Applied load resolved to the pattern centroid',
      formula: 'M_centroid = M_applied + r × F  (moment of the offset force about the centroid, plus any direct moment)',
      substitution: `F=(${fmt(forceXN, 0)}, ${fmt(forceYN, 0)}, ${fmt(forceZN, 0)}) N at r=(${fmt(appXmm, 1)}, ${fmt(appYmm, 1)}, ${fmt(appZmm, 1)}) mm; direct M=(${fmt(momentXNmm / 1000, 2)}, ${fmt(momentYNmm / 1000, 2)}, ${fmt(momentZNmm / 1000, 2)}) N·m`,
      result: `Equivalent at centroid: Fx=${fmt(equivalentLoad.fxN, 0)} N, Fy=${fmt(equivalentLoad.fyN, 0)} N, Fz=${fmt(equivalentLoad.fzN, 0)} N, Mx=${fmt(equivalentLoad.mxNmm / 1000, 2)} N·m, My=${fmt(equivalentLoad.myNmm / 1000, 2)} N·m, Mz=${fmt(equivalentLoad.mzNmm / 1000, 2)} N·m`,
    });
    if (criticalBolt) {
      steps.push({
        title: `Shear at the critical bolt (#${criticalBolt.id + 1})`,
        formula: 'direct = F/n;  torsional: Fx=-Mz·(y-ȳ)/J, Fy=Mz·(x-x̄)/J;  combine vectorially',
        substitution: `r from centroid = ${fmt(criticalBolt.rFromCentroidMm, 1)} mm`,
        result: `direct=(${fmt(criticalBolt.directShearXN, 0)}, ${fmt(criticalBolt.directShearYN, 0)}) N, torsional=(${fmt(criticalBolt.torsionalShearXN, 0)}, ${fmt(criticalBolt.torsionalShearYN, 0)}) N → resultant = ${fmt(criticalBolt.resultantShearN, 0)} N`,
      });
      steps.push({
        title: `Tension at the critical bolt (#${criticalBolt.id + 1})`,
        formula: 'F = Fz/n + [(Mx·Iyy - My·Ixy)(y-ȳ) + (My·Ixx - Mx·Ixy)(x-x̄)] / (Ixx·Iyy - Ixy²)',
        substitution: `preload Fi = ${fmt(preloadN, 0)} N, joint stiffness C = ${fmt(jointStiffnessC, 2)}`,
        result: `external axial demand = ${fmt(criticalBolt.axialFromExternalN, 0)} N → bolt tension Fb = Fi + C·P = ${fmt(criticalBolt.boltTensionN, 0)} N; residual clamp = Fi-(1-C)·P = ${fmt(criticalBolt.residualClampN, 0)} N${criticalBolt.separated ? ' — SEPARATED' : ''}`,
      });
      steps.push({
        title: `Combined stress check at the critical bolt (#${criticalBolt.id + 1})`,
        formula: 'σ_vM = √(σ_tensile² + 3·τ²)  vs.  proof strength (distortion-energy criterion)',
        substitution: `τ = ${fmt(criticalBolt.shearStressMPa, 1)} MPa (shank area ${fmt(shankAreaMm2, 1)} mm²), σ = ${fmt(criticalBolt.tensileStressMPa, 1)} MPa (tensile stress area ${fmt(size.tensileStressAreaMm2, 1)} mm²)`,
        result: `σ_vM = ${fmt(criticalBolt.vonMisesStressMPa, 1)} MPa vs proof ${fmt(propertyClass.proofStrengthMPa, 0)} MPa → SF = ${fmt(criticalBolt.vonMisesSafetyFactor, 2)}`,
      });
    }
    steps.push({
      title: 'Preload from tightening torque',
      formula: 'T = Fi·dm/2·[(l+π·μ·dm·sec30°)/(π·dm-μ·l·sec30°)] + Fi·μ·Dbearing/2',
      substitution: `dm=${fmt(size.pitchDiameterMm, 3)} mm, l=${fmt(size.pitchMm, 3)} mm, μ=${fmt(frictionMu, 3)}, Dbearing=${fmt(spec.bearingDiameterMm, 2)} mm`,
      result: preloadMode === 'torque'
        ? `T = ${fmt(targetTorqueNm, 1)} N·m → Fi = ${fmt(preloadN, 0)} N (${fmt(percentOfProof, 0)}% of proof load)`
        : `Fi = ${fmt(targetPreloadN, 0)} N → T = ${fmt(derivedTorqueNm, 1)} N·m (${fmt(percentOfProof, 0)}% of proof load)`,
    });
    return steps;
  }, [geometry, forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm, equivalentLoad, criticalBolt, preloadN, jointStiffnessC, shankAreaMm2, size, propertyClass, frictionMu, spec, preloadMode, targetTorqueNm, targetPreloadN, derivedTorqueNm, percentOfProof]);

  const patternDescription = useMemo(() => {
    if (patternType === 'rectangular') return `Aligned grid: ${rectColumns} × ${rectRows}, spacing ${fmt(rectSpacingXmm, 0)} × ${fmt(rectSpacingYmm, 0)} mm`;
    if (patternType === 'perimeter') return `Square/rectangular perimeter: ${fmt(perimWidthMm, 0)} × ${fmt(perimHeightMm, 0)} mm, ${perimBoltsX} per x-side, ${perimBoltsY} per y-side`;
    if (patternType === 'circular') return `Circular (bolt circle): ${circCount} bolts, ⌀${fmt(circDiameterMm, 0)} mm, start ${fmt(circStartAngleDeg, 0)}°`;
    return `Custom: ${customPoints.length} user-defined points`;
  }, [patternType, rectColumns, rectRows, rectSpacingXmm, rectSpacingYmm, perimWidthMm, perimHeightMm, perimBoltsX, perimBoltsY, circCount, circDiameterMm, circStartAngleDeg, customPoints]);

  const inputSections: ReportSection[] = useMemo(() => {
    const patternRows: ReportRow[] = [
      { label: 'Pattern type', value: patternDescription },
      { label: 'Bolt count', value: `${geometry.count}` },
    ];
    const boltRows: ReportRow[] = [
      { label: 'Size', value: size.label },
      { label: 'Property class', value: propertyClass.label },
      { label: 'Head type', value: headType === 'hexHead' ? 'Hex head' : 'Socket head cap' },
      { label: 'Friction μ', value: fmt(frictionMu, 3) },
      { label: preloadMode === 'torque' ? 'Target torque' : 'Target preload', value: preloadMode === 'torque' ? `${fmt(targetTorqueNm, 1)} N·m` : `${fmtU(targetPreloadN, unitSystem, UNIT_FORCE, 0)} ${forceUnit}` },
      { label: 'Resulting preload', value: `${fmtU(preloadN, unitSystem, UNIT_FORCE, 0)} ${forceUnit} (${fmt(percentOfProof, 0)}% of proof)` },
      { label: 'Joint stiffness ratio C', value: fmt(jointStiffnessC, 2) },
    ];
    const loadRows: ReportRow[] = [
      { label: 'Applied force (Fx, Fy, Fz)', value: `${fmtU(forceXN, unitSystem, UNIT_FORCE, 0)}, ${fmtU(forceYN, unitSystem, UNIT_FORCE, 0)}, ${fmtU(forceZN, unitSystem, UNIT_FORCE, 0)} ${forceUnit}` },
      { label: 'Application point offset (ex, ey, ez)', value: `${fmtU(appXmm, unitSystem, UNIT_LENGTH, 1)}, ${fmtU(appYmm, unitSystem, UNIT_LENGTH, 1)}, ${fmtU(appZmm, unitSystem, UNIT_LENGTH, 1)} ${lenUnit}` },
      { label: 'Additional direct moment (Mx, My, Mz)', value: `${fmtU(momentXNmm, unitSystem, UNIT_MOMENT, 1)}, ${fmtU(momentYNmm, unitSystem, UNIT_MOMENT, 1)}, ${fmtU(momentZNmm, unitSystem, UNIT_MOMENT, 1)} ${momentUnit}` },
      { label: 'Equivalent at centroid (Fx,Fy,Fz)', value: `${fmt(equivalentLoad.fxN, 0)}, ${fmt(equivalentLoad.fyN, 0)}, ${fmt(equivalentLoad.fzN, 0)} N` },
      { label: 'Equivalent at centroid (Mx,My,Mz)', value: `${fmt(equivalentLoad.mxNmm / 1000, 2)}, ${fmt(equivalentLoad.myNmm / 1000, 2)}, ${fmt(equivalentLoad.mzNmm / 1000, 2)} N·m` },
    ];
    return [
      { heading: 'Bolt pattern', rows: patternRows },
      { heading: 'Bolt spec & preload', rows: boltRows },
      { heading: 'Applied load', rows: loadRows },
    ];
  }, [patternDescription, geometry, size, propertyClass, headType, frictionMu, preloadMode, targetTorqueNm, targetPreloadN, preloadN, percentOfProof, jointStiffnessC,
    forceXN, forceYN, forceZN, appXmm, appYmm, appZmm, momentXNmm, momentYNmm, momentZNmm, equivalentLoad, unitSystem, forceUnit, lenUnit, momentUnit]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Critical bolt', value: criticalBolt ? `#${criticalBolt.id + 1}` : '—' },
      { label: 'Critical bolt resultant shear', value: criticalBolt ? `${fmtU(criticalBolt.resultantShearN, unitSystem, UNIT_FORCE, 0)} ${forceUnit}` : '—' },
      { label: 'Critical bolt tension', value: criticalBolt ? `${fmtU(criticalBolt.boltTensionN, unitSystem, UNIT_FORCE, 0)} ${forceUnit}` : '—' },
      { label: 'Critical bolt von Mises stress', value: criticalBolt ? `${fmtU(criticalBolt.vonMisesStressMPa, unitSystem, UNIT_STRESS, 1)} ${stressUnit}` : '—' },
      { label: 'Overall von Mises safety factor', value: fmt(result.overallVonMisesSafetyFactor, 2) },
      { label: 'Overall separation safety factor', value: fmt(result.overallSeparationSafetyFactor, 2) },
      { label: 'Any bolt separated?', value: anySeparated ? 'YES — see per-bolt table' : 'No' },
    ];
    return [{ heading: 'Results summary', rows }];
  }, [criticalBolt, unitSystem, forceUnit, stressUnit, result, anySeparated]);

  const boltGridTable: ReportGridTable = useMemo(() => ({
    title: 'Per-bolt results',
    rowLabels: result.bolts.map((b) => `Bolt ${b.id + 1}`),
    colLabels: ['x, y (mm)', 'Resultant shear (N)', 'Bolt tension (N)', 'Residual clamp (N)', 'von Mises SF'],
    cellValues: result.bolts.map((b) => [
      `${fmt(b.xMm, 1)}, ${fmt(b.yMm, 1)}`,
      fmt(b.resultantShearN, 0),
      fmt(b.boltTensionN, 0),
      `${fmt(b.residualClampN, 0)}${b.separated ? ' (sep.)' : ''}`,
      isFinite(b.vonMisesSafetyFactor) ? fmt(b.vonMisesSafetyFactor, 2) : '∞',
    ]),
    highlightRow: result.bolts.findIndex((b) => b.id === result.criticalBoltId),
  }), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Bolt_Pattern_Calculator',
      pageTitle: 'Bolt Pattern Calculator',
      accentHex,
      inputSections,
      outputSections,
      calculationSteps,
      gridTables: [boltGridTable],
      disclaimer:
        'Elastic (linear) bolt-group analysis: the pattern lies in the local x-y plane with +z the bolt axis. In-plane shear combines a direct component (F/n, shared equally) with a secondary "torsional" component from an in-plane moment Mz via the polar-moment method (bolts treated as point areas, J=Ixx+Iyy) — the same elastic method published in Shigley\'s Mechanics of Materials, Blodgett\'s Design of Weldments (identical method for weld groups), and the AISC Steel Construction Manual. Axial (tension/compression) demand from an out-of-plane force Fz and bending moments Mx, My uses the general unsymmetric-bending formula (handles a non-zero product of inertia Ixy for a genuinely asymmetric custom layout, not just the Ixy=0 simplified case most published bolt-pattern tools assume) and takes the neutral axis at the pattern centroid — valid while the joint faces remain in contact; it is not a concrete-anchor prying/cracked-section analysis. Bolt tension combines with the preload via the same joint-stiffness-ratio (C) convention as this site\'s Bolted Joint Calculator (Fb = Fi + C·P; separation when Fi-(1-C)·P <= 0) — use that calculator\'s detailed clamped-stack stiffness derivation for a precise C if this pattern\'s default is not representative. Combined shear + tension uses the distortion-energy (von Mises) criterion against the bolt\'s proof strength, matching the Bolted Joint Calculator\'s convention. All bolts in the pattern are assumed identical (same size, grade, and target preload) and torque-preload uses a single friction coefficient for both the thread and the under-head bearing face (a simplification vs. the twin-coefficient Bolted Joint Calculator). Idealisations: rigid plates, linear-elastic response, no shim/gasket compliance, and no fatigue or dynamic-load analysis.',
      ...branding,
    });
  };

  const summaryTiles = [
    { label: 'Bolt count', value: `${geometry.count}`, unit: '' },
    { label: 'Critical bolt', value: criticalBolt ? `#${criticalBolt.id + 1}` : '—', unit: '' },
    { label: 'Resultant shear (critical)', value: criticalBolt ? fmtU(criticalBolt.resultantShearN, unitSystem, UNIT_FORCE, 0) : '—', unit: forceUnit },
    { label: 'von Mises safety factor', value: fmt(result.overallVonMisesSafetyFactor, 2), unit: '' },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Bolt Pattern Calculator</div>
          <h1>Bolt Pattern Calculator</h1>
          <p>
            Aligned grid, rectangular perimeter, circular (bolt-circle), or fully custom bolt patterns, analysed
            under general 3-D loading — direct and torsional shear via the elastic method, axial/tension via
            unsymmetric bending, combined with preload and checked against the bolt's proof strength.
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
                <span className="step-num">1</span>Bolt pattern
                <InfoTooltip>Choose how the bolts are arranged. All bolts in the pattern share the same size, grade and preload — only their positions vary. Aligned = full rectangular grid; Square/rectangular perimeter = bolts evenly spaced around a rectangle's edge (no interior bolts); Circular = a bolt circle (PCD); Custom = enter any x/y layout, including asymmetric patterns.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Pattern type</label>
              <div className="segmented">
                <button className={patternType === 'rectangular' ? 'active' : ''} onClick={() => setPatternType('rectangular')}>Aligned</button>
                <button className={patternType === 'perimeter' ? 'active' : ''} onClick={() => setPatternType('perimeter')}>Square</button>
                <button className={patternType === 'circular' ? 'active' : ''} onClick={() => setPatternType('circular')}>Circular</button>
                <button className={patternType === 'custom' ? 'active' : ''} onClick={() => setPatternType('custom')}>Custom</button>
              </div>
            </div>

            {patternType === 'rectangular' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Columns (x)</label>
                  <input autoComplete="off" type="number" min={1} step={1} value={rectColumns} onChange={(e) => setRectColumns(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
                <div className="field">
                  <label>Rows (y)</label>
                  <input autoComplete="off" type="number" min={1} step={1} value={rectRows} onChange={(e) => setRectRows(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
                <div className="field">
                  <label>Spacing x ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(rectSpacingXmm, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectSpacingXmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Spacing y ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(rectSpacingYmm, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectSpacingYmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              </div>
            )}

            {patternType === 'perimeter' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Width ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(perimWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setPerimWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Height ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(perimHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setPerimHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Bolts per x-side (top/bottom)</label>
                  <input autoComplete="off" type="number" min={2} step={1} value={perimBoltsX} onChange={(e) => setPerimBoltsX(Math.max(2, Math.round(Number(e.target.value))))} />
                  <span className="hint">Includes the two corners.</span>
                </div>
                <div className="field">
                  <label>Bolts per y-side (left/right)</label>
                  <input autoComplete="off" type="number" min={2} step={1} value={perimBoltsY} onChange={(e) => setPerimBoltsY(Math.max(2, Math.round(Number(e.target.value))))} />
                  <span className="hint">Includes the two corners.</span>
                </div>
              </div>
            )}

            {patternType === 'circular' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Bolt count</label>
                  <input autoComplete="off" type="number" min={2} step={1} value={circCount} onChange={(e) => setCircCount(Math.max(2, Math.round(Number(e.target.value))))} />
                </div>
                <div className="field">
                  <label>Bolt circle diameter ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.1} value={toDisplay(circDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setCircDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Start angle (° CCW from +x)</label>
                  <input autoComplete="off" type="number" value={circStartAngleDeg} onChange={(e) => setCircStartAngleDeg(Number(e.target.value))} />
                </div>
              </div>
            )}

            {patternType === 'custom' && (
              <>
                <div className="card-title" style={{ marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem' }}>Coordinates ({lenUnit})</span>
                  <button className="btn small" onClick={addCustomPoint}>+ Point</button>
                </div>
                {customPoints.length === 0 && <p className="hint">Add at least 2 points.</p>}
                {customPoints.map((p, i) => (
                  <div className="step-row" key={p.id} style={{ gridTemplateColumns: '28px 1fr 1fr auto' }}>
                    <div className="bar-index">{i + 1}</div>
                    <div className="field">
                      <label>x</label>
                      <input autoComplete="off" type="number" value={toDisplay(p.xMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updateCustomPoint(p.id, { xMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                    </div>
                    <div className="field">
                      <label>y</label>
                      <input autoComplete="off" type="number" value={toDisplay(p.yMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updateCustomPoint(p.id, { yMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                    </div>
                    <button className="btn small danger" onClick={() => removeCustomPoint(p.id)}>Remove</button>
                  </div>
                ))}
              </>
            )}

            {!geometry.bendingResistant && geometry.count > 1 && (
              <p className="hint" style={{ color: 'var(--neg)' }}>This pattern's bolts are colinear (or too few) — it cannot resist a general out-of-plane bending moment. Add a bolt off the line to react Mx/My.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Bolt spec &amp; preload
                <InfoTooltip>Every bolt in the pattern is assumed identical — same size, grade, and target preload. Torque uses a single friction coefficient for both the thread and the under-head bearing face (a simplification vs. the site's Bolted Joint Calculator, which supports independent values).</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Size</label>
                <select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                  <optgroup label="Metric (ISO coarse)">
                    {ALL_SIZES.filter((s) => s.standard === 'metric').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                  <optgroup label="Imperial (UNC)">
                    {ALL_SIZES.filter((s) => s.standard === 'imperial').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="field">
                <label>Head type</label>
                <div className="segmented">
                  <button className={headType === 'hexHead' ? 'active' : ''} onClick={() => setHeadType('hexHead')}>Hex</button>
                  <button className={headType === 'socketHeadCap' ? 'active' : ''} onClick={() => setHeadType('socketHeadCap')}>SHCS</button>
                </div>
              </div>
              <div className="field">
                <label>Property class</label>
                <select value={propertyClassId} onChange={(e) => setPropertyClassId(e.target.value)}>
                  {ALL_PROPERTY_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Friction</label>
                <select value={frictionPresetId} onChange={(e) => setFrictionPresetId(e.target.value)}>
                  {FRICTION_PRESETS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              {frictionPresetId === 'custom' && (
                <div className="field">
                  <label>Custom μ</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.01} value={customMu} onChange={(e) => setCustomMu(Number(e.target.value))} />
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Preload entry</label>
                <div className="segmented">
                  <button className={preloadMode === 'torque' ? 'active' : ''} onClick={() => setPreloadMode('torque')}>Torque</button>
                  <button className={preloadMode === 'direct' ? 'active' : ''} onClick={() => setPreloadMode('direct')}>Direct preload</button>
                </div>
              </div>
              {preloadMode === 'torque' ? (
                <div className="field">
                  <label>Target torque (N·m)</label>
                  <input autoComplete="off" type="number" min={0} value={targetTorqueNm} onChange={(e) => setTargetTorqueNm(Number(e.target.value))} />
                  <span className="hint">→ Fi = {fmtU(preloadN, unitSystem, UNIT_FORCE, 0)} {forceUnit} ({fmt(percentOfProof, 0)}% of proof)</span>
                </div>
              ) : (
                <div className="field">
                  <label>Target preload ({forceUnit})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(targetPreloadN, unitSystem, UNIT_FORCE)} onChange={(e) => setTargetPreloadN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
                  <span className="hint">→ T = {fmt(derivedTorqueNm, 1)} N·m ({fmt(percentOfProof, 0)}% of proof)</span>
                </div>
              )}
              <div className="field">
                <label>
                  Joint stiffness ratio C
                  <InfoTooltip>How much of an external tensile load adds to bolt tension (vs. being absorbed by reduced clamp pressure) — Fb = Fi + C·P. C≈0.2 is typical for a standard steel joint without a soft gasket; use C=1.0 for the most conservative (no-credit) check, or derive an exact value from this site's Bolted Joint Calculator for a specific clamped stack.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} max={1} step={0.05} value={jointStiffnessC} onChange={(e) => setJointStiffnessC(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">3</span>Applied load
                <InfoTooltip>Enter a force at an offset point from the pattern centroid (the natural way to describe a bracket or lever-arm load — the tool computes the resulting moments for you), plus any additional moment you already know directly (e.g. a shaft torque). Fx/Fy are in-plane (shear-plane); Fz is out-of-plane (+z = tension, pulling the joint apart).</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Force Fx ({forceUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(forceXN, unitSystem, UNIT_FORCE)} onChange={(e) => setForceXN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
              </div>
              <div className="field">
                <label>Force Fy ({forceUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(forceYN, unitSystem, UNIT_FORCE)} onChange={(e) => setForceYN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
              </div>
              <div className="field">
                <label>Force Fz ({forceUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(forceZN, unitSystem, UNIT_FORCE)} onChange={(e) => setForceZN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
                <span className="hint">+z = tension (pulls joint apart).</span>
              </div>
              <div />
              <div className="field">
                <label>Application point ex ({lenUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(appXmm, unitSystem, UNIT_LENGTH)} onChange={(e) => setAppXmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Application point ey ({lenUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(appYmm, unitSystem, UNIT_LENGTH)} onChange={(e) => setAppYmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Application point ez ({lenUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(appZmm, unitSystem, UNIT_LENGTH)} onChange={(e) => setAppZmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                <span className="hint">Standoff from the joint plane.</span>
              </div>
              <div />
              <div className="field">
                <label>Direct moment Mx ({momentUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(momentXNmm, unitSystem, UNIT_MOMENT)} onChange={(e) => setMomentXNmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_MOMENT))} />
              </div>
              <div className="field">
                <label>Direct moment My ({momentUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(momentYNmm, unitSystem, UNIT_MOMENT)} onChange={(e) => setMomentYNmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_MOMENT))} />
              </div>
              <div className="field">
                <label>Direct moment Mz ({momentUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(momentZNmm, unitSystem, UNIT_MOMENT)} onChange={(e) => setMomentZNmm(fromDisplay(Number(e.target.value), unitSystem, UNIT_MOMENT))} />
                <span className="hint">e.g. an applied torque, on top of any offset-force moment.</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Summary</div>
            <div className="result-grid">
              {summaryTiles.map((t) => (
                <div className="result-tile" key={t.label}>
                  <div className="label">{t.label}</div>
                  <div className="value">{t.value}<span className="unit">{t.unit}</span></div>
                </div>
              ))}
            </div>
            {anySeparated && <p className="hint" style={{ color: 'var(--neg)' }}>⚠ At least one bolt's joint face has separated (residual clamp ≤ 0) under this load — see the per-bolt table.</p>}
          </div>

          <div className="card">
            <div className="card-title">Bolt pattern</div>
            <BoltPatternDiagram geometry={geometry} bolts={result.bolts} criticalBoltId={result.criticalBoltId} appXmm={appXmm} appYmm={appYmm} hasOffsetLoad={hasOffsetLoad} />
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Per-bolt shear
                <InfoTooltip>Direct shear (F/n) plus the secondary "torsional" shear from the in-plane moment Mz, combined vectorially. The bolt farthest from the centroid in the direction the two add usually governs.</InfoTooltip>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Bolt</th><th>x, y ({lenUnit})</th><th>Direct ({forceUnit})</th><th>Torsional ({forceUnit})</th><th>Resultant ({forceUnit})</th></tr>
                </thead>
                <tbody>
                  {result.bolts.map((b) => (
                    <tr key={b.id} className={b.id === result.criticalBoltId ? 'fail' : undefined}>
                      <td>{b.id + 1}</td>
                      <td>{fmtU(b.xMm, unitSystem, UNIT_LENGTH, 1)}, {fmtU(b.yMm, unitSystem, UNIT_LENGTH, 1)}</td>
                      <td>{fmt(Math.hypot(toDisplay(b.directShearXN, unitSystem, UNIT_FORCE), toDisplay(b.directShearYN, unitSystem, UNIT_FORCE)), 0)}</td>
                      <td>{fmt(Math.hypot(toDisplay(b.torsionalShearXN, unitSystem, UNIT_FORCE), toDisplay(b.torsionalShearYN, unitSystem, UNIT_FORCE)), 0)}</td>
                      <td><b>{fmtU(b.resultantShearN, unitSystem, UNIT_FORCE, 0)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Per-bolt tension &amp; separation
                <InfoTooltip>Bolt tension = preload + C × (external tension demand). Residual clamp = preload − (1−C) × (external tension demand); if this drops to zero or below, that bolt location's joint faces have separated.</InfoTooltip>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Bolt</th><th>External axial ({forceUnit})</th><th>Bolt tension ({forceUnit})</th><th>Residual clamp ({forceUnit})</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {result.bolts.map((b) => (
                    <tr key={b.id} className={b.separated ? 'fail' : undefined}>
                      <td>{b.id + 1}</td>
                      <td>{fmtU(b.axialFromExternalN, unitSystem, UNIT_FORCE, 0)}</td>
                      <td>{fmtU(b.boltTensionN, unitSystem, UNIT_FORCE, 0)}</td>
                      <td>{fmtU(b.residualClampN, unitSystem, UNIT_FORCE, 0)}</td>
                      <td className={b.separated ? 'fail' : 'pass'}>{b.separated ? 'Separated' : 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Combined stress check
                <InfoTooltip>σ_vM = √(σ_tensile² + 3·τ²), the distortion-energy (von Mises) yield criterion, checked against the bolt's proof strength — the same convention used by this site's Bolted Joint Calculator.</InfoTooltip>
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Bolt</th><th>Shear stress ({stressUnit})</th><th>Tensile stress ({stressUnit})</th><th>von Mises ({stressUnit})</th><th>Safety factor</th></tr>
                </thead>
                <tbody>
                  {result.bolts.map((b) => (
                    <tr key={b.id} className={b.id === result.criticalBoltId ? 'fail' : undefined}>
                      <td>{b.id + 1}</td>
                      <td>{fmtU(b.shearStressMPa, unitSystem, UNIT_STRESS, 1)}</td>
                      <td>{fmtU(b.tensileStressMPa, unitSystem, UNIT_STRESS, 1)}</td>
                      <td>{fmtU(b.vonMisesStressMPa, unitSystem, UNIT_STRESS, 1)}</td>
                      <td><b>{isFinite(b.vonMisesSafetyFactor) ? fmt(b.vonMisesSafetyFactor, 2) : '∞'}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Bolt-group ("bolt pattern") analysis using the elastic method — the classic eccentrically-loaded fastener
          group treatment from Shigley's <i>Mechanical Engineering Design</i> (bolted/riveted joints loaded in
          shear), Blodgett's <i>Design of Weldments</i> (the identical method applied to weld groups), and the AISC
          Steel Construction Manual's elastic method for bolt groups. All bolts are assumed identical (same size,
          grade and target preload) and treated as unit "point areas" — standard practice, since a bolt's own
          cross-section polar moment of inertia about its own centre is negligible next to the pattern's spread
          once bolts are more than a diameter or two apart. In-plane shear combines a direct component (shared
          equally, F/n) with a secondary "torsional" component from an in-plane moment Mz, distributed via the
          polar "moment of inertia" J=Ixx+Iyy (Mz·r/J, perpendicular to each bolt's radius from the centroid) —
          cross-checked against MechaniCalc's published "Bolt Pattern Force Distribution" reference. Axial
          (tension/compression) demand from an out-of-plane force Fz and bending moments Mx, My uses the general
          unsymmetric-bending formula F = Fz/n + [(Mx·Iyy−My·Ixy)(y−ȳ) + (My·Ixx−Mx·Ixy)(x−x̄)] / (Ixx·Iyy−Ixy²),
          which correctly handles a non-zero product of inertia Ixy for a genuinely asymmetric custom bolt
          layout — most published simplified treatments (including MechaniCalc's) assume Ixy=0, i.e. principal
          axes aligned with the pattern geometry. This reduces to the familiar Mx·y/Ixx + My·x/Iyy superposition
          whenever Ixy=0 (any pattern symmetric about the x or y axis). The neutral axis is taken at the pattern
          centroid, valid while the joint faces remain in contact under the applied moment — this is not a
          concrete-anchor prying/cracked-section analysis. An applied force may be entered at an offset point
          from the centroid (the natural way to describe a bracket or lever-arm load); the tool reduces it to an
          equivalent force + moment at the centroid via standard moment transfer (M = M_direct + r × F) before
          distributing it to the bolts. Bolt tension combines with preload via the same joint-stiffness-ratio
          (C) convention as this site's Bolted Joint Calculator: Fb = Fi + C·P, with separation when
          Fi−(1−C)·P ≤ 0 — C≈0.2 is typical for a standard steel joint without a soft gasket; use this site's
          Bolted Joint Calculator for an exact C from a specific clamped stack, or C=1.0 for the most conservative
          (no stiffness credit) check. Combined shear + tension is checked via the distortion-energy (von Mises)
          criterion, σ_vM=√(σ_tensile²+3·τ²), against the bolt's proof strength — matching the Bolted Joint
          Calculator's convention for internal consistency across the site. Torque-preload uses a single friction
          coefficient for both the thread and the under-head bearing face (a simplification vs. the Bolted Joint
          Calculator's independent thread/bearing friction). Idealisations: rigid plates (no plate bending
          compliance), linear-elastic response, no fatigue, vibration/self-loosening, or dynamic/impact loading.
          Verify a critical design against a detailed FEA or the referenced standards directly.
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
