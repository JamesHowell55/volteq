import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import DcLinkArrayDiagram from '../components/DcLinkArrayDiagram';
import {
  CAP_SUPPLIERS, DC_LINK_CAPACITORS, seriesForSupplier, voltagesForSeries, partsFor, leadsFor,
  maxOperatingVoltage, estimateLifeHours, type DcLinkCapacitor,
} from '../lib/dcLinkCapacitors';
import {
  solveDcLinkSizing, solveCapBank, resonanceHz, optimizeDcLinkBank,
  busbarLoopInductanceNh, solveSwitchingOvershoot, diDtFromFallTime,
  type DcLinkInput, type CapBankInput, type CoolingMethod, type OptimizeObjective, type OptimizeCandidate,
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
  const [leadsSel, setLeadsSel] = useState<number>(4);
  const [partNumber, setPartNumber] = useState<string>('C4AQLBW5800M36K');
  // custom cap
  const [customCapUf, setCustomCapUf] = useState(80);
  const [customRatedV, setCustomRatedV] = useState(500);
  const [customEsrMohm, setCustomEsrMohm] = useState(1.8);
  const [customEslNh, setCustomEslNh] = useState(20);
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

  // ── Package optimizer ──
  const [optimizeEnabled, setOptimizeEnabled] = useState(false);
  const [maxWidthMm, setMaxWidthMm] = useState(200);
  const [maxDepthMm, setMaxDepthMm] = useState(150);
  const [maxHeightMm, setMaxHeightMm] = useState(60);
  const [optMaxHotSpotC, setOptMaxHotSpotC] = useState(85);
  const [optObjective, setOptObjective] = useState<OptimizeObjective>('volume');

  // ── Switching overshoot ──
  const [loopMode, setLoopMode] = useState<'direct' | 'geometry'>('direct');
  const [loopInductanceNh, setLoopInductanceNh] = useState(30);
  const [busbarLenMm, setBusbarLenMm] = useState(100);
  const [busbarWidthMm, setBusbarWidthMm] = useState(50);
  const [busbarSepMm, setBusbarSepMm] = useState(1);
  const [moduleEslNh, setModuleEslNh] = useState(15);
  const [didtMode, setDidtMode] = useState<'derived' | 'direct'>('derived');
  const [switchedCurrentA, setSwitchedCurrentA] = useState(283);
  const [fallTimeNs, setFallTimeNs] = useState(30);
  const [didtDirectAPerUs, setDidtDirectAPerUs] = useState(6000);

  const seriesList = useMemo(() => seriesForSupplier(supplier), [supplier]);
  const voltageList = useMemo(() => voltagesForSeries(supplier, series), [supplier, series]);
  const leadsList = useMemo(() => leadsFor(supplier, series, voltageSel), [supplier, series, voltageSel]);
  const partList = useMemo(() => partsFor(supplier, series, voltageSel, leadsSel), [supplier, series, voltageSel, leadsSel]);

  // Cascade helpers — changing a higher-level selection re-resolves the ones
  // below it to a valid value so a real part is always selected.
  const pickFirstPart = (sup: string, ser: string, v: number, ld: number) => {
    const p = partsFor(sup, ser, v, ld);
    if (p[0]) setPartNumber(p[0].partNumber);
  };
  const onSupplierChange = (s: string) => {
    const ser = seriesForSupplier(s)[0];
    const v = voltagesForSeries(s, ser)[0];
    const ld = leadsFor(s, ser, v)[0] ?? 4;
    setSupplier(s); setSeries(ser); setVoltageSel(v); setLeadsSel(ld); pickFirstPart(s, ser, v, ld);
  };
  const onSeriesChange = (ser: string) => {
    const vs = voltagesForSeries(supplier, ser);
    const v = vs.includes(voltageSel) ? voltageSel : vs[0];
    const lds = leadsFor(supplier, ser, v);
    const ld = lds.includes(leadsSel) ? leadsSel : (lds[0] ?? 4);
    setSeries(ser); setVoltageSel(v); setLeadsSel(ld); pickFirstPart(supplier, ser, v, ld);
  };
  const onVoltageChange = (v: number) => {
    const lds = leadsFor(supplier, series, v);
    const ld = lds.includes(leadsSel) ? leadsSel : (lds[0] ?? 4);
    setVoltageSel(v); setLeadsSel(ld); pickFirstPart(supplier, series, v, ld);
  };
  const onLeadsChange = (ld: number) => { setLeadsSel(ld); pickFirstPart(supplier, series, voltageSel, ld); };

  const catalogPart: DcLinkCapacitor | undefined = useMemo(
    () => partList.find((p) => p.partNumber === partNumber) ?? partList[0],
    [partList, partNumber]
  );

  // The active capacitor (catalog or custom).
  const cap = useMemo(() => {
    if (capMode === 'custom') {
      return {
        partNumber: customPartRef || 'Custom',
        capacitanceUf: customCapUf, ratedVoltageVdc: customRatedV, esrMohm: customEsrMohm, eslNh: customEslNh,
        irmsRatedA: customIrmsA, rthCW: customRthCW,
        boxLengthMm: customLmm, boxThicknessMm: customTmm, boxHeightMm: customHmm,
      };
    }
    if (!catalogPart) return null;
    return {
      partNumber: catalogPart.partNumber, capacitanceUf: catalogPart.capacitanceUf,
      ratedVoltageVdc: catalogPart.ratedVoltageVdc, esrMohm: catalogPart.esrMohm, eslNh: catalogPart.eslNh,
      irmsRatedA: catalogPart.irmsRatedA, rthCW: catalogPart.rthCW,
      boxLengthMm: catalogPart.boxLengthMm, boxThicknessMm: catalogPart.boxThicknessMm, boxHeightMm: catalogPart.boxHeightMm,
    };
  }, [capMode, catalogPart, customPartRef, customCapUf, customRatedV, customEsrMohm, customEslNh, customIrmsA, customRthCW, customLmm, customTmm, customHmm]);

  // Peak capacitor voltage = DC bus + half the pk-pk ripple. Datasheets state the
  // peak voltage (DC + superimposed ripple) must not exceed the rated voltage.
  const peakVoltageV = busVoltageV + rippleVoltagePkPkV / 2;

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
      capUf: cap.capacitanceUf, ratedVoltageVdc: cap.ratedVoltageVdc, esrMohm: cap.esrMohm, eslNh: cap.eslNh,
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

  const optResults = useMemo(() => {
    if (!optimizeEnabled || sizing.requiredCapacitanceUf <= 0) return [];
    return optimizeDcLinkBank(DC_LINK_CAPACITORS, {
      requiredCapacitanceUf: sizing.requiredCapacitanceUf,
      rippleCurrentRmsA: sizing.rippleCurrentRmsA,
      peakVoltageV, ambientTempC, coolingMethod, conductionRthCW, spacingMm,
      maxWidthMm, maxDepthMm, maxHeightMm, maxHotSpotTempC: optMaxHotSpotC, objective: optObjective,
    });
  }, [optimizeEnabled, sizing, peakVoltageV, ambientTempC, coolingMethod, conductionRthCW, spacingMm, maxWidthMm, maxDepthMm, maxHeightMm, optMaxHotSpotC, optObjective]);

  const applyCandidate = (c: OptimizeCandidate) => {
    setCapMode('catalog');
    setSupplier(c.cap.supplier);
    setSeries(c.cap.series);
    setVoltageSel(c.cap.ratedVoltageVdc);
    setLeadsSel(c.cap.leads);
    setPartNumber(c.cap.partNumber);
    setColumns(c.columns);
  };

  // Switching overshoot: the commutation-loop inductance (entered, or from
  // busbar geometry + module ESL + the cap bank ESL) times the turn-off di/dt.
  const bankEslNh = bank?.bankEslNh ?? 0;
  const loopInductanceTotalNh = loopMode === 'geometry'
    ? busbarLoopInductanceNh(busbarLenMm, busbarWidthMm, busbarSepMm) + moduleEslNh + bankEslNh
    : loopInductanceNh;
  const diDtAPerUs = didtMode === 'derived' ? diDtFromFallTime(switchedCurrentA, fallTimeNs) : didtDirectAPerUs;
  const overshoot = useMemo(() => solveSwitchingOvershoot({
    busVoltageV, rippleVoltagePkPkV, loopInductanceNh: loopInductanceTotalNh, bankEslNh, diDtAPerUs,
  }), [busVoltageV, rippleVoltagePkPkV, loopInductanceTotalNh, bankEslNh, diDtAPerUs]);
  const busbarOnlyNh = loopMode === 'geometry' ? busbarLoopInductanceNh(busbarLenMm, busbarWidthMm, busbarSepMm) : 0;

  const actualResonanceHz = useMemo(() => (bank ? resonanceHz(cableInductanceUh * 1e-6, bank.totalCapacitanceUf) : Infinity), [bank, cableInductanceUh]);
  const maxOpV = cap ? maxOperatingVoltage(cap.ratedVoltageVdc, bank?.hotSpotTempC ?? ambientTempC) : 0;
  const hotRow = bank ? Math.min(Math.floor(bank.rows / 2), bank.rows - 1) : 0;
  const hotColumn = bank ? Math.min(Math.floor(bank.columnsUsed / 2), (hotRow === bank.rows - 1 ? bank.lastRowCount : bank.columnsUsed) - 1) : 0;

  // ── Checks ──
  const checks = useMemo(() => {
    const out: { severity: 'pass' | 'warn' | 'fail'; label: string; detail: string }[] = [];
    if (!cap || !bank) return out;
    // Voltage rating — governed by the PEAK voltage (DC bus + ½·ripple), which
    // the datasheets state must not exceed the rated voltage.
    if (peakVoltageV > cap.ratedVoltageVdc) {
      out.push({ severity: 'fail', label: 'Voltage rating', detail: `Peak voltage ${fmt(peakVoltageV, 0)} V (bus ${fmt(busVoltageV, 0)} V + ½ ripple) exceeds the capacitor's ${fmt(cap.ratedVoltageVdc, 0)} V rating — the datasheet requires the peak (DC + ripple) to stay within V_rated. Choose a higher-voltage part.` });
    } else if (peakVoltageV > maxOpV) {
      out.push({ severity: 'warn', label: 'Voltage rating (hot)', detail: `Peak voltage ${fmt(peakVoltageV, 0)} V exceeds the temperature-derated limit ≈ ${fmt(maxOpV, 0)} V at ${fmt(bank.hotSpotTempC, 0)}°C hot spot (above 85°C the allowed voltage derates below V_rated). Reduce temperature or use a higher-voltage part.` });
    } else if (peakVoltageV > 0.8 * cap.ratedVoltageVdc) {
      out.push({ severity: 'warn', label: 'Voltage derating', detail: `Peak voltage ${fmt(peakVoltageV, 0)} V is above 80% of the ${fmt(cap.ratedVoltageVdc, 0)} V rating — within limits (surge to 1.5×V_rated is allowed only occasionally), but film-cap life is much longer at ≤0.8×V_rated.` });
    } else {
      out.push({ severity: 'pass', label: 'Voltage rating', detail: `Peak ${fmt(peakVoltageV, 0)} V (bus ${fmt(busVoltageV, 0)} V + ½ ripple) vs ${fmt(cap.ratedVoltageVdc, 0)} V rated (${fmt((peakVoltageV / cap.ratedVoltageVdc) * 100, 0)}% — good headroom).` });
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
    // Switching overshoot at the capacitor terminals (repetitive — every cycle,
    // so it must stay within the rated voltage, not rely on the surge allowance).
    if (overshoot.capPeakTransientV > cap.ratedVoltageVdc) {
      out.push({ severity: 'fail', label: 'Switching overshoot (cap)', detail: `The repetitive cap-terminal peak ${fmt(overshoot.capPeakTransientV, 0)} V (bus + ripple + ESL·di/dt) exceeds the ${fmt(cap.ratedVoltageVdc, 0)} V rating. Lower the bank ESL, reduce di/dt, or use a higher-voltage part.` });
    } else if (overshoot.capPeakTransientV > 0.9 * cap.ratedVoltageVdc) {
      out.push({ severity: 'warn', label: 'Switching overshoot (cap)', detail: `The repetitive cap-terminal peak ${fmt(overshoot.capPeakTransientV, 0)} V is within 10% of the ${fmt(cap.ratedVoltageVdc, 0)} V rating once the switching overshoot is added.` });
    }
    return out;
  }, [cap, bank, busVoltageV, peakVoltageV, maxOpV, switchingFreqKhz, cableInductanceUh, actualResonanceHz, overshoot]);

  const overallPass = checks.every((c) => c.severity !== 'fail');
  const failing = checks.filter((c) => c.severity === 'fail');
  const warnings = checks.filter((c) => c.severity === 'warn');

  // ── save/load ──
  const getInputs = useCallback((): Record<string, unknown> => ({
    busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh,
    capMode, supplier, series, voltageSel, leadsSel, partNumber,
    customCapUf, customRatedV, customEsrMohm, customEslNh, customIrmsA, customRthCW, customLmm, customTmm, customHmm, customPartRef,
    ambientTempC, coolingMethod, conductionRthCW, columns, spacingMm,
    optimizeEnabled, maxWidthMm, maxDepthMm, maxHeightMm, optMaxHotSpotC, optObjective,
    loopMode, loopInductanceNh, busbarLenMm, busbarWidthMm, busbarSepMm, moduleEslNh, didtMode, switchedCurrentA, fallTimeNs, didtDirectAPerUs,
  }), [busVoltageV, rippleVoltagePkPkV, outputFreqHz, switchingFreqKhz, phaseCurrentRmsA, powerFactor, modulationIndex, cableInductanceUh,
    capMode, supplier, series, voltageSel, leadsSel, partNumber, customCapUf, customRatedV, customEsrMohm, customEslNh, customIrmsA, customRthCW, customLmm, customTmm, customHmm, customPartRef,
    ambientTempC, coolingMethod, conductionRthCW, columns, spacingMm,
    optimizeEnabled, maxWidthMm, maxDepthMm, maxHeightMm, optMaxHotSpotC, optObjective,
    loopMode, loopInductanceNh, busbarLenMm, busbarWidthMm, busbarSepMm, moduleEslNh, didtMode, switchedCurrentA, fallTimeNs, didtDirectAPerUs]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    const set = <T,>(x: T | undefined | null, f: (val: T) => void) => { if (x != null) f(x); };
    set(v.busVoltageV, setBusVoltageV); set(v.rippleVoltagePkPkV, setRippleVoltagePkPkV); set(v.outputFreqHz, setOutputFreqHz);
    set(v.switchingFreqKhz, setSwitchingFreqKhz); set(v.phaseCurrentRmsA, setPhaseCurrentRmsA); set(v.powerFactor, setPowerFactor);
    set(v.modulationIndex, setModulationIndex); set(v.cableInductanceUh, setCableInductanceUh);
    set(v.capMode, setCapMode); set(v.supplier, setSupplier); set(v.series, setSeries); set(v.voltageSel, setVoltageSel); set(v.leadsSel, setLeadsSel); set(v.partNumber, setPartNumber);
    set(v.customCapUf, setCustomCapUf); set(v.customRatedV, setCustomRatedV); set(v.customEsrMohm, setCustomEsrMohm); set(v.customEslNh, setCustomEslNh); set(v.customIrmsA, setCustomIrmsA);
    set(v.customRthCW, setCustomRthCW); set(v.customLmm, setCustomLmm); set(v.customTmm, setCustomTmm); set(v.customHmm, setCustomHmm); set(v.customPartRef, setCustomPartRef);
    set(v.ambientTempC, setAmbientTempC); set(v.coolingMethod, setCoolingMethod); set(v.conductionRthCW, setConductionRthCW);
    set(v.columns, setColumns); set(v.spacingMm, setSpacingMm);
    set(v.optimizeEnabled, setOptimizeEnabled); set(v.maxWidthMm, setMaxWidthMm); set(v.maxDepthMm, setMaxDepthMm);
    set(v.maxHeightMm, setMaxHeightMm); set(v.optMaxHotSpotC, setOptMaxHotSpotC); set(v.optObjective, setOptObjective);
    set(v.loopMode, setLoopMode); set(v.loopInductanceNh, setLoopInductanceNh); set(v.busbarLenMm, setBusbarLenMm);
    set(v.busbarWidthMm, setBusbarWidthMm); set(v.busbarSepMm, setBusbarSepMm); set(v.moduleEslNh, setModuleEslNh);
    set(v.didtMode, setDidtMode); set(v.switchedCurrentA, setSwitchedCurrentA); set(v.fallTimeNs, setFallTimeNs); set(v.didtDirectAPerUs, setDidtDirectAPerUs);
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
    steps.push({
      title: 'Switching overshoot',
      formula: 'ΔV = L_loop·di/dt (device),  cap-terminal spike = ESL_bank·di/dt',
      substitution: `L_loop = ${fmt(loopInductanceTotalNh, 1)} nH, ESL_bank = ${fmt(bankEslNh, 1)} nH, di/dt = ${fmt(diDtAPerUs, 0)} A/µs`,
      result: `Device peak ${fmt(overshoot.devicePeakV, 0)} V (bus + ${fmt(overshoot.overshootDeviceV, 0)} V); cap-terminal peak ${fmt(overshoot.capPeakTransientV, 0)} V`,
    });
    return steps;
  }, [phaseCurrentRmsA, modulationIndex, powerFactor, sizing, switchingFreqKhz, rippleVoltagePkPkV, cableInductanceUh, bank, cap, coolingMethod, ambientTempC, life, busVoltageV, loopInductanceTotalNh, bankEslNh, diDtAPerUs, overshoot]);

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
      rows.push({ label: 'Peak capacitor voltage', value: `${fmt(peakVoltageV, 0)} V (bus ${fmt(busVoltageV, 0)} + ½ ripple) vs ${fmt(cap.ratedVoltageVdc, 0)} V rated` });
      rows.push({ label: 'Capacitor count', value: `${bank.count} × ${fmt(cap.capacitanceUf, 0)} µF = ${fmt(bank.totalCapacitanceUf, 0)} µF` });
      rows.push({ label: 'Bank ESR / ESL', value: `${fmt(bank.bankEsrMohm, 3)} mΩ / ${fmt(bank.bankEslNh, 1)} nH` });
      rows.push({ label: 'Estimated bank mass', value: `${fmt(bank.bankMassG, 0)} g` });
      rows.push({ label: 'Loss (per cap / total)', value: `${fmt(bank.lossPerCapW, 2)} W / ${fmt(bank.lossTotalW, 1)} W` });
      rows.push({ label: 'Worst-case hot spot', value: `${fmt(bank.hotSpotTempC, 0)}°C (${fmt(bank.hotSpotRiseC, 0)}°C rise)` });
      rows.push({ label: 'Envelope (W×D×H)', value: `${fmt(bank.envelopeWmm, 0)}×${fmt(bank.envelopeDmm, 0)}×${fmt(bank.envelopeHmm, 0)} mm (${bank.rows}×${bank.columnsUsed})` });
      if (life) rows.push({ label: 'Expected life', value: `${fmt(life.hours, 0)} h (${fmt(life.years, 1)} yr) — ${life.quality.label}` });
    }
    return [
      { heading: 'Sizing & bank', rows },
      { heading: 'Checks', rows: checks.map((c) => ({ label: `${c.severity === 'pass' ? '✓' : c.severity === 'warn' ? '⚠' : '✗'} ${c.label}`, value: c.detail })) },
    ];
  }, [sizing, bank, cap, life, checks, peakVoltageV, busVoltageV]);

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
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="PDF export">
            <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
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
                  <select value={supplier} onChange={(e) => onSupplierChange(e.target.value)}>
                    {CAP_SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Series (PP film)</label>
                  <select value={series} onChange={(e) => onSeriesChange(e.target.value)}>
                    {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Rated voltage (VDC)</label>
                  <select value={voltageSel} onChange={(e) => onVoltageChange(Number(e.target.value))}>
                    {voltageList.map((v) => <option key={v} value={v}>{v} V</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Mounting</label>
                  <select value={leadsSel} onChange={(e) => onLeadsChange(Number(e.target.value))} disabled={leadsList.length <= 1}>
                    {leadsList.map((l) => <option key={l} value={l}>Radial, {l}-lead</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Part (capacitance)</label>
                  <select value={catalogPart?.partNumber ?? ''} onChange={(e) => setPartNumber(e.target.value)}>
                    {partList.map((p) => <option key={p.partNumber} value={p.partNumber}>{fmt(p.capacitanceUf, p.capacitanceUf < 10 ? 2 : 0)} µF · {p.esrMohm} mΩ · {p.irmsRatedA} A · {p.partNumber}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="field"><label>Capacitance (µF)</label>{seriesNum(customCapUf, setCustomCapUf, { step: 1, min: 0.1 })}</div>
                <div className="field"><label>Rated voltage (VDC)</label>{seriesNum(customRatedV, setCustomRatedV, { step: 10, min: 1 })}</div>
                <div className="field"><label>ESR (mΩ)</label>{seriesNum(customEsrMohm, setCustomEsrMohm, { step: 0.1, min: 0.01 })}</div>
                <div className="field"><label>ESL (nH)</label>{seriesNum(customEslNh, setCustomEslNh, { step: 1, min: 0 })}</div>
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

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">4</span>Package optimizer
                <InfoTooltip>Search the whole capacitor database for the smallest bank that meets the required capacitance and ripple current and stays under a hot-spot-temperature target, while fitting inside a bounding envelope. Each candidate part is sized to its minimum feasible parallel count (raised only if needed to stay cool) in the most compact grid that fits.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" checked={optimizeEnabled} onChange={(e) => setOptimizeEnabled(e.target.checked)} style={{ width: 'auto' }} />
                Propose an optimum bank
              </label>
            </div>
            {optimizeEnabled && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Max width ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(maxWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setMaxWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  <span className="hint">0 = unconstrained.</span>
                </div>
                <div className="field">
                  <label>Max depth / length ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(maxDepthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setMaxDepthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Max height ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(maxHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setMaxHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Max hot-spot ({tempUnit})</label>
                  <input autoComplete="off" type="number" value={toDisplay(optMaxHotSpotC, unitSystem, UNIT_TEMP)} onChange={(e) => setOptMaxHotSpotC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Optimise for</label>
                  <select value={optObjective} onChange={(e) => setOptObjective(e.target.value as OptimizeObjective)}>
                    <option value="volume">Smallest volume</option>
                    <option value="area">Smallest board area</option>
                    <option value="count">Fewest capacitors</option>
                    <option value="mass">Lowest mass</option>
                    <option value="coolest">Lowest hot-spot temp</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">5</span>Switching overshoot
                <InfoTooltip>At turn-off the device current collapses at a rate di/dt; the commutation-loop inductance L_loop produces a spike ΔV = L·di/dt on top of the DC bus. The device sees the full loop spike; the capacitor sees only the part across its own ESL. L_loop can be entered directly or estimated from a laminated busbar's geometry plus the module and cap-bank ESL.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <label>Loop inductance</label>
              <div className="segmented">
                <button className={loopMode === 'direct' ? 'active' : ''} onClick={() => setLoopMode('direct')}>Enter total</button>
                <button className={loopMode === 'geometry' ? 'active' : ''} onClick={() => setLoopMode('geometry')}>From busbar</button>
              </div>
            </div>
            {loopMode === 'direct' ? (
              <div className="field">
                <label>Commutation-loop inductance (nH)</label>
                {seriesNum(loopInductanceNh, setLoopInductanceNh, { step: 1, min: 0 })}
                <span className="hint">Busbar + module + cap-bank ESL. Well-laminated EV inverter loops are ~10–30 nH.</span>
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="field"><label>Busbar length ({lenUnit})</label><input autoComplete="off" type="number" min={0} value={toDisplay(busbarLenMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBusbarLenMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field"><label>Busbar width ({lenUnit})</label><input autoComplete="off" type="number" min={0.1} value={toDisplay(busbarWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBusbarWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field"><label>Plate separation ({lenUnit})</label><input autoComplete="off" type="number" min={0.01} step={0.1} value={toDisplay(busbarSepMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBusbarSepMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                <div className="field"><label>Module stray ESL (nH)</label>{seriesNum(moduleEslNh, setModuleEslNh, { step: 1, min: 0 })}</div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="hint">Parallel-plate busbar {fmt(busbarOnlyNh, 1)} nH + module {fmt(moduleEslNh, 0)} nH + bank ESL {fmt(bankEslNh, 1)} nH = {fmt(loopInductanceTotalNh, 1)} nH total.</span>
                </div>
              </div>
            )}
            <div className="field" style={{ marginTop: '0.6rem' }}>
              <label>Current slew di/dt</label>
              <div className="segmented">
                <button className={didtMode === 'derived' ? 'active' : ''} onClick={() => setDidtMode('derived')}>From current &amp; fall time</button>
                <button className={didtMode === 'direct' ? 'active' : ''} onClick={() => setDidtMode('direct')}>Direct</button>
              </div>
            </div>
            {didtMode === 'derived' ? (
              <div className="grid grid-2">
                <div className="field">
                  <label>Switched current (A)</label>
                  {seriesNum(switchedCurrentA, setSwitchedCurrentA, { step: 10, min: 0 })}
                  <span className="hint">Peak phase ≈ {fmt(Math.SQRT2 * phaseCurrentRmsA, 0)} A.</span>
                </div>
                <div className="field">
                  <label>Current fall time (ns)</label>
                  {seriesNum(fallTimeNs, setFallTimeNs, { step: 5, min: 1 })}
                  <span className="hint">SiC ~20–50 ns, IGBT ~100–300 ns.</span>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>di/dt (A/µs)</label>
                {seriesNum(didtDirectAPerUs, setDidtDirectAPerUs, { step: 500, min: 0 })}
              </div>
            )}
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
              <div className="result-tile">
                <div className="label">Peak capacitor voltage<InfoTooltip>DC bus + ½ the pk-pk ripple. The datasheets require the peak voltage (DC + superimposed ripple) to stay within the rated voltage — so the ripple pushes the required voltage rating up, not just the DC bus.</InfoTooltip></div>
                <div className={`value ${cap && peakVoltageV > cap.ratedVoltageVdc ? 'neg' : cap && peakVoltageV > 0.8 * cap.ratedVoltageVdc ? 'warn' : 'pos'}`}>{fmt(peakVoltageV, 0)}<span className="unit">V</span></div>
                <div className="hint">{fmt(busVoltageV, 0)} V bus + {fmt(rippleVoltagePkPkV / 2, 1)} V{cap ? ` · rating ${fmt(cap.ratedVoltageVdc, 0)} V` : ''}</div>
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

          {optimizeEnabled && (
            <div className="card">
              <div className="card-title">
                <span>Proposed banks
                  <InfoTooltip>Ranked by your objective — each row is a different capacitor sized to its smallest bank that fits the envelope and stays under the hot-spot limit. "Use" applies it to the selection above.</InfoTooltip>
                </span>
              </div>
              {optResults.length === 0 ? (
                <p className="note" style={{ margin: 0 }}>No catalog part meets the capacitance, current and temperature within the given envelope. Loosen the envelope, raise the hot-spot limit, improve cooling, or widen the spacing.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Capacitor</th><th>N</th><th>Grid</th>
                        <th>Envelope ({lenUnit})</th><th>Vol (cm³)</th><th>Mass (g)</th><th>Hot spot</th><th>Total C</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {optResults.map((c, i) => (
                        <tr key={c.cap.partNumber} className={i === 0 ? 'pass' : undefined}>
                          <td style={{ whiteSpace: 'nowrap' }}>{c.cap.supplier} {c.cap.series}<br /><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{fmt(c.cap.capacitanceUf, c.cap.capacitanceUf < 10 ? 2 : 0)} µF · {c.cap.partNumber}</span></td>
                          <td>{c.count}</td>
                          <td>{c.rows}×{c.columns}</td>
                          <td>{fmtU(c.envelopeWmm, unitSystem, UNIT_LENGTH, 0)}×{fmtU(c.envelopeDmm, unitSystem, UNIT_LENGTH, 0)}×{fmtU(c.envelopeHmm, unitSystem, UNIT_LENGTH, 0)}</td>
                          <td>{fmt(c.volumeCm3, 0)}</td>
                          <td>{fmt(c.massG, 0)}</td>
                          <td>{fmtU(c.hotSpotTempC, unitSystem, UNIT_TEMP, 0)}{tempUnit}</td>
                          <td>{fmt(c.totalCapacitanceUf, 0)} µF</td>
                          <td><button className="btn small" onClick={() => applyCandidate(c)}>Use</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <span className="hint">Best per {optObjective === 'volume' ? 'smallest volume' : optObjective === 'area' ? 'smallest board area' : optObjective === 'count' ? 'fewest capacitors' : optObjective === 'mass' ? 'lowest mass' : 'lowest hot-spot'} highlighted. Top pick: {fmt(optResults[0].capDensityUfPerCm3, 2)} µF/cm³, ESR {fmt(optResults[0].bankEsrMohm, 3)} mΩ, ESL {fmt(optResults[0].bankEslNh, 1)} nH, {fmt(optResults[0].massG, 0)} g, loss {fmt(optResults[0].lossTotalW, 1)} W.</span>
                </div>
              )}
            </div>
          )}

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
                  <tr><td>Bank ESR / ESL</td><td>{fmt(bank.bankEsrMohm, 3)} mΩ / {fmt(bank.bankEslNh, 1)} nH <span className="hint">(N in parallel; interconnect/busbar adds to ESL)</span></td></tr>
                  <tr><td>Estimated bank mass</td><td>{fmt(bank.bankMassG, 0)} g ({fmt(bank.bankMassG / 1000, 2)} kg) <span className="hint">≈ box volume × 1.35 g/cm³</span></td></tr>
                  <tr><td>Total stored energy</td><td>{fmt(0.5 * bank.totalCapacitanceUf * 1e-6 * busVoltageV * busVoltageV, 1)} J</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="card-title">
              <span>Switching overshoot
                <InfoTooltip>ΔV = L_loop·di/dt. The device sees the full loop spike (compare against your switch's voltage rating); the capacitor sees only ESL_bank·di/dt on top of the DC bus and ripple. This repeats every cycle, so the cap-terminal peak must stay within the rating.</InfoTooltip>
              </span>
            </div>
            <table className="data-table">
              <tbody>
                <tr><td>di/dt</td><td>{fmt(diDtAPerUs, 0)} A/µs ({fmt(diDtAPerUs / 1000, 1)} kA/µs)</td></tr>
                <tr><td>Commutation-loop inductance</td><td>{fmt(loopInductanceTotalNh, 1)} nH{loopMode === 'geometry' ? ' (busbar + module + bank)' : ''}</td></tr>
                <tr><td>Device-side overshoot ΔV</td><td>{fmt(overshoot.overshootDeviceV, 0)} V → peak {fmt(overshoot.devicePeakV, 0)} V <span className="hint">(vs your switch rating)</span></td></tr>
                <tr>
                  <td>Cap-terminal peak (repetitive)</td>
                  <td className={cap && overshoot.capPeakTransientV > cap.ratedVoltageVdc ? 'fail' : cap && overshoot.capPeakTransientV > 0.9 * cap.ratedVoltageVdc ? undefined : 'pass'}>
                    {fmt(overshoot.capPeakTransientV, 0)} V <span className="hint">= bus + ½ ripple + {fmt(overshoot.capTerminalSpikeV, 0)} V ESL spike{cap ? ` · rating ${fmt(cap.ratedVoltageVdc, 0)} V` : ''}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <span className="hint">The device-side overshoot sizes the switch/module voltage margin (out of scope here); the cap only sees the ESL·di/dt part. Minimise L_loop with a low-inductance laminated busbar and place the caps close to the switches.</span>
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Voltage rating: the capacitor's rated voltage is a PEAK limit for the (non-reversing) DC-link waveform —
          the KEMET datasheet states "the peak voltage shall not exceed the rated voltage VNDC," and TDK defines its
          rated voltage as the maximum operating peak voltage. So the governing voltage is V_peak = V_bus + ½·ΔV_pp
          (the ripple pushes the required rating up, not just the DC bus), and above 85 °C the permissible voltage
          derates below the rating (linear to ~0.7×V_rated at 105 °C). Occasional surges to ~1.5×V_rated are allowed
          (limited cycles), but continuous operation at ≤0.8×V_rated greatly extends life. Bank mass is estimated from
          the box envelope volume at an effective packaged density of 1.35 g/cm³ (film + resin + box + terminals) —
          an approximation; use the datasheet weight for precise figures. Bank ESR and ESL are the N-in-parallel
          combinations of the per-part values; real bank ESL is dominated by the busbar/interconnect layout, which is
          not included. Switching overshoot uses ΔV = L_loop·di/dt: the commutation-loop inductance (entered, or
          estimated from a laminated busbar as µ₀·separation·length/width plus the module and cap-bank ESL) times the
          turn-off current slew (from the commutated current and fall time, or entered directly). The device sees the
          full loop spike (compare against the switch's rating — out of scope here); the capacitor sees only the
          ESL_bank·di/dt portion added to the DC bus and ripple, and because it repeats every cycle it must stay within
          the rated voltage. This is a first-order lumped estimate — real overshoot also depends on damping, gate
          drive and ringing. {' '}
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
          estimate; the manufacturer's lifetime curve for the specific series governs. Capacitor parameters are
          transcribed from the manufacturer datasheets — KEMET C4AQ-M (F3125), KEMET C4AE (F3046) and TDK/EPCOS
          B3277x MKP DC-Link (MKP_B32774XYZ_778XYZ). Note the Irms rating basis differs by manufacturer: KEMET quotes
          the current for a 30 °C hot-spot rise, TDK for a 15 °C rise; the TDK parts' R_th is derived from R_th =
          ΔT/(ESR·Irms²) with ΔT = 15 °C (which cross-checks against KEMET for matching case sizes). The
          voltage-derating and life models are generic PP-film approximations. Verify against the current datasheets
          and, for critical designs, by test.
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
