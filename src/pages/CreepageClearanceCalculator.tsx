import { useMemo, useState } from 'react';
import PaschenChart from '../components/PaschenChart';
import ComparisonGrid from '../components/ComparisonGrid';
import InfoTooltip from '../components/InfoTooltip';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import {
  MATERIAL_GROUP_CTI,
  MATERIAL_GROUP_DESCRIPTION,
  POLLUTION_DEGREE_DESCRIPTIONS,
  FIELD_CONDITION_DESCRIPTIONS,
  getAltitudeCorrectionFactor,
  getClearance,
  getCreepage,
  materialGroupFromCti,
  type MaterialGroup,
  type FieldCondition,
  type PollutionDegree,
} from '../lib/creepageClearance';
import { pressureAtAltitude, breakdownVoltage, minGapForVoltage, paschenMinimum } from '../lib/paschen';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const FT_PER_M = 3.28084;
const MATERIAL_GROUPS: MaterialGroup[] = ['I', 'II', 'IIIa', 'IIIb'];
const GRID_PDS: (1 | 2 | 3)[] = [1, 2, 3];
const FIELD_CASES: FieldCondition[] = ['A', 'B'];

export default function CreepageClearanceCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [workingVoltage, setWorkingVoltage] = useState(300);
  const [hvToChassisOverride, setHvToChassisOverride] = useState<number | null>(null);
  const hvToChassis = hvToChassisOverride ?? workingVoltage * 0.5;
  const [useApplianceFunctionalAllowance, setUseApplianceFunctionalAllowance] = useState(false);

  const [pollutionDegree, setPollutionDegree] = useState<PollutionDegree>(2);
  const [materialGroup, setMaterialGroup] = useState<MaterialGroup>('IIIb');
  const [showCtiHelper, setShowCtiHelper] = useState(false);
  const [ctiValue, setCtiValue] = useState(175);

  const [altitudeUnit, setAltitudeUnit] = useState<'m' | 'ft'>('ft');
  const [altitude, setAltitude] = useState(5000);

  const [safetyFactorPercent, setSafetyFactorPercent] = useState(20);
  const [fieldCondition, setFieldCondition] = useState<FieldCondition>('A');

  const [actualClearanceMm, setActualClearanceMm] = useState<number | ''>('');
  const [actualCreepageMm, setActualCreepageMm] = useState<number | ''>('');

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

  const creepageResult = useMemo(() => (pollutionDegree === 4 ? null : getCreepage(workingVoltage, pollutionDegree, materialGroup, useApplianceFunctionalAllowance)), [workingVoltage, pollutionDegree, materialGroup, useApplianceFunctionalAllowance]);
  const creepageHvResult = useMemo(() => (pollutionDegree === 4 ? null : getCreepage(hvToChassis, pollutionDegree, materialGroup, useApplianceFunctionalAllowance)), [hvToChassis, pollutionDegree, materialGroup, useApplianceFunctionalAllowance]);
  const creepageWithMargin = creepageResult ? creepageResult.mm * (1 + safetyFactorPercent / 100) : null;
  const creepageHvWithMargin = creepageHvResult ? creepageHvResult.mm * (1 + safetyFactorPercent / 100) : null;

  const clearancePass = actualClearanceMm !== '' ? actualClearanceMm >= clearanceWithMargin : null;
  const creepagePass = actualCreepageMm !== '' && creepageWithMargin !== null ? actualCreepageMm >= creepageWithMargin : null;
  const overallPass = clearancePass !== null || creepagePass !== null
    ? (clearancePass !== false) && (creepagePass !== false)
    : null;

  // Paschen's Law cross-check, using the actual clearance if supplied, else the derived (with-margin) clearance.
  // The comparison voltage is now the working voltage directly (matching the simplified clearance methodology above).
  const paschenGapMm = actualClearanceMm !== '' ? actualClearanceMm : clearanceWithMargin;
  const pressureKPa = useMemo(() => pressureAtAltitude(altitudeM), [altitudeM]);
  const paschenPd = pressureKPa * (paschenGapMm / 10);
  const paschenV = breakdownVoltage(pressureKPa, paschenGapMm / 10);
  const paschenMinGapMm = minGapForVoltage(pressureKPa, workingVoltage) * 10;
  const paschenPass = paschenV >= workingVoltage;
  const paschenMinPd = paschenMinimum().pd;

  const creepageGridValue = (voltage: number) => (rowIdx: number, colIdx: number) =>
    getCreepage(voltage, GRID_PDS[colIdx], MATERIAL_GROUPS[rowIdx], useApplianceFunctionalAllowance).mm;
  const clearanceGridValue = (voltageKV: number) => (rowIdx: number, colIdx: number) =>
    getClearance(voltageKV, FIELD_CASES[rowIdx], GRID_PDS[colIdx]).mm;

  const creepageHighlightCol = GRID_PDS.indexOf(pollutionDegree as 1 | 2 | 3);
  const creepageHighlightRow = MATERIAL_GROUPS.indexOf(materialGroup);
  const clearanceHighlightCol = GRID_PDS.indexOf(pollutionDegree as 1 | 2 | 3);
  const clearanceHighlightRow = FIELD_CASES.indexOf(fieldCondition);

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
        title: `Required creepage distance (IEC 60335-1 Table ${useApplianceFunctionalAllowance ? '18' : '17'}, functional insulation) + safety factor`,
        formula: 'Creepage = f(working voltage, pollution degree, material group)^b (power-law interpolated between tabulated voltage bands) × (1 + FoS)',
        substitution: `PD${pollutionDegree}, ${MATERIAL_GROUP_CTI[materialGroup].label}${useApplianceFunctionalAllowance ? ' (household-appliance functional-insulation allowance applied)' : ''}`,
        result: `Working voltage (${workingVoltage} V): base ${fmt(creepageResult.mm, 3)} mm, with margin = ${fmt(creepageWithMargin ?? 0, 3)} mm. HV to chassis (${fmt(hvToChassis, 0)} V): base ${fmt(creepageHvResult.mm, 3)} mm, with margin = ${fmt(creepageHvWithMargin ?? 0, 3)} mm`,
      });
    }

    stepsOut.push({
      title: "Paschen's Law cross-check",
      formula: 'V_b = B·(p·d) / [ln(A·(p·d)) − ln(ln(1 + 1/γ))], A=113/(kPa·cm), B=2740 V/(kPa·cm), γ=0.01',
      substitution: `p = ${fmt(pressureKPa, 2)} kPa at ${fmt(altitude, 0)} ${altitudeUnit}, d = ${fmt(paschenGapMm, 2)} mm → p·d = ${fmt(paschenPd, 3)} kPa·cm`,
      result: `V_b = ${fmt(paschenV, 0)} V vs working voltage ${fmt(workingVoltage, 0)} V — ${paschenPass ? 'consistent with the design' : 'below the working voltage, check the design'}`,
    });

    return stepsOut;
  }, [altitude, altitudeUnit, altitudeM, altCorrection, workingVoltage, hvToChassis, workingVoltageForClearanceKV, hvToChassisForClearanceKV, fieldCondition, pollutionDegree, clearanceResult, clearanceHvResult, safetyFactorPercent, clearanceWithMargin, clearanceHvWithMargin, creepageResult, creepageHvResult, useApplianceFunctionalAllowance, materialGroup, creepageWithMargin, creepageHvWithMargin, pressureKPa, paschenGapMm, paschenPd, paschenV, paschenPass]);

  const inputSections: ReportSection[] = useMemo(() => {
    const elecRows: ReportRow[] = [
      { label: 'Working voltage', value: `${workingVoltage} V rms` },
      { label: 'Working voltage to chassis', value: `${fmt(hvToChassis, 0)} V rms${hvToChassisOverride === null ? ' (50% of working voltage, default)' : ''}` },
      { label: 'Insulation type', value: 'Functional (assumed)' },
      { label: 'Factor of safety', value: `${safetyFactorPercent}%` },
      { label: 'Electric field condition', value: fieldCondition === 'A' ? 'Inhomogeneous (Case A)' : 'Homogeneous (Case B)' },
    ];
    const envRows: ReportRow[] = [
      { label: 'Pollution degree', value: `PD${pollutionDegree}` },
      { label: 'Material group', value: MATERIAL_GROUP_CTI[materialGroup].label },
      { label: 'Altitude', value: `${altitude} ${altitudeUnit}` },
    ];
    if (actualClearanceMm !== '') envRows.push({ label: 'Actual clearance', value: `${actualClearanceMm} mm` });
    if (actualCreepageMm !== '') envRows.push({ label: 'Actual creepage', value: `${actualCreepageMm} mm` });

    return [
      { heading: 'Electrical parameters', rows: elecRows },
      { heading: 'Environment & design check', rows: envRows },
    ];
  }, [workingVoltage, hvToChassis, hvToChassisOverride, safetyFactorPercent, fieldCondition, pollutionDegree, materialGroup, altitude, altitudeUnit, actualClearanceMm, actualCreepageMm]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Required distances',
      rows: [
        { label: 'Required clearance, working voltage (with margin)', value: `${fmt(clearanceWithMargin, 2)} mm` },
        { label: 'Required clearance, HV to chassis (with margin)', value: `${fmt(clearanceHvWithMargin, 2)} mm` },
        { label: 'Required creepage, working voltage (with margin)', value: pollutionDegree === 4 ? 'N/A' : `${fmt(creepageWithMargin ?? 0, 2)} mm` },
        { label: 'Required creepage, HV to chassis (with margin)', value: pollutionDegree === 4 ? 'N/A' : `${fmt(creepageHvWithMargin ?? 0, 2)} mm` },
        { label: 'Altitude correction factor', value: fmt(altCorrection.factor, 2) },
      ],
    },
    {
      heading: "Paschen's Law cross-check",
      rows: [
        { label: 'Breakdown voltage at this gap', value: `${fmt(paschenV, 0)} V` },
        { label: 'Min. gap for working voltage', value: `${fmt(paschenMinGapMm, 3)} mm` },
      ],
    },
  ], [clearanceWithMargin, clearanceHvWithMargin, pollutionDegree, creepageWithMargin, creepageHvWithMargin, altCorrection, paschenV, paschenMinGapMm]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Creepage_Clearance_Calculator',
      pageTitle: 'Creepage & Clearance Distance Calculator',
      accentHex,
      passStatus: overallPass !== null ? { pass: overallPass, label: overallPass ? 'Design meets minimum requirements' : 'Design does not meet minimum requirements' } : null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Engineering estimation tool. Standards: IEC 60664-1 (clearance/altitude), IEC 60335-1 (creepage). Clearance is driven directly by the working voltage (no overvoltage-category / Table F.1 Un->Uimp step-up) — this is a deliberate tool-scope simplification and will understate the required clearance for circuits exposed to significant transient overvoltages (e.g. direct mains connection); reintroduce an impulse-withstand-voltage margin manually for such designs. Assumes functional insulation throughout. Verify exact values against the current official IEC 60664-1 text, and any applicable product standard, before certification use.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
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
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Electrical parameters</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Working voltage (V rms)</label>
                <input autoComplete="off" type="number" min={0} value={workingVoltage} onChange={e => setWorkingVoltage(Number(e.target.value))} />
                <span className="hint">Drives both creepage and clearance directly — the highest RMS voltage actually across the insulation.</span>
              </div>
              <div className="field">
                <label>Working voltage to chassis (V rms)</label>
                <input autoComplete="off" type="number" min={0} value={Math.round(hvToChassis)} onChange={e => setHvToChassisOverride(Number(e.target.value))} />
                <span className="hint">Defaults to 50% of working voltage — edit to override.{hvToChassisOverride !== null && (
                  <> {' '}<button className="btn small" style={{ marginLeft: '0.4rem' }} onClick={() => setHvToChassisOverride(null)}>Reset to 50%</button></>
                )}</span>
              </div>
              <div className="field">
                <label>Factor of safety (%)</label>
                <input autoComplete="off" type="number" min={0} step={5} value={safetyFactorPercent} onChange={e => setSafetyFactorPercent(Number(e.target.value))} />
                <span className="hint">Applied as a margin on top of the standard's calculated minimum distances (default 20%).</span>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Household-appliance allowance
                  <InfoTooltip>IEC 60335-1 Table 18 permits smaller creepage for functional insulation at lower voltages than the general Table 17. IEC 60664-1's own Annex F lists a single creepage table and this couldn't be confirmed to differ numerically by insulation type from open sources — so this relaxation is opt-in, not default. Only use it if your product standard permits it.</InfoTooltip>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 400 }}>
                  <input type="checkbox" checked={useApplianceFunctionalAllowance} onChange={e => setUseApplianceFunctionalAllowance(e.target.checked)} style={{ width: 'auto' }} />
                  Apply IEC 60335-1 Table 18 (household appliances)
                </label>
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
                <label>Altitude</label>
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
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Your design (optional — checks pass/fail)</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Actual clearance (mm)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={actualClearanceMm} onChange={e => setActualClearanceMm(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Actual creepage distance (mm)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={actualCreepageMm} onChange={e => setActualCreepageMm(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            <span className="hint">Checked against the working-voltage scenario (not HV to chassis).</span>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

            {overallPass !== null && (
              <div className={`status-banner ${overallPass ? 'pass' : 'fail'}`}>
                {overallPass ? '✓ Design meets minimum requirements' : '✗ Design does not meet minimum requirements'}
              </div>
            )}

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Required clearance, working V (with margin)</div>
                <div className={`value ${clearancePass === false ? 'neg' : clearancePass === true ? 'pos' : ''}`}>
                  {fmt(clearanceWithMargin, 2)}<span className="unit">mm</span>
                </div>
                <div className="hint">base {fmt(clearanceResult.mm, 2)} mm{clearanceResult.floorApplied ? ' · PD floor' : ''}</div>
              </div>
              <div className="result-tile">
                <div className="label">Required clearance, HV to chassis (with margin)</div>
                <div className="value">{fmt(clearanceHvWithMargin, 2)}<span className="unit">mm</span></div>
                <div className="hint">base {fmt(clearanceHvResult.mm, 2)} mm{clearanceHvResult.floorApplied ? ' · PD floor' : ''}</div>
              </div>
              <div className="result-tile">
                <div className="label">Required creepage, working V (with margin)</div>
                <div className={`value ${creepagePass === false ? 'neg' : creepagePass === true ? 'pos' : ''}`}>
                  {pollutionDegree === 4 ? 'N/A' : fmt(creepageWithMargin ?? 0, 2)}<span className="unit">{pollutionDegree === 4 ? '' : 'mm'}</span>
                </div>
                {pollutionDegree !== 4 && <div className="hint">base {fmt(creepageResult?.mm ?? 0, 2)} mm</div>}
              </div>
              <div className="result-tile">
                <div className="label">Required creepage, HV to chassis (with margin)</div>
                <div className="value">{pollutionDegree === 4 ? 'N/A' : fmt(creepageHvWithMargin ?? 0, 2)}<span className="unit">{pollutionDegree === 4 ? '' : 'mm'}</span></div>
                {pollutionDegree !== 4 && <div className="hint">base {fmt(creepageHvResult?.mm ?? 0, 2)} mm</div>}
              </div>
              <div className="result-tile">
                <div className="label">Altitude correction factor</div>
                <div className="value">{fmt(altCorrection.factor, 2)}</div>
                {altCorrection.extrapolated && <div className="hint" style={{ color: 'var(--warn)' }}>Beyond tabulated range — extrapolated</div>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Reference tables</div>
            <p className="note" style={{ marginBottom: '0.9rem' }}>
              Base values (before the {safetyFactorPercent}% safety margin) at your current working voltage and HV-to-chassis
              voltage, across every Material Group / Case × Pollution Degree combination — the highlighted cell matches
              your current selection.
            </p>
            <ComparisonGrid
              title={`Creepage @ Working Voltage (${fmt(workingVoltage, 0)} V)`}
              rowLabels={MATERIAL_GROUPS}
              colLabels={['PD1', 'PD2', 'PD3']}
              getValue={creepageGridValue(workingVoltage)}
              highlightRow={creepageHighlightRow}
              highlightCol={creepageHighlightCol}
            />
            <ComparisonGrid
              title={`Creepage @ HV to Chassis (${fmt(hvToChassis, 0)} V)`}
              rowLabels={MATERIAL_GROUPS}
              colLabels={['PD1', 'PD2', 'PD3']}
              getValue={creepageGridValue(hvToChassis)}
              highlightRow={creepageHighlightRow}
              highlightCol={creepageHighlightCol}
            />
            <ComparisonGrid
              title={`Clearance @ Working Voltage (${fmt(workingVoltageForClearanceKV, 3)} kV, altitude-adjusted)`}
              rowLabels={['Case A', 'Case B']}
              colLabels={['PD1', 'PD2', 'PD3']}
              getValue={clearanceGridValue(workingVoltageForClearanceKV)}
              highlightRow={clearanceHighlightRow}
              highlightCol={clearanceHighlightCol}
            />
            <ComparisonGrid
              title={`Clearance @ HV to Chassis (${fmt(hvToChassisForClearanceKV, 3)} kV, altitude-adjusted)`}
              rowLabels={['Case A', 'Case B']}
              colLabels={['PD1', 'PD2', 'PD3']}
              getValue={clearanceGridValue(hvToChassisForClearanceKV)}
              highlightRow={clearanceHighlightRow}
              highlightCol={clearanceHighlightCol}
            />
          </div>

          <div className="card">
            <div className="card-title">
              <span>Paschen's Law cross-check</span>
              <span className={`tag`} style={{ background: paschenPass ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: paschenPass ? 'var(--pos)' : 'var(--neg)', borderColor: 'transparent' }}>
                {paschenPass ? 'consistent' : 'check design'}
              </span>
            </div>
            <p className="note" style={{ marginBottom: '0.9rem' }}>
              First-principles physics, independent of the IEC table: air's dielectric breakdown voltage depends on
              the pressure × gap product (p·d). At {fmt(altitude, 0)} {altitudeUnit} the local pressure is{' '}
              {fmt(pressureKPa, 2)} kPa (vs {fmt(101.325, 2)} kPa at sea level) — for a {fmt(paschenGapMm, 2)} mm gap,
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
                <div className="value">{fmt(paschenMinGapMm, 3)}<span className="unit">mm</span></div>
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <PaschenChart currentPd={paschenPd} currentV={paschenV} requiredV={workingVoltage} />
            </div>
          </div>

          <div className="card">
            <div className="card-title">Reference &amp; assumptions</div>
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
              Creepage uses the IEC 60664-1 CTI/pollution-degree methodology (subclause 2.7.1.3) as tabulated in IEC
              60335-1 Table 17, assuming <strong>functional insulation throughout</strong> (this tool does not model
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
            </p>
          </div>
        </div>
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
