import { useCallback, useMemo, useState } from 'react';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import InfoTooltip from '../components/InfoTooltip';
import PremiumGate from '../components/PremiumGate';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH_M, UNIT_AREA, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import { getSkinDepthMaterial } from '../lib/skinDepthPhysics';
import {
  ZERO_Z,
  addZ,
  zMagnitude,
  transformerImpedance,
  transformerFullLoadA,
  utilityImpedance,
  cableRunImpedance,
  resistivityAt,
  faultCurrentA,
  faultPowerVA,
  peakFactorKappa,
  peakCurrentA,
  type Impedance,
  type SystemType,
} from '../lib/shortCircuitPhysics';

type SourceMode = 'direct' | 'transformer' | 'utility';
type CableMaterial = 'copper' | 'aluminium';

const SYSTEM_DEFAULT_V: Record<SystemType, number> = { three_phase: 400, single_phase: 230, dc: 400 };

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '∞';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const fmtMohm = (ohm: number, digits = 3) => `${fmt(ohm * 1000, digits)} mΩ`;
const fmtKA = (a: number, digits = 2) => `${fmt(a / 1000, digits)} kA`;

function fmtEng(value: number, unit: string, digits = 2): string {
  const a = Math.abs(value);
  if (a >= 1e6) return `${fmt(value / 1e6, digits)} M${unit}`;
  if (a >= 1e3) return `${fmt(value / 1e3, digits)} k${unit}`;
  return `${fmt(value, digits)} ${unit}`;
}

export default function ShortCircuitCurrentCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [system, setSystem] = useState<SystemType>('three_phase');
  const [voltageV, setVoltageV] = useState(400);
  const [cFactor, setCFactor] = useState(1);
  const isAC = system !== 'dc';

  const [sourceMode, setSourceMode] = useState<SourceMode>('direct');
  const [rSrcMohm, setRSrcMohm] = useState(8);
  const [xSrcMohm, setXSrcMohm] = useState(6);
  const [dcSrcMohm, setDcSrcMohm] = useState(20);
  const [xfmrKva, setXfmrKva] = useState(500);
  const [xfmrZPct, setXfmrZPct] = useState(4);
  const [xfmrXoverR, setXfmrXoverR] = useState(5);
  const [utilitySkMva, setUtilitySkMva] = useState(50);
  const [utilityXoverR, setUtilityXoverR] = useState(10);

  const [cableOn, setCableOn] = useState(false);
  const [cableLengthM, setCableLengthM] = useState(50);
  const [cableAreaMm2, setCableAreaMm2] = useState(95);
  const [cableParallel, setCableParallel] = useState(1);
  const [cableMaterial, setCableMaterial] = useState<CableMaterial>('copper');
  const [cableTempC, setCableTempC] = useState(20);
  const [cableXOhmPerKm, setCableXOhmPerKm] = useState(0.08);

  const [peakOn, setPeakOn] = useState(false);
  const [ratingKA, setRatingKA] = useState<number | ''>('');

  const handleSystemChange = (s: SystemType) => {
    setSystem(s);
    setVoltageV(SYSTEM_DEFAULT_V[s]);
    if (s === 'dc' && sourceMode !== 'direct') setSourceMode('direct');
  };

  const getInputs = useCallback((): Record<string, unknown> => ({
    system, voltageV, cFactor, sourceMode, rSrcMohm, xSrcMohm, dcSrcMohm,
    xfmrKva, xfmrZPct, xfmrXoverR, utilitySkMva, utilityXoverR,
    cableOn, cableLengthM, cableAreaMm2, cableParallel, cableMaterial, cableTempC, cableXOhmPerKm,
    peakOn, ratingKA,
  }), [system, voltageV, cFactor, sourceMode, rSrcMohm, xSrcMohm, dcSrcMohm, xfmrKva, xfmrZPct, xfmrXoverR,
    utilitySkMva, utilityXoverR, cableOn, cableLengthM, cableAreaMm2, cableParallel, cableMaterial, cableTempC,
    cableXOhmPerKm, peakOn, ratingKA]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.system) setSystem(v.system);
    if (v.voltageV != null) setVoltageV(v.voltageV);
    if (v.cFactor != null) setCFactor(v.cFactor);
    if (v.sourceMode) setSourceMode(v.sourceMode);
    if (v.rSrcMohm != null) setRSrcMohm(v.rSrcMohm);
    if (v.xSrcMohm != null) setXSrcMohm(v.xSrcMohm);
    if (v.dcSrcMohm != null) setDcSrcMohm(v.dcSrcMohm);
    if (v.xfmrKva != null) setXfmrKva(v.xfmrKva);
    if (v.xfmrZPct != null) setXfmrZPct(v.xfmrZPct);
    if (v.xfmrXoverR != null) setXfmrXoverR(v.xfmrXoverR);
    if (v.utilitySkMva != null) setUtilitySkMva(v.utilitySkMva);
    if (v.utilityXoverR != null) setUtilityXoverR(v.utilityXoverR);
    if (v.cableOn != null) setCableOn(v.cableOn);
    if (v.cableLengthM != null) setCableLengthM(v.cableLengthM);
    if (v.cableAreaMm2 != null) setCableAreaMm2(v.cableAreaMm2);
    if (v.cableParallel != null) setCableParallel(v.cableParallel);
    if (v.cableMaterial) setCableMaterial(v.cableMaterial);
    if (v.cableTempC != null) setCableTempC(v.cableTempC);
    if (v.cableXOhmPerKm != null) setCableXOhmPerKm(v.cableXOhmPerKm);
    if (v.peakOn != null) setPeakOn(v.peakOn);
    if (v.ratingKA != null) setRatingKA(v.ratingKA);
  }, []);

  const saved = useSavedCalculations('short-circuit-current');
  const shareLink = useShareableLink(restoreInputs);

  // ── Physics ──
  const sourceZ: Impedance = useMemo(() => {
    if (system === 'dc') return { r: dcSrcMohm / 1000, x: 0 };
    if (sourceMode === 'transformer') return transformerImpedance(xfmrKva * 1e3, voltageV, xfmrZPct, xfmrXoverR);
    if (sourceMode === 'utility') return utilityImpedance(utilitySkMva * 1e6, voltageV, utilityXoverR);
    return { r: rSrcMohm / 1000, x: xSrcMohm / 1000 };
  }, [system, dcSrcMohm, sourceMode, xfmrKva, voltageV, xfmrZPct, xfmrXoverR, utilitySkMva, utilityXoverR, rSrcMohm, xSrcMohm]);

  const cableMat = getSkinDepthMaterial(cableMaterial);
  const cableRho = resistivityAt(cableMat.rho20OhmMm2PerM, cableMat.beta, cableTempC);
  const loopFactor: 1 | 2 = system === 'three_phase' ? 1 : 2;
  const cableZ: Impedance = useMemo(
    () => (cableOn && cableLengthM > 0 && cableAreaMm2 > 0
      ? cableRunImpedance({ lengthM: cableLengthM, areaMm2: cableAreaMm2, parallelConductors: cableParallel, rhoOhmMm2PerM: cableRho, reactanceOhmPerKm: isAC ? cableXOhmPerKm : 0 }, loopFactor)
      : ZERO_Z),
    [cableOn, cableLengthM, cableAreaMm2, cableParallel, cableRho, cableXOhmPerKm, isAC, loopFactor],
  );
  const totalZ = useMemo(() => addZ(sourceZ, cableZ), [sourceZ, cableZ]);
  const zTot = isAC ? zMagnitude(totalZ) : totalZ.r;

  const c = isAC ? cFactor : 1;
  const valid = voltageV > 0 && zTot > 0 && c > 0;
  const ikA = valid ? faultCurrentA(voltageV, totalZ, system, c) : NaN;
  const skVA = valid ? faultPowerVA(voltageV, ikA, system) : NaN;
  const xOverRTot = totalZ.r > 0 ? totalZ.x / totalZ.r : Infinity;

  const showPeak = peakOn && isAC && valid;
  const kappa = showPeak ? peakFactorKappa(totalZ) : NaN;
  const ipA = showPeak ? peakCurrentA(ikA, kappa) : NaN;
  const ratingA = peakOn && isAC && ratingKA !== '' ? ratingKA * 1000 : null;
  const ratingPass = ratingA !== null && valid ? ikA <= ratingA : null;

  const xfmrFla = system !== 'dc' && sourceMode === 'transformer' ? transformerFullLoadA(xfmrKva * 1e3, voltageV, system) : null;

  const sourceLabel = system === 'dc' ? 'DC source / battery internal resistance'
    : sourceMode === 'transformer' ? `Transformer ${fmt(xfmrKva, 0)} kVA, ${fmt(xfmrZPct, 2)} %Z, X/R ${fmt(xfmrXoverR, 1)}`
    : sourceMode === 'utility' ? `Upstream network ${fmt(utilitySkMva, 1)} MVA, X/R ${fmt(utilityXoverR, 1)}`
    : 'Source impedance (entered directly)';
  const systemLabel = system === 'three_phase' ? 'Three-phase (balanced, bolted fault)' : system === 'single_phase' ? 'Single-phase' : 'DC';
  const vLabel = system === 'three_phase' ? 'Line-to-line voltage' : system === 'single_phase' ? 'Supply voltage' : 'DC voltage';

  const calculationSteps: CalcStepData[] = useMemo(() => {
    if (!valid) return [];
    const out: CalcStepData[] = [];
    if (system !== 'dc' && sourceMode === 'transformer') {
      out.push({
        title: 'Transformer impedance, referred to the secondary',
        formula: 'Z = (Z% / 100) · V² / S;  R = Z / √(1 + (X/R)²);  X = R · (X/R)',
        substitution: `Z% = ${fmt(xfmrZPct, 2)}, V = ${fmt(voltageV, 1)} V, S = ${fmt(xfmrKva, 1)} kVA, X/R = ${fmt(xfmrXoverR, 1)}`,
        result: `Z = ${fmtMohm(zMagnitude(sourceZ))}  →  R = ${fmtMohm(sourceZ.r)}, X = ${fmtMohm(sourceZ.x)}`,
      });
    } else if (system !== 'dc' && sourceMode === 'utility') {
      out.push({
        title: 'Upstream network impedance from its fault level',
        formula: 'Z = V² / S_k;  R = Z / √(1 + (X/R)²);  X = R · (X/R)',
        substitution: `V = ${fmt(voltageV, 1)} V, S_k = ${fmt(utilitySkMva, 1)} MVA, X/R = ${fmt(utilityXoverR, 1)}`,
        result: `Z = ${fmtMohm(zMagnitude(sourceZ))}  →  R = ${fmtMohm(sourceZ.r)}, X = ${fmtMohm(sourceZ.x)}`,
      });
    } else {
      out.push({
        title: 'Source impedance',
        formula: isAC ? 'Z_s = R_s + jX_s' : 'R_s',
        substitution: sourceLabel,
        result: isAC ? `R = ${fmtMohm(sourceZ.r)}, X = ${fmtMohm(sourceZ.x)}, |Z| = ${fmtMohm(zMagnitude(sourceZ))}` : `R = ${fmtMohm(sourceZ.r)}`,
      });
    }
    if (cableOn && (cableZ.r > 0 || cableZ.x > 0)) {
      out.push({
        title: `Cable run impedance${loopFactor === 2 ? ' (out and back)' : ''}`,
        formula: `R = ${loopFactor === 2 ? '2 · ' : ''}ρ(θ) · L / (A · n);  X = ${loopFactor === 2 ? '2 · ' : ''}x′ · L / n`,
        substitution: `${cableMat.name}: ρ(${fmt(cableTempC, 0)}°C) = ${fmt(cableRho, 5)} Ω·mm²/m, L = ${fmt(cableLengthM, 1)} m, A = ${fmt(cableAreaMm2, 1)} mm², n = ${fmt(cableParallel, 0)}${isAC ? `, x′ = ${fmt(cableXOhmPerKm, 3)} Ω/km` : ''}`,
        result: isAC ? `R = ${fmtMohm(cableZ.r)}, X = ${fmtMohm(cableZ.x)}` : `R = ${fmtMohm(cableZ.r)}`,
      });
    }
    out.push({
      title: 'Total fault-loop impedance (series impedances add)',
      formula: isAC ? 'R_t = ΣR;  X_t = ΣX;  |Z_t| = √(R_t² + X_t²)' : 'R_t = ΣR',
      substitution: isAC ? `R_t = ${fmtMohm(totalZ.r)}, X_t = ${fmtMohm(totalZ.x)}` : `R_t = ${fmtMohm(totalZ.r)}`,
      result: isAC ? `|Z_t| = ${fmtMohm(zTot)}, X/R = ${fmt(xOverRTot, 2)}` : `R_t = ${fmtMohm(zTot)}`,
    });
    out.push({
      title: "Prospective fault current (Ohm's Law)",
      formula: system === 'three_phase' ? 'I = c · V_LL / (√3 · |Z_t|)' : system === 'single_phase' ? 'I = c · V / |Z_t|' : 'I = V / R_t',
      substitution: system === 'dc' ? `V = ${fmt(voltageV, 1)} V, R_t = ${fmtMohm(zTot)}` : `c = ${fmt(c, 2)}, V = ${fmt(voltageV, 1)} V, |Z_t| = ${fmtMohm(zTot)}`,
      result: `I = ${fmtKA(ikA, 3)} (${fmt(ikA, 0)} A)`,
    });
    if (xfmrFla !== null) {
      out.push({
        title: 'Cross-check: transformer full-load current ÷ per-unit impedance (infinite upstream source, no cable)',
        formula: 'I_FL = S / (√3 · V);  I = I_FL / (Z% / 100)',
        substitution: `I_FL = ${fmt(xfmrFla, 1)} A, Z = ${fmt(xfmrZPct, 2)}%`,
        result: `I = ${fmtKA(xfmrFla / (xfmrZPct / 100), 3)} at the transformer terminals`,
      });
    }
    out.push({
      title: 'Fault level',
      formula: system === 'three_phase' ? 'S_k = √3 · V · I' : system === 'single_phase' ? 'S_k = V · I' : 'P = V · I',
      substitution: `V = ${fmt(voltageV, 1)} V, I = ${fmtKA(ikA, 3)}`,
      result: fmtEng(skVA, system === 'dc' ? 'W' : 'VA', 2),
    });
    if (showPeak) {
      out.push({
        title: 'Peak (first half-cycle) current — IEC 60909-0 factor κ',
        formula: 'κ = 1.02 + 0.98 · e^(−3R/X);  i_p = κ · √2 · I',
        substitution: `R/X = ${fmt(totalZ.x > 0 ? totalZ.r / totalZ.x : 0, 3)}, I = ${fmtKA(ikA, 3)}`,
        result: `κ = ${fmt(kappa, 3)}, i_p = ${fmtKA(ipA, 2)} peak`,
      });
    }
    return out;
  }, [valid, system, sourceMode, isAC, sourceZ, sourceLabel, xfmrZPct, voltageV, xfmrKva, xfmrXoverR, utilitySkMva, utilityXoverR,
    cableOn, cableZ, loopFactor, cableMat.name, cableTempC, cableRho, cableLengthM, cableAreaMm2, cableParallel, cableXOhmPerKm,
    totalZ, zTot, xOverRTot, c, ikA, xfmrFla, skVA, showPeak, kappa, ipA]);

  const inputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'System', value: systemLabel },
      { label: vLabel, value: `${fmt(voltageV, 1)} V` },
    ];
    if (isAC) rows.push({ label: 'Voltage factor c', value: fmt(cFactor, 2) });
    rows.push({ label: 'Source', value: sourceLabel });
    if (system === 'dc') rows.push({ label: 'Source resistance', value: `${fmt(dcSrcMohm, 3)} mΩ` });
    else if (sourceMode === 'direct') rows.push({ label: 'Source R / X', value: `${fmt(rSrcMohm, 3)} mΩ / ${fmt(xSrcMohm, 3)} mΩ` });
    if (cableOn) {
      rows.push(
        { label: 'Cable', value: `${cableMat.name}, ${fmt(cableParallel, 0)} × ${fmt(cableAreaMm2, 1)} mm², ${fmt(cableLengthM, 1)} m at ${fmt(cableTempC, 0)}°C` },
      );
      if (isAC) rows.push({ label: 'Cable reactance', value: `${fmt(cableXOhmPerKm, 3)} Ω/km` });
    }
    if (ratingA !== null) rows.push({ label: 'Device breaking capacity', value: `${fmt(ratingA / 1000, 2)} kA` });
    return [{ heading: 'Inputs', rows }];
  }, [systemLabel, vLabel, voltageV, isAC, cFactor, sourceLabel, system, dcSrcMohm, sourceMode, rSrcMohm, xSrcMohm, cableOn, cableMat.name, cableParallel, cableAreaMm2, cableLengthM, cableTempC, cableXOhmPerKm, ratingA]);

  const outputSections: ReportSection[] = useMemo(() => {
    if (!valid) return [];
    const rows: ReportRow[] = [
      { label: 'Prospective fault current', value: `${fmtKA(ikA, 3)} (${fmt(ikA, 0)} A)` },
      { label: 'Total fault-loop impedance', value: isAC ? `${fmtMohm(zTot)} (R ${fmtMohm(totalZ.r)}, X ${fmtMohm(totalZ.x)}, X/R ${fmt(xOverRTot, 2)})` : fmtMohm(zTot) },
      { label: system === 'dc' ? 'Fault power' : 'Fault level', value: fmtEng(skVA, system === 'dc' ? 'W' : 'VA', 2) },
    ];
    if (showPeak) {
      rows.push({ label: 'Peak factor κ', value: fmt(kappa, 3) }, { label: 'Peak fault current i_p', value: `${fmtKA(ipA, 2)} peak` });
    }
    if (ratingA !== null) rows.push({ label: 'Within device breaking capacity?', value: ratingPass ? `Yes — ${fmt((ikA / ratingA) * 100, 0)}% of ${fmtKA(ratingA, 1)}` : `NO — ${fmt((ikA / ratingA) * 100, 0)}% of ${fmtKA(ratingA, 1)}` });
    return [{ heading: 'Results', rows }];
  }, [valid, ikA, isAC, zTot, totalZ, xOverRTot, system, skVA, showPeak, kappa, ipA, ratingA, ratingPass]);

  const handleExportPdf = () => {
    if (!valid) return;
    exportReportToPdf({
      tabName: 'Short_Circuit_Current_Calculator',
      pageTitle: 'Short Circuit Current Calculator',
      accentHex,
      passStatus: ratingPass === null ? null : { pass: ratingPass, label: ratingPass ? 'Fault current within device breaking capacity' : 'Fault current EXCEEDS device breaking capacity' },
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [],
      disclaimer: "Engineering estimation tool. Prospective fault current by Ohm's Law, I = V/Z, for a single non-meshed fault path with a bolted (zero-impedance) fault, no motor or generator contribution, and no impedance from the fault itself (arc voltage), so the result is an upper bound for the stated source and cable. It does not replace a full IEC 60909 / IEEE 551 study: minimum fault current (for protection sensitivity), unbalanced faults, motor contribution, meshed networks, and zero-sequence impedances are not modelled. Cable reactance is a typical figure — use the manufacturer's value. Verify protective-device ratings and let-through energy against the device manufacturer's data.",
      ...branding,
    });
  };

  const pStyle = { marginTop: '0.85rem' } as const;

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Short Circuit Current Calculator</div>
          <h1>Short Circuit Current Calculator</h1>
          <p>
            The prospective fault current of a supply by Ohm's Law, I = V / Z — from a directly entered
            source impedance or a transformer's %Z, for three-phase, single-phase and DC (battery) systems.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} disabled={!valid} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>System</span></div>
            <div className="segmented">
              <button className={system === 'three_phase' ? 'active' : ''} onClick={() => handleSystemChange('three_phase')}>Three-phase</button>
              <button className={system === 'single_phase' ? 'active' : ''} onClick={() => handleSystemChange('single_phase')}>Single-phase</button>
              <button className={system === 'dc' ? 'active' : ''} onClick={() => handleSystemChange('dc')}>DC</button>
            </div>
            <div className="grid grid-2" style={pStyle}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  {vLabel} (V)
                  <InfoTooltip>
                    {system === 'three_phase' ? 'Nominal line-to-line voltage at the source (e.g. 400 V, 690 V). The calculation uses the phase voltage V/√3 across the per-phase impedance.'
                      : system === 'single_phase' ? 'Nominal supply voltage across the fault loop (e.g. 230 V). The fault current flows out on one conductor and back on the other.'
                      : 'Open-circuit voltage of the DC source (e.g. a battery pack at full charge). The current is limited by the total resistance of the source and the conductors.'}
                  </InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step="any" value={voltageV} onChange={e => setVoltageV(Number(e.target.value))} />
              </div>
              {isAC && (
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center' }}>
                    Voltage factor c
                    <InfoTooltip>1.00 gives plain Ohm's Law at nominal voltage. IEC 60909 uses c = 1.05 (or 1.10 where the LV tolerance is +10%) when calculating the maximum fault current, to allow for the source voltage sitting above nominal.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0.5} max={1.2} step={0.01} value={cFactor} onChange={e => setCFactor(Number(e.target.value))} />
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Source impedance</span></div>
            {system === 'dc' ? (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  Source internal resistance (mΩ)
                  <InfoTooltip>The DC source's internal resistance — for a battery pack, the sum of the cells' internal resistances in series (divided across parallel strings) plus any contactor, fuse and busbar resistance inside the pack. Use the cell datasheet's DC internal resistance at the relevant state of charge and temperature; resistance rises when cold.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step="any" value={dcSrcMohm} onChange={e => setDcSrcMohm(Number(e.target.value))} />
              </div>
            ) : (
              <>
                <div className="segmented">
                  <button className={sourceMode === 'direct' ? 'active' : ''} onClick={() => setSourceMode('direct')}>Enter Z</button>
                  <button className={sourceMode === 'transformer' ? 'active' : ''} onClick={() => setSourceMode('transformer')}>Transformer</button>
                  <button className={sourceMode === 'utility' ? 'active' : ''} onClick={() => setSourceMode('utility')}>Fault level</button>
                </div>
                {sourceMode === 'direct' && (
                  <div className="grid grid-2" style={pStyle}>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Source resistance R (mΩ)
                        <InfoTooltip>Per-phase (three-phase) or loop (single-phase) resistance of the source. Impedance can be taken from the supplier, a measured loop-impedance test, or the transformer nameplate.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step="any" value={rSrcMohm} onChange={e => setRSrcMohm(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>Source reactance X (mΩ)</label>
                      <input autoComplete="off" type="number" min={0} step="any" value={xSrcMohm} onChange={e => setXSrcMohm(Number(e.target.value))} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <span className="hint">|Z| = √(R² + X²) = {fmt(Math.hypot(rSrcMohm, xSrcMohm), 3)} mΩ</span>
                    </div>
                  </div>
                )}
                {sourceMode === 'transformer' && (
                  <div className="grid grid-2" style={pStyle}>
                    <div className="field">
                      <label>Rating (kVA)</label>
                      <input autoComplete="off" type="number" min={0} step="any" value={xfmrKva} onChange={e => setXfmrKva(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Impedance Z (%)
                        <InfoTooltip>The transformer's per-unit short-circuit impedance from its nameplate, as a percentage — typically 4–6% for distribution transformers. The secondary voltage entered in step 1 is used as the transformer's secondary voltage.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step="any" value={xfmrZPct} onChange={e => setXfmrZPct(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        X/R ratio
                        <InfoTooltip>Splits the impedance into resistance and reactance. Only the peak current depends on it; the rms fault current barely changes. Typical distribution transformers are around 3–8, rising with rating.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step="any" value={xfmrXoverR} onChange={e => setXfmrXoverR(Number(e.target.value))} />
                    </div>
                    {xfmrFla !== null && (
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <span className="hint">Full-load current {fmt(xfmrFla, 1)} A</span>
                      </div>
                    )}
                  </div>
                )}
                {sourceMode === 'utility' && (
                  <PremiumGate feature="Upstream fault-level source">
                    <div className="grid grid-2" style={pStyle}>
                      <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center' }}>
                          Fault level S<sub>k</sub> (MVA)
                          <InfoTooltip>The supplier's quoted short-circuit level at the point of supply, referred to the voltage entered in step 1. Source impedance is Z = V² / S<sub>k</sub>.</InfoTooltip>
                        </label>
                        <input autoComplete="off" type="number" min={0} step="any" value={utilitySkMva} onChange={e => setUtilitySkMva(Number(e.target.value))} />
                      </div>
                      <div className="field">
                        <label>X/R ratio</label>
                        <input autoComplete="off" type="number" min={0} step="any" value={utilityXoverR} onChange={e => setUtilityXoverR(Number(e.target.value))} />
                      </div>
                    </div>
                  </PremiumGate>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Cable to the fault (optional)</span></div>
            <PremiumGate feature="Cable run impedance">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
                <input type="checkbox" checked={cableOn} onChange={e => setCableOn(e.target.checked)} style={{ width: 'auto' }} />
                Add the impedance of a cable or busbar run between the source and the fault
              </label>
              {cableOn && (
                <div className="grid grid-2" style={pStyle}>
                  <div className="field">
                    <label>Conductor</label>
                    <select value={cableMaterial} onChange={e => setCableMaterial(e.target.value as CableMaterial)}>
                      <option value="copper">Copper</option>
                      <option value="aluminium">Aluminium</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Length ({unitLabel(unitSystem, UNIT_LENGTH_M)})</label>
                    <input autoComplete="off" type="number" min={0} step="any" value={toDisplay(cableLengthM, unitSystem, UNIT_LENGTH_M)} onChange={e => setCableLengthM(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH_M))} />
                  </div>
                  <div className="field">
                    <label>Conductor area ({unitLabel(unitSystem, UNIT_AREA)})</label>
                    <input autoComplete="off" type="number" min={0} step="any" value={toDisplay(cableAreaMm2, unitSystem, UNIT_AREA)} onChange={e => setCableAreaMm2(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA))} />
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      Conductors in parallel
                      <InfoTooltip>Identical cables per phase (or per pole for DC) sharing the current, which divides both resistance and reactance by the number of cables.</InfoTooltip>
                    </label>
                    <input autoComplete="off" type="number" min={1} step={1} value={cableParallel} onChange={e => setCableParallel(Number(e.target.value))} />
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      Conductor temperature ({unitLabel(unitSystem, UNIT_TEMP)})
                      <InfoTooltip>Resistance rises with temperature. Maximum fault current is conventionally calculated with the conductor at 20 °C (the coolest, so lowest-impedance, case); use a hotter value for a minimum fault current check.</InfoTooltip>
                    </label>
                    <input autoComplete="off" type="number" value={toDisplay(cableTempC, unitSystem, UNIT_TEMP)} onChange={e => setCableTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                  </div>
                  {isAC && (
                    <div className="field">
                      <label style={{ display: 'flex', alignItems: 'center' }}>
                        Reactance x′ (Ω/km)
                        <InfoTooltip>Typical LV multicore cable is about 0.07–0.09 Ω/km; single-core cables spaced apart are higher. Use the cable manufacturer's figure when you have it.</InfoTooltip>
                      </label>
                      <input autoComplete="off" type="number" min={0} step="any" value={cableXOhmPerKm} onChange={e => setCableXOhmPerKm(Number(e.target.value))} />
                    </div>
                  )}
                  {loopFactor === 2 && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <span className="hint">The fault current flows out and back, so the cable's impedance is counted twice (same-size return conductor assumed).</span>
                    </div>
                  )}
                </div>
              )}
            </PremiumGate>
          </div>

          {isAC && (
            <div className="card">
              <div className="card-title"><span><span className="step-num">4</span>Peak current &amp; device rating (optional)</span></div>
              <PremiumGate feature="Peak current and device rating check">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>
                  <input type="checkbox" checked={peakOn} onChange={e => setPeakOn(e.target.checked)} style={{ width: 'auto' }} />
                  Calculate the peak asymmetrical current and check a device rating
                </label>
                {peakOn && (
                  <div className="field" style={pStyle}>
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      Device breaking capacity (kA rms)
                      <InfoTooltip>The rated short-circuit breaking capacity of the breaker or fuse at this point. Leave blank to skip the check. This compares the rms fault current only — also check the device's making capacity against the peak current shown.</InfoTooltip>
                    </label>
                    <input autoComplete="off" type="number" min={0} step="any" value={ratingKA} placeholder="e.g. 25" onChange={e => setRatingKA(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                )}
              </PremiumGate>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            {!valid ? (
              <p className="note">Enter a positive voltage and a non-zero source impedance to see the fault current.</p>
            ) : (
              <>
                {ratingPass !== null && ratingA !== null && (
                  <div className={`status-banner ${ratingPass ? 'pass' : 'fail'}`}>
                    {ratingPass
                      ? `✓ Fault current is ${fmt((ikA / ratingA) * 100, 0)}% of the ${fmtKA(ratingA, 1)} breaking capacity`
                      : `✗ Fault current is ${fmt((ikA / ratingA) * 100, 0)}% of the ${fmtKA(ratingA, 1)} breaking capacity — exceeds the device rating`}
                  </div>
                )}
                <div className="result-grid">
                  <div className="result-tile">
                    <div className="label">Prospective fault current</div>
                    <div className="value">{fmt(ikA / 1000, 2)}<span className="unit">kA</span></div>
                    <div className="hint">{fmt(ikA, 0)} A {isAC ? 'rms, symmetrical' : 'DC'}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Total impedance</div>
                    <div className="value">{fmt(zTot * 1000, 3)}<span className="unit">mΩ</span></div>
                    <div className="hint">{isAC ? `R ${fmt(totalZ.r * 1000, 3)} + jX ${fmt(totalZ.x * 1000, 3)} mΩ` : 'resistance only'}</div>
                  </div>
                  {isAC && (
                    <div className="result-tile">
                      <div className="label">X/R ratio</div>
                      <div className="value">{fmt(xOverRTot, 2)}</div>
                      <div className="hint">sets the peak factor</div>
                    </div>
                  )}
                  <div className="result-tile">
                    <div className="label">{system === 'dc' ? 'Fault power' : 'Fault level'}</div>
                    <div className="value">{fmtEng(skVA, system === 'dc' ? 'W' : 'VA', 2)}</div>
                    <div className="hint">{system === 'three_phase' ? '√3 · V · I' : 'V · I'}</div>
                  </div>
                  {showPeak && (
                    <>
                      <div className="result-tile">
                        <div className="label">Peak factor κ</div>
                        <div className="value">{fmt(kappa, 3)}</div>
                        <div className="hint">IEC 60909-0</div>
                      </div>
                      <div className="result-tile">
                        <div className="label">Peak current i<sub>p</sub></div>
                        <div className="value warn">{fmt(ipA / 1000, 2)}<span className="unit">kA</span></div>
                        <div className="hint">κ · √2 · I — first half-cycle</div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {valid && (
            <div className="card">
              <div className="card-title">Impedance build-up</div>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Element</th><th>R (mΩ)</th>{isAC && <th>X (mΩ)</th>}<th>|Z| (mΩ)</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{system === 'dc' ? 'Source' : sourceMode === 'transformer' ? 'Transformer' : sourceMode === 'utility' ? 'Upstream network' : 'Source'}</td>
                    <td>{fmt(sourceZ.r * 1000, 3)}</td>{isAC && <td>{fmt(sourceZ.x * 1000, 3)}</td>}
                    <td>{fmt((isAC ? zMagnitude(sourceZ) : sourceZ.r) * 1000, 3)}</td>
                  </tr>
                  {cableOn && (
                    <tr>
                      <td>Cable run</td>
                      <td>{fmt(cableZ.r * 1000, 3)}</td>{isAC && <td>{fmt(cableZ.x * 1000, 3)}</td>}
                      <td>{fmt((isAC ? zMagnitude(cableZ) : cableZ.r) * 1000, 3)}</td>
                    </tr>
                  )}
                  <tr>
                    <td><b>Total</b></td>
                    <td><b>{fmt(totalZ.r * 1000, 3)}</b></td>{isAC && <td><b>{fmt(totalZ.x * 1000, 3)}</b></td>}
                    <td><b>{fmt(zTot * 1000, 3)}</b></td>
                  </tr>
                </tbody>
              </table>
              {isAC && cableOn && (
                <p className="note" style={{ marginTop: '0.6rem' }}>
                  Adding the cable lowers the fault current from {fmtKA(faultCurrentA(voltageV, sourceZ, system, c), 2)} at the source to {fmtKA(ikA, 2)} at the end of the run.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <GuideBacklink calculatorPath="/short-circuit-current" />
        <p className="note">
          During a bolted short circuit the only thing limiting the current is the impedance of the loop from the
          source to the fault, so by Ohm's Law <strong>I = V / Z</strong>. Impedances in series add as complex numbers
          (R + jX), giving |Z| = √(R² + X²). In a balanced three-phase fault each phase sees V<sub>LL</sub>/√3 across
          its own impedance, so I = c·V<sub>LL</sub> / (√3·|Z|); for single-phase the loop includes the return
          conductor, so a cable is counted out and back. A transformer's nameplate %Z gives its impedance as
          Z = (%Z/100)·V²/S, which is equivalent to the familiar rule of thumb I = I<sub>full-load</sub> / (%Z/100).
          For a DC source such as a battery pack there is no reactance, so I = V / R, where R is the cells' internal
          resistance plus all the conductor, contactor and fuse resistance in the loop.
        </p>
        <p className="note">
          The peak current matters for the mechanical stress on busbars and the making capacity of switchgear:
          the first half-cycle can reach i<sub>p</sub> = κ·√2·I with κ = 1.02 + 0.98·e<sup>−3R/X</sup> (IEC 60909-0),
          up to twice the √2·I peak for a purely reactive loop. This tool gives the <em>maximum</em> prospective
          current for a bolted fault on a single non-meshed path. It ignores motor and generator contribution,
          arc voltage, unbalanced faults (line-to-ground) and the minimum fault current used to check that
          protection will operate, and it does not apply the IEC 60909 impedance correction factors, so treat the
          result as an estimate and carry out a full study for any installation.
        </p>
        <p className="note">
          <b>Validated:</b> checked against hand calculations — a 400 V three-phase source of 10 mΩ gives
          23.09 kA; a 500 kVA, 4 % transformer at 400 V (full-load 721.7 A) gives 18.04 kA; X/R = 5 gives
          κ = 1.558; 50 m of 95 mm² copper at 20 °C has R = 9.05 mΩ; a 400 V DC source with 25 mΩ total gives 16.0 kA.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Calculation steps</div>
        {calculationSteps.length === 0 && <p className="note">Enter valid inputs to see the working.</p>}
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
