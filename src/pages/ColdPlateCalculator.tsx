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
import GuideBacklink from '../components/GuideBacklink';
import ColdPlatePathDiagram from '../components/ColdPlatePathDiagram';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { COOLANT_PRESETS } from '../lib/materials';
import {
  coldPlateFluid, solveColdPlate, BEND_K, type Segment, type BendAngle, type PinFinConfig,
} from '../lib/coldPlatePhysics';

const PIN_MATERIALS = [
  { label: 'Copper pins', k: 385 },
  { label: 'Aluminium pins', k: 167 },
];
const DEFAULT_PINS: PinFinConfig = { diaMm: 1, pitchTransverseMm: 2, pitchLongitudinalMm: 2, finConductivityWmK: 385, tipBoundary: 'convecting' };

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

const COOLANT_OPTIONS = COOLANT_PRESETS.filter((c) => c.id !== 'custom');
const BASE_MATERIALS = [
  { id: 'aluminium', label: 'Aluminium (6061)', k: 167 },
  { id: 'copper', label: 'Copper', k: 385 },
  { id: 'custom', label: 'Custom', k: 167 },
];

const DEFAULT_SEGMENTS: Segment[] = [
  { type: 'straight', lengthMm: 60, widthMm: 5, heightMm: 4 },
  { type: 'bend', angleDeg: 180 },
  { type: 'straight', lengthMm: 60, widthMm: 5, heightMm: 4 },
  { type: 'bend', angleDeg: 180 },
  { type: 'straight', lengthMm: 60, widthMm: 5, heightMm: 4 },
];

export default function ColdPlateCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium, loading: entitlementLoading } = useEntitlement();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  // Fluid
  const [coolantId, setCoolantId] = useState('glycol50');
  const [tempC, setTempC] = useState(40);
  const [customRho, setCustomRho] = useState(1050);
  const [customNuCst, setCustomNuCst] = useState(3.0);
  const [customK, setCustomK] = useState(0.4);
  const [customCp, setCustomCp] = useState(3300);

  // Channels / duty
  const [channels, setChannels] = useState(3);
  const [totalFlowLpm, setTotalFlowLpm] = useState(6);
  const [heatLoadW, setHeatLoadW] = useState(250);
  const [inletTempC, setInletTempC] = useState(40);

  // Segment path
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS);

  // Base conduction (premium)
  const [baseConduction, setBaseConduction] = useState(false);
  const [baseMatId, setBaseMatId] = useState('aluminium');
  const [customBaseK, setCustomBaseK] = useState(167);
  const [baseThicknessMm, setBaseThicknessMm] = useState(3);
  const [footprintAreaCm2, setFootprintAreaCm2] = useState(30);

  // Safety net: drop premium features on entitlement lapse.
  useEffect(() => {
    if (entitlementLoading || isPremium) return;
    setCoolantId((prev) => (prev === 'custom' ? 'glycol50' : prev));
    setBaseConduction(false);
  }, [isPremium, entitlementLoading]);

  const fluid = useMemo(() => {
    if (coolantId === 'custom') return { rho: customRho, nu: customNuCst * 1e-6, k: customK, pr: (customNuCst * 1e-6 * customRho * customCp) / customK, cp: customCp };
    return coldPlateFluid(coolantId, tempC);
  }, [coolantId, tempC, customRho, customNuCst, customK, customCp]);

  const baseK = baseMatId === 'custom' ? customBaseK : (BASE_MATERIALS.find((m) => m.id === baseMatId)?.k ?? 167);

  // Pin-fin sections are a Premium feature — strip them from the solve (not the state) when locked.
  const effectiveSegments = useMemo(() =>
    isPremium ? segments : segments.map((s) => (s.type === 'straight' && s.pins ? { ...s, pins: undefined } : s)),
    [segments, isPremium]);

  const result = useMemo(() => solveColdPlate({
    fluid, segments: effectiveSegments, channels, totalFlowLpm, heatLoadW, inletTempC,
    baseConduction, baseThicknessMm, baseConductivityWmK: baseK, footprintAreaCm2,
  }), [fluid, effectiveSegments, channels, totalFlowLpm, heatLoadW, inletTempC, baseConduction, baseThicknessMm, baseK, footprintAreaCm2]);
  const hasPins = segments.some((s) => s.type === 'straight' && s.pins);

  // ── Segment builder ops ──
  const updateSegment = (i: number, patch: Partial<Extract<Segment, { type: 'straight' }>> | { angleDeg: BendAngle }) => {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } as Segment : s)));
  };
  const removeSegment = (i: number) => setSegments((prev) => prev.filter((_, idx) => idx !== i));
  const moveSegment = (i: number, dir: -1 | 1) => setSegments((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addStraight = () => setSegments((prev) => [...prev, { type: 'straight', lengthMm: 60, widthMm: 5, heightMm: 4 }]);
  const addBend = (angle: BendAngle) => setSegments((prev) => [...prev, { type: 'bend', angleDeg: angle }]);
  const togglePins = (i: number) => setSegments((prev) => prev.map((s, idx) =>
    idx === i && s.type === 'straight' ? { ...s, pins: s.pins ? undefined : { ...DEFAULT_PINS } } : s));
  const updatePins = (i: number, patch: Partial<PinFinConfig>) => setSegments((prev) => prev.map((s, idx) =>
    idx === i && s.type === 'straight' && s.pins ? { ...s, pins: { ...s.pins, ...patch } } : s));

  const getInputs = useCallback((): Record<string, unknown> => ({
    coolantId, tempC, customRho, customNuCst, customK, customCp,
    channels, totalFlowLpm, heatLoadW, inletTempC, segments,
    baseConduction, baseMatId, customBaseK, baseThicknessMm, footprintAreaCm2,
  }), [coolantId, tempC, customRho, customNuCst, customK, customCp, channels, totalFlowLpm, heatLoadW, inletTempC, segments,
    baseConduction, baseMatId, customBaseK, baseThicknessMm, footprintAreaCm2]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.coolantId != null) setCoolantId(v.coolantId);
    if (v.tempC != null) setTempC(v.tempC);
    if (v.customRho != null) setCustomRho(v.customRho);
    if (v.customNuCst != null) setCustomNuCst(v.customNuCst);
    if (v.customK != null) setCustomK(v.customK);
    if (v.customCp != null) setCustomCp(v.customCp);
    if (v.channels != null) setChannels(v.channels);
    if (v.totalFlowLpm != null) setTotalFlowLpm(v.totalFlowLpm);
    if (v.heatLoadW != null) setHeatLoadW(v.heatLoadW);
    if (v.inletTempC != null) setInletTempC(v.inletTempC);
    if (Array.isArray(v.segments)) setSegments(v.segments);
    if (v.baseConduction != null) setBaseConduction(v.baseConduction);
    if (v.baseMatId != null) setBaseMatId(v.baseMatId);
    if (v.customBaseK != null) setCustomBaseK(v.customBaseK);
    if (v.baseThicknessMm != null) setBaseThicknessMm(v.baseThicknessMm);
    if (v.footprintAreaCm2 != null) setFootprintAreaCm2(v.footprintAreaCm2);
  }, []);

  const saved = useSavedCalculations('cold-plate');
  const shareLink = useShareableLink(restoreInputs);

  const kPa = (pa: number) => pa / 1000;
  const straightCount = segments.filter((s) => s.type === 'straight').length;
  const bendCount = segments.filter((s) => s.type === 'bend').length;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const s0 = result.sections[0];
    return [
      {
        title: 'Channel hydraulics (per section)',
        formula: 'Dh = 2·w·h/(w+h),  v = (Q/N)/(w·h),  Re = v·Dh/ν',
        substitution: `${channels} channel(s), Q = ${fmt(totalFlowLpm, 2)} L/min`,
        result: s0 ? `first section: Dh = ${fmt(s0.dhMm, 2)} mm, v = ${fmt(s0.velocityMPerS, 3)} m/s, Re = ${fmt(s0.reynolds, 0)} (${s0.regime})` : '—',
      },
      {
        title: 'Heat-transfer coefficient (Shah-London / Dittus-Boelter' + (hasPins ? ' + Zukauskas pins' : '') + ')',
        formula: 'channel: laminar Nu = 8.235·(1 − 2.0421α + …) (rect. duct, H1), turbulent Nu = 0.023·Re^0.8·Pr^0.4' + (hasPins ? ';  pin-fin: Nu = C·Cₙ·Re^m·Pr^0.36·(S_T/S_L)^0.2 (Zukauskas, staggered)' : '') + ';  h = Nu·k/D',
        substitution: `k = ${fmt(fluid.k, 3)} W/m·K, Pr = ${fmt(fluid.pr, 2)}`,
        result: `area-weighted h = ${fmt(result.avgHtc, 0)} W/m²K, UA = ${fmt(result.uaWPerK, 2)} W/K`,
      },
      {
        title: 'Pressure drop (Darcy-Weisbach + bends' + (hasPins ? ' + Gaddis-Gnielinski pins' : '') + ')',
        formula: 'ΔP = Σ f·(L/Dh)·(ρv²/2) + Σ K_bend·(ρv²/2)' + (hasPins ? ' + Σ ½·ζ·N_rows·ρ·u_max² (pin banks)' : ''),
        substitution: `${straightCount} straight section(s), ${bendCount} bend(s)`,
        result: `major ${fmt(kPa(result.majorDropPa), 2)} + bends ${fmt(kPa(result.bendDropPa), 2)} = ${fmt(kPa(result.totalDropPa), 2)} kPa`,
      },
      {
        title: 'Thermal resistance & temperatures',
        formula: 'R_conv = 1/UA, R_caloric = 1/(2·ṁ·cp); T_base = T_in + Q·(R_conv+R_caloric)' + (baseConduction ? ' + Q·R_base' : ''),
        substitution: `Q = ${fmt(heatLoadW, 0)} W, T_in = ${fmt(inletTempC, 0)}°C`,
        result: `R = ${fmt(result.rTotalKPerW, 4)} K/W → base/module ${fmt(result.moduleTempC, 1)}°C, coolant out ${fmt(result.outletTempC, 1)}°C (ΔT ${fmt(result.fluidDeltaTC, 1)}°C)`,
      },
    ];
  }, [result, channels, totalFlowLpm, fluid, straightCount, bendCount, baseConduction, heatLoadW, inletTempC, hasPins]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Cold plate',
    rows: [
      { label: 'Coolant', value: coolantId === 'custom' ? 'Custom' : (COOLANT_OPTIONS.find((c) => c.id === coolantId)?.label ?? coolantId) },
      { label: 'Temperature / inlet', value: `${fmtU(tempC, unitSystem, UNIT_TEMP, 0)}${tempUnit} / ${fmtU(inletTempC, unitSystem, UNIT_TEMP, 0)}${tempUnit}` },
      { label: 'Properties (ρ / cp / k / Pr)', value: `${fmt(fluid.rho, 0)} kg/m³ / ${fmt(fluid.cp, 0)} J/kg·K / ${fmt(fluid.k, 3)} W/m·K / ${fmt(fluid.pr, 2)}` },
      { label: 'Channels / flow', value: `${channels} parallel, ${fmt(totalFlowLpm, 2)} L/min total` },
      { label: 'Path', value: `${straightCount} straight section(s), ${bendCount} bend(s)` },
      { label: 'Heat load', value: `${fmt(heatLoadW, 0)} W` },
      ...(baseConduction ? [{ label: 'Base conduction', value: `${fmt(baseThicknessMm, 1)} mm, k=${fmt(baseK, 0)} W/m·K, ${fmt(footprintAreaCm2, 1)} cm²` }] : []),
    ] as ReportRow[],
  }]), [coolantId, tempC, inletTempC, fluid, channels, totalFlowLpm, straightCount, bendCount, heatLoadW, baseConduction, baseThicknessMm, baseK, footprintAreaCm2, unitSystem, tempUnit]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Velocity (min–max)', value: `${fmt(result.minVelocity, 3)}–${fmt(result.maxVelocity, 3)} m/s` },
      { label: 'Reynolds (min–max)', value: `${fmt(result.minReynolds, 0)}–${fmt(result.maxReynolds, 0)}` },
      { label: 'Area-weighted HTC', value: `${fmt(result.avgHtc, 0)} W/m²K` },
      { label: 'Pressure drop (major/bends/total)', value: `${fmt(kPa(result.majorDropPa), 2)} / ${fmt(kPa(result.bendDropPa), 2)} / ${fmt(kPa(result.totalDropPa), 2)} kPa` },
      { label: 'Thermal resistance (conv/caloric/base/total)', value: `${fmt(result.rConvKPerW, 4)} / ${fmt(result.rCaloricKPerW, 4)} / ${fmt(result.rBaseKPerW, 4)} / ${fmt(result.rTotalKPerW, 4)} K/W` },
      { label: 'Base / module temperature', value: `${fmt(result.moduleTempC, 1)} °C` },
      { label: 'Coolant outlet temperature', value: `${fmt(result.outletTempC, 1)} °C (ΔT ${fmt(result.fluidDeltaTC, 1)} °C)` },
    ] as ReportRow[],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Cold_Plate_Calculator',
      pageTitle: 'Cold Plate Designer',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Rectangular-channel liquid cold plate, steady single-phase Newtonian flow. Friction factor from the rectangular-duct Poiseuille number f·Re = 96·(1 − 1.3553α + …) (laminar, Shah & London) and Swamee-Jain (turbulent), interpolated across the 2300–4000 transitional band. Heat-transfer coefficient from the constant-heat-flux (H1) rectangular-duct laminar Nusselt 8.235·(1 − 2.0421α + …) and Dittus-Boelter (turbulent). Bend minor-loss K values (45°≈0.3, 90°≈1.1, 180°≈2.0) are representative for sharp milled bends and vary with radius. Offset pin-fin sections (direct-cooled baseplates) are modelled as a staggered pin bank in cross-flow: Zukauskas Nusselt for heat transfer and the Gaddis-Gnielinski (VDI Heat Atlas) drag coefficient per row for pressure drop, both on the max gap velocity and pin diameter, with a selectable circular-fin efficiency on the pins (open-cavity wetted tip or adiabatic against-housing tip, since the pinned baseplate is the sealing surface); the few-row (f_nt) correction and wall Pr ratio are neglected and tip-clearance bypass is not modelled. The channel side and top walls are treated as fully-effective heat-transfer area (no fin-efficiency derating — a first-order over-estimate of UA); flow is assumed fully developed. Fluid density/cp reuse this site\'s coolant presets (single representative values) and ν/k/Pr the Heat Exchanger transport table. Base conduction, when enabled, is 1-D (t/(k·A), no spreading resistance). Verify against CFD or a bench test for a final design.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Cold Plate Designer</div>
          <h1>Cold Plate Designer</h1>
          <p>
            Hydraulic and thermal performance of a liquid cold plate whose coolant channel you build up from
            straight sections and 45°/90°/180° bends — heat-transfer coefficient, pressure drop, thermal
            resistance and base temperature for a given heat load. Drop an <b>offset pin-fin field</b> into any
            section to model a direct-cooled power-module baseplate. Pairs with the Heatsink, Heat Exchanger and
            Flow-in-Pipes calculators.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Coolant &amp; duty</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Coolant</label>
                <select value={coolantId} onChange={(e) => { if (e.target.value === 'custom' && !isPremium) return; setCoolantId(e.target.value); }}>
                  {COOLANT_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  <option value="custom">Custom (Premium)</option>
                </select>
              </div>
              {coolantId !== 'custom' && (
                <div className="field">
                  <label>Fluid temperature ({tempUnit})</label>
                  <input autoComplete="off" type="number" value={toDisplay(tempC, unitSystem, UNIT_TEMP)} onChange={(e) => setTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  <span className="hint">ρ={fmt(fluid.rho, 0)}, k={fmt(fluid.k, 3)}, Pr={fmt(fluid.pr, 2)}</span>
                </div>
              )}
            </div>
            {coolantId === 'custom' && (
              <PremiumGate feature="Custom fluid properties">
                <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="field"><label>Density (kg/m³)</label><input autoComplete="off" type="number" min={1} value={customRho} onChange={(e) => setCustomRho(Number(e.target.value))} /></div>
                  <div className="field"><label>Kinematic visc. (cSt)</label><input autoComplete="off" type="number" min={0.01} step={0.1} value={customNuCst} onChange={(e) => setCustomNuCst(Number(e.target.value))} /></div>
                  <div className="field"><label>Thermal cond. (W/m·K)</label><input autoComplete="off" type="number" min={0.01} step={0.01} value={customK} onChange={(e) => setCustomK(Number(e.target.value))} /></div>
                  <div className="field"><label>Specific heat (J/kg·K)</label><input autoComplete="off" type="number" min={1} value={customCp} onChange={(e) => setCustomCp(Number(e.target.value))} /></div>
                </div>
              </PremiumGate>
            )}
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Parallel channels<InfoTooltip>How many identical channel paths run in parallel across the plate; the total flow splits equally between them.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={1} step={1} value={channels} onChange={(e) => setChannels(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
              <div className="field">
                <label>Total flow (L/min)</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={totalFlowLpm} onChange={(e) => setTotalFlowLpm(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Heat load (W)</label>
                <input autoComplete="off" type="number" min={0} step={10} value={heatLoadW} onChange={(e) => setHeatLoadW(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Inlet temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(inletTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">2</span>Channel path
                <InfoTooltip>Build one channel's path as an ordered list of straight sections (each with its own width, height and length) and 45°/90°/180° bends. The flow runs through them in order; use ▲▼ to reorder. Multiple parallel channels share the total flow. Hit <b>⬢ Pins</b> on any straight section to fill it with an offset (staggered) pin-fin field — as used by direct-cooled power-module baseplates — which sharply raises both heat transfer and pressure drop.</InfoTooltip>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {segments.map((seg, i) => {
                const pinned = seg.type === 'straight' && !!seg.pins;
                const edge = seg.type === 'bend' ? 'var(--warn)' : pinned ? '#a855f7' : 'var(--accent)';
                return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderLeft: `3px solid ${edge}`, paddingLeft: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
                  {seg.type === 'straight' ? (
                    <>
                      <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.72rem' }}>Length ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} value={toDisplay(seg.lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updateSegment(i, { lengthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                      </div>
                      <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.72rem' }}>Width ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(seg.widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updateSegment(i, { widthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                      </div>
                      <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.72rem' }}>{pinned ? 'Pin height' : 'Height'} ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(seg.heightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updateSegment(i, { heightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                      </div>
                    </>
                  ) : (
                    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '0.72rem' }}>Bend angle (K={BEND_K[seg.angleDeg]})</label>
                      <select value={seg.angleDeg} onChange={(e) => updateSegment(i, { angleDeg: Number(e.target.value) as BendAngle })}>
                        <option value={45}>45° bend</option>
                        <option value={90}>90° bend</option>
                        <option value={180}>180° U-turn</option>
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    {seg.type === 'straight' && (
                      <button className="btn small" onClick={() => togglePins(i)} title="Offset pin-fin field (direct-cooled)" style={pinned ? { background: '#a855f7', color: '#fff', borderColor: '#a855f7' } : undefined}>⬢ Pins</button>
                    )}
                    <button className="btn small" onClick={() => moveSegment(i, -1)} disabled={i === 0} title="Move up">▲</button>
                    <button className="btn small" onClick={() => moveSegment(i, 1)} disabled={i === segments.length - 1} title="Move down">▼</button>
                    <button className="btn small" onClick={() => removeSegment(i)} title="Remove">✕</button>
                  </div>
                  </div>
                  {seg.type === 'straight' && seg.pins && (
                    <PremiumGate feature="Pin-fin (direct-cooled) sections">
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ flex: 1, minWidth: 90, marginBottom: 0 }}>
                          <label style={{ fontSize: '0.72rem' }}>Pin Ø ({lenUnit})</label>
                          <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(seg.pins.diaMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updatePins(i, { diaMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 90, marginBottom: 0 }}>
                          <label style={{ fontSize: '0.72rem' }}>Transv. pitch ({lenUnit})</label>
                          <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(seg.pins.pitchTransverseMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updatePins(i, { pitchTransverseMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 90, marginBottom: 0 }}>
                          <label style={{ fontSize: '0.72rem' }}>Long. pitch ({lenUnit})</label>
                          <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(seg.pins.pitchLongitudinalMm, unitSystem, UNIT_LENGTH)} onChange={(e) => updatePins(i, { pitchLongitudinalMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 110, marginBottom: 0 }}>
                          <label style={{ fontSize: '0.72rem' }}>Pin material</label>
                          <select value={seg.pins.finConductivityWmK} onChange={(e) => updatePins(i, { finConductivityWmK: Number(e.target.value) })}>
                            {PIN_MATERIALS.map((m) => <option key={m.label} value={m.k}>{m.label}</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                          <label style={{ fontSize: '0.72rem' }}>Pin tip
                            <InfoTooltip>The pinned baseplate is the sealing surface, so how the pin tip meets the housing sets its fin boundary. <b>Open cavity</b>: tip is wetted by coolant (corrected-length tip convection). <b>Against housing</b>: tip bottoms out on the sealed housing floor, so it loses no heat there (adiabatic tip).</InfoTooltip>
                          </label>
                          <select value={seg.pins.tipBoundary ?? 'convecting'} onChange={(e) => updatePins(i, { tipBoundary: e.target.value as 'adiabatic' | 'convecting' })}>
                            <option value="convecting">Open cavity (wetted tip)</option>
                            <option value="adiabatic">Against housing (adiabatic)</option>
                          </select>
                        </div>
                      </div>
                    </PremiumGate>
                  )}
                </div>
              ); })}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn small primary" onClick={addStraight}>+ Straight section</button>
              <button className="btn small" onClick={() => addBend(45)}>+ 45° bend</button>
              <button className="btn small" onClick={() => addBend(90)}>+ 90° bend</button>
              <button className="btn small" onClick={() => addBend(180)}>+ 180° U-turn</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Base conduction (optional)</span></div>
            <PremiumGate feature="Base conduction">
              <>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="checkbox" checked={baseConduction} onChange={(e) => setBaseConduction(e.target.checked)} style={{ width: 'auto' }} />
                    Add module-to-channel base conduction
                    <InfoTooltip>Adds a 1-D conduction resistance t/(k·A_footprint) from the power module's footprint through the cold-plate base to the channels, giving the module base temperature above the channel surface. No spreading-resistance model.</InfoTooltip>
                  </label>
                </div>
                {baseConduction && (
                  <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                    <div className="field">
                      <label>Base material</label>
                      <select value={baseMatId} onChange={(e) => setBaseMatId(e.target.value)}>
                        {BASE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    {baseMatId === 'custom' && (
                      <div className="field"><label>Conductivity (W/m·K)</label><input autoComplete="off" type="number" min={1} value={customBaseK} onChange={(e) => setCustomBaseK(Number(e.target.value))} /></div>
                    )}
                    <div className="field"><label>Base thickness ({lenUnit})</label><input autoComplete="off" type="number" min={0.1} step={0.5} value={toDisplay(baseThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBaseThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Module footprint (cm²)</label><input autoComplete="off" type="number" min={1} value={footprintAreaCm2} onChange={(e) => setFootprintAreaCm2(Number(e.target.value))} /></div>
                  </div>
                )}
              </>
            </PremiumGate>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Base / module temperature</div>
                <div className={`value ${result.moduleTempC > 100 ? 'neg' : result.moduleTempC > 85 ? 'warn' : 'pos'}`}>{fmt(result.moduleTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">at {fmt(heatLoadW, 0)} W, {fmt(inletTempC, 0)}°C inlet</div>
              </div>
              <div className="result-tile">
                <div className="label">Thermal resistance</div>
                <div className="value">{fmt(result.rTotalKPerW, 4)}<span className="unit">K/W</span></div>
                <div className="hint">module → inlet fluid</div>
              </div>
              <div className="result-tile">
                <div className="label">Total pressure drop</div>
                <div className="value">{fmt(kPa(result.totalDropPa), 2)}<span className="unit">kPa</span></div>
                <div className="hint">{fmt(result.totalDropPa / 100000, 3)} bar · major+bends</div>
              </div>
              <div className="result-tile">
                <div className="label">Area-weighted HTC</div>
                <div className="value">{fmt(result.avgHtc, 0)}<span className="unit">W/m²K</span></div>
                <div className="hint">UA = {fmt(result.uaWPerK, 2)} W/K</div>
              </div>
              <div className="result-tile">
                <div className="label">Coolant outlet</div>
                <div className="value">{fmt(result.outletTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">ΔT {fmt(result.fluidDeltaTC, 1)}°C · Re {fmt(result.minReynolds, 0)}–{fmt(result.maxReynolds, 0)}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Per-section detail</div>
            <PremiumGate feature="Per-section detail table">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>#</th><th>type</th><th>w×h ({lenUnit})</th><th>Dh/Ø</th><th>v (m/s)</th><th>Re</th><th>h (W/m²K)</th><th>ΔP (kPa)</th></tr>
                  </thead>
                  <tbody>
                    {result.sections.map((s, i) => (
                      <tr key={i} title={s.note}>
                        <td>{i + 1}</td>
                        <td>{s.kind === 'pinfin' ? <span style={{ color: '#a855f7', fontWeight: 600 }}>⬢ pins{s.pinCount ? ` ×${Math.round(s.pinCount)}` : ''}</span> : 'channel'}</td>
                        <td>{fmtU(s.widthMm, unitSystem, UNIT_LENGTH, 1)}×{fmtU(s.heightMm, unitSystem, UNIT_LENGTH, 1)}</td>
                        <td>{fmtU(s.dhMm, unitSystem, UNIT_LENGTH, 2)}</td>
                        <td>{fmt(s.velocityMPerS, 2)}</td>
                        <td>{fmt(s.reynolds, 0)}</td>
                        <td>{fmt(s.htc, 0)}</td>
                        <td>{fmt(kPa(s.majorDropPa), 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasPins && (
                <p className="hint" style={{ marginTop: '0.4rem' }}>
                  For pin-fin rows, <b>Dh/Ø</b> is the pin diameter, <b>v</b> the max velocity through the narrowest gap,
                  and <b>ΔP</b> the Gaddis-Gnielinski array loss; <b>h</b> and Re are on the pin diameter.
                </p>
              )}
            </PremiumGate>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">
          <span>Channel layout
            <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--warn, #f59e0b)', border: '1px solid var(--warn, #f59e0b)', borderRadius: 'var(--radius-pill, 9999px)', padding: '0.1rem 0.5rem', verticalAlign: 'middle' }}>
              Work in progress
            </span>
          </span>
        </div>
        <p className="hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
          This plan-view sketch is a work in progress — it routes simple serpentine paths well, but more complex
          bend sequences can lay out inaccurately. It's a visual aid only and doesn't affect the calculated results.
        </p>
        <ColdPlatePathDiagram segments={segments} />
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/cold-plate" />
        <p className="note">
          Rectangular-channel liquid cold plate, steady single-phase Newtonian flow. Each straight section is
          solved on its own hydraulic diameter Dh = 2·w·h/(w+h) and per-channel velocity. The Darcy friction
          factor uses the rectangular-duct Poiseuille number f·Re = 96·(1 − 1.3553α + 1.9467α² − …) for laminar
          flow (Shah &amp; London, α = short/long side — 56.9 at a square, 96 at parallel plates, so a channel is
          <strong> not</strong> the 64/Re of a round pipe) and Swamee-Jain when turbulent, interpolated across the
          2300–4000 transitional band. The heat-transfer coefficient h = Nu·k/Dh uses the constant-heat-flux (H1)
          rectangular-duct laminar Nusselt 8.235·(1 − 2.0421α + …) (3.61 at a square) and Dittus-Boelter when
          turbulent. Bend losses use ΣK·(ρv²/2) with representative sharp-milled-bend K (45°≈0.3, 90°≈1.1,
          180°≈2.0), which vary with bend radius. Thermal resistance from the channel wall to the inlet fluid is
          R_conv = 1/UA (UA = Σ h·wetted-area over every section and channel) plus R_caloric = 1/(2·ṁ·cp);
          optional 1-D base conduction t/(k·A) adds the module path. <strong>The channel side and top walls are
          counted as fully-effective heat-transfer area (no fin-efficiency derating)</strong>, which over-estimates
          UA for tall/thin channels — treat the thermal result as a first-order estimate. Fluid density and cp
          reuse this site's coolant presets; ν/k/Pr reuse the Heat Exchanger transport table. Verify against CFD
          or a bench test before committing a design.
        </p>
        <p className="note">
          <strong>Offset pin-fin sections</strong> (⬢, direct-cooled power-module baseplates) are modelled as a
          staggered bank of circular pins in cross-flow, with all velocities and Reynolds numbers on the
          <em> maximum</em> velocity through the narrowest gap and the pin diameter as length scale. Heat transfer
          uses the <strong>Zukauskas</strong> staggered-bank Nusselt (C·Cₙ·Re<sup>m</sup>·Pr<sup>0.36</sup>·(S_T/S_L)<sup>0.2</sup>,
          with the tube-row correction Cₙ). Pressure drop uses the <strong>Gaddis-Gnielinski</strong> (VDI Heat Atlas)
          staggered drag coefficient per row, ΔP = ½·ζ·N_rows·ρ·u_max², so packing the pins tighter raises the
          pressure drop sharply. Each pin's contribution is derated by a circular-fin efficiency
          (tanh(mL)/mL, m = √(4h/k_pin·D)) using the selected pin material. Because the pinned baseplate is itself
          the sealing surface, only the base side is heated and you pick the pin-tip boundary: an <em>open-cavity</em>
          tip wetted by coolant (corrected length L + D/4) or an <em>against-housing</em> tip that bottoms out on the
          sealed housing floor and loses no heat there (adiabatic). The few-row inlet/outlet correction (f_nt) is
          neglected (valid for ≳10 rows), the wall-to-fluid Pr ratio is taken as 1, and any tip-clearance bypass flow
          is not modelled — reasonable for a first-order estimate, but confirm a direct-cooled design against CFD or a
          bench test.
        </p>
        <p className="note">
          <b>Validated:</b> the rectangular-duct correlations reproduce their Shah &amp; London anchor values
          exactly — laminar f·Re = 56.92 and Nusselt = 3.61 for a square channel, and 96 / 8.235 for the
          parallel-plate limit. A hand-worked single 5×3 mm × 100 mm water channel at 1 L/min (Dh = 3.75 mm,
          v = 1.11 m/s, Re ≈ 4150 turbulent) reproduces h ≈ 6270 W/m²K, a 0.66 kPa section pressure drop, a
          1.44 °C coolant temperature rise and a 180° bend loss of 1.23 kPa — all matching hand calculation.
          The pin-fin path is checked against an independent hand calculation too: a Ø1 mm staggered array at
          2 mm pitch in 40 °C water (approach 0.5 m/s → 1.0 m/s in the gaps, Re 1515) gives ζ = 0.482,
          h ≈ 30,200 W/m²K and a 4.78 kPa loss over 40 mm — turning a 0.035 kPa plain channel into 4.8 kPa while
          cutting its thermal resistance ~6.6×.
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
