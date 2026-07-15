import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import InfoTooltip from '../components/InfoTooltip';
import DcLinkArrayDiagram from '../components/DcLinkArrayDiagram';
import {
  CAP_SUPPLIERS, seriesForSupplier, voltagesForSeries, partsFor,
  maxOperatingVoltage, estimateLifeHours, type DcLinkCapacitor,
} from '../lib/dcLinkCapacitors';
import {
  solveDcLinkSizing, solveCapBank, resonanceHz,
  type DcLinkInput, type CapBankInput, type CoolingMethod,
} from '../lib/dcLinkPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

const COOLING_LABELS: Record<CoolingMethod, string> = {
  natural: 'Natural convection',
  forcedAir: 'Forced air (moderate)',
  strongForcedAir: 'Forced air (strong)',
  conduction: 'Conduction to cold surface',
};

function lifeQuality(hours: number): { label: string; cls: string } {
  const years = hours / 8760;
  if (years >= 15) return { label: 'Excellent', cls: 'pos' };
  if (years >= 8) return { label: 'Good', cls: 'pos' };
  if (years >= 3) return { label: 'Moderate', cls: 'warn' };
  if (years >= 1) return { label: 'Marginal', cls: 'warn' };
  return { label: 'Poor — reduce hot-spot temp', cls: 'neg' };
}

export default function DcLinkCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  // ── System / operating point ──
  const [busVoltageV, setBusVoltageV] = useState(400);
  const [rippleVoltagePkPkV, setRippleVoltagePkPkV] = useState(8);
  const [outputFreqHz, setOutputFreqHz] = useState(200);
  const [switchingFreqKhz, setSwitchingFreqKhz] = useState(10);
  const [phaseCurrentRmsA, setPhaseCurrentRmsA] = useState(200);
  const [powerFactor, setPowerFactor] = useState(0.9);
  const [modulationIndex, setModulationIndex] = useState(0.9);
  const [cableInductanceUh, setCableInductanceUh] = useState(1);

  // ── Capacitor selection ──
  const [capMode, setCapMode] = useState<'catalog' | 'custom'>('catalog');
  const [supplier, setSupplier] = useState<string>('KEMET');
  const [series, setSeries] = useState<string>('C4AQ-M');
  const [voltageSel, setVoltageSel] = useState<number>(500);
  const [leadsSel] = useState<number>(4);
  const [partNumber, setPartNumber] = useState<string>('C4AQLBW5800M36K');
  // custom cap
  const [customCapUf, setCustomCapUf] = useState(80);
  const [customRatedV, setCustomRatedV] = useState(500);
  const [customEsrMohm, setCustomEsrMohm] = useState(1.8);
  const [customIrmsA, setCustomIrmsA] = useState(32);
  const [customRthCW, setCustomRthCW] = useState(14);
  const [customLmm, setCustomLmm] = useState(42);
  const [customTmm, setCustomTmm] = useState(35);
  const [customHmm, setCustomHmm] = useState(46);
  const [customPartRef, setCustomPartRef] = useState('');

  // ── Thermal & layout ──
  const [ambientTempC, setAmbientTempC] = useState(70);
  const [coolingMethod, setCoolingMethod] = useState<CoolingMethod>('natural');
  const [conductionRthCW, setConductionRthCW] = useState(4);
  const [columns, setColumns] = useState(0); // 0 = auto
  const [spacingMm, setSpacingMm] = useState(3);

  const seriesList = useMemo(() => seriesForSupplier(supplier), [supplier]);
  const voltageList = useMemo(() => voltagesForSeries(supplier, series), [supplier, series]);
  const partList = useMemo(() => partsFor(supplier, series, voltageSel, leadsSel), [supplier, series, voltageSel, leadsSel]);

  const catalogPart: DcLinkCapacitor | undefined = useMemo(
    () => partList.find((p) => p.partNumber === partNumber) ?? partList[0],
    [partList, partNumber]
  );

  // The active capacitor (catalog or custom).
  const cap = useMemo(() => {
    if (capMode === 'custom') {
      return {
        partNumber: customPartRef || 'Custom',
        capacitanceUf: customCapUf, ratedVoltageVdc: customRatedV, esrMohm: customEsrMohm,
        irmsRatedA: customIrmsA, rthCW: customRthCW,
        boxLengthMm: customLmm, boxThicknessMm: customTmm, boxHeightMm: customHmm,
      };
    }
    if (!catalogPart) return null;
    return {
      partNumber: catalogPart.partNumber, capacitanceUf: catalogPart.capacitanceUf,
      ratedVoltageVdc: catalogPart.ratedVoltageVdc, esrMohm: catalogPart.esrMohm,
      irmsRatedA: catalogPart.irmsRatedA, rthCW: catalogPart.rthCW,
      boxLengthMm: catalogPart.boxLengthMm, boxThicknessMm: catalogPart.boxThicknessMm, boxHeightMm: catalogPart.boxHeightMm,
    };
  }, [capMode, catalogPart, customPartRef, customCapUf, customRatedV, customEsrMohm, customIrmsA, customRthCW, customLmm, customTmm, customHmm]);

  const sizingInput: DcLinkInput = useMemo(() => ({
    busVoltageV, rippleVoltagePkPkV, outputFreqHz,
    switchingFreqHz: switchingFreqKhz * 1000,
    phaseCurrentRmsA, powerFactor, modulationIndex,
    cableInductanceH: cableInductanceUh * 1e-6,
  }), [busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh]);

  const sizing = useMemo(() => solveDcLinkSizing(sizingInput), [sizingInput]);

  const bankInput: CapBankInput | null = useMemo(() => {
    if (!cap) return null;
    return {
      requiredCapacitanceUf: sizing.requiredCapacitanceUf,
      rippleCurrentRmsA: sizing.rippleCurrentRmsA,
      busVoltageV,
      ambientTempC,
      capUf: cap.capacitanceUf, ratedVoltageVdc: cap.ratedVoltageVdc, esrMohm: cap.esrMohm,
      irmsRatedA: cap.irmsRatedA, rthCW: cap.rthCW,
      boxLengthMm: cap.boxLengthMm, boxThicknessMm: cap.boxThicknessMm, boxHeightMm: cap.boxHeightMm,
      columns, spacingMm, coolingMethod, conductionRthCW,
    };
  }, [cap, sizing, busVoltageV, ambientTempC, columns, spacingMm, coolingMethod, conductionRthCW]);

  const bank = useMemo(() => (bankInput ? solveCapBank(bankInput) : null), [bankInput]);

  const life = useMemo(() => {
    if (!bank || !cap) return null;
    const hours = estimateLifeHours(bank.hotSpotTempC, busVoltageV, cap.ratedVoltageVdc);
    return { hours, years: hours / 8760, quality: lifeQuality(hours) };
  }, [bank, cap, busVoltageV]);

  const actualResonanceHz = useMemo(() => (bank ? resonanceHz(cableInductanceUh * 1e-6, bank.totalCapacitanceUf) : Infinity), [bank, cableInductanceUh]);
  const maxOpV = cap ? maxOperatingVoltage(cap.ratedVoltageVdc, bank?.hotSpotTempC ?? ambientTempC) : 0;
  const hotRow = bank ? Math.min(Math.floor(bank.rows / 2), bank.rows - 1) : 0;
  const hotColumn = bank ? Math.min(Math.floor(bank.columnsUsed / 2), (hotRow === bank.rows - 1 ? bank.lastRowCount : bank.columnsUsed) - 1) : 0;

  // ── Checks ──
  const checks = useMemo(() => {
    const out: { severity: 'pass' | 'warn' | 'fail'; label: string; detail: string }[] = [];
    if (!cap || !bank) return out;
    // Voltage rating
    if (busVoltageV > cap.ratedVoltageVdc) {
      out.push({ severity: 'fail', label: 'Voltage rating', detail: `Bus ${fmt(busVoltageV, 0)} V exceeds the capacitor's ${fmt(cap.ratedVoltageVdc, 0)} V rating. Choose a higher-voltage part.` });
    } else if (busVoltageV > 0.8 * cap.ratedVoltageVdc) {
      out.push({ severity: 'warn', label: 'Voltage derating', detail: `Bus ${fmt(busVoltageV, 0)} V is above 80% of the ${fmt(cap.ratedVoltageVdc, 0)} V rating — film-cap life is much longer at ≤0.8×V_rated. Max at this hot-spot temp ≈ ${fmt(maxOpV, 0)} V.` });
    } else {
      out.push({ severity: 'pass', label: 'Voltage rating', detail: `Bus ${fmt(busVoltageV, 0)} V vs ${fmt(cap.ratedVoltageVdc, 0)} V rated (${fmt((busVoltageV / cap.ratedVoltageVdc) * 100, 0)}% — good headroom).` });
    }
    // Hot spot
    if (bank.hotSpotTempC > 105) {
      out.push({ severity: 'fail', label: 'Hot-spot temperature', detail: `Worst-case hot spot ${fmt(bank.hotSpotTempC, 0)}°C exceeds the 105°C rated maximum — add capacitors, improve cooling, or spread the array.` });
    } else if (bank.hotSpotTempC > 85) {
      out.push({ severity: 'warn', label: 'Hot-spot temperature', detail: `Worst-case hot spot ${fmt(bank.hotSpotTempC, 0)}°C is above the 85°C rated point — allowed to 105°C but life is reduced. The datasheet Irms rating corresponds to a 30°C rise (100°C at 70°C ambient).` });
    } else {
      out.push({ severity: 'pass', label: 'Hot-spot temperature', detail: `Worst-case hot spot ${fmt(bank.hotSpotTempC, 0)}°C (${fmt(bank.hotSpotRiseC, 0)}°C rise) — within the 85°C rated point.` });
    }
    // Current sharing headroom
    if (bank.currentPerCapA > cap.irmsRatedA) {
      out.push({ severity: 'warn', label: 'Per-cap current', detail: `Each cap carries ${fmt(bank.currentPerCapA, 1)} A vs its ${fmt(cap.irmsRatedA, 1)} A (30°C-rise) rating — the count was raised to compensate, but check the resulting hot spot.` });
    }
    // Resonance margin
    const fsw = switchingFreqKhz * 1000;
    if (cableInductanceUh > 0) {
      if (actualResonanceHz > fsw) {
        out.push({ severity: 'fail', label: 'Cable resonance', detail: `LC resonance ${fmt(actualResonanceHz, 0)} Hz is above the ${fmt(fsw, 0)} Hz switching frequency — the source cable, not the cap, would carry the ripple. Increase capacitance.` });
      } else if (actualResonanceHz > fsw / 3) {
        out.push({ severity: 'warn', label: 'Cable resonance', detail: `LC resonance ${fmt(actualResonanceHz, 0)} Hz is within a factor of 3 of the ${fmt(fsw, 0)} Hz switching frequency — add margin (more capacitance) to avoid exciting it.` });
      } else {
        out.push({ severity: 'pass', label: 'Cable resonance', detail: `LC resonance ${fmt(actualResonanceHz, 0)} Hz is well below the ${fmt(fsw, 0)} Hz switching frequency.` });
      }
    }
    return out;
  }, [cap, bank, busVoltageV, maxOpV, switchingFreqKhz, cableInductanceUh, actualResonanceHz]);

  const overallPass = checks.every((c) => c.severity !== 'fail');
  const failing = checks.filter((c) => c.severity === 'fail');
  const warnings = checks.filter((c) => c.severity === 'warn');

  // ── save/load ──
  const getInputs = useCallback((): Record<string, unknown> => ({
    busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh,
    capMode, supplier, series, voltageSel, partNumber,
    customCapUf, customRatedV, customEsrMohm, customIrmsA, customRthCW, customLmm, customTmm, customHmm, customPartRef,
    ambientTempC, coolingMethod, conductionRthCW, columns, spacingMm,
  }), [busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh,
    capMode, supplier, series, voltageSel, partNumber, customCapUf, customRatedV, customEsrMohm, customIrmsA, customRthCW, customLmm, customTmm, customHmm, customPartRef,
    ambientTempC, coolingMethod, conductionRthCW, columns, spacingMm]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    const set = <T,>(x: T | undefined | null, f: (val: T) => void) => { if (x != null) f(x); };
    set(v.busVoltageV, setBusVoltageV); set(v.rippleVoltagePkPkV, setRippleVoltagePkPkV); set(v.outputFreqHz, setOutputFreqHz);
    set(v.switchingFreqKhz, setSwitchingFreqKhz); set(v.phaseCurrentRmsA, setPhaseCurrentRmsA); set(v.powerFactor, setPowerFactor);
    set(v.modulationIndex, setModulationIndex); set(v.cableInductanceUh, setCableInductanceUh);
    set(v.capMode, setCapMode); set(v.supplier, setSupplier); set(v.series, setSeries); set(v.voltageSel, setVoltageSel); set(v.partNumber, setPartNumber);
    set(v.customCapUf, setCustomCapUf); set(v.customRatedV, setCustomRatedV); set(v.customEsrMohm, setCustomEsrMohm); set(v.customIrmsA, setCustomIrmsA);
    set(v.customRthCW, setCustomRthCW); set(v.customLmm, setCustomLmm); set(v.customTmm, setCustomTmm); set(v.customHmm, setCustomHmm); set(v.customPartRef, setCustomPartRef);
    set(v.ambientTempC, setAmbientTempC); set(v.coolingMethod, setCoolingMethod); set(v.conductionRthCW, setConductionRthCW);
    set(v.columns, setColumns); set(v.spacingMm, setSpacingMm);
  }, []);

  const saved = useSavedCalculations('dc-link');

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      {
        title: 'DC-link RMS ripple current (Kolar & Round, Eq. 28)',
        formula: 'I_C,rms = I_ph,rms·√{ 2M·[ √3/(4π) + cos²φ·(√3/π − 9M/16) ] }',
        substitution: `I_ph = ${fmt(phaseCurrentRmsA, 0)} A rms, M = ${fmt(modulationIndex, 2)}, cos φ = ${fmt(powerFactor, 2)}`,
        result: `I_C,rms = ${fmt(sizing.rippleCurrentRmsA, 1)} A (${fmt(sizing.rippleCurrentRatio, 2)} × phase current)`,
      },
      {
        title: 'Capacitance for switching-ripple voltage',
        formula: 'C = I_C,rms / (2π·f_sw·V_rip,rms),  V_rip,rms = ΔV_pp/(2√2)',
        substitution: `f_sw = ${fmt(switchingFreqKhz, 1)} kHz, ΔV_pp = ${fmt(rippleVoltagePkPkV, 1)} V`,
        result: `C(ripple) = ${fmt(sizing.capForVoltageRippleUf, 0)} µF`,
      },
      {
        title: 'Source-decoupling minimum (cable inductance)',
        formula: 'C ≥ 1/(L_cable·(2π·f_sw)²)  keeps the LC resonance below f_sw',
        substitution: `L_cable = ${fmt(cableInductanceUh, 2)} µH`,
        result: `C(decoupling) = ${fmt(sizing.capForDecouplingUf, 0)} µF → required = ${fmt(sizing.requiredCapacitanceUf, 0)} µF (governed by ${sizing.governedBy})`,
      },
    ];
    if (bank && cap) {
      steps.push({
        title: 'Capacitor count and loss',
        formula: 'N = max(⌈C_req/C_cap⌉, ⌈I_C,rms/I_rms,cap⌉),  P_cap = ESR·(I_C,rms/N)²',
        substitution: `C_cap = ${fmt(cap.capacitanceUf, 0)} µF, ESR = ${fmt(cap.esrMohm, 2)} mΩ, I_rms,cap = ${fmt(cap.irmsRatedA, 1)} A`,
        result: `N = ${bank.count} (${bank.countForCapacitance} for C, ${bank.countForCurrent} for current), ${fmt(bank.currentPerCapA, 1)} A/cap, ${fmt(bank.lossPerCapW, 2)} W/cap`,
      });
      steps.push({
        title: 'Hot-spot temperature (worst, most-enclosed cap)',
        formula: 'R_th,eff = R_th·(5/exposed faces)·cooling,  T_HS = T_amb + P_cap·R_th,eff',
        substitution: `R_th = ${fmt(cap.rthCW, 1)} °C/W, exposed faces ≈ ${fmt(bank.exposedFaceEq, 1)}/5, cooling = ${COOLING_LABELS[coolingMethod]}, T_amb = ${fmt(ambientTempC, 0)}°C`,
        result: `R_th,eff = ${fmt(bank.rthWorstCW, 1)} °C/W → T_HS = ${fmt(bank.hotSpotTempC, 0)}°C (${fmt(bank.hotSpotRiseC, 0)}°C rise)`,
      });
      if (life) {
        steps.push({
          title: 'Expected life (PP-film model)',
          formula: 'L = 120 000 h · 2^((70−T_HS)/15) · (V_rated/V_bus)^7',
          substitution: `T_HS = ${fmt(bank.hotSpotTempC, 0)}°C, V_bus = ${fmt(busVoltageV, 0)} V, V_rated = ${fmt(cap.ratedVoltageVdc, 0)} V`,
          result: `L ≈ ${fmt(life.hours, 0)} h (${fmt(life.years, 1)} years) — ${life.quality.label}`,
        });
      }
    }
    return steps;
  }, [phaseCurrentRmsA, modulationIndex, powerFactor, sizing, switchingFreqKhz, rippleVoltagePkPkV, cableInductanceUh, bank, cap, coolingMethod, ambientTempC, life, busVoltageV]);

  const inputSections: ReportSection[] = useMemo(() => {
    const sys: ReportRow[] = [
      { label: 'Bus voltage', value: `${fmt(busVoltageV, 0)} V` },
      { label: 'Allowed ripple (pk-pk)', value: `${fmt(rippleVoltagePkPkV, 2)} V` },
      { label: 'Output / switching freq', value: `${fmt(outputFreqHz, 0)} Hz / ${fmt(switchingFreqKhz, 1)} kHz` },
      { label: 'Phase current', value: `${fmt(phaseCurrentRmsA, 0)} A rms` },
      { label: 'Power factor / modulation', value: `${fmt(powerFactor, 2)} / M ${fmt(modulationIndex, 2)}` },
      { label: 'Cable inductance', value: `${fmt(cableInductanceUh, 2)} µH` },
    ];
    const capRows: ReportRow[] = cap ? [
      { label: 'Capacitor', value: `${capMode === 'custom' ? 'Custom' : `${supplier} ${series}`} ${cap.partNumber}` },
      { label: 'Per-cap C / V', value: `${fmt(cap.capacitanceUf, 0)} µF / ${fmt(cap.ratedVoltageVdc, 0)} V` },
      { label: 'ESR / Irms / Rth', value: `${fmt(cap.esrMohm, 2)} mΩ / ${fmt(cap.irmsRatedA, 1)} A / ${fmt(cap.rthCW, 1)} °C/W` },
      { label: 'Box L×T×H', value: `${fmt(cap.boxLengthMm, 1)}×${fmt(cap.boxThicknessMm, 1)}×${fmt(cap.boxHeightMm, 1)} mm` },
      { label: 'Cooling / ambient', value: `${COOLING_LABELS[coolingMethod]} / ${fmt(ambientTempC, 0)}°C` },
    ] : [];
    return [
      { heading: 'System operating point', rows: sys },
      { heading: 'Capacitor & cooling', rows: capRows },
    ];
  }, [busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh, cap, capMode, supplier, series, coolingMethod, ambientTempC]);

  const outputSections: ReportSection[] = useMemo(() => {
    const rows: ReportRow[] = [
      { label: 'DC-link ripple current', value: `${fmt(sizing.rippleCurrentRmsA, 1)} A rms` },
      { label: 'Required capacitance', value: `${fmt(sizing.requiredCapacitanceUf, 0)} µF (${sizing.governedBy})` },
    ];
    if (bank && cap) {
      rows.push({ label: 'Capacitor count', value: `${bank.count} × ${fmt(cap.capacitanceUf, 0)} µF = ${fmt(bank.totalCapacitanceUf, 0)} µF` });
      rows.push({ label: 'Bank ESR', value: `${fmt(bank.bankEsrMohm, 3)} mΩ` });
      rows.push({ label: 'Loss (per cap / total)', value: `${fmt(bank.lossPerCapW, 2)} W / ${fmt(bank.lossTotalW, 1)} W` });
      rows.push({ label: 'Worst-case hot spot', value: `${fmt(bank.hotSpotTempC, 0)}°C (${fmt(bank.hotSpotRiseC, 0)}°C rise)` });
      rows.push({ label: 'Envelope (W×D×H)', value: `${fmt(bank.envelopeWmm, 0)}×${fmt(bank.envelopeDmm, 0)}×${fmt(bank.envelopeHmm, 0)} mm (${bank.rows}×${bank.columnsUsed})` });
      if (life) rows.push({ label: 'Expected life', value: `${fmt(life.hours, 0)} h (${fmt(life.years, 1)} yr) — ${life.quality.label}` });
    }
    return [
      { heading: 'Sizing & bank', rows },
      { heading: 'Checks', rows: checks.map((c) => ({ label: `${c.severity === 'pass' ? '✓' : c.severity === 'warn' ? '⚠' : '✗'} ${c.label}`, value: c.detail })) },
    ];
  }, [sizing, bank, cap, life, checks]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'DC_Link_Capacitor_Calculator',
      pageTitle: 'DC-Link Capacitor Sizing',
      accentHex,
      passStatus: { pass: overallPass, label: overallPass ? 'DC-link bank within limits' : 'DC-link bank fails one or more checks — see below' },
      inputSections, outputSections, calculationSteps,
      disclaimer:
        'DC-link sizing for a three-phase voltage-source inverter. The RMS ripple current uses the Kolar & Round closed form (IEE Proc. Electr. Power Appl., 2006, Eq. 28); the sizing capacitance is the larger of the switching-ripple-voltage limit (capacitor reactance dominant at f_sw) and the source-decoupling minimum (LC resonance below f_sw). Loss is P = ESR·I²; the hot-spot temperature uses ΔT = ESR·I²·R_th per the KEMET C4AQ-M datasheet, with an array thermal derating for the most-enclosed capacitor and a cooling-method factor. Expected life uses a PP-film model anchored to the C4AQ-M datasheet (120,000 h at rated voltage at 70°C hot spot, halving each ~15°C, with a (V_rated/V_applied)^7 voltage-acceleration factor); it is a first-order estimate — use the manufacturer lifetime curve for final validation. ESR is frequency- and temperature-dependent (the 10 kHz / 70°C datasheet value is used). Capacitor data transcribed from the KEMET C4AQ-M datasheet (F3125_C4AQ_M). Verify against the current datasheet and, for critical designs, by test.',
      ...branding,
    });
  };

  const seriesNum = (v: number, setter: (n: number) => void, opts: { step?: number; min?: number; max?: number } = {}) => (
    <input autoComplete="off" type="number" value={v} step={opts.step} min={opts.min} max={opts.max} onChange={(e) => setter(Number(e.target.value))} />
  );

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● DC-Link Capacitor Calculator</div>
          <h1>DC-Link Capacitor Sizing</h1>
          <p>
            Size the DC-link capacitor bank for a three-phase motor inverter — from the system operating point to a
            required capacitance and RMS ripple current (Kolar &amp; Round), then down-select a polypropylene film
            capacitor (Kemet C4AQ-M or custom), compute loss, hot-spot temperature and expected life, and lay out the
            parallel bank with array thermal derating.
          </p>
        </div>
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

      <div className="two-col">
        {/* LEFT — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span><span className="step-num">1</span>System operating point
                <InfoTooltip>The inverter's DC-side operating point. Modulation index M is the space-vector depth (≈ V_phase,pk/(V_dc/2), up to ~1.15); the ripple current peaks near M ≈ 0.6. Cable inductance is the DC-side stray/loop inductance between the source and the capacitor.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field"><label>Bus voltage (V)</label>{seriesNum(busVoltageV, setBusVoltageV, { step: 10, min: 0 })}</div>
              <div className="field"><label>Allowed ripple, pk-pk (V)</label>{seriesNum(rippleVoltagePkPkV, setRippleVoltagePkPkV, { step: 0.5, min: 0 })}</div>
              <div className="field"><label>Output frequency (Hz)</label>{seriesNum(outputFreqHz, setOutputFreqHz, { step: 10, min: 0 })}</div>
              <div className="field"><label>Switching frequency (kHz)</label>{seriesNum(switchingFreqKhz, setSwitchingFreqKhz, { step: 1, min: 0.1 })}</div>
              <div className="field"><label>Phase current (A rms)</label>{seriesNum(phaseCurrentRmsA, setPhaseCurrentRmsA, { step: 10, min: 0 })}</div>
              <div className="field"><label>Power factor cos φ</label>{seriesNum(powerFactor, setPowerFactor, { step: 0.05, min: 0, max: 1 })}</div>
              <div className="field"><label>Modulation index M</label>{seriesNum(modulationIndex, setModulationIndex, { step: 0.05, min: 0, max: 1.15 })}</div>
              <div className="field"><label>Cable inductance (µH)</label>{seriesNum(cableInductanceUh, setCableInductanceUh, { step: 0.1, min: 0 })}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">2</span>Capacitor selection
                <InfoTooltip>Down-select a metallized-polypropylene film DC-link capacitor by supplier, series, voltage and part, or switch to Custom to enter your own C, ESR, Rth, Irms rating, box dimensions and a reference part number.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <div className="segmented">
                <button className={capMode === 'catalog' ? 'active' : ''} onClick={() => setCapMode('catalog')}>Catalog</button>
                <button className={capMode === 'custom' ? 'active' : ''} onClick={() => setCapMode('custom')}>Custom</button>
              </div>
            </div>
            {capMode === 'catalog' ? (
              <div className="grid grid-2">
                <div className="field">
                  <label>Supplier</label>
                  <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                    {CAP_SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Series (PP film)</label>
                  <select value={series} onChange={(e) => { setSeries(e.target.value); }}>
                    {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Rated voltage (VDC)</label>
                  <select value={voltageSel} onChange={(e) => { const v = Number(e.target.value); setVoltageSel(v); const p = partsFor(supplier, series, v, leadsSel); if (p[0]) setPartNumber(p[0].partNumber); }}>
                    {voltageList.map((v) => <option key={v} value={v}>{v} V</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Mounting</label>
                  <select value={leadsSel} disabled><option value={4}>Radial, 4-lead</option></select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Part (capacitance)</label>
                  <select value={catalogPart?.partNumber ?? ''} onChange={(e) => setPartNumber(e.target.value)}>
                    {partList.map((p) => <option key={p.partNumber} value={p.partNumber}>{fmt(p.capacitanceUf, 0)} µF · {p.esrMohm} mΩ · {p.irmsRatedA} A · {p.partNumber}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="field"><label>Capacitance (µF)</label>{seriesNum(customCapUf, setCustomCapUf, { step: 1, min: 0.1 })}</div>
                <div className="field"><label>Rated voltage (VDC)</label>{seriesNum(customRatedV, setCustomRatedV, { step: 10, min: 1 })}</div>
                <div className="field"><label>ESR (mΩ)</label>{seriesNum(customEsrMohm, setCustomEsrMohm, { step: 0.1, min: 0.01 })}</div>
                <div className="field"><label>Irms rating (A)</label>{seriesNum(customIrmsA, setCustomIrmsA, { step: 1, min: 0.1 })}</div>
                <div className="field"><label>Thermal resistance Rth (°C/W)</label>{seriesNum(customRthCW, setCustomRthCW, { step: 0.5, min: 0.1 })}</div>
                <div className="field"><label>Part number (reference)</label><input autoComplete="off" value={customPartRef} onChange={(e) => setCustomPartRef(e.target.value)} placeholder="e.g. supplier P/N" /></div>
                <div className="field"><label>Box length L (mm)</label>{seriesNum(customLmm, setCustomLmm, { step: 1, min: 1 })}</div>
                <div className="field"><label>Box thickness T (mm)</label>{seriesNum(customTmm, setCustomTmm, { step: 1, min: 1 })}</div>
                <div className="field"><label>Box height H (mm)</label>{seriesNum(customHmm, setCustomHmm, { step: 1, min: 1 })}</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">3</span>Cooling &amp; layout
                <InfoTooltip>The datasheet Rth is for a single, freely-cooled part. In a parallel array the most-enclosed capacitor loses cooling area to its neighbours, so its effective Rth is derated by the exposed-face fraction (wider spacing helps). Choose a cooling method and the array geometry.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Ambient temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(ambientTempC, unitSystem, UNIT_TEMP)} onChange={(e) => setAmbientTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Cooling method</label>
                <select value={coolingMethod} onChange={(e) => setCoolingMethod(e.target.value as CoolingMethod)}>
                  {(Object.keys(COOLING_LABELS) as CoolingMethod[]).map((m) => <option key={m} value={m}>{COOLING_LABELS[m]}</option>)}
                </select>
              </div>
              {coolingMethod === 'conduction' && (
                <div className="field">
                  <label>Conduction Rth to sink (°C/W)</label>
                  {seriesNum(conductionRthCW, setConductionRthCW, { step: 0.5, min: 0.1 })}
                  <span className="hint">Per-cap hot-spot → cold surface (via terminals / clamp).</span>
                </div>
              )}
              <div className="field">
                <label>Columns (0 = auto)</label>
                {seriesNum(columns, setColumns, { step: 1, min: 0 })}
                <span className="hint">Auto uses a near-square grid (⌈√N⌉).</span>
              </div>
              <div className="field">
                <label>Spacing between caps ({lenUnit})</label>
                <input autoComplete="off" type="number" min={0} step={0.5} value={toDisplay(spacingMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setSpacingMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                <span className="hint">2–4 mm typical.</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className={`status-banner ${overallPass ? 'pass' : 'fail'}`}>
              {overallPass
                ? warnings.length > 0 ? `✓ Within limits — ${warnings.length} advisory note${warnings.length === 1 ? '' : 's'}` : '✓ DC-link bank within limits'
                : `✗ Fails ${failing.length} check${failing.length === 1 ? '' : 's'} — see below`}
            </div>
            {checks.filter((c) => c.severity !== 'pass').length > 0 && (
              <div style={{ margin: '0 0 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {checks.filter((c) => c.severity !== 'pass').map((c) => (
                  <div key={c.label} style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <div style={{ color: c.severity === 'fail' ? 'var(--neg)' : 'var(--warn)', fontWeight: 700 }}>{c.severity === 'fail' ? '✗' : '⚠'} {c.label}</div>
                    <div style={{ color: 'var(--text-2)' }}>→ {c.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">DC-link ripple current<InfoTooltip>RMS current the capacitor bank must carry (Kolar &amp; Round). This, not capacitance, usually sets the part count.</InfoTooltip></div>
                <div className="value">{fmt(sizing.rippleCurrentRmsA, 1)}<span className="unit">A</span></div>
                <div className="hint">{fmt(sizing.rippleCurrentRatio, 2)} × phase current</div>
              </div>
              <div className="result-tile">
                <div className="label">Required capacitance</div>
                <div className="value">{fmt(sizing.requiredCapacitanceUf, 0)}<span className="unit">µF</span></div>
                <div className="hint">governed by {sizing.governedBy}</div>
              </div>
              {bank && cap && (
                <>
                  <div className="result-tile">
                    <div className="label">Capacitors in parallel</div>
                    <div className="value">{bank.count}<span className="unit">×{fmt(cap.capacitanceUf, 0)}µF</span></div>
                    <div className="hint">= {fmt(bank.totalCapacitanceUf, 0)} µF · {bank.countForCurrent > bank.countForCapacitance ? 'current-limited' : 'capacitance-limited'}</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Loss (total)</div>
                    <div className="value">{fmt(bank.lossTotalW, 1)}<span className="unit">W</span></div>
                    <div className="hint">{fmt(bank.lossPerCapW, 2)} W/cap · {fmt(bank.currentPerCapA, 1)} A/cap</div>
                  </div>
                  <div className="result-tile">
                    <div className="label">Worst hot-spot temp</div>
                    <div className={`value ${bank.hotSpotTempC > 105 ? 'neg' : bank.hotSpotTempC > 85 ? 'warn' : 'pos'}`}>{fmtU(bank.hotSpotTempC, unitSystem, UNIT_TEMP, 0)}<span className="unit">{tempUnit}</span></div>
                    <div className="hint">+{fmt(bank.hotSpotRiseC, 0)}°C rise · Rth,eff {fmt(bank.rthWorstCW, 1)} °C/W</div>
                  </div>
                  {life && (
                    <div className="result-tile">
                      <div className="label">Expected life</div>
                      <div className={`value ${life.quality.cls}`}>{fmt(life.years, 1)}<span className="unit">yr</span></div>
                      <div className="hint">{fmt(life.hours, 0)} h · {life.quality.label}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {bank && cap && (
            <div className="card">
              <div className="card-title">Bank layout &amp; envelope</div>
              <DcLinkArrayDiagram
                count={bank.count} columns={bank.columnsUsed} rows={bank.rows} lastRowCount={bank.lastRowCount}
                boxLengthMm={cap.boxLengthMm} boxThicknessMm={cap.boxThicknessMm} boxHeightMm={cap.boxHeightMm}
                spacingMm={spacingMm} envelopeWmm={bank.envelopeWmm} envelopeDmm={bank.envelopeDmm}
                hotColumn={hotColumn} hotRow={hotRow} unitSystem={unitSystem}
              />
              <table className="data-table" style={{ marginTop: '0.5rem' }}>
                <tbody>
                  <tr><td>Grid</td><td>{bank.rows} rows × {bank.columnsUsed} cols ({bank.count} caps{bank.lastRowCount !== bank.columnsUsed ? `, last row ${bank.lastRowCount}` : ''})</td></tr>
                  <tr><td>Envelope W × D × H</td><td>{fmtU(bank.envelopeWmm, unitSystem, UNIT_LENGTH, 1)} × {fmtU(bank.envelopeDmm, unitSystem, UNIT_LENGTH, 1)} × {fmtU(bank.envelopeHmm, unitSystem, UNIT_LENGTH, 1)} {lenUnit}</td></tr>
                  <tr><td>Worst-case cap cooling</td><td>{fmt(bank.exposedFaceEq, 1)} of 5 faces exposed → Rth ×{fmt(5 / bank.exposedFaceEq, 2)}</td></tr>
                  <tr><td>Total stored energy</td><td>{fmt(0.5 * bank.totalCapacitanceUf * 1e-6 * busVoltageV * busVoltageV, 1)} J</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          The DC-link RMS ripple current uses the Kolar &amp; Round closed-form expression (IEE Proc. Electr. Power
          Appl., 2006, Eq. 28) for a three-phase voltage-source PWM inverter with sinusoidal output current and a
          constant DC-link voltage; it peaks near modulation index M ≈ 0.6 at roughly 0.6–0.65 × the RMS phase current.
          The sizing capacitance is the larger of two constraints: the switching-ripple-voltage limit (treating the
          capacitor reactance as the dominant impedance at f_sw, so C = I_C,rms/(2π·f_sw·V_rip,rms) with V_rip,rms =
          ΔV_pp/(2√2) — conservative, since all the ripple is taken at the switching frequency), and the
          source-decoupling minimum C ≥ 1/(L_cable·(2π·f_sw)²) that keeps the cable-inductance/capacitor resonance below
          the switching frequency. Capacitor loss is P = ESR·I² with the ripple current shared equally across the
          parallel bank; the hot-spot temperature is ΔT = ESR·I²·R_th (per the KEMET C4AQ-M datasheet), with the
          single-part R_th derated for the most-enclosed capacitor by its exposed-face fraction (top face plus side
          faces, side faces facing a neighbour across the gap cooling only partially) and a cooling-method factor
          (natural / forced air / conduction). ESR is frequency- and temperature-dependent — the datasheet 10 kHz /
          70 °C value is used, so real losses vary with the actual ripple spectrum. Expected life uses a PP-film model
          anchored to the C4AQ-M datasheet — 120,000 h at rated voltage at 70 °C hot spot, halving every ~15 °C
          (60,000 h at 85 °C), with a (V_rated/V_applied)^7 voltage-acceleration factor — and is a first-order
          estimate; the manufacturer's lifetime curve governs. Kemet C4AQ-M parameters are transcribed from datasheet
          F3125_C4AQ_M; verify against the current datasheet and, for critical designs, by test.
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
