import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import {
  ALL_SIZES,
  ALL_PROPERTY_CLASSES,
  FRICTION_PRESETS,
  TIGHTENING_METHOD_PRESETS,
  getFastenerSize,
  getPropertyClass,
  getFrictionPreset,
  getTighteningMethod,
  getSuggestedHoleMm,
  buildBoltPartNumber,
  type HeadType,
  type HoleFit,
} from '../lib/fastenerStandards';
import {
  getWashersForSizeAndType,
  getNutsForSizeAndType,
  getThreadedInsert,
  INSERT_LENGTH_RATIOS,
  type WasherType,
  type NutType,
  type PropertyClassBand,
  type InsertVariant,
  type WasherPreset,
} from '../lib/fastenerHardware';
import { CLAMPED_MATERIAL_LIST, getClampedMaterial, type ClampedMaterialId } from '../lib/clampedMaterials';
import {
  solveBoltedJoint,
  type SolveMode,
  type ThreadEngagementMode,
  type ScatterConvention,
  type ClampedSectionInput,
  type JointInput,
} from '../lib/boltedJointPhysics';
import BoltedJointCrossSection from '../components/BoltedJointCrossSection';
import InfoTooltip from '../components/InfoTooltip';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

interface SectionFormState extends ClampedSectionInput {
  customIsPolymer?: boolean;
}

let sectionIdCounter = 0;
function nextSectionId() {
  sectionIdCounter += 1;
  return `sec-${sectionIdCounter}`;
}

interface WasherOverrideState {
  odMm: number | '';
  idMm: number | '';
  thicknessMm: number | '';
  customStiffnessNPerMm: number | '';
}
const EMPTY_WASHER_OVERRIDE: WasherOverrideState = { odMm: '', idMm: '', thicknessMm: '', customStiffnessNPerMm: '' };

function applyWasherOverride(washer: WasherPreset | null, override: WasherOverrideState): WasherPreset | null {
  if (!washer) return null;
  return {
    ...washer,
    odMm: override.odMm === '' ? washer.odMm : override.odMm,
    idMm: override.idMm === '' ? washer.idMm : override.idMm,
    thicknessMm: override.thicknessMm === '' ? washer.thicknessMm : override.thicknessMm,
    customStiffnessNPerMm: override.customStiffnessNPerMm === '' ? washer.customStiffnessNPerMm : override.customStiffnessNPerMm,
  };
}

function WasherOverrideFields({ washer, override, onChange }: { washer: WasherPreset | null; override: WasherOverrideState; onChange: (patch: Partial<WasherOverrideState>) => void }) {
  if (!washer) return null;
  const showStiffness = washer.type === 'belleville' || washer.type === 'splitRingSpring';
  return (
    <div className="grid grid-3" style={{ marginTop: '0.4rem', gap: '0.4rem' }}>
      <div className="field">
        <label style={{ fontSize: '0.7rem' }}>OD override (mm)</label>
        <input autoComplete="off" type="number" min={0.1} placeholder={String(washer.odMm)} value={override.odMm} onChange={(e) => onChange({ odMm: e.target.value === '' ? '' : Number(e.target.value) })} />
      </div>
      <div className="field">
        <label style={{ fontSize: '0.7rem' }}>ID override (mm)</label>
        <input autoComplete="off" type="number" min={0.1} placeholder={String(washer.idMm)} value={override.idMm} onChange={(e) => onChange({ idMm: e.target.value === '' ? '' : Number(e.target.value) })} />
      </div>
      <div className="field">
        <label style={{ fontSize: '0.7rem' }}>Thickness override (mm)</label>
        <input autoComplete="off" type="number" min={0.01} placeholder={String(washer.thicknessMm)} value={override.thicknessMm} onChange={(e) => onChange({ thicknessMm: e.target.value === '' ? '' : Number(e.target.value) })} />
      </div>
      {showStiffness && (
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.7rem' }}>Custom stiffness override (N/mm)</label>
          <input autoComplete="off" type="number" min={1} placeholder="from geometry estimate" value={override.customStiffnessNPerMm} onChange={(e) => onChange({ customStiffnessNPerMm: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>
      )}
    </div>
  );
}

export default function BoltedJointCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { isPremium } = useEntitlement();

  const [mode, setMode] = useState<SolveMode>('torqueToPreload');
  const [sizeId, setSizeId] = useState('M8');
  const [headType, setHeadType] = useState<HeadType>('socketHeadCap');
  const [propertyClassId, setPropertyClassId] = useState('8.8');
  const [customTensileMPa, setCustomTensileMPa] = useState(800);
  const [customProofMPa, setCustomProofMPa] = useState(640);
  const [holeFit, setHoleFit] = useState<HoleFit>('medium');

  const [sections, setSections] = useState<SectionFormState[]>([
    { id: nextSectionId(), materialId: 'al6061t6', thicknessMm: 10, holeDiameterMm: 8.5, outerDiameterMm: 30 },
    { id: nextSectionId(), materialId: 'steelGeneric', thicknessMm: 10, holeDiameterMm: 8.5, outerDiameterMm: 30 },
  ]);

  const [headWasherType, setHeadWasherType] = useState<WasherType | 'none'>('plain');
  const [headWasherSpecId, setHeadWasherSpecId] = useState('');
  const [nutWasherType, setNutWasherType] = useState<WasherType | 'none'>('plain');
  const [nutWasherSpecId, setNutWasherSpecId] = useState('');
  const [includeSpringWasherCompliance, setIncludeSpringWasherCompliance] = useState(false);

  const [threadEngagementMode, setThreadEngagementMode] = useState<ThreadEngagementMode>('nutAndBolt');
  const [nutType, setNutType] = useState<NutType>('plainHex');
  const [nutPropertyClassBand, setNutPropertyClassBand] = useState<PropertyClassBand>('5-8');
  const [engagementLengthMm, setEngagementLengthMm] = useState(12);
  const [insertVariant, setInsertVariant] = useState<InsertVariant>('freeRunning');
  const [insertLengthRatio, setInsertLengthRatio] = useState(1.5);

  const [frictionPresetId, setFrictionPresetId] = useState('dry');
  const [customThreadMu, setCustomThreadMu] = useState(0.15);
  const [useSeparateBearingFriction, setUseSeparateBearingFriction] = useState(false);
  const [bearingFrictionPresetId, setBearingFrictionPresetId] = useState('dry');
  const [customBearingMu, setCustomBearingMu] = useState(0.15);

  const [targetPreloadN, setTargetPreloadN] = useState(15000);
  const [targetTorqueNm, setTargetTorqueNm] = useState(25);
  const [snugTorqueNm, setSnugTorqueNm] = useState(5);
  const [additionalAngleDeg, setAdditionalAngleDeg] = useState(90);

  const [tighteningMethodId, setTighteningMethodId] = useState('torqueWrench');
  const [scatterConvention, setScatterConvention] = useState<ScatterConvention>('nominalToMax');
  const [externalAxialLoadN, setExternalAxialLoadN] = useState(0);
  const [safetyFactorTarget, setSafetyFactorTarget] = useState(1.5);

  const [advancedMode, setAdvancedMode] = useState(false);
  // Safety net: force advancedMode off if entitlement lapses (e.g. a subscription
  // expires) while the toggle was already on, regardless of stale local state.
  useEffect(() => {
    if (!isPremium && advancedMode) setAdvancedMode(false);
  }, [isPremium, advancedMode]);
  const [headWasherOverride, setHeadWasherOverride] = useState<WasherOverrideState>(EMPTY_WASHER_OVERRIDE);
  const [nutWasherOverride, setNutWasherOverride] = useState<WasherOverrideState>(EMPTY_WASHER_OVERRIDE);
  const [nutTorqueOverride, setNutTorqueOverride] = useState<number | ''>('');
  const [insertTorqueOverride, setInsertTorqueOverride] = useState<number | ''>('');

  const [includeThermalEffects, setIncludeThermalEffects] = useState(false);
  const [assemblyTempC, setAssemblyTempC] = useState(20);
  const [operatingTempC, setOperatingTempC] = useState(80);
  const [boltCteOverridePerC, setBoltCteOverridePerC] = useState(12.0);

  const size = useMemo(() => getFastenerSize(sizeId) ?? ALL_SIZES[0], [sizeId]);
  const propertyClass = useMemo(() => {
    if (propertyClassId === 'custom') {
      return { id: 'custom', standard: 'custom' as const, label: 'Custom', tensileStrengthMPa: customTensileMPa, proofStrengthMPa: customProofMPa, elasticModulusGPa: 200 };
    }
    return getPropertyClass(propertyClassId) ?? ALL_PROPERTY_CLASSES[0];
  }, [propertyClassId, customTensileMPa, customProofMPa]);

  const suggestedHoleMm = useMemo(() => getSuggestedHoleMm(size.id, holeFit), [size.id, holeFit]);

  const headWasherOptions = useMemo(() => (headWasherType === 'none' ? [] : getWashersForSizeAndType(size.id, headWasherType)), [size.id, headWasherType]);
  const underHeadWasher = useMemo(() => headWasherOptions.find((w) => w.id === headWasherSpecId) ?? headWasherOptions[0] ?? null, [headWasherOptions, headWasherSpecId]);

  const nutWasherOptions = useMemo(() => (nutWasherType === 'none' ? [] : getWashersForSizeAndType(size.id, nutWasherType)), [size.id, nutWasherType]);
  const underNutWasher = useMemo(() => nutWasherOptions.find((w) => w.id === nutWasherSpecId) ?? nutWasherOptions[0] ?? null, [nutWasherOptions, nutWasherSpecId]);

  const nutOptions = useMemo(() => (threadEngagementMode === 'nutAndBolt' ? getNutsForSizeAndType(size.id, nutType) : []), [size.id, nutType, threadEngagementMode]);
  const nut = useMemo(() => {
    if (nutOptions.length === 0) return null;
    if (nutType === 'allMetalPrevailingTorque') return nutOptions.find((n) => n.propertyClassBand === nutPropertyClassBand) ?? nutOptions[0];
    return nutOptions[0];
  }, [nutOptions, nutType, nutPropertyClassBand]);

  const threadedInsertPreset = useMemo(
    () => (threadEngagementMode === 'threadedInsert' ? getThreadedInsert(size.id, insertVariant, insertLengthRatio) ?? null : null),
    [size.id, insertVariant, insertLengthRatio, threadEngagementMode]
  );

  // Advanced-mode overrides merge onto the resolved presets — only applied when
  // advancedMode is on, and only for fields the user actually typed a value into.
  const effectiveHeadWasher = useMemo(() => (advancedMode ? applyWasherOverride(underHeadWasher, headWasherOverride) : underHeadWasher), [advancedMode, underHeadWasher, headWasherOverride]);
  const effectiveNutWasher = useMemo(() => (advancedMode ? applyWasherOverride(underNutWasher, nutWasherOverride) : underNutWasher), [advancedMode, underNutWasher, nutWasherOverride]);
  const effectiveNut = useMemo(() => {
    if (!nut) return null;
    if (!advancedMode || nutTorqueOverride === '') return nut;
    return { ...nut, prevailingTorqueNm: nutTorqueOverride };
  }, [nut, advancedMode, nutTorqueOverride]);
  const effectiveThreadedInsert = useMemo(() => {
    if (!threadedInsertPreset) return null;
    if (!advancedMode || insertTorqueOverride === '') return threadedInsertPreset;
    return { ...threadedInsertPreset, prevailingTorqueNm: insertTorqueOverride };
  }, [threadedInsertPreset, advancedMode, insertTorqueOverride]);

  const threadFrictionMu = useMemo(() => {
    if (frictionPresetId === 'custom') return customThreadMu;
    return getFrictionPreset(frictionPresetId)?.mu ?? 0.15;
  }, [frictionPresetId, customThreadMu]);

  const bearingFrictionMu = useMemo(() => {
    if (!useSeparateBearingFriction) return threadFrictionMu;
    if (bearingFrictionPresetId === 'custom') return customBearingMu;
    return getFrictionPreset(bearingFrictionPresetId)?.mu ?? threadFrictionMu;
  }, [useSeparateBearingFriction, bearingFrictionPresetId, customBearingMu, threadFrictionMu]);

  const gallingWarning = getFrictionPreset(frictionPresetId)?.gallingRisk || (useSeparateBearingFriction && getFrictionPreset(bearingFrictionPresetId)?.gallingRisk);

  const tighteningMethod = useMemo(() => getTighteningMethod(tighteningMethodId) ?? TIGHTENING_METHOD_PRESETS[0], [tighteningMethodId]);

  const addSection = () => setSections((prev) => (prev.length >= 8 ? prev : [...prev, { id: nextSectionId(), materialId: 'steelGeneric', thicknessMm: 5, holeDiameterMm: size.nominalDiameterMm + 0.5, outerDiameterMm: 30 }]));
  const removeSection = (id: string) => setSections((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  const updateSection = (id: string, patch: Partial<SectionFormState>) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const jointInput: JointInput = useMemo(
    () => ({
      mode,
      size,
      headType,
      propertyClass,
      clampedSections: advancedMode ? sections : sections.map((s) => ({ ...s, customE: undefined, customYield: undefined })),
      underHeadWasher: effectiveHeadWasher,
      underNutWasher: threadEngagementMode === 'nutAndBolt' ? effectiveNutWasher : null,
      includeSpringWasherCompliance,
      threadEngagementMode,
      nut: effectiveNut,
      threadedInsert: threadEngagementMode === 'threadedInsert' ? effectiveThreadedInsert : null,
      engagementLengthMm: threadEngagementMode === 'nutAndBolt' ? undefined : engagementLengthMm,
      threadFrictionMu,
      bearingFrictionMu,
      targetPreloadN: mode === 'preloadToTorque' ? targetPreloadN : undefined,
      targetTorqueNm: mode === 'torqueToPreload' ? targetTorqueNm : undefined,
      snugTorqueNm: mode === 'torqueAndAngle' ? snugTorqueNm : undefined,
      additionalAngleDeg: mode === 'torqueAndAngle' ? additionalAngleDeg : undefined,
      tighteningMethodAlphaAMax: tighteningMethod.alphaAMax,
      scatterConvention,
      externalAxialLoadN,
      safetyFactorTarget,
      thermal: advancedMode && includeThermalEffects ? { assemblyTempC, operatingTempC, boltThermalExpansionPerC: boltCteOverridePerC * 1e-6 } : null,
    }),
    [
      mode, size, headType, propertyClass, sections, advancedMode, effectiveHeadWasher, effectiveNutWasher, includeSpringWasherCompliance,
      threadEngagementMode, effectiveNut, effectiveThreadedInsert, engagementLengthMm, threadFrictionMu, bearingFrictionMu,
      targetPreloadN, targetTorqueNm, snugTorqueNm, additionalAngleDeg, tighteningMethod, scatterConvention, externalAxialLoadN, safetyFactorTarget,
      includeThermalEffects, assemblyTempC, operatingTempC, boltCteOverridePerC,
    ]
  );

  const result = useMemo(() => solveBoltedJoint(jointInput), [jointInput]);

  interface FailureItem {
    issue: string;
    guidance: string;
    severity: 'fail' | 'warn';
  }
  const failureGuidance: FailureItem[] = [];
  if (!result.geometryValidity.holeClearanceOk) {
    failureGuidance.push({
      issue: `Clearance hole too small (radial clearance ${fmt(result.geometryValidity.holeClearanceRadialMm, 2)} mm, needs ≥ 0.1 mm).`,
      guidance: 'Increase the affected section\'s Hole Ø — use the "Use suggested" button in the Clamped stack-up card, or pick a looser fit (Free) in the Fastener card.',
      severity: 'fail',
    });
  }
  if (!result.boltStressPass) {
    failureGuidance.push({
      issue: `Bolt stress safety factor ${fmt(result.boltStressSafetyFactor, 2)} is below the target ${fmt(safetyFactorTarget, 2)} (σ = ${fmt(result.boltTensileStressMPa, 1)} MPa vs. proof ${fmt(propertyClass.proofStrengthMPa, 0)} MPa).`,
      guidance: 'Use a larger bolt diameter or a higher property class, reduce the target preload/torque/rotation or the external axial load, or lower the safety factor target if appropriate for this application.',
      severity: 'fail',
    });
  }
  if (!result.memberBearingPass[0]) {
    failureGuidance.push({
      issue: `Head-side bearing safety factor ${fmt(result.memberBearingSafetyFactor[0], 2)} is below target (σ = ${fmt(result.memberBearingStressMPa[0], 1)} MPa).`,
      guidance: 'Add a wider washer under the head (or switch to Advanced mode and increase its OD), choose a stronger material for the first clamped section, or use a larger bolt/head size.',
      severity: 'fail',
    });
  }
  const lastBearingIdx = result.memberBearingPass.length - 1;
  if (threadEngagementMode === 'nutAndBolt' && !result.memberBearingPass[lastBearingIdx]) {
    failureGuidance.push({
      issue: `Nut-side bearing safety factor ${fmt(result.memberBearingSafetyFactor[lastBearingIdx], 2)} is below target (σ = ${fmt(result.memberBearingStressMPa[lastBearingIdx], 1)} MPa).`,
      guidance: 'Add a wider washer under the nut, choose a stronger material for the last clamped section, or use a larger nut/bolt size.',
      severity: 'fail',
    });
  }
  if (!result.geometryValidity.engagementLengthOk) {
    failureGuidance.push({
      issue: `Thread engagement too short (${fmt(engagementLengthMm, 1)} mm provided, needs ≥ ${fmt(result.geometryValidity.minEngagementLengthMm, 1)} mm).`,
      guidance: 'Increase the engagement length, use a stronger tapped material for the last section, or switch to a threaded insert (which can raise the effective thread strength).',
      severity: 'fail',
    });
  }
  if (!result.geometryValidity.gripLengthExceedsFastenerOk) {
    failureGuidance.push({
      issue: 'Engagement length exceeds the tapped member\'s own thickness.',
      guidance: 'Reduce the engagement length to fit within that section\'s thickness, or increase the section\'s thickness.',
      severity: 'fail',
    });
  }
  if (result.jointSeparates) {
    failureGuidance.push({
      issue: `Joint separates under the applied external load (member force margin ${fmt(result.jointSeparationMarginN, 0)} N).`,
      guidance: 'Increase the target preload/torque/rotation, reduce the external axial load, or increase the joint\'s stiffness ratio (e.g. a stiffer or shorter grip) so more of the load stays carried by clamping force.',
      severity: 'fail',
    });
  }
  if (result.geometryValidity.frustumBaseExceedsMemberOdWarning) {
    failureGuidance.push({
      issue: 'The compression cone grows wider than a clamped member\'s outer diameter at some point.',
      guidance: 'Not a hard failure — treat the stiffness result as approximate, or increase the clamped sections\' outer diameter for a tighter estimate.',
      severity: 'warn',
    });
  }
  if (result.thermalResult && !result.thermalResult.overallPass) {
    const t = result.thermalResult;
    const reasons: string[] = [];
    if (!t.boltStressPass) reasons.push(`bolt SF ${fmt(t.boltStressSafetyFactor, 2)}`);
    if (!t.memberBearingPass.every(Boolean)) reasons.push('a bearing face SF');
    if (t.jointSeparates) reasons.push('joint separation');
    failureGuidance.push({
      issue: `Fails at operating temperature (${fmt(operatingTempC, 0)}°C) though it passes at assembly temperature: ${reasons.join(', ')}.`,
      guidance:
        t.deltaForceN > 0
          ? 'Heating increases clamping force here (members expand more than the bolt) — reduce assembly preload/torque, use a bolt material with a CTE closer to the clamped members, or re-check the bolt/bearing stress margin at the hot condition.'
          : 'Cooling reduces clamping force here (the bolt contracts more than the members, or vice versa) — increase assembly preload/torque to keep enough clamping force at the cold condition, or choose materials with closer CTEs.',
      severity: 'fail',
    });
  }
  const failingChecks = failureGuidance.filter((f) => f.severity === 'fail');

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      {
        title: 'Bolt (fastener) stiffness',
        formula: 'k = A·E/L per segment (unthreaded shank + threaded engagement), combined in series',
        substitution: result.boltSegments.map((s) => `${s.label}: A=${fmt(s.areaMm2, 1)} mm², L=${fmt(s.lengthMm, 2)} mm, k=${fmt(s.stiffnessNPerMm, 0)} N/mm`).join('; '),
        result: `k_bolt = ${fmt(result.kBoltNPerMm, 0)} N/mm`,
      },
      {
        title: 'Clamped-member stiffness (frustum / cone-of-compression method)',
        formula: 'k = (0.5774·π·E·d) / ln{[(1.155t+D−d)(D+d)] / [(1.155t+D+d)(D−d)]}, per segment, combined in series',
        substitution: [
          result.frustumSegments.map((s) => `${s.fromBearingFace}: t=${fmt(s.thicknessMm, 2)}, D=${fmt(s.baseDiameterMm, 2)}, k=${fmt(s.stiffnessNPerMm, 0)} N/mm`).join('; '),
          result.springWasherStiffnessNPerMm.head ? `head washer k=${fmt(result.springWasherStiffnessNPerMm.head, 0)} N/mm (in series)` : '',
          result.springWasherStiffnessNPerMm.nut ? `nut washer k=${fmt(result.springWasherStiffnessNPerMm.nut, 0)} N/mm (in series)` : '',
        ].filter(Boolean).join('; '),
        result: `k_members = ${fmt(result.kMembersNPerMm, 0)} N/mm, joint stiffness parameter C = ${fmt(result.jointStiffnessC, 3)}`,
      },
    ];

    if (mode === 'torqueAndAngle') {
      steps.push({
        title: 'Turn-of-nut (torque + angle) preload',
        formula: 'F = F_snug + Δl·k_combined, Δl = (angle/360)·pitch, 1/k_combined = 1/k_bolt + 1/k_members',
        substitution: `Snug torque = ${fmt(snugTorqueNm, 2)} N·m, additional rotation = ${fmt(additionalAngleDeg, 0)}°, pitch = ${fmt(size.pitchMm, 3)} mm, k_combined = ${fmt(result.combinedStiffnessNPerMm, 0)} N/mm`,
        result: `Angle-induced force = ${fmt(result.angleInducedForceN, 0)} N → total preload F = ${fmt(result.preloadN, 0)} N (equivalent final torque ${fmt(result.torqueNm, 2)} N·m)`,
      });
    } else {
      steps.push({
        title: mode === 'preloadToTorque' ? 'Torque required for target preload (Shigley closed form)' : 'Preload achieved for target torque (Shigley closed form, inverted)',
        formula: 'T = F·dm/2·[(l+π·f·dm·sec30°)/(π·dm−f·l·sec30°)] + F·fc·dc/2',
        substitution: `dm=${fmt(size.pitchDiameterMm, 3)} mm, l=${fmt(size.pitchMm, 3)} mm, f=${fmt(threadFrictionMu, 3)}, fc=${fmt(bearingFrictionMu, 3)}`,
        result: `F = ${fmt(result.preloadN, 0)} N, T = ${fmt(result.torqueNm, 2)} N·m (thread term ${fmt(result.torqueBreakdown.threadTermNm, 2)} + bearing term ${fmt(result.torqueBreakdown.bearingTermNm, 2)}), K-factor ≈ ${fmt(result.simplifiedKFactor, 3)}`,
      });
    }

    steps.push(
      {
        title: `Preload scatter band (${tighteningMethod.label}, αA ≈ ${fmt(tighteningMethod.alphaAMin, 2)}–${fmt(tighteningMethod.alphaAMax, 2)})`,
        formula: scatterConvention === 'nominalToMax' ? 'min = F (nominal target), max = F·αA' : 'min = F/√αA, max = F·√αA',
        result: `${fmt(result.preloadScatterBand.minN, 0)}–${fmt(result.preloadScatterBand.maxN, 0)} N (${fmt(result.preloadPercentOfProof, 0)}% of proof load at nominal)`,
      },
      {
        title: 'Load sharing under external axial load',
        formula: 'F_bolt = F_preload + C·P, F_member = F_preload − (1−C)·P',
        substitution: `P = ${fmt(externalAxialLoadN, 0)} N, C = ${fmt(result.jointStiffnessC, 3)}`,
        result: `F_bolt = ${fmt(result.boltForceUnderLoadN, 0)} N, F_member = ${fmt(result.memberForceUnderLoadN, 0)} N${result.jointSeparates ? ' — JOINT SEPARATES' : ''}`,
      },
      {
        title: 'Fastener tensile stress vs. proof strength',
        formula: 'σ = F_bolt / As, SF = proof / σ',
        result: `σ = ${fmt(result.boltTensileStressMPa, 1)} MPa, SF = ${fmt(result.boltStressSafetyFactor, 2)} (target ${safetyFactorTarget}) — ${result.boltStressPass ? 'pass' : 'fail'}`,
      },
      {
        title: 'Yield-onset ("breakoff") torque',
        formula: 'F_yield = proof × As, then T_yield via the same torque-preload formula' + (mode === 'torqueAndAngle' ? '; angle_yield = (F_yield − F_snug) / k_combined / pitch × 360' : ''),
        result:
          mode === 'torqueAndAngle' && result.yieldOnsetAngleDegFromSnug !== null
            ? `T_yield = ${fmt(result.yieldOnsetTorqueNm, 2)} N·m, ≈ ${fmt(result.yieldOnsetAngleDegFromSnug, 0)}° additional rotation from the snug torque before yield`
            : `T_yield = ${fmt(result.yieldOnsetTorqueNm, 2)} N·m — a safe ceiling regardless of tightening method`,
      }
    );

    sections.forEach((s, i) => {
      if (i !== 0 && i !== sections.length - 1) return;
      steps.push({
        title: `Bearing stress — ${i === 0 ? 'head side' : 'nut/tapped side'} (${s.materialId})`,
        formula: 'σ = F_bolt / [π/4·(D_bearing² − d_hole²)], SF = yield / σ',
        result: `σ = ${fmt(result.memberBearingStressMPa[i], 1)} MPa, SF = ${fmt(result.memberBearingSafetyFactor[i], 2)} — ${result.memberBearingPass[i] ? 'pass' : 'fail'}`,
      });
    });
    if (result.threadShearCheck) {
      steps.push({
        title: 'Minimum thread engagement length',
        formula: 'L_min = max(d, d·(bolt proof strength / tapped-material yield strength))',
        result: `Required ≥ ${fmt(result.threadShearCheck.requiredEngagementMm, 1)} mm, provided ${fmt(result.threadShearCheck.providedEngagementMm, 1)} mm — ${result.threadShearCheck.pass ? 'pass' : 'fail'}`,
      });
    }
    if (result.thermalResult) {
      const t = result.thermalResult;
      steps.push({
        title: `Thermal effects: assembly ${fmt(assemblyTempC, 0)}°C → operating ${fmt(operatingTempC, 0)}°C`,
        formula: 'ΔF = k_combined · [ΔT·Σ(α_member,i·t_i) − ΔT·α_bolt·L_grip]',
        substitution: `ΔT=${fmt(operatingTempC - assemblyTempC, 0)}°C, α_bolt=${fmt(boltCteOverridePerC, 2)}×10⁻⁶/°C, k_combined=${fmt(result.combinedStiffnessNPerMm, 0)} N/mm`,
        result: `ΔF = ${fmt(t.deltaForceN, 0)} N → preload at operating temp = ${fmt(t.preloadN, 0)} N; bolt SF = ${fmt(t.boltStressSafetyFactor, 2)} — ${t.overallPass ? 'pass' : 'fail'}`,
      });
    }
    return steps;
  }, [result, mode, size, threadFrictionMu, bearingFrictionMu, snugTorqueNm, additionalAngleDeg, tighteningMethod, scatterConvention, externalAxialLoadN, sections, safetyFactorTarget, assemblyTempC, operatingTempC, boltCteOverridePerC]);

  const bomRows: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [{ label: 'Bolt', value: buildBoltPartNumber(size, headType, propertyClass.label) }];
    if (underHeadWasher) rows.push({ label: 'Head-side washer', value: underHeadWasher.partNumber });
    if (threadEngagementMode === 'nutAndBolt') {
      if (underNutWasher) rows.push({ label: 'Nut-side washer', value: underNutWasher.partNumber });
      if (nut) rows.push({ label: 'Nut', value: nut.partNumber });
    } else if (threadEngagementMode === 'threadedInsert' && threadedInsertPreset) {
      rows.push({ label: 'Threaded insert', value: threadedInsertPreset.partNumber });
    }
    return rows;
  }, [size, headType, propertyClass, underHeadWasher, underNutWasher, nut, threadEngagementMode, threadedInsertPreset]);

  const inputSections: ReportSection[] = useMemo(() => {
    const fastenerRows: ReportRow[] = [
      { label: 'Fastener size', value: `${size.label} (${headType === 'hexHead' ? 'Hex head' : 'Socket head cap screw'})` },
      { label: 'Property class', value: propertyClass.label },
      { label: 'Pitch diameter', value: `${fmt(size.pitchDiameterMm, 3)} mm` },
      { label: 'Thread engagement', value: threadEngagementMode === 'nutAndBolt' ? `Nut & bolt (${nut?.specStandard ?? ''})` : threadEngagementMode === 'tappedBlindOrThrough' ? 'Tapped directly into material' : `Threaded insert (${threadedInsertPreset?.partNumber ?? ''})` },
      { label: 'Thread friction μ', value: fmt(threadFrictionMu, 3) },
      { label: 'Bearing friction μ', value: fmt(bearingFrictionMu, 3) },
      { label: 'Tightening method', value: tighteningMethod.label },
      { label: 'Safety factor target', value: fmt(safetyFactorTarget, 2) },
      { label: 'External axial load', value: `${fmt(externalAxialLoadN, 0)} N` },
    ];
    const stackRows: ReportRow[] = sections.map((s, i) => ({
      label: `Section ${i + 1} (${getClampedMaterial(s.materialId).name})`,
      value: `t=${s.thicknessMm} mm, hole=${s.holeDiameterMm} mm, OD=${s.outerDiameterMm} mm`,
    }));
    return [
      { heading: 'Fastener & joint setup', rows: fastenerRows },
      { heading: 'Clamped stack-up', rows: stackRows },
      { heading: 'Selected components (representative part designations)', rows: bomRows },
    ];
  }, [size, headType, propertyClass, threadEngagementMode, nut, threadedInsertPreset, threadFrictionMu, bearingFrictionMu, tighteningMethod, safetyFactorTarget, externalAxialLoadN, sections, bomRows]);

  const outputSections: ReportSection[] = useMemo(
    () => [
      {
        heading: 'Preload & torque',
        rows: [
          { label: 'Preload', value: `${fmt(result.preloadN, 0)} N` },
          { label: 'Torque', value: `${fmt(result.torqueNm, 2)} N·m` },
          { label: 'Scatter band', value: `${fmt(result.preloadScatterBand.minN, 0)}–${fmt(result.preloadScatterBand.maxN, 0)} N` },
          { label: '% of proof load', value: `${fmt(result.preloadPercentOfProof, 0)}%` },
        ],
      },
      {
        heading: 'Stress & margins',
        rows: [
          { label: 'Bolt stress safety factor', value: fmt(result.boltStressSafetyFactor, 2) },
          { label: 'Joint separation margin', value: `${fmt(result.jointSeparationMarginN, 0)} N` },
        ],
      },
      ...(result.thermalResult
        ? [
            {
              heading: `Thermal effects (assembly ${fmt(assemblyTempC, 0)}°C → operating ${fmt(operatingTempC, 0)}°C)`,
              rows: [
                { label: 'Preload change (ΔF)', value: `${result.thermalResult.deltaForceN >= 0 ? '+' : ''}${fmt(result.thermalResult.deltaForceN, 0)} N` },
                { label: 'Preload at operating temp', value: `${fmt(result.thermalResult.preloadN, 0)} N` },
                { label: 'Bolt SF at operating temp', value: fmt(result.thermalResult.boltStressSafetyFactor, 2) },
                { label: 'Passes at operating temp', value: result.thermalResult.overallPass ? 'Yes' : 'No' },
              ],
            },
          ]
        : []),
    ],
    [result, assemblyTempC, operatingTempC]
  );

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Bolted_Joint_Calculator',
      pageTitle: 'Bolted Joint Calculator',
      accentHex,
      passStatus: { pass: result.overallPass, label: result.overallPass ? 'Joint design meets all checks' : 'Joint design fails one or more checks — see warnings' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Engineering estimation tool. Method: Shigley\'s closed-form realization of the VDI 2230 cone-of-compression (frustum) method and torque-preload relationship, ISO 898-1 / SAE J429 property classes. Simplified two-cone (or single-cone for tapped joints) stiffness model; bearing stress checked at outer faces only. Selected-component part designations are standard nomenclature for cross-referencing against a supplier catalog, not a live vendor SKU. Verify against the current official standards and, where required, physical testing before certification use.',
      ...branding,
    });
  };

  const materialOf = (id: ClampedMaterialId) => getClampedMaterial(id);

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Bolted Joint Calculator</div>
          <h1>Bolted Joint Calculator</h1>
          <p>
            Build a fastener stack-up — metric or imperial, hex or socket head, washers, nuts or tapped/insert
            engagement — and solve preload ↔ torque via the VDI 2230 cone-of-compression method (Shigley closed
            form), with fastener and clamped-member yield checks and geometry validation. Hover the <b>?</b> icons
            for a plain-language explanation of each input and result.
          </p>
        </div>
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <PremiumGate feature="Advanced: override component data">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
            <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} style={{ width: 'auto' }} />
            Advanced: override component data
            <InfoTooltip>Every washer, nut/insert, and clamped material below is normally driven by this tool's presets and tables. Turn this on to type in your own values instead — e.g. a manufacturer's datasheet dimensions, a measured Belleville spring rate, or a certified material property — without losing the preset as your starting point.</InfoTooltip>
          </label>
        </PremiumGate>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">1</span>Fastener
                <InfoTooltip>Choose the bolt size, head style, and strength grade. Together these set how much load the bolt itself can safely carry, and how big the bearing surface under the head is.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Size</label>
                <select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                  <optgroup label="Metric (ISO coarse)">
                    {ALL_SIZES.filter((s) => s.standard === 'metric').map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Imperial (UNC)">
                    {ALL_SIZES.filter((s) => s.standard === 'imperial').map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                </select>
                <span className="hint">Pitch diameter dm = {fmt(size.pitchDiameterMm, 3)} mm (used in the torque-preload formula).</span>
              </div>
              <div className="field">
                <label>Head type</label>
                <div className="segmented">
                  <button className={headType === 'hexHead' ? 'active' : ''} onClick={() => setHeadType('hexHead')}>Hex head</button>
                  <button className={headType === 'socketHeadCap' ? 'active' : ''} onClick={() => setHeadType('socketHeadCap')}>Socket head cap</button>
                </div>
                <span className="hint">Bearing-face diameter (across-flats for hex, head OD for SHCS) feeds both the frustum base and bearing-stress area.</span>
              </div>
              <div className="field">
                <label>
                  Property class
                  <InfoTooltip>A steel bolt's strength grade, e.g. 8.8: the first number ×100 = tensile strength (MPa), and first×second÷10 = proof strength (MPa) — the safe elastic limit used in every stress check below. Higher numbers mean a stronger but often more brittle bolt.</InfoTooltip>
                </label>
                <select value={propertyClassId} onChange={(e) => setPropertyClassId(e.target.value)}>
                  {ALL_PROPERTY_CLASSES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <span className="hint">ISO 898-1 via designation formula (tensile=1st digit×100, proof=tensile×2nd digit/10); SAE J429 typical published values.</span>
              </div>
              {propertyClassId === 'custom' && (
                <div className="grid grid-2" style={{ gridColumn: '1 / -1' }}>
                  <div className="field">
                    <label>Custom tensile strength (MPa)</label>
                    <input autoComplete="off" type="number" min={1} value={customTensileMPa} onChange={(e) => setCustomTensileMPa(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Custom proof strength (MPa)</label>
                    <input autoComplete="off" type="number" min={1} value={customProofMPa} onChange={(e) => setCustomProofMPa(Number(e.target.value))} />
                  </div>
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Suggested clearance hole (ISO 273)
                  <InfoTooltip>How much bigger than the bolt a clearance hole should be so the bolt actually fits through without binding. "Close" is the tightest fit (best alignment, least slop); "Free" is the loosest (easiest assembly, more allowed misalignment).</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={holeFit === 'close' ? 'active' : ''} onClick={() => setHoleFit('close')}>Close</button>
                  <button className={holeFit === 'medium' ? 'active' : ''} onClick={() => setHoleFit('medium')}>Medium</button>
                  <button className={holeFit === 'free' ? 'active' : ''} onClick={() => setHoleFit('free')}>Free</button>
                </div>
                <span className="hint">Suggested hole Ø for {size.label}: {fmt(suggestedHoleMm, 2)} mm. Use the "Use suggested" button on each clamped section below to apply it.</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Clamped stack-up
                <InfoTooltip>The parts being squeezed together by the bolt. Their thickness and stiffness determine how much of the bolt's stretch turns into clamping force, and their bearing strength sets how much force the surface under the head/nut can take before it dents or crushes.</InfoTooltip>
              </span>
              <button className="btn small" onClick={addSection} disabled={sections.length >= 8}>+ Add section</button>
            </div>
            {sections.map((s, i) => (
              <div key={s.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)', padding: '0.75rem', marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span className="bar-index" style={{ fontWeight: 700 }}>Section {i + 1}{i === 0 ? ' (head side)' : i === sections.length - 1 ? ' (nut/tapped side)' : ''}</span>
                  <button className="btn small danger" onClick={() => removeSection(s.id)} disabled={sections.length === 1}>Remove</button>
                </div>
                <div className="grid grid-3">
                  <div className="field">
                    <label>Material</label>
                    <select value={s.materialId} onChange={(e) => updateSection(s.id, { materialId: e.target.value as ClampedMaterialId })}>
                      {CLAMPED_MATERIAL_LIST.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Thickness (mm)</label>
                    <input autoComplete="off" type="number" min={0.1} value={s.thicknessMm} onChange={(e) => updateSection(s.id, { thicknessMm: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label>Hole Ø (mm)</label>
                    <input autoComplete="off" type="number" min={0.1} value={s.holeDiameterMm} onChange={(e) => updateSection(s.id, { holeDiameterMm: Number(e.target.value) })} />
                    <button className="btn small" style={{ marginTop: '0.3rem' }} onClick={() => updateSection(s.id, { holeDiameterMm: suggestedHoleMm })}>
                      Use suggested ({fmt(suggestedHoleMm, 2)})
                    </button>
                  </div>
                  <div className="field">
                    <label>Outer Ø (mm)</label>
                    <input autoComplete="off" type="number" min={0.1} value={s.outerDiameterMm} onChange={(e) => updateSection(s.id, { outerDiameterMm: Number(e.target.value) })} />
                  </div>
                  {(advancedMode || s.materialId === 'custom') && (
                    <>
                      <div className="field">
                        <label>E (GPa){advancedMode && s.materialId !== 'custom' ? ' — override' : ''}</label>
                        <input autoComplete="off" type="number" min={0.1} value={s.customE ?? materialOf(s.materialId).elasticModulusGPa} onChange={(e) => updateSection(s.id, { customE: Number(e.target.value) })} />
                      </div>
                      <div className="field">
                        <label>Yield (MPa){advancedMode && s.materialId !== 'custom' ? ' — override' : ''}</label>
                        <input autoComplete="off" type="number" min={1} value={s.customYield ?? materialOf(s.materialId).yieldStrengthMPa} onChange={(e) => updateSection(s.id, { customYield: Number(e.target.value) })} />
                      </div>
                      {s.materialId === 'custom' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 400, alignSelf: 'center' }}>
                          <input type="checkbox" checked={!!s.customIsPolymer} onChange={(e) => updateSection(s.id, { customIsPolymer: e.target.checked })} style={{ width: 'auto' }} />
                          Treat as polymer
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {materialOf(sections[0]?.materialId ?? 'steelGeneric').isPolymer || materialOf(sections[sections.length - 1]?.materialId ?? 'steelGeneric').isPolymer ? (
              <p className="note" style={{ marginTop: '0.5rem' }}>
                A polymer clamped member is present at a bearing face — simple elastic bearing-stress theory understates real creep/cold-flow behaviour in polymers under sustained load. Treat that check as a screening value, not a certification value.
              </p>
            ) : null}
            <span className="hint">Bearing/yield stress is checked at the two outer faces (section 1 and the last section) only — interior plate-to-plate interfaces have much larger nominal contact area and rarely govern.</span>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">3</span>Hardware &amp; thread engagement
                <InfoTooltip>How the bolt actually threads into the joint — through a nut, tapped directly into the material, or via a threaded insert — plus any washers, which change the bearing area and (for spring types) can add clamping compliance.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Under-head washer</label>
                <div className="segmented">
                  <button className={headWasherType === 'none' ? 'active' : ''} onClick={() => setHeadWasherType('none')}>None</button>
                  <button className={headWasherType === 'plain' ? 'active' : ''} onClick={() => setHeadWasherType('plain')}>Plain</button>
                  <button className={headWasherType === 'belleville' ? 'active' : ''} onClick={() => setHeadWasherType('belleville')}>Belleville</button>
                  <button className={headWasherType === 'splitRingSpring' ? 'active' : ''} onClick={() => setHeadWasherType('splitRingSpring')}>Spring</button>
                </div>
                {headWasherOptions.length > 0 && (
                  <select style={{ marginTop: '0.4rem' }} value={underHeadWasher?.id ?? ''} onChange={(e) => setHeadWasherSpecId(e.target.value)}>
                    {headWasherOptions.map((w) => (
                      <option key={w.id} value={w.id}>{w.specStandard}{!w.sourced ? ' (estimated)' : ''}</option>
                    ))}
                  </select>
                )}
                {advancedMode && <WasherOverrideFields washer={underHeadWasher} override={headWasherOverride} onChange={(patch) => setHeadWasherOverride((prev) => ({ ...prev, ...patch }))} />}
              </div>
              <div className="field">
                <label>Thread engagement</label>
                <div className="segmented">
                  <button className={threadEngagementMode === 'nutAndBolt' ? 'active' : ''} onClick={() => setThreadEngagementMode('nutAndBolt')}>Nut &amp; bolt</button>
                  <button className={threadEngagementMode === 'tappedBlindOrThrough' ? 'active' : ''} onClick={() => setThreadEngagementMode('tappedBlindOrThrough')}>Tapped</button>
                  <button className={threadEngagementMode === 'threadedInsert' ? 'active' : ''} onClick={() => setThreadEngagementMode('threadedInsert')}>Threaded insert</button>
                </div>
              </div>

              {threadEngagementMode === 'nutAndBolt' && (
                <>
                  <div className="field">
                    <label>Nut type</label>
                    <div className="segmented">
                      <button className={nutType === 'plainHex' ? 'active' : ''} onClick={() => setNutType('plainHex')}>Plain hex</button>
                      <button className={nutType === 'nylonInsertLocknut' ? 'active' : ''} onClick={() => setNutType('nylonInsertLocknut')}>Nylon insert</button>
                      <button className={nutType === 'allMetalPrevailingTorque' ? 'active' : ''} onClick={() => setNutType('allMetalPrevailingTorque')}>All-metal prevailing torque</button>
                    </div>
                    {nutType === 'allMetalPrevailingTorque' && (
                      <div className="segmented" style={{ marginTop: '0.4rem' }}>
                        <button className={nutPropertyClassBand === '5-8' ? 'active' : ''} onClick={() => setNutPropertyClassBand('5-8')}>Class 5-8</button>
                        <button className={nutPropertyClassBand === '10-12' ? 'active' : ''} onClick={() => setNutPropertyClassBand('10-12')}>Class 10-12</button>
                      </div>
                    )}
                    <span className="hint">
                      "All-metal prevailing torque" covers the K-nut / Aerotight / Aeronut / Philidas / Stover family (ISO 7042, DIN 980-V)
                      {nut?.prevailingTorqueNm ? ` — prevailing torque ≈ ${fmt(nut.prevailingTorqueNm, 2)} N·m for this size/class.` : '.'}
                    </span>
                    {advancedMode && (nutType === 'nylonInsertLocknut' || nutType === 'allMetalPrevailingTorque') && (
                      <div className="field" style={{ marginTop: '0.4rem' }}>
                        <label style={{ fontSize: '0.7rem' }}>Prevailing torque override (N·m)</label>
                        <input autoComplete="off" type="number" min={0} placeholder={nut?.prevailingTorqueNm ? String(nut.prevailingTorqueNm) : ''} value={nutTorqueOverride} onChange={(e) => setNutTorqueOverride(e.target.value === '' ? '' : Number(e.target.value))} />
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label>Under-nut washer</label>
                    <div className="segmented">
                      <button className={nutWasherType === 'none' ? 'active' : ''} onClick={() => setNutWasherType('none')}>None</button>
                      <button className={nutWasherType === 'plain' ? 'active' : ''} onClick={() => setNutWasherType('plain')}>Plain</button>
                      <button className={nutWasherType === 'belleville' ? 'active' : ''} onClick={() => setNutWasherType('belleville')}>Belleville</button>
                      <button className={nutWasherType === 'splitRingSpring' ? 'active' : ''} onClick={() => setNutWasherType('splitRingSpring')}>Spring</button>
                    </div>
                    {nutWasherOptions.length > 0 && (
                      <select style={{ marginTop: '0.4rem' }} value={underNutWasher?.id ?? ''} onChange={(e) => setNutWasherSpecId(e.target.value)}>
                        {nutWasherOptions.map((w) => (
                          <option key={w.id} value={w.id}>{w.specStandard}{!w.sourced ? ' (estimated)' : ''}</option>
                        ))}
                      </select>
                    )}
                    {advancedMode && <WasherOverrideFields washer={underNutWasher} override={nutWasherOverride} onChange={(patch) => setNutWasherOverride((prev) => ({ ...prev, ...patch }))} />}
                  </div>
                </>
              )}

              {threadEngagementMode === 'threadedInsert' && (
                <div className="field">
                  <label>Insert type &amp; length</label>
                  <div className="segmented">
                    <button className={insertVariant === 'freeRunning' ? 'active' : ''} onClick={() => setInsertVariant('freeRunning')}>Free-running</button>
                    <button className={insertVariant === 'screwLock' ? 'active' : ''} onClick={() => setInsertVariant('screwLock')}>Screw-lock</button>
                  </div>
                  <select style={{ marginTop: '0.4rem' }} value={insertLengthRatio} onChange={(e) => setInsertLengthRatio(Number(e.target.value))}>
                    {INSERT_LENGTH_RATIOS.map((r) => (
                      <option key={r} value={r}>{r}D</option>
                    ))}
                  </select>
                  <span className="hint">
                    Wire thread insert (HeliCoil/Recoil/Kato-style); screw-lock coils are conventionally dyed red per NAS1130/NASM21209
                    {threadedInsertPreset?.prevailingTorqueNm ? ` — prevailing torque ≈ ${fmt(threadedInsertPreset.prevailingTorqueNm, 2)} N·m (representative, borrowed from the all-metal locknut table).` : '.'}
                  </span>
                  {advancedMode && insertVariant === 'screwLock' && (
                    <div className="field" style={{ marginTop: '0.4rem' }}>
                      <label style={{ fontSize: '0.7rem' }}>Prevailing torque override (N·m)</label>
                      <input autoComplete="off" type="number" min={0} placeholder={threadedInsertPreset?.prevailingTorqueNm ? String(threadedInsertPreset.prevailingTorqueNm) : ''} value={insertTorqueOverride} onChange={(e) => setInsertTorqueOverride(e.target.value === '' ? '' : Number(e.target.value))} />
                    </div>
                  )}
                </div>
              )}

              {threadEngagementMode !== 'nutAndBolt' && (
                <div className="field">
                  <label>Engagement length (mm)</label>
                  <input autoComplete="off" type="number" min={0.1} value={engagementLengthMm} onChange={(e) => setEngagementLengthMm(Number(e.target.value))} />
                  <span className="hint">Depth of thread engagement into the last clamped section ({threadEngagementMode === 'threadedInsert' ? 'via wire thread insert' : 'tapped directly into the material'}).</span>
                </div>
              )}

              {(headWasherType !== 'plain' && headWasherType !== 'none') || (nutWasherType !== 'plain' && nutWasherType !== 'none' && threadEngagementMode === 'nutAndBolt') ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 400 }}>
                  <input type="checkbox" checked={includeSpringWasherCompliance} onChange={(e) => setIncludeSpringWasherCompliance(e.target.checked)} style={{ width: 'auto' }} />
                  Include spring/Belleville washer axial compliance in the stiffness calculation (simplified linear estimate — normally these washers are sized to flatten at the working preload, so their compliance contribution near the design point is small)
                </label>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">4</span>Friction &amp; tightening method
                <InfoTooltip>Friction between the threads/bearing face turns most of your tightening effort into heat and rubbing, not clamping force — so it strongly affects how much preload a given torque actually produces, and how consistent that preload is from one assembly to the next.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>
                  Thread friction
                  <InfoTooltip>Lower friction (lubricated) means more of your applied torque converts into clamping force for the same torque — but that also means the same torque produces MORE preload, so a torque spec written for a dry joint can overtighten a lubricated one.</InfoTooltip>
                </label>
                <select value={frictionPresetId} onChange={(e) => setFrictionPresetId(e.target.value)}>
                  {FRICTION_PRESETS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}{f.id !== 'custom' ? ` (μ≈${f.mu})` : ''}</option>
                  ))}
                </select>
                {frictionPresetId === 'custom' && (
                  <input autoComplete="off" type="number" min={0.01} step={0.01} value={customThreadMu} onChange={(e) => setCustomThreadMu(Number(e.target.value))} style={{ marginTop: '0.4rem' }} />
                )}
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 400, marginBottom: '0.3rem' }}>
                  <input type="checkbox" checked={useSeparateBearingFriction} onChange={(e) => setUseSeparateBearingFriction(e.target.checked)} style={{ width: 'auto' }} />
                  Advanced: separate bearing-face friction
                </label>
                {useSeparateBearingFriction && (
                  <>
                    <select value={bearingFrictionPresetId} onChange={(e) => setBearingFrictionPresetId(e.target.value)}>
                      {FRICTION_PRESETS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    {bearingFrictionPresetId === 'custom' && (
                      <input autoComplete="off" type="number" min={0.01} step={0.01} value={customBearingMu} onChange={(e) => setCustomBearingMu(Number(e.target.value))} style={{ marginTop: '0.4rem' }} />
                    )}
                  </>
                )}
              </div>
              {gallingWarning && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="hint" style={{ color: 'var(--warn)' }}>⚠ Dry stainless-on-stainless carries a real risk of thread galling — consider a lubricant/anti-seize even for prototype assembly.</span>
                </div>
              )}
              <div className="field">
                <label>
                  Tightening method
                  <InfoTooltip>Different tools/techniques give tighter or looser control over the actual preload achieved for a given nominal torque or angle. Torque wrenches alone have the widest scatter (friction varies assembly to assembly); angle and hydraulic methods are much more repeatable.</InfoTooltip>
                </label>
                <select value={tighteningMethodId} onChange={(e) => setTighteningMethodId(e.target.value)}>
                  {TIGHTENING_METHOD_PRESETS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <span className="hint">Typical αA scatter range {fmt(tighteningMethod.alphaAMin, 2)}–{fmt(tighteningMethod.alphaAMax, 2)}, recommended target ≈{tighteningMethod.recommendedTargetPercentProof}% of proof load. Approximate literature values — verify for critical joints.</span>
              </div>
              <div className="field">
                <label>Scatter convention</label>
                <div className="segmented">
                  <button className={scatterConvention === 'nominalToMax' ? 'active' : ''} onClick={() => setScatterConvention('nominalToMax')}>Nominal-to-max</button>
                  <button className={scatterConvention === 'symmetric' ? 'active' : ''} onClick={() => setScatterConvention('symmetric')}>Symmetric</button>
                </div>
                <span className="hint">Literature isn't unified on this convention — pick per your own tightening-method documentation.</span>
              </div>
              <div className="field">
                <label>Safety factor target</label>
                <input autoComplete="off" type="number" min={1} step={0.1} value={safetyFactorTarget} onChange={(e) => setSafetyFactorTarget(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>External axial load (N)</label>
                <input autoComplete="off" type="number" min={0} value={externalAxialLoadN} onChange={(e) => setExternalAxialLoadN(Number(e.target.value))} />
                <span className="hint">Applied tensile load the joint must resist without separating (0 = static preload-only check).</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">5</span>Solve for
                <InfoTooltip>Pick what you know and want to check: apply a torque and find the resulting preload, specify a target preload and find the torque needed, or model the turn-of-nut method (a light snug torque plus an extra measured rotation).</InfoTooltip>
              </span>
            </div>
            <div className="field" style={{ marginBottom: '0.85rem' }}>
              <div className="segmented">
                <button className={mode === 'torqueToPreload' ? 'active' : ''} onClick={() => setMode('torqueToPreload')}>Preload from torque</button>
                <button className={mode === 'preloadToTorque' ? 'active' : ''} onClick={() => setMode('preloadToTorque')}>Torque from preload</button>
                <button className={mode === 'torqueAndAngle' ? 'active' : ''} onClick={() => setMode('torqueAndAngle')}>Torque + angle</button>
              </div>
            </div>
            {mode === 'torqueToPreload' && (
              <div className="field">
                <label>Applied torque (N·m)</label>
                <input autoComplete="off" type="number" min={0.01} step={0.1} value={targetTorqueNm} onChange={(e) => setTargetTorqueNm(Number(e.target.value))} />
              </div>
            )}
            {mode === 'preloadToTorque' && (
              <div className="field">
                <label>Target preload (N)</label>
                <input autoComplete="off" type="number" min={1} value={targetPreloadN} onChange={(e) => setTargetPreloadN(Number(e.target.value))} />
              </div>
            )}
            {mode === 'torqueAndAngle' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>
                    Snug torque (N·m)
                    <InfoTooltip>A light torque used just to pull the joint together and remove gaps between parts — not the final tightening torque. Typically well under the final target.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={snugTorqueNm} onChange={(e) => setSnugTorqueNm(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>
                    Additional rotation (deg)
                    <InfoTooltip>After snugging, turning the fastener this many extra degrees stretches the bolt a known, geometry-based amount — often MORE repeatable than torque alone, since past the snug point it no longer depends much on friction. Example: "5 N·m then turn an additional 90°".</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} step={5} value={additionalAngleDeg} onChange={(e) => setAdditionalAngleDeg(Number(e.target.value))} />
                </div>
                <span className="hint" style={{ gridColumn: '1 / -1' }}>Example: {fmt(snugTorqueNm, 1)} N·m snug torque, then an additional {fmt(additionalAngleDeg, 0)}° rotation.</span>
              </div>
            )}
          </div>

          {advancedMode && (
            <div className="card">
              <div className="card-title">
                <span>
                  <span className="step-num">6</span>Thermal effects
                  <InfoTooltip>If the bolt and clamped parts are assembled at one temperature and operate at another, and they expand by different amounts (different CTE), the joint's clamping force changes — heating usually tightens a steel-bolted aluminium joint further, while cooling can loosen it. Enable this to check both conditions.</InfoTooltip>
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600, marginBottom: includeThermalEffects ? '0.85rem' : 0 }}>
                <input type="checkbox" checked={includeThermalEffects} onChange={(e) => setIncludeThermalEffects(e.target.checked)} style={{ width: 'auto' }} />
                Include thermal expansion effects
              </label>
              {includeThermalEffects && (
                <div className="grid grid-2">
                  <div className="field">
                    <label>Assembly temperature (°C)</label>
                    <input autoComplete="off" type="number" value={assemblyTempC} onChange={(e) => setAssemblyTempC(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Operating temperature (°C)</label>
                    <input autoComplete="off" type="number" value={operatingTempC} onChange={(e) => setOperatingTempC(Number(e.target.value))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Bolt CTE override (×10⁻⁶/°C)</label>
                    <input autoComplete="off" type="number" min={0.1} step={0.1} value={boltCteOverridePerC} onChange={(e) => setBoltCteOverridePerC(Number(e.target.value))} />
                    <span className="hint">Default 12.0 (typical steel fastener) — override if the bolt is a different material.</span>
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

            <div className={`status-banner ${result.overallPass ? 'pass' : 'fail'}`}>
              {result.overallPass
                ? '✓ Joint design meets all checks'
                : `✗ Joint design fails ${failingChecks.length} check${failingChecks.length === 1 ? '' : 's'} — see guidance below`}
            </div>
            {failureGuidance.length > 0 && (
              <div style={{ margin: '0 0 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {failureGuidance.map((f, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <div style={{ color: f.severity === 'fail' ? 'var(--neg)' : 'var(--warn)', fontWeight: 700 }}>{f.severity === 'fail' ? '✗' : '⚠'} {f.issue}</div>
                    <div style={{ color: 'var(--text-2)' }}>→ {f.guidance}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">
                  Preload
                  <InfoTooltip>The clamping tension already "built into" the joint before any external load is applied — this is what actually holds the parts together. Too low and the joint can loosen or separate under load; too high and you risk yielding or breaking the bolt.</InfoTooltip>
                </div>
                <div className="value">{fmt(result.preloadN, 0)}<span className="unit">N</span></div>
                <div className="hint">{fmt(result.preloadPercentOfProof, 0)}% of proof load</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Torque
                  <InfoTooltip>The twisting effort applied at the wrench. Most of it (often 80-90%) is consumed by friction under the head/nut and in the threads — only a fraction actually stretches the bolt into preload, which is why friction assumptions matter so much.</InfoTooltip>
                </div>
                <div className="value">{fmt(result.torqueNm, 2)}<span className="unit">N·m</span></div>
                <div className="hint">K-factor ≈ {fmt(result.simplifiedKFactor, 3)}</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Yield-onset ("breakoff") torque
                  <InfoTooltip>The torque level that would just bring the bolt to its proof strength (before any external load), computed the same way real yield-controlled/gradient tightening tools work. Treat this as a safe ceiling — going past it starts to permanently stretch (and eventually break) the bolt.</InfoTooltip>
                </div>
                <div className="value">{fmt(result.yieldOnsetTorqueNm, 2)}<span className="unit">N·m</span></div>
                {mode === 'torqueAndAngle' && result.yieldOnsetAngleDegFromSnug !== null && (
                  <div className="hint">≈ {fmt(result.yieldOnsetAngleDegFromSnug, 0)}° additional rotation from your snug torque</div>
                )}
              </div>
              <div className="result-tile">
                <div className="label">
                  Preload scatter band
                  <InfoTooltip>Even with a fixed target torque, the ACTUAL preload varies assembly to assembly because friction is never perfectly repeatable. This band shows the realistic range for your chosen tightening method — a good design should still pass its checks even at the low end, and not overstress the bolt at the high end.</InfoTooltip>
                </div>
                <div className="value" style={{ fontSize: '1.2rem' }}>{fmt(result.preloadScatterBand.minN, 0)}–{fmt(result.preloadScatterBand.maxN, 0)}<span className="unit">N</span></div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Bolt stress safety factor
                  <InfoTooltip>How much margin the bolt itself has against reaching its proof strength (the point it starts to permanently stretch) once external load is added to the preload. Below 1.0 means the bolt has already exceeded proof strength — this must be fixed.</InfoTooltip>
                </div>
                <div className={`value ${result.boltStressPass ? 'pos' : 'neg'}`}>{fmt(result.boltStressSafetyFactor, 2)}</div>
                <div className="hint">σ = {fmt(result.boltTensileStressMPa, 1)} MPa</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Head-side bearing SF
                  <InfoTooltip>How much margin the material directly under the bolt head/washer has before it starts to crush or yield locally. A low value means you need a wider washer, a stronger clamped material, or a larger bolt head.</InfoTooltip>
                </div>
                <div className={`value ${result.memberBearingPass[0] ? 'pos' : 'neg'}`}>{fmt(result.memberBearingSafetyFactor[0], 2)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Nut/tapped-side bearing SF</div>
                <div className={`value ${result.memberBearingPass[result.memberBearingPass.length - 1] ? 'pos' : 'neg'}`}>{fmt(result.memberBearingSafetyFactor[result.memberBearingSafetyFactor.length - 1], 2)}</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Joint separation margin
                  <InfoTooltip>How much clamping force is left squeezing the parts together once the external load is applied. If this drops to zero or below, the parts can lift apart at the joint interface — even if the bolt itself is nowhere near failing. Bigger positive numbers are safer against separation, leakage, or fretting.</InfoTooltip>
                </div>
                <div className={`value ${result.jointSeparates ? 'neg' : 'pos'}`}>{fmt(result.jointSeparationMarginN, 0)}<span className="unit">N</span></div>
              </div>
              {result.threadShearCheck && (
                <div className="result-tile">
                  <div className="label">
                    Thread engagement
                    <InfoTooltip>How deep the bolt threads into a tapped hole or insert. Too shallow and the threads can strip before the bolt reaches its full strength — "min" is the depth needed to make the engaged threads at least as strong as the bolt.</InfoTooltip>
                  </div>
                  <div className={`value ${result.threadShearCheck.pass ? 'pos' : 'neg'}`}>{fmt(result.threadShearCheck.providedEngagementMm, 1)}<span className="unit">mm</span></div>
                  <div className="hint">min {fmt(result.threadShearCheck.requiredEngagementMm, 1)} mm</div>
                </div>
              )}
            </div>
          </div>

          {result.thermalResult && (
            <div className="card">
              <div className="card-title">
                <span>
                  Thermal effects: without vs. with
                  <InfoTooltip>Compares the joint at assembly temperature (no thermal effect — the "Results" above) against operating temperature. Both need to pass for the design to be OK across its full temperature range.</InfoTooltip>
                </span>
                <span className={`tag`} style={{ background: result.thermalResult.overallPass ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: result.thermalResult.overallPass ? 'var(--pos)' : 'var(--neg)', borderColor: 'transparent' }}>
                  {result.thermalResult.overallPass ? 'passes at operating temp' : 'fails at operating temp'}
                </span>
              </div>
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Preload change (ΔF)</div>
                  <div className={`value ${result.thermalResult.deltaForceN >= 0 ? 'pos' : 'warn'}`}>{result.thermalResult.deltaForceN >= 0 ? '+' : ''}{fmt(result.thermalResult.deltaForceN, 0)}<span className="unit">N</span></div>
                  <div className="hint">{result.thermalResult.deltaForceN >= 0 ? 'heating tightens the joint' : 'heating loosens the joint'}</div>
                </div>
                <div className="result-tile">
                  <div className="label">Preload at operating temp</div>
                  <div className="value">{fmt(result.thermalResult.preloadN, 0)}<span className="unit">N</span></div>
                  <div className="hint">vs. {fmt(result.preloadN, 0)} N at assembly</div>
                </div>
                <div className="result-tile">
                  <div className="label">Bolt SF at operating temp</div>
                  <div className={`value ${result.thermalResult.boltStressPass ? 'pos' : 'neg'}`}>{fmt(result.thermalResult.boltStressSafetyFactor, 2)}</div>
                  <div className="hint">vs. {fmt(result.boltStressSafetyFactor, 2)} at assembly</div>
                </div>
                <div className="result-tile">
                  <div className="label">Joint separates at operating temp?</div>
                  <div className={`value ${result.thermalResult.jointSeparates ? 'neg' : 'pos'}`}>{result.thermalResult.jointSeparates ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title">Joint cross-section</div>
            <BoltedJointCrossSection
              nominalDiameterMm={size.nominalDiameterMm}
              headFlatsAcrossMm={size.headFlatsAcrossMm[headType]}
              clampedSections={sections}
              underHeadWasher={effectiveHeadWasher}
              underNutWasher={threadEngagementMode === 'nutAndBolt' ? effectiveNutWasher : null}
              nut={effectiveNut}
              frustumSegments={result.frustumSegments}
              geometryValidity={result.geometryValidity}
              threadEngagementMode={threadEngagementMode}
              engagementLengthMm={threadEngagementMode === 'threadedInsert' ? engagementLengthMm : undefined}
            />
          </div>

          <div className="card">
            <div className="card-title">Selected components</div>
            <table className="data-table">
              <tbody>
                {bomRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note" style={{ marginTop: '0.6rem' }}>
              Representative standard designations (ISO/DIN number + size + variant) for cross-referencing against a
              supplier's current catalog — not a guaranteed live vendor SKU.
            </p>
          </div>

        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Clamped-member stiffness uses the standard simplified two-cone (nut &amp; bolt) or single-cone (tapped/
          threaded-insert) frustum method — a 30° half-angle cone of compression spreading from each bearing face,
          chained across multiple clamped sections where the mid-plane (or, for tapped joints, the mid-point of
          thread engagement) falls inside a plate. This is the standard textbook realization (Shigley's Mechanical
          Engineering Design) of VDI 2230's cone-of-compression concept; VDI 2230's own full multi-segment method
          may give different results on stacks with many plates of sharply different diameters — treat this as a
          good general-purpose estimate, not a replacement for full VDI 2230 analysis on complex stacks. Bearing/
          yield stress is checked only at the two outer bearing faces, not interior plate-to-plate interfaces.
          Minimum thread engagement length is a first-principles-scaled estimate (proof-strength-to-yield-strength
          ratio, floored at 1× nominal diameter), not a full thread-shear-area derivation. Property-class strength
          values (ISO 898-1 designation formula, SAE J429 typical published grades), all-metal prevailing-torque
          nut torques, and tightening-method scatter factors (αA) are typical/representative — verify against the
          current official standards and, where required, physical testing before certification use.
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
