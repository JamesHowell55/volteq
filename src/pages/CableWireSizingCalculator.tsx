import { useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import InfoTooltip from '../components/InfoTooltip';
import { MATERIALS, type Material } from '../lib/materials';
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

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
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

  const [mode, setMode] = useState<SolveMode>('ampacity');
  const [materialId, setMaterialId] = useState<'copper' | 'aluminium'>('copper');
  const material: Material = MATERIALS[materialId];

  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('mm2');
  const [crossSectionMm2, setCrossSectionMm2] = useState(16);
  const [awgSize, setAwgSize] = useState(4);

  const [insulationId, setInsulationId] = useState('xlpe');
  const insulation = getInsulationPreset(insulationId);
  const [customMaxTempC, setCustomMaxTempC] = useState(125);
  const [customThermalConductivity, setCustomThermalConductivity] = useState(0.25);
  const [insulationThicknessMm, setInsulationThicknessMm] = useState(1.0);

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

  const effectiveInsulation = useMemo(
    () => (insulationId === 'custom' ? { ...insulation, maxTempC: customMaxTempC, thermalConductivity: customThermalConductivity } : insulation),
    [insulationId, insulation, customMaxTempC, customThermalConductivity]
  );

  const effectiveCrossSectionMm2 = sizeUnit === 'mm2' ? crossSectionMm2 : awgToMm2(awgSize);

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

  const bundlingFactor = bundlingDeratingFactor(conductorCountInBundle);

  const calculationSteps: CalcStepData[] = useMemo(() => {
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
  }, [result, effectiveCrossSectionMm2, insulationThicknessMm, material, mode, currentType, frequencyHz, effectiveInsulation, ambientTempC, conductorCountInBundle, bundlingFactor, targetCurrentA, twoConductorCircuit, lengthM, systemVoltage]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Conductor & insulation',
      rows: [
        { label: 'Material', value: material.name },
        { label: 'Cross-section', value: sizeUnit === 'mm2' ? `${effectiveCrossSectionMm2} mm²` : `AWG ${awgSize} (${fmt(effectiveCrossSectionMm2, 2)} mm²)` },
        { label: 'Insulation', value: effectiveInsulation.label },
        { label: 'Insulation thickness', value: `${insulationThicknessMm} mm` },
      ],
    },
    {
      heading: 'Operating conditions',
      rows: [
        { label: 'Current type', value: currentType === 'ac' ? `AC (${frequencyHz} Hz)` : 'DC' },
        { label: 'Ambient temperature', value: `${fmt(ambientTempC, 0)}°C` },
        { label: 'Conductors in bundle', value: `${conductorCountInBundle}` },
        { label: 'Cable length (one-way)', value: `${lengthM} m` },
      ],
    },
  ], [material, sizeUnit, effectiveCrossSectionMm2, awgSize, effectiveInsulation, insulationThicknessMm, currentType, frequencyHz, ambientTempC, conductorCountInBundle, lengthM]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: mode === 'ampacity' ? 'Ampacity result' : 'Check-current result',
      rows: mode === 'ampacity'
        ? [
          { label: 'Ampacity', value: `${fmt(result.ampacityA, 1)} A` },
          { label: 'Bundling factor', value: fmt(bundlingFactor, 2) },
        ]
        : [
          { label: 'Conductor temperature', value: `${fmt(result.conductorTempC ?? 0, 1)}°C` },
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
  ], [mode, result, bundlingFactor]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Cable_Wire_Sizing_Calculator',
      pageTitle: 'Cable/Wire Sizing Calculator (EV Powertrain)',
      accentHex,
      passStatus: mode === 'checkCurrent' && result.conductorTempPass !== null
        ? { pass: result.conductorTempPass, label: result.conductorTempPass ? 'Conductor temperature within insulation limit' : 'Conductor temperature exceeds insulation limit' }
        : null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Engineering estimation tool for EV powertrain cable sizing (battery interconnects, battery-to-inverter, inverter-to-motor), not household/building wiring. Ampacity and conductor temperature are computed from first-principles steady-state heat balance (Churchill-Chu horizontal-cylinder convection, IEC 60287-1-1 skin effect), with the insulation temperature class anchored to ISO 6722. Numeric ISO 6722 ampacity tables are not publicly accessible; this tool computes from physics rather than transcribing an unverifiable table. Bundling derating reuses the standard NEC 310.15(B)(3)(a) reference factors as a disclosed approximation, not a first-principles bundle-thermal model. Screening tool only — not a substitute for OEM harness qualification testing.',
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Cable/Wire Sizing Calculator</div>
          <h1>Cable/Wire Sizing Calculator (EV Powertrain)</h1>
          <p>
            First-principles ampacity and voltage drop for EV powertrain cables — battery interconnects,
            battery-to-inverter, inverter-to-motor — using ISO 6722 insulation temperature classes and a
            steady-state heat balance (not a household/building wiring ampacity table).
          </p>
        </div>
        <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
      </div>

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
            <div className="grid grid-2">
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
                <>
                  <div className="field">
                    <label>Max conductor temperature (°C)</label>
                    <input autoComplete="off" type="number" value={customMaxTempC} onChange={(e) => setCustomMaxTempC(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label>Insulation thermal conductivity (W/m·K)</label>
                    <input autoComplete="off" type="number" step={0.01} value={customThermalConductivity} onChange={(e) => setCustomThermalConductivity(Number(e.target.value))} />
                  </div>
                </>
              )}
              <div className="field">
                <label>Insulation wall thickness (mm)</label>
                <input autoComplete="off" type="number" min={0.1} step={0.1} value={insulationThicknessMm} onChange={(e) => setInsulationThicknessMm(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Operating conditions</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Current type</label>
                <div className="segmented">
                  <button className={currentType === 'dc' ? 'active' : ''} onClick={() => setCurrentType('dc')}>DC</button>
                  <button className={currentType === 'ac' ? 'active' : ''} onClick={() => setCurrentType('ac')}>AC</button>
                </div>
                <span className="hint">DC for battery interconnects; AC for motor phase cables (uses skin effect at the drive's fundamental frequency).</span>
              </div>
              {currentType === 'ac' && (
                <div className="field">
                  <label>Frequency (Hz)</label>
                  <input autoComplete="off" type="number" min={0} value={frequencyHz} onChange={(e) => setFrequencyHz(Number(e.target.value))} />
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
                  <input autoComplete="off" type="number" style={{ marginTop: '0.5rem' }} value={customAmbientTempC} onChange={(e) => setCustomAmbientTempC(Number(e.target.value))} />
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
                <label>Cable length, one-way (m)</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={lengthM} onChange={(e) => setLengthM(Number(e.target.value))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={twoConductorCircuit} onChange={(e) => setTwoConductorCircuit(e.target.checked)} style={{ width: 'auto' }} />
                  Two-conductor circuit (voltage drop counts both supply and return conductors)
                </label>
                <span className="hint">Typical for EV HV circuits (battery/inverter/motor). Uncheck only for legacy chassis-return (e.g. 12V) wiring.</span>
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>

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
                      {fmt(result.conductorTempC ?? 0, 1)}<span className="unit">°C</span>
                    </div>
                    <div className="hint">limit {fmt(effectiveInsulation.maxTempC, 0)}°C</div>
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
                <div className="value">{fmt(result.conductorDiameterMm, 2)}<span className="unit">mm</span></div>
                <div className="hint">outer {fmt(result.outerDiameterMm, 2)} mm</div>
              </div>
              <div className="result-tile">
                <div className="label">Total thermal resistance</div>
                <div className="value">{fmt(result.totalThermalResistancePerMetre, 3)}<span className="unit">K·m/W</span></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Reference &amp; assumptions</div>
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
