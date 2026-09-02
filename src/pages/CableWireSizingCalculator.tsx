import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_LENGTH_M, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import { useEntitlement } from '../lib/useEntitlement';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import { MATERIALS, type Material } from '../lib/materials';
import MotorProfilePicker from '../components/MotorProfilePicker';
import type { MotorProfileParams } from '../lib/motorProfiles';
import BatteryProfilePicker from '../components/BatteryProfilePicker';
import type { BatteryProfileParams } from '../lib/batteryProfiles';
import ControllerProfilePicker from '../components/ControllerProfilePicker';
import type { ControllerProfileParams } from '../lib/controllerProfiles';
import { usePowertrainPrefill } from '../lib/usePowertrainPrefill';
import {
  INSULATION_PRESETS,
  STANDARD_CROSS_SECTIONS_MM2,
  AMBIENT_PRESETS,
  bundlingDeratingFactor,
  solveAmpacity,
  solveCheckCurrent,
  getInsulationPreset,
  type CableInput,
} from '../lib/cableSizingPhysics';
import { dcResistancePerMetre } from '../lib/busbarPhysics';
import {
  CABLE_PRODUCTS,
  getCableProduct,
  deratingFactorForAmbient,
  findAmpacityRow,
} from '../lib/cableProductPresets';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

// AWG <-> mm² (standard formula, matches the Wire Gauge conversion category)
function awgToMm2(awg: number): number {
  const diameterIn = 0.005 * Math.pow(92, (36 - awg) / 39);
  const diameterMm = diameterIn * 25.4;
  return (Math.PI / 4) * diameterMm * diameterMm;
}
function mm2ToNearestAwg(areaMm2: number): number {
  const diameterMm = Math.sqrt((4 * areaMm2) / Math.PI);
  const diameterIn = diameterMm / 25.4;
  return Math.round(36 - 39 * (Math.log(diameterIn / 0.005) / Math.log(92)));
}
const AWG_SIZES = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 0, -1, -2, -3, -4]; // AWG 20 down to 4/0

type SolveMode = 'ampacity' | 'checkCurrent';
type SizeUnit = 'mm2' | 'awg';

export default function CableWireSizingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium } = useEntitlement();

  const [mode, setMode] = useState<SolveMode>('ampacity');
  const [materialId, setMaterialId] = useState<'copper' | 'aluminium'>('copper');
  const material: Material = MATERIALS[materialId];

  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('mm2');
  const [crossSectionMm2, setCrossSectionMm2] = useState(16);
  const [awgSize, setAwgSize] = useState(4);

  const [cableProductId, setCableProductId] = useState('generic');
  const [cableVariantId, setCableVariantId] = useState('');
  const selectedProduct = cableProductId === 'generic' ? null : getCableProduct(cableProductId) ?? null;
  const isLookupProduct = selectedProduct?.ratingKind === 'lookup';
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === cableVariantId) ?? selectedProduct?.variants[0] ?? null;

  const [insulationId, setInsulationId] = useState('xlpe');
  const insulation = getInsulationPreset(insulationId);
  const [customMaxTempC, setCustomMaxTempC] = useState(125);
  const [customThermalConductivity, setCustomThermalConductivity] = useState(0.25);
  const [insulationThicknessMm, setInsulationThicknessMm] = useState(1.0);

  const selectCableProduct = (id: string) => {
    setCableProductId(id);
    if (id === 'generic') return;
    const p = getCableProduct(id);
    if (!p) return;
    const firstVariant = p.variants[0];
    setCableVariantId(firstVariant.id);
    if (p.ratingKind === 'construction') {
      if (p.constructionMaterialId) setMaterialId(p.constructionMaterialId);
      setInsulationId('custom');
      setCustomMaxTempC(firstVariant.maxTempC);
      if (p.constructionInsulationThermalConductivity != null) setCustomThermalConductivity(p.constructionInsulationThermalConductivity);
      return;
    }
    // lookup product: switch the size unit to match and snap to its first published size
    setSizeUnit(p.sizeUnit);
    const rows = firstVariant.ampacityRows ?? [];
    if (p.sizeUnit === 'mm2' && rows[0]?.crossSectionMm2 != null) setCrossSectionMm2(rows[0].crossSectionMm2);
    if (p.sizeUnit === 'awg' && rows[0]?.awg != null) setAwgSize(rows[0].awg);
  };
  const selectCableVariant = (variantId: string) => {
    setCableVariantId(variantId);
    if (!selectedProduct) return;
    const v = selectedProduct.variants.find((x) => x.id === variantId);
    if (!v) return;
    if (selectedProduct.ratingKind === 'construction') {
      setCustomMaxTempC(v.maxTempC);
      return;
    }
    // lookup product: re-snap to the first size this variant actually publishes, in case ranges differ
    const rows = v.ampacityRows ?? [];
    if (selectedProduct.sizeUnit === 'mm2' && rows[0]?.crossSectionMm2 != null) setCrossSectionMm2(rows[0].crossSectionMm2);
    if (selectedProduct.sizeUnit === 'awg' && rows[0]?.awg != null) setAwgSize(rows[0].awg);
  };

  // Named cable products are a premium feature — fall back to the free
  // generic/physics mode on entitlement lapse (e.g. a shared link opened by
  // a non-premium viewer), same safety-net pattern used elsewhere in this app.
  useEffect(() => {
    if (!isPremium && cableProductId !== 'generic') selectCableProduct('generic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);

  const [currentType, setCurrentType] = useState<'ac' | 'dc'>('dc');
  const [frequencyHz, setFrequencyHz] = useState(400);

  const [ambientPresetId, setAmbientPresetId] = useState('battery');
  const ambientPreset = AMBIENT_PRESETS.find((p) => p.id === ambientPresetId) ?? AMBIENT_PRESETS[0];
  const [customAmbientTempC, setCustomAmbientTempC] = useState(40);
  const ambientTempC = ambientPresetId === 'custom' ? customAmbientTempC : ambientPreset.tempC;

  const [conductorCountInBundle, setConductorCountInBundle] = useState(1);
  const [lengthM, setLengthM] = useState(3);
  const [twoConductorCircuit, setTwoConductorCircuit] = useState(true);

  const [targetCurrentA, setTargetCurrentA] = useState(150);
  const [systemVoltage, setSystemVoltage] = useState(400);

  const applyMotorProfile = (p: MotorProfileParams) => {
    const current = p.continuousCurrentARms ?? p.peakCurrentARms;
    if (current != null) setTargetCurrentA(current);
  };

  const applyBatteryProfile = (p: BatteryProfileParams) => {
    setSystemVoltage(p.maxVoltageV);
  };

  const applyControllerProfile = (p: ControllerProfileParams) => {
    setSystemVoltage(p.maxDcVoltageV);
    const current = p.continuousCurrentARms ?? p.peakCurrentARms;
    if (current != null) setTargetCurrentA(current);
  };

  usePowertrainPrefill({
    onController: applyControllerProfile,
    onBattery: applyBatteryProfile,
    onMotor: applyMotorProfile,
    // A powertrain feeds a current + the DC cable length, so switch to the
    // check-current mode (where those inputs live) and set the run length.
    onSystem: (pt) => {
      setMode('checkCurrent');
      if (pt.dcCableLengthM != null) setLengthM(pt.dcCableLengthM);
    },
  });

  const getInputs = useCallback((): Record<string, unknown> => ({
    mode, materialId, sizeUnit, crossSectionMm2, awgSize, insulationId,
    customMaxTempC, customThermalConductivity, insulationThicknessMm,
    currentType, frequencyHz, ambientPresetId, customAmbientTempC,
    conductorCountInBundle, lengthM, twoConductorCircuit,
    targetCurrentA, systemVoltage, cableProductId, cableVariantId,
  }), [mode, materialId, sizeUnit, crossSectionMm2, awgSize, insulationId,
    customMaxTempC, customThermalConductivity, insulationThicknessMm,
    currentType, frequencyHz, ambientPresetId, customAmbientTempC,
    conductorCountInBundle, lengthM, twoConductorCircuit,
    targetCurrentA, systemVoltage, cableProductId, cableVariantId]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.mode) setMode(v.mode);
    if (v.cableProductId) setCableProductId(v.cableProductId);
    if (v.cableVariantId) setCableVariantId(v.cableVariantId);
    if (v.materialId) setMaterialId(v.materialId);
    if (v.sizeUnit) setSizeUnit(v.sizeUnit);
    if (v.crossSectionMm2 != null) setCrossSectionMm2(v.crossSectionMm2);
    if (v.awgSize != null) setAwgSize(v.awgSize);
    if (v.insulationId) setInsulationId(v.insulationId);
    if (v.customMaxTempC != null) setCustomMaxTempC(v.customMaxTempC);
    if (v.customThermalConductivity != null) setCustomThermalConductivity(v.customThermalConductivity);
    if (v.insulationThicknessMm != null) setInsulationThicknessMm(v.insulationThicknessMm);
    if (v.currentType) setCurrentType(v.currentType);
    if (v.frequencyHz != null) setFrequencyHz(v.frequencyHz);
    if (v.ambientPresetId) setAmbientPresetId(v.ambientPresetId);
    if (v.customAmbientTempC != null) setCustomAmbientTempC(v.customAmbientTempC);
    if (v.conductorCountInBundle != null) setConductorCountInBundle(v.conductorCountInBundle);
    if (v.lengthM != null) setLengthM(v.lengthM);
    if (v.twoConductorCircuit != null) setTwoConductorCircuit(v.twoConductorCircuit);
    if (v.targetCurrentA != null) setTargetCurrentA(v.targetCurrentA);
    if (v.systemVoltage != null) setSystemVoltage(v.systemVoltage);
  }, []);

  const saved = useSavedCalculations('cable-wire-sizing');
  const shareLink = useShareableLink(restoreInputs);

  const effectiveInsulation = useMemo(
    () => (insulationId === 'custom' ? { ...insulation, maxTempC: customMaxTempC, thermalConductivity: customThermalConductivity } : insulation),
    [insulationId, insulation, customMaxTempC, customThermalConductivity]
  );

  const effectiveCrossSectionMm2 = sizeUnit === 'mm2' ? crossSectionMm2 : awgToMm2(awgSize);
  const bundlingFactor = bundlingDeratingFactor(conductorCountInBundle);

  const lookupResult = useMemo(() => {
    if (!isLookupProduct || !selectedProduct || !selectedVariant) return null;
    const rows = selectedVariant.ampacityRows ?? [];
    const row = selectedProduct.sizeUnit === 'mm2'
      ? findAmpacityRow(rows, undefined, crossSectionMm2)
      : findAmpacityRow(rows, awgSize);
    if (!row) return null;
    const tempFactor = deratingFactorForAmbient(selectedProduct.temperatureDerating, ambientTempC, selectedProduct.ratingBaselineTempC);
    const combined = tempFactor * bundlingFactor;
    const dcResistanceMOhmPerM = row.dcResistanceOhmPerKm ?? dcResistancePerMetre(MATERIALS.copper, 20, effectiveCrossSectionMm2) * 1000;
    return {
      row, variant: selectedVariant, tempFactor,
      ampacityLowA: row.ampacityLowA * combined,
      ampacityHighA: row.ampacityHighA * combined,
      dcResistanceMOhmPerM,
      dcResistanceSource: (row.dcResistanceOhmPerKm != null ? 'datasheet' : 'physics') as 'datasheet' | 'physics',
    };
  }, [isLookupProduct, selectedProduct, selectedVariant, crossSectionMm2, awgSize, ambientTempC, bundlingFactor, effectiveCrossSectionMm2]);

  const lookupVoltageDropV = lookupResult != null
    ? (lookupResult.dcResistanceMOhmPerM / 1000) * lengthM * (twoConductorCircuit ? 2 : 1) * targetCurrentA
    : null;
  const lookupVoltageDropPercent = lookupVoltageDropV != null && systemVoltage > 0 ? (lookupVoltageDropV / systemVoltage) * 100 : null;

  const input: CableInput = useMemo(
    () => ({
      material,
      crossSectionMm2: effectiveCrossSectionMm2,
      insulation: effectiveInsulation,
      insulationThicknessMm,
      currentType,
      frequencyHz,
      ambientTempC,
      conductorCountInBundle,
      lengthM,
      twoConductorCircuit,
    }),
    [material, effectiveCrossSectionMm2, effectiveInsulation, insulationThicknessMm, currentType, frequencyHz, ambientTempC, conductorCountInBundle, lengthM, twoConductorCircuit]
  );

  const result = useMemo(
    () => (mode === 'ampacity' ? solveAmpacity(input) : solveCheckCurrent(input, targetCurrentA, systemVoltage)),
    [mode, input, targetCurrentA, systemVoltage]
  );

  const calculationSteps: CalcStepData[] = useMemo(() => {
    if (isLookupProduct && lookupResult && selectedProduct) {
      const steps: CalcStepData[] = [
        {
          title: `Base rating lookup (${selectedProduct.manufacturer} ${selectedProduct.productName})`,
          formula: 'Manufacturer-published ampacity for this size and plating, read directly from the datasheet',
          substitution: `${selectedProduct.sizeUnit === 'mm2' ? `${crossSectionMm2} mm²` : `AWG ${awgSize}`}, ${lookupResult.variant.label}`,
          result: `Base rating = ${lookupResult.row.ampacityLowA}–${lookupResult.row.ampacityHighA} A at ${selectedProduct.ratingBaselineTempC}°C ambient`,
        },
        {
          title: 'Ambient-temperature correction',
          formula: selectedProduct.temperatureDerating ? 'Manufacturer-published correction factor for this ambient' : 'No manufacturer correction curve published for this product',
          substitution: `${fmt(ambientTempC, 0)}°C ambient vs ${selectedProduct.ratingBaselineTempC}°C baseline`,
          result: `Factor = ${fmt(lookupResult.tempFactor, 2)}`,
        },
        {
          title: 'Bundling derating (this tool\'s own generic factor, not manufacturer-published)',
          formula: '1-3 conductors: 1.00 · 4-6: 0.80 · 7-9: 0.70 · 10-20: 0.50 · 21-30: 0.45 · 31-40: 0.40 · 41+: 0.35',
          substitution: `${conductorCountInBundle} current-carrying conductor(s)`,
          result: `Factor = ${fmt(bundlingFactor, 2)}`,
        },
        {
          title: 'Derated rating',
          formula: 'I = base rating × ambient factor × bundling factor',
          substitution: `${lookupResult.row.ampacityLowA}–${lookupResult.row.ampacityHighA} A × ${fmt(lookupResult.tempFactor, 2)} × ${fmt(bundlingFactor, 2)}`,
          result: `${fmt(lookupResult.ampacityLowA, 0)}–${fmt(lookupResult.ampacityHighA, 0)} A`,
        },
      ];
      if (mode === 'checkCurrent') {
        steps.push({
          title: 'Voltage drop',
          formula: `V = I · R_dc · length${twoConductorCircuit ? ' × 2 (supply + return conductor)' : ''}`,
          substitution: `I = ${fmt(targetCurrentA, 1)} A, R_dc = ${fmt(lookupResult.dcResistanceMOhmPerM, 4)} mΩ/m (${lookupResult.dcResistanceSource}), length = ${fmt(lengthM, 2)} m`,
          result: `V_drop = ${fmt(lookupVoltageDropV ?? 0, 2)} V${lookupVoltageDropPercent !== null ? ` (${fmt(lookupVoltageDropPercent, 2)}% of ${fmt(systemVoltage, 0)} V system voltage)` : ''}`,
        });
      }
      return steps;
    }
    const dConductor = result.conductorDiameterMm;
    const dOuter = result.outerDiameterMm;
    const steps: CalcStepData[] = [
      {
        title: 'Conductor & outer diameter',
        formula: 'd = √(4·A/π), D_outer = d + 2×insulation thickness',
        substitution: `A = ${fmt(effectiveCrossSectionMm2, 3)} mm², insulation = ${fmt(insulationThicknessMm, 2)} mm`,
        result: `d = ${fmt(dConductor, 3)} mm, D_outer = ${fmt(dOuter, 3)} mm`,
      },
      {
        title: 'AC resistance per metre (IEC 60287-1-1 skin-effect factor, reused from the Busbar calculator)',
        formula: 'R_dc(T) = ρ20·(β+T)/(β+20) / A;  xs² = 8πf/R_dc × 10⁻⁷;  ys = xs⁴/(192+0.8xs⁴);  R_ac = R_dc·(1+ys)',
        substitution: `${material.name}, T = ${mode === 'ampacity' ? fmt(effectiveInsulation.maxTempC, 0) : fmt(result.conductorTempC ?? 0, 1)}°C, ${currentType === 'ac' ? `f = ${frequencyHz} Hz` : 'DC (no skin effect)'}`,
        result: `R_ac = ${fmt(result.racPerMetre * 1000, 4)} mΩ/m${currentType === 'ac' ? ` (ys = ${fmt(result.skinEffectYs, 4)})` : ''}`,
      },
      {
        title: 'Insulation conduction resistance per metre',
        formula: 'R_ins = ln(D_outer/d) / (2π·k_insulation)',
        substitution: `k = ${fmt(effectiveInsulation.thermalConductivity, 3)} W/m·K`,
        result: `R_ins = ${fmt(result.insulationThermalResistancePerMetre, 4)} K·m/W`,
      },
      {
        title: 'Natural convection from the cable surface (Churchill-Chu, horizontal cylinder)',
        formula: 'Ra_D = g·β·ΔT·D³/ν² · Pr;  Nu_D = {0.60 + 0.387·Ra_D^(1/6) / [1+(0.559/Pr)^(9/16)]^(8/27)}²;  h = Nu_D·k_air/D',
        substitution: `D_outer = ${fmt(dOuter, 2)} mm, ambient = ${fmt(ambientTempC, 0)}°C`,
        result: `h_conv = ${fmt(result.convection.h, 2)} W/m²K (Ra_D = ${result.convection.rayleigh.toExponential(2)}, Nu_D = ${fmt(result.convection.nusselt, 2)}) + radiation, combined film resistance = ${fmt(result.filmResistancePerMetre, 4)} K·m/W`,
      },
      {
        title: 'Bundling derating (NEC 310.15(B)(3)(a)-style standard reference table)',
        formula: '1-3 conductors: 1.00 · 4-6: 0.80 · 7-9: 0.70 · 10-20: 0.50 · 21-30: 0.45 · 31-40: 0.40 · 41+: 0.35',
        substitution: `${conductorCountInBundle} current-carrying conductor(s) in the bundle/loom`,
        result: `Bundling factor = ${fmt(bundlingFactor, 2)}`,
      },
    ];

    if (mode === 'ampacity') {
      steps.push({
        title: 'Ampacity (steady-state heat balance)',
        formula: 'I = √(ΔT_max / (R_ac · R_thermal)) × bundling factor,  ΔT_max = insulation max temp − ambient,  R_thermal = R_ins + R_film',
        substitution: `ΔT_max = ${fmt(effectiveInsulation.maxTempC, 0)} − ${fmt(ambientTempC, 0)} = ${fmt(effectiveInsulation.maxTempC - ambientTempC, 0)} K, R_thermal = ${fmt(result.totalThermalResistancePerMetre, 4)} K·m/W`,
        result: `Ampacity = ${fmt(result.ampacityA, 1)} A`,
      });
    } else {
      steps.push({
        title: 'Conductor temperature at given current (iterative heat balance)',
        formula: 'T_conductor = T_ambient + I_eff² · R_ac · R_thermal,  I_eff = I / bundling factor, solved by fixed-point iteration since R_ac and R_thermal both depend on temperature',
        substitution: `I = ${fmt(targetCurrentA, 1)} A, bundling factor = ${fmt(bundlingFactor, 2)}`,
        result: `T_conductor = ${fmt(result.conductorTempC ?? 0, 1)}°C vs insulation limit ${fmt(effectiveInsulation.maxTempC, 0)}°C — ${result.conductorTempPass ? 'pass' : 'fail'}`,
      });
      steps.push({
        title: 'Voltage drop',
        formula: `V = I · R_ac · length${twoConductorCircuit ? ' × 2 (supply + return conductor)' : ''}`,
        substitution: `I = ${fmt(targetCurrentA, 1)} A, R_ac = ${fmt(result.racPerMetre * 1000, 4)} mΩ/m, length = ${fmt(lengthM, 2)} m`,
        result: `V_drop = ${fmt(result.voltageDropV ?? 0, 2)} V${result.voltageDropPercent !== null ? ` (${fmt(result.voltageDropPercent, 2)}% of ${fmt(systemVoltage, 0)} V system voltage)` : ''}`,
      });
    }

    return steps;
  }, [result, effectiveCrossSectionMm2, insulationThicknessMm, material, mode, currentType, frequencyHz, effectiveInsulation, ambientTempC, conductorCountInBundle, bundlingFactor, targetCurrentA, twoConductorCircuit, lengthM, systemVoltage, isLookupProduct, lookupResult, selectedProduct, crossSectionMm2, awgSize, lookupVoltageDropV, lookupVoltageDropPercent]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Conductor & insulation',
      rows: isLookupProduct && selectedProduct
        ? [
          { label: 'Cable product', value: `${selectedProduct.manufacturer} — ${selectedProduct.productName}` },
          { label: 'Variant', value: selectedVariant?.label ?? '' },
          { label: 'Cross-section', value: sizeUnit === 'mm2' ? `${crossSectionMm2} mm²` : `AWG ${awgSize}` },
        ]
        : [
          { label: 'Material', value: material.name },
          { label: 'Cross-section', value: sizeUnit === 'mm2' ? `${effectiveCrossSectionMm2} mm²` : `AWG ${awgSize} (${fmt(effectiveCrossSectionMm2, 2)} mm²)` },
          { label: 'Insulation', value: effectiveInsulation.label },
          { label: 'Insulation thickness', value: `${fmtU(insulationThicknessMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
        ],
    },
    {
      heading: 'Operating conditions',
      rows: [
        ...(isLookupProduct ? [] : [{ label: 'Current type', value: currentType === 'ac' ? `AC (${frequencyHz} Hz)` : 'DC' }]),
        { label: 'Ambient temperature', value: `${fmtU(ambientTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
        { label: 'Conductors in bundle', value: `${conductorCountInBundle}` },
        { label: 'Cable length (one-way)', value: `${fmtU(lengthM, unitSystem, UNIT_LENGTH_M, 3)} ${unitLabel(unitSystem, UNIT_LENGTH_M)}` },
      ],
    },
  ], [material, sizeUnit, effectiveCrossSectionMm2, awgSize, effectiveInsulation, insulationThicknessMm, currentType, frequencyHz, ambientTempC, conductorCountInBundle, lengthM, unitSystem, isLookupProduct, selectedProduct, selectedVariant, crossSectionMm2]);

  const outputSections: ReportSection[] = useMemo(() => {
    if (isLookupProduct && lookupResult) {
      return [{
        heading: mode === 'ampacity' ? 'Ampacity result (manufacturer rating)' : 'Check-current result (manufacturer rating)',
        rows: mode === 'ampacity'
          ? [
            { label: 'Rated ampacity', value: `${fmt(lookupResult.ampacityLowA, 0)}–${fmt(lookupResult.ampacityHighA, 0)} A` },
            { label: 'Ambient / bundling factors', value: `${fmt(lookupResult.tempFactor, 2)} × ${fmt(bundlingFactor, 2)}` },
          ]
          : [
            { label: 'Published rating at this ambient', value: `${fmt(lookupResult.ampacityLowA, 0)}–${fmt(lookupResult.ampacityHighA, 0)} A vs target ${fmt(targetCurrentA, 0)} A` },
            { label: 'Voltage drop', value: `${fmt(lookupVoltageDropV ?? 0, 2)} V${lookupVoltageDropPercent !== null ? ` (${fmt(lookupVoltageDropPercent, 2)}%)` : ''}` },
          ],
      }, {
        heading: 'Resistance',
        rows: [{ label: 'DC resistance', value: `${fmt(lookupResult.dcResistanceMOhmPerM, 4)} mΩ/m (${lookupResult.dcResistanceSource})` }],
      }];
    }
    return [
    {
      heading: mode === 'ampacity' ? 'Ampacity result' : 'Check-current result',
      rows: mode === 'ampacity'
        ? [
          { label: 'Ampacity', value: `${fmt(result.ampacityA, 1)} A` },
          { label: 'Bundling factor', value: fmt(bundlingFactor, 2) },
        ]
        : [
          { label: 'Conductor temperature', value: `${fmtU(result.conductorTempC ?? 0, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
          { label: 'Pass vs insulation limit', value: result.conductorTempPass ? 'Pass' : 'Fail' },
          { label: 'Voltage drop', value: `${fmt(result.voltageDropV ?? 0, 2)} V${result.voltageDropPercent !== null ? ` (${fmt(result.voltageDropPercent, 2)}%)` : ''}` },
        ],
    },
    {
      heading: 'Resistance & thermal',
      rows: [
        { label: 'AC resistance', value: `${fmt(result.racPerMetre * 1000, 4)} mΩ/m` },
        { label: 'Total thermal resistance', value: `${fmt(result.totalThermalResistancePerMetre, 4)} K·m/W` },
      ],
    },
    ];
  }, [mode, result, bundlingFactor, unitSystem, isLookupProduct, lookupResult, targetCurrentA, lookupVoltageDropV, lookupVoltageDropPercent]);

  const handleExportPdf = () => {
    const lookupPass = isLookupProduct && lookupResult && mode === 'checkCurrent' ? targetCurrentA <= lookupResult.ampacityHighA : null;
    exportReportToPdf({
      tabName: 'Cable_Wire_Sizing_Calculator',
      pageTitle: 'Cable/Wire Sizing Calculator (EV Powertrain)',
      accentHex,
      passStatus: isLookupProduct
        ? (lookupPass !== null ? { pass: lookupPass, label: lookupPass ? 'Within the published manufacturer rating' : 'Exceeds the published manufacturer rating' } : null)
        : (mode === 'checkCurrent' && result.conductorTempPass !== null
          ? { pass: result.conductorTempPass, label: result.conductorTempPass ? 'Conductor temperature within insulation limit' : 'Conductor temperature exceeds insulation limit' }
          : null),
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: isLookupProduct && selectedProduct
        ? `Uses ${selectedProduct.manufacturer} ${selectedProduct.productName}'s own published ampacity rating (${selectedProduct.sourceLabel}) rather than this tool's first-principles physics model. ${selectedProduct.ratingBasisNote} ${selectedProduct.derivedDeratingDisclosure ?? ''} Bundling derating reuses this tool's own standard NEC 310.15(B)(3)(a) reference factors, which are NOT manufacturer-published for this product. Screening tool only — not a substitute for OEM harness qualification testing.`
        : 'Engineering estimation tool for EV powertrain cable sizing (battery interconnects, battery-to-inverter, inverter-to-motor), not household/building wiring. Ampacity and conductor temperature are computed from first-principles steady-state heat balance (Churchill-Chu horizontal-cylinder convection, IEC 60287-1-1 skin effect), with the insulation temperature class anchored to ISO 6722. Numeric ISO 6722 ampacity tables are not publicly accessible; this tool computes from physics rather than transcribing an unverifiable table. Bundling derating reuses the standard NEC 310.15(B)(3)(a) reference factors as a disclosed approximation, not a first-principles bundle-thermal model. Screening tool only — not a substitute for OEM harness qualification testing.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Cable/Wire Sizing Calculator</div>
          <h1>Cable/Wire Sizing Calculator (EV Powertrain)</h1>
          <p>
            First-principles ampacity and voltage drop for EV powertrain cables — battery interconnects,
            battery-to-inverter, inverter-to-motor — using ISO 6722 insulation temperature classes and a
            steady-state heat balance (not a household/building wiring ampacity table).
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
            <div className="card-title"><span><span className="step-num">1</span>Solve for</span></div>
            <div className="segmented">
              <button className={mode === 'ampacity' ? 'active' : ''} onClick={() => setMode('ampacity')}>Ampacity</button>
              <button className={mode === 'checkCurrent' ? 'active' : ''} onClick={() => setMode('checkCurrent')}>Check current</button>
            </div>
            <span className="hint">
              Ampacity: find the maximum continuous current this cable can carry. Check current: given a target
              current, find the resulting conductor temperature and voltage drop.
            </span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Conductor & insulation</span></div>
            <div className="field">
              <label>
                Cable product
                <InfoTooltip>
                  Pick a real manufacturer product to use its own published current rating (and temperature
                  correction, where published) instead of this tool's own physics calculation — or leave it
                  on Generic to size a cable from first principles as before.
                </InfoTooltip>
              </label>
              <PremiumGate feature="Named manufacturer cable products">
                <>
                  <select value={cableProductId} onChange={(e) => selectCableProduct(e.target.value)}>
                    <option value="generic">Generic (calculated)</option>
                    {CABLE_PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>{p.manufacturer} — {p.productName}</option>
                    ))}
                  </select>
                  {selectedProduct && selectedProduct.variants.length > 1 && (
                    <select style={{ marginTop: '0.5rem' }} value={cableVariantId} onChange={(e) => selectCableVariant(e.target.value)}>
                      {selectedProduct.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  )}
                  {selectedProduct && (
                    <p className="hint" style={{ marginTop: '0.4rem' }}>
                      {selectedProduct.typeDesignation} · <a href={selectedProduct.sourceUrl} target="_blank" rel="noopener noreferrer">{selectedProduct.sourceLabel}</a>
                    </p>
                  )}
                </>
              </PremiumGate>
            </div>

            {isLookupProduct && selectedProduct && (
              <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>{selectedProduct.sizeUnit === 'mm2' ? 'Cross-section' : 'AWG size'}</label>
                  {selectedProduct.sizeUnit === 'mm2' ? (
                    <select value={crossSectionMm2} onChange={(e) => setCrossSectionMm2(Number(e.target.value))}>
                      {(selectedVariant?.ampacityRows ?? []).map((r) => (
                        <option key={r.crossSectionMm2} value={r.crossSectionMm2}>{r.crossSectionMm2} mm²</option>
                      ))}
                    </select>
                  ) : (
                    <select value={awgSize} onChange={(e) => setAwgSize(Number(e.target.value))}>
                      {(selectedVariant?.ampacityRows ?? []).map((r) => (
                        <option key={r.awg} value={r.awg}>{(r.awg ?? 0) < 0 ? `${-(r.awg ?? 0)}/0` : r.awg} AWG</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <p className="note" style={{ margin: 0 }}>{selectedProduct.ratingBasisNote}</p>
                  {selectedProduct.derivedDeratingDisclosure && (
                    <p className="hint" style={{ marginTop: '0.4rem' }}>{selectedProduct.derivedDeratingDisclosure}</p>
                  )}
                </div>
              </div>
            )}

            {selectedProduct?.ratingKind === 'construction' && (
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <p className="note" style={{ margin: 0 }}>{selectedProduct.ratingBasisNote}</p>
                {selectedProduct.constructionNote && <p className="hint" style={{ marginTop: '0.4rem' }}>{selectedProduct.constructionNote}</p>}
                {selectedProduct.approximateDisclosure && <p className="hint" style={{ marginTop: '0.4rem' }}>{selectedProduct.approximateDisclosure}</p>}
              </div>
            )}

            {!isLookupProduct && (
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Conductor material</label>
                <div className="segmented">
                  <button className={materialId === 'copper' ? 'active' : ''} onClick={() => setMaterialId('copper')}>Copper</button>
                  <button className={materialId === 'aluminium' ? 'active' : ''} onClick={() => setMaterialId('aluminium')}>Aluminium</button>
                </div>
              </div>
              <div className="field">
                <label>Size unit</label>
                <div className="segmented">
                  <button className={sizeUnit === 'mm2' ? 'active' : ''} onClick={() => setSizeUnit('mm2')}>mm²</button>
                  <button className={sizeUnit === 'awg' ? 'active' : ''} onClick={() => setSizeUnit('awg')}>AWG</button>
                </div>
              </div>
              {sizeUnit === 'mm2' ? (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Cross-section (IEC 60228 series)</label>
                  <select value={crossSectionMm2} onChange={(e) => setCrossSectionMm2(Number(e.target.value))}>
                    {STANDARD_CROSS_SECTIONS_MM2.map((s) => (
                      <option key={s} value={s}>{s} mm² (~AWG {mm2ToNearestAwg(s)})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>AWG size</label>
                  <select value={awgSize} onChange={(e) => setAwgSize(Number(e.target.value))}>
                    {AWG_SIZES.map((a) => (
                      <option key={a} value={a}>{a < 0 ? `${-a}/0` : a} AWG (~{fmt(awgToMm2(a), 2)} mm²)</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Insulation
                  <InfoTooltip>
                    ISO 6722 sets insulation temperature classes for road-vehicle cables (A: 85°C up to H: 250°C).
                    The insulation's rated temperature caps how hot the conductor is allowed to run — that limit,
                    not a fixed current table, is what actually sets ampacity here.
                  </InfoTooltip>
                </label>
                <div className="segmented">
                  {INSULATION_PRESETS.map((p) => (
                    <button key={p.id} className={insulationId === p.id ? 'active' : ''} onClick={() => setInsulationId(p.id)}>{p.id === 'custom' ? 'Custom' : p.id.toUpperCase()}</button>
                  ))}
                </div>
                <span className="hint">{effectiveInsulation.label}</span>
              </div>
              {insulationId === 'custom' && (
                <PremiumGate feature="Custom insulation class">
                  <>
                    <div className="field">
                      <label>Max conductor temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                      <input autoComplete="off" type="number" value={toDisplay(customMaxTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCustomMaxTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                    </div>
                    <div className="field">
                      <label>Insulation thermal conductivity (W/m·K)</label>
                      <input autoComplete="off" type="number" step={0.01} value={customThermalConductivity} onChange={(e) => setCustomThermalConductivity(Number(e.target.value))} />
                    </div>
                  </>
                </PremiumGate>
              )}
              <div className="field">
                <label>Insulation wall thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0.001} step={0.001} value={toDisplay(insulationThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setInsulationThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Operating conditions</span></div>
            <div className="grid grid-2">
              {!isLookupProduct && (
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center' }}>Current type<InfoTooltip>DC for battery interconnects; AC for motor phase cables (uses skin effect at the drive's fundamental frequency).</InfoTooltip></label>
                  <div className="segmented">
                    <button className={currentType === 'dc' ? 'active' : ''} onClick={() => setCurrentType('dc')}>DC</button>
                    <button className={currentType === 'ac' ? 'active' : ''} onClick={() => setCurrentType('ac')}>AC</button>
                  </div>
                </div>
              )}
              {!isLookupProduct && currentType === 'ac' && (
                <div className="field">
                  <label>Frequency (Hz)</label>
                  <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={(e) => setFrequencyHz(Number(e.target.value))} />
                </div>
              )}
              {isLookupProduct && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <p className="hint" style={{ margin: 0 }}>Using {selectedProduct?.manufacturer}'s own published rating as-is — this tool doesn't layer its own AC skin-effect calculation on top of a manufacturer number.</p>
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Ambient / routing environment</label>
                <div className="segmented">
                  {AMBIENT_PRESETS.map((p) => (
                    <button key={p.id} className={ambientPresetId === p.id ? 'active' : ''} onClick={() => setAmbientPresetId(p.id)}>{p.label.split(' ')[0]}</button>
                  ))}
                </div>
                {ambientPresetId === 'custom' ? (
                  <PremiumGate feature="Custom ambient temperature">
                    <input autoComplete="off" type="number" style={{ marginTop: '0.5rem' }} value={toDisplay(customAmbientTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setCustomAmbientTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  </PremiumGate>
                ) : (
                  <span className="hint">{ambientPreset.label}</span>
                )}
              </div>
              <div className="field">
                <label>
                  Conductors in bundle
                  <InfoTooltip>
                    Cables run together in a harness/loom heat each other, reducing how much current each can
                    carry compared to a single cable in free air. This uses the widely-published NEC
                    310.15(B)(3)(a) adjustment factors as a standard reference — modelling the actual mutual
                    heating of N bundled round cables from first principles is a CFD-scale problem beyond this
                    tool's scope.
                  </InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={1} value={conductorCountInBundle} onChange={(e) => setConductorCountInBundle(Math.max(1, Number(e.target.value)))} />
                <span className="hint">Derating factor: {fmt(bundlingFactor, 2)}</span>
              </div>
              <div className="field">
                <label>Cable length, one-way ({unitLabel(unitSystem, UNIT_LENGTH_M)})</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(lengthM, unitSystem, UNIT_LENGTH_M)} onChange={(e) => setLengthM(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH_M))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={twoConductorCircuit} onChange={(e) => setTwoConductorCircuit(e.target.checked)} style={{ width: 'auto' }} />
                  Two-conductor circuit (voltage drop counts both supply and return conductors)
                  <InfoTooltip>Typical for EV HV circuits (battery/inverter/motor). Uncheck only for legacy chassis-return (e.g. 12V) wiring.</InfoTooltip>
                </label>
              </div>
              {mode === 'checkCurrent' && (
                <>
                  <div className="field">
                    <label>Target current (A)</label>
                    <input autoComplete="off" type="number" min={0} value={targetCurrentA} onChange={(e) => setTargetCurrentA(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>System voltage (for % voltage drop)</label>
                    <input autoComplete="off" type="number" min={0} value={systemVoltage} onChange={(e) => setSystemVoltage(Number(e.target.value))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <MotorProfilePicker onApply={applyMotorProfile} hint="Sets the target current from a saved motor profile's continuous (preferred) or peak current rating — continuous duty is the usual basis for cable ampacity." />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <BatteryProfilePicker onApply={applyBatteryProfile} hint="Sets the system voltage from a saved battery profile's max voltage." />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <ControllerProfilePicker onApply={applyControllerProfile} hint="Sets the system voltage from a saved controller profile's max DC voltage, and the target current from its continuous (preferred) or peak current rating." />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

            {isLookupProduct && lookupResult ? (
              <>
                {mode === 'checkCurrent' && (
                  <div className={`status-banner ${targetCurrentA <= lookupResult.ampacityHighA ? 'pass' : 'fail'}`}>
                    {targetCurrentA <= lookupResult.ampacityLowA
                      ? '✓ Within the published rating\'s lower (conservative) bound'
                      : targetCurrentA <= lookupResult.ampacityHighA
                        ? '~ Within the published range, above its lower bound'
                        : '✗ Exceeds the published rating'}
                  </div>
                )}
                <div className="result-grid">
                  {mode === 'ampacity' ? (
                    <div className="result-tile">
                      <div className="label">Rated ampacity</div>
                      <div className="value">{fmt(lookupResult.ampacityLowA, 0)}–{fmt(lookupResult.ampacityHighA, 0)}<span className="unit">A</span></div>
                      <div className="hint">base {lookupResult.row.ampacityLowA}–{lookupResult.row.ampacityHighA} A × temp {fmt(lookupResult.tempFactor, 2)} × bundling {fmt(bundlingFactor, 2)}</div>
                    </div>
                  ) : (
                    <>
                      <div className="result-tile">
                        <div className="label">Published rating at this ambient</div>
                        <div className="value">{fmt(lookupResult.ampacityLowA, 0)}–{fmt(lookupResult.ampacityHighA, 0)}<span className="unit">A</span></div>
                        <div className="hint">target {fmt(targetCurrentA, 0)} A</div>
                      </div>
                      <div className="result-tile">
                        <div className="label">Voltage drop</div>
                        <div className="value">{fmt(lookupVoltageDropV ?? 0, 2)}<span className="unit">V</span></div>
                        {lookupVoltageDropPercent !== null && <div className="hint">{fmt(lookupVoltageDropPercent, 2)}% of {fmt(systemVoltage, 0)} V</div>}
                      </div>
                    </>
                  )}
                  <div className="result-tile">
                    <div className="label">DC resistance</div>
                    <div className="value">{fmt(lookupResult.dcResistanceMOhmPerM, 3)}<span className="unit">mΩ/m</span></div>
                    <div className="hint">{lookupResult.dcResistanceSource === 'datasheet' ? 'manufacturer-published, taken as given' : 'this tool\'s bulk-copper physics (not published by this manufacturer)'}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Ambient correction factor</div>
                    <div className="value">{fmt(lookupResult.tempFactor, 2)}</div>
                    <div className="hint">at {fmt(ambientTempC, 0)}°C vs {selectedProduct?.ratingBaselineTempC}°C baseline</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {mode === 'checkCurrent' && result.conductorTempPass !== null && (
                  <div className={`status-banner ${result.conductorTempPass ? 'pass' : 'fail'}`}>
                    {result.conductorTempPass ? '✓ Conductor temperature within insulation limit' : '✗ Conductor temperature exceeds insulation limit'}
                  </div>
                )}

                <div className="result-grid">
                  {mode === 'ampacity' ? (
                    <>
                      <div className="result-tile">
                        <div className="label">Ampacity</div>
                        <div className="value">{fmt(result.ampacityA, 1)}<span className="unit">A</span></div>
                        <div className="hint">bundling factor {fmt(bundlingFactor, 2)}</div>
                      </div>
                      <div className="result-tile">
                        <div className="label">AC resistance</div>
                        <div className="value">{fmt(result.racPerMetre * 1000, 3)}<span className="unit">mΩ/m</span></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="result-tile">
                        <div className="label">Conductor temperature</div>
                        <div className={`value ${result.conductorTempPass === false ? 'neg' : result.conductorTempPass === true ? 'pos' : ''}`}>
                          {fmtU(result.conductorTempC ?? 0, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span>
                        </div>
                        <div className="hint">limit {fmtU(effectiveInsulation.maxTempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}</div>
                      </div>
                      <div className="result-tile">
                        <div className="label">Voltage drop</div>
                        <div className="value">{fmt(result.voltageDropV ?? 0, 2)}<span className="unit">V</span></div>
                        {result.voltageDropPercent !== null && <div className="hint">{fmt(result.voltageDropPercent, 2)}% of {fmt(systemVoltage, 0)} V</div>}
                      </div>
                    </>
                  )}
                  <div className="result-tile">
                    <div className="label">Conductor / outer diameter</div>
                    <div className="value">{fmtU(result.conductorDiameterMm, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                    <div className="hint">outer {fmtU(result.outerDiameterMm, unitSystem, UNIT_LENGTH, 3)} {unitLabel(unitSystem, UNIT_LENGTH)}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Total thermal resistance</div>
                    <div className="value">{fmt(result.totalThermalResistancePerMetre, 3)}<span className="unit">K·m/W</span></div>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/cable-sizing" />
        <p className="note">
          This tool is scoped to EV powertrain cabling (battery interconnects, battery-to-inverter,
          inverter-to-motor) — it does not use a household/building wiring ampacity table (e.g. NEC Table
          310). Instead, ampacity/conductor temperature come from a first-principles steady-state heat
          balance: AC resistance (with the IEC 60287-1-1 skin-effect formula, reused from this site's Busbar
          calculator), conduction through the insulation wall, and natural convection + radiation from the
          round outer surface using the Churchill-Chu correlation for a horizontal cylinder (the correct
          correlation for round cable — flat-plate correlations, like the one used for busbars, don't apply
          here). The insulation's ISO 6722 temperature class sets the maximum allowable conductor
          temperature. ISO 6722's own numeric current-rating tables sit behind the paywalled standard text
          and weren't accessible during development — this tool computes from physics instead of
          transcribing an unverifiable table. Bundling derating reuses the widely-published NEC
          310.15(B)(3)(a) adjustment factors as a disclosed standard reference, not a first-principles
          model of mutual heating between bundled cables. Treat this as a screening/estimation tool, not a
          substitute for the OEM harness qualification testing real cable assemblies undergo.
        </p>
        <p className="note">
          <strong>Named cable products</strong> (Premium) use each manufacturer's own published ampacity —
          real datasheet numbers, not this tool's physics — plus their own temperature-correction table
          where one is published. Data quality genuinely differs by manufacturer, disclosed rather than
          smoothed over: Glenair TurboFlex and Huber+Suhner RADOX publish real tabulated ampacity and
          correction curves, used directly; Champlain EXRAD publishes ampacity at a single 40°C baseline
          with no derating curve at all (shown as-is, not extrapolated); Coroplast/Coroflex publishes only
          simulated derating <em>curves</em>, not a tabulated number, so that preset instead feeds its real,
          sourced construction (bare copper, T180 silicone) into this tool's own physics model rather than
          presenting an imprecise chart-read as a datasheet figure. Every product's exact source datasheet
          is linked in the calculator.
        </p>
        <p className="note">
          <b>Validated:</b> the Churchill-Chu correlation was independently re-derived from the documented
          equation and matched the calculator's output exactly (80°C surface, 20°C ambient, 20 mm diameter →
          h = 8.058 W/m²K both ways) — comfortably inside the textbook-typical 2–25 W/m²K range for natural
          convection in air. The bundling-derating table matches the published NEC 310.15(B)(3)(a) factors
          exactly at spot checks (3 conductors → 1.00, 6 → 0.80, 30 → 0.45), and the AC resistance/skin-effect
          formula is the same one validated on the Busbar calculator.
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
