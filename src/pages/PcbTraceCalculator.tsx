import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import { MATERIALS } from '../lib/materials';
import {
  COPPER_WEIGHT_PRESETS,
  getCopperWeightPreset,
  ozToMm,
  solveTrace,
  MM_PER_MIL,
  type LayerType,
  type SolveMode,
  type PcbTraceInput,
} from '../lib/pcbTracePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

function mmToMils(mm: number): number {
  return mm / MM_PER_MIL;
}

export default function PcbTraceCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [mode, setMode] = useState<SolveMode>('current');
  const [layer, setLayer] = useState<LayerType>('external');

  const [copperWeightId, setCopperWeightId] = useState('one');
  const copperWeight = getCopperWeightPreset(copperWeightId);
  const [customOz, setCustomOz] = useState(1);
  const thicknessMm = ozToMm(copperWeightId === 'custom' ? customOz : copperWeight.oz);

  const [ambientTempC, setAmbientTempC] = useState(25);
  const [maxBoardTempC, setMaxBoardTempC] = useState(MATERIALS.copper.defaultMaxContinuousTemp);
  const [lengthMm, setLengthMm] = useState(50);

  const [widthMm, setWidthMm] = useState(1);
  const [currentA, setCurrentA] = useState(2);
  const [deltaTC, setDeltaTC] = useState(20);

  const getInputs = useCallback((): Record<string, unknown> => ({
    mode, layer, copperWeightId, customOz, ambientTempC, maxBoardTempC, lengthMm, widthMm, currentA, deltaTC,
  }), [mode, layer, copperWeightId, customOz, ambientTempC, maxBoardTempC, lengthMm, widthMm, currentA, deltaTC]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.mode) setMode(v.mode);
    if (v.layer) setLayer(v.layer);
    if (v.copperWeightId) setCopperWeightId(v.copperWeightId);
    if (v.customOz != null) setCustomOz(v.customOz);
    if (v.ambientTempC != null) setAmbientTempC(v.ambientTempC);
    if (v.maxBoardTempC != null) setMaxBoardTempC(v.maxBoardTempC);
    if (v.lengthMm != null) setLengthMm(v.lengthMm);
    if (v.widthMm != null) setWidthMm(v.widthMm);
    if (v.currentA != null) setCurrentA(v.currentA);
    if (v.deltaTC != null) setDeltaTC(v.deltaTC);
  }, []);

  const saved = useSavedCalculations('pcb-trace-width');

  const input: PcbTraceInput = useMemo(
    () => ({ mode, layer, thicknessMm, ambientTempC, maxBoardTempC, lengthMm, widthMm, currentA, deltaTC }),
    [mode, layer, thicknessMm, ambientTempC, maxBoardTempC, lengthMm, widthMm, currentA, deltaTC]
  );

  const result = useMemo(() => solveTrace(input), [input]);

  const kValue = layer === 'external' ? 0.048 : 0.024;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      {
        title: 'Cross-sectional area',
        formula: 'A [mil²] = w [mil] × t [mil];  t from copper weight (1 oz/ft² ≈ 1.37 mil / 0.0348 mm)',
        substitution: `w = ${fmt(mmToMils(result.widthMm), 2)} mil, t = ${fmt(mmToMils(thicknessMm), 3)} mil (${fmt(copperWeightId === 'custom' ? customOz : copperWeight.oz, 2)} oz/ft²)`,
        result: `A = ${fmt(result.areaMils2, 1)} mil² (${fmt(result.crossSectionMm2, 4)} mm²)`,
      },
    ];

    if (mode === 'current') {
      steps.push({
        title: 'Current capacity (IPC-2221 empirical curve fit)',
        formula: 'I = k · ΔT^0.44 · A^0.725',
        substitution: `k = ${kValue} (${layer}), ΔT = ${fmt(deltaTC, 1)}°C, A = ${fmt(result.areaMils2, 1)} mil²`,
        result: `I = ${fmt(result.currentA, 2)} A`,
      });
    } else if (mode === 'width') {
      steps.push({
        title: 'Required trace width (IPC-2221, solved for area)',
        formula: 'A = (I / (k · ΔT^0.44))^(1/0.725),  w = A / t',
        substitution: `I = ${fmt(currentA, 2)} A, k = ${kValue} (${layer}), ΔT = ${fmt(deltaTC, 1)}°C`,
        result: `A = ${fmt(result.areaMils2, 1)} mil² → w = ${fmt(mmToMils(result.widthMm), 2)} mil (${fmt(result.widthMm, 3)} mm)`,
      });
    } else {
      steps.push({
        title: 'Temperature rise (IPC-2221, solved for ΔT)',
        formula: 'ΔT = (I / (k · A^0.725))^(1/0.44)',
        substitution: `I = ${fmt(currentA, 2)} A, k = ${kValue} (${layer}), A = ${fmt(result.areaMils2, 1)} mil²`,
        result: `ΔT = ${fmt(result.deltaTC, 1)}°C`,
      });
    }

    steps.push({
      title: 'Trace resistance (temperature-dependent copper resistivity, reused from the Busbar calculator)',
      formula: 'R = ρ(T_final) · L / A_cross',
      substitution: `T_final = ${fmt(result.finalTempC, 1)}°C, L = ${fmt(lengthMm, 1)} mm, A_cross = ${fmt(result.crossSectionMm2, 4)} mm²`,
      result: `R = ${fmt(result.totalResistance * 1000, 2)} mΩ`,
    });

    steps.push({
      title: 'Voltage drop & power dissipation',
      formula: 'V = I · R,  P = I² · R',
      substitution: `I = ${fmt(result.currentA, 2)} A, R = ${fmt(result.totalResistance * 1000, 2)} mΩ`,
      result: `V = ${fmt(result.voltageDropV * 1000, 1)} mV, P = ${fmt(result.powerDissipationW, 3)} W`,
    });

    steps.push({
      title: 'Final trace temperature vs board/component limit',
      formula: 'T_final = T_ambient + ΔT',
      substitution: `${fmt(ambientTempC, 1)}°C + ${fmt(result.deltaTC, 1)}°C, limit = ${fmt(maxBoardTempC, 0)}°C`,
      result: `T_final = ${fmt(result.finalTempC, 1)}°C — ${result.withinMaxTempC ? 'pass' : 'fail'}`,
    });

    return steps;
  }, [result, mode, layer, kValue, deltaTC, currentA, thicknessMm, copperWeightId, customOz, copperWeight, lengthMm, ambientTempC, maxBoardTempC]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Trace & layer',
      rows: [
        { label: 'Layer', value: layer === 'external' ? 'External (outer)' : 'Internal (inner)' },
        { label: 'Copper weight', value: `${fmt(copperWeightId === 'custom' ? customOz : copperWeight.oz, 2)} oz/ft² (${fmt(thicknessMm, 4)} mm)` },
        { label: 'Trace length', value: `${fmtU(lengthMm, unitSystem, UNIT_LENGTH, 2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
        { label: 'Max board/component temperature', value: `${fmtU(maxBoardTempC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}` },
      ],
    },
    {
      heading: 'Solve inputs',
      rows: [
        { label: 'Ambient temperature', value: `${fmtU(ambientTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
        ...(mode !== 'width' ? [{ label: 'Trace width', value: `${fmtU(widthMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` }] : []),
        ...(mode !== 'current' ? [{ label: 'Current', value: `${fmt(currentA, 2)} A` }] : []),
        ...(mode !== 'tempRise' ? [{ label: 'Max temperature rise (ΔT)', value: `${fmt(deltaTC, 1)}°C` }] : []),
      ],
    },
  ], [layer, copperWeightId, customOz, copperWeight, thicknessMm, lengthMm, maxBoardTempC, ambientTempC, mode, widthMm, currentA, deltaTC, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: mode === 'current' ? 'Current capacity result' : mode === 'width' ? 'Trace width result' : 'Temperature rise result',
      rows: mode === 'current'
        ? [{ label: 'Current capacity', value: `${fmt(result.currentA, 2)} A` }]
        : mode === 'width'
          ? [{ label: 'Required trace width', value: `${fmtU(result.widthMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)} (${fmt(mmToMils(result.widthMm), 1)} mil)` }]
          : [{ label: 'Temperature rise (ΔT)', value: `${fmt(result.deltaTC, 1)}°C` }],
    },
    {
      heading: 'Resistance & power',
      rows: [
        { label: 'Trace resistance', value: `${fmt(result.totalResistance * 1000, 2)} mΩ` },
        { label: 'Voltage drop', value: `${fmt(result.voltageDropV * 1000, 1)} mV` },
        { label: 'Power dissipation', value: `${fmt(result.powerDissipationW, 3)} W` },
        { label: 'Final trace temperature', value: `${fmtU(result.finalTempC, unitSystem, UNIT_TEMP, 1)}${unitLabel(unitSystem, UNIT_TEMP)}` },
        { label: 'Within board/component limit', value: result.withinMaxTempC ? 'Pass' : 'Fail' },
      ],
    },
  ], [mode, result, unitSystem]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'PCB_Trace_Width_Calculator',
      pageTitle: 'PCB Trace Width Calculator (IPC-2221)',
      accentHex,
      passStatus: { pass: result.withinMaxTempC, label: result.withinMaxTempC ? 'Final trace temperature within board/component limit' : 'Final trace temperature exceeds board/component limit' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Current capacity, required width, and temperature rise are computed from the IPC-2221 (formerly IPC-D-275) empirical curve fit I = k·ΔT^0.44·A^0.725 — the same equation implemented by most published PCB trace-width calculators. This is a curve fit to IPC thermal test data, not a first-principles derivation; IPC-2152 refines the underlying data (board thickness, adjacent plane layers, trace length) but publishes only charts, not a formula, so an exact IPC-2152 reproduction is not possible in closed form. Trace resistance, voltage drop, and power dissipation are computed from first-principles temperature-dependent copper resistivity. Screening tool only — verify against your fab\'s process capability and, for high-reliability designs, IPC-2152 chart data or thermal simulation.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● PCB Trace Width Calculator</div>
          <h1>PCB Trace Width Calculator (IPC-2221)</h1>
          <p>
            Current-carrying capacity, required trace width, or resulting temperature rise for a PCB copper
            trace, from the IPC-2221 empirical model — plus first-principles trace resistance, voltage drop,
            and power dissipation.
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
            <div className="card-title"><span><span className="step-num">1</span>Solve for</span></div>
            <div className="segmented">
              <button className={mode === 'current' ? 'active' : ''} onClick={() => setMode('current')}>Current</button>
              <button className={mode === 'width' ? 'active' : ''} onClick={() => setMode('width')}>Trace width</button>
              <button className={mode === 'tempRise' ? 'active' : ''} onClick={() => setMode('tempRise')}>Temp rise</button>
            </div>
            <span className="hint">
              Current: maximum current a given trace width can carry. Trace width: minimum width needed for a
              given current. Temp rise: resulting ΔT for a given width and current.
            </span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Trace &amp; layer</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>
                  Layer
                  <InfoTooltip>
                    External (outer-layer) traces convect and radiate heat directly into air. Internal traces
                    can only shed heat by conducting through the board to both surfaces, roughly half as
                    effective — IPC-2221 accounts for this with half the current-capacity constant.
                  </InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={layer === 'external' ? 'active' : ''} onClick={() => setLayer('external')}>External</button>
                  <button className={layer === 'internal' ? 'active' : ''} onClick={() => setLayer('internal')}>Internal</button>
                </div>
              </div>
              <div className="field">
                <label>Trace length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(lengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Copper weight</label>
                <div className="segmented">
                  {COPPER_WEIGHT_PRESETS.map((p) => (
                    <button key={p.id} className={copperWeightId === p.id ? 'active' : ''} onClick={() => setCopperWeightId(p.id)}>{p.id === 'custom' ? 'Custom' : `${p.oz} oz`}</button>
                  ))}
                </div>
                <span className="hint">{fmt(thicknessMm, 4)} mm ({fmt(mmToMils(thicknessMm), 2)} mil) thick</span>
              </div>
              {copperWeightId === 'custom' && (
                <div className="field">
                  <label>Custom copper weight (oz/ft²)</label>
                  <input autoComplete="off" type="number" min={0.1} step={0.1} value={customOz} onChange={(e) => setCustomOz(Number(e.target.value))} />
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Operating conditions</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Ambient temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(ambientTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAmbientTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>
                  Max board/component temperature ({unitLabel(unitSystem, UNIT_TEMP)})
                  <InfoTooltip>
                    The limiting temperature nearby — typically set by the FR4 laminate's rating or the
                    hottest adjacent component, not a fixed standard value. Used only for the pass/fail check
                    below; it doesn't feed into the IPC-2221 current-capacity equation itself.
                  </InfoTooltip>
                </label>
                <input autoComplete="off" type="number" value={toDisplay(maxBoardTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setMaxBoardTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              {mode !== 'width' && (
                <div className="field">
                  <label>Trace width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} step={0.01} value={toDisplay(widthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  <span className="hint">{fmt(mmToMils(widthMm), 1)} mil</span>
                </div>
              )}
              {mode !== 'current' && (
                <div className="field">
                  <label>Current (A)</label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={currentA} onChange={(e) => setCurrentA(Number(e.target.value))} />
                </div>
              )}
              {mode !== 'tempRise' && (
                <div className="field">
                  <label>
                    Max temperature rise, ΔT (°C)
                    <InfoTooltip>
                      IPC-2221's underlying test data spans roughly ΔT = 10–100°C — the equation extrapolates
                      outside that range but with reduced confidence.
                    </InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} step={1} value={deltaTC} onChange={(e) => setDeltaTC(Number(e.target.value))} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

            <div className={`status-banner ${result.withinMaxTempC ? 'pass' : 'fail'}`}>
              {result.withinMaxTempC ? '✓ Final trace temperature within board/component limit' : '✗ Final trace temperature exceeds board/component limit'}
            </div>

            <div className="result-grid">
              {mode === 'current' && (
                <div className="result-tile">
                  <div className="label">Current capacity</div>
                  <div className="value">{fmt(result.currentA, 2)}<span className="unit">A</span></div>
                </div>
              )}
              {mode === 'width' && (
                <div className="result-tile">
                  <div className="label">Required trace width</div>
                  <div className="value">{fmtU(result.widthMm, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                  <div className="hint">{fmt(mmToMils(result.widthMm), 1)} mil</div>
                </div>
              )}
              {mode === 'tempRise' && (
                <div className="result-tile">
                  <div className="label">Temperature rise</div>
                  <div className="value">{fmt(result.deltaTC, 1)}<span className="unit">°C</span></div>
                </div>
              )}
              <div className="result-tile">
                <div className="label">Final trace temperature</div>
                <div className={`value ${!result.withinMaxTempC ? 'neg' : 'pos'}`}>
                  {fmtU(result.finalTempC, unitSystem, UNIT_TEMP, 1)}<span className="unit">{unitLabel(unitSystem, UNIT_TEMP)}</span>
                </div>
                <div className="hint">limit {fmtU(maxBoardTempC, unitSystem, UNIT_TEMP, 0)}{unitLabel(unitSystem, UNIT_TEMP)}</div>
              </div>
              <div className="result-tile">
                <div className="label">Cross-sectional area</div>
                <div className="value">{fmt(result.areaMils2, 1)}<span className="unit">mil²</span></div>
                <div className="hint">{fmt(result.crossSectionMm2, 4)} mm²</div>
              </div>
              <div className="result-tile">
                <div className="label">Trace resistance</div>
                <div className="value">{fmt(result.totalResistance * 1000, 2)}<span className="unit">mΩ</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Voltage drop / power</div>
                <div className="value">{fmt(result.voltageDropV * 1000, 1)}<span className="unit">mV</span></div>
                <div className="hint">{fmt(result.powerDissipationW, 3)} W dissipated</div>
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
        <p className="note">
          Current capacity, required trace width, and temperature rise come from the IPC-2221 (formerly
          IPC-D-275) empirical curve fit I = k·ΔT^0.44·A^0.725 (k = 0.048 external / 0.024 internal) — the same
          equation nearly every published PCB trace-width calculator implements. It's a curve fit to IPC's
          original thermal test data, not a first-principles derivation: modelling how a trace actually sheds
          heat (in-plane spreading through copper pours and plane layers, through-thickness conduction into
          FR4, heat paths out through connectors and vias) is a full 3-D FEA problem with no closed form —
          which is exactly why IPC's newer IPC-2152 standard, which refines the underlying test data for board
          thickness, adjacent plane layers, and trace length, publishes only charts rather than a formula. This
          tool computes from the disclosed IPC-2221 equation rather than transcribing unverifiable IPC-2152
          chart readings. Trace resistance, voltage drop, and power dissipation are genuinely first-principles,
          using the same temperature-dependent copper resistivity model as the Busbar and Cable/Wire Sizing
          calculators. Treat this as a screening/estimation tool — for high-reliability designs, cross-check
          against your fab's process capability and, where available, IPC-2152 chart data or thermal
          simulation.
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
