import { useCallback, useEffect, useMemo, useState } from 'react';
import PaschenChart from '../components/PaschenChart';
import ComparisonGrid from '../components/ComparisonGrid';
import RibCrossSectionDiagram from '../components/RibCrossSectionDiagram';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import InfoTooltip from '../components/InfoTooltip';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData, type ReportGridTable } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import {
  MATERIAL_GROUP_CTI,
  MATERIAL_GROUP_DESCRIPTION,
  POLLUTION_DEGREE_DESCRIPTIONS,
  FIELD_CONDITION_DESCRIPTIONS,
  getAltitudeCorrectionFactor,
  getClearance,
  getCreepage,
  materialGroupFromCti,
  ribCreepageCredit,
  requiredFootprintWithRibMm,
  type MaterialGroup,
  type FieldCondition,
  type PollutionDegree,
} from '../lib/creepageClearance';
import { pressureAtAltitude, breakdownVoltage, minGapForVoltage, paschenMinimum } from '../lib/paschen';
import {
  ED332_NETWORK_LABELS,
  ED332_STEADY_STATE_V,
  ED332_TRANSIENTS,
  ED332_ABNORMAL_COMMON_MODE_FRACTION,
  ED332_DIELECTRIC_WITHSTAND_V,
  ED332_INSULATION_TEST_V,
  ED332_INSULATION_MIN_MOHM,
  ed332MaxAbnormalTransientV,
  type Ed332NetworkType,
} from '../lib/ed332';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

const FT_PER_M = 3.28084;
const MATERIAL_GROUPS: MaterialGroup[] = ['I', 'II', 'IIIa', 'IIIb'];
const GRID_PDS: (1 | 2 | 3)[] = [1, 2, 3];
const FIELD_CASES: FieldCondition[] = ['A', 'B'];
const GRID_COL_LABELS = ['PD1', 'PD2', 'PD3'];

function buildGridTable(
  title: string, rowLabels: string[], colLabels: string[],
  getValue: (rowIdx: number, colIdx: number) => number, highlightRow: number, highlightCol: number,
  unit = 'mm',
): ReportGridTable {
  return {
    title,
    rowLabels,
    colLabels,
    cellValues: rowLabels.map((_, ri) => colLabels.map((_, ci) => `${fmt(getValue(ri, ci), 2)} ${unit}`)),
    highlightRow,
    highlightCol,
  };
}

export default function CreepageClearanceCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { isPremium } = useEntitlement();
  const { unitSystem } = useUnitSystem();

  const [workingVoltage, setWorkingVoltage] = useState(300);
  const [hvToChassisOverride, setHvToChassisOverride] = useState<number | null>(null);
  // Voltage is always stored internally as V rms (matching Table F.4's own basis) — this only
  // toggles how the input fields are interpreted/displayed, same pattern as toDisplay/fromDisplay
  // for SI/imperial length elsewhere. Peak assumes a sinusoidal waveform (Vrms = Vpeak/sqrt(2));
  // for a DC or non-sinusoidal withstand rating, entering RMS directly is more accurate.
  const [voltageInputMode, setVoltageInputMode] = useState<'rms' | 'peak'>('rms');
  const toVoltageDisplay = (vRms: number) => (voltageInputMode === 'peak' ? vRms * Math.SQRT2 : vRms);
  const fromVoltageDisplay = (entered: number) => (voltageInputMode === 'peak' ? entered / Math.SQRT2 : entered);

  const [ribHeightMm, setRibHeightMm] = useState(2);
  const [ribWidthMm, setRibWidthMm] = useState(1.5);

  const [ed332Advanced, setEd332Advanced] = useState(false);
  const [ed332NetworkType, setEd332NetworkType] = useState<Ed332NetworkType>('R');
  const [ed332UseTransientForClearance, setEd332UseTransientForClearance] = useState(true);
  const [ed332UseAbnormalCmForChassis, setEd332UseAbnormalCmForChassis] = useState(true);

  // Safety net: force ED-332 advanced mode off if entitlement lapses (e.g. a subscription expires).
  useEffect(() => {
    if (!isPremium && ed332Advanced) setEd332Advanced(false);
  }, [isPremium, ed332Advanced]);

  const hvToChassisDefaultFraction = ed332Advanced && ed332UseAbnormalCmForChassis ? ED332_ABNORMAL_COMMON_MODE_FRACTION : 0.5;
  const hvToChassis = hvToChassisOverride ?? workingVoltage * hvToChassisDefaultFraction;

  const [pollutionDegree, setPollutionDegree] = useState<PollutionDegree>(2);
  const [materialGroup, setMaterialGroup] = useState<MaterialGroup>('IIIb');
  const [showCtiHelper, setShowCtiHelper] = useState(false);
  const [ctiValue, setCtiValue] = useState(175);

  const [altitudeUnit, setAltitudeUnit] = useState<'m' | 'ft'>('ft');
  const [altitude, setAltitude] = useState(5000);

  const [safetyFactorPercent, setSafetyFactorPercent] = useState(20);
  const [fieldCondition, setFieldCondition] = useState<FieldCondition>('A');

  const getInputs = useCallback((): Record<string, unknown> => ({
    workingVoltage, hvToChassisOverride, voltageInputMode, ed332Advanced, ed332NetworkType,
    ed332UseTransientForClearance, ed332UseAbnormalCmForChassis,
    pollutionDegree, materialGroup, ctiValue, altitudeUnit, altitude,
    safetyFactorPercent, fieldCondition, ribHeightMm, ribWidthMm,
  }), [workingVoltage, hvToChassisOverride, voltageInputMode, ed332Advanced, ed332NetworkType,
    ed332UseTransientForClearance, ed332UseAbnormalCmForChassis,
    pollutionDegree, materialGroup, ctiValue, altitudeUnit, altitude,
    safetyFactorPercent, fieldCondition, ribHeightMm, ribWidthMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.workingVoltage != null) setWorkingVoltage(v.workingVoltage);
    if (v.hvToChassisOverride !== undefined) setHvToChassisOverride(v.hvToChassisOverride);
    if (v.voltageInputMode) setVoltageInputMode(v.voltageInputMode);
    if (v.ed332Advanced != null) setEd332Advanced(v.ed332Advanced);
    if (v.ed332NetworkType) setEd332NetworkType(v.ed332NetworkType);
    if (v.ed332UseTransientForClearance != null) setEd332UseTransientForClearance(v.ed332UseTransientForClearance);
    if (v.ed332UseAbnormalCmForChassis != null) setEd332UseAbnormalCmForChassis(v.ed332UseAbnormalCmForChassis);
    if (v.pollutionDegree != null) setPollutionDegree(v.pollutionDegree);
    if (v.materialGroup) setMaterialGroup(v.materialGroup);
    if (v.ctiValue != null) setCtiValue(v.ctiValue);
    if (v.altitudeUnit) setAltitudeUnit(v.altitudeUnit);
    if (v.altitude != null) setAltitude(v.altitude);
    if (v.safetyFactorPercent != null) setSafetyFactorPercent(v.safetyFactorPercent);
    if (v.fieldCondition) setFieldCondition(v.fieldCondition);
    if (v.ribHeightMm != null) setRibHeightMm(v.ribHeightMm);
    if (v.ribWidthMm != null) setRibWidthMm(v.ribWidthMm);
  }, []);

  const saved = useSavedCalculations('creepage-clearance');
  const shareLink = useShareableLink(restoreInputs);

  const altitudeM = altitudeUnit === 'ft' ? altitude / FT_PER_M : altitude;
  const altCorrection = useMemo(() => getAltitudeCorrectionFactor(altitudeM), [altitudeM]);

  // Clearance is driven directly by working voltage (no overvoltage-category /
  // Table F.1 Un->Uimp step) — a deliberate tool-scope simplification, see the
  // Reference & assumptions card for what this trades away.
  const workingVoltageForClearanceKV = (workingVoltage / 1000) * altCorrection.factor;
  const hvToChassisForClearanceKV = (hvToChassis / 1000) * altCorrection.factor;

  const clearanceResult = useMemo(() => getClearance(workingVoltageForClearanceKV, fieldCondition, pollutionDegree), [workingVoltageForClearanceKV, fieldCondition, pollutionDegree]);
  const clearanceHvResult = useMemo(() => getClearance(hvToChassisForClearanceKV, fieldCondition, pollutionDegree), [hvToChassisForClearanceKV, fieldCondition, pollutionDegree]);
  const clearanceWithMargin = clearanceResult.mm * (1 + safetyFactorPercent / 100);
  const clearanceHvWithMargin = clearanceHvResult.mm * (1 + safetyFactorPercent / 100);

  // ED-332 advanced mode: size clearance from the worst-case abnormal voltage
  // transient (Table 2-2, 1150 VDC for either network type) instead of the
  // continuous working voltage — filling the Table F.1 impulse-withstand gap
  // disclosed above, specifically for ED-332-governed HVDC propulsive systems.
  const ed332TransientV = ed332MaxAbnormalTransientV(ed332NetworkType);
  const ed332ClearanceVoltageKV = ed332Advanced && ed332UseTransientForClearance
    ? (ed332TransientV / 1000) * altCorrection.factor
    : null;
  const clearanceEd332Result = useMemo(
    () => (ed332ClearanceVoltageKV === null ? null : getClearance(ed332ClearanceVoltageKV, fieldCondition, pollutionDegree)),
    [ed332ClearanceVoltageKV, fieldCondition, pollutionDegree],
  );
  const clearanceEd332WithMargin = clearanceEd332Result ? clearanceEd332Result.mm * (1 + safetyFactorPercent / 100) : null;

  const creepageResult = useMemo(() => (pollutionDegree === 4 ? null : getCreepage(workingVoltage, pollutionDegree, materialGroup)), [workingVoltage, pollutionDegree, materialGroup]);
  const creepageHvResult = useMemo(() => (pollutionDegree === 4 ? null : getCreepage(hvToChassis, pollutionDegree, materialGroup)), [hvToChassis, pollutionDegree, materialGroup]);
  const creepageWithMargin = creepageResult ? creepageResult.mm * (1 + safetyFactorPercent / 100) : null;
  const creepageHvWithMargin = creepageHvResult ? creepageHvResult.mm * (1 + safetyFactorPercent / 100) : null;

  // Rib/groove creepage-reduction (premium): a rib or groove of adequate width lets the same
  // required creepage distance be achieved within a smaller flat-surface footprint, per
  // IEC 60664-1's own measurement rule — see creepageClearance.ts for sourcing.
  const ribResult = pollutionDegree === 4 ? null : ribCreepageCredit(ribHeightMm, ribWidthMm, pollutionDegree);
  const footprintWorkingWithRib = ribResult && creepageWithMargin !== null ? requiredFootprintWithRibMm(creepageWithMargin, ribResult.creditMm) : null;
  const footprintHvWithRib = ribResult && creepageHvWithMargin !== null ? requiredFootprintWithRibMm(creepageHvWithMargin, ribResult.creditMm) : null;

  // Paschen's Law cross-check, using the derived (with-margin) clearance.
  // The comparison voltage is now the working voltage directly (matching the simplified clearance methodology above).
  const paschenGapMm = clearanceWithMargin;
  const pressureKPa = useMemo(() => pressureAtAltitude(altitudeM), [altitudeM]);
  const paschenPd = pressureKPa * (paschenGapMm / 10);
  const paschenV = breakdownVoltage(pressureKPa, paschenGapMm / 10);
  const paschenMinGapMm = minGapForVoltage(pressureKPa, workingVoltage) * 10;
  const paschenPass = paschenV >= workingVoltage;
  const paschenMinPd = paschenMinimum().pd;

  const marginFactor = 1 + safetyFactorPercent / 100;
  const creepageGridValue = (voltage: number) => (rowIdx: number, colIdx: number) =>
    toDisplay(getCreepage(voltage, GRID_PDS[colIdx], MATERIAL_GROUPS[rowIdx]).mm * marginFactor, unitSystem, UNIT_LENGTH);
  const clearanceGridValue = (voltageKV: number) => (rowIdx: number, colIdx: number) =>
    toDisplay(getClearance(voltageKV, FIELD_CASES[rowIdx], GRID_PDS[colIdx]).mm * marginFactor, unitSystem, UNIT_LENGTH);

  const creepageHighlightCol = GRID_PDS.indexOf(pollutionDegree as 1 | 2 | 3);
  const creepageHighlightRow = MATERIAL_GROUPS.indexOf(materialGroup);
  const clearanceHighlightCol = GRID_PDS.indexOf(pollutionDegree as 1 | 2 | 3);
  const clearanceHighlightRow = FIELD_CASES.indexOf(fieldCondition);

  const gridTables: ReportGridTable[] = useMemo(() => {
    const tables = [
      buildGridTable(`Creepage @ Working Voltage (${fmt(workingVoltage, 0)} V)`, MATERIAL_GROUPS, GRID_COL_LABELS, creepageGridValue(workingVoltage), creepageHighlightRow, creepageHighlightCol, unitLabel(unitSystem, UNIT_LENGTH)),
      buildGridTable(`Creepage @ HV to Chassis (${fmt(hvToChassis, 0)} V)`, MATERIAL_GROUPS, GRID_COL_LABELS, creepageGridValue(hvToChassis), creepageHighlightRow, creepageHighlightCol, unitLabel(unitSystem, UNIT_LENGTH)),
      buildGridTable(`Clearance @ Working Voltage (${fmt(workingVoltageForClearanceKV, 3)} kV, altitude-adjusted)`, ['Case A', 'Case B'], GRID_COL_LABELS, clearanceGridValue(workingVoltageForClearanceKV), clearanceHighlightRow, clearanceHighlightCol, unitLabel(unitSystem, UNIT_LENGTH)),
      buildGridTable(`Clearance @ HV to Chassis (${fmt(hvToChassisForClearanceKV, 3)} kV, altitude-adjusted)`, ['Case A', 'Case B'], GRID_COL_LABELS, clearanceGridValue(hvToChassisForClearanceKV), clearanceHighlightRow, clearanceHighlightCol, unitLabel(unitSystem, UNIT_LENGTH)),
    ];
    if (ed332ClearanceVoltageKV !== null) {
      tables.push(buildGridTable(`Clearance @ ED-332 Transient (${fmt(ed332TransientV, 0)} VDC, ${fmt(ed332ClearanceVoltageKV, 3)} kV altitude-adjusted)`, ['Case A', 'Case B'], GRID_COL_LABELS, clearanceGridValue(ed332ClearanceVoltageKV), clearanceHighlightRow, clearanceHighlightCol, unitLabel(unitSystem, UNIT_LENGTH)));
    }
    return tables;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingVoltage, hvToChassis, workingVoltageForClearanceKV, hvToChassisForClearanceKV, ed332ClearanceVoltageKV, ed332TransientV, marginFactor, creepageHighlightRow, creepageHighlightCol, clearanceHighlightRow, clearanceHighlightCol, unitSystem]);

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const stepsOut: CalcStepData[] = [
      {
        title: 'Altitude correction factor (IEC 60664-1 Table F.10)',
        formula: 'k = f(altitude), linearly interpolated between tabulated points; k = 1.0 below 2000 m',
        substitution: `Altitude = ${fmt(altitude, 0)} ${altitudeUnit} = ${fmt(altitudeM, 0)} m`,
        result: `k = ${fmt(altCorrection.factor, 3)}`,
      },
      {
        title: 'Altitude-adjusted voltage for clearance (working voltage used directly — no overvoltage-category step-up)',
        formula: 'V_clearance = working voltage × k',
        substitution: `Working voltage: ${workingVoltage} V × ${fmt(altCorrection.factor, 3)} = ${fmt(workingVoltage * altCorrection.factor, 0)} V. HV to chassis: ${fmt(hvToChassis, 0)} V × ${fmt(altCorrection.factor, 3)} = ${fmt(hvToChassis * altCorrection.factor, 0)} V`,
        result: `${fmt(workingVoltageForClearanceKV, 3)} kV (working) / ${fmt(hvToChassisForClearanceKV, 3)} kV (HV to chassis)`,
      },
      {
        title: `Required clearance (IEC 60664-1 Table F.2, Case ${fieldCondition} — ${fieldCondition === 'A' ? 'inhomogeneous' : 'homogeneous'} field, PD${pollutionDegree} floor) + safety factor`,
        formula: 'Clearance = max(f(V)^b (ratio-based), pollution-degree floor) × (1 + FoS)',
        result: `Working voltage: base ${fmt(clearanceResult.mm, 3)} mm${clearanceResult.floorApplied ? ' (PD floor applied)' : ''}, with ${safetyFactorPercent}% margin = ${fmt(clearanceWithMargin, 3)} mm. HV to chassis: base ${fmt(clearanceHvResult.mm, 3)} mm${clearanceHvResult.floorApplied ? ' (PD floor applied)' : ''}, with margin = ${fmt(clearanceHvWithMargin, 3)} mm`,
      },
    ];

    if (pollutionDegree !== 4 && creepageResult && creepageHvResult) {
      stepsOut.push({
        title: 'Required creepage distance (IEC 60664-1 Table F.4, functional insulation) + safety factor',
        formula: 'Creepage = f(working voltage, pollution degree, material group)^b (power-law interpolated between tabulated voltage bands) × (1 + FoS)',
        substitution: `PD${pollutionDegree}, ${MATERIAL_GROUP_CTI[materialGroup].label}`,
        result: `Working voltage (${workingVoltage} V): base ${fmt(creepageResult.mm, 3)} mm, with margin = ${fmt(creepageWithMargin ?? 0, 3)} mm. HV to chassis (${fmt(hvToChassis, 0)} V): base ${fmt(creepageHvResult.mm, 3)} mm, with margin = ${fmt(creepageHvWithMargin ?? 0, 3)} mm`,
      });
    }

    if (ed332ClearanceVoltageKV !== null && clearanceEd332Result) {
      stepsOut.push({
        title: `Required clearance, ED-332 abnormal transient (${ED332_NETWORK_LABELS[ed332NetworkType]}, IEC 60664-1 Table F.2) + safety factor`,
        formula: 'V_transient = ED-332 worst-case abnormal transient peak (Table 2-2) × altitude factor; Clearance = max(f(V)^b, PD floor) × (1 + FoS)',
        substitution: `${fmt(ed332TransientV, 0)} VDC × ${fmt(altCorrection.factor, 3)} = ${fmt(ed332TransientV * altCorrection.factor, 0)} V (${fmt(ed332ClearanceVoltageKV, 3)} kV)`,
        result: `base ${fmt(clearanceEd332Result.mm, 3)} mm${clearanceEd332Result.floorApplied ? ' (PD floor applied)' : ''}, with ${safetyFactorPercent}% margin = ${fmt(clearanceEd332WithMargin ?? 0, 3)} mm`,
      });
    }

    stepsOut.push({
      title: "Paschen's Law cross-check",
      formula: 'V_b = B·(p·d) / [ln(A·(p·d)) − ln(ln(1 + 1/γ))], A=113/(kPa·cm), B=2740 V/(kPa·cm), γ=0.01',
      substitution: `p = ${fmt(pressureKPa, 2)} kPa at ${fmt(altitude, 0)} ${altitudeUnit}, d = ${fmt(paschenGapMm, 2)} mm → p·d = ${fmt(paschenPd, 3)} kPa·cm`,
      result: `V_b = ${fmt(paschenV, 0)} V vs working voltage ${fmt(workingVoltage, 0)} V — ${paschenPass ? 'consistent with the design' : 'below the working voltage, check the design'}`,
    });

    if (ribResult) {
      stepsOut.push({
        title: 'Rib / groove creepage reduction (IEC 60664-1)',
        formula: 'Credit = widthOk ? 2·H : 0 (widthOk = W ≥ minimum-width(PD)); footprint = max(0, required creepage − credit)',
        substitution: `H = ${fmt(ribHeightMm, 2)} mm, W = ${fmt(ribWidthMm, 2)} mm, minimum width at PD${pollutionDegree} = ${fmt(ribResult.minWidthMm, 2)} mm`,
        result: ribResult.widthOk
          ? `Credit = ${fmt(ribResult.creditMm, 2)} mm. Footprint (working voltage) = ${fmt(footprintWorkingWithRib ?? 0, 3)} mm, (HV to chassis) = ${fmt(footprintHvWithRib ?? 0, 3)} mm`
          : `Below minimum width — bridged, credit = 0 mm`,
      });
    }

    return stepsOut;
  }, [altitude, altitudeUnit, altitudeM, altCorrection, workingVoltage, hvToChassis, workingVoltageForClearanceKV, hvToChassisForClearanceKV, fieldCondition, pollutionDegree, clearanceResult, clearanceHvResult, safetyFactorPercent, clearanceWithMargin, clearanceHvWithMargin, creepageResult, creepageHvResult, materialGroup, creepageWithMargin, creepageHvWithMargin, pressureKPa, paschenGapMm, paschenPd, paschenV, paschenPass, ed332ClearanceVoltageKV, clearanceEd332Result, clearanceEd332WithMargin, ed332NetworkType, ed332TransientV, ribResult, ribHeightMm, ribWidthMm, footprintWorkingWithRib, footprintHvWithRib]);

  const inputSections: ReportSection[] = useMemo(() => {
    const elecRows: ReportRow[] = [
      { label: 'Working voltage', value: `${workingVoltage} V rms` },
      { label: 'Working voltage to chassis', value: `${fmt(hvToChassis, 0)} V rms${hvToChassisOverride === null ? ` (${fmt(hvToChassisDefaultFraction * 100, 0)}% of working voltage, default)` : ''}` },
      { label: 'Insulation type', value: 'Functional (assumed)' },
      { label: 'Factor of safety', value: `${safetyFactorPercent}%` },
      { label: 'Electric field condition', value: fieldCondition === 'A' ? 'Inhomogeneous (Case A)' : 'Homogeneous (Case B)' },
    ];
    if (ed332Advanced) {
      elecRows.push({ label: 'ED-332 network type', value: ED332_NETWORK_LABELS[ed332NetworkType] });
      if (ed332ClearanceVoltageKV !== null) {
        elecRows.push({ label: 'ED-332 abnormal transient voltage', value: `${fmt(ed332TransientV, 0)} VDC` });
      }
    }
    const envRows: ReportRow[] = [
      { label: 'Pollution degree', value: `PD${pollutionDegree}` },
      { label: 'Material group', value: MATERIAL_GROUP_CTI[materialGroup].label },
      { label: 'Altitude', value: `${altitude} ${altitudeUnit}` },
    ];

    return [
      { heading: 'Electrical parameters', rows: elecRows },
      { heading: 'Environment', rows: envRows },
    ];
  }, [workingVoltage, hvToChassis, hvToChassisOverride, hvToChassisDefaultFraction, safetyFactorPercent, fieldCondition, pollutionDegree, materialGroup, altitude, altitudeUnit, ed332Advanced, ed332NetworkType, ed332ClearanceVoltageKV, ed332TransientV]);

  const outputSections: ReportSection[] = useMemo(() => {
    const requiredDistanceRows: ReportRow[] = [
      { label: 'Required clearance, working voltage (with margin)', value: `${fmtU(clearanceWithMargin, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Required clearance, HV to chassis (with margin)', value: `${fmtU(clearanceHvWithMargin, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Required creepage, working voltage (with margin)', value: pollutionDegree === 4 ? 'N/A' : `${fmtU(creepageWithMargin ?? 0, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Required creepage, HV to chassis (with margin)', value: pollutionDegree === 4 ? 'N/A' : `${fmtU(creepageHvWithMargin ?? 0, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      { label: 'Altitude correction factor', value: fmt(altCorrection.factor, 2) },
    ];
    if (ed332ClearanceVoltageKV !== null && clearanceEd332WithMargin !== null) {
      requiredDistanceRows.push({ label: 'Required clearance, ED-332 abnormal transient (with margin)', value: `${fmtU(clearanceEd332WithMargin, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` });
    }
    return [
    {
      heading: 'Required distances',
      rows: requiredDistanceRows,
    },
    {
      heading: "Paschen's Law cross-check",
      rows: [
        { label: 'Breakdown voltage at this gap', value: `${fmt(paschenV, 0)} V` },
        { label: 'Min. gap for working voltage', value: `${fmtU(paschenMinGapMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
      ],
    },
    ];
  }, [clearanceWithMargin, clearanceHvWithMargin, pollutionDegree, creepageWithMargin, creepageHvWithMargin, altCorrection, paschenV, paschenMinGapMm, ed332ClearanceVoltageKV, clearanceEd332WithMargin, unitSystem]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Creepage_Clearance_Calculator',
      pageTitle: 'Creepage & Clearance Distance Calculator',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      gridTables,
      disclaimer: 'Engineering estimation tool. Standard: IEC 60664-1 (clearance from Table F.2/altitude from Table F.10, creepage from Table F.4). Clearance is driven directly by the working voltage (no overvoltage-category / Table F.1 Un->Uimp step-up) — this is a deliberate tool-scope simplification and will understate the required clearance for circuits exposed to significant transient overvoltages (e.g. direct mains connection); reintroduce an impulse-withstand-voltage margin manually for such designs. Assumes functional insulation throughout. Peak-voltage input assumes a sinusoidal waveform (Vrms = Vpeak/sqrt(2)); enter RMS directly for a DC or non-sinusoidal rating. Rib/groove creepage reduction: a feature narrower than IEC 60664-1\'s pollution-degree-dependent minimum width (0.25/1.0/1.5mm at PD1/PD2/PD3) is bridged (zero credit) in the standard\'s measurement rule; a feature meeting the minimum credits 2x its height as additional creepage path length, the standard engineering approximation for a simple rectangular rib/groove profile (not the standard\'s full set of angled/rounded-contour measurement figures).'
        + (ed332Advanced ? ` ED-332 advanced mode (${ED332_NETWORK_LABELS[ed332NetworkType]}): the abnormal-transient clearance scenario uses ED-332's ${fmt(ed332TransientV, 0)} VDC worst-case abnormal voltage transient (1 s duration, Table 2-2) as a conservative proxy for the clearance-driving voltage — this is a sustained-transient value, not a true IEC 60664-1 rated impulse withstand voltage (1.2/50 microsecond waveform), so treat it as a standards-informed engineering judgement rather than a literal substitution. The HV-to-chassis default (when enabled) reflects ED-332 REQ[009]'s abnormal common-mode condition, where a terminal may reach the full working voltage to ground. ED-332 REQ[0030] additionally requires a Dielectric Withstanding Voltage of ${ED332_DIELECTRIC_WITHSTAND_V} VDC at sea level (HVDC terminals to casing / to non-HVDC circuits) and REQ[0031] requires insulation resistance of at least ${ED332_INSULATION_MIN_MOHM.A} MOhm (Category A) or ${ED332_INSULATION_MIN_MOHM.B} MOhm (Category B, default) tested at ${ED332_INSULATION_TEST_V} VDC — both shown as reference values only; this tool does not compute insulation resistance.` : '')
        + ' Verify exact values against the current official IEC 60664-1 text, and any applicable product standard, before certification use.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Creepage &amp; Clearance Calculator</div>
          <h1>Creepage &amp; Clearance Distance Calculator</h1>
          <p>
            Determine minimum clearance (through air) and creepage (over a surface) distances per IEC 60664-1
            methodology, accounting for pollution degree, material group (CTI) and altitude — from sea level up
            to 50,000 ft — with a Paschen's Law first-principles cross-check. Every calculation step is shown
            below with your numbers substituted in.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div style={{ marginBottom: '1.25rem' }}>
        <PremiumGate feature="Advanced: ED-332 HVDC calculations">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
            <input type="checkbox" checked={ed332Advanced} onChange={(e) => setEd332Advanced(e.target.checked)} style={{ width: 'auto' }} />
            Advanced: ED-332 (HVDC aircraft propulsive systems)
            <InfoTooltip>EUROCAE ED-332 "Guidance on Characteristics of Aircraft Propulsive High Voltage DC Electrical Systems" defines steady-state and abnormal-transient voltage envelopes for 800 VDC-class propulsive networks. Turn this on to size clearance from ED-332's worst-case abnormal voltage transient instead of the continuous working voltage, default the HV-to-chassis voltage from ED-332's abnormal common-mode condition, and see the standard's Dielectric Withstanding Voltage and insulation resistance requirements alongside your IEC 60664-1 results.</InfoTooltip>
          </label>
        </PremiumGate>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Electrical parameters</span></div>
            <div className="field" style={{ marginBottom: '0.6rem' }}>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Voltage entered as
                <InfoTooltip>Both voltage fields below are interpreted the same way. Peak assumes a sinusoidal waveform (Vrms = Vpeak/√2) — for a DC or non-sinusoidal withstand voltage rating, enter RMS directly if you know it rather than relying on this conversion.</InfoTooltip>
              </label>
              <div className="segmented">
                <button className={voltageInputMode === 'rms' ? 'active' : ''} onClick={() => setVoltageInputMode('rms')}>RMS</button>
                <button className={voltageInputMode === 'peak' ? 'active' : ''} onClick={() => setVoltageInputMode('peak')}>Peak (withstand)</button>
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Working voltage (V {voltageInputMode})</label>
                <input autoComplete="off" type="number" min={0} value={Math.round(toVoltageDisplay(workingVoltage) * 10) / 10} onChange={e => setWorkingVoltage(fromVoltageDisplay(Number(e.target.value)))} />
                <span className="hint">Drives both creepage and clearance directly — the highest voltage actually across the insulation{voltageInputMode === 'peak' ? ` (≈${fmt(workingVoltage, 1)} V rms, used internally)` : ''}.</span>
              </div>
              <div className="field">
                <label>Working voltage to chassis (V {voltageInputMode})</label>
                <input autoComplete="off" type="number" min={0} value={Math.round(toVoltageDisplay(hvToChassis) * 10) / 10} onChange={e => setHvToChassisOverride(fromVoltageDisplay(Number(e.target.value)))} />
                <span className="hint">Defaults to {fmt(hvToChassisDefaultFraction * 100, 0)}% of working voltage{ed332Advanced && ed332UseAbnormalCmForChassis ? ' (ED-332 abnormal common-mode)' : ''} — edit to override.{hvToChassisOverride !== null && (
                  <> {' '}<button className="btn small" style={{ marginLeft: '0.4rem' }} onClick={() => setHvToChassisOverride(null)}>Reset to {fmt(hvToChassisDefaultFraction * 100, 0)}%</button></>
                )}</span>
              </div>
              <div className="field">
                <label>Factor of safety (%)</label>
                <input autoComplete="off" type="number" min={0} step={5} value={safetyFactorPercent} onChange={e => setSafetyFactorPercent(Number(e.target.value))} />
                <span className="hint">Applied as a margin on top of the standard's calculated minimum distances (default 20%).</span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Electric field condition (clearance only)
                  <InfoTooltip>
                    <strong>{FIELD_CONDITION_DESCRIPTIONS.A.title}:</strong> {FIELD_CONDITION_DESCRIPTIONS.A.body}
                    <br /><br />
                    <strong>{FIELD_CONDITION_DESCRIPTIONS.B.title}:</strong> {FIELD_CONDITION_DESCRIPTIONS.B.body}
                  </InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={fieldCondition === 'A' ? 'active' : ''} onClick={() => setFieldCondition('A')}>Inhomogeneous (Case A)</button>
                  <button className={fieldCondition === 'B' ? 'active' : ''} onClick={() => setFieldCondition('B')}>Homogeneous (Case B)</button>
                </div>
                <span className="hint">Case A is the safe default usable for any geometry; Case B needs a uniform-field design verified by test.</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Environment</span></div>
            <div className="field" style={{ marginBottom: '0.85rem' }}>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Pollution degree
                <InfoTooltip>
                  <strong>PD1:</strong> {POLLUTION_DEGREE_DESCRIPTIONS[1]}<br /><br />
                  <strong>PD2:</strong> {POLLUTION_DEGREE_DESCRIPTIONS[2]}<br /><br />
                  <strong>PD3:</strong> {POLLUTION_DEGREE_DESCRIPTIONS[3]}<br /><br />
                  <strong>PD4:</strong> {POLLUTION_DEGREE_DESCRIPTIONS[4]}
                </InfoTooltip>
              </label>
              <div className="segmented">
                {[1, 2, 3, 4].map(pd => (
                  <button key={pd} className={pollutionDegree === pd ? 'active' : ''} onClick={() => setPollutionDegree(pd as PollutionDegree)}>PD{pd}</button>
                ))}
              </div>
              <span className="hint">PD4 has no creepage table value (IEC 60664-1 4.6.3) — requires enclosure/coating design; clearance still computes with its footnoted 1.6 mm floor.</span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Material group
                  <InfoTooltip>{MATERIAL_GROUP_DESCRIPTION}</InfoTooltip>
                </label>
                <div className="segmented">
                  {(['I', 'II', 'IIIa', 'IIIb'] as MaterialGroup[]).map(g => (
                    <button key={g} className={materialGroup === g ? 'active' : ''} onClick={() => setMaterialGroup(g)}>{g}</button>
                  ))}
                </div>
                <span className="hint">{MATERIAL_GROUP_CTI[materialGroup].label}. IIIb is the conservative default for unknown/general-purpose plastics.</span>
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button className="btn small" onClick={() => setShowCtiHelper(v => !v)} style={{ marginBottom: '0.3rem' }}>
                  {showCtiHelper ? 'Hide' : 'Derive from CTI value ▾'}
                </button>
                {showCtiHelper && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input autoComplete="off" type="number" min={0} value={ctiValue} onChange={e => setCtiValue(Number(e.target.value))} />
                    <button className="btn small primary" onClick={() => setMaterialGroup(materialGroupFromCti(ctiValue))}>Use</button>
                  </div>
                )}
                <span className="hint">CTI per IEC 60112. If unknown, use Group IIIb.</span>
              </div>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.85rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Altitude</span>
                  <span className="tag">correction k = {fmt(altCorrection.factor, 3)}</span>
                </label>
                <div className="grid grid-2">
                  <input autoComplete="off" type="number" min={0} value={altitude} onChange={e => setAltitude(Number(e.target.value))} />
                  <div className="segmented">
                    <button className={altitudeUnit === 'ft' ? 'active' : ''} onClick={() => setAltitudeUnit('ft')}>ft</button>
                    <button className={altitudeUnit === 'm' ? 'active' : ''} onClick={() => setAltitudeUnit('m')}>m</button>
                  </div>
                </div>
                <span className="hint">
                  No correction below 2000 m (6562 ft) — that is the standard's native reference condition. Correction
                  applies to clearance only; creepage (a surface-tracking property) is not altitude-dependent.
                  {altCorrection.extrapolated && <span style={{ color: 'var(--warn)' }}> Beyond tabulated range — extrapolated.</span>}
                </span>
              </div>
            </div>
          </div>

          {ed332Advanced && (
            <div className="card">
              <div className="card-title"><span><span className="step-num">3</span>ED-332 — HVDC propulsive system</span></div>
              <div className="field" style={{ marginBottom: '0.85rem' }}>
                <label>Network type</label>
                <div className="segmented">
                  {(['UR', 'R'] as Ed332NetworkType[]).map(t => (
                    <button key={t} className={ed332NetworkType === t ? 'active' : ''} onClick={() => setEd332NetworkType(t)}>{ED332_NETWORK_LABELS[t]}</button>
                  ))}
                </div>
                <span className="hint">
                  Steady-state range (Table 2-1): {ED332_STEADY_STATE_V[ed332NetworkType].minV}&ndash;{ED332_STEADY_STATE_V[ed332NetworkType].maxV} VDC.
                  Worst-case abnormal transient (Table 2-2, {ED332_TRANSIENTS[0].durationS} s): {fmt(ed332TransientV, 0)} VDC.
                </span>
              </div>
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 400 }}>
                  <input type="checkbox" checked={ed332UseTransientForClearance} onChange={e => setEd332UseTransientForClearance(e.target.checked)} style={{ width: 'auto' }} />
                  Size clearance from the {fmt(ed332TransientV, 0)} VDC abnormal transient peak
                  <InfoTooltip>Adds a fifth clearance scenario, using ED-332's worst-case abnormal voltage transient (Table 2-2, Condition 1) as the clearance-driving voltage instead of the continuous working voltage — filling the Table F.1 rated-impulse-withstand-voltage step this tool otherwise skips. This is a conservative proxy, not a literal impulse-withstand substitution: the transient is a 1-second sustained overvoltage, not a 1.2/50 microsecond impulse waveform.</InfoTooltip>
                </label>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 400 }}>
                  <input type="checkbox" checked={ed332UseAbnormalCmForChassis} onChange={e => setEd332UseAbnormalCmForChassis(e.target.checked)} style={{ width: 'auto' }} />
                  Default HV-to-chassis to 100% of working voltage
                  <InfoTooltip>ED-332 REQ[009]: in an abnormal (fault) condition, a terminal may reach the full differential/working voltage relative to chassis ground (the standard's own worked example: for VDM = 800 V, 0 V &lt; VPG &lt; 800 V). Overrides this tool's usual 50%-of-working-voltage default for the HV-to-chassis scenario — still editable via the input above.</InfoTooltip>
                </label>
              </div>
              <div className="field" style={{ marginTop: '0.85rem' }}>
                <label>Reference: other ED-332 insulation requirements (informational — not computed by this tool)</label>
                <span className="hint">
                  REQ[0030] Dielectric Withstanding Voltage: {ED332_DIELECTRIC_WITHSTAND_V} VDC at sea level (HVDC terminals to casing, and to non-HVDC circuits).<br />
                  REQ[0031] Insulation resistance, tested at {ED332_INSULATION_TEST_V} VDC: &ge;{ED332_INSULATION_MIN_MOHM.A} MΩ (Category A) or &ge;{ED332_INSULATION_MIN_MOHM.B} MΩ (Category B, default if unspecified).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Reference tables</div>
            <PremiumGate feature="Reference tables">
              <>
                <p className="note" style={{ marginBottom: '0.9rem' }}>
                  Required distances (including the {safetyFactorPercent}% factor of safety) at your current working voltage and
                  HV-to-chassis voltage, across every Material Group / Case × Pollution Degree combination — the highlighted
                  cell matches your current selection.
                </p>
                <ComparisonGrid
                  title={`Creepage @ Working Voltage (${fmt(workingVoltage, 0)} V)`}
                  rowLabels={MATERIAL_GROUPS}
                  colLabels={GRID_COL_LABELS}
                  getValue={creepageGridValue(workingVoltage)}
                  highlightRow={creepageHighlightRow}
                  highlightCol={creepageHighlightCol}
                  unit={unitLabel(unitSystem, UNIT_LENGTH)}
                />
                <ComparisonGrid
                  title={`Creepage @ HV to Chassis (${fmt(hvToChassis, 0)} V)`}
                  rowLabels={MATERIAL_GROUPS}
                  colLabels={GRID_COL_LABELS}
                  getValue={creepageGridValue(hvToChassis)}
                  highlightRow={creepageHighlightRow}
                  highlightCol={creepageHighlightCol}
                  unit={unitLabel(unitSystem, UNIT_LENGTH)}
                />
                <ComparisonGrid
                  title={`Clearance @ Working Voltage (${fmt(workingVoltageForClearanceKV, 3)} kV, altitude-adjusted)`}
                  rowLabels={['Case A', 'Case B']}
                  colLabels={GRID_COL_LABELS}
                  getValue={clearanceGridValue(workingVoltageForClearanceKV)}
                  highlightRow={clearanceHighlightRow}
                  highlightCol={clearanceHighlightCol}
                  unit={unitLabel(unitSystem, UNIT_LENGTH)}
                />
                <ComparisonGrid
                  title={`Clearance @ HV to Chassis (${fmt(hvToChassisForClearanceKV, 3)} kV, altitude-adjusted)`}
                  rowLabels={['Case A', 'Case B']}
                  colLabels={GRID_COL_LABELS}
                  getValue={clearanceGridValue(hvToChassisForClearanceKV)}
                  highlightRow={clearanceHighlightRow}
                  highlightCol={clearanceHighlightCol}
                  unit={unitLabel(unitSystem, UNIT_LENGTH)}
                />
                {ed332ClearanceVoltageKV !== null && (
                  <ComparisonGrid
                    title={`Clearance @ ED-332 Transient (${fmt(ed332TransientV, 0)} VDC, ${fmt(ed332ClearanceVoltageKV, 3)} kV altitude-adjusted)`}
                    rowLabels={['Case A', 'Case B']}
                    colLabels={GRID_COL_LABELS}
                    getValue={clearanceGridValue(ed332ClearanceVoltageKV)}
                    highlightRow={clearanceHighlightRow}
                    highlightCol={clearanceHighlightCol}
                    unit={unitLabel(unitSystem, UNIT_LENGTH)}
                  />
                )}
              </>
            </PremiumGate>
          </div>

          <div className="card">
            <div className="card-title">
              <span>Paschen's Law cross-check</span>
              <span className={`tag`} style={{ background: paschenPass ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: paschenPass ? 'var(--pos)' : 'var(--neg)', borderColor: 'transparent' }}>
                {paschenPass ? 'consistent' : 'check design'}
              </span>
            </div>
            <PremiumGate feature="Paschen's Law cross-check">
              <>
                <p className="note" style={{ marginBottom: '0.9rem' }}>
                  First-principles physics, independent of the IEC table: air's dielectric breakdown voltage depends on
                  the pressure × gap product (p·d). At {fmt(altitude, 0)} {altitudeUnit} the local pressure is{' '}
                  {fmt(pressureKPa, 2)} kPa (vs {fmt(101.325, 2)} kPa at sea level) — for a {fmtU(paschenGapMm, unitSystem, UNIT_LENGTH, 3)} {unitLabel(unitSystem, UNIT_LENGTH)} gap,
                  p·d = {fmt(paschenPd, 3)} kPa·cm, well above the Paschen minimum ({fmt(paschenMinPd, 3)} kPa·cm),
                  so breakdown voltage still falls monotonically as altitude increases — the IEC table's assumption
                  holds throughout this range.
                </p>
                <div className="result-grid">
                  <div className="result-tile">
                    <div className="label">Breakdown voltage at this gap</div>
                    <div className={`value ${paschenPass ? 'pos' : 'neg'}`}>{fmt(paschenV, 0)}<span className="unit">V</span></div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Min. gap for working voltage</div>
                    <div className="value">{fmtU(paschenMinGapMm, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <PaschenChart currentPd={paschenPd} currentV={paschenV} requiredV={workingVoltage} />
                </div>
              </>
            </PremiumGate>
          </div>

          <div className="card">
            <div className="card-title">Rib / groove creepage reduction</div>
            <PremiumGate feature="Rib/groove creepage reduction">
              {pollutionDegree === 4 || !ribResult ? (
                <p className="note">Not applicable at PD4 — creepage has no table value at this pollution degree (enclosure/coating design required instead).</p>
              ) : (
                <>
                  <p className="note" style={{ marginBottom: '0.9rem' }}>
                    A rib (raised barrier) or groove (recessed channel) of adequate width lets the standard's
                    required creepage distance be achieved within a smaller flat-surface footprint — the
                    creepage path is measured up-and-over (or down-and-across) the feature rather than straight
                    across it, adding roughly twice its height to the path.
                  </p>
                  <div className="grid grid-2" style={{ marginBottom: '0.5rem' }}>
                    <div className="field">
                      <label>Rib / groove height, H ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                      <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(ribHeightMm, unitSystem, UNIT_LENGTH)} onChange={e => setRibHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                    </div>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Rib / groove width, W ({unitLabel(unitSystem, UNIT_LENGTH)})
                        <InfoTooltip>Must be at least {fmt(ribResult.minWidthMm, 2)} mm at PD{pollutionDegree} (IEC 60664-1's minimum width for a groove/rib not to be "bridged" in the standard's measurement rule — narrower features are ignored, as if contamination could span the gap). The minimum rises with pollution degree: 0.25mm at PD1, 1.0mm at PD2, 1.5mm at PD3.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step={0.05} value={toDisplay(ribWidthMm, unitSystem, UNIT_LENGTH)} onChange={e => setRibWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                    </div>
                  </div>
                  <span className="hint" style={{ display: 'block', marginBottom: '0.9rem' }}>
                    Minimum width at PD{pollutionDegree}: {fmtU(ribResult.minWidthMm, unitSystem, UNIT_LENGTH, 3)} {unitLabel(unitSystem, UNIT_LENGTH)}.
                    {!ribResult.widthOk && <span style={{ color: 'var(--neg)' }}> ⚠ Below minimum — this feature would be bridged (ignored) in the standard's measurement, giving zero credit.</span>}
                    {ribResult.widthOk && <span> ✓ Meets the minimum — credits {fmtU(ribResult.creditMm, unitSystem, UNIT_LENGTH, 3)} {unitLabel(unitSystem, UNIT_LENGTH)} of additional creepage path (2×H).</span>}
                  </span>
                  <ComparisonGrid
                    title="Required flat-surface footprint"
                    rowLabels={['Working voltage', 'HV to chassis']}
                    colLabels={['Without rib/groove', 'With rib/groove']}
                    getValue={(ri, ci) => {
                      const without = ri === 0 ? (creepageWithMargin ?? 0) : (creepageHvWithMargin ?? 0);
                      const withRib = ri === 0 ? (footprintWorkingWithRib ?? 0) : (footprintHvWithRib ?? 0);
                      return toDisplay(ci === 0 ? without : withRib, unitSystem, UNIT_LENGTH);
                    }}
                    highlightRow={-1}
                    highlightCol={1}
                    unit={unitLabel(unitSystem, UNIT_LENGTH)}
                  />
                  <div style={{ marginTop: '1rem' }}>
                    <RibCrossSectionDiagram heightMm={ribHeightMm} widthMm={ribWidthMm} widthOk={ribResult.widthOk} />
                  </div>
                </>
              )}
            </PremiumGate>
          </div>

        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/creepage-clearance" />
        <p className="note">
          Clearance uses IEC 60664-1 Table F.2 (verified against the standard's full text), with a choice of
          Case A (inhomogeneous field, always usable) or Case B (homogeneous field, smaller clearances but
          requires geometry designed for a uniform field and verification by voltage-withstand test), plus the
          table's own footnoted pollution-degree floors (PD2 ≥ 0.2 mm, PD3 ≥ 0.8 mm, PD4 ≥ 1.6 mm — small gaps
          can be bridged completely by particles/condensation regardless of the voltage a gap otherwise has to
          withstand). <strong>Clearance is driven directly by the working voltage</strong> (and separately by the
          working voltage to chassis), altitude-corrected — this tool does not step the working voltage up
          through an overvoltage category / rated impulse withstand voltage (IEC 60664-1 Table F.1) first, which
          is a deliberate simplification that will understate required clearance for circuits exposed to
          significant transient overvoltages (e.g. direct mains connection) — add your own margin for those.
          Creepage uses the IEC 60664-1 CTI/pollution-degree methodology (subclause 2.7.1.3) as tabulated in
          Table F.4, assuming <strong>functional insulation throughout</strong> (this tool does not model
          basic/supplementary/reinforced insulation separately). Both creepage and clearance are now power-law
          interpolated between the standard's tabulated voltage points (rather than taking the next-higher
          band's more conservative value), since these tables approximate a power law, not a straight line, or a
          step function. Altitude correction (IEC 60664-1 Table F.10 / Table A.2) is applied only to clearance —
          cross-checked against standard-atmosphere barometric pressure, and against Paschen's Law directly.
          Paschen's Law assumes an idealised uniform field between clean electrodes; real-world breakdown
          voltage is typically lower due to field non-uniformity, surface roughness and humidity — treat it as a
          physics sanity check, not a substitute for the standard's tested margins. Pollution degree 4 has no
          creepage table value (enclosure/coating design required) but clearance still computes via its
          footnoted floor. This tool supports engineering estimation — verify exact values against the current
          official IEC 60664-1 text, and any applicable product standard, before certification use.
          {ed332Advanced && (
            <> <strong>ED-332 advanced mode</strong> (read from a licensed copy of EUROCAE ED-332, 22 January 2025)
            adds a fifth clearance scenario driven by the standard's worst-case abnormal voltage transient
            (Table 2-2) — a sustained 1-second overvoltage, not a true IEC 60664-1 impulse waveform, so treat it
            as a conservative proxy rather than a literal substitution — and can default the HV-to-chassis
            voltage from the standard's abnormal common-mode condition (REQ[009]). The Dielectric Withstanding
            Voltage (REQ[0030]) and insulation resistance (REQ[0031]) requirements are shown for reference only
            and are not computed by this tool.</>
          )}
        </p>
        <p className="note">
          <b>Voltage input mode:</b> both voltage fields can be entered as RMS or as a peak/withstand value —
          switching modes only changes how the numbers you type are interpreted (Vrms = Vpeak/√2, assuming a
          sinusoidal waveform); every downstream calculation still uses RMS internally, matching Table F.4's own
          basis. For a DC or non-sinusoidal withstand rating, enter RMS directly if you know it.
        </p>
        <p className="note">
          <b>Rib / groove creepage reduction</b> (Premium): a rib (raised barrier) or groove (recessed channel)
          molded or cut into the insulation surface lets the required creepage distance be met within a smaller
          flat footprint, since the standard's measurement rule traces the creepage path up-and-over (or
          down-and-across) the feature rather than straight across it. A feature narrower than IEC 60664-1's
          pollution-degree-dependent minimum width — 0.25mm at PD1, 1.0mm at PD2, 1.5mm at PD3 (reproduced from
          the standard's own table, cross-checked against Texas Instruments' "Demystifying Clearance and
          Creepage Distance for High-Voltage End Equipment" application note, which cites and quotes the same
          IEC 60664-1 table) — is "bridged" in the standard's measurement: the path is measured straight across
          as if the feature weren't there, since contamination can span a gap that narrow, giving zero credit.
          A feature meeting the minimum width credits <strong>twice its height</strong> as additional creepage
          path length — the standard engineering approximation for a simple rectangular rib/groove profile (the
          path travels up one face and down the other, or vice versa), not a literal reproduction of the
          standard's full set of measurement figures for angled or rounded contours, uncemented joints, or
          multiple ribs in series, which this tool does not attempt to model.
        </p>
        <p className="note">
          <b>Validated:</b> checked that the calculator reproduces the standard's own tabulated points exactly
          at several spot checks (e.g. 1.0 kV Case A → 0.15 mm clearance; 400 V/PD2/Group I → 2.0 mm creepage;
          250 V/PD2/Group IIIb → 2.5 mm creepage — all widely-cited reference figures), and that the power-law
          interpolation between tabulated points was independently re-derived from the documented formula and
          matches the calculator's output to 5+ significant figures at a non-tabulated voltage (0.7 kV → 0.07889
          mm both ways). The rib/groove minimum-width table (0.25/1.0/1.5mm) exactly reproduces the TI
          application note's own published table; the bridging rule (below minimum → zero credit) and the 2×
          height credit rule were checked against hand-worked cases including the exact minimum-width boundary
          (width equal to, not just above, the minimum still counts).
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
