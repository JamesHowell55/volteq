import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_TEMP, UNIT_LENGTH, UNIT_AREA } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { MATERIALS, EMISSIVITY_PRESETS, TIM_PRESETS } from '../lib/materials';
import {
  solveRthBudget, timResistanceKPerW, solveFinArrayNaturalConvection,
  type FinArrayResult,
} from '../lib/heatsinkThermalPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type SinkMode = 'direct' | 'geometry';
type FinMaterialId = 'aluminium' | 'copper' | 'custom';

export default function HeatsinkThermalCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();

  // Thermal budget (always free)
  const [pLossW, setPLossW] = useState(20);
  const [tjMaxC, setTjMaxC] = useState(150);
  const [ambientTempC, setAmbientTempC] = useState(40);
  const [rthJcKPerW, setRthJcKPerW] = useState(0.5);

  // Case-to-sink TIM (preset -> editable copy, same idiom as BusbarCalculator's conduction cooling)
  const [timPresetId, setTimPresetId] = useState('pad');
  const [timThicknessMm, setTimThicknessMm] = useState(TIM_PRESETS[0].thicknessMm);
  const [timConductivity, setTimConductivity] = useState(TIM_PRESETS[0].thermalConductivity);
  const onTimPresetChange = (id: string) => {
    setTimPresetId(id);
    const preset = TIM_PRESETS.find((p) => p.id === id);
    if (preset) {
      setTimThicknessMm(preset.thicknessMm);
      setTimConductivity(preset.thermalConductivity);
    }
  };
  const [contactAreaMm2, setContactAreaMm2] = useState(400);

  // Sink Rth: direct entry (free) or fin-array geometry sizing (premium)
  const [mode, setMode] = useState<SinkMode>('direct');
  const [actualRthSaKPerW, setActualRthSaKPerW] = useState(1.5);

  const [finHeightMm, setFinHeightMm] = useState(30);
  const [finThicknessMm, setFinThicknessMm] = useState(2);
  const [finSpacingMm, setFinSpacingMm] = useState(8);
  const [finCountN, setFinCountN] = useState(10);
  const [finDepthMm, setFinDepthMm] = useState(100);
  const [finMaterialId, setFinMaterialId] = useState<FinMaterialId>('aluminium');
  const [customFinConductivity, setCustomFinConductivity] = useState(230);
  const finThermalConductivityWPerMK = finMaterialId === 'custom' ? customFinConductivity : MATERIALS[finMaterialId].thermalConductivity;
  const [emissivity, setEmissivity] = useState(0.9);

  const getInputs = useCallback((): Record<string, unknown> => ({
    pLossW, tjMaxC, ambientTempC, rthJcKPerW,
    timPresetId, timThicknessMm, timConductivity, contactAreaMm2,
    mode, actualRthSaKPerW,
    finHeightMm, finThicknessMm, finSpacingMm, finCountN, finDepthMm,
    finMaterialId, customFinConductivity, emissivity,
  }), [pLossW, tjMaxC, ambientTempC, rthJcKPerW, timPresetId, timThicknessMm, timConductivity, contactAreaMm2,
    mode, actualRthSaKPerW, finHeightMm, finThicknessMm, finSpacingMm, finCountN, finDepthMm,
    finMaterialId, customFinConductivity, emissivity]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.pLossW != null) setPLossW(v.pLossW);
    if (v.tjMaxC != null) setTjMaxC(v.tjMaxC);
    if (v.ambientTempC != null) setAmbientTempC(v.ambientTempC);
    if (v.rthJcKPerW != null) setRthJcKPerW(v.rthJcKPerW);
    if (v.timPresetId != null) setTimPresetId(v.timPresetId);
    if (v.timThicknessMm != null) setTimThicknessMm(v.timThicknessMm);
    if (v.timConductivity != null) setTimConductivity(v.timConductivity);
    if (v.contactAreaMm2 != null) setContactAreaMm2(v.contactAreaMm2);
    if (v.mode != null) setMode(v.mode);
    if (v.actualRthSaKPerW != null) setActualRthSaKPerW(v.actualRthSaKPerW);
    if (v.finHeightMm != null) setFinHeightMm(v.finHeightMm);
    if (v.finThicknessMm != null) setFinThicknessMm(v.finThicknessMm);
    if (v.finSpacingMm != null) setFinSpacingMm(v.finSpacingMm);
    if (v.finCountN != null) setFinCountN(v.finCountN);
    if (v.finDepthMm != null) setFinDepthMm(v.finDepthMm);
    if (v.finMaterialId != null) setFinMaterialId(v.finMaterialId);
    if (v.customFinConductivity != null) setCustomFinConductivity(v.customFinConductivity);
    if (v.emissivity != null) setEmissivity(v.emissivity);
  }, []);

  const saved = useSavedCalculations('heatsink-thermal');
  const shareLink = useShareableLink(restoreInputs);

  // Safety net: bail out of fin-array geometry mode if entitlement lapses mid-session,
  // or a `?share=` link / old save carries a premium user's mode (mirrors the same
  // guard on MosfetLossCalculator's duty-cycle-profile mode).
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setMode((prev) => (prev === 'geometry' ? 'direct' : prev));
  }, [isPremium, entitlementLoading]);

  const rthCsKPerW = useMemo(
    () => timResistanceKPerW({ id: timPresetId, label: '', thicknessMm: timThicknessMm, thermalConductivity: timConductivity }, contactAreaMm2),
    [timPresetId, timThicknessMm, timConductivity, contactAreaMm2],
  );

  const finArray: FinArrayResult | null = useMemo(() => {
    if (mode !== 'geometry') return null;
    return solveFinArrayNaturalConvection({
      finHeightMm, finThicknessMm, finSpacingMm, finCountN, finDepthMm,
      finThermalConductivityWPerMK, emissivity, ambientTempC, pLossW,
    });
  }, [mode, finHeightMm, finThicknessMm, finSpacingMm, finCountN, finDepthMm, finThermalConductivityWPerMK, emissivity, ambientTempC, pLossW]);

  const actualRsaForBudget = mode === 'geometry' ? (finArray?.rthSaKPerW ?? 0) : actualRthSaKPerW;

  const budget = useMemo(() => solveRthBudget({
    pLossW, tjMaxC, ambientTempC, rthJcKPerW, rthCsKPerW, actualRthSaKPerW: actualRsaForBudget,
  }), [pLossW, tjMaxC, ambientTempC, rthJcKPerW, rthCsKPerW, actualRsaForBudget]);

  const hasCheck = budget.pass !== null;
  const overallPass = budget.pass ?? true;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    if (contactAreaMm2 > 0) {
      steps.push({
        title: 'Case-to-sink (TIM) resistance',
        formula: 'Rcs = t / (k · A)',
        substitution: `t = ${fmt(timThicknessMm, 3)} mm, k = ${fmt(timConductivity, 2)} W/m·K, A = ${fmt(contactAreaMm2, 1)} mm²`,
        result: `Rcs = ${fmt(rthCsKPerW, 4)} K/W`,
      });
    }
    steps.push({
      title: 'Junction-to-ambient thermal budget',
      formula: 'Rth(total, allowed) = (Tj_max − Ta) / P;  Rsa(required) = Rth(total) − Rjc − Rcs',
      substitution: `Tj_max = ${fmt(tjMaxC, 0)}°C, Ta = ${fmt(ambientTempC, 0)}°C, P = ${fmt(pLossW, 1)} W, Rjc = ${fmt(rthJcKPerW, 3)} K/W, Rcs = ${fmt(rthCsKPerW, 4)} K/W`,
      result: `Rsa(required) ≤ ${fmt(budget.requiredRthSaKPerW, 4)} K/W (total budget ${fmt(budget.totalRthAllowedKPerW, 4)} K/W)`,
    });
    if (mode === 'geometry' && finArray) {
      steps.push({
        title: 'Natural convection (isolated vertical plate, Churchill-Chu)',
        formula: 'Ra_L = gβΔT·L³·Pr/ν²;  Nu_L = [0.825 + 0.387·Ra_L^(1/6) / (1+(0.492/Pr)^(9/16))^(8/27)]²;  h = Nu_L·k/L',
        substitution: `L (fin height) = ${fmt(finHeightMm, 1)} mm, base ${fmt(finArray.baseTempC, 1)}°C, ambient ${fmt(ambientTempC, 0)}°C`,
        result: `Ra = ${finArray.convection.rayleigh.toExponential(3)}, Nu = ${fmt(finArray.convection.nusselt, 2)}, h = ${fmt(finArray.convection.h, 3)} W/m²K`,
      });
      steps.push({
        title: 'Fin efficiency (adiabatic-tip-corrected rectangular fin)',
        formula: 'Lc = L + t/2;  m = √(2h / (k_fin·t));  η = tanh(m·Lc) / (m·Lc)',
        substitution: `k_fin = ${fmt(finThermalConductivityWPerMK, 0)} W/m·K, t = ${fmt(finThicknessMm, 2)} mm`,
        result: `η = ${fmt(finArray.finEfficiency, 4)}`,
      });
      steps.push({
        title: 'Effective area, base temperature and Rsa',
        formula: 'A_eff = n·η·(2·Lc·depth) + A_exposed-base;  solve baseTemp so h·A_eff·ΔT + εσ(Ts²+Ta²)(Ts+Ta)·A_eff = P;  Rsa = (baseTemp − Ta) / P',
        substitution: `n = ${finCountN} fins, depth = ${fmt(finDepthMm, 0)} mm, ε = ${fmt(emissivity, 2)}`,
        result: `A_eff = ${fmt(finArray.effectiveAreaM2 * 1e6, 0)} mm², baseTemp = ${fmt(finArray.baseTempC, 1)}°C, Rsa = ${fmt(finArray.rthSaKPerW, 4)} K/W${finArray.tightSpacingWarning ? ' (⚠ spacing < 6mm — channeling not modelled, h likely over-predicted)' : ''}`,
      });
    }
    steps.push({
      title: 'Resulting junction temperature',
      formula: 'Tj = Ta + P·(Rjc + Rcs + Rsa)',
      substitution: `Rsa used = ${fmt(actualRsaForBudget, 4)} K/W`,
      result: hasCheck
        ? `Tj = ${fmt(budget.resultingTjC!, 1)}°C vs Tj_max ${fmt(tjMaxC, 0)}°C — margin ${fmt(budget.marginC!, 1)}°C — ${budget.pass ? 'pass' : 'FAIL'}`
        : 'Enter a sink Rth (direct) or a fin geometry to check against the budget',
    });
    return steps;
  }, [contactAreaMm2, timThicknessMm, timConductivity, rthCsKPerW, tjMaxC, ambientTempC, pLossW, rthJcKPerW, budget, mode, finArray, finHeightMm, finThermalConductivityWPerMK, finThicknessMm, finCountN, finDepthMm, emissivity, actualRsaForBudget, hasCheck]);

  const inputSections: ReportSection[] = useMemo(() => {
    const budgetRows: ReportRow[] = [
      { label: 'Device power loss', value: `${fmt(pLossW, 1)} W` },
      { label: 'Junction temperature limit', value: `${fmtU(tjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Ambient temperature', value: `${fmtU(ambientTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Junction-to-case (Rjc)', value: `${fmt(rthJcKPerW, 3)} K/W` },
      { label: 'Case-to-sink (Rcs)', value: `${fmt(rthCsKPerW, 4)} K/W (${TIM_PRESETS.find((p) => p.id === timPresetId)?.label ?? 'custom'}, ${fmt(contactAreaMm2, 0)} mm²)` },
    ];
    const sinkRows: ReportRow[] = mode === 'geometry' && finArray
      ? [
        { label: 'Sizing mode', value: 'Fin-array natural convection' },
        { label: 'Fin geometry', value: `${finCountN} fins, ${fmt(finHeightMm, 0)}×${fmt(finThicknessMm, 1)}×${fmt(finDepthMm, 0)} mm (H×t×depth), ${fmt(finSpacingMm, 1)} mm spacing` },
        { label: 'Fin material / emissivity', value: `${fmt(finThermalConductivityWPerMK, 0)} W/m·K, ε=${fmt(emissivity, 2)}` },
        { label: 'Resulting Rsa', value: `${fmt(finArray.rthSaKPerW, 4)} K/W (base ${fmt(finArray.baseTempC, 1)}°C)` },
      ]
      : [{ label: 'Sink Rth (direct entry)', value: `${fmt(actualRthSaKPerW, 4)} K/W` }];
    return [
      { heading: 'Thermal budget', rows: budgetRows },
      { heading: 'Sink', rows: sinkRows },
    ];
  }, [pLossW, tjMaxC, ambientTempC, rthJcKPerW, rthCsKPerW, timPresetId, contactAreaMm2, mode, finArray, finCountN, finHeightMm, finThicknessMm, finDepthMm, finSpacingMm, finThermalConductivityWPerMK, emissivity, actualRthSaKPerW, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'Required Rsa (budget)', value: `${fmt(budget.requiredRthSaKPerW, 4)} K/W` },
      { label: 'Rsa used', value: `${fmt(actualRsaForBudget, 4)} K/W` },
      { label: 'Resulting junction temperature', value: hasCheck ? `${fmtU(budget.resultingTjC!, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` : '—' },
      { label: 'Margin', value: hasCheck ? `${fmtU(budget.marginC!, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` : '—' },
    ];
    return [{ heading: 'Results', rows }];
  }, [budget, actualRsaForBudget, hasCheck, unitSystem]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Heatsink_Thermal_Calculator',
      pageTitle: 'Heatsink / Junction-to-Ambient Thermal Calculator',
      accentHex,
      passStatus: { pass: overallPass, label: hasCheck ? (overallPass ? 'Junction temperature within limit' : 'Junction temperature exceeds limit — review') : 'No sink Rth check performed' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Rth budget check is plain series thermal-resistance algebra (Tj = Ta + P·(Rjc+Rcs+Rsa)). Fin-array sizing treats each inter-fin gap as an isolated vertical flat plate (Churchill-Chu correlation) — a disclosed simplification that ignores inter-fin channeling (the Elenbaas/Bar-Cohen effect that reduces h at very tight spacing); accurate at commonly-used fin spacing (~6mm+) and above. Fin efficiency uses the standard adiabatic-tip-corrected rectangular-fin formula. Radiation is applied over the same effective area as convection as a disclosed simplification. Screening tool for natural convection only — does not model forced-air/fan cooling.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Heatsink Thermal Calculator</div>
          <h1>Heatsink / Junction-to-Ambient Thermal Calculator</h1>
          <p>
            Pairs with the MOSFET Loss calculator — feed a device's power dissipation in, check it against
            a junction-to-ambient thermal budget, and either enter a sink's thermal resistance directly or
            size a natural-convection fin array from its geometry.
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
            <div className="card-title"><span><span className="step-num">1</span>Thermal budget</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Device power loss (W)</label>
                <input autoComplete="off" type="number" min={0} value={pLossW} onChange={(e) => setPLossW(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Junction temperature limit ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(tjMaxC, unitSystem, UNIT_TEMP)} onChange={(e) => setTjMaxC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Ambient temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(ambientTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAmbientTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>
                  Junction-to-case, Rjc (K/W)
                  <InfoTooltip>From the device datasheet — the die-to-case thermal resistance.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={rthJcKPerW} onChange={(e) => setRthJcKPerW(Number(e.target.value))} />
              </div>
            </div>

            <div className="field" style={{ marginTop: '0.5rem' }}>
              <label>Thermal interface material (case-to-sink)</label>
              <select value={timPresetId} onChange={(e) => onTimPresetChange(e.target.value)}>
                {TIM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="grid grid-3">
              <div className="field">
                <label>TIM thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0.001} step={0.01} value={toDisplay(timThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setTimThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>TIM conductivity (W/m·K)</label>
                <input autoComplete="off" type="number" min={0.01} step={0.1} value={timConductivity} onChange={(e) => setTimConductivity(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Contact area ({unitLabel(unitSystem, UNIT_AREA)})</label>
                <input autoComplete="off" type="number" min={0} step={1} value={toDisplay(contactAreaMm2, unitSystem, UNIT_AREA)} onChange={(e) => setContactAreaMm2(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA))} />
              </div>
            </div>
            <span className="hint">Rcs (computed) = {fmt(rthCsKPerW, 4)} K/W</span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Heatsink</span></div>
            <div className="segmented">
              <button className={mode === 'direct' ? 'active' : ''} onClick={() => setMode('direct')}>Enter Rsa directly</button>
              <PremiumGate feature="Fin array sizing">
                <button className={mode === 'geometry' ? 'active' : ''} onClick={() => setMode('geometry')}>Size a fin array</button>
              </PremiumGate>
            </div>

            {mode === 'direct' ? (
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label>Sink-to-ambient, Rsa (K/W)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={actualRthSaKPerW} onChange={(e) => setActualRthSaKPerW(Number(e.target.value))} />
                <span className="hint">From a heatsink datasheet, or 0 to only see the required budget.</span>
              </div>
            ) : (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="grid grid-3">
                  <div className="field">
                    <label>Fin height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(finHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFinHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Fin thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(finThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFinThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Fin spacing ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={1} step={0.5} value={toDisplay(finSpacingMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFinSpacingMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Number of fins</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={finCountN} onChange={(e) => setFinCountN(Math.max(1, Math.round(Number(e.target.value))))} />
                  </div>
                  <div className="field">
                    <label>Fin depth ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={toDisplay(finDepthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFinDepthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Surface finish (emissivity)</label>
                    <select value={emissivity} onChange={(e) => setEmissivity(Number(e.target.value))}>
                      {EMISSIVITY_PRESETS.map((p) => (
                        <option key={p.id} value={p.value}>{p.label} (ε={p.value})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Fin material</label>
                  <div className="segmented">
                    <button className={finMaterialId === 'aluminium' ? 'active' : ''} onClick={() => setFinMaterialId('aluminium')}>Aluminium</button>
                    <button className={finMaterialId === 'copper' ? 'active' : ''} onClick={() => setFinMaterialId('copper')}>Copper</button>
                    <button className={finMaterialId === 'custom' ? 'active' : ''} onClick={() => setFinMaterialId('custom')}>Custom</button>
                  </div>
                  {finMaterialId === 'custom' && (
                    <input autoComplete="off" type="number" min={1} step={1} value={customFinConductivity} onChange={(e) => setCustomFinConductivity(Number(e.target.value))} style={{ marginTop: '0.4rem' }} placeholder="W/m·K" />
                  )}
                </div>
                {finArray?.tightSpacingWarning && (
                  <span className="hint" style={{ color: 'var(--warn)', display: 'block' }}>
                    ⚠ Fin spacing below ~6mm: this model treats each gap as an isolated plate and does not
                    account for inter-fin channeling, so h is likely over-predicted at this spacing.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

            {hasCheck && (
              <div className={`status-banner ${overallPass ? 'pass' : 'fail'}`}>
                {overallPass
                  ? `✓ Tj ${fmtU(budget.resultingTjC!, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} within limit ${fmtU(tjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}`
                  : `✗ Tj ${fmtU(budget.resultingTjC!, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)} exceeds limit ${fmtU(tjMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}`}
              </div>
            )}

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Required Rsa (budget)</div>
                <div className="value">{fmt(budget.requiredRthSaKPerW, 3)}<span className="unit">K/W</span></div>
                <div className="hint">max sink Rth to hold Tj ≤ {fmtU(tjMaxC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Rsa used</div>
                <div className="value">{fmt(actualRsaForBudget, 3)}<span className="unit">K/W</span></div>
                <div className="hint">{mode === 'geometry' ? 'computed from fin geometry' : 'direct entry'}</div>
              </div>
              {hasCheck && (
                <>
                  <div className="result-tile">
                    <div className="label">Resulting junction temperature</div>
                    <div className={`value ${overallPass ? 'pos' : 'neg'}`}>{fmtU(budget.resultingTjC!, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span></div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Margin</div>
                    <div className={`value ${overallPass ? 'pos' : 'neg'}`}>{fmtU(budget.marginC!, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {mode === 'geometry' && finArray && (
            <div className="card">
              <div className="card-title">Fin array detail</div>
              <div className="result-grid">
                <div className="result-tile">
                  <div className="label">Convection coefficient</div>
                  <div className="value">{fmt(finArray.convection.h, 2)}<span className="unit">W/m²K</span></div>
                  <div className="hint">Ra={finArray.convection.rayleigh.toExponential(2)}, Nu={fmt(finArray.convection.nusselt, 2)}</div>
                </div>
                <div className="result-tile">
                  <div className="label">Fin efficiency</div>
                  <div className="value">{fmt(finArray.finEfficiency * 100, 1)}<span className="unit">%</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Base temperature</div>
                  <div className="value">{fmtU(finArray.baseTempC, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Effective area</div>
                  <div className="value">{fmt(toDisplay(finArray.effectiveAreaM2 * 1e6, unitSystem, UNIT_AREA), 0)}<span className="unit">{unitLabel(unitSystem, UNIT_AREA)}</span></div>
                  <div className="hint">footprint {fmt(toDisplay(finArray.baseWidthMm, unitSystem, UNIT_LENGTH), 1)}{unitLabel(unitSystem, UNIT_LENGTH)} wide</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/heatsink-thermal" />
        <p className="note">
          The thermal budget is plain series thermal-resistance algebra: Tj = Ta + P·(Rjc + Rcs + Rsa).
          Fin-array sizing treats each inter-fin gap as an isolated vertical flat plate (Churchill-Chu
          correlation, the vertical-plate analogue of the horizontal-cylinder correlation used elsewhere in
          this project) — a disclosed simplification that ignores inter-fin channeling (the Elenbaas/Bar-Cohen
          effect that reduces the convection coefficient at very tight spacing). It is accurate at the
          commonly-cited near-optimal spacing range (roughly 6mm and above); a warning appears below that.
          Fin efficiency uses the standard adiabatic-tip-corrected rectangular-fin formula
          (η = tanh(mLc)/mLc). Radiation is applied over the same effective area as convection, a disclosed
          simplification rather than a full per-fin view-factor treatment. Natural convection only — does not
          model forced-air/fan cooling.
        </p>
        <p className="note">
          <b>Validated:</b> the Rth-budget algebra and TIM t/(k·A) resistance were checked against hand-worked
          cases (exact match). The vertical-plate Churchill-Chu correlation's Rayleigh/Nusselt/h output was
          independently re-derived from the documented formula and matched exactly, its constants (0.825,
          0.492) confirmed distinct from the horizontal-cylinder correlation's (0.6, 0.559), and the resulting
          h checked against the well-known 2-25 W/m²K range for natural convection in air. The rectangular-fin
          efficiency formula was checked against its exact tanh(x)/x identity and its η→1 limit as h→0. The
          full fin-array solve was checked for energy-balance self-consistency (computed convection + radiation
          heat flow matches the target loss at the solved base temperature) and for a physically-expected
          monotonic drop in Rsa as fin count increases.
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
