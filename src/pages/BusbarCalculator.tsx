import { useEffect, useMemo, useState } from 'react';
import BusbarCrossSection from '../components/BusbarCrossSection';
import BusbarLengthProfile from '../components/BusbarLengthProfile';
import ConductionStackCrossSection from '../components/ConductionStackCrossSection';
import TimeSeriesChart from '../components/TimeSeriesChart';
import { useTheme } from '../lib/ThemeContext';
import { deriveAccentOnLight } from '../lib/theme';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportDiagram } from '../lib/pdfExport';
import { renderLengthProfileSvg, renderCrossSectionSvg, renderConductionStackSvg, renderTimeSeriesChartSvg } from '../lib/pdfDiagrams';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import { MATERIALS, EMISSIVITY_PRESETS, COATING_PRESETS, TIM_PRESETS, COOLANT_PRESETS } from '../lib/materials';
import {
  buildSingleBusbarNodes,
  buildMultipleBarNodes,
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

export default function BusbarCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
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

  const nodes = useMemo(() => {
    if (busbarType === 'single') return buildSingleBusbarNodes(sections, thicknessMm);
    return buildMultipleBarNodes(profileWidth, profileThickness, nBars, barGap, bundleLengthM);
  }, [busbarType, sections, thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM]);

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
    return solveNodalSteadyState(nodes, material, current, currentType, effFrequency, ambientC, emissivity, orientation, manualH, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, current, currentType, effFrequency, ambientC, emissivity, orientation, manualH, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

  const maxCurrent = useMemo(() => {
    if (!validGeometry || durationMode !== 'continuous') return null;
    return solveMaxContinuousCurrentNodal(nodes, material, currentType, effFrequency, ambientC, emissivity, orientation, manualH, maxContinuousTempC, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, currentType, effFrequency, ambientC, emissivity, orientation, manualH, maxContinuousTempC, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

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
    return solveNodalTransient(nodes, material, currentType, effFrequency, ambientC, emissivity, orientation, manualH, steps.map(s => ({ current: s.current, durationS: s.durationS })), coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC);
  }, [validGeometry, durationMode, nodes, material, currentType, effFrequency, ambientC, emissivity, orientation, manualH, steps, coatingThicknessMm, coatingConductivity, coolantConductancePerNode, coolantInletTempC]);

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

  const worstTempC = durationMode === 'continuous' ? (steady ? Math.max(...steady.tempsC) : undefined)
    : durationMode === 'fault' ? (adiabatic ? Math.max(...adiabatic.finalTempsC) : undefined)
      : (transient ? Math.max(...transient.peakTempsC) : undefined);
  const limitTempC = durationMode === 'fault' ? maxFaultTempC : maxContinuousTempC;
  const passes = worstTempC !== undefined ? worstTempC <= limitTempC : null;
  const referenceTempC = durationMode === 'fault' ? faultInitialTempC : ambientC;

  const rdcRef = dcResistancePerMetre(material, 20, nodes[0]?.areaMm2 || 1);
  const rho20 = resistivityAt(material, 20);
  const skinAt20 = currentType === 'ac' ? skinEffectFactor(rdcRef, frequency) : null;

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
  }, [nodes, material, rho20, durationMode, steady, frequency, manualH, coatingThicknessMm, coatingConductivity, adiabatic, faultInitialTempC, faultDurationS, minArea, transient, steps, anySectionCooled, timThicknessMm, timConductivity, metalThicknessMm, metalConductivity, coolantInletTempC, coolantConductancePerNode]);

  const inputSections: ReportSection[] = useMemo(() => {
    const geoRows: ReportRow[] = [{ label: 'Busbar type', value: busbarType === 'single' ? 'Single (sections)' : 'Multiple (stacked bars)' }];
    if (busbarType === 'single') {
      sections.forEach((s, i) => geoRows.push({ label: `Section ${i + 1}`, value: `${s.width} × ${s.length} mm` }));
      geoRows.push({ label: 'Common thickness', value: `${thicknessMm} mm` });
    } else {
      geoRows.push({ label: 'Bar profile', value: `${profileWidth} × ${profileThickness} mm` });
      geoRows.push({ label: 'Number of bars', value: `${nBars}` });
      geoRows.push({ label: 'Gap between bars', value: `${barGap} mm` });
      geoRows.push({ label: 'Bar length', value: `${bundleLengthM} m` });
    }
    geoRows.push({ label: 'Mounting orientation', value: orientation === 'vertical' ? 'Vertical (edge)' : 'Horizontal (flat)' });

    const matRows: ReportRow[] = [
      { label: 'Material', value: material.name },
      { label: 'Emissivity', value: `${emissivity}` },
      { label: 'Convection', value: convMode === 'auto' ? 'Auto-calculated' : `Manual ${manualHValue} W/(m²K)` },
      { label: 'Coating', value: coatingThicknessMm > 0 ? `${coatingThicknessMm} mm, k=${coatingConductivity} W/(m·K)` : 'None (bare)' },
    ];

    const elecRows: ReportRow[] = [{ label: 'Current type', value: currentType.toUpperCase() }];
    if (durationMode !== 'profile') elecRows.push({ label: 'Current', value: `${fmt(current, 0)} A rms` });
    if (currentType === 'ac') elecRows.push({ label: 'Frequency', value: `${frequency} Hz` });
    elecRows.push({ label: 'Ambient temperature', value: `${ambientC} °C` });
    elecRows.push({ label: 'Duration mode', value: durationMode === 'continuous' ? 'Continuous' : durationMode === 'fault' ? 'Short-time / fault' : 'Load profile' });
    if (durationMode === 'continuous') elecRows.push({ label: 'Max allowable temp', value: `${maxContinuousTempC} °C` });
    if (durationMode === 'fault') {
      elecRows.push({ label: 'Fault duration', value: `${faultDurationS} s` });
      elecRows.push({ label: 'Initial temp', value: `${faultInitialTempC} °C` });
      elecRows.push({ label: 'Max short-time temp', value: `${maxFaultTempC} °C` });
    }
    if (durationMode === 'profile') {
      steps.forEach((s, i) => elecRows.push({ label: `Step ${i + 1}`, value: `${s.current} A for ${s.durationS} s` }));
      elecRows.push({ label: 'Max allowable temp', value: `${maxContinuousTempC} °C` });
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
          { label: 'Thermal interface material', value: `${timThicknessMm} mm, k=${timConductivity} W/(m·K)` },
          { label: 'Metallic section', value: `${metalMaterialId}, ${metalThicknessMm} mm, k=${fmt(metalConductivity, 0)} W/(m·K)` },
          { label: 'Coolant medium', value: `${coolantLabel} (c=${fmt(coolantSpecificHeat, 0)} J/(kg·K), ρ=${fmt(coolantDensity, 0)} kg/m³)` },
          { label: 'Flow rate', value: `${coolantFlowRateLPerMin} L/min` },
          { label: 'Coolant inlet temperature', value: `${coolantInletTempC} °C` },
        ],
      });
    }

    return sectionsOut;
  }, [busbarType, sections, thicknessMm, profileWidth, profileThickness, nBars, barGap, bundleLengthM, orientation, material, emissivity, convMode, manualHValue, coatingThicknessMm, coatingConductivity, currentType, durationMode, current, frequency, ambientC, maxContinuousTempC, faultDurationS, faultInitialTempC, maxFaultTempC, steps, anySectionCooled, timThicknessMm, timConductivity, metalMaterialId, metalThicknessMm, metalConductivity, coolantPresetId, coolantSpecificHeat, coolantDensity, coolantFlowRateLPerMin, coolantInletTempC]);

  const outputSections: ReportSection[] = useMemo(() => {
    const headline: ReportRow[] = [
      { label: durationMode === 'continuous' ? 'Peak steady-state temp' : durationMode === 'fault' ? 'Peak temp (fault)' : 'Peak temp (profile)', value: worstTempC !== undefined ? `${fmt(worstTempC, 1)} °C` : '—' },
      { label: 'Temperature rise', value: worstTempC !== undefined ? `${fmt(worstTempC - referenceTempC, 1)} K` : '—' },
    ];
    if (durationMode === 'continuous') headline.push({ label: 'Max continuous current', value: maxCurrent !== null ? `${fmt(maxCurrent, 0)} A` : '—' });
    if (durationMode === 'fault') headline.push({ label: 'Min area for this fault', value: minArea !== null ? `${fmt(minArea, 0)} mm²` : '—' });
    if (durationMode === 'profile' && transient) headline.push({ label: 'Profile duration', value: `${fmt(transient.timeS[transient.timeS.length - 1], 0)} s` });
    headline.push({ label: 'Total busbar loss', value: durationMode === 'continuous' ? (totalLossW !== undefined ? `${fmt(totalLossW, 1)} W` : '—') : (totalEnergyJ !== undefined ? `${fmt(totalEnergyJ / 1000, 2)} kJ` : '—') });
    if (anySectionCooled && durationMode === 'continuous') {
      headline.push({ label: 'Heat rejected via conduction cooling', value: `${fmt(coolantTotalHeatW, 1)} W` });
      headline.push({ label: 'Est. coolant temperature rise', value: `${fmt(coolantTempRiseK, 2)} K (informational, not fed back into the result)` });
    }

    const nodeRows: ReportRow[] = nodes.map((node, i) => {
      const tempC = durationMode === 'continuous' ? steady?.tempsC[i]
        : durationMode === 'fault' ? adiabatic?.finalTempsC[i]
          : transient?.peakTempsC[i];
      const coolantW = durationMode === 'continuous' && anySectionCooled ? steady?.coolantLossPerNodeW[i] : undefined;
      return { label: node.label, value: `${fmt(node.areaMm2, 1)} mm², ${tempC !== undefined ? fmt(tempC, 1) : '—'} °C${coolantW !== undefined ? `, coolant ${fmt(coolantW, 1)} W` : ''}` };
    });

    return [
      { heading: 'Summary', rows: headline },
      { heading: busbarType === 'single' ? 'Per-section results' : 'Bundle result', rows: nodeRows },
    ];
  }, [durationMode, worstTempC, referenceTempC, maxCurrent, minArea, transient, totalLossW, totalEnergyJ, nodes, steady, adiabatic, busbarType, anySectionCooled, coolantTotalHeatW, coolantTempRiseK]);

  const handleExportPdf = () => {
    const pdfAccent = deriveAccentOnLight(accentHex);
    const diagrams: ReportDiagram[] = [];

    if (busbarType === 'single') {
      diagrams.push({ title: 'Busbar length profile (plan view)', svgMarkup: renderLengthProfileSvg(sections, pdfAccent) });
    } else {
      diagrams.push({
        title: 'Busbar cross-section',
        svgMarkup: renderCrossSectionSvg(
          Array.from({ length: nBars }, () => ({ width: profileWidth, thickness: profileThickness, gapAfter: barGap })),
          orientation,
          pdfAccent
        ),
      });
    }

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
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
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
              </div>
              <span className="hint">
                {busbarType === 'single'
                  ? `One conductor made of up to ${isPremium ? '10' : '2 (Premium unlocks up to 10)'} lengthwise sections of different width, sharing a common thickness — heat conducts between adjoining sections.`
                  : 'Several identical bars in parallel, sharing one profile and spacing.'}
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
                      <label>Width (mm)</label>
                      <input autoComplete="off" type="number" min={1} value={s.width} onChange={e => updateSection(s.id, { width: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                      <label>Length (mm)</label>
                      <input autoComplete="off" type="number" min={1} value={s.length} onChange={e => updateSection(s.id, { length: Number(e.target.value) })} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!s.coolingEnabled} onChange={e => updateSection(s.id, { coolingEnabled: e.target.checked })} style={{ width: 'auto' }} />
                        Apply conduction
                      </label>
                      <button className="btn small danger" onClick={() => removeSection(s.id)} disabled={sections.length === 1}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="field" style={{ marginTop: '0.6rem' }}>
                  <label>Common thickness (mm)</label>
                  <input autoComplete="off" type="number" min={0.5} value={thicknessMm} onChange={e => setThicknessMm(Number(e.target.value))} style={{ maxWidth: 160 }} />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <BusbarLengthProfile sections={sections} />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-2">
                  <div className="field">
                    <label>Bar width (mm)</label>
                    <input autoComplete="off" type="number" min={1} value={profileWidth} onChange={e => setProfileWidth(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Bar thickness (mm)</label>
                    <input autoComplete="off" type="number" min={0.5} value={profileThickness} onChange={e => setProfileThickness(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Number of bars</label>
                    <input autoComplete="off" type="number" min={1} max={20} value={nBars} onChange={e => setNBars(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Gap between bars (mm)</label>
                    <input autoComplete="off" type="number" min={0} value={barGap} onChange={e => setBarGap(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Bar length (m) <span className="hint">— for total loss</span></label>
                    <input autoComplete="off" type="number" min={0.01} value={bundleLengthM} onChange={e => setBundleLengthM(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Total cross-section area</label>
                    <input value={`${fmt(nodes[0]?.areaMm2 ?? 0, 1)} mm²`} readOnly />
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
                <label>Coating thickness (mm)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={coatingThicknessMm} onChange={e => setCoatingThicknessMm(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Coating thermal conductivity (W/m·K)</label>
                <input autoComplete="off" type="number" min={0.01} value={coatingConductivity} onChange={e => setCoatingConductivity(Number(e.target.value))} />
                <span className="hint">
                  A coating adds a conduction resistance in series with the convection/radiation film, between the
                  conductor and ambient — it traps heat (raises conductor temperature) even as it may also raise
                  emissivity. Set thickness to 0 for bare metal.
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
                <label>Ambient temperature (°C)</label>
                <input autoComplete="off" type="number" value={ambientC} onChange={e => setAmbientC(Number(e.target.value))} />
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
                  <label>Max allowable temperature (°C)</label>
                  <input autoComplete="off" type="number" value={maxContinuousTempC} onChange={e => setMaxContinuousTempC(Number(e.target.value))} />
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
                  <label>Initial (pre-fault) temperature (°C)</label>
                  <input autoComplete="off" type="number" value={faultInitialTempC} onChange={e => setFaultInitialTempC(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Max short-time temperature (°C)</label>
                  <input autoComplete="off" type="number" value={maxFaultTempC} onChange={e => setMaxFaultTempC(Number(e.target.value))} />
                  <span className="hint">Bare-conductor limit: 250°C copper / 200°C aluminium (typical).</span>
                </div>
              </div>
            )}

            {durationMode === 'profile' && (
              <div style={{ marginTop: '0.85rem' }}>
                <div className="card-title" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 400 }}>Load steps (up to 10, simulated in order from ambient)</span>
                  <button className="btn small" onClick={addStep} disabled={steps.length >= 10}>+ Add step</button>
                </div>
                {steps.map((s, i) => (
                  <div className="step-row" key={s.id}>
                    <div className="bar-index">{i + 1}</div>
                    <div className="field">
                      <label>Current (A)</label>
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
                  <label>TIM thickness (mm)</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.01} value={timThicknessMm} onChange={e => setTimThicknessMm(Number(e.target.value))} />
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
                  <label>Metallic section thickness (mm)</label>
                  <input autoComplete="off" type="number" min={0.1} value={metalThicknessMm} onChange={e => setMetalThicknessMm(Number(e.target.value))} />
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
                  <label>Coolant inlet temperature (°C)</label>
                  <input autoComplete="off" type="number" value={coolantInletTempC} onChange={e => setCoolantInletTempC(Number(e.target.value))} />
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
                  {worstTempC !== undefined ? fmt(worstTempC, 1) : '—'}<span className="unit">°C</span>
                </div>
              </div>
              <div className="result-tile">
                <div className="label">Temperature rise</div>
                <div className="value">
                  {worstTempC !== undefined ? fmt(worstTempC - referenceTempC, 1) : '—'}
                  <span className="unit">K</span>
                </div>
              </div>
              {durationMode === 'continuous' && (
                <div className="result-tile">
                  <div className="label">Max continuous current</div>
                  <div className="value">{maxCurrent !== null ? fmt(maxCurrent, 0) : '—'}<span className="unit">A</span></div>
                </div>
              )}
              {durationMode === 'fault' && (
                <div className="result-tile">
                  <div className="label">Min. area for this fault</div>
                  <div className="value">{minArea !== null ? fmt(minArea, 0) : '—'}<span className="unit">mm²</span></div>
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
              {durationMode !== 'continuous' && totalEnergyJ !== undefined && (
                <div className="result-tile">
                  <div className="label">Total busbar loss</div>
                  <div className="value">{fmt(totalEnergyJ / 1000, 2)}<span className="unit">kJ</span></div>
                </div>
              )}
            </div>

            {/* per-node table */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>{busbarType === 'single' ? 'Section' : 'Bundle'}</th>
                  <th>Area (mm²)</th>
                  {durationMode !== 'profile' && <th>Current density (A/mm²)</th>}
                  {durationMode === 'continuous' && steady && <th>Rac (µΩ)</th>}
                  <th>Loss {durationMode === 'continuous' ? '(W)' : '(kJ)'}</th>
                  {durationMode === 'continuous' && steady && anySectionCooled && <th>Coolant (W)</th>}
                  <th>{durationMode === 'profile' ? 'Peak temp (°C)' : durationMode === 'fault' ? 'Final temp (°C)' : 'Temp (°C)'}</th>
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
                      <td>{fmt(node.areaMm2, 1)}</td>
                      {durationMode !== 'profile' && <td>{fmt(current / node.areaMm2, 2)}</td>}
                      {durationMode === 'continuous' && steady && <td>{fmt(steady.racTotalPerNode[i] * 1e6, 1)}</td>}
                      <td>{lossDisplay !== undefined ? fmt(lossDisplay, durationMode === 'continuous' ? 1 : 2) : '—'}</td>
                      {durationMode === 'continuous' && steady && anySectionCooled && <td>{fmt(steady.coolantLossPerNodeW[i], 1)}</td>}
                      <td>{tempC !== undefined ? fmt(tempC, 1) : '—'}</td>
                      {durationMode === 'fault' && <td className={nodePass ? 'pass' : 'fail'}>{nodePass ? '✓' : '✗'}</td>}
                    </tr>
                  );
                })}
                {nodes.length > 1 && (
                  <tr>
                    <td><b>Total</b></td>
                    <td>{fmt(nodes.reduce((s, n) => s + n.areaMm2, 0), 1)}</td>
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

          <div className="card">
            <div className="card-title">Reference &amp; assumptions</div>
            <p className="note">
              Steady-state and load-profile heating are solved with a nodal thermal network: each section (or the
              stacked-bar bundle, as one lumped node) generates I²R heat, exchanges heat with neighbouring sections
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
              the same way ambient air is always treated as a fixed-temperature reservoir. For critical designs,
              verify against manufacturer test data and, where required, by test.
            </p>
          </div>
        </div>
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
