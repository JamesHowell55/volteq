import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_FORCE, UNIT_TEMP } from '../lib/globalUnits';
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
import ShaftBearingSystemDiagram from '../components/ShaftBearingSystemDiagram';
import { BEARING_TYPE_LIST, DUTY_FACTORS, STATIC_SAFETY_TARGET, LIFE_PRESETS, RELIABILITY_A1, LUBRICATION_METHODS, type BearingTypeId, type LubricationMethod } from '../lib/bearingData';
import { type ContactAngleOption, type BearingCandidateResult } from '../lib/bearingPhysics';
import { solveSystem, type SystemInput, type SystemLoad, type Arrangement } from '../lib/shaftBearingSystem';

function fmt(n: number, d = 2): string { return !isFinite(n) ? '∞' : n.toLocaleString(undefined, { maximumFractionDigits: d }); }
function uid(): string { return Math.random().toString(36).slice(2, 9); }
type US = ReturnType<typeof useUnitSystem>['unitSystem'];
const lenU = (mm: number, us: US, d = 1) => fmt(toDisplay(mm, us, UNIT_LENGTH), us === 'imperial' ? d + 1 : d);

export default function ShaftBearingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenL = unitLabel(unitSystem, UNIT_LENGTH);
  const forceL = unitLabel(unitSystem, UNIT_FORCE);
  const tempL = unitLabel(unitSystem, UNIT_TEMP);

  const [bearingAPosMm, setBearingAPosMm] = useState(0);
  const [bearingBPosMm, setBearingBPosMm] = useState(200);
  const [shaftDiaAMm, setShaftDiaAMm] = useState(30);
  const [shaftDiaBMm, setShaftDiaBMm] = useState(30);
  const [loads, setLoads] = useState<SystemLoad[]>([{ id: uid(), label: 'Gear', positionMm: 100, radialN: 4000, angleDeg: 0, axialN: 1200 }]);
  const [arrangement, setArrangement] = useState<Arrangement>('fixed-floating');
  const [locatingBearing, setLocatingBearing] = useState<'A' | 'B'>('A');
  const [bearingTypeA, setBearingTypeA] = useState<BearingTypeId>('deep-groove-ball');
  const [bearingTypeB, setBearingTypeB] = useState<BearingTypeId>('cylindrical-roller');
  const [contactAngleDeg, setContactAngleDeg] = useState<ContactAngleOption>(40);
  const [speedRpm, setSpeedRpm] = useState(1500);
  const [targetL10Hours, setTargetL10Hours] = useState(20000);
  const [reliabilityPct, setReliabilityPct] = useState(90);
  const [dutyFactorId, setDutyFactorId] = useState<'steady' | 'light-shock' | 'heavy-shock'>('light-shock');
  const [staticDutyId, setStaticDutyId] = useState<'low' | 'normal' | 'heavy'>('normal');
  const [lubricationMethod, setLubricationMethod] = useState<LubricationMethod>('grease');
  const [housingTempC, setHousingTempC] = useState(60);
  const [shaftTempC, setShaftTempC] = useState(75);
  const [shaftCteUm, setShaftCteUm] = useState(12);
  const [thermalRefTempC, setThermalRefTempC] = useState(20);

  const { isPremium, loading: entitlementLoading } = useEntitlement();
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    if (arrangement !== 'fixed-floating') setArrangement('fixed-floating');
  }, [isPremium, entitlementLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // The induced-axial method only applies to opposed angular-contact / tapered
  // pairs — coerce both bearings to a thrust-capable type when one is selected.
  useEffect(() => {
    if (arrangement === 'fixed-floating') return;
    const opposedOk: BearingTypeId[] = ['angular-contact-ball', 'tapered-roller'];
    if (!opposedOk.includes(bearingTypeA)) setBearingTypeA('angular-contact-ball');
    if (!opposedOk.includes(bearingTypeB)) setBearingTypeB('angular-contact-ball');
  }, [arrangement]); // eslint-disable-line react-hooks/exhaustive-deps

  const input: SystemInput = useMemo(() => ({
    bearingAPosMm, bearingBPosMm, shaftDiaAMm, shaftDiaBMm, loads,
    spanMm: bearingBPosMm - bearingAPosMm, arrangement: isPremium ? arrangement : 'fixed-floating', locatingBearing,
    bearingTypeA, bearingTypeB, contactAngleDeg, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId,
    lubricationMethod, housingTempC, shaftTempC, shaftCtePerC: shaftCteUm * 1e-6, thermalRefTempC,
  }), [bearingAPosMm, bearingBPosMm, shaftDiaAMm, shaftDiaBMm, loads, arrangement, isPremium, locatingBearing, bearingTypeA, bearingTypeB, contactAngleDeg, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId, lubricationMethod, housingTempC, shaftTempC, shaftCteUm, thermalRefTempC]);

  const result = useMemo(() => solveSystem(input), [input]);
  const systemPass = result.systemL10Hours >= targetL10Hours;

  const patchLoad = (id: string, k: keyof SystemLoad, v: number | string) => setLoads((s) => s.map((x) => x.id === id ? { ...x, [k]: v } : x));

  const getInputs = useCallback((): Record<string, unknown> => ({
    bearingAPosMm, bearingBPosMm, shaftDiaAMm, shaftDiaBMm, loads, arrangement, locatingBearing, bearingTypeA, bearingTypeB,
    contactAngleDeg, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId, lubricationMethod, housingTempC, shaftTempC, shaftCteUm, thermalRefTempC,
  }), [bearingAPosMm, bearingBPosMm, shaftDiaAMm, shaftDiaBMm, loads, arrangement, locatingBearing, bearingTypeA, bearingTypeB, contactAngleDeg, speedRpm, targetL10Hours, reliabilityPct, dutyFactorId, staticDutyId, lubricationMethod, housingTempC, shaftTempC, shaftCteUm, thermalRefTempC]);
  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.bearingAPosMm != null) setBearingAPosMm(v.bearingAPosMm);
    if (v.bearingBPosMm != null) setBearingBPosMm(v.bearingBPosMm);
    if (v.shaftDiaAMm != null) setShaftDiaAMm(v.shaftDiaAMm);
    if (v.shaftDiaBMm != null) setShaftDiaBMm(v.shaftDiaBMm);
    if (Array.isArray(v.loads)) setLoads(v.loads);
    if (v.arrangement) setArrangement(v.arrangement);
    if (v.locatingBearing) setLocatingBearing(v.locatingBearing);
    if (v.bearingTypeA) setBearingTypeA(v.bearingTypeA);
    if (v.bearingTypeB) setBearingTypeB(v.bearingTypeB);
    if (v.contactAngleDeg) setContactAngleDeg(v.contactAngleDeg);
    if (v.speedRpm != null) setSpeedRpm(v.speedRpm);
    if (v.targetL10Hours != null) setTargetL10Hours(v.targetL10Hours);
    if (v.reliabilityPct != null) setReliabilityPct(v.reliabilityPct);
    if (v.dutyFactorId) setDutyFactorId(v.dutyFactorId);
    if (v.staticDutyId) setStaticDutyId(v.staticDutyId);
    if (v.lubricationMethod) setLubricationMethod(v.lubricationMethod);
    if (v.housingTempC != null) setHousingTempC(v.housingTempC);
    if (v.shaftTempC != null) setShaftTempC(v.shaftTempC);
    if (v.shaftCteUm != null) setShaftCteUm(v.shaftCteUm);
    if (v.thermalRefTempC != null) setThermalRefTempC(v.thermalRefTempC);
  }, []);
  const saved = useSavedCalculations('shaft-bearing-system');
  const shareLink = useShareableLink(restoreInputs);

  const bearingCard = (lbl: 'A' | 'B', r: BearingCandidateResult, ax: { radialN: number; axialN: number; inducedN: number }) => (
    <div className="result-tile" style={{ gridColumn: 'span 2' }}>
      <div className="label">Bearing {lbl} — {r.entry.designation}</div>
      <div className="value" style={{ fontSize: '1.05rem' }}>{fmt(r.achievedL10hAdjusted, 0)}<span className="unit">h L10</span></div>
      <div className="hint">
        d{fmt(r.entry.boreMm, 0)}×D{fmt(r.entry.odMm, 0)}×B{fmt(r.entry.widthMm, 1)} · C {fmt(r.entry.dynamicN / 1000, 1)} kN · Fr {fmt(ax.radialN, 0)} / Fa {fmt(ax.axialN, 0)} N{ax.inducedN > 0 ? ` (induced ${fmt(ax.inducedN, 0)})` : ''} · P {fmt(r.equivalentLoad.P_N, 0)} N · {r.overallPass ? 'meets target' : 'below target'}
      </div>
    </div>
  );

  const calcSteps: CalcStepData[] = useMemo(() => [
    { title: 'Bearing reactions (two-plane statics)', formula: 'ΣF = 0, ΣM_A = 0 per plane; R = √(R_y² + R_z²)', substitution: `loads resolved into vertical/horizontal planes`, result: `R_A = ${fmt(result.reactionAN, 0)} N, R_B = ${fmt(result.reactionBN, 0)} N` },
    { title: 'Axial (thrust) distribution', formula: arrangement === 'fixed-floating' ? 'Fixed–floating: locating bearing takes all Ka; the other floats' : 'Opposed pair: induced Ja = 0.5·Fr/Y, distributed per SKF table 11', substitution: `external thrust Ka = ${fmt(result.externalThrustN, 0)} N — ${result.loadCase}`, result: `Fa_A = ${fmt(result.axialA.axialN, 0)} N, Fa_B = ${fmt(result.axialB.axialN, 0)} N` },
    { title: 'Per-bearing rating life (ISO 281)', formula: 'L10 = (C/P)^p, L10h = 10⁶·L10/(60n), adjusted by a1', substitution: `${result.bearingA.entry.designation} & ${result.bearingB.entry.designation} at ${fmt(speedRpm, 0)} rpm, ${reliabilityPct}% reliability`, result: `L10_A = ${fmt(result.bearingA.achievedL10hAdjusted, 0)} h, L10_B = ${fmt(result.bearingB.achievedL10hAdjusted, 0)} h` },
    { title: 'System rating life (bearings in series)', formula: 'L_sys = (L_A^−e + L_B^−e)^(−1/e), e = 1.5', substitution: `L_A = ${fmt(result.bearingA.achievedL10hAdjusted, 0)}, L_B = ${fmt(result.bearingB.achievedL10hAdjusted, 0)} h`, result: `L_system = ${fmt(result.systemL10Hours, 0)} h` },
  ], [result, arrangement, speedRpm, reliabilityPct]);

  const handleExportPdf = () => {
    const inputSections: ReportSection[] = [
      { heading: 'Layout', rows: [
        { label: 'Bearings A / B', value: `${fmt(bearingAPosMm, 0)} / ${fmt(bearingBPosMm, 0)} mm (span ${fmt(bearingBPosMm - bearingAPosMm, 0)} mm)` },
        { label: 'Shaft Ø at A / B', value: `${fmt(shaftDiaAMm, 1)} / ${fmt(shaftDiaBMm, 1)} mm` },
        { label: 'Arrangement', value: `${arrangement}${arrangement === 'fixed-floating' ? ` (locating ${locatingBearing})` : ` (${contactAngleDeg}°)`}` },
      ] },
      { heading: 'Loads', rows: loads.map((l) => ({ label: l.label || 'Load', value: `${fmt(l.radialN, 0)} N radial @ ${fmt(l.angleDeg, 0)}°, ${fmt(l.axialN, 0)} N axial, at ${fmt(l.positionMm, 0)} mm` })) },
      { heading: 'Duty', rows: [
        { label: 'Speed / target L10', value: `${fmt(speedRpm, 0)} rpm / ${fmt(targetL10Hours, 0)} h at ${reliabilityPct}%` },
        { label: 'Duty / lubrication', value: `${DUTY_FACTORS.find((d) => d.id === dutyFactorId)?.label} / ${LUBRICATION_METHODS.find((m) => m.id === lubricationMethod)?.label}` },
      ] },
    ];
    const outputSections: ReportSection[] = [{ heading: 'Results', rows: [
      { label: 'Reactions A / B', value: `${fmt(result.reactionAN, 0)} / ${fmt(result.reactionBN, 0)} N` },
      { label: 'Thrust distribution', value: `Fa_A ${fmt(result.axialA.axialN, 0)} N, Fa_B ${fmt(result.axialB.axialN, 0)} N (${result.loadCase})` },
      { label: 'Bearing A', value: `${result.bearingA.entry.designation}, L10 ${fmt(result.bearingA.achievedL10hAdjusted, 0)} h` },
      { label: 'Bearing B', value: `${result.bearingB.entry.designation}, L10 ${fmt(result.bearingB.achievedL10hAdjusted, 0)} h` },
      { label: 'System L10', value: `${fmt(result.systemL10Hours, 0)} h` },
      { label: 'Thermal axial growth', value: `${fmt(result.thermalGrowthMm, 3)} mm` },
    ] }];
    exportReportToPdf({
      tabName: 'Shaft_Bearing_System', pageTitle: 'Shaft + Bearing System Calculator', accentHex,
      passStatus: { pass: systemPass, label: systemPass ? `System L10 ${fmt(result.systemL10Hours, 0)} h ≥ target ${fmt(targetL10Hours, 0)} h` : `System L10 ${fmt(result.systemL10Hours, 0)} h below target ${fmt(targetL10Hours, 0)} h` },
      inputSections, outputSections, calculationSteps: calcSteps,
      disclaimer: 'Engineering sizing/guidance tool for a shaft supported on two rolling bearings. Bearing reactions come from two-plane statics on two simple supports; the external thrust is routed to the locating bearing (fixed–floating) or distributed between an opposed angular-contact/tapered pair by the induced-axial method (Ja = 0.5·Fr/Y, SKF General Catalogue table 11 load cases). Each bearing is then selected from the SKF catalogue and rated by ISO 281 (see the Bearing Calculator), and the two are combined into a system rating life L = (L_A^−e + L_B^−e)^(−1/e) with the ISO 281 Weibull slope e = 1.5. The induced-axial factor uses R = 0.5/Y with the bearing family Y; SKF refines R (0.8–1.0) via a Ka/C diagram for angular-contact ball bearings. Thermal axial growth is α·L·ΔT for the span. Not modelled: bearing/housing stiffness, preload, mounting fits, moment loads on the pair, and full thermal-preload interaction. Confirm the final arrangement, fits, clearance/preload and thrust path against the manufacturer procedure before production.',
      ...branding,
    });
  };

  const dutyFactor = DUTY_FACTORS.find((d) => d.id === dutyFactorId)!;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Shaft + Bearing System Calculator</div>
          <h1>Shaft + Bearing System Calculator</h1>
          <p>
            Size a front/rear bearing pair for a supported shaft in one pass — resolve the bearing reactions
            and route the thrust (fixed–floating, or an opposed angular-contact pair with induced axial loads),
            rate each bearing to ISO 281, and combine them into a system rating life.
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
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Layout
              <InfoTooltip>Positions along the shaft (bearing A is the datum). The shaft diameter at each bearing sets the bore the bearing is selected for.</InfoTooltip>
            </span></div>
            <div className="grid grid-2">
              <div className="field"><label>Bearing A position ({lenL})</label><input type="number" value={toDisplay(bearingAPosMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBearingAPosMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
              <div className="field"><label>Bearing B position ({lenL})</label><input type="number" value={toDisplay(bearingBPosMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBearingBPosMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
              <div className="field"><label>Shaft Ø at A ({lenL})</label><input type="number" min={1} value={toDisplay(shaftDiaAMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setShaftDiaAMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
              <div className="field"><label>Shaft Ø at B ({lenL})</label><input type="number" min={1} value={toDisplay(shaftDiaBMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setShaftDiaBMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Loads
              <InfoTooltip>Radial forces (gears/pulleys/belt) with a plane angle, plus an axial thrust component along the shaft (positive toward bearing B). Position measured from bearing A.</InfoTooltip>
            </span></div>
            {loads.map((l) => (
              <div key={l.id} className="grid" style={{ gridTemplateColumns: '1.1fr 1fr 0.9fr 0.8fr 1fr auto', gap: '0.35rem', alignItems: 'end', marginBottom: '0.4rem' }}>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>label</label><input value={l.label} onChange={(e) => patchLoad(l.id, 'label', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>radial ({forceL})</label><input type="number" min={0} value={toDisplay(l.radialN, unitSystem, UNIT_FORCE)} onChange={(e) => patchLoad(l.id, 'radialN', fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>angle°</label><input type="number" value={l.angleDeg} onChange={(e) => patchLoad(l.id, 'angleDeg', Number(e.target.value))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>axial ({forceL})</label><input type="number" value={toDisplay(l.axialN, unitSystem, UNIT_FORCE)} onChange={(e) => patchLoad(l.id, 'axialN', fromDisplay(Number(e.target.value), unitSystem, UNIT_FORCE))} /></div>
                <div className="field" style={{ margin: 0 }}><label style={{ fontSize: '0.7rem' }}>pos ({lenL})</label><input type="number" value={toDisplay(l.positionMm, unitSystem, UNIT_LENGTH)} onChange={(e) => patchLoad(l.id, 'positionMm', fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <button className="btn small" onClick={() => setLoads((s) => s.filter((x) => x.id !== l.id))}>✕</button>
              </div>
            ))}
            <button className="btn small" onClick={() => setLoads((s) => [...s, { id: uid(), label: 'Load', positionMm: Math.round((bearingAPosMm + bearingBPosMm) / 2), radialN: 1000, angleDeg: 0, axialN: 0 }])}>+ Add load</button>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Bearings &amp; arrangement
              <InfoTooltip>Fixed–floating: one bearing locates the shaft axially (takes all thrust), the other floats to absorb thermal growth. An opposed angular-contact/tapered pair (back-to-back O or face-to-face X) shares the thrust and generates induced axial loads.</InfoTooltip>
            </span></div>
            <div className="field">
              <label>Arrangement</label>
              <div className="segmented">
                <button className={arrangement === 'fixed-floating' ? 'active' : ''} onClick={() => setArrangement('fixed-floating')}>Fixed–floating</button>
                {isPremium ? (
                  <>
                    <button className={arrangement === 'back-to-back' ? 'active' : ''} onClick={() => setArrangement('back-to-back')}>Back-to-back (O)</button>
                    <button className={arrangement === 'face-to-face' ? 'active' : ''} onClick={() => setArrangement('face-to-face')}>Face-to-face (X)</button>
                  </>
                ) : null}
              </div>
              {!isPremium && <PremiumGate feature="Opposed angular-contact pair (back-to-back / face-to-face) with induced axial loads"><span /></PremiumGate>}
            </div>
            {arrangement === 'fixed-floating' ? (
              <div className="field">
                <label>Locating (fixed) bearing</label>
                <div className="segmented">
                  <button className={locatingBearing === 'A' ? 'active' : ''} onClick={() => setLocatingBearing('A')}>A</button>
                  <button className={locatingBearing === 'B' ? 'active' : ''} onClick={() => setLocatingBearing('B')}>B</button>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Contact angle</label>
                <div className="segmented">
                  <button className={contactAngleDeg === 25 ? 'active' : ''} onClick={() => setContactAngleDeg(25)}>25°</button>
                  <button className={contactAngleDeg === 40 ? 'active' : ''} onClick={() => setContactAngleDeg(40)}>40°</button>
                </div>
              </div>
            )}
            <div className="grid grid-2">
              <div className="field"><label>Bearing A type</label><select value={bearingTypeA} onChange={(e) => setBearingTypeA(e.target.value as BearingTypeId)}>{BEARING_TYPE_LIST.filter((t) => t.hasCatalogue).map((t) => <option key={t.id} value={t.id}>{t.shortLabel}</option>)}</select></div>
              <div className="field"><label>Bearing B type</label><select value={bearingTypeB} onChange={(e) => setBearingTypeB(e.target.value as BearingTypeId)}>{BEARING_TYPE_LIST.filter((t) => t.hasCatalogue).map((t) => <option key={t.id} value={t.id}>{t.shortLabel}</option>)}</select></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Duty &amp; life</span></div>
            <div className="grid grid-2">
              <div className="field"><label>Speed (rpm)</label><input type="number" min={0} value={speedRpm} onChange={(e) => setSpeedRpm(Number(e.target.value))} /></div>
              <div className="field"><label>Target L10 (h)</label><input type="number" min={1} value={targetL10Hours} onChange={(e) => setTargetL10Hours(Number(e.target.value))} /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {LIFE_PRESETS.map((p) => <button key={p.id} className="btn small" title={p.hint} onClick={() => setTargetL10Hours(p.hours)}>{p.label}</button>)}
            </div>
            <div className="grid grid-2">
              <div className="field"><label>Reliability</label><select value={reliabilityPct} onChange={(e) => setReliabilityPct(Number(e.target.value))}>{RELIABILITY_A1.map((r) => <option key={r.reliabilityPct} value={r.reliabilityPct}>{r.reliabilityPct}%</option>)}</select></div>
              <div className="field"><label>Duty / shock</label><select value={dutyFactorId} onChange={(e) => setDutyFactorId(e.target.value as typeof dutyFactorId)}>{DUTY_FACTORS.map((d) => <option key={d.id} value={d.id}>{d.label} (×{d.factor})</option>)}</select></div>
              <div className="field"><label>Static duty</label><select value={staticDutyId} onChange={(e) => setStaticDutyId(e.target.value as typeof staticDutyId)}>{STATIC_SAFETY_TARGET.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
              <div className="field"><label>Lubrication</label><select value={lubricationMethod} onChange={(e) => setLubricationMethod(e.target.value as LubricationMethod)}>{LUBRICATION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
              <div className="field"><label>Housing temp ({tempL})</label><input type="number" value={toDisplay(housingTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setHousingTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} /></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span>Thermal (differential expansion)
              <InfoTooltip>The shaft grows axially between the bearings as it heats — the floating bearing must accommodate it. A shaft running hotter than the housing also loses internal radial clearance.</InfoTooltip>
            </span></div>
            <PremiumGate feature="Thermal axial-growth & clearance analysis">
              <div className="grid grid-2">
                <div className="field"><label>Shaft temp ({tempL})</label><input type="number" value={toDisplay(shaftTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setShaftTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} /></div>
                <div className="field"><label>Assembly temp ({tempL})</label><input type="number" value={toDisplay(thermalRefTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setThermalRefTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} /></div>
                <div className="field"><label>Shaft CTE (×10⁻⁶/°C)</label><input type="number" step={0.5} value={shaftCteUm} onChange={(e) => setShaftCteUm(Number(e.target.value))} /></div>
              </div>
            </PremiumGate>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">System result</div>
            {result.warnings.map((w, i) => <p key={i} className="note" style={{ color: 'var(--warn)' }}>⚠ {w}</p>)}
            <div className={`status-banner ${systemPass ? 'pass' : 'fail'}`}>
              {systemPass ? `✓ System L10 ${fmt(result.systemL10Hours, 0)} h ≥ target ${fmt(targetL10Hours, 0)} h` : `✗ System L10 ${fmt(result.systemL10Hours, 0)} h below target ${fmt(targetL10Hours, 0)} h`}
            </div>
            <div className="result-grid">
              <div className="result-tile"><div className="label">System L10 life</div><div className={`value ${systemPass ? 'pos' : 'neg'}`}>{fmt(result.systemL10Hours, 0)}<span className="unit">h</span></div><div className="hint">two bearings in series (e=1.5)</div></div>
              <div className="result-tile"><div className="label">Reactions A / B</div><div className="value" style={{ fontSize: '1.1rem' }}>{fmt(result.reactionAN, 0)}/{fmt(result.reactionBN, 0)}<span className="unit">{forceL}</span></div><div className="hint">external thrust {fmt(result.externalThrustN, 0)} N</div></div>
              {bearingCard('A', result.bearingA, result.axialA)}
              {bearingCard('B', result.bearingB, result.axialB)}
            </div>
            <p className="hint" style={{ marginTop: '0.5rem' }}>Thrust distribution: {result.loadCase}. {result.systemReliabilityNote}</p>
          </div>

          <div className="card">
            <div className="card-title">Arrangement</div>
            <ShaftBearingSystemDiagram bearingAPosMm={bearingAPosMm} bearingBPosMm={bearingBPosMm} loads={loads} arrangement={input.arrangement} locatingBearing={locatingBearing} designationA={result.bearingA.entry.designation} designationB={result.bearingB.entry.designation} reactionAN={result.reactionAN} reactionBN={result.reactionBN} externalThrustN={result.externalThrustN} unitSystem={unitSystem} />
          </div>

          <div className="card">
            <div className="card-title"><span>Thermal &amp; clearance
              <InfoTooltip>Axial growth the floating bearing must accommodate, and a differential-expansion clearance advisory.</InfoTooltip>
            </span></div>
            <PremiumGate feature="Thermal axial-growth & clearance analysis">
              <div className="result-grid">
                <div className="result-tile"><div className="label">Axial growth (span)</div><div className="value">{lenU(result.thermalGrowthMm, unitSystem, 3)}<span className="unit">{lenL}</span></div><div className="hint">α·L·ΔT over {fmt(shaftTempC - thermalRefTempC, 0)}°C rise</div></div>
              </div>
              {result.thrustAdvisory && <p className="note" style={{ color: 'var(--warn)' }}>⚠ {result.thrustAdvisory}</p>}
              {result.clearanceAdvisory && <p className="note" style={{ color: 'var(--warn)' }}>⚠ {result.clearanceAdvisory}</p>}
              {!result.thrustAdvisory && !result.clearanceAdvisory && <p className="hint">No significant differential-expansion concern at these temperatures.</p>}
            </PremiumGate>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/shaft-bearing-system" />
        <p className="note">
          This calculator composes the shaft statics with ISO 281 bearing selection. Radial reactions at the
          two bearings are resolved independently in the vertical and horizontal planes and combined; the
          external axial thrust is either taken entirely by the locating bearing (<b>fixed–floating</b>) or
          distributed between an <b>opposed angular-contact / tapered-roller pair</b> using the induced-axial
          method — each bearing generates an internal axial load Ja = 0.5·Fr/Y, and the external thrust Ka is
          apportioned per the SKF General Catalogue table 11 load cases (back-to-back "O" or face-to-face
          "X"). Each bearing is then selected from the real SKF catalogue and rated by ISO 281 exactly as in
          the <b>Bearing Calculator</b> (dynamic equivalent load P = X·Fr + Y·Fa, L10 = (C/P)^p, reliability
          factor a1). The two lives are combined into a system rating life for bearings in series,
          L = (L_A^−e + L_B^−e)^(−1/e), with the ISO 281 Weibull slope e = 1.5. The induced-axial factor uses
          R = 0.5/Y with the bearing-family Y; SKF refines R (≈0.8–1.0) via a Ka/C diagram for its
          angular-contact ball series. Thermal axial growth across the span is α·L·ΔT. Not modelled: bearing
          and housing stiffness, mounting fits, preload and its thermal interaction, and moment loads shared
          by a paired set — confirm the arrangement, fits and clearance/preload against the manufacturer's
          procedure before production.
        </p>
        <p className="note">
          <b>Validated:</b> for two 40° angular contact ball bearings back-to-back with FrA = 1 000 N,
          FrB = 3 000 N and an external thrust Ka = 1 000 N (Y = 0.57, so R = 0.877), this tool returns the
          SKF table 11 case 1c distribution Fa_A = 1 632 N, Fa_B = 2 632 N; the case 1a distribution
          (FrA = 3 000, FrB = 1 000) returns Fa_A = 2 632 N, Fa_B = 3 632 N; and two equal-life bearings
          combine to a system life of 0.63× the individual life, matching L·2^(−1/1.5).
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
      <p className="hint" style={{ marginTop: '0.5rem' }}>Duty factor ×{dutyFactor.factor} applied to the equivalent load before rating.</p>
    </div>
  );
}
