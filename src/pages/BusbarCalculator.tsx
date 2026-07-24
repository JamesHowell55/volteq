import { useCallback, useEffect, useMemo, useState } from 'react';
import BusbarCrossSection from '../components/BusbarCrossSection';
import BusbarLengthProfile from '../components/BusbarLengthProfile';
import ConductionStackCrossSection from '../components/ConductionStackCrossSection';
import TimeSeriesChart from '../components/TimeSeriesChart';
import SavedCalculations from '../components/SavedCalculations';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_LENGTH_M, UNIT_AREA, UNIT_TEMP, UNIT_TEMP_DELTA } from '../lib/globalUnits';
import { deriveAccentOnLight } from '../lib/theme';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportDiagram } from '../lib/pdfExport';
import { renderLengthProfileSvg, renderCrossSectionSvg, renderConductionStackSvg, renderTimeSeriesChartSvg } from '../lib/pdfDiagrams';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import { MATERIALS, EMISSIVITY_PRESETS, COATING_PRESETS, TIM_PRESETS, COOLANT_PRESETS } from '../lib/materials';
import {
  buildSingleBusbarNodes,
  buildMultipleBarNodes,
  buildBulkNode,
  solveNodalSteadyState,
  solveMaxContinuousCurrentNodal,
  solveNodalAdiabatic,
  solveMinAreaForFault,
  solveNodalTransient,
  conductionCoolingConductanceWPerK,
  coolantTemperatureRiseK,
  resistivityAt,
  skinEffectFactor,
  dcResistancePerMetre,
  motorElectricalFrequency,
  DEFAULT_NATURAL_CONVECTION_H,
  type SingleSectionInput,
  type LoadStep,
  type Orientation,
  type CurrentType,
  type DurationMode,
  type BusbarType,
} from '../lib/busbarPhysics';
import { skinDepthMm } from '../lib/skinDepthPhysics';

interface StepRow extends LoadStep {
  id: string;
}

const PALETTE = ['#5DCAA5', '#0fb0ed', '#f87171', '#fbbf24', '#c084fc', '#f472b6', '#1D9E75', '#22d3ee', '#a3e635', '#94a3b8'];

let nextSectionId = 1;
let nextStepId = 1;
const newSection = (width: number, length: number): SingleSectionInput => ({ id: `sec-${nextSectionId++}`, width, length });
const newStep = (current: number, durationS: number): StepRow => ({ id: `step-${nextStepId++}`, current, durationS });

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

export default function BusbarCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();
  const FREE_SECTION_LIMIT = 2;
  const [busbarType, setBusbarType] = useState<BusbarType>('single');

  // Single-mode: lengthwise sections with a common thickness
  const [sections, setSections] = useState<SingleSectionInput[]>([newSection(150, 300), newSection(80, 700)]);
  const [thicknessMm, setThicknessMm] = useState(10);

  // Multiple-mode: one shared profile, repeated N times
  const [profileWidth, setProfileWidth] = useState(100);
  const [profileThickness, setProfileThickness] = useState(10);
  const [nBars, setNBars] = useState(2);
  const [barGap, setBarGap] = useState(10);
  const [bundleLengthM, setBundleLengthM] = useState(1);

  // Bulk-mode: an arbitrary conductor described only by conductor volume, total
  // exposed surface area, and its resistance — either entered directly (from a
  // field solver / measurement) or inferred from the current-path length using
  // the selected material (R20 = ρ20·L²/V, i.e. an equivalent uniform prism).
  const [bulkResistanceMode, setBulkResistanceMode] = useState<'fromLength' | 'enter'>('fromLength');
  const [bulkResistance20uOhm, setBulkResistance20uOhm] = useState(72);
  const [bulkPathLengthMm, setBulkPathLengthMm] = useState(100);
  const [bulkVolumeMm3, setBulkVolumeMm3] = useState(18000);
  const [bulkSurfaceAreaMm2, setBulkSurfaceAreaMm2] = useState(15000);

  const [materialId, setMaterialId] = useState<'copper' | 'aluminium'>('copper');
  const [orientation, setOrientation] = useState<Orientation>('vertical');
  const [emissivity, setEmissivity] = useState(0.4);
  const [convMode, setConvMode] = useState<'auto' | 'manual'>('auto');
  const [manualHValue, setManualHValue] = useState(DEFAULT_NATURAL_CONVECTION_H);
  const [coatingPresetId, setCoatingPresetId] = useState('none');
  const [coatingThicknessMm, setCoatingThicknessMm] = useState(0);
  const [coatingConductivity, setCoatingConductivity] = useState(0.3);

  const onCoatingPresetChange = (id: string) => {
    setCoatingPresetId(id);
    const preset = COATING_PRESETS.find(p => p.id === id);
    if (preset) {
      setCoatingThicknessMm(preset.thicknessMm);
      setCoatingConductivity(preset.thermalConductivity);
    }
  };

  // Conduction cooling — applies only to sections ticked "Apply conduction" below.
  // Path: TIM + metallic section, in series, to the coolant at its inlet temperature
  // (no separate coolant-film resistance term — see conductionCoolingConductanceWPerK).
  const [timPresetId, setTimPresetId] = useState('pad');
  const [timThicknessMm, setTimThicknessMm] = useState(TIM_PRESETS[0].thicknessMm);
  const [timConductivity, setTimConductivity] = useState(TIM_PRESETS[0].thermalConductivity);
  const onTimPresetChange = (id: string) => {
    setTimPresetId(id);
    const preset = TIM_PRESETS.find(p => p.id === id);
    if (preset) {
      setTimThicknessMm(preset.thicknessMm);
      setTimConductivity(preset.thermalConductivity);
    }
  };
  const [metalMaterialId, setMetalMaterialId] = useState<'copper' | 'aluminium' | 'custom'>('aluminium');
  const [metalThicknessMm, setMetalThicknessMm] = useState(5);
  const [customMetalConductivity, setCustomMetalConductivity] = useState(200);
  const metalConductivity = metalMaterialId === 'custom' ? customMetalConductivity : MATERIALS[metalMaterialId].thermalConductivity;

  const [coolantPresetId, setCoolantPresetId] = useState('water');
  const [coolantDensity, setCoolantDensity] = useState(COOLANT_PRESETS[0].densityKgPerM3);
  const [coolantSpecificHeat, setCoolantSpecificHeat] = useState(COOLANT_PRESETS[0].specificHeatJPerKgK);
  const onCoolantPresetChange = (id: string) => {
    setCoolantPresetId(id);
    const preset = COOLANT_PRESETS.find(p => p.id === id);
    if (preset) {
      setCoolantDensity(preset.densityKgPerM3);
      setCoolantSpecificHeat(preset.specificHeatJPerKgK);
    }
  };
  const [coolantFlowRateLPerMin, setCoolantFlowRateLPerMin] = useState(2);
  const [coolantInletTempC, setCoolantInletTempC] = useState(25);

  const [currentType, setCurrentType] = useState<CurrentType>('ac');
  const [current, setCurrent] = useState(1000);
  const [frequency, setFrequency] = useState(50);
  const [showMotorHelper, setShowMotorHelper] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [motorRpm, setMotorRpm] = useState(6000);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const [ambientC, setAmbientC] = useState(35);

  const [durationMode, setDurationMode] = useState<DurationMode>('continuous');
  const [faultDurationS, setFaultDurationS] = useState(1);
  const [faultInitialTempC, setFaultInitialTempC] = useState(90);
  const [steps, setSteps] = useState<StepRow[]>([
    newStep(800, 20),
    newStep(300, 60),
    newStep(1200, 10),
    newStep(0, 30),
  ]);

  const material = MATERIALS[materialId];
  const [maxContinuousTempC, setMaxContinuousTempC] = useState(material.defaultMaxContinuousTemp);
  const [maxFaultTempC, setMaxFaultTempC] = useState(material.defaultMaxShortCircuitTemp);

  const onMaterialChange = (id: 'copper' | 'aluminium') => {
    setMaterialId(id);
    setMaxContinuousTempC(MATERIALS[id].defaultMaxContinuousTemp);
    setMaxFaultTempC(MATERIALS[id].defaultMaxShortCircuitTemp);
  };

  const getInputs = useCallback((): Record<string, unknown> => ({
    busbarType, sections: sections.map(s => ({ width: s.width, length: s.length, coolingEnabled: !!s.coolingEnabled, coatedEnabled: s.coatedEnabled ?? true })),
    thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM,
    bulkResistanceMode, bulkResistance20uOhm, bulkPathLengthMm, bulkVolumeMm3, bulkSurfaceAreaMm2,
    materialId, orientation, emissivity, convMode, manualHValue,
    coatingPresetId, coatingThicknessMm, coatingConductivity,
    timPresetId, timThicknessMm, timConductivity,
    metalMaterialId, metalThicknessMm, customMetalConductivity,
    coolantPresetId, coolantDensity, coolantSpecificHeat, coolantFlowRateLPerMin, coolantInletTempC,
    currentType, current, frequency, motorRpm, motorPolePairs, ambientC,
    durationMode, faultDurationS, faultInitialTempC,
    steps: steps.map(s => ({ current: s.current, durationS: s.durationS })),
    maxContinuousTempC, maxFaultTempC,
  }), [
    busbarType, sections, thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM,
    bulkResistanceMode, bulkResistance20uOhm, bulkPathLengthMm, bulkVolumeMm3, bulkSurfaceAreaMm2,
    materialId, orientation, emissivity, convMode, manualHValue,
    coatingPresetId, coatingThicknessMm, coatingConductivity,
    timPresetId, timThicknessMm, timConductivity,
    metalMaterialId, metalThicknessMm, customMetalConductivity,
    coolantPresetId, coolantDensity, coolantSpecificHeat, coolantFlowRateLPerMin, coolantInletTempC,
    currentType, current, frequency, motorRpm, motorPolePairs, ambientC,
    durationMode, faultDurationS, faultInitialTempC, steps, maxContinuousTempC, maxFaultTempC,
  ]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.busbarType) setBusbarType(v.busbarType);
    if (Array.isArray(v.sections)) setSections(v.sections.map((s: any) => ({ ...newSection(s.width, s.length), coolingEnabled: !!s.coolingEnabled, coatedEnabled: s.coatedEnabled ?? true })));
    if (v.thicknessMm != null) setThicknessMm(v.thicknessMm);
    if (v.profileWidth != null) setProfileWidth(v.profileWidth);
    if (v.profileThickness != null) setProfileThickness(v.profileThickness);
    if (v.nBars != null) setNBars(v.nBars);
    if (v.barGap != null) setBarGap(v.barGap);
    if (v.bundleLengthM != null) setBundleLengthM(v.bundleLengthM);
    if (v.bulkResistanceMode) setBulkResistanceMode(v.bulkResistanceMode);
    if (v.bulkResistance20uOhm != null) setBulkResistance20uOhm(v.bulkResistance20uOhm);
    if (v.bulkPathLengthMm != null) setBulkPathLengthMm(v.bulkPathLengthMm);
    if (v.bulkVolumeMm3 != null) setBulkVolumeMm3(v.bulkVolumeMm3);
    else if (v.bulkVolumeCm3 != null) setBulkVolumeMm3(v.bulkVolumeCm3 * 1000); // back-compat: old cm³ key
    if (v.bulkSurfaceAreaMm2 != null) setBulkSurfaceAreaMm2(v.bulkSurfaceAreaMm2);
    else if (v.bulkSurfaceAreaCm2 != null) setBulkSurfaceAreaMm2(v.bulkSurfaceAreaCm2 * 100); // back-compat: old cm² key
    if (v.materialId) setMaterialId(v.materialId);
    if (v.orientation) setOrientation(v.orientation);
    if (v.emissivity != null) setEmissivity(v.emissivity);
    if (v.convMode) setConvMode(v.convMode);
    if (v.manualHValue != null) setManualHValue(v.manualHValue);
    if (v.coatingPresetId) setCoatingPresetId(v.coatingPresetId);
    if (v.coatingThicknessMm != null) setCoatingThicknessMm(v.coatingThicknessMm);
    if (v.coatingConductivity != null) setCoatingConductivity(v.coatingConductivity);
    if (v.timPresetId) setTimPresetId(v.timPresetId);
    if (v.timThicknessMm != null) setTimThicknessMm(v.timThicknessMm);
    if (v.timConductivity != null) setTimConductivity(v.timConductivity);
    if (v.metalMaterialId) setMetalMaterialId(v.metalMaterialId);
    if (v.metalThicknessMm != null) setMetalThicknessMm(v.metalThicknessMm);
    if (v.customMetalConductivity != null) setCustomMetalConductivity(v.customMetalConductivity);
    if (v.coolantPresetId) setCoolantPresetId(v.coolantPresetId);
    if (v.coolantDensity != null) setCoolantDensity(v.coolantDensity);
    if (v.coolantSpecificHeat != null) setCoolantSpecificHeat(v.coolantSpecificHeat);
    if (v.coolantFlowRateLPerMin != null) setCoolantFlowRateLPerMin(v.coolantFlowRateLPerMin);
    if (v.coolantInletTempC != null) setCoolantInletTempC(v.coolantInletTempC);
    if (v.currentType) setCurrentType(v.currentType);
    if (v.current != null) setCurrent(v.current);
    if (v.frequency != null) setFrequency(v.frequency);
    if (v.motorRpm != null) setMotorRpm(v.motorRpm);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
    if (v.ambientC != null) setAmbientC(v.ambientC);
    if (v.durationMode) setDurationMode(v.durationMode);
    if (v.faultDurationS != null) setFaultDurationS(v.faultDurationS);
    if (v.faultInitialTempC != null) setFaultInitialTempC(v.faultInitialTempC);
    if (Array.isArray(v.steps)) setSteps(v.steps.map((s: any) => newStep(s.current, s.durationS)));
    if (v.maxContinuousTempC != null) setMaxContinuousTempC(v.maxContinuousTempC);
    if (v.maxFaultTempC != null) setMaxFaultTempC(v.maxFaultTempC);
  }, []);

  const saved = useSavedCalculations('busbar');

  const updateSection = (id: string, patch: Partial<SingleSectionInput>) => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };
  const maxSections = isPremium ? 10 : FREE_SECTION_LIMIT;
  const addSection = () => setSections(prev => (prev.length >= maxSections ? prev : [...prev, newSection(100, 300)]));
  const removeSection = (id: string) => setSections(prev => (prev.length > 1 ? prev.filter(s => s.id !== id) : prev));

  // Safety net: trim back to the free limit / bail out of Load profile mode if
  // entitlement lapses mid-session (state doesn't persist across a reload, so
  // this mainly guards a real-time downgrade during an active session).
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setSections(prev => (prev.length > FREE_SECTION_LIMIT ? prev.slice(0, FREE_SECTION_LIMIT) : prev));
    setDurationMode(prev => (prev === 'profile' ? 'continuous' : prev));
  }, [isPremium, entitlementLoading]);

  const updateStep = (id: string, patch: Partial<LoadStep>) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };
  const addStep = () => setSteps(prev => (prev.length >= 10 ? prev : [...prev, newStep(500, 30)]));
  const removeStep = (id: string) => setSteps(prev => (prev.length > 1 ? prev.filter(s => s.id !== id) : prev));

  const derivedMotorFreq = useMemo(() => motorElectricalFrequency(motorRpm, motorPolePairs), [motorRpm, motorPolePairs]);
  const effFrequency = currentType === 'ac' ? frequency : 0;
  const manualH = convMode === 'manual' ? manualHValue : null;

  // Bulk-mode resistance at 20°C (Ω): either the entered value, or inferred from
  // the current-path length and volume as an equivalent uniform prism,
  // R20 = ρ20·L²/V. The uniform assumption makes this a LOWER bound on the true
  // resistance — a part that necks down runs a higher resistance than this.
  const bulkResistance20Ohm = useMemo(() => {
    if (bulkResistanceMode === 'enter') return bulkResistance20uOhm * 1e-6;
    const volumeM3 = bulkVolumeMm3 * 1e-9;
    const lengthM = bulkPathLengthMm / 1000;
    return volumeM3 > 0 ? (resistivityAt(material, 20) * lengthM * lengthM) / volumeM3 : 0;
  }, [bulkResistanceMode, bulkResistance20uOhm, bulkPathLengthMm, bulkVolumeMm3, material]);

  const nodes = useMemo(() => {
    if (busbarType === 'single') return buildSingleBusbarNodes(sections, thicknessMm);
    if (busbarType === 'bulk') return buildBulkNode(bulkResistance20Ohm, bulkVolumeMm3 * 1e-9, bulkSurfaceAreaMm2 * 1e-6, resistivityAt(material, 20));
    return buildMultipleBarNodes(profileWidth, profileThickness, nBars, barGap, bundleLengthM);
  }, [busbarType, sections, thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM, bulkResistance20Ohm, bulkVolumeMm3, bulkSurfaceAreaMm2, material]);

  // Bulk mode: skip the IEC skin factor — a measured/CAD-extracted resistance
  // already embeds any AC (skin/proximity) effect, so re-applying it double-counts.
  const effFrequencyForSolve = busbarType === 'bulk' ? 0 : effFrequency;

  // The shared coating/overmould is applied per-section in single mode (each
  // section's "Apply coating" toggle, default on for backward compatibility);
  // in multiple/bulk mode it applies to the whole conductor.
  const coatingThicknessPerNode = useMemo(() => {
    if (busbarType === 'single') return nodes.map((_, i) => ((sections[i]?.coatedEnabled ?? true) ? coatingThicknessMm : 0));
    return nodes.map(() => coatingThicknessMm);
  }, [busbarType, nodes, sections, coatingThicknessMm]);

  const validGeometry = nodes.length > 0 && nodes.every(n => n.areaMm2 > 0 && n.lengthM > 0);

  const anySectionCooled = busbarType === 'single' && sections.some(s => s.coolingEnabled);

  // 0 for any node without a contact area (conductionCoolingConductanceWPerK short-circuits
  // on contactAreaM2<=0), so this array is naturally all-zero when nothing is cooled.
  const coolantConductancePerNode = useMemo(
    () => nodes.map(n => conductionCoolingConductanceWPerK(n.contactAreaM2, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity)),
    [nodes, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity]
  );

  const steady = useMemo(() => {
    if (!validGeometry || durationMode !== 'continuous') return null;
    return solveNodalSteadyState(nodes, material, current, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, current, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

  const maxCurrent = useMemo(() => {
    if (!validGeometry || durationMode !== 'continuous') return null;
    return solveMaxContinuousCurrentNodal(nodes, material, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, maxContinuousTempC, coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, maxContinuousTempC, coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

  const adiabatic = useMemo(() => {
    if (!validGeometry || durationMode !== 'fault') return null;
    return solveNodalAdiabatic(nodes, material, current, faultDurationS, faultInitialTempC);
  }, [validGeometry, durationMode, nodes, material, current, faultDurationS, faultInitialTempC]);

  const minArea = useMemo(() => {
    if (durationMode !== 'fault') return null;
    return solveMinAreaForFault(material, current, faultDurationS, faultInitialTempC, maxFaultTempC);
  }, [durationMode, material, current, faultDurationS, faultInitialTempC, maxFaultTempC]);

  const transient = useMemo(() => {
    if (!validGeometry || durationMode !== 'profile') return null;
    return solveNodalTransient(nodes, material, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, steps.map(s => ({ current: s.current, durationS: s.durationS })), coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, currentType, effFrequencyForSolve, ambientC, emissivity, orientation, manualH, steps, coatingThicknessPerNode, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

  // Informational only (see the disclosed simplification in the UI note) —
  // computed from the continuous steady-state result since that's the only
  // mode with a ready-made total-heat figure to base an energy balance on.
  const coolantTotalHeatW = steady ? steady.coolantLossPerNodeW.reduce((a, b) => a + b, 0) : 0;
  const coolantTempRiseK = useMemo(
    () => coolantTemperatureRiseK(coolantTotalHeatW, coolantFlowRateLPerMin, { id: coolantPresetId, label: '', densityKgPerM3: coolantDensity, specificHeatJPerKgK: coolantSpecificHeat }),
    [coolantTotalHeatW, coolantFlowRateLPerMin, coolantPresetId, coolantDensity, coolantSpecificHeat]
  );

  const lossPerNodeW = durationMode === 'continuous' ? steady?.powerLossPerNodeW : undefined;
  const energyPerNodeJ = durationMode === 'fault' ? adiabatic?.energyJPerNode : durationMode === 'profile' ? transient?.energyJPerNode : undefined;
  const totalLossW = lossPerNodeW ? lossPerNodeW.reduce((a, b) => a + b, 0) : undefined;
  const totalEnergyJ = energyPerNodeJ ? energyPerNodeJ.reduce((a, b) => a + b, 0) : undefined;
  // Series sum of every node's Rac — for 'single' busbars with multiple lengthwise
  // sections this is the end-to-end resistance; for 'multiple' (bundle) busbars
  // there's only one lumped node, so it's just that bundle's resistance.
  const totalResistanceOhm = durationMode === 'continuous' && steady
    ? steady.racTotalPerNode.reduce((a, b) => a + b, 0)
    : undefined;
  // End-to-end resistance evaluated at a fixed 20°C reference, independent of the
  // solved operating temperature — this is the basis field-solver tools (e.g. Q3D)
  // typically report, so it's directly comparable. Includes AC skin effect for AC
  // except in bulk mode, where the entered resistance already embeds it.
  const resistanceAt20Ohm = useMemo(() => {
    if (!validGeometry) return undefined;
    return nodes.reduce((sum, n) => {
      const rdc = dcResistancePerMetre(material, 20, n.areaMm2);
      const ks = currentType === 'ac' && busbarType !== 'bulk' ? skinEffectFactor(rdc, frequency).ks : 1;
      return sum + rdc * ks * n.lengthM;
    }, 0);
  }, [validGeometry, nodes, material, currentType, frequency, busbarType]);

  // Solid conductor mass only (density × volume, summed across nodes) — excludes
  // coating/overmould, TIM and any mounting hardware.
  const totalMassKg = useMemo(
    () => nodes.reduce((sum, n) => sum + material.density * (n.areaMm2 * 1e-6) * n.lengthM, 0),
    [nodes, material]
  );

  const worstTempC = durationMode === 'continuous' ? (steady ? Math.max(...steady.tempsC) : undefined)
    : durationMode === 'fault' ? (adiabatic ? Math.max(...adiabatic.finalTempsC) : undefined)
      : (transient ? Math.max(...transient.peakTempsC) : undefined);
  const limitTempC = durationMode === 'fault' ? maxFaultTempC : maxContinuousTempC;
  const passes = worstTempC !== undefined ? worstTempC <= limitTempC : null;
  const referenceTempC = durationMode === 'fault' ? faultInitialTempC : ambientC;

  const rdcRef = dcResistancePerMetre(material, 20, nodes[0]?.areaMm2 || 1);
  const rho20 = resistivityAt(material, 20);
  const skinAt20 = currentType === 'ac' ? skinEffectFactor(rdcRef, frequency) : null;
  // Classical skin depth (different from the IEC 60287 ks ratio above), at the
  // conductor's actual operating temperature where available — busbars are
  // non-magnetic (Cu/Al, µr=1).
  const skinDepthTempC = worstTempC ?? referenceTempC;
  const skinDepthAtTempMm = currentType === 'ac' ? skinDepthMm(resistivityAt(material, skinDepthTempC) * 1e6, frequency, 1) : null;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const stepsOut: CalcStepData[] = [
      {
        title: 'Cross-section per node',
        formula: 'A = width × thickness',
        result: nodes.map(n => `${n.label}: ${fmt(n.areaMm2, 1)} mm² (length ${fmt(n.lengthM, 2)} m)`).join(' · '),
      },
      {
        title: 'Resistivity at 20°C reference / temperature correction',
        formula: 'ρ(θ) = ρ₂₀ · (β + θ) / (β + 20)',
        result: `${material.name}: ρ₂₀ = ${rho20.toExponential(3)} Ω·m, β = ${material.beta}°C`,
      },
    ];

    if (currentType === 'ac' && skinDepthAtTempMm !== null) {
      stepsOut.push({
        title: 'Classical skin depth (distinct from the IEC 60287 kₛ ratio above — a material/frequency property, not a conductor-geometry resistance ratio)',
        formula: 'δ = √(ρ(θ) / (π·f·µ₀·µr)), µr = 1 (Cu/Al are non-magnetic)',
        substitution: `ρ(${fmt(skinDepthTempC, 0)}°C) at operating temperature, f = ${fmt(frequency, 0)} Hz`,
        result: isFinite(skinDepthAtTempMm) ? `δ = ${fmt(skinDepthAtTempMm, 2)} mm` : '—',
      });
    }

    if (durationMode === 'continuous' && steady) {
      stepsOut.push({
        title: 'AC skin-effect factor (IEC 60287-1-1)',
        formula: "x²ₛ = (8π f / R'dc) × 10⁻⁷ · yₛ = x⁴ₛ/(192 + 0.8x⁴ₛ) · kₛ = 1 + yₛ",
        substitution: `f = ${frequency} Hz`,
        result: `Per node kₛ: ${steady.ksPerNode.map((ks, i) => `${nodes[i].label}=${fmt(ks, 3)}`).join(', ')}`,
      });
      stepsOut.push({
        title: 'Axial conduction between sections',
        formula: "R'cond = Lᵢ/(2·k·Aᵢ) + Lᵢ₊₁/(2·k·Aᵢ₊₁) · q = ΔT / R'cond",
        substitution: `k(${material.name}) = ${material.thermalConductivity} W/(m·K)`,
        result: steady.conductionFlowsW.length > 0
          ? steady.conductionFlowsW.map((q, i) => `${nodes[i].label}→${nodes[i + 1].label}: ${fmt(q, 2)} W`).join('   ')
          : 'Single node — no adjoining section.',
      });
      stepsOut.push({
        title: 'Convection + radiation heat balance, solved per node',
        formula: `h = ${manualH !== null ? `${manualH} (manual)` : 'C·(ΔT/L)^0.25'} · P'conv = h·A'surf·ΔT · P'rad = ε·σ·A'surf·[(θ+273)⁴−(θa+273)⁴]${coatingThicknessMm > 0 ? " · R'coat = t/(k·A'surf)" : ''}`,
        substitution: `Solved as a tridiagonal system (Thomas algorithm), re-linearised over ${steady.iterations} iterations${coatingThicknessMm > 0 ? `. Coating: t=${coatingThicknessMm}mm, k=${coatingConductivity} W/(m·K)` : ''}`,
        result: nodes.map((n, i) => `${n.label}: θ=${fmt(steady.tempsC[i], 1)}°C, Pconv=${fmt(steady.convLossPerNodeW[i], 1)}W, Prad=${fmt(steady.radLossPerNodeW[i], 1)}W${anySectionCooled ? `, Pcoolant=${fmt(steady.coolantLossPerNodeW[i], 1)}W` : ''}`).join(' | '),
      });
      if (anySectionCooled) {
        stepsOut.push({
          title: 'Conduction cooling path — parallel sink to the coolant',
          formula: "R'TIM = t_TIM/(k_TIM·A_contact) · R'metal = t_metal/(k_metal·A_contact) · G = 1/(R'TIM+R'metal)",
          substitution: `TIM: t=${timThicknessMm}mm, k=${timConductivity} W/(m·K) · Metallic section: t=${metalThicknessMm}mm, k=${fmt(metalConductivity, 0)} W/(m·K) · coolant inlet=${coolantInletTempC}°C (no separate coolant-film resistance — the metal's outer face is taken to be directly at the coolant inlet temperature)`,
          result: nodes.map((n, i) => coolantConductancePerNode[i] > 0 ? `${n.label}: G=${fmt(coolantConductancePerNode[i], 3)} W/K` : null).filter(Boolean).join(' | ') || 'No section currently ticked "Apply conduction".',
        });
      }
    }

    if (durationMode === 'fault' && adiabatic) {
      stepsOut.push({
        title: 'Adiabatic short-time heating (IEC 60865-1), per section',
        formula: 'θf = (θi + β) · exp[(J/K)² × t] − β , J = I/A',
        substitution: `θi = ${faultInitialTempC}°C, β = ${material.beta}°C, K = ${material.kAdiabatic} A·√s/mm², t = ${faultDurationS} s`,
        result: nodes.map((n, i) => `${n.label}: J=${fmt(adiabatic.currentDensities[i], 2)}A/mm², θf=${fmt(adiabatic.finalTempsC[i], 1)}°C`).join(' | '),
      });
      stepsOut.push({
        title: 'Minimum cross-section for this fault',
        formula: 'Sₘᵢₙ = I√t / [K·√ln((θf,max+β)/(θi+β))]',
        result: `Sₘᵢₙ = ${minArea !== null ? fmt(minArea, 1) : '—'} mm² (applies to every section, since each carries the same series current)`,
      });
    }

    if (durationMode === 'profile' && transient) {
      stepsOut.push({
        title: 'Thermal capacitance per node',
        formula: 'C = γ × A × L × c',
        result: `${material.name}: γ = ${material.density} kg/m³, c = ${material.specificHeat} J/(kg·K)`,
      });
      stepsOut.push({
        title: 'Backward-Euler time march through the load steps',
        formula: "C·(θⁿ⁺¹−θⁿ)/Δt = P'gen(θⁿ⁺¹) + conduction(θⁿ⁺¹) − loss(θⁿ⁺¹)",
        substitution: `${steps.length} steps, 25 substeps each, re-linearised 4× per substep for the h/radiation nonlinearity`,
        result: `Peak temperatures: ${nodes.map((n, i) => `${n.label}=${fmt(transient.peakTempsC[i], 1)}°C`).join(', ')}`,
      });
    }

    return stepsOut;
  }, [nodes, material, rho20, durationMode, steady, frequency, manualH, coatingThicknessMm, coatingConductivity, adiabatic, faultInitialTempC, faultDurationS, minArea, transient, steps, anySectionCooled, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity, coolantInletTempC, coolantConductancePerNode, currentType, skinDepthAtTempMm, skinDepthTempC]);

  const inputSections: ReportSection[] = useMemo(() => {
    const geoRows: ReportRow[] = [{ label: 'Busbar type', value: busbarType === 'single' ? 'Single (sections)' : busbarType === 'bulk' ? 'Bulk (CAD)' : 'Multiple (stacked bars)' }];
    if (busbarType === 'single') {
      sections.forEach((s, i) => geoRows.push({ label: `Section ${i + 1}`, value: `${fmtU(s.width, unitSystem, UNIT_LENGTH, 3)} × ${fmtU(s.length, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}${coatingThicknessMm > 0 && !(s.coatedEnabled ?? true) ? ' (uncoated)' : ''}` }));
      geoRows.push({ label: 'Common thickness', value: `${fmtU(thicknessMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
    } else if (busbarType === 'bulk') {
      if (bulkResistanceMode === 'fromLength') {
        geoRows.push({ label: 'Current-path length', value: `${fmtU(bulkPathLengthMm, unitSystem, UNIT_LENGTH, 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
        geoRows.push({ label: 'Resistance at 20°C (inferred)', value: `${fmt(bulkResistance20Ohm * 1e6, 2)} µΩ (${material.name}, uniform-section)` });
      } else {
        geoRows.push({ label: 'Resistance at 20°C (entered)', value: `${fmt(bulkResistance20uOhm, 2)} µΩ` });
      }
      geoRows.push({ label: 'Conductor volume', value: `${fmt(bulkVolumeMm3, 0)} mm³` });
      geoRows.push({ label: 'Exposed surface area', value: `${fmt(bulkSurfaceAreaMm2, 0)} mm²` });
    } else {
      geoRows.push({ label: 'Bar profile', value: `${fmtU(profileWidth, unitSystem, UNIT_LENGTH, 3)} × ${fmtU(profileThickness, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
      geoRows.push({ label: 'Number of bars', value: `${nBars}` });
      geoRows.push({ label: 'Gap between bars', value: `${fmtU(barGap, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
      geoRows.push({ label: 'Bar length', value: `${fmtU(bundleLengthM, unitSystem, UNIT_LENGTH_M, 3)} ${unitLabel(unitSystem, UNIT_LENGTH_M)}` });
    }
    geoRows.push({ label: 'Mounting orientation', value: orientation === 'vertical' ? 'Vertical (edge)' : 'Horizontal (flat)' });
    geoRows.push({ label: 'Total mass', value: `${fmt(totalMassKg, totalMassKg < 1 ? 3 : 2)} kg` });

    const matRows: ReportRow[] = [
      { label: 'Material', value: material.name },
      { label: 'Emissivity', value: `${emissivity}` },
      { label: 'Convection', value: convMode === 'auto' ? 'Auto-calculated' : `Manual ${manualHValue} W/(m²K)` },
      { label: 'Coating', value: coatingThicknessMm > 0 ? `${fmtU(coatingThicknessMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}, k=${coatingConductivity} W/(m·K)` : 'None (bare)' },
    ];

    const elecRows: ReportRow[] = [{ label: 'Current type', value: currentType.toUpperCase() }];
    if (durationMode !== 'profile') elecRows.push({ label: 'Current', value: `${fmt(current, 0)} A rms` });
    if (currentType === 'ac') elecRows.push({ label: 'Frequency', value: `${frequency} Hz` });
    elecRows.push({ label: 'Ambient temperature', value: `${fmtU(ambientC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` });
    elecRows.push({ label: 'Duration mode', value: durationMode === 'continuous' ? 'Continuous' : durationMode === 'fault' ? 'Short-time / fault' : 'Load profile' });
    if (durationMode === 'continuous') elecRows.push({ label: 'Max allowable temp', value: `${fmtU(maxContinuousTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` });
    if (durationMode === 'fault') {
      elecRows.push({ label: 'Fault duration', value: `${faultDurationS} s` });
      elecRows.push({ label: 'Initial temp', value: `${fmtU(faultInitialTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` });
      elecRows.push({ label: 'Max short-time temp', value: `${fmtU(maxFaultTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` });
    }
    if (durationMode === 'profile') {
      steps.forEach((s, i) => elecRows.push({ label: `Step ${i + 1}`, value: `${s.current} A rms for ${s.durationS} s` }));
      elecRows.push({ label: 'Max allowable temp', value: `${fmtU(maxContinuousTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` });
    }

    const sectionsOut: ReportSection[] = [
      { heading: 'Busbar configuration', rows: geoRows },
      { heading: 'Material, surface & convection', rows: matRows },
      { heading: 'Electrical load & duration', rows: elecRows },
    ];

    if (anySectionCooled) {
      const coolantLabel = COOLANT_PRESETS.find(p => p.id === coolantPresetId)?.label ?? coolantPresetId;
      sectionsOut.push({
        heading: 'Conduction cooling',
        rows: [
          { label: 'Sections with conduction applied', value: sections.map((s, i) => (s.coolingEnabled ? `${i + 1}` : null)).filter(Boolean).join(', ') || 'None' },
          { label: 'Thermal interface material', value: `${fmtU(timThicknessMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}, k=${timConductivity} W/(m·K)` },
          { label: 'Metallic section', value: `${metalMaterialId}, ${fmtU(metalThicknessMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}, k=${fmt(metalConductivity, 0)} W/(m·K)` },
          { label: 'Coolant medium', value: `${coolantLabel} (c=${fmt(coolantSpecificHeat, 0)} J/(kg·K), ρ=${fmt(coolantDensity, 0)} kg/m³)` },
          { label: 'Flow rate', value: `${coolantFlowRateLPerMin} L/min` },
          { label: 'Coolant inlet temperature', value: `${fmtU(coolantInletTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` },
        ],
      });
    }

    return sectionsOut;
  }, [busbarType, sections, thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM, bulkResistanceMode, bulkResistance20uOhm, bulkPathLengthMm, bulkResistance20Ohm, bulkVolumeMm3, bulkSurfaceAreaMm2, orientation, material, emissivity, convMode, manualHValue, coatingThicknessMm, coatingConductivity, currentType, durationMode, current, frequency, ambientC, maxContinuousTempC, faultDurationS, faultInitialTempC, maxFaultTempC, steps, anySectionCooled, timThicknessMm, timConductivity, metalMaterialId, metalThicknessMm, metalConductivity, coolantPresetId, coolantSpecificHeat, coolantDensity, coolantFlowRateLPerMin, coolantInletTempC, unitSystem, totalMassKg]);

  const outputSections: ReportSection[] = useMemo(() => {
    const headline: ReportRow[] = [
      { label: durationMode === 'continuous' ? 'Peak steady-state temp' : durationMode === 'fault' ? 'Peak temp (fault)' : 'Peak temp (profile)', value: worstTempC !== undefined ? `${fmtU(worstTempC, unitSystem, UNIT_TEMP, 1)} ${unitLabel(unitSystem, UNIT_TEMP)}` : '—' },
      { label: 'Temperature rise', value: worstTempC !== undefined ? `${fmtU(worstTempC - referenceTempC, unitSystem, UNIT_TEMP_DELTA, 1)} ${unitSystem === 'imperial' ? '°F' : 'K'}` : '—' },
    ];
    if (durationMode === 'continuous') headline.push({ label: 'Max continuous current (rms)', value: maxCurrent !== null ? `${fmt(maxCurrent, 0)} A` : '—' });
    if (durationMode === 'fault') headline.push({ label: 'Min area for this fault', value: minArea !== null ? `${fmtU(minArea, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)}` : '—' });
    if (durationMode === 'profile' && transient) headline.push({ label: 'Profile duration', value: `${fmt(transient.timeS[transient.timeS.length - 1], 0)} s` });
    headline.push({ label: 'Total busbar loss', value: durationMode === 'continuous' ? (totalLossW !== undefined ? `${fmt(totalLossW, 1)} W` : '—') : (totalEnergyJ !== undefined ? `${fmt(totalEnergyJ / 1000, 2)} kJ` : '—') });
    if (durationMode === 'continuous' && totalResistanceOhm !== undefined) {
      headline.push({ label: `Resistance (${currentType === 'ac' ? 'Rac' : 'Rdc'}, operating temp)`, value: `${fmt(totalResistanceOhm * 1e6, 1)} µΩ` });
    }
    if (resistanceAt20Ohm !== undefined) {
      headline.push({ label: 'Resistance at 20°C (reference)', value: `${fmt(resistanceAt20Ohm * 1e6, 1)} µΩ` });
    }
    if (currentType === 'ac' && skinDepthAtTempMm !== null) {
      headline.push({ label: 'Skin depth', value: `${isFinite(skinDepthAtTempMm) ? fmtU(skinDepthAtTempMm, unitSystem, UNIT_LENGTH, 4) : '—'} ${unitLabel(unitSystem, UNIT_LENGTH)} (at ${fmtU(skinDepthTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, ${fmt(frequency, 0)} Hz)` });
    }
    if (anySectionCooled && durationMode === 'continuous') {
      headline.push({ label: 'Heat rejected via conduction cooling', value: `${fmt(coolantTotalHeatW, 1)} W` });
      headline.push({ label: 'Est. coolant temperature rise', value: `${fmtU(coolantTempRiseK, unitSystem, UNIT_TEMP_DELTA, 2)} ${unitSystem === 'imperial' ? '°F' : 'K'} (informational, not fed back into the result)` });
    }

    const nodeRows: ReportRow[] = nodes.map((node, i) => {
      const tempC = durationMode === 'continuous' ? steady?.tempsC[i]
        : durationMode === 'fault' ? adiabatic?.finalTempsC[i]
          : transient?.peakTempsC[i];
      const coolantW = durationMode === 'continuous' && anySectionCooled ? steady?.coolantLossPerNodeW[i] : undefined;
      return { label: node.label, value: `${fmtU(node.areaMm2, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)}, ${tempC !== undefined ? fmtU(tempC, unitSystem, UNIT_TEMP, 1) : '—'} ${unitLabel(unitSystem, UNIT_TEMP)}${coolantW !== undefined ? `, coolant ${fmt(coolantW, 1)} W` : ''}` };
    });

    return [
      { heading: 'Summary', rows: headline },
      { heading: busbarType === 'single' ? 'Per-section results' : busbarType === 'bulk' ? 'Bulk conductor result' : 'Bundle result', rows: nodeRows },
    ];
  }, [durationMode, worstTempC, referenceTempC, maxCurrent, minArea, transient, totalLossW, totalEnergyJ, totalResistanceOhm, resistanceAt20Ohm, nodes, steady, adiabatic, busbarType, anySectionCooled, coolantTotalHeatW, coolantTempRiseK, currentType, skinDepthAtTempMm, skinDepthTempC, frequency, unitSystem]);

  const handleExportPdf = () => {
    const pdfAccent = deriveAccentOnLight(accentHex);
    const diagrams: ReportDiagram[] = [];

    if (busbarType === 'single') {
      diagrams.push({ title: 'Busbar length profile (plan view)', svgMarkup: renderLengthProfileSvg(sections, pdfAccent) });
    } else if (busbarType === 'multiple') {
      diagrams.push({
        title: 'Busbar cross-section',
        svgMarkup: renderCrossSectionSvg(
          Array.from({ length: nBars }, () => ({ width: profileWidth, thickness: profileThickness, gapAfter: barGap })),
          orientation,
          pdfAccent
        ),
      });
    }
    // Bulk mode has no representative geometry to draw.

    if (anySectionCooled) {
      diagrams.push({
        title: 'Conduction cooling cross-section',
        svgMarkup: renderConductionStackSvg(thicknessMm, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity, pdfAccent),
      });
    }

    if (durationMode === 'profile' && transient) {
      diagrams.push({
        title: 'Current & temperature vs time',
        svgMarkup: renderTimeSeriesChartSvg(
          transient.timeS,
          transient.currentA,
          nodes.map((node, i) => ({ label: node.label, color: PALETTE[i % PALETTE.length], values: transient.nodeTempsC[i] })),
          ambientC,
          maxContinuousTempC
        ),
      });
    }

    exportReportToPdf({
      tabName: 'Busbar_Calculator',
      pageTitle: 'Busbar Temperature & Ampacity Calculator',
      accentHex,
      passStatus: passes !== null ? { pass: passes, label: passes ? 'Within temperature limit' : 'Exceeds temperature limit' } : null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams,
      disclaimer: 'Engineering estimation tool. Formulas: IEC 60287-1-1 (skin effect), IEC 60865-1 (short-circuit heating), generalised-fin nodal thermal network. Verify critical designs against the referenced standards and, where required, physical testing.',
      ...branding,
    });
  };

  const chartLegend = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.5rem' }}>
      {nodes.map((node, i) => (
        <span key={node.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
          {node.label}
        </span>
      ))}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-2)' }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--blue)', display: 'inline-block' }} />
        Current
      </span>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Busbar Calculator</div>
          <h1>Busbar Temperature &amp; Ampacity Calculator</h1>
          <p>
            Model a single tapered busbar (with axial heat conduction between sections of different
            cross-section) or a stack of parallel bars, then apply a steady load, a short-circuit fault,
            or a multi-step drive-cycle profile. Every formula used is shown below with your numbers substituted in.
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
              <span><span className="step-num">1</span>Busbar configuration</span>
            </div>
            <div className="field" style={{ marginBottom: '1rem' }}>
              <div className="segmented">
                <button className={busbarType === 'single' ? 'active' : ''} onClick={() => setBusbarType('single')}>Single (sections)</button>
                <button className={busbarType === 'multiple' ? 'active' : ''} onClick={() => setBusbarType('multiple')}>Multiple (stacked bars)</button>
                <button className={busbarType === 'bulk' ? 'active' : ''} onClick={() => setBusbarType('bulk')}>Bulk (CAD)</button>
              </div>
              <span className="hint">
                {busbarType === 'single'
                  ? `One conductor made of up to ${isPremium ? '10' : '2 (Premium unlocks up to 10)'} lengthwise sections of different width, sharing a common thickness — heat conducts between adjoining sections.`
                  : busbarType === 'multiple'
                    ? 'Several identical bars in parallel, sharing one profile and spacing.'
                    : 'A complex/arbitrary conductor described only by its extracted resistance, volume and surface area — for a bulk temperature of a shape too intricate to split into sections.'}
              </span>
            </div>

            {busbarType === 'single' ? (
              <>
                <div className="card-title" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 400 }}>Sections</span>
                  {!isPremium && sections.length >= FREE_SECTION_LIMIT ? (
                    <PremiumGate feature="More than 2 sections">
                      <button className="btn small" onClick={addSection}>+ Add section</button>
                    </PremiumGate>
                  ) : (
                    <button className="btn small" onClick={addSection} disabled={sections.length >= maxSections}>+ Add section</button>
                  )}
                </div>
                {sections.map((s, i) => (
                  <div className="step-row" key={s.id}>
                    <div className="bar-index">{i + 1}</div>
                    <div className="field">
                      <label>Width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                      <input autoComplete="off" type="number" min={0.001} value={toDisplay(s.width, unitSystem, UNIT_LENGTH)} onChange={e => updateSection(s.id, { width: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                    </div>
                    <div className="field">
                      <label>Length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                      <input autoComplete="off" type="number" min={0.001} value={toDisplay(s.length, unitSystem, UNIT_LENGTH)} onChange={e => updateSection(s.id, { length: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!s.coolingEnabled} onChange={e => updateSection(s.id, { coolingEnabled: e.target.checked })} style={{ width: 'auto' }} />
                        Apply conduction
                      </label>
                      {coatingThicknessMm > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={s.coatedEnabled ?? true} onChange={e => updateSection(s.id, { coatedEnabled: e.target.checked })} style={{ width: 'auto' }} />
                          Coat / overmould
                        </label>
                      )}
                      <button className="btn small danger" onClick={() => removeSection(s.id)} disabled={sections.length === 1}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="field" style={{ marginTop: '0.6rem' }}>
                  <label>Common thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.001} value={toDisplay(thicknessMm, unitSystem, UNIT_LENGTH)} onChange={e => setThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} style={{ maxWidth: 160 }} />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <BusbarLengthProfile sections={sections} />
                </div>
              </>
            ) : busbarType === 'bulk' ? (
              <>
                <div className="field">
                  <label>Resistance</label>
                  <div className="segmented">
                    <button className={bulkResistanceMode === 'fromLength' ? 'active' : ''} onClick={() => setBulkResistanceMode('fromLength')}>From path length</button>
                    <button className={bulkResistanceMode === 'enter' ? 'active' : ''} onClick={() => setBulkResistanceMode('enter')}>Enter value</button>
                  </div>
                  <span className="hint">
                    {bulkResistanceMode === 'fromLength'
                      ? 'No external tool needed — the resistance is computed from the selected material, the volume, and the current-path length below.'
                      : 'Paste a resistance from a field solver (e.g. Q3D) or a measurement.'}
                  </span>
                </div>
                <div className="grid grid-2">
                  {bulkResistanceMode === 'enter' ? (
                    <div className="field">
                      <label>Resistance at 20°C (µΩ)</label>
                      <input autoComplete="off" type="number" min={0.0001} step={0.1} value={bulkResistance20uOhm} onChange={e => setBulkResistance20uOhm(Number(e.target.value))} />
                      <span className="hint">DC or AC resistance of the whole conductor.</span>
                    </div>
                  ) : (
                    <div className="field">
                      <label>Current-path length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                      <input autoComplete="off" type="number" min={0.001} value={toDisplay(bulkPathLengthMm, unitSystem, UNIT_LENGTH)} onChange={e => setBulkPathLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                      <span className="hint">Centreline distance the current travels, terminal to terminal — measure it in CAD. Inferred R₂₀ ≈ {fmt(bulkResistance20Ohm * 1e6, 1)} µΩ ({material.name}).</span>
                    </div>
                  )}
                  <div className="field">
                    <label>Conductor volume (mm³)</label>
                    <input autoComplete="off" type="number" min={0.001} step={100} value={bulkVolumeMm3} onChange={e => setBulkVolumeMm3(Number(e.target.value))} />
                    <span className="hint">Solid metal volume from CAD (mass properties) — sets the thermal mass{bulkResistanceMode === 'fromLength' ? ' and, with the path length, the resistance' : ' and nominal current density'}.</span>
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Total exposed surface area (mm²)</label>
                    <input autoComplete="off" type="number" min={0.001} step={100} value={bulkSurfaceAreaMm2} onChange={e => setBulkSurfaceAreaMm2(Number(e.target.value))} />
                    <span className="hint">Wetted (air-exposed) surface area from CAD — the single biggest driver of the steady temperature. Exclude overmoulded/buried faces, or model them with the coating below.</span>
                  </div>
                </div>
                <span className="hint" style={{ display: 'block', marginTop: '0.4rem' }}>
                  A single equivalent conductor is synthesised to reproduce both the resistance and the volume exactly.
                  {bulkResistanceMode === 'fromLength'
                    ? ' Inferring R from length assumes a uniform cross-section (A = V/L), so it is a lower bound — a part that necks down runs a higher resistance and hotter. The AC skin factor is not added.'
                    : ' The AC skin factor is not re-applied (your entered resistance already includes it).'}
                  {' '}For natural convection the characteristic length is taken as the cube-root of the volume — set a manual convection coefficient below if you have a CFD-derived film value.
                </span>
              </>
            ) : (
              <>
                <div className="grid grid-2">
                  <div className="field">
                    <label>Bar width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0.001} value={toDisplay(profileWidth, unitSystem, UNIT_LENGTH)} onChange={e => setProfileWidth(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Bar thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0.001} value={toDisplay(profileThickness, unitSystem, UNIT_LENGTH)} onChange={e => setProfileThickness(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Number of bars</label>
                    <input autoComplete="off" type="number" min={1} max={20} value={nBars} onChange={e => setNBars(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Gap between bars ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0} value={toDisplay(barGap, unitSystem, UNIT_LENGTH)} onChange={e => setBarGap(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Bar length ({unitLabel(unitSystem, UNIT_LENGTH_M)}) <span className="hint">— for total loss</span></label>
                    <input autoComplete="off" type="number" min={0.001} value={toDisplay(bundleLengthM, unitSystem, UNIT_LENGTH_M)} onChange={e => setBundleLengthM(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH_M))} />
                  </div>
                  <div className="field">
                    <label>Total cross-section area</label>
                    <input value={`${fmtU(nodes[0]?.areaMm2 ?? 0, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)}`} readOnly />
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <BusbarCrossSection
                    bars={Array.from({ length: nBars }, (_, i) => ({ id: `b${i}`, width: profileWidth, thickness: profileThickness, gapAfter: barGap }))}
                    orientation={orientation}
                  />
                </div>
              </>
            )}

            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Mounting orientation</label>
                <div className="segmented">
                  <button className={orientation === 'vertical' ? 'active' : ''} onClick={() => setOrientation('vertical')}>Vertical (edge)</button>
                  <button className={orientation === 'horizontal' ? 'active' : ''} onClick={() => setOrientation('horizontal')}>Horizontal (flat)</button>
                </div>
                <span className="hint">
                  {convMode === 'manual'
                    ? 'Convection is set to a manual value below, so orientation has no effect until you switch back to Auto-calculate.'
                    : 'Feeds the auto-calculated convection coefficient (leading constant 1.42 vertical vs 1.0 horizontal, same ΔT and characteristic length) — its effect on final temperature is diluted by radiation, which doesn\'t depend on orientation, so the difference is often modest rather than dramatic.'}
                </span>
              </div>
              <div className="field">
                <label>Total mass</label>
                <input value={`${fmt(totalMassKg, totalMassKg < 1 ? 3 : 2)} kg`} readOnly />
                <span className="hint">Solid conductor mass (density × volume) — excludes coating/overmould, TIM and mounting hardware.</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Material, surface &amp; convection</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Material</label>
                <div className="segmented">
                  <button className={materialId === 'copper' ? 'active' : ''} onClick={() => onMaterialChange('copper')}>Copper</button>
                  <button className={materialId === 'aluminium' ? 'active' : ''} onClick={() => onMaterialChange('aluminium')}>Aluminium</button>
                </div>
              </div>
              <div className="field">
                <label>Surface finish (emissivity)</label>
                <select value={emissivity} onChange={e => setEmissivity(Number(e.target.value))}>
                  {EMISSIVITY_PRESETS.map(p => (
                    <option key={p.id} value={p.value}>{p.label} (ε={p.value})</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Natural convection coefficient</label>
                <div className="grid grid-2">
                  <div className="segmented">
                    <button className={convMode === 'auto' ? 'active' : ''} onClick={() => setConvMode('auto')}>Auto-calculate</button>
                    <button className={convMode === 'manual' ? 'active' : ''} onClick={() => setConvMode('manual')}>Manual value</button>
                  </div>
                  {convMode === 'manual' && (
                    <input autoComplete="off" type="number" min={0.1} step={0.5} value={manualHValue} onChange={e => setManualHValue(Number(e.target.value))} />
                  )}
                </div>
                <span className="hint">
                  Auto-calculate uses the McAdams-style plate correlation h=C·(ΔT/L)^0.25. Manual lets you fix h directly —
                  typical still-air natural convection for busbars is 5–8 W/(m²·K); {DEFAULT_NATURAL_CONVECTION_H} W/(m²·K) is a common default.
                </span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Coating</label>
                <select value={coatingPresetId} onChange={e => onCoatingPresetChange(e.target.value)}>
                  {COATING_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Coating thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0} step={0.001} value={toDisplay(coatingThicknessMm, unitSystem, UNIT_LENGTH)} onChange={e => setCoatingThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Coating thermal conductivity (W/m·K)</label>
                <input autoComplete="off" type="number" min={0.01} value={coatingConductivity} onChange={e => setCoatingConductivity(Number(e.target.value))} />
                <span className="hint">
                  A coating or overmould adds a conduction resistance in series with the convection/radiation film,
                  between the conductor and ambient — it traps heat (raises conductor temperature) even as it may also
                  raise emissivity. Set thickness to 0 for bare metal.
                  {busbarType === 'single' && coatingThicknessMm > 0 && ' In single-section mode, tick "Coat / overmould" on each section it applies to (default: all).'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Electrical load &amp; duration</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Current type</label>
                <div className="segmented">
                  <button className={currentType === 'ac' ? 'active' : ''} onClick={() => setCurrentType('ac')}>AC</button>
                  <button className={currentType === 'dc' ? 'active' : ''} onClick={() => setCurrentType('dc')}>DC</button>
                </div>
              </div>
              {durationMode !== 'profile' && (
                <div className="field">
                  <label>Current (A rms)</label>
                  <input autoComplete="off" type="number" min={0} value={current} onChange={e => setCurrent(Number(e.target.value))} />
                </div>
              )}
              {currentType === 'ac' && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Frequency (Hz)</label>
                  <div className="grid grid-2">
                    <input autoComplete="off" type="number" min={0} value={frequency} onChange={e => setFrequency(Number(e.target.value))} />
                    <div className="segmented">
                      <button className={frequency === 50 ? 'active' : ''} onClick={() => setFrequency(50)}>50 Hz grid</button>
                      <button className={frequency === 60 ? 'active' : ''} onClick={() => setFrequency(60)}>60 Hz grid</button>
                      <button className="btn small" onClick={() => setShowMotorHelper(v => !v)}>
                        {showMotorHelper ? 'Hide motor helper' : 'Derive from motor speed ▾'}
                      </button>
                    </div>
                  </div>
                  <span className="hint">
                    Motor-drive phase busbars carry the fundamental electrical frequency set by the inverter, not a fixed
                    grid frequency — use the helper below to derive it from motor speed and pole count.
                  </span>

                  {showMotorHelper && (
                    <div className="grid grid-3" style={{ marginTop: '0.65rem', padding: '0.75rem', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <div className="field">
                        <label>Motor speed (RPM)</label>
                        <input autoComplete="off" type="number" min={0} value={motorRpm} onChange={e => setMotorRpm(Number(e.target.value))} />
                      </div>
                      <div className="field">
                        <label>Pole pairs</label>
                        <input autoComplete="off" type="number" min={1} value={motorPolePairs} onChange={e => setMotorPolePairs(Number(e.target.value))} />
                        <span className="hint">e.g. an 8-pole motor = 4 pole pairs</span>
                      </div>
                      <div className="field">
                        <label>f = n × p / 60</label>
                        <input value={`${fmt(derivedMotorFreq, 1)} Hz`} readOnly />
                        <button className="btn small primary" onClick={() => setFrequency(derivedMotorFreq)}>Use this frequency</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="field">
                <label>Ambient temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(ambientC, unitSystem, UNIT_TEMP)} onChange={e => setAmbientC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Duration mode</label>
                <div className="segmented">
                  <button className={durationMode === 'continuous' ? 'active' : ''} onClick={() => setDurationMode('continuous')}>Continuous</button>
                  <button className={durationMode === 'fault' ? 'active' : ''} onClick={() => setDurationMode('fault')}>Short-time / fault</button>
                  <PremiumGate feature="Load profile mode">
                    <button className={durationMode === 'profile' ? 'active' : ''} onClick={() => setDurationMode('profile')}>Load profile</button>
                  </PremiumGate>
                </div>
              </div>
            </div>

            {durationMode === 'continuous' && (
              <div className="grid grid-2" style={{ marginTop: '0.85rem' }}>
                <div className="field">
                  <label>Max allowable temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                  <input autoComplete="off" type="number" value={toDisplay(maxContinuousTempC, unitSystem, UNIT_TEMP)} onChange={e => setMaxContinuousTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  <span className="hint">IEC 61439-1 default: 35°C ambient + 70K rise = 105°C for bare bars.</span>
                </div>
              </div>
            )}

            {durationMode === 'fault' && (
              <div className="grid grid-2" style={{ marginTop: '0.85rem' }}>
                <div className="field">
                  <label>Fault duration (s)</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.1} value={faultDurationS} onChange={e => setFaultDurationS(Number(e.target.value))} />
                  <span className="hint">Adiabatic assumption is valid up to a few seconds.</span>
                </div>
                <div className="field">
                  <label>Initial (pre-fault) temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                  <input autoComplete="off" type="number" value={toDisplay(faultInitialTempC, unitSystem, UNIT_TEMP)} onChange={e => setFaultInitialTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                </div>
                <div className="field">
                  <label>Max short-time temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                  <input autoComplete="off" type="number" value={toDisplay(maxFaultTempC, unitSystem, UNIT_TEMP)} onChange={e => setMaxFaultTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  <span className="hint">Bare-conductor limit: 250°C copper / 200°C aluminium (typical).</span>
                </div>
              </div>
            )}

            {durationMode === 'profile' && (
              <div style={{ marginTop: '0.85rem' }}>
                <div className="card-title" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 400 }}>Load steps (up to 10, simulated in order from the unpowered steady state — ambient, or below it where conduction cooling is applied)</span>
                  <button className="btn small" onClick={addStep} disabled={steps.length >= 10}>+ Add step</button>
                </div>
                {steps.map((s, i) => (
                  <div className="step-row" key={s.id}>
                    <div className="bar-index">{i + 1}</div>
                    <div className="field">
                      <label>Current (A rms)</label>
                      <input autoComplete="off" type="number" min={0} value={s.current} onChange={e => updateStep(s.id, { current: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                      <label>Duration (s)</label>
                      <input autoComplete="off" type="number" min={0.1} value={s.durationS} onChange={e => updateStep(s.id, { durationS: Number(e.target.value) })} />
                    </div>
                    <button className="btn small danger" onClick={() => removeStep(s.id)} disabled={steps.length === 1}>Remove</button>
                  </div>
                ))}
                <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                  <div className="field">
                    <label>Max allowable temperature (°C)</label>
                    <input autoComplete="off" type="number" value={maxContinuousTempC} onChange={e => setMaxContinuousTempC(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {anySectionCooled && (
            <div className="card">
              <div className="card-title"><span><span className="step-num">4</span>Conduction cooling</span></div>
              <p className="note" style={{ marginBottom: '0.85rem' }}>
                Applies to the {sections.filter(s => s.coolingEnabled).length} section(s) ticked "Apply conduction"
                above. Heat leaves that one face through the thermal interface material and metallic section to
                the coolant, in parallel with (reduced) natural convection/radiation from the section's remaining
                exposed faces.
              </p>
              <div className="grid grid-2">
                <div className="field">
                  <label>Thermal interface material</label>
                  <select value={timPresetId} onChange={e => onTimPresetChange(e.target.value)}>
                    {TIM_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div />
                <div className="field">
                  <label>TIM thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.001} step={0.001} value={toDisplay(timThicknessMm, unitSystem, UNIT_LENGTH)} onChange={e => setTimThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>TIM thermal conductivity (W/m·K)</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.1} value={timConductivity} onChange={e => setTimConductivity(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Metallic section material</label>
                  <div className="segmented">
                    <button className={metalMaterialId === 'aluminium' ? 'active' : ''} onClick={() => setMetalMaterialId('aluminium')}>Aluminium</button>
                    <button className={metalMaterialId === 'copper' ? 'active' : ''} onClick={() => setMetalMaterialId('copper')}>Copper</button>
                    <button className={metalMaterialId === 'custom' ? 'active' : ''} onClick={() => setMetalMaterialId('custom')}>Custom</button>
                  </div>
                </div>
                <div className="field">
                  <label>Metallic section thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.001} value={toDisplay(metalThicknessMm, unitSystem, UNIT_LENGTH)} onChange={e => setMetalThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                {metalMaterialId === 'custom' && (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Custom metallic section conductivity (W/m·K)</label>
                    <input autoComplete="off" type="number" min={1} value={customMetalConductivity} onChange={e => setCustomMetalConductivity(Number(e.target.value))} />
                  </div>
                )}
                <div className="field">
                  <label>Coolant medium</label>
                  <select value={coolantPresetId} onChange={e => onCoolantPresetChange(e.target.value)}>
                    {COOLANT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <span className="hint">Specific heat: {fmt(coolantSpecificHeat, 0)} J/(kg·K) · Density: {fmt(coolantDensity, 0)} kg/m³</span>
                </div>
                <div className="field">
                  <label>Flow rate (L/min)</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={coolantFlowRateLPerMin} onChange={e => setCoolantFlowRateLPerMin(Number(e.target.value))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Coolant inlet temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                  <input autoComplete="off" type="number" value={toDisplay(coolantInletTempC, unitSystem, UNIT_TEMP)} onChange={e => setCoolantInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  <span className="hint">Used as the fixed sink temperature for the conduction path — the metallic section's outer face is taken to be directly at this temperature (no separate coolant-film resistance term).</span>
                </div>
                {coolantPresetId === 'custom' && (
                  <>
                    <div className="field">
                      <label>Coolant density (kg/m³)</label>
                      <input autoComplete="off" type="number" min={1} value={coolantDensity} onChange={e => setCoolantDensity(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Coolant specific heat (J/kg·K)</label>
                      <input autoComplete="off" type="number" min={1} value={coolantSpecificHeat} onChange={e => setCoolantSpecificHeat(Number(e.target.value))} />
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: '1rem' }}>
                <ConductionStackCrossSection
                  busbarThicknessMm={thicknessMm}
                  timThicknessMm={timThicknessMm}
                  timConductivity={timConductivity}
                  metalThicknessMm={metalThicknessMm}
                  metalConductivity={metalConductivity}
                />
              </div>

              {durationMode === 'continuous' && (
                <div className="result-tile" style={{ marginTop: '0.85rem', maxWidth: 340 }}>
                  <div className="label">Estimated coolant temperature rise</div>
                  <div className="value">{fmt(coolantTempRiseK, 2)}<span className="unit">K</span></div>
                  <div className="hint">
                    Informational — an exact energy balance (ΔT=Q/(ṁ·cp)) on the heat absorbed by the coolant
                    path, but not fed back into the busbar temperature result above (which uses the fixed inlet
                    temperature as the sink, same as ambient air). Add this manually to the inlet temperature for
                    a worst-case check.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

            {passes !== null && (
              <div className={`status-banner ${passes ? 'pass' : 'fail'}`}>
                {passes ? '✓ Within temperature limit' : '✗ Exceeds temperature limit'}
              </div>
            )}

            <div className="result-grid" style={{ marginBottom: nodes.length > 1 ? '1.1rem' : 0 }}>
              <div className="result-tile">
                <div className="label">{durationMode === 'continuous' ? 'Peak steady-state temp' : durationMode === 'fault' ? 'Peak temp (fault)' : 'Peak temp (profile)'}</div>
                <div className={`value ${passes === false ? 'neg' : passes === true ? 'pos' : ''}`}>
                  {worstTempC !== undefined ? fmtU(worstTempC, unitSystem, UNIT_TEMP, 1) : '—'}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span>
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Temperature rise</div>
                <div className="value">
                  {worstTempC !== undefined ? fmtU(worstTempC - referenceTempC, unitSystem, UNIT_TEMP_DELTA, 1) : '—'}
                  <span className="unit">{unitSystem === 'imperial' ? '°F' : 'K'}</span>
                </div>
              </div>
              {durationMode === 'continuous' && (
                <div className="result-tile">
                  <div className="label">Max continuous current (rms)</div>
                  <div className="value">{maxCurrent !== null ? fmt(maxCurrent, 0) : '—'}<span className="unit">A</span></div>
                </div>
              )}
              {durationMode === 'fault' && (
                <div className="result-tile">
                  <div className="label">Min. area for this fault</div>
                  <div className="value">{minArea !== null ? fmtU(minArea, unitSystem, UNIT_AREA, 3) : '—'}<span className="unit">{unitLabel(unitSystem, UNIT_AREA)}</span></div>
                </div>
              )}
              {durationMode === 'profile' && transient && (
                <div className="result-tile">
                  <div className="label">Profile duration</div>
                  <div className="value">{fmt(transient.timeS[transient.timeS.length - 1], 0)}<span className="unit">s</span></div>
                </div>
              )}
              {durationMode === 'continuous' && totalLossW !== undefined && (
                <div className="result-tile">
                  <div className="label">Total busbar loss</div>
                  <div className="value">{fmt(totalLossW, 1)}<span className="unit">W</span></div>
                </div>
              )}
              {durationMode === 'continuous' && totalResistanceOhm !== undefined && (
                <div className="result-tile">
                  <div className="label">Resistance ({currentType === 'ac' ? 'Rac' : 'Rdc'})</div>
                  <div className="value">{fmt(totalResistanceOhm * 1e6, 1)}<span className="unit">µΩ</span></div>
                  <div className="hint">at the solved operating temp{nodes.length > 1 ? `, summed over ${nodes.length} sections` : ''}</div>
                </div>
              )}
              {resistanceAt20Ohm !== undefined && (
                <div className="result-tile">
                  <div className="label">Resistance at 20°C</div>
                  <div className="value">{fmt(resistanceAt20Ohm * 1e6, 1)}<span className="unit">µΩ</span></div>
                  <div className="hint">reference basis — compare with field-solver / measured values</div>
                </div>
              )}
              {durationMode !== 'continuous' && totalEnergyJ !== undefined && (
                <div className="result-tile">
                  <div className="label">Total busbar loss</div>
                  <div className="value">{fmt(totalEnergyJ / 1000, 2)}<span className="unit">kJ</span></div>
                </div>
              )}
              {currentType === 'ac' && skinDepthAtTempMm !== null && (
                <div className="result-tile">
                  <div className="label">Skin depth</div>
                  <div className="value">{isFinite(skinDepthAtTempMm) ? fmtU(skinDepthAtTempMm, unitSystem, UNIT_LENGTH, 4) : '—'}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                  <div className="hint">at {fmtU(skinDepthTempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}, {fmt(frequency, 0)} Hz</div>
                </div>
              )}
            </div>

            {/* per-node table */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>{busbarType === 'single' ? 'Section' : busbarType === 'bulk' ? 'Conductor' : 'Bundle'}</th>
                  <th>Area ({unitLabel(unitSystem, UNIT_AREA)})</th>
                  {durationMode !== 'profile' && <th>Current density (A/mm²)</th>}
                  {durationMode === 'continuous' && steady && <th>Rac (<span style={{ textTransform: 'none' }}>µΩ</span>)</th>}
                  <th>Loss {durationMode === 'continuous' ? '(W)' : '(kJ)'}</th>
                  {durationMode === 'continuous' && steady && anySectionCooled && <th>Coolant (W)</th>}
                  <th>{durationMode === 'profile' ? `Peak temp (${unitLabel(unitSystem, UNIT_TEMP)})` : durationMode === 'fault' ? `Final temp (${unitLabel(unitSystem, UNIT_TEMP)})` : `Temp (${unitLabel(unitSystem, UNIT_TEMP)})`}</th>
                  {durationMode === 'fault' && <th>Pass</th>}
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, i) => {
                  const tempC = durationMode === 'continuous' ? steady?.tempsC[i]
                    : durationMode === 'fault' ? adiabatic?.finalTempsC[i]
                      : transient?.peakTempsC[i];
                  const nodePass = durationMode === 'fault' && tempC !== undefined ? tempC <= maxFaultTempC : null;
                  const lossDisplay = durationMode === 'continuous' ? lossPerNodeW?.[i] : energyPerNodeJ ? energyPerNodeJ[i] / 1000 : undefined;
                  return (
                    <tr key={node.id}>
                      <td>{node.label}</td>
                      <td>{fmtU(node.areaMm2, unitSystem, UNIT_AREA, 3)}</td>
                      {durationMode !== 'profile' && <td>{fmt(current / node.areaMm2, 2)}</td>}
                      {durationMode === 'continuous' && steady && <td>{fmt(steady.racTotalPerNode[i] * 1e6, 1)}</td>}
                      <td>{lossDisplay !== undefined ? fmt(lossDisplay, durationMode === 'continuous' ? 1 : 2) : '—'}</td>
                      {durationMode === 'continuous' && steady && anySectionCooled && <td>{fmt(steady.coolantLossPerNodeW[i], 1)}</td>}
                      <td>{tempC !== undefined ? fmtU(tempC, unitSystem, UNIT_TEMP, 1) : '—'}</td>
                      {durationMode === 'fault' && <td className={nodePass ? 'pass' : 'fail'}>{nodePass ? '✓' : '✗'}</td>}
                    </tr>
                  );
                })}
                {nodes.length > 1 && (
                  <tr>
                    <td><b>Total</b></td>
                    <td>{fmtU(nodes.reduce((s, n) => s + n.areaMm2, 0), unitSystem, UNIT_AREA, 3)}</td>
                    {durationMode !== 'profile' && <td>—</td>}
                    {durationMode === 'continuous' && steady && <td>—</td>}
                    <td><b>{durationMode === 'continuous' ? (totalLossW !== undefined ? fmt(totalLossW, 1) : '—') : (totalEnergyJ !== undefined ? fmt(totalEnergyJ / 1000, 2) : '—')}</b></td>
                    {durationMode === 'continuous' && steady && anySectionCooled && <td><b>{fmt(coolantTotalHeatW, 1)}</b></td>}
                    <td>—</td>
                    {durationMode === 'fault' && <td>—</td>}
                  </tr>
                )}
              </tbody>
            </table>

            {durationMode === 'continuous' && steady && steady.conductionFlowsW.length > 0 && (
              <p className="note" style={{ marginTop: '0.75rem' }}>
                Conduction between sections: {steady.conductionFlowsW.map((q, i) => `${nodes[i].label}→${nodes[i + 1].label} ${fmt(q, 1)} W`).join(', ')}
              </p>
            )}
          </div>

          {durationMode === 'profile' && transient && (
            <div className="card">
              <div className="card-title">
                <span>Current &amp; temperature vs time</span>
                <button className="icon-btn" onClick={() => setChartExpanded(true)} title="Expand chart" aria-label="Expand chart">⛶</button>
              </div>
              <TimeSeriesChart
                timeS={transient.timeS}
                currentA={transient.currentA}
                ambientC={ambientC}
                maxTempC={maxContinuousTempC}
                series={nodes.map((node, i) => ({ label: node.label, color: PALETTE[i % PALETTE.length], values: transient.nodeTempsC[i] }))}
              />
              {chartLegend}
            </div>
          )}

        </div>
      </div>

      <SavedCalculations
        saves={saved.saves}
        loading={saved.loading}
        loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())}
        onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())}
        onRename={saved.rename}
        onDelete={saved.remove}
      />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Current is entered as RMS (root-mean-square) throughout — continuous, fault, and every load-profile step —
          and used directly as I in P = I²·Rac, the standard formula for average AC (or DC) power dissipation in a
          resistor; no separate peak/RMS conversion is applied or needed, since RMS is defined precisely so that
          equation gives the correct heating effect. Steady-state and load-profile heating are solved with a nodal
          thermal network: each section (or the stacked-bar bundle, as one lumped node) generates I²R heat, exchanges
          heat with neighbouring sections
          by axial conduction (generalised fin equation with internal heat generation, discretised and solved
          with the Thomas algorithm), and loses heat to ambient by natural convection + radiation, in series with
          any coating's conduction resistance (t/(k·A), same generalised-fin-style discretisation). Skin effect
          uses the IEC 60287-1-1 formula. Load profiles are marched forward in time with backward-Euler
          integration (unconditionally stable) using each material's density and specific heat for thermal
          capacitance. Short-circuit heating uses the IEC 60865-1 adiabatic method per section (K = 226 A·√s/mm²
          copper, 148 aluminium; β = 234.5°C copper, 228°C aluminium) — conduction between sections is neglected
          for faults since it is slow relative to typical fault durations. Multi-bar bundles reduce exposed
          surface area on faces that face a narrow gap; proximity effect on <em>resistance</em> and PWM
          switching-ripple heating are not modelled. A section with "Apply conduction" ticked loses heat
          through an additional parallel path — thermal interface material + metallic section, same
          t/(k·A) conduction idiom as the coating — applied to exactly one face (width×length) of that
          section, which is correspondingly removed from its air-exposed area. The metallic section's outer
          face is taken to be directly at the coolant's inlet temperature (no separate coolant-film
          resistance term is modelled). Flow rate and coolant medium feed one exact, separate calculation
          (an energy-balance coolant temperature rise) that is informational only and not fed back into the
          busbar temperature result, which always uses the fixed inlet temperature as the coolant-side sink,
          the same way ambient air is always treated as a fixed-temperature reservoir. A coating or overmould is a
          conduction resistance t/(k·A) in series with the outer film, applied per-section (single mode) or to the
          whole conductor (bundle/bulk); a thick overmould is just a thick coating, using the bar's own surface area
          for the outer film (so enter the mould's true external area in bulk mode if it differs). Bulk (CAD) mode
          synthesises one equivalent conductor from an entered 20°C resistance, volume and surface area — reproducing
          both the resistance and the thermal mass exactly — and does not re-apply the AC skin factor, since a
          measured/field-solver resistance already embeds it. Resistance is reported both at the solved operating
          temperature and at a 20°C reference (the basis field solvers typically report), the two differing by the
          copper/aluminium resistivity temperature factor. For critical designs,
          verify against manufacturer test data and, where required, by test.
        </p>
        <p className="note">
          <b>Validated:</b> the IEC 60865-1 adiabatic short-circuit formula was independently re-derived from
          the documented equation and matched the calculator's output exactly (a 20 kA/1s fault on a 100 mm²
          copper section: 322.43°C both ways), and its inverse (minimum area for a given temperature limit)
          round-trips back to exactly 100 mm². DC resistance matches ρ/A by hand exactly, and the skin-effect
          factor correctly approaches ks = 1 (no skin effect) at low frequency — the same skin-effect and
          DC-resistance functions are reused unchanged by the Cable/Wire Sizing and PCB Trace Width
          calculators, both separately validated.
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

        {currentType === 'ac' && skinAt20 && durationMode === 'fault' && (
          <div className="note" style={{ marginTop: '0.5rem' }}>
            Note: the adiabatic short-circuit formula does not include skin effect — fault currents are dominated by
            the conductor's thermal mass, and skin effect only meaningfully redistributes current within the first
            few cycles.
          </div>
        )}
      </div>

      {chartExpanded && durationMode === 'profile' && transient && (
        <div className="chart-modal-backdrop" onClick={() => setChartExpanded(false)}>
          <div className="chart-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="card-title">
              <span>Current &amp; temperature vs time</span>
              <button className="icon-btn" onClick={() => setChartExpanded(false)} title="Close" aria-label="Close">✕</button>
            </div>
            <div className="chart-modal-body">
              <TimeSeriesChart
                timeS={transient.timeS}
                currentA={transient.currentA}
                ambientC={ambientC}
                maxTempC={maxContinuousTempC}
                series={nodes.map((node, i) => ({ label: node.label, color: PALETTE[i % PALETTE.length], values: transient.nodeTempsC[i] }))}
              />
            </div>
            {chartLegend}
          </div>
        </div>
      )}
    </div>
  );
}
