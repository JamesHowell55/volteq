import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP, UNIT_FORCE } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
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
import BearingCrossSectionDiagram from '../components/BearingCrossSectionDiagram';
import {
  BEARING_TYPE_LIST, LUBRICATION_METHODS, DUTY_FACTORS, STATIC_SAFETY_TARGET, LIFE_PRESETS, RELIABILITY_A1,
  BUSH_MATERIALS, type BearingTypeId, type LubricationMethod,
} from '../lib/bearingData';
import {
  resolveBearingType, selectBearing, compareAllTypes, selectPlainBush, greaseRelubeIntervalHours,
  recommendedIsoVg, thermalAdvisory, type ContactAngleOption, type BearingSelectionInput, type BearingCandidateResult,
} from '../lib/bearingPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

type UnitSystemT = ReturnType<typeof useUnitSystem>['unitSystem'];

function fmtU(valueSI: number, unitSystem: UnitSystemT, def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

export default function BearingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const forceUnit = unitLabel(unitSystem, UNIT_FORCE);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  const [shaftDiameterMm, setShaftDiameterMm] = useState(30);
  const [radialLoadN, setRadialLoadN] = useState(2000);
  const [axialLoadN, setAxialLoadN] = useState(500);
  const [speedRpm, setSpeedRpm] = useState(1500);
  const [targetL10Hours, setTargetL10Hours] = useState(30000);
  const [reliabilityPct, setReliabilityPct] = useState(90);
  const [dutyFactorId, setDutyFactorId] = useState<'steady' | 'light-shock' | 'heavy-shock'>('steady');
  const [staticDutyId, setStaticDutyId] = useState<'low' | 'normal' | 'heavy'>('normal');
  const [lubricationMethod, setLubricationMethod] = useState<LubricationMethod>('grease');
  const [housingTempC, setHousingTempC] = useState(60);
  const [shaftTempC, setShaftTempC] = useState(65);
  const [bearingTypeId, setBearingTypeId] = useState<BearingTypeId>('deep-groove-ball');
  const [contactAngleDeg, setContactAngleDeg] = useState<ContactAngleOption>(40);
  const [bushMaterialId, setBushMaterialId] = useState(BUSH_MATERIALS[0].id);
  const [bushRatio, setBushRatio] = useState(1.0);
  const [compareMode, setCompareMode] = useState(false);

  const isBush = bearingTypeId === 'plain-bush';
  const resolvedType = useMemo(() => resolveBearingType(bearingTypeId, contactAngleDeg), [bearingTypeId, contactAngleDeg]);
  const bushMaterial = BUSH_MATERIALS.find((m) => m.id === bushMaterialId) ?? BUSH_MATERIALS[0];

  const selectionInput: BearingSelectionInput = useMemo(() => ({
    shaftDiameterMm, radialLoadN, axialLoadN, speedRpm, targetL10Hours, reliabilityPct,
    dutyFactorId, staticDutyId, lubricationMethod, housingTempC,
  }), [shaftDiameterMm, radialLoadN, axialLoadN, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId, lubricationMethod, housingTempC]);

  const bearingResult = useMemo(() => (isBush ? null : selectBearing(resolvedType, selectionInput)), [isBush, resolvedType, selectionInput]);
  const bushResult = useMemo(() => (isBush ? selectPlainBush(bushMaterial, shaftDiameterMm, radialLoadN, speedRpm, bushRatio) : null), [isBush, bushMaterial, shaftDiameterMm, radialLoadN, speedRpm, bushRatio]);

  const { isPremium, loading: entitlementLoading } = useEntitlement();
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setCompareMode(false);
  }, [isPremium, entitlementLoading]);

  const compareResults: BearingCandidateResult[] | null = useMemo(
    () => (compareMode && isPremium && !isBush ? compareAllTypes(selectionInput, contactAngleDeg) : null),
    [compareMode, isPremium, isBush, selectionInput, contactAngleDeg],
  );

  const relube = useMemo(() => {
    if (isBush || !bearingResult) return null;
    if (lubricationMethod === 'oil') return null;
    return greaseRelubeIntervalHours(bearingResult.lubrication.ndm, housingTempC);
  }, [isBush, bearingResult, lubricationMethod, housingTempC]);

  const thermalNote = useMemo(() => thermalAdvisory(shaftTempC, housingTempC), [shaftTempC, housingTempC]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    shaftDiameterMm, radialLoadN, axialLoadN, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId,
    lubricationMethod, housingTempC, shaftTempC, bearingTypeId, contactAngleDeg, bushMaterialId, bushRatio, compareMode,
  }), [shaftDiameterMm, radialLoadN, axialLoadN, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId,
    lubricationMethod, housingTempC, shaftTempC, bearingTypeId, contactAngleDeg, bushMaterialId, bushRatio, compareMode]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.shaftDiameterMm != null) setShaftDiameterMm(v.shaftDiameterMm);
    if (v.radialLoadN != null) setRadialLoadN(v.radialLoadN);
    if (v.axialLoadN != null) setAxialLoadN(v.axialLoadN);
    if (v.speedRpm != null) setSpeedRpm(v.speedRpm);
    if (v.targetL10Hours != null) setTargetL10Hours(v.targetL10Hours);
    if (v.reliabilityPct != null) setReliabilityPct(v.reliabilityPct);
    if (v.dutyFactorId) setDutyFactorId(v.dutyFactorId);
    if (v.staticDutyId) setStaticDutyId(v.staticDutyId);
    if (v.lubricationMethod) setLubricationMethod(v.lubricationMethod);
    if (v.housingTempC != null) setHousingTempC(v.housingTempC);
    if (v.shaftTempC != null) setShaftTempC(v.shaftTempC);
    if (v.bearingTypeId) setBearingTypeId(v.bearingTypeId);
    if (v.contactAngleDeg) setContactAngleDeg(v.contactAngleDeg);
    if (v.bushMaterialId) setBushMaterialId(v.bushMaterialId);
    if (v.bushRatio != null) setBushRatio(v.bushRatio);
    if (v.compareMode != null) setCompareMode(v.compareMode);
  }, []);

  const saved = useSavedCalculations('bearing-calculator');
  const shareLink = useShareableLink(restoreInputs);

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    if (isBush && bushResult) {
      steps.push({
        title: 'Bearing (unit) pressure',
        formula: 'P = Fr / (d . L)',
        substitution: `Fr = ${fmt(radialLoadN, 0)} N, d = ${fmt(bushResult.boreMm, 2)} mm, L = ${fmt(bushResult.lengthMm, 2)} mm`,
        result: `P = ${fmt(bushResult.pressureMPa, 2)} MPa`,
      });
      steps.push({
        title: 'Surface (rubbing) velocity',
        formula: 'V = pi . d . n / 60,000',
        substitution: `d = ${fmt(bushResult.boreMm, 2)} mm, n = ${fmt(speedRpm, 0)} rpm`,
        result: `V = ${fmt(bushResult.velocityMs, 3)} m/s`,
      });
      steps.push({
        title: 'PV check against material limit',
        formula: 'PV = P . V, compared with the bush material\'s continuous PV rating',
        substitution: `${bushResult.material.label}: PV_max = ${fmt(bushResult.material.pvMaxMPaMs, 2)} MPa.m/s, P_max = ${fmt(bushResult.material.pMaxMPa, 1)} MPa, V_max = ${fmt(bushResult.material.vMaxMs, 1)} m/s`,
        result: `PV = ${fmt(bushResult.pv, 3)} MPa.m/s — ${bushResult.overallPass ? 'within all three limits' : 'exceeds at least one limit'}`,
      });
      return steps;
    }
    if (bearingResult) {
      const eq = bearingResult.equivalentLoad;
      steps.push({
        title: 'Equivalent dynamic bearing load',
        formula: eq.Y === 0 && eq.X === 1 ? 'P = Fr (Fa/Fr <= e, or bearing type carries no thrust)' : 'P = X.Fr + Y.Fa',
        substitution: `Fr = ${fmt(radialLoadN, 0)} N, Fa = ${fmt(axialLoadN, 0)} N, X = ${fmt(eq.X, 2)}, Y = ${fmt(eq.Y, 2)}${eq.e > 0 ? `, e = ${fmt(eq.e, 2)}` : ''}`,
        result: `P = ${fmt(eq.P_N, 0)} N${bearingResult.dutyFactor !== 1 ? ` -> ${fmt(bearingResult.effectiveLoadN, 0)} N after the ${fmt(bearingResult.dutyFactor, 2)}x duty factor` : ''}`,
      });
      const p = bearingResult.p;
      steps.push({
        title: 'Required dynamic load rating for the target life',
        formula: `C_req = P . (L10_target)^(1/p),  p = ${fmt(p, 2)} (${resolvedType.rollingElement === 'ball' ? 'ball' : 'roller'} bearing), L10_target[Mrev] = (target hours / a1) . 60n / 1e6`,
        substitution: `target = ${fmt(targetL10Hours, 0)} h at ${reliabilityPct}% reliability (a1 = ${fmt(bearingResult.a1, 2)}), n = ${fmt(speedRpm, 0)} rpm`,
        result: `C_required = ${fmt(bearingResult.requiredDynamicN, 0)} N`,
      });
      steps.push({
        title: 'Candidate bearing and achieved life',
        formula: 'L10 = (C/P)^p [Mrev],  L10h = 1e6 . L10 / (60n)',
        substitution: `${bearingResult.entry.designation}: C = ${fmt(bearingResult.entry.dynamicN, 0)} N, C0 = ${fmt(bearingResult.entry.staticN, 0)} N`,
        result: `L10h = ${fmt(bearingResult.achievedL10h, 0)} h (${fmt(bearingResult.achievedL10hAdjusted, 0)} h at ${reliabilityPct}% reliability) — ${bearingResult.dynamicPass ? 'meets' : 'falls short of'} the target`,
      });
      steps.push({
        title: 'Static safety check',
        formula: 'P0 = max(X0.Fr + Y0.Fa, Fr),  s0 = C0 / P0',
        substitution: `P0 = ${fmt(bearingResult.staticLoadN, 0)} N, target s0 >= ${fmt(bearingResult.requiredStaticN > 0 ? bearingResult.requiredStaticN / bearingResult.staticLoadN : 0, 2)}`,
        result: `s0 = ${fmt(bearingResult.staticSafetyFactorAchieved, 2)} — ${bearingResult.staticPass ? 'pass' : 'fail'}`,
      });
      steps.push({
        title: 'Lubrication speed factor',
        formula: 'n.dm = n . (D + d) / 2',
        substitution: `D = ${fmt(bearingResult.entry.odMm, 1)} mm, d = ${fmt(bearingResult.entry.boreMm, 1)} mm, n = ${fmt(speedRpm, 0)} rpm`,
        result: `n.dm = ${fmt(bearingResult.lubrication.ndm, 0)} mm.rpm — ${bearingResult.lubrication.ok ? 'suitable for the selected lubrication method' : 'outside the typical suitable range, see notes'}`,
      });
    }
    return steps;
  }, [isBush, bushResult, bearingResult, radialLoadN, axialLoadN, speedRpm, targetL10Hours, reliabilityPct, resolvedType]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Shaft and loads',
      rows: [
        { label: 'Shaft diameter', value: `${fmt(shaftDiameterMm, 2)} mm` },
        { label: 'Radial load Fr', value: `${fmt(radialLoadN, 0)} N` },
        { label: 'Axial load Fa', value: `${fmt(axialLoadN, 0)} N` },
        { label: 'Speed', value: `${fmt(speedRpm, 0)} rpm` },
      ],
    },
    {
      heading: 'Bearing type and duty',
      rows: [
        { label: 'Type', value: resolvedType.label + (bearingTypeId === 'angular-contact-ball' ? ` (${contactAngleDeg}°)` : '') },
        { label: 'Target L10 life', value: `${fmt(targetL10Hours, 0)} h at ${reliabilityPct}% reliability` },
        { label: 'Duty / shock factor', value: DUTY_FACTORS.find((d) => d.id === dutyFactorId)?.label ?? '' },
        { label: 'Static duty', value: STATIC_SAFETY_TARGET.find((d) => d.id === staticDutyId)?.label ?? '' },
        { label: 'Lubrication', value: LUBRICATION_METHODS.find((m) => m.id === lubricationMethod)?.label ?? '' },
      ],
    },
    {
      heading: 'Temperatures',
      rows: [
        { label: 'Housing', value: `${fmt(housingTempC, 0)}°C` },
        { label: 'Shaft', value: `${fmt(shaftTempC, 0)}°C` },
      ],
    },
  ], [shaftDiameterMm, radialLoadN, axialLoadN, speedRpm, resolvedType, bearingTypeId, contactAngleDeg, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId, lubricationMethod, housingTempC, shaftTempC]);

  const outputSections: ReportSection[] = useMemo(() => {
    if (isBush && bushResult) {
      return [{
        heading: 'Plain bush result',
        rows: [
          { label: 'Bush', value: `${fmt(bushResult.boreMm, 1)} x ${fmt(bushResult.odMm, 1)} x ${fmt(bushResult.lengthMm, 1)} mm, ${bushResult.material.label}` },
          { label: 'Bearing pressure P', value: `${fmt(bushResult.pressureMPa, 2)} MPa (limit ${fmt(bushResult.material.pMaxMPa, 1)})` },
          { label: 'Surface velocity V', value: `${fmt(bushResult.velocityMs, 3)} m/s (limit ${fmt(bushResult.material.vMaxMs, 1)})` },
          { label: 'PV', value: `${fmt(bushResult.pv, 3)} MPa.m/s (limit ${fmt(bushResult.material.pvMaxMPaMs, 2)})` },
          { label: 'Overall', value: bushResult.overallPass ? 'Pass' : 'Fail' },
        ],
      }];
    }
    if (!bearingResult) return [];
    return [{
      heading: 'Recommended bearing',
      rows: [
        { label: 'Designation', value: bearingResult.entry.designation },
        { label: 'Envelope', value: `d${fmt(bearingResult.entry.boreMm, 0)} x D${fmt(bearingResult.entry.odMm, 0)} x B${fmt(bearingResult.entry.widthMm, 1)} mm` },
        { label: 'Dynamic / static rating', value: `C = ${fmt(bearingResult.entry.dynamicN, 0)} N, C0 = ${fmt(bearingResult.entry.staticN, 0)} N` },
        { label: 'Achieved L10h', value: `${fmt(bearingResult.achievedL10h, 0)} h (${fmt(bearingResult.achievedL10hAdjusted, 0)} h adjusted)` },
        { label: 'Static safety factor', value: fmt(bearingResult.staticSafetyFactorAchieved, 2) },
        { label: 'Lubrication', value: bearingResult.lubrication.ok ? 'Suitable' : 'Not suitable — see notes' },
        { label: 'Overall', value: bearingResult.overallPass ? 'Pass' : 'Fail' },
      ],
    }];
  }, [isBush, bushResult, bearingResult]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Bearing_Calculator',
      pageTitle: 'Bearing Calculator',
      accentHex,
      passStatus: isBush
        ? (bushResult ? { pass: bushResult.overallPass, label: bushResult.overallPass ? 'Within bush pressure/velocity/PV limits' : 'Exceeds a bush pressure/velocity/PV limit' } : undefined)
        : (bearingResult ? { pass: bearingResult.overallPass, label: bearingResult.overallPass ? 'Candidate bearing meets life and static targets' : 'Candidate bearing falls short — see notes' } : undefined),
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Engineering sizing/guidance tool for rolling-element and plain (sleeve) bearings. Rolling-element life uses ISO 281 basic rating life L10 = (C/P)^p (p=3 ball, 10/3 roller), the equivalent dynamic load P = X.Fr + Y.Fa with representative X/Y/e factors for each bearing family, an ISO 281 reliability factor a1, and a static safety check s0 = C0/P0 against a representative target. The catalogue candidate (designation, envelope, C, C0, limiting speed) is generated from a parametric model calibrated at a d=25 mm reference bearing against published typical figures and standard catalogue growth trends — it is a realistic, representative candidate, not a literal transcription of the current SKF (or any other manufacturer\'s) catalogue. Lubrication guidance (speed-factor suitability, grease relubrication interval, recommended oil viscosity band) is indicative, rule-of-thumb guidance, not a substitute for the manufacturer\'s full lubrication-selection procedure. Plain-bush sizing uses the pressure-velocity (PV) method against representative material limits. Always confirm the final bearing designation\'s dimensions and ratings against the current manufacturer datasheet, and have the complete application (mounting, fits, internal clearance, seals) reviewed before production use.',
      ...branding,
    });
  };

  const dutyFactor = DUTY_FACTORS.find((d) => d.id === dutyFactorId)!;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Bearing Calculator</div>
          <h1>Bearing Calculator</h1>
          <p>
            Propose a rolling-element or plain-bush bearing from a shaft diameter and combined radial/axial
            load — deep groove ball, angular contact ball, cylindrical/tapered/spherical/needle roller, thrust
            ball, or plain bush, sized to an ISO 281 target life (or, for a bush, a pressure-velocity limit),
            with sealed/grease/oil lubrication guidance and a cross-section diagram.
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
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">1</span>Shaft and loads
                <InfoTooltip>The bearing bore is sized to sit on (or just under) the shaft diameter — this tool rounds up to the nearest standard bore. Radial and axial loads are the resultant loads the bearing must react at its location.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Shaft diameter ({lenUnit})</label>
                <input autoComplete="off" type="number" min={1} value={toDisplay(shaftDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setShaftDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Speed (rpm)</label>
                <input autoComplete="off" type="number" min={0} value={speedRpm} onChange={(e) => setSpeedRpm(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Radial load Fr ({forceUnit})</label>
                <input autoComplete="off" type="number" min={0} value={toDisplay(radialLoadN, unitSystem, UNIT_FORCE)} onChange={(e) => setRadialLoadN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
              </div>
              <div className="field">
                <label>
                  Axial load Fa ({forceUnit})
                  {isBush && <InfoTooltip>Plain bushes in this tool are sized for radial load only — axial load isn't used here. Add a separate thrust washer/collar if the shaft needs axial location.</InfoTooltip>}
                </label>
                <input autoComplete="off" type="number" min={0} disabled={isBush} value={toDisplay(axialLoadN, unitSystem, UNIT_FORCE)} onChange={(e) => setAxialLoadN(fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Bearing type
                <InfoTooltip>Each type trades off radial capacity, axial capacity, envelope, speed, and cost differently. See the description below the selector for what each is good at.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Type</label>
              <select value={bearingTypeId} onChange={(e) => setBearingTypeId(e.target.value as BearingTypeId)}>
                {BEARING_TYPE_LIST.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <span className="hint">{resolvedType.description}{resolvedType.mountingNote ? ` ${resolvedType.mountingNote}` : ''}</span>
            </div>
            {bearingTypeId === 'angular-contact-ball' && (
              <div className="field">
                <label>Contact angle</label>
                <div className="segmented">
                  <button className={contactAngleDeg === 25 ? 'active' : ''} onClick={() => setContactAngleDeg(25)}>25° (standard)</button>
                  <button className={contactAngleDeg === 40 ? 'active' : ''} onClick={() => setContactAngleDeg(40)}>40° (high thrust)</button>
                </div>
              </div>
            )}
            {isBush && (
              <>
                <div className="field">
                  <label>Bush material</label>
                  <select value={bushMaterialId} onChange={(e) => setBushMaterialId(e.target.value)}>
                    {BUSH_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <span className="hint">{bushMaterial.description} Max {fmt(bushMaterial.maxTempC, 0)}°C.</span>
                </div>
                <div className="field">
                  <label>
                    Length / diameter ratio
                    <InfoTooltip>Longer bushes (higher L/d) spread the load over more projected area, lowering bearing pressure P — but too long risks edge-loading under shaft deflection. 0.8-1.5 is a typical range.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0.3} max={3} step={0.05} value={bushRatio} onChange={(e) => setBushRatio(Number(e.target.value))} />
                </div>
              </>
            )}
            {!isBush && (
              <PremiumGate feature="Compare across all bearing types">
                <button className={`btn small ${compareMode ? 'primary' : ''}`} onClick={() => setCompareMode((v) => !v)}>
                  {compareMode ? 'Comparing all types ✓' : 'Compare across all bearing types'}
                </button>
              </PremiumGate>
            )}
          </div>

          {!isBush && (
            <div className="card">
              <div className="card-title">
                <span>
                  <span className="step-num">3</span>Target life and duty
                  <InfoTooltip>The target L10 life is the number of hours 90% of an identical batch of bearings would be expected to reach before the first sign of fatigue — a common design target, not a guaranteed minimum for any single bearing. The duty/shock factor inflates the equivalent load to account for load variation the mean Fr/Fa don't capture.</InfoTooltip>
                </span>
              </div>
              <div className="field">
                <label>Target L10 life (hours)</label>
                <input autoComplete="off" type="number" min={1} value={targetL10Hours} onChange={(e) => setTargetL10Hours(Number(e.target.value))} />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {LIFE_PRESETS.map((p) => (
                    <button key={p.id} className="btn small" title={p.hint} onClick={() => setTargetL10Hours(p.hours)}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-2" style={{ marginTop: '0.6rem' }}>
                <div className="field">
                  <label>Reliability</label>
                  <select value={reliabilityPct} onChange={(e) => setReliabilityPct(Number(e.target.value))}>
                    {RELIABILITY_A1.map((r) => <option key={r.reliabilityPct} value={r.reliabilityPct}>{r.reliabilityPct}% (a1={r.a1})</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Duty / shock factor</label>
                  <select value={dutyFactorId} onChange={(e) => setDutyFactorId(e.target.value as typeof dutyFactorId)}>
                    {DUTY_FACTORS.map((d) => <option key={d.id} value={d.id}>{d.label} (×{d.factor})</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Static duty (target static safety factor)</label>
                  <select value={staticDutyId} onChange={(e) => setStaticDutyId(e.target.value as typeof staticDutyId)}>
                    {STATIC_SAFETY_TARGET.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">{isBush ? 3 : 4}</span>Lubrication and temperature
                <InfoTooltip>Housing temperature governs grease/seal service-temperature limits; the difference between shaft and housing temperature drives differential thermal expansion, which can eat into (or open up) the bearing's internal running clearance.</InfoTooltip>
              </span>
            </div>
            {!isBush && (
              <div className="field">
                <label>Lubrication method</label>
                <div className="segmented">
                  {LUBRICATION_METHODS.map((m) => (
                    <button key={m.id} className={lubricationMethod === m.id ? 'active' : ''} onClick={() => setLubricationMethod(m.id)}>{m.label}</button>
                  ))}
                </div>
                <span className="hint">{LUBRICATION_METHODS.find((m) => m.id === lubricationMethod)?.description}</span>
              </div>
            )}
            <div className="grid grid-2" style={{ marginTop: isBush ? 0 : '0.6rem' }}>
              <div className="field">
                <label>Housing temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(housingTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setHousingTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Shaft temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(shaftTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setShaftTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          {isBush && bushResult && (
            <div className="card">
              <div className="card-title">Results</div>
              <div className={`status-banner ${bushResult.overallPass ? 'pass' : 'fail'}`}>
                {bushResult.overallPass ? '✓ Within pressure, velocity, and PV limits' : '✗ Exceeds at least one bush limit — see below'}
              </div>
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Bush size</div>
                  <div className="value" style={{ fontSize: '1.1rem' }}>{fmtU(bushResult.boreMm, unitSystem, UNIT_LENGTH, 1)}×{fmtU(bushResult.odMm, unitSystem, UNIT_LENGTH, 1)}×{fmtU(bushResult.lengthMm, unitSystem, UNIT_LENGTH, 1)}<span className="unit">{lenUnit}</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Bearing pressure P</div>
                  <div className={`value ${bushResult.pOk ? 'pos' : 'neg'}`}>{fmt(bushResult.pressureMPa, 2)}<span className="unit">MPa</span></div>
                  <div className="hint">limit {fmt(bushResult.material.pMaxMPa, 1)} MPa</div>
                </div>
                <div className="result-tile">
                  <div className="label">Surface velocity V</div>
                  <div className={`value ${bushResult.vOk ? 'pos' : 'neg'}`}>{fmt(bushResult.velocityMs, 3)}<span className="unit">m/s</span></div>
                  <div className="hint">limit {fmt(bushResult.material.vMaxMs, 1)} m/s</div>
                </div>
                <div className="result-tile">
                  <div className="label">PV</div>
                  <div className={`value ${bushResult.pvOk ? 'pos' : 'neg'}`}>{fmt(bushResult.pv, 3)}<span className="unit">MPa·m/s</span></div>
                  <div className="hint">limit {fmt(bushResult.material.pvMaxMPaMs, 2)} MPa·m/s</div>
                </div>
              </div>
              {!bushResult.overallPass && (
                <p className="note" style={{ color: 'var(--neg)' }}>
                  Increase the length/diameter ratio, use a higher-PV material, reduce the load or speed, or step up the shaft/bush diameter.
                </p>
              )}
            </div>
          )}

          {!isBush && bearingResult && (
            <div className="card">
              <div className="card-title">Results</div>
              <div className={`status-banner ${bearingResult.overallPass ? 'pass' : 'fail'}`}>
                {bearingResult.overallPass
                  ? `✓ ${bearingResult.entry.designation} meets the target life and static safety factor`
                  : bearingResult.noCandidate
                    ? `✗ No catalogue ${resolvedType.shortLabel.toLowerCase()} bearing fits a ${fmt(shaftDiameterMm, 0)} mm shaft — largest shown`
                    : `✗ No listed ${resolvedType.shortLabel.toLowerCase()} bearing up to ${fmt(bearingResult.entry.boreMm, 0)} mm bore meets the target — largest shown`}
              </div>
              {bearingResult.equivalentLoad.warning && <p className="note" style={{ color: 'var(--warn)' }}>⚠ {bearingResult.equivalentLoad.warning}</p>}
              {!bearingResult.lubrication.ok && bearingResult.lubrication.notes.map((n, i) => <p key={i} className="note" style={{ color: 'var(--warn)' }}>⚠ {n}</p>)}
              {thermalNote && <p className="note" style={{ color: 'var(--warn)' }}>⚠ {thermalNote}</p>}
              {resolvedType.factorNote && <p className="hint" style={{ marginBottom: '0.6rem' }}>ⓘ {resolvedType.factorNote}</p>}
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Recommended bearing</div>
                  <div className="value" style={{ fontSize: '1.3rem' }}>{bearingResult.entry.designation}</div>
                  <div className="hint">d{fmt(bearingResult.entry.boreMm, 0)} × D{fmt(bearingResult.entry.odMm, 0)} × B{fmt(bearingResult.entry.widthMm, 1)} mm{bearingResult.sizedUp ? ' · sized up from shaft-diameter bore' : ''}</div>
                </div>
                <div className="result-tile">
                  <div className="label">Achieved L10h</div>
                  <div className={`value ${bearingResult.dynamicPass ? 'pos' : 'neg'}`}>{fmt(bearingResult.achievedL10h, 0)}<span className="unit">h</span></div>
                  <div className="hint">target {fmt(targetL10Hours, 0)} h · {fmt(bearingResult.achievedL10hAdjusted, 0)} h at {reliabilityPct}% reliability</div>
                </div>
                <div className="result-tile">
                  <div className="label">Static safety factor</div>
                  <div className={`value ${bearingResult.staticPass ? 'pos' : 'neg'}`}>{fmt(bearingResult.staticSafetyFactorAchieved, 2)}</div>
                  <div className="hint">target ≥ {fmt(bearingResult.requiredStaticN / Math.max(bearingResult.staticLoadN, 1e-9), 2)}</div>
                </div>
                <div className="result-tile">
                  <div className="label">Equivalent dynamic load P</div>
                  <div className="value">{fmtU(bearingResult.equivalentLoad.P_N, unitSystem, UNIT_FORCE, 0)}<span className="unit">{forceUnit}</span></div>
                  <div className="hint">X {fmt(bearingResult.equivalentLoad.X, 2)} · Y {fmt(bearingResult.equivalentLoad.Y, 2)}{dutyFactor.factor !== 1 ? ` · ×${dutyFactor.factor} duty` : ''}</div>
                </div>
                <div className="result-tile">
                  <div className="label">Lubrication</div>
                  <div className={`value ${bearingResult.lubrication.ok ? 'pos' : 'neg'}`}>{bearingResult.lubrication.ok ? 'Suitable' : 'Check notes'}</div>
                  <div className="hint">n·dm = {fmt(bearingResult.lubrication.ndm, 0)} mm·rpm</div>
                </div>
                <div className="result-tile">
                  <div className="label">Dynamic / static rating</div>
                  <div className="value" style={{ fontSize: '1rem' }}>{fmtU(bearingResult.entry.dynamicN, unitSystem, UNIT_FORCE, 0)} / {fmtU(bearingResult.entry.staticN, unitSystem, UNIT_FORCE, 0)}<span className="unit">{forceUnit}</span></div>
                  <div className="hint">C / C0</div>
                </div>
              </div>
            </div>
          )}

          {!isBush && bearingResult && (
            <div className="card">
              <div className="card-title">
                <span>
                  Lubrication analysis
                  <InfoTooltip>Speed factor n·dm and temperature limits are the primary lubrication-suitability checks (shown above, free). This card adds relubrication interval and viscosity-grade guidance — indicative, rule-of-thumb figures.</InfoTooltip>
                </span>
              </div>
              <PremiumGate feature="Lubrication analysis (relube interval, viscosity grade)">
                <table className="data-table">
                  <tbody>
                    <tr><td>Speed factor n·dm</td><td>{fmt(bearingResult.lubrication.ndm, 0)} mm·rpm</td></tr>
                    <tr><td>Typical n·dm limit ({LUBRICATION_METHODS.find((m) => m.id === lubricationMethod)?.label})</td><td>{fmt(bearingResult.lubrication.ndmLimit, 0)} mm·rpm</td></tr>
                    {bearingResult.lubrication.catalogueLimitRpm != null && <tr><td>Catalogue limiting speed</td><td>{fmt(bearingResult.lubrication.catalogueLimitRpm, 0)} rpm</td></tr>}
                    {relube !== null && <tr><td>Estimated grease relube interval</td><td>{isFinite(relube) ? `${fmt(relube, 0)} h` : '—'}</td></tr>}
                    <tr><td>Recommended base oil viscosity</td><td>{recommendedIsoVg(bearingResult.lubrication.ndm)}</td></tr>
                  </tbody>
                </table>
                <p className="hint">Relube interval is a rule-of-thumb model calibrated to the widely published deep-groove-ball trend (~10,000 h at n·dm=200,000, ~4,000 h at n·dm=400,000) with a temperature correction; treat as indicative, not a maintenance-plan commitment.</p>
              </PremiumGate>
            </div>
          )}

          {compareResults && (
            <div className="card">
              <div className="card-title">Compare across bearing types</div>
              <table className="data-table">
                <thead><tr><th>Type</th><th>Designation</th><th>C / C0 [{forceUnit}]</th><th>L10h achieved</th><th>Static SF</th><th>Lube OK?</th></tr></thead>
                <tbody>
                  {compareResults.map((r) => (
                    <tr key={r.typeId}>
                      <td>{resolveBearingType(r.typeId, contactAngleDeg).shortLabel}</td>
                      <td>{r.entry.designation}</td>
                      <td>{fmtU(r.entry.dynamicN, unitSystem, UNIT_FORCE, 0)} / {fmtU(r.entry.staticN, unitSystem, UNIT_FORCE, 0)}</td>
                      <td className={r.dynamicPass ? 'pass' : 'fail'}>{fmt(r.achievedL10h, 0)} h</td>
                      <td className={r.staticPass ? 'pass' : 'fail'}>{fmt(r.staticSafetyFactorAchieved, 2)}</td>
                      <td className={r.lubrication.ok ? 'pass' : 'fail'}>{r.lubrication.ok ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="card-title">Cross-section</div>
            {isBush && bushResult ? (
              <BearingCrossSectionDiagram kind="bush" boreMm={bushResult.boreMm} odMm={bushResult.odMm} lengthMm={bushResult.lengthMm} radialLoadN={radialLoadN} unitSystem={unitSystem} />
            ) : bearingResult ? (
              <BearingCrossSectionDiagram kind="bearing" type={resolvedType} entry={bearingResult.entry} radialLoadN={radialLoadN} axialLoadN={axialLoadN} unitSystem={unitSystem} />
            ) : null}
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/bearing-calculator" />
        <p className="note">
          Rolling-element bearings are sized by ISO 281 basic rating life, L10 = (C/P)^p million revolutions
          (p = 3 for ball bearings, 10/3 for roller bearings), converted to hours via L10h = 10⁶·L10 /
          (60·n). The candidate designation, envelope (d, D, B), dynamic rating C, static rating C0, fatigue
          load limit Pu, and limiting speed are taken from the <b>real SKF "Rolling bearings" general
          catalogue</b> (PUB BU/P1 17000/1 EN, 2018 edition) — the mainstream series of each type, extracted
          directly from the published product tables. From all catalogue bearings whose bore fits the shaft,
          the tool selects the smallest-capacity one that meets both the life and static-safety targets (so a
          light series is proposed where it suffices, stepping up to a medium/heavy series or larger bore
          only as the loads demand). The equivalent dynamic load P = X·Fr + Y·Fa uses the catalogue's own
          factor method: deep groove ball's e and Y vary with f0·Fa/C0 (SKF table 9, Normal clearance);
          angular contact uses the 25°/40° contact-angle factor set; spherical roller uses the double-row
          form (P = Fr + Y1·Fa below e); cylindrical and needle roller carry no axial load (P = Fr, and any
          entered axial load is flagged as unsupported); thrust ball carries axial load only (P = Fa). Where
          a family's e/Y vary per designation (tapered and spherical roller), a representative mainstream-
          series value is used, noted alongside the result. An optional duty/shock factor (1.0-2.5×) inflates
          the equivalent load before sizing, and the ISO 281:2007 reliability factor a1 (90-99%) adjusts the
          achieved life. Static adequacy is checked via s0 = C0 / P0 against a target that scales up for
          roller (line-contact) bearings. Lubrication guidance compares the speed factor n·dm against a
          representative grease/oil limit for the family and the catalogue limiting speed, plus the housing
          temperature against typical grease/seal service limits; the relubrication interval and viscosity
          band are rule-of-thumb estimates, not a substitute for the manufacturer's full lubrication-
          selection procedure. The shaft/housing temperature difference drives a qualitative internal-
          clearance advisory, not a quantitative clearance calculation. Plain bushes are sized by the
          pressure-velocity (PV) method against representative material limits, not a fatigue life. Bearing
          dimensions and ratings are ISO-standardised and stable across catalogue editions, but confirm the
          final designation against the current manufacturer datasheet, and have the complete arrangement
          (mounting, fits, internal clearance class, seals) reviewed before production use.
        </p>
        <p className="note">
          <b>Validated:</b> deep groove ball, shaft diameter 25 mm, radial load 2,000 N, axial load 0 N, speed
          1,500 rpm, target life 4,000 h at 90% reliability, steady duty, normal static duty (all other
          defaults) returns the real catalogue bearing <b>6205</b> — SKF-published C = 14.8 kN, C0 = 7.8 kN,
          d 25 / D 52 / B 15 mm. By hand: since Fa = 0, X = 1 and Y = 0, so P = Fr = 2,000 N. L10 =
          (14,800/2,000)³ = 405.2 million revolutions, so L10h = 10⁶ × 405.2 / (60 × 1,500) = 4,502 h —
          above the 4,000 h target. Static side: P0 = max(0.6×2,000, 2,000) = 2,000 N, required C0 =
          1.5 × 2,000 = 3,000 N against the catalogue C0 of 7,800 N (s0 = 3.9). This calculator returns
          exactly these figures, and the 6205 dimensions and ratings match the SKF catalogue product table
          entry directly.
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
