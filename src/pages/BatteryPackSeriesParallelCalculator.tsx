import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import { CELL_PRESETS, getCellPreset, solveBatteryPack } from '../lib/batteryPackPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export default function BatteryPackSeriesParallelCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [cellPresetId, setCellPresetId] = useState('18650_liion');
  const preset = getCellPreset(cellPresetId);
  const [nominalVoltage, setNominalVoltage] = useState(preset.nominalVoltage);
  const [capacityAh, setCapacityAh] = useState(preset.capacityAh);
  const [internalResistanceMOhm, setInternalResistanceMOhm] = useState(preset.internalResistanceMOhm);
  const [massG, setMassG] = useState(preset.massG);
  const [maxContinuousDischargeC, setMaxContinuousDischargeC] = useState(preset.maxContinuousDischargeC);

  const onPresetChange = (id: string) => {
    setCellPresetId(id);
    const p = getCellPreset(id);
    setNominalVoltage(p.nominalVoltage);
    setCapacityAh(p.capacityAh);
    setInternalResistanceMOhm(p.internalResistanceMOhm);
    setMassG(p.massG);
    setMaxContinuousDischargeC(p.maxContinuousDischargeC);
  };

  const [seriesCount, setSeriesCount] = useState(13);
  const [parallelCount, setParallelCount] = useState(4);
  const [loadCurrentA, setLoadCurrentA] = useState(50);

  const getInputs = useCallback((): Record<string, unknown> => ({
    cellPresetId, nominalVoltage, capacityAh, internalResistanceMOhm, massG,
    maxContinuousDischargeC, seriesCount, parallelCount, loadCurrentA,
  }), [cellPresetId, nominalVoltage, capacityAh, internalResistanceMOhm, massG,
    maxContinuousDischargeC, seriesCount, parallelCount, loadCurrentA]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.cellPresetId) { setCellPresetId(v.cellPresetId); const p = getCellPreset(v.cellPresetId); setNominalVoltage(p.nominalVoltage); setCapacityAh(p.capacityAh); setInternalResistanceMOhm(p.internalResistanceMOhm); setMassG(p.massG); setMaxContinuousDischargeC(p.maxContinuousDischargeC); }
    if (v.nominalVoltage != null) setNominalVoltage(v.nominalVoltage);
    if (v.capacityAh != null) setCapacityAh(v.capacityAh);
    if (v.internalResistanceMOhm != null) setInternalResistanceMOhm(v.internalResistanceMOhm);
    if (v.massG != null) setMassG(v.massG);
    if (v.maxContinuousDischargeC != null) setMaxContinuousDischargeC(v.maxContinuousDischargeC);
    if (v.seriesCount != null) setSeriesCount(v.seriesCount);
    if (v.parallelCount != null) setParallelCount(v.parallelCount);
    if (v.loadCurrentA != null) setLoadCurrentA(v.loadCurrentA);
  }, []);

  const saved = useSavedCalculations('battery-pack');

  const cell = useMemo(
    () => ({ ...preset, nominalVoltage, capacityAh, internalResistanceMOhm, massG, maxContinuousDischargeC }),
    [preset, nominalVoltage, capacityAh, internalResistanceMOhm, massG, maxContinuousDischargeC]
  );

  const result = useMemo(
    () => solveBatteryPack({ cell, seriesCount, parallelCount }, loadCurrentA),
    [cell, seriesCount, parallelCount, loadCurrentA]
  );

  const overCLimit = loadCurrentA > result.packMaxContinuousDischargeA;

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Pack voltage and capacity (series adds voltage, parallel adds capacity)',
      formula: 'V_pack = S · V_cell,  Ah_pack = P · Ah_cell',
      substitution: `S = ${seriesCount}, P = ${parallelCount}, V_cell = ${fmt(nominalVoltage, 2)} V, Ah_cell = ${fmt(capacityAh, 2)} Ah`,
      result: `V_pack = ${fmt(result.packVoltageNominal, 2)} V, Ah_pack = ${fmt(result.packCapacityAh, 2)} Ah`,
    },
    {
      title: 'Pack energy',
      formula: 'Wh_pack = V_pack × Ah_pack',
      result: `${fmt(result.packEnergyWh, 1)} Wh (${fmt(result.packEnergyWh / 1000, 3)} kWh)`,
    },
    {
      title: 'Pack internal resistance (P parallel cells share current, S groups in series)',
      formula: 'R_pack = S × (R_cell / P)',
      substitution: `R_cell = ${fmt(internalResistanceMOhm, 2)} mΩ`,
      result: `R_pack = ${fmt(result.packInternalResistanceMOhm, 2)} mΩ`,
    },
    {
      title: 'Total cell count and pack mass',
      formula: 'N = S × P,  mass = N × mass_cell',
      result: `N = ${result.totalCells} cells, mass ≈ ${fmt(result.packMassKg, 2)} kg`,
    },
    {
      title: 'Max continuous discharge current (from cell C-rate)',
      formula: 'I_max = P × Ah_cell × C_rate',
      substitution: `C-rate = ${fmt(maxContinuousDischargeC, 2)}C`,
      result: `I_max = ${fmt(result.packMaxContinuousDischargeA, 1)} A`,
    },
    ...(result.voltageSagAtLoadV !== null
      ? [{
        title: 'Voltage sag under load',
        formula: 'V_sag = I_load × R_pack,  V_loaded = V_pack − V_sag',
        substitution: `I_load = ${fmt(loadCurrentA, 1)} A`,
        result: `V_sag = ${fmt(result.voltageSagAtLoadV, 2)} V, V_loaded = ${fmt(result.loadedVoltageV ?? 0, 2)} V${overCLimit ? ' — exceeds max continuous discharge current' : ''}`,
      }]
      : []),
  ], [seriesCount, parallelCount, nominalVoltage, capacityAh, internalResistanceMOhm, maxContinuousDischargeC, loadCurrentA, result, overCLimit]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Cell',
      rows: [
        { label: 'Preset', value: preset.label },
        { label: 'Nominal voltage', value: `${nominalVoltage} V` },
        { label: 'Capacity', value: `${capacityAh} Ah` },
        { label: 'Internal resistance', value: `${internalResistanceMOhm} mΩ` },
        { label: 'Mass', value: `${massG} g` },
        { label: 'Max continuous discharge', value: `${maxContinuousDischargeC}C` },
      ],
    },
    {
      heading: 'Pack configuration',
      rows: [
        { label: 'Series (S)', value: `${seriesCount}` },
        { label: 'Parallel (P)', value: `${parallelCount}` },
        { label: 'Load current', value: `${loadCurrentA} A` },
      ],
    },
  ], [preset, nominalVoltage, capacityAh, internalResistanceMOhm, massG, maxContinuousDischargeC, seriesCount, parallelCount, loadCurrentA]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Pack results',
      rows: [
        { label: 'Pack voltage (nominal)', value: `${fmt(result.packVoltageNominal, 2)} V` },
        { label: 'Pack capacity', value: `${fmt(result.packCapacityAh, 2)} Ah` },
        { label: 'Pack energy', value: `${fmt(result.packEnergyWh, 1)} Wh` },
        { label: 'Pack internal resistance', value: `${fmt(result.packInternalResistanceMOhm, 2)} mΩ` },
        { label: 'Total cells', value: `${result.totalCells}` },
        { label: 'Pack mass (cells only)', value: `${fmt(result.packMassKg, 2)} kg` },
      ],
    },
    {
      heading: 'Discharge check',
      rows: [
        { label: 'Max continuous discharge current', value: `${fmt(result.packMaxContinuousDischargeA, 1)} A` },
        { label: 'Voltage under load', value: result.loadedVoltageV !== null ? `${fmt(result.loadedVoltageV, 2)} V` : 'N/A' },
      ],
    },
  ], [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Battery_Pack_Series_Parallel_Calculator',
      pageTitle: 'Battery Pack Series/Parallel Calculator',
      accentHex,
      passStatus: { pass: !overCLimit, label: overCLimit ? 'Load current exceeds max continuous discharge rating' : 'Load current within max continuous discharge rating' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Engineering estimation tool. Standard series/parallel circuit combination rules applied to a single cell spec (voltage adds in series, capacity adds in parallel, resistance scales as S/P). Cell presets are representative typical values for common formats, not a specific manufacturer part — verify against the actual cell datasheet before use. Does not model cell-to-cell imbalance, temperature effects, or aging.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Battery Pack Series/Parallel Calculator</div>
          <h1>Battery Pack Series/Parallel Calculator</h1>
          <p>
            Resulting pack voltage, capacity, energy, and internal resistance from a chosen series/parallel
            (SxP) cell arrangement, plus a voltage-sag check under a given load current.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="PDF export">
            <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Cell</span></div>
            <div className="field" style={{ marginBottom: '0.85rem' }}>
              <label>Cell preset</label>
              <select value={cellPresetId} onChange={(e) => onPresetChange(e.target.value)}>
                {CELL_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <span className="hint">{cell.chemistry} — representative typical values; check the actual cell datasheet for a specific part number.</span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Nominal voltage (V)</label>
                <input autoComplete="off" type="number" min={0.1} step={0.01} value={nominalVoltage} onChange={(e) => setNominalVoltage(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Capacity (Ah)</label>
                <input autoComplete="off" type="number" min={0.01} step={0.01} value={capacityAh} onChange={(e) => setCapacityAh(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Internal resistance (mΩ)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={internalResistanceMOhm} onChange={(e) => setInternalResistanceMOhm(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Cell mass (g)</label>
                <input autoComplete="off" type="number" min={0} value={massG} onChange={(e) => setMassG(Number(e.target.value))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Max continuous discharge (C-rate)</label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={maxContinuousDischargeC} onChange={(e) => setMaxContinuousDischargeC(Number(e.target.value))} />
                <span className="hint">Max continuous current for one cell = C-rate × capacity (Ah).</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Pack configuration</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Series count (S)</label>
                <input autoComplete="off" type="number" min={1} value={seriesCount} onChange={(e) => setSeriesCount(Math.max(1, Number(e.target.value)))} />
                <span className="hint">Number of cells/groups in series — sets pack voltage.</span>
              </div>
              <div className="field">
                <label>Parallel count (P)</label>
                <input autoComplete="off" type="number" min={1} value={parallelCount} onChange={(e) => setParallelCount(Math.max(1, Number(e.target.value)))} />
                <span className="hint">Number of cells in parallel per series group — sets pack capacity.</span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Load current (A)</label>
                <input autoComplete="off" type="number" min={0} value={loadCurrentA} onChange={(e) => setLoadCurrentA(Number(e.target.value))} />
                <span className="hint">Used to check voltage sag and discharge current against the pack's continuous rating.</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className={`status-banner ${overCLimit ? 'fail' : 'pass'}`}>
              {overCLimit ? '✗ Load current exceeds max continuous discharge rating' : '✓ Load current within max continuous discharge rating'}
            </div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Pack voltage (nominal)</div>
                <div className="value">{fmt(result.packVoltageNominal, 1)}<span className="unit">V</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Pack capacity</div>
                <div className="value">{fmt(result.packCapacityAh, 1)}<span className="unit">Ah</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Pack energy</div>
                <div className="value">{fmt(result.packEnergyWh, 0)}<span className="unit">Wh</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Pack internal resistance</div>
                <div className="value">{fmt(result.packInternalResistanceMOhm, 2)}<span className="unit">mΩ</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Total cells</div>
                <div className="value">{result.totalCells}</div>
              </div>
              <div className="result-tile">
                <div className="label">Pack mass (cells only)</div>
                <div className="value">{fmt(result.packMassKg, 2)}<span className="unit">kg</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Max continuous discharge</div>
                <div className={`value ${overCLimit ? 'neg' : 'pos'}`}>{fmt(result.packMaxContinuousDischargeA, 1)}<span className="unit">A</span></div>
              </div>
              {result.loadedVoltageV !== null && (
                <div className="result-tile">
                  <div className="label">Voltage under load</div>
                  <div className="value">{fmt(result.loadedVoltageV, 2)}<span className="unit">V</span></div>
                  <div className="hint">sag {fmt(result.voltageSagAtLoadV ?? 0, 2)} V</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Standard series/parallel circuit combination applied to a single cell's spec: cells in series add
          voltage (and their internal resistances add), cells in parallel add capacity (and their internal
          resistances combine as R/P). Cell presets are representative typical values for common formats
          (18650/21700 Li-ion, pouch, LiFePO4 prismatic) — real cells vary by manufacturer and specific part
          number, so check the actual datasheet before finalizing a design. This tool does not model
          cell-to-cell manufacturing variation/imbalance, temperature effects on resistance/capacity, or
          aging/cycle life — all of which matter for a real pack design and BMS sizing.
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
