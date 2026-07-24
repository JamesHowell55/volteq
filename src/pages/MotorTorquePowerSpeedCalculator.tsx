import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import { getCategory, convert } from '../lib/unitConversions';
import { solveTorquePowerSpeed, torqueFromCurrent, electricalInputPower, type SolveFor } from '../lib/motorTorquePowerSpeedPhysics';

function fmt(n: number, digits = 3): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

// Unit labels are e.g. "Newton-metre (N·m)" — pull out the short symbol in
// parens for compact result-tile display, falling back to the full label.
function shortUnit(label: string | undefined): string {
  if (!label) return '';
  const match = label.match(/\(([^)]+)\)/);
  return match ? match[1] : label;
}

const TORQUE_UNITS = getCategory('torque')!.units;
const POWER_UNITS = getCategory('power')!.units;
const SPEED_UNITS = getCategory('angularVelocity')!.units;

export default function MotorTorquePowerSpeedCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [solveFor, setSolveFor] = useState<SolveFor>('power');

  const [torqueValue, setTorqueValue] = useState(50);
  const [torqueUnit, setTorqueUnit] = useState('nm');
  const [powerValue, setPowerValue] = useState(10);
  const [powerUnit, setPowerUnit] = useState('kw');
  const [speedValue, setSpeedValue] = useState(3000);
  const [speedUnit, setSpeedUnit] = useState('rpm');

  const [currentA, setCurrentA] = useState(0);
  const [torqueConstant, setTorqueConstant] = useState(0.5);
  const [efficiencyPercent, setEfficiencyPercent] = useState(0);

  const getInputs = useCallback((): Record<string, unknown> => ({
    solveFor, torqueValue, torqueUnit, powerValue, powerUnit,
    speedValue, speedUnit, currentA, torqueConstant, efficiencyPercent,
  }), [solveFor, torqueValue, torqueUnit, powerValue, powerUnit,
    speedValue, speedUnit, currentA, torqueConstant, efficiencyPercent]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.solveFor) setSolveFor(v.solveFor);
    if (v.torqueValue != null) setTorqueValue(v.torqueValue);
    if (v.torqueUnit) setTorqueUnit(v.torqueUnit);
    if (v.powerValue != null) setPowerValue(v.powerValue);
    if (v.powerUnit) setPowerUnit(v.powerUnit);
    if (v.speedValue != null) setSpeedValue(v.speedValue);
    if (v.speedUnit) setSpeedUnit(v.speedUnit);
    if (v.currentA != null) setCurrentA(v.currentA);
    if (v.torqueConstant != null) setTorqueConstant(v.torqueConstant);
    if (v.efficiencyPercent != null) setEfficiencyPercent(v.efficiencyPercent);
  }, []);

  const saved = useSavedCalculations('motor-torque-power-speed');

  const torqueNmGiven = useMemo(() => convert('torque', torqueUnit, 'nm', torqueValue), [torqueUnit, torqueValue]);
  const powerWGiven = useMemo(() => convert('power', powerUnit, 'w', powerValue), [powerUnit, powerValue]);
  const speedRadSGiven = useMemo(() => convert('angularVelocity', speedUnit, 'rads', speedValue), [speedUnit, speedValue]);

  const result = useMemo(
    () => solveTorquePowerSpeed({ solveFor, torqueNm: torqueNmGiven, powerW: powerWGiven, speedRadS: speedRadSGiven }),
    [solveFor, torqueNmGiven, powerWGiven, speedRadSGiven]
  );

  const displayTorque = solveFor === 'torque' ? convert('torque', 'nm', torqueUnit, result.torqueNm) : torqueValue;
  const displayPower = solveFor === 'power' ? convert('power', 'w', powerUnit, result.powerW) : powerValue;
  const displaySpeed = solveFor === 'speed' ? convert('angularVelocity', 'rads', speedUnit, result.speedRadS) : speedValue;

  const crossCheckTorqueNm = currentA > 0 && torqueConstant > 0 ? torqueFromCurrent(currentA, torqueConstant) : null;
  const elecInputPowerW = efficiencyPercent > 0 ? electricalInputPower(result.powerW, efficiencyPercent) : null;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    if (solveFor === 'torque') {
      steps.push({
        title: 'Torque from power and speed',
        formula: 'T = P / ω,  ω = angular velocity (rad/s)',
        substitution: `P = ${fmt(powerWGiven, 1)} W, ω = ${fmt(speedRadSGiven, 3)} rad/s`,
        result: `T = ${fmt(result.torqueNm, 3)} N·m (${fmt(convert('torque', 'nm', torqueUnit, result.torqueNm), 3)} ${TORQUE_UNITS.find(u => u.id === torqueUnit)?.label})`,
      });
    } else if (solveFor === 'power') {
      steps.push({
        title: 'Power from torque and speed',
        formula: 'P = T × ω,  ω = angular velocity (rad/s)',
        substitution: `T = ${fmt(torqueNmGiven, 3)} N·m, ω = ${fmt(speedRadSGiven, 3)} rad/s`,
        result: `P = ${fmt(result.powerW, 1)} W (${fmt(convert('power', 'w', powerUnit, result.powerW), 3)} ${POWER_UNITS.find(u => u.id === powerUnit)?.label})`,
      });
    } else {
      steps.push({
        title: 'Speed from power and torque',
        formula: 'ω = P / T,  ω = angular velocity (rad/s)',
        substitution: `P = ${fmt(powerWGiven, 1)} W, T = ${fmt(torqueNmGiven, 3)} N·m`,
        result: `ω = ${fmt(result.speedRadS, 3)} rad/s (${fmt(convert('angularVelocity', 'rads', speedUnit, result.speedRadS), 1)} ${SPEED_UNITS.find(u => u.id === speedUnit)?.label})`,
      });
    }

    if (crossCheckTorqueNm !== null) {
      steps.push({
        title: 'Cross-check: torque from current (PM motor)',
        formula: 'T = Kt × I',
        substitution: `Kt = ${fmt(torqueConstant, 4)} N·m/A, I = ${fmt(currentA, 2)} A`,
        result: `T = ${fmt(crossCheckTorqueNm, 3)} N·m`,
      });
    }

    if (elecInputPowerW !== null) {
      steps.push({
        title: 'Electrical input power (from efficiency)',
        formula: 'P_elec = P_mech / η',
        substitution: `P_mech = ${fmt(result.powerW, 1)} W, η = ${fmt(efficiencyPercent, 1)}%`,
        result: `P_elec = ${fmt(elecInputPowerW, 1)} W`,
      });
    }

    return steps;
  }, [solveFor, torqueNmGiven, powerWGiven, speedRadSGiven, result, torqueUnit, powerUnit, speedUnit, crossCheckTorqueNm, torqueConstant, currentA, elecInputPowerW, efficiencyPercent]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Given',
      rows: [
        { label: 'Solve for', value: solveFor.charAt(0).toUpperCase() + solveFor.slice(1) },
        { label: 'Torque', value: solveFor === 'torque' ? '(computed)' : `${torqueValue} ${torqueUnit}` },
        { label: 'Power', value: solveFor === 'power' ? '(computed)' : `${powerValue} ${powerUnit}` },
        { label: 'Speed', value: solveFor === 'speed' ? '(computed)' : `${speedValue} ${speedUnit}` },
      ],
    },
  ], [solveFor, torqueValue, torqueUnit, powerValue, powerUnit, speedValue, speedUnit]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Result',
      rows: [
        { label: 'Torque', value: `${fmt(displayTorque, 3)} ${TORQUE_UNITS.find(u => u.id === torqueUnit)?.label}` },
        { label: 'Power', value: `${fmt(displayPower, 3)} ${POWER_UNITS.find(u => u.id === powerUnit)?.label}` },
        { label: 'Speed', value: `${fmt(displaySpeed, 1)} ${SPEED_UNITS.find(u => u.id === speedUnit)?.label}` },
        ...(crossCheckTorqueNm !== null ? [{ label: 'Torque from current (cross-check)', value: `${fmt(crossCheckTorqueNm, 3)} N·m` }] : []),
        ...(elecInputPowerW !== null ? [{ label: 'Electrical input power', value: `${fmt(elecInputPowerW, 1)} W` }] : []),
      ],
    },
  ], [displayTorque, displayPower, displaySpeed, torqueUnit, powerUnit, speedUnit, crossCheckTorqueNm, elecInputPowerW]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Motor_Torque_Power_Speed_Calculator',
      pageTitle: 'Motor Torque/Power/Speed Calculator',
      accentHex,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer: 'Engineering estimation tool. Core relationship P = T × ω is exact for any rotating shaft; the torque-from-current cross-check (T = Kt × I) assumes an ideal PM machine with a constant torque constant (valid near-linearly below magnetic saturation); the efficiency-adjusted electrical input power assumes motoring operation. Verify against the actual motor datasheet for a specific machine.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Motor Torque/Power/Speed Calculator</div>
          <h1>Motor Torque/Power/Speed Calculator</h1>
          <p>
            Solve for any one of torque, power, or speed given the other two (P = T × ω), with common
            unit conversions built in, plus optional cross-checks for a PM motor's torque constant and
            efficiency-adjusted electrical input power.
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
              <button className={solveFor === 'torque' ? 'active' : ''} onClick={() => setSolveFor('torque')}>Torque</button>
              <button className={solveFor === 'power' ? 'active' : ''} onClick={() => setSolveFor('power')}>Power</button>
              <button className={solveFor === 'speed' ? 'active' : ''} onClick={() => setSolveFor('speed')}>Speed</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Values</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Torque</label>
                <input autoComplete="off" type="number" value={solveFor === 'torque' ? Number(displayTorque.toFixed(4)) : torqueValue} disabled={solveFor === 'torque'} onChange={(e) => setTorqueValue(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Torque unit</label>
                <select value={torqueUnit} onChange={(e) => setTorqueUnit(e.target.value)}>
                  {TORQUE_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Power</label>
                <input autoComplete="off" type="number" value={solveFor === 'power' ? Number(displayPower.toFixed(4)) : powerValue} disabled={solveFor === 'power'} onChange={(e) => setPowerValue(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Power unit</label>
                <select value={powerUnit} onChange={(e) => setPowerUnit(e.target.value)}>
                  {POWER_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Speed</label>
                <input autoComplete="off" type="number" value={solveFor === 'speed' ? Number(displaySpeed.toFixed(2)) : speedValue} disabled={solveFor === 'speed'} onChange={(e) => setSpeedValue(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Speed unit</label>
                <select value={speedUnit} onChange={(e) => setSpeedUnit(e.target.value)}>
                  {SPEED_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Cross-check: torque from current (optional, PM motor)</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Current (A)</label>
                <input autoComplete="off" type="number" min={0} value={currentA} onChange={(e) => setCurrentA(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Torque constant Kt (N·m/A)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={torqueConstant} onChange={(e) => setTorqueConstant(Number(e.target.value))} />
              </div>
            </div>
            <span className="hint">Leave current at 0 to skip this cross-check. Assumes an ideal PM machine (T = Kt × I), valid below magnetic saturation.</span>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Electrical input power (optional)</span></div>
            <div className="field">
              <label>Efficiency (%)</label>
              <input autoComplete="off" type="number" min={0} max={100} step={0.1} value={efficiencyPercent} onChange={(e) => setEfficiencyPercent(Number(e.target.value))} />
              <span className="hint">Leave at 0 to skip. Assumes motoring operation: electrical input = mechanical output / efficiency.</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Torque</div>
                <div className={`value ${solveFor === 'torque' ? 'pos' : ''}`}>{fmt(displayTorque, 3)}<span className="unit">{shortUnit(TORQUE_UNITS.find(u => u.id === torqueUnit)?.label)}</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Power</div>
                <div className={`value ${solveFor === 'power' ? 'pos' : ''}`}>{fmt(displayPower, 3)}<span className="unit">{shortUnit(POWER_UNITS.find(u => u.id === powerUnit)?.label)}</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Speed</div>
                <div className={`value ${solveFor === 'speed' ? 'pos' : ''}`}>{fmt(displaySpeed, 1)}<span className="unit">{shortUnit(SPEED_UNITS.find(u => u.id === speedUnit)?.label)}</span></div>
              </div>
              {crossCheckTorqueNm !== null && (
                <div className="result-tile">
                  <div className="label">Torque from current</div>
                  <div className="value">{fmt(crossCheckTorqueNm, 3)}<span className="unit">N·m</span></div>
                  <div className="hint">cross-check, independent of the P=T×ω triangle</div>
                </div>
              )}
              {elecInputPowerW !== null && (
                <div className="result-tile">
                  <div className="label">Electrical input power</div>
                  <div className="value">{fmt(elecInputPowerW, 1)}<span className="unit">W</span></div>
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
          The core relationship P = T × ω (power = torque × angular velocity) is exact for any rotating
          shaft, independent of motor type. The optional torque-from-current cross-check (T = Kt × I) is
          specific to permanent-magnet machines and assumes an ideal, linear torque constant — real motors
          deviate from this near magnetic saturation or at very high current. The optional efficiency-
          adjusted electrical input power assumes motoring operation (input greater than output); for
          regenerative/generating operation the relationship inverts.
        </p>
        <p className="note">
          <b>Validated:</b> a 1 hp (746 W) motor at a standard 1750 rpm nameplate speed should produce about
          4.07 N·m by the classic motor-sizing rule of thumb T[N·m] = 9550 × P[kW] / N[rpm] — this calculator
          returns 4.071 N·m. The torque-from-current and efficiency cross-checks also match hand calculation
          exactly (e.g. 10 A at Kt = 0.5 N·m/A → 5.0 N·m; 1000 W mechanical at 92% efficiency → 1086.96 W
          electrical input).
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
