import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_TEMP, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { MATERIALS, COOLANT_PRESETS } from '../lib/materials';
import {
  HX_CORE_PROFILES, computeHxCoreGeometry, defaultDimensionsForHxProfile,
  type HxCoreProfileId, type HxCoreDimensions, type RoundTubeDimensions,
} from '../lib/hxCoreGeometry';
import { solveHeatExchanger, coolantTransportProperties } from '../lib/heatExchangerPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type FinMaterialId = 'aluminium' | 'copper' | 'custom';

export default function HeatExchangerSizingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [profile, setProfile] = useState<HxCoreProfileId>('roundTubePlateFin');
  const [dims, setDims] = useState<HxCoreDimensions>(defaultDimensionsForHxProfile('roundTubePlateFin'));
  const handleProfileChange = (p: HxCoreProfileId) => {
    setProfile(p);
    setDims(defaultDimensionsForHxProfile(p));
  };
  const geometry = useMemo(() => computeHxCoreGeometry(dims), [dims]);
  const louverEnhancementFactor = dims.profile === 'roundTubeLouveredFin' ? (dims.louverEnhancementFactor ?? 2.2) : 1;

  const [finMaterialId, setFinMaterialId] = useState<FinMaterialId>('aluminium');
  const [customFinConductivity, setCustomFinConductivity] = useState(205);
  const finThermalConductivityWPerMK = finMaterialId === 'custom' ? customFinConductivity : MATERIALS[finMaterialId].thermalConductivity;

  const [coolantPresetId, setCoolantPresetId] = useState('glycol50');
  const [customDensity, setCustomDensity] = useState(1060);
  const [customCp, setCustomCp] = useState(3300);
  const [customNu, setCustomNu] = useState(3.0e-6);
  const [customK, setCustomK] = useState(0.40);
  const [coolantFlowRateLPerMin, setCoolantFlowRateLPerMin] = useState(15);
  const [coolantInletTempC, setCoolantInletTempC] = useState(65);
  const [airInletTempC, setAirInletTempC] = useState(35);
  const [airFaceVelocityMPerS, setAirFaceVelocityMPerS] = useState(5);

  const coolant = useMemo(() => {
    if (coolantPresetId === 'custom') {
      const pr = customK > 0 ? (customNu * customDensity * customCp) / customK : 0;
      return { densityKgPerM3: customDensity, specificHeatJPerKgK: customCp, nu: customNu, k: customK, pr };
    }
    const preset = COOLANT_PRESETS.find((p) => p.id === coolantPresetId) ?? COOLANT_PRESETS[0];
    const transport = coolantTransportProperties(coolantPresetId, coolantInletTempC);
    return { densityKgPerM3: preset.densityKgPerM3, specificHeatJPerKgK: preset.specificHeatJPerKgK, nu: transport.nu, k: transport.k, pr: transport.pr };
  }, [coolantPresetId, coolantInletTempC, customDensity, customCp, customNu, customK]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    profile, dims, finMaterialId, customFinConductivity,
    coolantPresetId, customDensity, customCp, customNu, customK,
    coolantFlowRateLPerMin, coolantInletTempC, airInletTempC, airFaceVelocityMPerS,
  }), [profile, dims, finMaterialId, customFinConductivity, coolantPresetId, customDensity, customCp, customNu, customK,
    coolantFlowRateLPerMin, coolantInletTempC, airInletTempC, airFaceVelocityMPerS]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.profile != null) setProfile(v.profile);
    if (v.dims != null) setDims(v.dims);
    if (v.finMaterialId != null) setFinMaterialId(v.finMaterialId);
    if (v.customFinConductivity != null) setCustomFinConductivity(v.customFinConductivity);
    if (v.coolantPresetId != null) setCoolantPresetId(v.coolantPresetId);
    if (v.customDensity != null) setCustomDensity(v.customDensity);
    if (v.customCp != null) setCustomCp(v.customCp);
    if (v.customNu != null) setCustomNu(v.customNu);
    if (v.customK != null) setCustomK(v.customK);
    if (v.coolantFlowRateLPerMin != null) setCoolantFlowRateLPerMin(v.coolantFlowRateLPerMin);
    if (v.coolantInletTempC != null) setCoolantInletTempC(v.coolantInletTempC);
    if (v.airInletTempC != null) setAirInletTempC(v.airInletTempC);
    if (v.airFaceVelocityMPerS != null) setAirFaceVelocityMPerS(v.airFaceVelocityMPerS);
  }, []);

  const saved = useSavedCalculations('heat-exchanger-sizing');
  const shareLink = useShareableLink(restoreInputs);

  const result = useMemo(() => solveHeatExchanger({
    geometry, finThermalConductivityWPerMK, louverEnhancementFactor, coolant,
    coolantInletTempC, coolantFlowRateLPerMin, airInletTempC, airFaceVelocityMPerS,
  }), [geometry, finThermalConductivityWPerMK, louverEnhancementFactor, coolant, coolantInletTempC, coolantFlowRateLPerMin, airInletTempC, airFaceVelocityMPerS]);

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Core geometry',
      formula: 'σ = (finPitch−finThickness)/finPitch × (rowPitch−rowBlockage)/rowPitch — free-flow area fraction (a disclosed geometric approximation, not a cited formula)',
      substitution: `${geometry.nTubes} tube(s)/row(s), frontal area ${fmt(geometry.frontalAreaM2 * 1e6, 0)} mm²`,
      result: `σ = ${fmt(geometry.sigma, 4)}${!geometry.geometryValid ? ' (⚠ entered dimensions overlap — clamped; check tube/fin sizes vs. pitch)' : ''}`,
    },
    {
      title: 'Mass flow rates',
      formula: 'mdot_air = ρ_air·V_face·A_frontal;  mdot_coolant = (flow L/min ÷ 60000)·ρ_coolant',
      substitution: `ρ_air @ ${fmt(airInletTempC, 0)}°C (ideal gas), V_face = ${fmt(airFaceVelocityMPerS, 2)} m/s, flow = ${fmt(coolantFlowRateLPerMin, 1)} L/min`,
      result: `mdot_air = ${fmt(result.airMassFlowKgPerS, 4)} kg/s, mdot_coolant = ${fmt(result.coolantMassFlowKgPerS, 4)} kg/s`,
    },
    {
      title: 'Channel velocities (continuity)',
      formula: 'V_air,channel = V_face / σ;  V_coolant,channel = mdot_coolant / (ρ_coolant·A_coolant,flow)',
      result: `V_air,channel = ${fmt(result.airChannelVelocityMPerS, 2)} m/s, V_coolant,channel = ${fmt(result.coolantChannelVelocityMPerS, 3)} m/s`,
    },
    {
      title: 'Air-side convection (duct-flow idealization)',
      formula: 'Re = V·Dh/ν;  Re≥2300: Nu = 0.023·Re^0.8·Pr^0.4 (Dittus-Boelter); laminar: Nu = 7.54 (parallel-plate duct)',
      substitution: `Dh = ${fmt(geometry.airDuctDhM * 1000, 3)} mm`,
      result: `Re = ${fmt(result.air.reynolds, 0)} (${result.air.regime}), Nu = ${fmt(result.air.nusselt, 2)}, h = ${fmt(result.air.h, 2)} W/m²K${louverEnhancementFactor !== 1 ? ` × ${fmt(louverEnhancementFactor, 2)} louver enhancement = ${fmt(result.airHEnhancedWPerM2K, 2)} W/m²K` : ''}`,
    },
    {
      title: 'Air-side fin efficiency',
      formula: 'Lc = L + t/2 (L = half the inter-row gap);  m = √(2h/(k_fin·t));  η = tanh(m·Lc)/(m·Lc)',
      substitution: `k_fin = ${fmt(finThermalConductivityWPerMK, 0)} W/m·K, t = ${fmt(geometry.airFinThicknessM * 1000, 2)} mm`,
      result: `η = ${fmt(result.airFinEfficiency, 4)}, effective air-side area = ${fmt(result.airSideEffectiveAreaM2, 3)} m²`,
    },
    {
      title: 'Coolant-side convection (duct-flow idealization)',
      formula: 'Re = V·Dh/ν;  Re≥2300: Nu = 0.023·Re^0.8·Pr^0.3 (Dittus-Boelter); laminar: Nu = 3.66 (circular duct/port)',
      substitution: `Dh = ${fmt(geometry.coolantDuctDhM * 1000, 3)} mm`,
      result: `Re = ${fmt(result.coolantSide.reynolds, 0)} (${result.coolantSide.regime}), Nu = ${fmt(result.coolantSide.nusselt, 2)}, h = ${fmt(result.coolantSide.h, 2)} W/m²K`,
    },
    {
      title: 'Overall UA (two-resistance network; tube/fin wall conduction neglected)',
      formula: '1/UA = 1/(h_air,eff·A_air,eff) + 1/(h_coolant·A_coolant)',
      substitution: `A_coolant = ${fmt(geometry.coolantWettedAreaM2, 4)} m²`,
      result: `UA = ${fmt(result.uaWPerK, 2)} W/K`,
    },
    {
      title: 'Capacity rates, Cr and NTU',
      formula: 'C = mdot·cp;  Cr = Cmin/Cmax;  NTU = UA/Cmin',
      substitution: `C_air = ${fmt(result.cAirWPerK, 1)} W/K, C_coolant = ${fmt(result.cCoolantWPerK, 1)} W/K`,
      result: `Cmin = ${fmt(result.cMinWPerK, 1)} W/K, Cr = ${fmt(result.crRatio, 4)}, NTU = ${fmt(result.ntu, 4)}`,
    },
    {
      title: 'Effectiveness (crossflow, both fluids unmixed)',
      formula: 'ε = 1 − exp[(1/Cr)·NTU^0.22·(exp(−Cr·NTU^0.78) − 1)]  (Cr=0: ε = 1−exp(−NTU))',
      result: `ε = ${fmt(result.effectiveness * 100, 2)}%`,
    },
    {
      title: 'Heat rejected and outlet temperatures',
      formula: 'Q = ε·Cmin·(Tin,coolant − Tin,air);  Tout,coolant = Tin,coolant − Q/C_coolant;  Tout,air = Tin,air + Q/C_air',
      result: `Q = ${fmt(result.heatRejectedW, 0)} W, Tout,coolant = ${fmt(result.coolantOutletTempC, 1)}°C, Tout,air = ${fmt(result.airOutletTempC, 1)}°C`,
    },
  ], [geometry, result, airInletTempC, airFaceVelocityMPerS, coolantFlowRateLPerMin, finThermalConductivityWPerMK, louverEnhancementFactor]);

  const inputSections: ReportSection[] = useMemo(() => {
    const geoRows: ReportRow[] = [
      { label: 'Core type', value: HX_CORE_PROFILES.find((p) => p.id === profile)?.label ?? profile },
      { label: 'Tubes / rows', value: `${geometry.nTubes}` },
      { label: 'Frontal area', value: `${fmt(geometry.frontalAreaM2 * 1e6, 0)} mm²` },
      { label: 'Free-flow fraction σ', value: fmt(geometry.sigma, 4) },
      { label: 'Fin/tube material conductivity', value: `${fmt(finThermalConductivityWPerMK, 0)} W/m·K` },
    ];
    const coolantRows: ReportRow[] = [
      { label: 'Coolant', value: coolantPresetId === 'custom' ? 'Custom' : (COOLANT_PRESETS.find((p) => p.id === coolantPresetId)?.label ?? coolantPresetId) },
      { label: 'Inlet temperature', value: `${fmtU(coolantInletTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Flow rate', value: `${fmt(coolantFlowRateLPerMin, 1)} L/min` },
      { label: 'Properties (ρ / cp / Pr)', value: `${fmt(coolant.densityKgPerM3, 0)} kg/m³ / ${fmt(coolant.specificHeatJPerKgK, 0)} J/kg·K / ${fmt(coolant.pr, 2)}` },
    ];
    const airRows: ReportRow[] = [
      { label: 'Inlet temperature', value: `${fmtU(airInletTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Face velocity', value: `${fmt(airFaceVelocityMPerS, 2)} m/s` },
    ];
    return [
      { heading: 'Core', rows: geoRows },
      { heading: 'Coolant', rows: coolantRows },
      { heading: 'Air', rows: airRows },
    ];
  }, [profile, geometry, finThermalConductivityWPerMK, coolantPresetId, coolant, coolantInletTempC, coolantFlowRateLPerMin, airInletTempC, airFaceVelocityMPerS, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Heat rejected', value: `${fmt(result.heatRejectedW, 0)} W (${fmt(result.heatRejectedW / 1000, 2)} kW)` },
      { label: 'Coolant outlet temperature', value: `${fmtU(result.coolantOutletTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Air outlet temperature', value: `${fmtU(result.airOutletTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      { label: 'Effectiveness', value: `${fmt(result.effectiveness * 100, 2)}%` },
      { label: 'UA / NTU / Cr', value: `${fmt(result.uaWPerK, 2)} W/K / ${fmt(result.ntu, 4)} / ${fmt(result.crRatio, 4)}` },
      { label: 'Air-side h (Re)', value: `${fmt(result.airHEnhancedWPerM2K, 1)} W/m²K (Re ${fmt(result.air.reynolds, 0)}, ${result.air.regime})` },
      { label: 'Coolant-side h (Re)', value: `${fmt(result.coolantSide.h, 1)} W/m²K (Re ${fmt(result.coolantSide.reynolds, 0)}, ${result.coolantSide.regime})` },
    ],
  }]), [result, unitSystem]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Heat_Exchanger_Sizing',
      pageTitle: 'Heat Exchanger Sizing Calculator (Liquid-to-Air)',
      accentHex,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Effectiveness-NTU method, crossflow with both fluids unmixed. Air-side and coolant-side convection use a duct-flow idealization (Dittus-Boelter turbulent / fixed laminar Nusselt constants), not a Zukauskas tube-bank or Kays & London empirical-surface correlation — a deliberate, disclosed accuracy trade-off. Free-flow fraction (σ) is a geometrically-motivated approximation. Tube/fin wall conduction neglected. Louvered-fin core type applies a literature-typical (not first-principles) air-side enhancement factor. Geometry models a single tube row in the airflow direction — multi-row-deep cores reject substantially more heat for the same footprint. Screening tool — not a substitute for surface-specific correlation data, CFD, or wind-tunnel/calorimetric test.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Heat Exchanger Sizing Calculator</div>
          <h1>Heat Exchanger Sizing Calculator (Liquid-to-Air)</h1>
          <p>
            Liquid-to-air heat exchanger sizing (radiator / oil cooler / chiller core) — pick a core type,
            enter its geometry, coolant inlet temperature and flow rate, and air inlet temperature and face
            velocity, and get the heat rejected and both outlet temperatures via the effectiveness-NTU method.
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
            <div className="card-title"><span><span className="step-num">1</span>Core type &amp; geometry</span></div>
            <div className="segmented">
              {HX_CORE_PROFILES.map((p) => (
                <button key={p.id} className={profile === p.id ? 'active' : ''} onClick={() => handleProfileChange(p.id)}>{p.label}</button>
              ))}
            </div>
            <span className="hint">{HX_CORE_PROFILES.find((p) => p.id === profile)?.description}</span>

            {(dims.profile === 'roundTubePlateFin' || dims.profile === 'roundTubeLouveredFin') && (
              <div className="grid grid-3" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>
                    Tube run ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>Tube length, header to header — one of the core's two frontal dimensions.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.tubeRunMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeRunMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>
                    Stack height ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>The other frontal dimension — tube rows are stacked across it at the transverse pitch.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.stackMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, stackMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>
                    Core depth ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>Air flow-path length through the core (fin depth in the airflow direction).</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.coreDepthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, coreDepthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Tube OD ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.tubeOdMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeOdMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Tube wall ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.05} value={toDisplay(dims.tubeWallMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeWallMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Tube pitch ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.transversePitchMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, transversePitchMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Fin pitch ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(dims.finPitchMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, finPitchMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Fin thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.01} value={toDisplay(dims.finThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, finThicknessMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                {dims.profile === 'roundTubeLouveredFin' && (
                  <div className="field">
                    <label>
                      Louver enhancement
                      <InfoTooltip>Air-side heat-transfer enhancement of louvered vs. plain fins. Published experimental comparisons report roughly 2-3× (2.2-2.8× across tested Reynolds ranges). A disclosed typical multiplier, not the full Chang &amp; Wang louver-geometry correlation — refine against surface-specific data for a final design.</InfoTooltip>
                    </label>
                    <input autoComplete="off" type="number" min={1} max={5} step={0.1} value={(dims as RoundTubeDimensions).louverEnhancementFactor ?? 2.2} onChange={(e) => setDims({ ...dims, louverEnhancementFactor: Number(e.target.value) })} />
                  </div>
                )}
              </div>
            )}
            {dims.profile === 'microchannelFlatTube' && (
              <div className="grid grid-3" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>
                    Tube run ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>Flat-tube length, header to header — one of the core's two frontal dimensions.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.tubeRunMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeRunMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>
                    Stack height ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>The other frontal dimension — flat tubes are stacked across it at the tube spacing.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.stackMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, stackMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>
                    Tube width ({unitLabel(unitSystem, UNIT_LENGTH)})
                    <InfoTooltip>The flat tube's wide dimension — this is also the core depth (air flow-path length).</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.tubeWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Tube height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.tubeHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeHeightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Tube spacing ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.tubeSpacingMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, tubeSpacingMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Ports per tube</label>
                  <input autoComplete="off" type="number" min={1} step={1} value={dims.portsPerTube} onChange={(e) => setDims({ ...dims, portsPerTube: Math.max(1, Math.round(Number(e.target.value))) })} />
                </div>
                <div className="field">
                  <label>Port width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.portWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, portWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Port height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(dims.portHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, portHeightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Fin pitch ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.1} step={0.1} value={toDisplay(dims.finPitchMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, finPitchMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Fin thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0.01} step={0.01} value={toDisplay(dims.finThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, finThicknessMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
              </div>
            )}

            {!geometry.geometryValid && (
              <span className="hint" style={{ color: 'var(--warn)', display: 'block', marginTop: '0.5rem' }}>
                ⚠ Entered dimensions physically overlap (tube/port larger than its pitch, or fin thickness ≥ fin pitch)
                — free-flow fraction clamped to a placeholder. Fix the geometry before trusting the numbers.
              </span>
            )}

            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Fin / tube material</label>
              <div className="segmented">
                <button className={finMaterialId === 'aluminium' ? 'active' : ''} onClick={() => setFinMaterialId('aluminium')}>Aluminium</button>
                <button className={finMaterialId === 'copper' ? 'active' : ''} onClick={() => setFinMaterialId('copper')}>Copper</button>
                <button className={finMaterialId === 'custom' ? 'active' : ''} onClick={() => setFinMaterialId('custom')}>Custom</button>
              </div>
              {finMaterialId === 'custom' && (
                <input autoComplete="off" type="number" min={1} step={1} value={customFinConductivity} onChange={(e) => setCustomFinConductivity(Number(e.target.value))} style={{ marginTop: '0.4rem' }} placeholder="W/m·K" />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Coolant</span></div>
            <div className="field">
              <label>Coolant</label>
              <select value={coolantPresetId} onChange={(e) => setCoolantPresetId(e.target.value)}>
                {COOLANT_PRESETS.filter((p) => p.id !== 'custom').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">Custom</option>
              </select>
              <span className="hint">
                {coolantPresetId === 'water'
                  ? 'Transport properties temperature-interpolated from standard tabulated values (0–100°C).'
                  : coolantPresetId === 'custom'
                    ? 'Enter your fluid\'s properties directly.'
                    : 'Single typical transport-property point (not temperature-interpolated) — switch to Custom to refine.'}
              </span>
            </div>
            {coolantPresetId === 'custom' && (
              <PremiumGate feature="Custom coolant properties">
                <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="field">
                    <label>Density (kg/m³)</label>
                    <input autoComplete="off" type="number" min={1} value={customDensity} onChange={(e) => setCustomDensity(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Specific heat (J/kg·K)</label>
                    <input autoComplete="off" type="number" min={1} value={customCp} onChange={(e) => setCustomCp(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Kinematic viscosity ν (m²/s)</label>
                    <input autoComplete="off" type="number" min={0} step={1e-7} value={customNu} onChange={(e) => setCustomNu(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Thermal conductivity (W/m·K)</label>
                    <input autoComplete="off" type="number" min={0} step={0.01} value={customK} onChange={(e) => setCustomK(Number(e.target.value))} />
                  </div>
                </div>
              </PremiumGate>
            )}
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Inlet temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(coolantInletTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCoolantInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Flow rate (L/min)</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={coolantFlowRateLPerMin} onChange={(e) => setCoolantFlowRateLPerMin(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Air</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Inlet temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(airInletTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAirInletTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>
                  Face velocity (m/s)
                  <InfoTooltip>The upstream, unobstructed air speed approaching the core's frontal face (from vehicle speed and/or fan) — not the higher in-channel velocity, which is derived from this via the free-flow area fraction.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={airFaceVelocityMPerS} onChange={(e) => setAirFaceVelocityMPerS(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Heat rejected</div>
                <div className="value">{fmt(result.heatRejectedW / 1000, 2)}<span className="unit">kW</span></div>
                <div className="hint">{fmt(result.heatRejectedW, 0)} W</div>
              </div>
              <div className="result-tile">
                <div className="label">Coolant outlet</div>
                <div className="value">{fmtU(result.coolantOutletTempC, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span></div>
                <div className="hint">in {fmtU(coolantInletTempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}, ΔT {fmt(coolantInletTempC - result.coolantOutletTempC, 2)}°C</div>
              </div>
              <div className="result-tile">
                <div className="label">Air outlet</div>
                <div className="value">{fmtU(result.airOutletTempC, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span></div>
                <div className="hint">in {fmtU(airInletTempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}, ΔT {fmt(result.airOutletTempC - airInletTempC, 2)}°C</div>
              </div>
              <div className="result-tile">
                <div className="label">Effectiveness</div>
                <div className="value">{fmt(result.effectiveness * 100, 1)}<span className="unit">%</span></div>
                <div className="hint">of Q_max = {fmt(result.cMinWPerK * (coolantInletTempC - airInletTempC) / 1000, 2)} kW</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Heat exchanger detail</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">UA</div>
                <div className="value">{fmt(result.uaWPerK, 1)}<span className="unit">W/K</span></div>
                <div className="hint">NTU {fmt(result.ntu, 3)}, Cr {fmt(result.crRatio, 3)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Air-side h</div>
                <div className="value">{fmt(result.airHEnhancedWPerM2K, 1)}<span className="unit">W/m²K</span></div>
                <div className="hint">Re {fmt(result.air.reynolds, 0)} ({result.air.regime}){louverEnhancementFactor !== 1 ? `, incl. ${fmt(louverEnhancementFactor, 1)}× louver` : ''}</div>
              </div>
              <div className="result-tile">
                <div className="label">Coolant-side h</div>
                <div className="value">{fmt(result.coolantSide.h, 1)}<span className="unit">W/m²K</span></div>
                <div className="hint">Re {fmt(result.coolantSide.reynolds, 0)} ({result.coolantSide.regime})</div>
              </div>
              <div className="result-tile">
                <div className="label">Fin efficiency</div>
                <div className="value">{fmt(result.airFinEfficiency * 100, 1)}<span className="unit">%</span></div>
                <div className="hint">effective area {fmt(result.airSideEffectiveAreaM2, 2)} m²</div>
              </div>
              <div className="result-tile">
                <div className="label">Free-flow fraction σ</div>
                <div className="value">{fmt(geometry.sigma, 3)}</div>
                <div className="hint">channel velocity {fmt(result.airChannelVelocityMPerS, 1)} m/s</div>
              </div>
              <div className="result-tile">
                <div className="label">Capacity rates</div>
                <div className="value">{fmt(result.cMinWPerK, 0)}<span className="unit">W/K min</span></div>
                <div className="hint">air {fmt(result.cAirWPerK, 0)} / coolant {fmt(result.cCoolantWPerK, 0)} W/K</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/heat-exchanger-sizing" />
        <p className="note">
          Method: effectiveness-NTU, crossflow with both fluids unmixed — the standard closed-form method
          for a single-pass finned-tube/microchannel core. <b>Convection treatment — a deliberate, disclosed
          simplification:</b> the industry-standard approach for detailed finned-tube design (Zukauskas
          tube-bank correlation plus Kays &amp; London empirical fin-surface data) depends on large
          surface-specific empirical tables; rather than reproduce those without a verifiable source, this
          calculator models both the air-side fin channels and the coolant-side tubes/ports as simple ducts —
          Dittus-Boelter (Nu = 0.023·Re⁰·⁸·Pr&#x207F;) above Re ≈ 2300, fixed fully-developed laminar constants
          below it (Nu = 3.66 circular duct/port, 7.54 wide parallel-plate fin channel). The free-flow area
          fraction σ is a geometrically-motivated approximation from the entered pitch/blockage dimensions,
          not a cited published formula. Fin efficiency uses the standard adiabatic-tip straight-fin formula
          with an equivalent length of half the inter-row gap (a simplification of the true annular/sector fin
          around a round tube). Tube/fin wall conduction is neglected (thin metal, well below either film
          resistance). The louvered-fin core type applies a literature-typical air-side enhancement factor
          (published comparisons report roughly 2–3× vs. plain fin) rather than the full multi-parameter
          Chang &amp; Wang louver correlation. <b>Scope:</b> single tube row in the airflow direction —
          multi-row-deep cores reject substantially more heat for the same frontal footprint than this model
          predicts. First-pass screening tool — verify a final design against surface-specific correlation
          data, CFD, or wind-tunnel/calorimetric test.
        </p>
        <p className="note">
          <b>Validated:</b> the effectiveness-NTU formula's Cr=0 special case matches its exact closed-form
          identity (1−e^(−NTU)) to machine precision; effectiveness stays within (0,1), increases
          monotonically with NTU, and converges toward 1 (checked out to NTU=10,000 — the Cr=1 case is the
          physically slowest-converging). Dittus-Boelter output matches independent hand substitution at
          chosen Re/Pr for both exponents, with the laminar/turbulent switch landing exactly at Re=2300. The
          free-flow fraction σ matches a hand-derived case, and a two-way continuity check (mass flow computed
          from face velocity × frontal area vs. channel velocity × free-flow area) agrees to machine
          precision. The imported fin-efficiency function was re-verified against its exact tanh(x)/x
          identity. The full solve was checked on all three core types for energy-balance closure — Q from
          the ε-NTU calculation exactly matches independent mdot·cp·ΔT recomputation on both the air and
          coolant sides — plus monotonic Q trends with face velocity and coolant flow rate, correct Cmin
          side-selection in both directions, and the louver factor applying exactly as a multiplier on the
          plain-fin air-side h.
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
