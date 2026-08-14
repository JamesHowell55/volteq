import { useCallback, useMemo, useState } from 'react';
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
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { CELL_PRESETS, getCellPreset, type CellGeometry } from '../lib/batteryPackPhysics';
import { TIM_PRESETS, COOLANT_PRESETS } from '../lib/materials';
import { coolantTransportProperties } from '../lib/heatExchangerPhysics';
import {
  solveBatteryCellCooling, liquidHFromVelocity, type CoolingFace, type CellGeometryInput, type CoolingInput,
} from '../lib/batteryCellCoolingPhysics';

type CoolingModeUi = 'liquid' | 'ambient';
type LiquidHMode = 'direct' | 'flow';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const FACE_LABELS: Record<CoolingFace, string> = { side: 'Side', base: 'Base', top: 'Top' };

export default function BatteryCellCoolingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium } = useEntitlement();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  const [cellId, setCellId] = useState('21700_liion');
  const preset = getCellPreset(cellId);
  const geometry: CellGeometry = preset.geometry ?? 'cylindrical';

  const [diameterMm, setDiameterMm] = useState(preset.diameterMm ?? 21);
  const [lengthMm, setLengthMm] = useState(preset.lengthMm ?? 70);
  const [widthMm, setWidthMm] = useState(preset.widthMm ?? 150);
  const [thicknessMm, setThicknessMm] = useState(preset.thicknessMm ?? 27);
  const [kPrimary, setKPrimary] = useState(preset.kPrimaryWPerMK ?? 0.35);
  const [kSecondary, setKSecondary] = useState(preset.kSecondaryWPerMK ?? 27);
  const [internalResistanceMOhm, setInternalResistanceMOhm] = useState(preset.internalResistanceMOhm);

  const selectCell = (id: string) => {
    setCellId(id);
    const p = getCellPreset(id);
    setDiameterMm(p.diameterMm ?? 21);
    setLengthMm(p.lengthMm ?? 70);
    setWidthMm(p.widthMm ?? 150);
    setThicknessMm(p.thicknessMm ?? 27);
    setKPrimary(p.kPrimaryWPerMK ?? 0.35);
    setKSecondary(p.kSecondaryWPerMK ?? 27);
    setInternalResistanceMOhm(p.internalResistanceMOhm);
  };

  const [coolingFace, setCoolingFace] = useState<CoolingFace>('side');
  const [bothFaces, setBothFaces] = useState(false);
  const [contactFraction, setContactFraction] = useState(1.0);

  const [timId, setTimId] = useState('gapfiller');
  const timPreset = TIM_PRESETS.find((t) => t.id === timId) ?? TIM_PRESETS[0];
  const [timThicknessMm, setTimThicknessMm] = useState(timPreset.thicknessMm);
  const [timConductivity, setTimConductivity] = useState(timPreset.thermalConductivity);
  const selectTim = (id: string) => {
    setTimId(id);
    const t = TIM_PRESETS.find((x) => x.id === id) ?? TIM_PRESETS[0];
    setTimThicknessMm(t.thicknessMm);
    setTimConductivity(t.thermalConductivity);
  };

  const [currentA, setCurrentA] = useState(15);

  const [coolingModeUi, setCoolingModeUi] = useState<CoolingModeUi>('liquid');
  const [coolantTempC, setCoolantTempC] = useState(25);
  const [liquidHMode, setLiquidHMode] = useState<LiquidHMode>('direct');
  const [directHWPerM2K, setDirectHWPerM2K] = useState(500);
  const [flowCoolantId, setFlowCoolantId] = useState('water');
  const [flowVelocityMPerS, setFlowVelocityMPerS] = useState(0.3);
  const [flowGapMm, setFlowGapMm] = useState(3);
  const [ambientTempC, setAmbientTempC] = useState(25);

  const geomInput: CellGeometryInput = useMemo(() => ({
    geometry, diameterMm, lengthMm, widthMm, thicknessMm, kPrimaryWPerMK: kPrimary, kSecondaryWPerMK: kSecondary,
  }), [geometry, diameterMm, lengthMm, widthMm, thicknessMm, kPrimary, kSecondary]);

  const flowH = useMemo(() => {
    if (!isPremium || liquidHMode !== 'flow') return directHWPerM2K;
    const { nu, k, pr } = coolantTransportProperties(flowCoolantId, coolantTempC);
    return liquidHFromVelocity(flowVelocityMPerS, flowGapMm / 1000, nu, k, pr);
  }, [isPremium, liquidHMode, directHWPerM2K, flowCoolantId, flowVelocityMPerS, flowGapMm, coolantTempC]);

  const cooling: CoolingInput = useMemo(() => (
    coolingModeUi === 'liquid'
      ? { mode: 'liquid', hWPerM2K: flowH, coolantTempC }
      : { mode: 'ambient', ambientTempC }
  ), [coolingModeUi, flowH, coolantTempC, ambientTempC]);

  const effContactFraction = isPremium ? contactFraction : 1.0;
  const effBothFaces = isPremium ? bothFaces : false;

  const result = useMemo(() => solveBatteryCellCooling(
    geomInput, coolingFace, effBothFaces, effContactFraction,
    internalResistanceMOhm, currentA, timThicknessMm, timConductivity, cooling,
  ), [geomInput, coolingFace, effBothFaces, effContactFraction, internalResistanceMOhm, currentA, timThicknessMm, timConductivity, cooling]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    cellId, diameterMm, lengthMm, widthMm, thicknessMm, kPrimary, kSecondary, internalResistanceMOhm,
    coolingFace, bothFaces, contactFraction, timId, timThicknessMm, timConductivity, currentA,
    coolingModeUi, coolantTempC, liquidHMode, directHWPerM2K, flowCoolantId, flowVelocityMPerS, flowGapMm, ambientTempC,
  }), [cellId, diameterMm, lengthMm, widthMm, thicknessMm, kPrimary, kSecondary, internalResistanceMOhm,
    coolingFace, bothFaces, contactFraction, timId, timThicknessMm, timConductivity, currentA,
    coolingModeUi, coolantTempC, liquidHMode, directHWPerM2K, flowCoolantId, flowVelocityMPerS, flowGapMm, ambientTempC]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.cellId) setCellId(v.cellId);
    if (v.diameterMm != null) setDiameterMm(v.diameterMm);
    if (v.lengthMm != null) setLengthMm(v.lengthMm);
    if (v.widthMm != null) setWidthMm(v.widthMm);
    if (v.thicknessMm != null) setThicknessMm(v.thicknessMm);
    if (v.kPrimary != null) setKPrimary(v.kPrimary);
    if (v.kSecondary != null) setKSecondary(v.kSecondary);
    if (v.internalResistanceMOhm != null) setInternalResistanceMOhm(v.internalResistanceMOhm);
    if (v.coolingFace) setCoolingFace(v.coolingFace);
    if (v.bothFaces != null) setBothFaces(v.bothFaces);
    if (v.contactFraction != null) setContactFraction(v.contactFraction);
    if (v.timId) setTimId(v.timId);
    if (v.timThicknessMm != null) setTimThicknessMm(v.timThicknessMm);
    if (v.timConductivity != null) setTimConductivity(v.timConductivity);
    if (v.currentA != null) setCurrentA(v.currentA);
    if (v.coolingModeUi) setCoolingModeUi(v.coolingModeUi);
    if (v.coolantTempC != null) setCoolantTempC(v.coolantTempC);
    if (v.liquidHMode) setLiquidHMode(v.liquidHMode);
    if (v.directHWPerM2K != null) setDirectHWPerM2K(v.directHWPerM2K);
    if (v.flowCoolantId) setFlowCoolantId(v.flowCoolantId);
    if (v.flowVelocityMPerS != null) setFlowVelocityMPerS(v.flowVelocityMPerS);
    if (v.flowGapMm != null) setFlowGapMm(v.flowGapMm);
    if (v.ambientTempC != null) setAmbientTempC(v.ambientTempC);
  }, []);

  const saved = useSavedCalculations('battery-cell-cooling');
  const shareLink = useShareableLink(restoreInputs);

  const geomLabel = geometry === 'cylindrical' ? 'radial / axial' : 'through-thickness / in-plane';
  const dominantLabel = { conduction: 'internal cell conduction', tim: 'the TIM', convection: coolingModeUi === 'liquid' ? 'convection to coolant' : 'convection to ambient' }[result.dominantTerm];

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Heat generation',
      formula: 'P = I²·R_internal',
      substitution: `I = ${fmt(currentA, 1)} A, R_internal = ${fmt(internalResistanceMOhm, 2)} mΩ`,
      result: `P = ${fmt(result.heatGenerationW, 2)} W`,
    },
    {
      title: `Internal conduction (${geometry}, ${FACE_LABELS[coolingFace].toLowerCase()}-cooled${effBothFaces ? ', both faces' : ''})`,
      formula: geometry === 'cylindrical'
        ? (coolingFace === 'side' ? 'R = 1/(4π·k_radial·L)' : `R = L/(${effBothFaces ? 8 : 2}·k_axial·π·r²)`)
        : (coolingFace === 'side' ? `R = t/(${effBothFaces ? 8 : 2}·k_through·A)` : `R = L/(${effBothFaces ? 8 : 2}·k_inplane·A)`),
      substitution: `k = ${fmt(kPrimary, 2)} / ${fmt(kSecondary, 1)} W/m·K (${geomLabel})`,
      result: `R_cond = ${fmt(result.rCondKPerW, 4)} K/W, contact area = ${fmt(result.contactAreaM2 * 1e4, 2)} cm²`,
    },
    {
      title: 'TIM + convection, hotspot temperature',
      formula: 'R_TIM = t/(k·A),  R_conv = 1/(h·A),  T_hotspot = T_ref + P·(R_cond+R_TIM+R_conv)',
      substitution: `h = ${fmt(result.hWPerM2K, 1)} W/m²K, T_ref = ${fmt(result.coolantOrAmbientTempC, 1)}°C`,
      result: `R_total = ${fmt(result.rTotalKPerW, 4)} K/W → T_hotspot = ${fmt(result.hotspotTempC, 1)}°C (dominant: ${dominantLabel})`,
    },
  ], [currentA, internalResistanceMOhm, result, geometry, coolingFace, effBothFaces, kPrimary, kSecondary, geomLabel, dominantLabel]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Cell & cooling path',
    rows: [
      { label: 'Cell', value: preset.label },
      { label: 'Geometry', value: geometry },
      { label: 'Cooling face', value: `${FACE_LABELS[coolingFace]}${effBothFaces ? ' (both)' : ''}` },
      { label: 'TIM', value: `${timPreset.label}, ${fmt(timThicknessMm, 2)} mm` },
      { label: 'Current', value: `${fmt(currentA, 1)} A` },
      { label: 'Cooling mode', value: coolingModeUi === 'liquid' ? `Liquid, ${fmt(coolantTempC, 0)}°C` : `Ambient, ${fmt(ambientTempC, 0)}°C` },
    ] as ReportRow[],
  }]), [preset, geometry, coolingFace, effBothFaces, timPreset, timThicknessMm, currentA, coolingModeUi, coolantTempC, ambientTempC]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Heat generation', value: `${fmt(result.heatGenerationW, 2)} W` },
      { label: 'R_cond / R_TIM / R_conv', value: `${fmt(result.rCondKPerW, 4)} / ${fmt(result.rTimKPerW, 4)} / ${fmt(result.rConvKPerW, 4)} K/W` },
      { label: 'Total thermal resistance', value: `${fmt(result.rTotalKPerW, 4)} K/W` },
      { label: 'Surface temperature', value: `${fmt(result.surfaceTempC, 1)} °C` },
      { label: 'Hotspot temperature', value: `${fmt(result.hotspotTempC, 1)} °C` },
      { label: 'Dominant resistance', value: dominantLabel },
    ] as ReportRow[],
  }]), [result, dominantLabel]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Battery_Cell_Cooling_Calculator',
      pageTitle: 'Battery Cell Cooling',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Steady-state thermal path from a battery cell\'s internal heat generation (P=I²·R_internal, Joule heating only — the reversible/entropic term, typically ~10-15% of ohmic heating at moderate-to-high C-rate, is not included) through the cell\'s own anisotropic conduction, a thermal interface material, and convection to a liquid coolant or ambient air. Internal conduction uses distributed-generation (not point-source) formulas: R=1/(4πkL) for a radially-cooled cylinder, R=t/(2kA) for a one-face-cooled slab, R=t/(8kA) for a both-faces-cooled slab. Cylindrical-cell radial thermal conductivity is reasonably well-constrained in the literature (~0.2-0.5 W/m·K); axial conductivity is genuinely contested across measurement methods (published range ~1.5-30 W/m·K) and defaulted toward the higher, more-cited value, disclosed as uncertain. Prismatic/pouch through-thickness (~0.5-0.8 W/m·K) and in-plane (~20 W/m·K) values are representative, not manufacturer datasheet figures. Base/top cooling of cylindrical cells, or base/top cooling of prismatic/pouch cells, uses a long, often-poor real-world conduction path compared to side (can-wall or large-face) cooling — flagged with a warning when selected. No published worked example exists in the literature for this exact end-to-end configuration; validated via self-consistent hand-derivations (radius-independence of the cylindrical formula, the exact 2x/8x distributed-generation factors, and a full series-resistance sanity case) rather than a third-party number. Verify against a cell datasheet and, for a final design, FEA or measurement.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Battery Cell Cooling</div>
          <h1>Battery Cell Cooling</h1>
          <p>
            Steady-state thermal path from a cell's internal heat generation to a coolant or ambient air —
            cylindrical (18650/21700/26650/4680), prismatic, or pouch cells, cooled from the base, sides, or
            top, through a thermal interface material. Uses distributed (not point-source) conduction, since
            a cell's heat generation fills its volume rather than starting at a single point.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Cell</span></div>
            <div className="field">
              <label>Cell format</label>
              <select value={cellId} onChange={(e) => selectCell(e.target.value)}>
                {CELL_PRESETS.filter((p) => p.id !== 'custom').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">Custom</option>
              </select>
              {preset.kNote && <span className="hint" style={{ display: 'block', marginTop: '0.3rem' }}>⚠ {preset.kNote}</span>}
            </div>
            <PremiumGate feature="Custom cell dimensions & conductivity">
              <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                {geometry === 'cylindrical' ? (
                  <>
                    <div className="field"><label>Diameter ({lenUnit})</label><input autoComplete="off" type="number" min={5} step={0.5} value={toDisplay(diameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Length ({lenUnit})</label><input autoComplete="off" type="number" min={5} step={0.5} value={toDisplay(lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Radial k (W/m·K)<InfoTooltip>Effective thermal conductivity across the wound jellyroll layers — low, since it crosses many low-conductivity electrode/separator interfaces.</InfoTooltip></label><input autoComplete="off" type="number" min={0.05} step={0.05} value={kPrimary} onChange={(e) => setKPrimary(Number(e.target.value))} /></div>
                    <div className="field"><label>Axial k (W/m·K)<InfoTooltip>Effective thermal conductivity along the winding axis, through the metal current-collector foils — much higher than radial, though the published range is wide (roughly 2-30 W/m·K depending on measurement method).</InfoTooltip></label><input autoComplete="off" type="number" min={0.5} step={0.5} value={kSecondary} onChange={(e) => setKSecondary(Number(e.target.value))} /></div>
                  </>
                ) : (
                  <>
                    <div className="field"><label>Width ({lenUnit})</label><input autoComplete="off" type="number" min={5} step={1} value={toDisplay(widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Length/height ({lenUnit})</label><input autoComplete="off" type="number" min={5} step={1} value={toDisplay(lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Thickness ({lenUnit})<InfoTooltip>The thin, stacking-direction dimension — this is the through-plane (low-conductivity) axis.</InfoTooltip></label><input autoComplete="off" type="number" min={1} step={0.5} value={toDisplay(thicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                    <div className="field"><label>Through-thickness k (W/m·K)</label><input autoComplete="off" type="number" min={0.1} step={0.05} value={kPrimary} onChange={(e) => setKPrimary(Number(e.target.value))} /></div>
                    <div className="field"><label>In-plane k (W/m·K)</label><input autoComplete="off" type="number" min={1} step={1} value={kSecondary} onChange={(e) => setKSecondary(Number(e.target.value))} /></div>
                  </>
                )}
                <div className="field"><label>Internal resistance (mΩ)</label><input autoComplete="off" type="number" min={0.1} step={0.5} value={internalResistanceMOhm} onChange={(e) => setInternalResistanceMOhm(Number(e.target.value))} /></div>
              </div>
            </PremiumGate>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Cooling path</span></div>
            <div className="segmented">
              {(['side', 'base', 'top'] as CoolingFace[]).map((f) => (
                <button key={f} className={coolingFace === f ? 'active' : ''} onClick={() => setCoolingFace(f)}>{FACE_LABELS[f]}</button>
              ))}
            </div>
            {result.poorPathWarning && <p className="hint" style={{ color: 'var(--warn, #f59e0b)', marginTop: '0.5rem' }}>⚠ {result.poorPathWarning}</p>}
            {!(geometry === 'cylindrical' && coolingFace === 'side') && (
              <PremiumGate feature="Both-faces cooling & partial-contact modeling">
                <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="checkbox" checked={bothFaces} onChange={(e) => setBothFaces(e.target.checked)} style={{ width: 'auto' }} />
                      Cool from both matching faces
                      <InfoTooltip>Cooled from both the front and back of this face (e.g. cold plates on both large faces of a prismatic cell, or both ends of a cylindrical cell) — cuts the internal conduction resistance to a quarter of single-face cooling.</InfoTooltip>
                    </label>
                  </div>
                </div>
              </PremiumGate>
            )}
            {geometry === 'cylindrical' && coolingFace === 'side' && (
              <PremiumGate feature="Partial-contact modeling">
                <div className="field" style={{ marginTop: '0.5rem' }}>
                  <label>Can circumference in contact (0-1)<InfoTooltip>Fraction of the cylindrical can's circumference actually touching the cooling surface — 1.0 for a full wraparound clamp, lower for a flat cold-plate contact.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0.05} max={1} step={0.05} value={contactFraction} onChange={(e) => setContactFraction(Math.min(1, Math.max(0.05, Number(e.target.value))))} />
                </div>
              </PremiumGate>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Thermal interface material</span></div>
            <div className="field">
              <label>TIM</label>
              <select value={timId} onChange={(e) => selectTim(e.target.value)}>
                {TIM_PRESETS.filter((t) => t.id !== 'custom').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                <option value="custom">Custom</option>
              </select>
            </div>
            <PremiumGate feature="Custom TIM properties">
              <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                <div className="field"><label>Thickness ({lenUnit})</label><input autoComplete="off" type="number" min={0.02} step={0.05} value={toDisplay(timThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setTimThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field"><label>Conductivity (W/m·K)</label><input autoComplete="off" type="number" min={0.1} step={0.1} value={timConductivity} onChange={(e) => setTimConductivity(Number(e.target.value))} /></div>
              </div>
            </PremiumGate>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Duty &amp; cooling</span></div>
            <div className="field">
              <label>Cell current (A)<InfoTooltip>Discharge or charge current used for I²R heat generation. {preset.capacityAh > 0 ? `${fmt(currentA / preset.capacityAh, 2)}C for this cell's ${fmt(preset.capacityAh, 1)} Ah capacity.` : ''}</InfoTooltip></label>
              <input autoComplete="off" type="number" min={0} step={1} value={currentA} onChange={(e) => setCurrentA(Number(e.target.value))} />
            </div>
            <div className="segmented" style={{ margin: '0.5rem 0' }}>
              <button className={coolingModeUi === 'liquid' ? 'active' : ''} onClick={() => setCoolingModeUi('liquid')}>Liquid coolant</button>
              <button className={coolingModeUi === 'ambient' ? 'active' : ''} onClick={() => setCoolingModeUi('ambient')}>Case to ambient</button>
            </div>
            {coolingModeUi === 'liquid' ? (
              <>
                <div className="field">
                  <label>Coolant temperature ({tempUnit})</label>
                  <input autoComplete="off" type="number" value={toDisplay(coolantTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCoolantTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                </div>
                {isPremium && (
                  <div className="segmented" style={{ margin: '0.5rem 0' }}>
                    <button className={liquidHMode === 'direct' ? 'active' : ''} onClick={() => setLiquidHMode('direct')}>Direct h entry</button>
                    <button className={liquidHMode === 'flow' ? 'active' : ''} onClick={() => setLiquidHMode('flow')}>From flow velocity</button>
                  </div>
                )}
                {(!isPremium || liquidHMode === 'direct') ? (
                  <div className="field">
                    <label>Heat-transfer coefficient (W/m²K)<InfoTooltip>Typical: 300-1000 for a cold-plate/jacket liquid contact, 2000-6000 for direct immersion or high-velocity jet cooling.</InfoTooltip></label>
                    <input autoComplete="off" type="number" min={10} step={50} value={directHWPerM2K} onChange={(e) => setDirectHWPerM2K(Number(e.target.value))} />
                  </div>
                ) : (
                  <PremiumGate feature="Flow-derived heat-transfer coefficient">
                    <div className="grid grid-2">
                      <div className="field">
                        <label>Coolant</label>
                        <select value={flowCoolantId} onChange={(e) => setFlowCoolantId(e.target.value)}>
                          {COOLANT_PRESETS.filter((c) => c.id !== 'custom').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Flow velocity (m/s)</label><input autoComplete="off" type="number" min={0.01} step={0.05} value={flowVelocityMPerS} onChange={(e) => setFlowVelocityMPerS(Number(e.target.value))} /></div>
                      <div className="field"><label>Channel gap ({lenUnit})<InfoTooltip>The coolant passage's characteristic gap next to the cell — used as the hydraulic diameter for a simplified single-passage flow estimate.</InfoTooltip></label><input autoComplete="off" type="number" min={0.5} step={0.5} value={toDisplay(flowGapMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFlowGapMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                      <div className="hint" style={{ alignSelf: 'end' }}>h ≈ {fmt(flowH, 0)} W/m²K</div>
                    </div>
                  </PremiumGate>
                )}
              </>
            ) : (
              <div className="field">
                <label>Ambient temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(ambientTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAmbientTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                <span className="hint">Natural convection, solved from the cell's own geometry — no fan/forced-air input.</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Hotspot temperature</div>
                <div className={`value ${result.hotspotTempC > 60 ? 'neg' : result.hotspotTempC > 45 ? 'warn' : 'pos'}`}>{fmt(result.hotspotTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">at {fmt(currentA, 1)} A, {fmt(result.coolantOrAmbientTempC, 0)}°C {coolingModeUi === 'liquid' ? 'coolant' : 'ambient'}</div>
              </div>
              <div className="result-tile">
                <div className="label">Heat generation</div>
                <div className="value">{fmt(result.heatGenerationW, 2)}<span className="unit">W</span></div>
                <div className="hint">I²R, {fmt(internalResistanceMOhm, 2)} mΩ</div>
              </div>
              <div className="result-tile">
                <div className="label">Total thermal resistance</div>
                <div className="value">{fmt(result.rTotalKPerW, 3)}<span className="unit">K/W</span></div>
                <div className="hint">dominated by {dominantLabel}</div>
              </div>
              <div className="result-tile">
                <div className="label">Surface temperature</div>
                <div className="value">{fmt(result.surfaceTempC, 1)}<span className="unit">°C</span></div>
                <div className="hint">h = {fmt(result.hWPerM2K, 1)} W/m²K</div>
              </div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead><tr><th>Term</th><th>Resistance (K/W)</th><th>Share</th></tr></thead>
                <tbody>
                  <tr style={result.dominantTerm === 'conduction' ? { fontWeight: 700, color: 'var(--accent)' } : undefined}><td>Internal conduction</td><td>{fmt(result.rCondKPerW, 4)}</td><td>{fmt(100 * result.rCondKPerW / result.rTotalKPerW, 0)}%</td></tr>
                  <tr style={result.dominantTerm === 'tim' ? { fontWeight: 700, color: 'var(--accent)' } : undefined}><td>TIM</td><td>{fmt(result.rTimKPerW, 4)}</td><td>{fmt(100 * result.rTimKPerW / result.rTotalKPerW, 0)}%</td></tr>
                  <tr style={result.dominantTerm === 'convection' ? { fontWeight: 700, color: 'var(--accent)' } : undefined}><td>Convection</td><td>{fmt(result.rConvKPerW, 4)}</td><td>{fmt(100 * result.rConvKPerW / result.rTotalKPerW, 0)}%</td></tr>
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
        <GuideBacklink calculatorPath="/battery-cell-cooling" />
        <p className="note">
          Heat generation is I²·R_internal (Joule heating only — the reversible/entropic term, typically
          ~10-15% of ohmic heating at moderate-to-high C-rate and sign-dependent on SOC/charge-discharge, is
          not modelled). Because a cell generates heat throughout its volume rather than at a single point,
          the internal conduction resistance uses <strong>distributed-generation</strong> forms, not naive
          point-source conduction: a radially-cooled cylinder gives R=1/(4π·k·L) (independent of radius — a
          useful self-check); a one-face-cooled slab gives R=t/(2·k·A); a both-faces-cooled slab gives
          R=t/(8·k·A) — four times lower than one-face, not two. Cylindrical cells' radial conductivity
          (~0.2-0.5 W/m·K) is reasonably well-constrained in the literature; axial conductivity is genuinely
          contested across measurement methods (published range roughly 2-30 W/m·K) and defaulted here toward
          the higher, more-cited value — disclosed as uncertain, and largely irrelevant for the recommended
          side-cooling path. Prismatic/pouch through-thickness (~0.5-0.8 W/m·K) and in-plane (~20 W/m·K)
          values are representative literature figures, not any specific manufacturer's datasheet.
          <strong> Base/top cooling is flagged with a warning</strong> — real packs almost always cool
          cylindrical cells from the can wall (side) and prismatic/pouch cells from their large flat faces
          (side, in this tool's convention), not end-to-end through the low-conductivity axis. Ambient
          (natural-convection) cooling reuses this site's existing Churchill-Chu correlations — horizontal
          cylinder for cylindrical cells, vertical flat plate for prismatic/pouch — solved by bisection on
          surface temperature.
        </p>
        <p className="note">
          <b>Validated:</b> the cylindrical radial formula reproduces its hand-derived value exactly and is
          confirmed independent of cell radius; the slab formula reproduces exactly half the naive
          point-source resistance when cooled from one face, and exactly one-eighth when cooled from both;
          a full series-stack case (21700 at 3C, side-cooled to water) reproduces a hand-worked 15°C
          core-to-coolant rise and correctly identifies internal conduction — not convection — as the
          dominant resistance, a genuinely useful design insight this tool surfaces directly. No published
          worked example exists in the literature for this exact end-to-end configuration, so validation
          here is via these self-consistent hand-derivations rather than a third-party number — verify
          against a cell datasheet and, for a final design, FEA or measurement.
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
