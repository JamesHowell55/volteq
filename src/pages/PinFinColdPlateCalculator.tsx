import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import PinFinArrayDiagram from '../components/PinFinArrayDiagram';
import FlowSweepChart from '../components/FlowSweepChart';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import {
  solvePinColdPlate, sweepFlow, fluidProps, fluidTempWindowC, glycolFreezePointC,
  FLUID_KIND_LABELS, type FluidKind, type FluidChoice,
} from '../lib/pinFinColdPlatePhysics';

const PIN_MATERIALS = [
  { label: 'Copper pins (385 W/m·K)', k: 385 },
  { label: 'Aluminium pins (167 W/m·K)', k: 167 },
];
const BASE_MATERIALS = [
  { id: 'aluminium', label: 'Aluminium (6061)', k: 167 },
  { id: 'copper', label: 'Copper', k: 385 },
];
const PREMIUM_FLUIDS: FluidKind[] = ['novec7200', 'novec7100', 'brayco889', 'custom'];
const GLYCOL_PRESETS = [0, 20, 30, 40, 50, 60];

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export default function PinFinColdPlateCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);
  const L = (mm: number) => toDisplay(mm, unitSystem, UNIT_LENGTH);
  const fromL = (v: number) => fromDisplay(v, unitSystem, UNIT_LENGTH);

  // Fluid
  const [fluidKind, setFluidKind] = useState<FluidKind>('water-glycol');
  const [glycolPct, setGlycolPct] = useState(50);
  const [customRho, setCustomRho] = useState(1000);
  const [customNuCst, setCustomNuCst] = useState(2);
  const [customK, setCustomK] = useState(0.15);
  const [customCp, setCustomCp] = useState(2000);

  // Duty
  const [flowLpm, setFlowLpm] = useState(6);
  const [heatLoadW, setHeatLoadW] = useState(1000);
  const [inletTempC, setInletTempC] = useState(40);

  // Array geometry
  const [diaMm, setDiaMm] = useState(1);
  const [heightMm, setHeightMm] = useState(2);
  const [pitchTMm, setPitchTMm] = useState(2);
  const [pitchLMm, setPitchLMm] = useState(2);
  const [rows, setRows] = useState(20);
  const [across, setAcross] = useState(20);
  const [pinK, setPinK] = useState(385);
  const [tip, setTip] = useState<'convecting' | 'adiabatic'>('convecting');

  // Ports / calibration / base (premium extras)
  const [portDiaMm, setPortDiaMm] = useState(12);
  const [dpCal, setDpCal] = useState(1);
  const [baseConduction, setBaseConduction] = useState(false);
  const [baseMatId, setBaseMatId] = useState('aluminium');
  const [baseThicknessMm, setBaseThicknessMm] = useState(3);

  // Safety net: drop premium features on entitlement lapse.
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setFluidKind((prev) => (PREMIUM_FLUIDS.includes(prev) ? 'water-glycol' : prev));
    setDpCal(1);
    setBaseConduction(false);
  }, [isPremium, entitlementLoading]);

  const effectiveKind: FluidKind = !isPremium && PREMIUM_FLUIDS.includes(fluidKind) ? 'water-glycol' : fluidKind;
  const fluidChoice: FluidChoice = useMemo(() => ({
    kind: effectiveKind,
    glycolMassPct: glycolPct,
    custom: { rho: customRho, nuCst: customNuCst, k: customK, cp: customCp },
  }), [effectiveKind, glycolPct, customRho, customNuCst, customK, customCp]);

  const baseK = BASE_MATERIALS.find((m) => m.id === baseMatId)?.k ?? 167;
  const effCal = isPremium ? dpCal : 1;
  const effBase = isPremium && baseConduction;

  const input = useMemo(() => ({
    fluid: fluidChoice,
    geometry: {
      diaMm, heightMm, pitchTransverseMm: pitchTMm, pitchLongitudinalMm: pitchLMm,
      rowsAlongFlow: rows, pinsAcross: across, pinConductivityWmK: pinK, tipBoundary: tip,
    },
    flowLpm, heatLoadW, inletTempC, portDiameterMm: portDiaMm, dpCalibration: effCal,
    baseThicknessMm, baseConductivityWmK: effBase ? baseK : 0,
  }), [fluidChoice, diaMm, heightMm, pitchTMm, pitchLMm, rows, across, pinK, tip, flowLpm, heatLoadW, inletTempC, portDiaMm, effCal, baseThicknessMm, effBase, baseK]);

  const result = useMemo(() => solvePinColdPlate(input), [input]);
  const sweep = useMemo(() => sweepFlow(input, Math.max(flowLpm * 2, 1), 24), [input, flowLpm]);
  const [tLo, tHi] = fluidTempWindowC(fluidChoice);

  // Fluid card property preview at the inlet temperature
  const previewProps = useMemo(() => fluidProps(fluidChoice, inletTempC), [fluidChoice, inletTempC]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    fluidKind, glycolPct, customRho, customNuCst, customK, customCp,
    flowLpm, heatLoadW, inletTempC, diaMm, heightMm, pitchTMm, pitchLMm, rows, across, pinK, tip,
    portDiaMm, dpCal, baseConduction, baseMatId, baseThicknessMm,
  }), [fluidKind, glycolPct, customRho, customNuCst, customK, customCp, flowLpm, heatLoadW, inletTempC, diaMm, heightMm,
    pitchTMm, pitchLMm, rows, across, pinK, tip, portDiaMm, dpCal, baseConduction, baseMatId, baseThicknessMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.fluidKind != null) setFluidKind(v.fluidKind);
    if (v.glycolPct != null) setGlycolPct(v.glycolPct);
    if (v.customRho != null) setCustomRho(v.customRho);
    if (v.customNuCst != null) setCustomNuCst(v.customNuCst);
    if (v.customK != null) setCustomK(v.customK);
    if (v.customCp != null) setCustomCp(v.customCp);
    if (v.flowLpm != null) setFlowLpm(v.flowLpm);
    if (v.heatLoadW != null) setHeatLoadW(v.heatLoadW);
    if (v.inletTempC != null) setInletTempC(v.inletTempC);
    if (v.diaMm != null) setDiaMm(v.diaMm);
    if (v.heightMm != null) setHeightMm(v.heightMm);
    if (v.pitchTMm != null) setPitchTMm(v.pitchTMm);
    if (v.pitchLMm != null) setPitchLMm(v.pitchLMm);
    if (v.rows != null) setRows(v.rows);
    if (v.across != null) setAcross(v.across);
    if (v.pinK != null) setPinK(v.pinK);
    if (v.tip != null) setTip(v.tip);
    if (v.portDiaMm != null) setPortDiaMm(v.portDiaMm);
    if (v.dpCal != null) setDpCal(v.dpCal);
    if (v.baseConduction != null) setBaseConduction(v.baseConduction);
    if (v.baseMatId != null) setBaseMatId(v.baseMatId);
    if (v.baseThicknessMm != null) setBaseThicknessMm(v.baseThicknessMm);
  }, []);

  const saved = useSavedCalculations('pin-fin-cold-plate');
  const shareLink = useShareableLink(restoreInputs);

  const kPa = (pa: number) => pa / 1000;
  const fluidLabel = effectiveKind === 'water-glycol'
    ? `${fmt(glycolPct, 0)}% ethylene glycol / ${fmt(100 - glycolPct, 0)}% water (mass)`
    : FLUID_KIND_LABELS[effectiveKind];
  const f = result.fluid;

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Array geometry & velocity',
      formula: 'W = (N_across + ½)·S_T,  L = N_rows·S_L,  u = Q/(W·H),  u_max = u·a/(a−1)  [or a/(2(c−1)) diagonal],  Re = u_max·D/ν',
      substitution: `${rows} rows × ${across} pins (${result.pinCount}), D = ${fmt(diaMm, 2)} mm, H = ${fmt(heightMm, 2)} mm, S_T/D = ${fmt(result.pitchRatioA, 2)}, S_L/D = ${fmt(result.pitchRatioB, 2)}`,
      result: `W×L = ${fmt(result.widthMm, 1)}×${fmt(result.lengthMm, 1)} mm, u = ${fmt(result.approachVelocity, 3)} m/s, u_max = ${fmt(result.maxVelocity, 3)} m/s, Re = ${fmt(result.reynolds, 0)}`,
    },
    {
      title: `Fluid properties at ${fmt(result.meanFluidTempC, 1)}°C mean`,
      formula: 'ρ, cp, μ, k from the selected fluid data; ν = μ/ρ; Pr = cp·μ/k',
      substitution: fluidLabel,
      result: `ρ = ${fmt(f.rho, 1)} kg/m³, cp = ${fmt(f.cp, 0)} J/kg·K, μ = ${fmt(f.mu * 1000, 3)} mPa·s, k = ${fmt(f.k, 4)} W/m·K, Pr = ${fmt(f.pr, 2)}`,
    },
    {
      title: 'Pressure drop (Gaddis-Gnielinski + ports)',
      formula: 'ΔP_array = ½·ζ·N_rows·ρ·u_max²·f_cal;  ΔP_ports = (0.5 + 1.0)·ρ·v_port²/2',
      substitution: `ζ = ${fmt(result.dragCoeff, 4)}, f_cal = ${fmt(effCal, 2)}, port Ø ${fmt(portDiaMm, 1)} mm`,
      result: `array ${fmt(kPa(result.arrayDropPa), 2)} + ports ${fmt(kPa(result.portDropPa), 2)} = ${fmt(kPa(result.totalDropPa), 2)} kPa (hydraulic power ${fmt(result.hydraulicPowerW, 2)} W)`,
    },
    {
      title: 'Heat transfer & temperatures (Zukauskas + fin efficiency)',
      formula: 'Nu = C·Cₙ·Re^m·Pr^0.36·(S_T/S_L)^0.2;  h = Nu·k/D;  η = tanh(mL)/mL;  R = 1/(h·A_eff) + 1/(2ṁ·cp)',
      substitution: `Nu = ${fmt(result.nusselt, 1)}, η_fin = ${fmt(result.finEfficiency, 3)}, A_eff = ${fmt(result.wettedAreaCm2, 1)} cm²`,
      result: `h = ${fmt(result.htc, 0)} W/m²K, R = ${fmt(result.rTotalKPerW, 4)} K/W → base ${fmt(result.moduleTempC, 1)}°C, outlet ${fmt(result.outletTempC, 1)}°C`,
    },
  ], [result, rows, across, diaMm, heightMm, fluidLabel, f, effCal, portDiaMm]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Pin-fin cold plate',
    rows: [
      { label: 'Coolant', value: fluidLabel },
      { label: 'Properties @ mean temp', value: `ρ ${fmt(f.rho, 0)} kg/m³ · cp ${fmt(f.cp, 0)} J/kg·K · μ ${fmt(f.mu * 1000, 3)} mPa·s · k ${fmt(f.k, 3)} W/m·K · Pr ${fmt(f.pr, 1)}` },
      { label: 'Flow / heat load / inlet', value: `${fmt(flowLpm, 2)} L/min · ${fmt(heatLoadW, 0)} W · ${fmt(inletTempC, 1)} °C` },
      { label: 'Array', value: `${rows} rows × ${across} pins, offset (staggered)` },
      { label: 'Pin Ø / height', value: `${fmt(diaMm, 2)} / ${fmt(heightMm, 2)} mm` },
      { label: 'Pitch S_T / S_L', value: `${fmt(pitchTMm, 2)} / ${fmt(pitchLMm, 2)} mm` },
      { label: 'Pin conductivity / tip', value: `${fmt(pinK, 0)} W/m·K · ${tip === 'convecting' ? 'open cavity' : 'against housing'}` },
      { label: 'Ports', value: portDiaMm > 0 ? `Ø ${fmt(portDiaMm, 1)} mm (K = 0.5 in + 1.0 out)` : 'ignored' },
    ] as ReportRow[],
  }]), [fluidLabel, f, flowLpm, heatLoadW, inletTempC, rows, across, diaMm, heightMm, pitchTMm, pitchLMm, pinK, tip, portDiaMm]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Total pressure drop (array / ports)', value: `${fmt(kPa(result.totalDropPa), 2)} kPa (${fmt(kPa(result.arrayDropPa), 2)} / ${fmt(kPa(result.portDropPa), 2)})` },
      { label: 'Hydraulic power', value: `${fmt(result.hydraulicPowerW, 2)} W` },
      { label: 'Velocity (approach / max gap)', value: `${fmt(result.approachVelocity, 3)} / ${fmt(result.maxVelocity, 3)} m/s` },
      { label: 'Reynolds (pin Ø, max gap)', value: fmt(result.reynolds, 0) },
      { label: 'Heat-transfer coefficient', value: `${fmt(result.htc, 0)} W/m²K (fin η ${fmt(result.finEfficiency, 3)})` },
      { label: 'Thermal resistance (conv / caloric / base / total)', value: `${fmt(result.rConvKPerW, 4)} / ${fmt(result.rCaloricKPerW, 4)} / ${fmt(result.rBaseKPerW, 4)} / ${fmt(result.rTotalKPerW, 4)} K/W` },
      { label: 'Base temperature', value: `${fmt(result.moduleTempC, 1)} °C` },
      { label: 'Coolant outlet', value: `${fmt(result.outletTempC, 1)} °C (ΔT ${fmt(result.fluidDeltaTC, 1)} °C)` },
    ] as ReportRow[],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Pin_Fin_Cold_Plate_Calculator',
      pageTitle: 'Pin-Fin Cold Plate Pressure Drop',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Single offset (staggered) circular pin-fin array in cross-flow, steady single-phase flow. Heat transfer: Zukauskas staggered tube-bank Nusselt with tube-row correction on the max gap velocity and pin diameter, pins derated by circular-fin efficiency. Pressure drop: Gaddis-Gnielinski (VDI Heat Atlas) staggered drag coefficient per row; the few-row correction, wall Pr ratio and tip-clearance bypass are neglected, and short pins (H/D ≲ 1) are affected by end walls not captured by the tube-bank correlations. Port losses use K = 0.5 (contraction) and 1.0 (expansion). Water/glycol properties from ASHRAE-derived ethylene-glycol tables (density, specific heat, viscosity) with a Filippov mixing rule for conductivity; Brayco Micronic 889 from the Castrol product data sheet (density temperature slope is a typical PAO value); Novec 7200/7100 from 3M and distributor data (Novec 7100 viscosity-temperature shape approximated). Verify against CFD or a bench test for a final design.',
      ...branding,
    });
  };

  const isGlycol = effectiveKind === 'water-glycol';

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Pin-Fin Cold Plate</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            Pin-Fin Cold Plate Pressure Drop
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--warn, #f59e0b)', border: '1px solid var(--warn, #f59e0b)', borderRadius: 'var(--radius-pill, 9999px)', padding: '0.15rem 0.6rem' }}>
              Work in progress
            </span>
          </h1>
          <p>
            Pressure drop, heat-transfer coefficient and base temperature of a cold plate cooled by an <b>offset
            (staggered) pin-fin array</b> — set the pin diameter and height, the pitches, and the number of pins in
            each direction. Choose water / ethylene-glycol at any mix ratio, or a dielectric fluid (Novec, Castrol
            Brayco Micronic 889) with temperature-dependent properties.
          </p>
          <p className="note" style={{ borderLeft: '3px solid var(--warn, #f59e0b)', paddingLeft: '0.6rem', margin: '0.4rem 0 0' }}>
            <b>Work in progress:</b> newly added — correlations are textbook tube-bank models applied to pin fins, so
            confirm design-critical numbers against CFD or a bench test (use the ΔP calibration factor to match test data).
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Coolant</span></div>
            <div className="field">
              <label>Fluid</label>
              <select value={fluidKind} onChange={(e) => {
                const k = e.target.value as FluidKind;
                if (PREMIUM_FLUIDS.includes(k) && !isPremium) return;
                setFluidKind(k);
              }}>
                <option value="water-glycol">{FLUID_KIND_LABELS['water-glycol']}</option>
                {PREMIUM_FLUIDS.map((k) => <option key={k} value={k}>{FLUID_KIND_LABELS[k]}{isPremium ? '' : ' (Premium)'}</option>)}
              </select>
            </div>
            {isGlycol && (
              <div className="field">
                <label>Ethylene glycol: {fmt(glycolPct, 0)}% by mass
                  <InfoTooltip>Mass fraction of ethylene glycol in water (0 = pure water, 50 ≈ common 50/50 EV coolant). Density, specific heat and viscosity follow ASHRAE-derived tables; freezing point rises with water content.</InfoTooltip>
                </label>
                <input type="range" min={0} max={60} step={1} value={glycolPct} onChange={(e) => setGlycolPct(Number(e.target.value))} />
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                  {GLYCOL_PRESETS.map((p) => (
                    <button key={p} className="btn small" onClick={() => setGlycolPct(p)} style={glycolPct === p ? { background: 'var(--accent)', color: '#fff' } : undefined}>{p === 0 ? 'Water' : `${p}%`}</button>
                  ))}
                </div>
                <span className="hint">Freezes ≈ {fmt(glycolFreezePointC(glycolPct), 0)} °C</span>
              </div>
            )}
            {effectiveKind === 'custom' && (
              <PremiumGate feature="Custom fluid properties">
                <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="field"><label>Density (kg/m³)</label><input autoComplete="off" type="number" min={1} value={customRho} onChange={(e) => setCustomRho(Number(e.target.value))} /></div>
                  <div className="field"><label>Kinematic visc. (cSt)</label><input autoComplete="off" type="number" min={0.01} step={0.1} value={customNuCst} onChange={(e) => setCustomNuCst(Number(e.target.value))} /></div>
                  <div className="field"><label>Thermal cond. (W/m·K)</label><input autoComplete="off" type="number" min={0.01} step={0.01} value={customK} onChange={(e) => setCustomK(Number(e.target.value))} /></div>
                  <div className="field"><label>Specific heat (J/kg·K)</label><input autoComplete="off" type="number" min={1} value={customCp} onChange={(e) => setCustomCp(Number(e.target.value))} /></div>
                </div>
              </PremiumGate>
            )}
            <p className="hint" style={{ marginTop: '0.4rem' }}>
              At {fmt(inletTempC, 0)}°C inlet: ρ = {fmt(previewProps.rho, 0)} kg/m³ · cp = {fmt(previewProps.cp, 0)} J/kg·K ·
              μ = {fmt(previewProps.mu * 1000, 2)} mPa·s · k = {fmt(previewProps.k, 3)} W/m·K · Pr = {fmt(previewProps.pr, 1)}
              {effectiveKind !== 'custom' && <> · data range {tLo}–{tHi}°C</>}
            </p>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Total flow (L/min)</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={flowLpm} onChange={(e) => setFlowLpm(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Heat load (W)</label>
                <input autoComplete="off" type="number" min={0} step={50} value={heatLoadW} onChange={(e) => setHeatLoadW(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Inlet temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(inletTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Port diameter ({lenUnit})<InfoTooltip>Inlet and outlet port bore. Adds sudden-contraction (K = 0.5) and expansion (K = 1.0) losses on the port velocity. Set 0 to ignore manifold/port losses.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={0} step={1} value={L(portDiaMm)} onChange={(e) => setPortDiaMm(fromL(Number(e.target.value)))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Offset pin-fin array</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Pin diameter ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={L(diaMm)} onChange={(e) => setDiaMm(fromL(Number(e.target.value)))} />
              </div>
              <div className="field">
                <label>Pin height / length ({lenUnit})<InfoTooltip>Height of the pin from the base to its tip — the depth of the coolant passage.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={L(heightMm)} onChange={(e) => setHeightMm(fromL(Number(e.target.value)))} />
              </div>
              <div className="field">
                <label>Transverse pitch S_T ({lenUnit})<InfoTooltip>Centre-to-centre spacing between pins within a row, across the flow. Alternate rows are shifted by half this pitch (the offset).</InfoTooltip></label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={L(pitchTMm)} onChange={(e) => setPitchTMm(fromL(Number(e.target.value)))} />
                <span className="hint">S_T/D = {fmt(result.pitchRatioA, 2)}</span>
              </div>
              <div className="field">
                <label>Longitudinal pitch S_L ({lenUnit})<InfoTooltip>Spacing between successive rows, along the flow direction.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={L(pitchLMm)} onChange={(e) => setPitchLMm(fromL(Number(e.target.value)))} />
                <span className="hint">S_L/D = {fmt(result.pitchRatioB, 2)}</span>
              </div>
              <div className="field">
                <label>Rows along flow (N_rows)</label>
                <input autoComplete="off" type="number" min={1} step={1} value={rows} onChange={(e) => setRows(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
              <div className="field">
                <label>Pins across flow (per row)</label>
                <input autoComplete="off" type="number" min={1} step={1} value={across} onChange={(e) => setAcross(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
              <div className="field">
                <label>Pin material</label>
                <select value={pinK} onChange={(e) => setPinK(Number(e.target.value))}>
                  {PIN_MATERIALS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Pin tip
                  <InfoTooltip>The pinned baseplate is usually the sealing surface. <b>Open cavity</b>: tip wetted by coolant (corrected-length tip convection). <b>Against housing</b>: tip bottoms out on the sealed floor (adiabatic).</InfoTooltip>
                </label>
                <select value={tip} onChange={(e) => setTip(e.target.value as 'adiabatic' | 'convecting')}>
                  <option value="convecting">Open cavity (wetted tip)</option>
                  <option value="adiabatic">Against housing (adiabatic)</option>
                </select>
              </div>
            </div>
            <p className="hint" style={{ marginTop: '0.4rem' }}>
              {result.pinCount} pins · passage {fmt(L(result.widthMm), 1)} × {fmt(L(result.lengthMm), 1)} {lenUnit} · {result.diagonalGoverns ? 'diagonal' : 'transverse'} gap sets max velocity
            </p>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Refinements</span></div>
            <PremiumGate feature="ΔP calibration & base conduction">
              <>
                <div className="field">
                  <label>ΔP calibration factor<InfoTooltip>Multiplies the array pressure drop. Use it to match bench/CFD data — short pins and manifold/end-wall effects typically push measured ΔP above the tube-bank correlation (factor &gt; 1). 1 = pure correlation.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0.1} step={0.05} value={dpCal} onChange={(e) => setDpCal(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="checkbox" checked={baseConduction} onChange={(e) => setBaseConduction(e.target.checked)} style={{ width: 'auto' }} />
                    Add base-plate conduction (module → pin base)
                  </label>
                </div>
                {baseConduction && (
                  <div className="grid grid-2">
                    <div className="field">
                      <label>Base material</label>
                      <select value={baseMatId} onChange={(e) => setBaseMatId(e.target.value)}>
                        {BASE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Base thickness ({lenUnit})</label><input autoComplete="off" type="number" min={0.1} step={0.5} value={L(baseThicknessMm)} onChange={(e) => setBaseThicknessMm(fromL(Number(e.target.value)))} /></div>
                  </div>
                )}
              </>
            </PremiumGate>
          </div>
        </div>

        {/* RIGHT — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Total pressure drop</div>
                <div className="value">{fmt(kPa(result.totalDropPa), 2)}<span className="unit">kPa</span></div>
                <div className="hint">array {fmt(kPa(result.arrayDropPa), 2)} + ports {fmt(kPa(result.portDropPa), 2)} · {fmt(result.totalDropPa / 100, 0)} mbar</div>
              </div>
              <div className="result-tile">
                <div className="label">Base temperature</div>
                <div className={`value ${result.moduleTempC > 100 ? 'neg' : result.moduleTempC > 85 ? 'warn' : 'pos'}`}>{fmt(result.moduleTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">at {fmt(heatLoadW, 0)} W, {fmt(inletTempC, 0)}°C inlet</div>
              </div>
              <div className="result-tile">
                <div className="label">Thermal resistance</div>
                <div className="value">{fmt(result.rTotalKPerW, 4)}<span className="unit">K/W</span></div>
                <div className="hint">conv {fmt(result.rConvKPerW, 4)} · caloric {fmt(result.rCaloricKPerW, 4)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Heat-transfer coeff.</div>
                <div className="value">{fmt(result.htc, 0)}<span className="unit">W/m²K</span></div>
                <div className="hint">Nu {fmt(result.nusselt, 1)} · fin η {fmt(result.finEfficiency, 2)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Velocity / Re</div>
                <div className="value">{fmt(result.maxVelocity, 2)}<span className="unit">m/s</span></div>
                <div className="hint">max gap · approach {fmt(result.approachVelocity, 2)} m/s · Re {fmt(result.reynolds, 0)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Coolant outlet</div>
                <div className="value">{fmt(result.outletTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">ΔT {fmt(result.fluidDeltaTC, 1)}°C · pump {fmt(result.hydraulicPowerW, 2)} W</div>
              </div>
            </div>
            {result.warnings.length > 0 && (
              <ul className="note" style={{ borderLeft: '3px solid var(--warn, #f59e0b)', paddingLeft: '1.2rem', marginTop: '0.75rem' }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-title">Array layout (plan view)</div>
            <PinFinArrayDiagram diaMm={diaMm} pitchTransverseMm={pitchTMm} pitchLongitudinalMm={pitchLMm} rowsAlongFlow={rows} pinsAcross={across} />
            <p className="hint">Flow runs left → right; alternate rows are offset by S_T/2.</p>
          </div>

          <div className="card">
            <div className="card-title">Pressure drop vs flow rate</div>
            <p className="hint" style={{ marginTop: 0 }}>Total pressure drop (array + ports) from 0 to {fmt(Math.max(flowLpm * 2, 1), 1)} L/min for this geometry and fluid (ring = current flow: {fmt(result.totalDropPa / 100, 1)} mbar).</p>
            <FlowSweepChart xs={sweep.map((p) => p.flowLpm)} ys={sweep.map((p) => p.dropKPa * 10)} color="var(--accent)" xLabel="Flow (L/min)" yLabel="ΔP" yUnit="mbar" decimals={1}
              marker={{ x: flowLpm, y: result.totalDropPa / 100 }} />
            <PremiumGate feature="Thermal-resistance sweep">
              <FlowSweepChart xs={sweep.map((p) => p.flowLpm)} ys={sweep.map((p) => p.rKPerW)} color="#a855f7" xLabel="Flow (L/min)" yLabel="R_th" yUnit="K/W" decimals={4}
                marker={{ x: flowLpm, y: result.rTotalKPerW }} />
            </PremiumGate>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          The array is modelled as a bank of circular pins in cross-flow on a staggered grid. All velocities and
          Reynolds numbers use the <em>maximum</em> velocity through the narrowest gap and the pin diameter.
          <strong> Pressure drop</strong> uses the Gaddis-Gnielinski (VDI Heat Atlas) staggered drag coefficient per
          row, ΔP = ½·ζ·N_rows·ρ·u_max², plus optional port contraction/expansion losses. <strong>Heat transfer</strong> uses the
          Zukauskas staggered tube-bank Nusselt number with the tube-row correction, with each pin derated by
          circular-fin efficiency tanh(mL)/mL and the bare base between pins added. These are the same correlations
          as the pin-fin sections of the Cold Plate Designer. Fluid properties are evaluated at the bulk mean
          temperature (inlet + ΔT/2), so a viscous fluid such as Brayco Micronic 889 shows its strong
          temperature-dependent pressure drop. The few-row correction (best for ≳10 rows), wall Pr ratio and
          tip-clearance bypass are neglected, and short pins (H/D ≲ 1) experience end-wall effects the tube-bank
          correlations do not capture — use the ΔP calibration factor against test data.
        </p>
        <p className="note">
          <b>Fluid data:</b> water/ethylene-glycol density, specific heat and viscosity from ASHRAE-derived
          ethylene-glycol tables (0–60% by mass), thermal conductivity by the Filippov mixing rule (±5%).
          Castrol Brayco Micronic 889 from the Castrol product data sheet — specific gravity 0.85, kinematic viscosity
          at −54/−40/40/100 °C (800/250/5.1/1.7 mm²/s, interpolated in ASTM D341 coordinates), specific heat and thermal
          conductivity tables; the temperature slope of its density is a typical PAO value not on the data sheet.
          3M Novec 7200 from 3M and distributor data; Novec 7100 documents only its 25 °C viscosity, so its
          temperature dependence is approximated from Novec 7200. Typical values — not guaranteed — verify
          against your supplier's current data sheet.
        </p>
        <p className="note">
          <b>Validated:</b> the water and ethylene-glycol properties reproduce reference values (water 20 °C: 1.00 mPa·s,
          0.599 W/m·K, Pr 7.0; 50% glycol 20 °C: ≈3.9 mPa·s, c<sub>p</sub> ≈ 3.47 kJ/kg·K); Brayco 889 viscosity is exact
          at all four data-sheet points; array results are identical to the Cold Plate Designer pin-fin path.
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
