import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_AREA } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import ChokeCoreCrossSection from '../components/ChokeCoreCrossSection';
import { renderChokeCoreProfileSvg } from '../lib/pdfDiagrams';
import {
  CORE_PROFILES,
  computeCoreGeometry,
  defaultDimensionsForProfile,
  type CoreProfileId,
  type CoreDimensions,
} from '../lib/chokeCoreGeometry';
import { CORE_MATERIAL_PRESETS, CISPR25_CLASSES } from '../lib/coreMaterials';
import {
  inductanceH,
  turnsRequired,
  peakFluxDensityT,
  requiredInductanceForRippleH,
  differentialRippleCurrentA,
  requiredInductanceForImpedanceH,
  achievedImpedanceOhm,
  coreLossDensityWPerM3,
  totalCoreLossW,
  fundamentalElectricalFreqHz,
  windingCopperAreaMm2,
  windowFillFactor,
} from '../lib/chokePhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

type ChokeMode = 'cm' | 'dm';
type TurnsConfig = 'passthrough' | 'wound';

export default function ChokeSizingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();

  const [chokeMode, setChokeMode] = useState<ChokeMode>('dm');

  // Core geometry
  const [profile, setProfile] = useState<CoreProfileId>('toroidal');
  const [dims, setDims] = useState<CoreDimensions>(defaultDimensionsForProfile('toroidal'));
  const handleProfileChange = (p: CoreProfileId) => {
    setProfile(p);
    setDims(defaultDimensionsForProfile(p));
  };
  const geometry = useMemo(() => computeCoreGeometry(dims), [dims]);

  // Core material
  const [materialId, setMaterialId] = useState('nanocrystalline');
  const [mur, setMur] = useState(60);
  const [bSat, setBSat] = useState(1.2);
  const [lossCoeffK, setLossCoeffK] = useState(6);
  const [lossExpFreq, setLossExpFreq] = useState(1.5);
  const [lossExpFlux, setLossExpFlux] = useState(2.0);
  const [saturationMarginPercent, setSaturationMarginPercent] = useState(85);
  const handleMaterialChange = (id: string) => {
    setMaterialId(id);
    const preset = CORE_MATERIAL_PRESETS.find((m) => m.id === id);
    if (preset) {
      setMur(preset.relativePermeability);
      setBSat(preset.saturationFluxDensityT);
      setLossCoeffK(preset.lossCoeffK);
      setLossExpFreq(preset.lossExpFreq);
      setLossExpFlux(preset.lossExpFlux);
    }
  };

  // Turns & topology
  const [turnsConfig, setTurnsConfig] = useState<TurnsConfig>('wound');
  const [turns, setTurns] = useState(30);
  const [phaseCount, setPhaseCount] = useState(3);
  const [busbarWidthMm, setBusbarWidthMm] = useState(20);
  const [busbarThicknessMm, setBusbarThicknessMm] = useState(5);
  const [conductorCrossSectionMm2, setConductorCrossSectionMm2] = useState(6);
  const effectiveTurns = turnsConfig === 'passthrough' ? 1 : Math.max(1, Math.round(turns));

  // Shared electrical operating point
  const [vDc, setVDc] = useState(400);
  const [switchingFreqHz, setSwitchingFreqHz] = useState(10000);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(6000);
  const f1Hz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);

  // DM-specific
  const [dcCurrentA, setDcCurrentA] = useState(300);
  const [targetRippleA, setTargetRippleA] = useState(20);
  const [dutyCycle, setDutyCycle] = useState(0.5);

  // CM-specific
  const [cisprClassId, setCisprClassId] = useState('class3');
  const [targetImpedanceOhm, setTargetImpedanceOhm] = useState(50);
  const [referenceFreqHz, setReferenceFreqHz] = useState(150000);
  const [imbalanceCurrentA, setImbalanceCurrentA] = useState(5);
  const handleCisprChange = (id: string) => {
    setCisprClassId(id);
    const preset = CISPR25_CLASSES.find((c) => c.id === id);
    if (preset) setTargetImpedanceOhm(preset.targetImpedanceOhm);
  };

  const getInputs = useCallback((): Record<string, unknown> => ({
    chokeMode, profile, dims, materialId, mur, bSat,
    lossCoeffK, lossExpFreq, lossExpFlux, saturationMarginPercent,
    turnsConfig, turns, phaseCount, busbarWidthMm, busbarThicknessMm, conductorCrossSectionMm2,
    vDc, switchingFreqHz, motorPolePairs, motorSpeedRpm,
    dcCurrentA, targetRippleA, dutyCycle,
    cisprClassId, targetImpedanceOhm, referenceFreqHz, imbalanceCurrentA,
  }), [chokeMode, profile, dims, materialId, mur, bSat,
    lossCoeffK, lossExpFreq, lossExpFlux, saturationMarginPercent,
    turnsConfig, turns, phaseCount, busbarWidthMm, busbarThicknessMm, conductorCrossSectionMm2,
    vDc, switchingFreqHz, motorPolePairs, motorSpeedRpm,
    dcCurrentA, targetRippleA, dutyCycle,
    cisprClassId, targetImpedanceOhm, referenceFreqHz, imbalanceCurrentA]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.chokeMode) setChokeMode(v.chokeMode);
    if (v.profile) setProfile(v.profile);
    if (v.dims) setDims(v.dims);
    if (v.materialId) setMaterialId(v.materialId);
    if (v.mur != null) setMur(v.mur);
    if (v.bSat != null) setBSat(v.bSat);
    if (v.lossCoeffK != null) setLossCoeffK(v.lossCoeffK);
    if (v.lossExpFreq != null) setLossExpFreq(v.lossExpFreq);
    if (v.lossExpFlux != null) setLossExpFlux(v.lossExpFlux);
    if (v.saturationMarginPercent != null) setSaturationMarginPercent(v.saturationMarginPercent);
    if (v.turnsConfig) setTurnsConfig(v.turnsConfig);
    if (v.turns != null) setTurns(v.turns);
    if (v.phaseCount != null) setPhaseCount(v.phaseCount);
    if (v.busbarWidthMm != null) setBusbarWidthMm(v.busbarWidthMm);
    if (v.busbarThicknessMm != null) setBusbarThicknessMm(v.busbarThicknessMm);
    if (v.conductorCrossSectionMm2 != null) setConductorCrossSectionMm2(v.conductorCrossSectionMm2);
    if (v.vDc != null) setVDc(v.vDc);
    if (v.switchingFreqHz != null) setSwitchingFreqHz(v.switchingFreqHz);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
    if (v.motorSpeedRpm != null) setMotorSpeedRpm(v.motorSpeedRpm);
    if (v.dcCurrentA != null) setDcCurrentA(v.dcCurrentA);
    if (v.targetRippleA != null) setTargetRippleA(v.targetRippleA);
    if (v.dutyCycle != null) setDutyCycle(v.dutyCycle);
    if (v.cisprClassId) setCisprClassId(v.cisprClassId);
    if (v.targetImpedanceOhm != null) setTargetImpedanceOhm(v.targetImpedanceOhm);
    if (v.referenceFreqHz != null) setReferenceFreqHz(v.referenceFreqHz);
    if (v.imbalanceCurrentA != null) setImbalanceCurrentA(v.imbalanceCurrentA);
  }, []);

  const saved = useSavedCalculations('choke-sizing');

  const materialEff = useMemo(
    () => ({ relativePermeability: mur, saturationFluxDensityT: bSat, lossCoeffK, lossExpFreq, lossExpFlux }),
    [mur, bSat, lossCoeffK, lossExpFreq, lossExpFlux]
  );

  // DM sizing
  const requiredLDm = requiredInductanceForRippleH(vDc, dutyCycle, targetRippleA, switchingFreqHz);
  const requiredNDm = turnsRequired(requiredLDm, geometry.effectiveAreaMm2, geometry.pathLengthMm, mur);
  const achievedLDm = inductanceH(geometry.effectiveAreaMm2, geometry.pathLengthMm, mur, effectiveTurns);
  const achievedRippleDm = differentialRippleCurrentA(vDc, dutyCycle, achievedLDm, switchingFreqHz);
  const peakCurrentDm = dcCurrentA + achievedRippleDm / 2;
  const bPeakDm = peakFluxDensityT(achievedLDm, effectiveTurns, peakCurrentDm, geometry.effectiveAreaMm2);

  // CM sizing
  const requiredLCm = requiredInductanceForImpedanceH(targetImpedanceOhm, referenceFreqHz);
  const requiredNCm = turnsRequired(requiredLCm, geometry.effectiveAreaMm2, geometry.pathLengthMm, mur);
  const achievedLCm = inductanceH(geometry.effectiveAreaMm2, geometry.pathLengthMm, mur, effectiveTurns);
  const achievedZCm = achievedImpedanceOhm(achievedLCm, referenceFreqHz);
  const bPeakCm = peakFluxDensityT(achievedLCm, effectiveTurns, imbalanceCurrentA, geometry.effectiveAreaMm2);

  const isDm = chokeMode === 'dm';
  const achievedL = isDm ? achievedLDm : achievedLCm;
  const requiredN = isDm ? requiredNDm : requiredNCm;
  const bPeak = isDm ? bPeakDm : bPeakCm;
  const satFraction = bSat > 0 ? bPeak / bSat : 0;
  const satPass = satFraction <= saturationMarginPercent / 100;

  const lossFreqKHz = switchingFreqHz / 1000;
  const lossDensityWPerM3 = coreLossDensityWPerM3(lossFreqKHz, bPeak, materialEff);
  const coreLossW = totalCoreLossW(lossDensityWPerM3, geometry.volumeMm3);

  const copperAreaMm2 = turnsConfig === 'passthrough'
    ? busbarWidthMm * busbarThicknessMm * phaseCount
    : windingCopperAreaMm2(effectiveTurns, conductorCrossSectionMm2);
  const fillFactor = windowFillFactor(copperAreaMm2, geometry.windowAreaMm2);
  const fillPass = fillFactor <= 0.4;
  const targetPass = isDm ? achievedRippleDm <= targetRippleA : achievedZCm >= targetImpedanceOhm;
  const overallPass = satPass && fillPass && targetPass;

  const profileLabel = CORE_PROFILES.find((p) => p.id === profile)?.label ?? profile;
  const materialLabel = CORE_MATERIAL_PRESETS.find((m) => m.id === materialId)?.label ?? materialId;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      {
        title: 'Core geometry (simplified 2D profile)',
        formula: profile === 'toroidal'
          ? 'Ae = h·(OD−ID)/2,  le = π·(OD+ID)/2,  Wa = π·(ID/2)²'
          : profile === 'oval'
          ? 'Ae = h·(ro−ri),  le = 2s + π·(ro+ri),  Wa = 2·ri·s + π·ri²'
          : profile === 'ucore'
          ? 'Ae = a·d,  le = 2·(hw+ww),  Wa = hw·ww  (rectangular-loop approximation)'
          : 'Ae = a·d,  le = 2·hw+ww,  Wa = 2·hw·ww  (rectangular-loop approximation, flux splits through two outer legs)',
        substitution: `${profileLabel} profile as entered`,
        result: `Ae = ${fmt(geometry.effectiveAreaMm2, 2)} mm², le = ${fmt(geometry.pathLengthMm, 2)} mm, Wa = ${fmt(geometry.windowAreaMm2, 1)} mm²`,
      },
      {
        title: 'Reluctance-model inductance',
        formula: 'L = µ0·µr·Ae·N²/le',
        substitution: `µr = ${fmt(mur, 0)} (${materialLabel}), N = ${effectiveTurns}, Ae = ${fmt(geometry.effectiveAreaMm2, 2)} mm², le = ${fmt(geometry.pathLengthMm, 2)} mm`,
        result: `L = ${fmt(achievedL * 1e6, 3)} µH`,
      },
    ];

    if (isDm) {
      steps.push({
        title: 'DM ripple sizing (inverter-leg volt-second balance)',
        formula: 'L_required = Vdc·D·(1−D) / (ΔI_target·fsw)',
        substitution: `Vdc = ${fmt(vDc, 0)} V, D = ${fmt(dutyCycle, 2)}, ΔI_target = ${fmt(targetRippleA, 1)} A, fsw = ${fmt(switchingFreqHz / 1000, 1)} kHz`,
        result: `L_required = ${fmt(requiredLDm * 1e6, 3)} µH → N_required ≈ ${fmt(requiredNDm, 2)} turns (using N = ${effectiveTurns})`,
      });
      steps.push({
        title: 'Achieved ripple current with N turns',
        formula: 'ΔI = Vdc·D·(1−D) / (L·fsw)',
        substitution: `L = ${fmt(achievedLDm * 1e6, 3)} µH`,
        result: `ΔI = ${fmt(achievedRippleDm, 2)} A pk-pk, peak current = Idc + ΔI/2 = ${fmt(peakCurrentDm, 1)} A`,
      });
    } else {
      steps.push({
        title: 'CM impedance sizing',
        formula: 'L_required = Z_target / (2π·f_ref)',
        substitution: `Z_target = ${fmt(targetImpedanceOhm, 1)} Ω (${CISPR25_CLASSES.find((c) => c.id === cisprClassId)?.label ?? 'custom'}), f_ref = ${fmt(referenceFreqHz / 1000, 1)} kHz`,
        result: `L_required = ${fmt(requiredLCm * 1e6, 3)} µH → N_required ≈ ${fmt(requiredNCm, 2)} turns (using N = ${effectiveTurns})`,
      });
      steps.push({
        title: 'Achieved common-mode impedance with N turns',
        formula: '|Z| = 2π·f_ref·L',
        substitution: `L = ${fmt(achievedLCm * 1e6, 3)} µH, f_ref = ${fmt(referenceFreqHz / 1000, 1)} kHz`,
        result: `|Z| = ${fmt(achievedZCm, 1)} Ω vs target ${fmt(targetImpedanceOhm, 1)} Ω — ${achievedZCm >= targetImpedanceOhm ? 'pass' : 'fail'}`,
      });
    }

    steps.push({
      title: 'Saturation check',
      formula: 'B_peak = L·I_peak/(N·Ae),  margin = B_peak/Bsat',
      substitution: `I_peak = ${fmt(isDm ? peakCurrentDm : imbalanceCurrentA, 2)} A (${isDm ? 'Idc + ripple/2' : 'worst-case imbalance/common-mode current'}), Bsat = ${fmt(bSat, 2)} T`,
      result: `B_peak = ${fmt(bPeak, 3)} T (${fmt(satFraction * 100, 1)}% of Bsat) — ${satPass ? 'pass' : 'FAIL: exceeds ' + saturationMarginPercent + '% margin'}`,
    });

    steps.push({
      title: 'Core loss (Steinmetz estimate, representative coefficients)',
      formula: 'Pv [mW/cm³] = k·f[kHz]^a·B[T]^b,  P_core = Pv·Ve',
      substitution: `k=${fmt(lossCoeffK, 2)}, a=${fmt(lossExpFreq, 2)}, b=${fmt(lossExpFlux, 2)}, f=${fmt(lossFreqKHz, 1)} kHz, B=${fmt(bPeak, 3)} T, Ve=${fmt(geometry.volumeMm3, 0)} mm³`,
      result: `P_core ≈ ${fmt(coreLossW, 3)} W (${fmt(lossDensityWPerM3 / 1000, 2)} mW/cm³)`,
    });

    steps.push({
      title: 'Winding/window fit check',
      formula: turnsConfig === 'passthrough' ? 'A_cu = busbar width × thickness × phase count' : 'A_cu = N × conductor cross-section',
      substitution: turnsConfig === 'passthrough'
        ? `${fmt(busbarWidthMm, 1)}×${fmt(busbarThicknessMm, 1)} mm × ${phaseCount} busbars, Wa = ${fmt(geometry.windowAreaMm2, 1)} mm²`
        : `N=${effectiveTurns}, conductor = ${fmt(conductorCrossSectionMm2, 2)} mm², Wa = ${fmt(geometry.windowAreaMm2, 1)} mm²`,
      result: `Fill factor = ${fmt(fillFactor * 100, 1)}% — ${fillPass ? 'fits (typical guidance ≤ 40%)' : 'FAIL: exceeds typical 40% window fill guidance'}`,
    });

    if (!isDm) {
      steps.push({
        title: 'Fundamental electrical frequency (context only)',
        formula: 'f1 = (motor speed [rpm]/60) × pole pairs',
        substitution: `${fmt(motorSpeedRpm, 0)} rpm × ${motorPolePairs} pole pairs`,
        result: `f1 = ${fmt(f1Hz, 1)} Hz — CM noise and DM ripple sizing here use the switching frequency directly, not f1`,
      });
    }

    return steps;
  }, [
    profile, profileLabel, geometry, mur, materialLabel, effectiveTurns, achievedL, achievedLDm, isDm,
    vDc, dutyCycle, targetRippleA, switchingFreqHz, requiredLDm, requiredNDm, achievedRippleDm, peakCurrentDm,
    targetImpedanceOhm, cisprClassId, referenceFreqHz, requiredLCm, requiredNCm, achievedLCm, achievedZCm,
    bSat, bPeak, satFraction, satPass, saturationMarginPercent, imbalanceCurrentA,
    lossCoeffK, lossExpFreq, lossExpFlux, lossFreqKHz, coreLossW, lossDensityWPerM3,
    turnsConfig, busbarWidthMm, busbarThicknessMm, phaseCount, conductorCrossSectionMm2, fillFactor, fillPass,
    motorSpeedRpm, motorPolePairs, f1Hz,
  ]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Core geometry',
      rows: [
        { label: 'Profile', value: profileLabel },
        { label: 'Effective area (Ae)', value: `${fmtU(geometry.effectiveAreaMm2, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)}` },
        { label: 'Path length (le)', value: `${fmtU(geometry.pathLengthMm, unitSystem, UNIT_LENGTH, 3)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
        { label: 'Window area (Wa)', value: `${fmtU(geometry.windowAreaMm2, unitSystem, UNIT_AREA, 3)} ${unitLabel(unitSystem, UNIT_AREA)}` },
      ],
    },
    {
      heading: 'Core material',
      rows: [
        { label: 'Material', value: materialLabel },
        { label: 'Relative permeability', value: fmt(mur, 0) },
        { label: 'Saturation flux density', value: `${fmt(bSat, 2)} T` },
        { label: 'Saturation margin used', value: `${saturationMarginPercent}%` },
      ],
    },
    {
      heading: 'Turns & topology',
      rows: [
        { label: 'Configuration', value: turnsConfig === 'passthrough' ? 'Busbar pass-through' : 'Wound' },
        { label: 'Turns (N)', value: `${effectiveTurns}` },
        { label: 'Phase count', value: `${phaseCount}` },
      ],
    },
    {
      heading: 'Electrical operating point',
      rows: isDm
        ? [
          { label: 'DC bus voltage', value: `${fmt(vDc, 0)} V` },
          { label: 'DC / phase current', value: `${fmt(dcCurrentA, 1)} A` },
          { label: 'Target ripple current', value: `${fmt(targetRippleA, 1)} A pk-pk` },
          { label: 'Switching frequency', value: `${fmt(switchingFreqHz / 1000, 1)} kHz` },
          { label: 'Duty cycle', value: fmt(dutyCycle, 2) },
          { label: 'Motor speed / pole pairs', value: `${fmt(motorSpeedRpm, 0)} rpm / ${motorPolePairs}` },
        ]
        : [
          { label: 'DC bus voltage', value: `${fmt(vDc, 0)} V` },
          { label: 'Switching frequency', value: `${fmt(switchingFreqHz / 1000, 1)} kHz` },
          { label: 'EMC target', value: `${CISPR25_CLASSES.find((c) => c.id === cisprClassId)?.label ?? 'Custom'}` },
          { label: 'Reference frequency', value: `${fmt(referenceFreqHz / 1000, 1)} kHz` },
          { label: 'Target impedance', value: `${fmt(targetImpedanceOhm, 1)} Ω` },
          { label: 'Worst-case imbalance current', value: `${fmt(imbalanceCurrentA, 2)} A` },
        ],
    },
  ], [profileLabel, geometry, materialLabel, mur, bSat, saturationMarginPercent, turnsConfig, effectiveTurns, phaseCount, isDm, vDc, dcCurrentA, targetRippleA, switchingFreqHz, dutyCycle, motorSpeedRpm, motorPolePairs, cisprClassId, referenceFreqHz, targetImpedanceOhm, imbalanceCurrentA, unitSystem]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: isDm ? 'Differential-mode sizing result' : 'Common-mode sizing result',
      rows: isDm
        ? [
          { label: 'Required turns (for target ripple)', value: fmt(requiredNDm, 2) },
          { label: 'Achieved inductance', value: `${fmt(achievedLDm * 1e6, 3)} µH` },
          { label: 'Achieved ripple current', value: `${fmt(achievedRippleDm, 2)} A pk-pk` },
          { label: 'Peak current', value: `${fmt(peakCurrentDm, 1)} A` },
        ]
        : [
          { label: 'Required turns (for target impedance)', value: fmt(requiredNCm, 2) },
          { label: 'Achieved inductance', value: `${fmt(achievedLCm * 1e6, 3)} µH` },
          { label: 'Achieved impedance', value: `${fmt(achievedZCm, 1)} Ω` },
          { label: 'Pass vs target', value: achievedZCm >= targetImpedanceOhm ? 'Pass' : 'Fail' },
        ],
    },
    {
      heading: 'Saturation & loss',
      rows: [
        { label: 'Peak flux density', value: `${fmt(bPeak, 3)} T (${fmt(satFraction * 100, 1)}% of Bsat)` },
        { label: 'Saturation check', value: satPass ? 'Pass' : 'Fail' },
        { label: 'Core loss (estimate)', value: `${fmt(coreLossW, 3)} W` },
        { label: 'Window fill factor', value: `${fmt(fillFactor * 100, 1)}%` },
      ],
    },
  ], [isDm, requiredNDm, achievedLDm, achievedRippleDm, peakCurrentDm, requiredNCm, achievedLCm, achievedZCm, targetImpedanceOhm, bPeak, satFraction, satPass, coreLossW, fillFactor]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Choke_Sizing_Calculator',
      pageTitle: 'Choke Sizing Calculator (CM/DM)',
      accentHex,
      passStatus: { pass: overallPass, label: overallPass ? 'Meets target, saturation margin, and window fit guidance' : 'Fails target, saturation margin, or window fit guidance — review' },
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [
        { title: 'Core cross-section', svgMarkup: renderChokeCoreProfileSvg(dims, turnsConfig, effectiveTurns, accentHex) },
      ],
      disclaimer: 'Engineering estimation tool for EV motor-controller/inverter choke sizing. Toroidal and Oval/racetrack core geometry is exact closed-form from entered dimensions; U-core and E-core geometry is approximated as a simple rectangular magnetic loop (cross-check against manufacturer Ae/le/Wa data for a final design). Core loss uses a Steinmetz-style estimate with representative, editable coefficients, not manufacturer-verified loss curves. The CISPR 25 class selector sets a suggested starting target common-mode impedance — a filter-design rule of thumb, not a CISPR 25 clause value (CISPR 25 specifies conducted/radiated emission limits in dBµV, not component impedance); refine against an actual conducted-emissions measurement for final sign-off.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Choke Sizing Calculator</div>
          <h1>Choke Sizing Calculator (CM/DM)</h1>
          <p>
            Common-mode and differential-mode inductor sizing for an EV motor-controller (inverter) — core
            geometry from Toroidal, Oval/racetrack, U-core, or E-core profiles, busbar pass-through or wound
            turns, and sizing driven by ripple current or EMC impedance targets.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="PDF export">
            <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
      </div>

      <div className="card">
        <div className="segmented">
          <button className={chokeMode === 'dm' ? 'active' : ''} onClick={() => setChokeMode('dm')}>Differential Mode</button>
          <button className={chokeMode === 'cm' ? 'active' : ''} onClick={() => setChokeMode('cm')}>Common Mode</button>
        </div>
        <span className="hint">
          {isDm
            ? 'Differential-mode: sizes the choke against the load-current ripple target on each phase.'
            : 'Common-mode: sizes the choke against an EMC impedance target, driven by a small worst-case imbalance current since a balanced multi-phase choke has its load-current flux cancel.'}
        </span>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Core geometry</span></div>
            <div className="segmented">
              {CORE_PROFILES.map((p) => (
                <button key={p.id} className={profile === p.id ? 'active' : ''} onClick={() => handleProfileChange(p.id)}>{p.label}</button>
              ))}
            </div>
            <span className="hint">{CORE_PROFILES.find((p) => p.id === profile)?.description}</span>

            {dims.profile === 'toroidal' && (
              <div className="grid grid-3" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Outer diameter ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.outerDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, outerDiameterMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Inner diameter ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.innerDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, innerDiameterMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Height / stack ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.heightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, heightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
              </div>
            )}
            {dims.profile === 'oval' && (
              <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Straight section length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.straightLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, straightLengthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Height / stack ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.heightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, heightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Inner radius ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.innerRadiusMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, innerRadiusMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Outer radius ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.outerRadiusMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, outerRadiusMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
              </div>
            )}
            {dims.profile === 'ucore' && (
              <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Leg width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.legWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, legWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Stack depth ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.stackDepthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, stackDepthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Window height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.windowHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, windowHeightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Window width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.windowWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, windowWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
              </div>
            )}
            {dims.profile === 'ecore' && (
              <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="field">
                  <label>Center leg width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.centerLegWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, centerLegWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Stack depth ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.stackDepthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, stackDepthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Window height ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.windowHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, windowHeightMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
                <div className="field">
                  <label>Window width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input autoComplete="off" type="number" min={0} value={toDisplay(dims.windowWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setDims({ ...dims, windowWidthMm: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                </div>
              </div>
            )}

            <div className="grid grid-3" style={{ marginTop: '0.75rem' }}>
              <div className="result-tile">
                <div className="label">Ae</div>
                <div className="value">{fmtU(geometry.effectiveAreaMm2, unitSystem, UNIT_AREA, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_AREA)}</span></div>
              </div>
              <div className="result-tile">
                <div className="label">le</div>
                <div className="value">{fmtU(geometry.pathLengthMm, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
              </div>
              <div className="result-tile">
                <div className="label">Wa</div>
                <div className="value">{fmtU(geometry.windowAreaMm2, unitSystem, UNIT_AREA, 3)}<span className="unit">{unitLabel(unitSystem, UNIT_AREA)}</span></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Core material</span></div>
            <div className="field">
              <label>Material preset</label>
              <select value={materialId} onChange={(e) => handleMaterialChange(e.target.value)}>
                {CORE_MATERIAL_PRESETS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Relative permeability (µr)</label>
                <input autoComplete="off" type="number" min={1} value={mur} onChange={(e) => setMur(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Saturation flux density (T)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={bSat} onChange={(e) => setBSat(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>
                  Saturation margin (%)
                  <InfoTooltip>Peak flux density is checked against this fraction of Bsat, not 100% — leaves headroom for temperature drift, DC offset, and manufacturing tolerance.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={1} max={100} value={saturationMarginPercent} onChange={(e) => setSaturationMarginPercent(Number(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>
                  Loss coeff. k
                  <InfoTooltip>Steinmetz core-loss fit: Pv [mW/cm³] = k·f[kHz]^a·B[T]^b. These are representative/order-of-magnitude values, not manufacturer-verified loss curves — refine against a datasheet loss curve for a final design.</InfoTooltip>
                </label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={lossCoeffK} onChange={(e) => setLossCoeffK(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Freq. exponent (a)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={lossExpFreq} onChange={(e) => setLossExpFreq(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Flux exponent (b)</label>
                <input autoComplete="off" type="number" min={0} step={0.01} value={lossExpFlux} onChange={(e) => setLossExpFlux(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Turns &amp; topology</span></div>
            <div className="field">
              <label>Conductor configuration</label>
              <div className="segmented">
                <button className={turnsConfig === 'passthrough' ? 'active' : ''} onClick={() => setTurnsConfig('passthrough')}>Busbar pass-through</button>
                <button className={turnsConfig === 'wound' ? 'active' : ''} onClick={() => setTurnsConfig('wound')}>Wound</button>
              </div>
              <span className="hint">Pass-through fixes N=1 per busbar (a straight busbar through a core is a single-turn winding).</span>
            </div>
            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              {turnsConfig === 'wound' ? (
                <>
                  <div className="field">
                    <label>Turns (N)</label>
                    <input autoComplete="off" type="number" min={1} step={1} value={turns} onChange={(e) => setTurns(Number(e.target.value))} />
                    <span className="hint">Required for target: ≈ {fmt(requiredN, 2)} turns</span>
                  </div>
                  <div className="field">
                    <label>Conductor cross-section ({unitLabel(unitSystem, UNIT_AREA)})</label>
                    <input autoComplete="off" type="number" min={0} step={0.001} value={toDisplay(conductorCrossSectionMm2, unitSystem, UNIT_AREA)} onChange={(e) => setConductorCrossSectionMm2(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA))} />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Busbar width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0} value={toDisplay(busbarWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBusbarWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Busbar thickness ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input autoComplete="off" type="number" min={0} step={0.001} value={toDisplay(busbarThicknessMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBusbarThicknessMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </>
              )}
              <div className="field">
                <label>Phase count</label>
                <input autoComplete="off" type="number" min={1} step={1} value={phaseCount} onChange={(e) => setPhaseCount(Number(e.target.value))} />
                <span className="hint">Informational/report only — CM flux from all phases adds; DM flux uses the per-conductor N above.</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">4</span>Electrical operating point</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>DC bus voltage (V)</label>
                <input autoComplete="off" type="number" min={0} value={vDc} onChange={(e) => setVDc(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Switching frequency (kHz)</label>
                <input autoComplete="off" type="number" min={0} value={switchingFreqHz / 1000} onChange={(e) => setSwitchingFreqHz(Number(e.target.value) * 1000)} />
              </div>
              <div className="field">
                <label>Motor pole pairs</label>
                <input autoComplete="off" type="number" min={1} step={1} value={motorPolePairs} onChange={(e) => setMotorPolePairs(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Motor/generator speed (rpm)</label>
                <input autoComplete="off" type="number" min={0} value={motorSpeedRpm} onChange={(e) => setMotorSpeedRpm(Number(e.target.value))} />
                <span className="hint">f1 = {fmt(f1Hz, 1)} Hz (context only — ripple sizing uses switching frequency)</span>
              </div>
            </div>
          </div>

          {isDm ? (
            <div className="card">
              <div className="card-title"><span><span className="step-num">5</span>Differential-mode sizing</span></div>
              <div className="grid grid-2">
                <div className="field">
                  <label>DC / phase current (A)</label>
                  <input autoComplete="off" type="number" min={0} value={dcCurrentA} onChange={(e) => setDcCurrentA(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Target ripple current (A pk-pk)</label>
                  <input autoComplete="off" type="number" min={0} value={targetRippleA} onChange={(e) => setTargetRippleA(Number(e.target.value))} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Duty cycle</label>
                  <input autoComplete="off" type="number" min={0} max={1} step={0.01} value={dutyCycle} onChange={(e) => setDutyCycle(Number(e.target.value))} />
                  <span className="hint">Worst-case ripple occurs near D≈0.5, regardless of absolute motor speed.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-title"><span><span className="step-num">5</span>Common-mode sizing (EMC)</span></div>
              <div className="field">
                <label>
                  CISPR 25 class (suggested starting target)
                  <InfoTooltip>Sets a suggested starting target common-mode impedance at the reference frequency — a filter-design rule of thumb, not a direct CISPR 25 clause value (CISPR 25 itself specifies conducted/radiated emission limits in dBµV, not component impedance). Refine against an actual conducted-emissions measurement.</InfoTooltip>
                </label>
                <select value={cisprClassId} onChange={(e) => handleCisprChange(e.target.value)}>
                  {CISPR25_CLASSES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
                <div className="field">
                  <label>Target impedance (Ω)</label>
                  <input autoComplete="off" type="number" min={0} value={targetImpedanceOhm} onChange={(e) => setTargetImpedanceOhm(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Reference frequency (kHz)</label>
                  <input autoComplete="off" type="number" min={0} value={referenceFreqHz / 1000} onChange={(e) => setReferenceFreqHz(Number(e.target.value) * 1000)} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Worst-case imbalance/common-mode current (A)
                    <InfoTooltip>A correctly wound, balanced multi-phase CM choke has its load-current flux cancel — only DC imbalance or common-mode noise current produces net core flux. Default to a small value (a few % of DC bus current); edit for your application.</InfoTooltip>
                  </label>
                  <input autoComplete="off" type="number" min={0} step={0.1} value={imbalanceCurrentA} onChange={(e) => setImbalanceCurrentA(Number(e.target.value))} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — diagram + results */}
        <div>
          <div className="card">
            <div className="card-title">Core cross-section</div>
            <ChokeCoreCrossSection dims={dims} turnsConfig={turnsConfig} turns={effectiveTurns} />
          </div>

          <div className="card">
            <div className="card-title">Results</div>

            <div className={`status-banner ${overallPass ? 'pass' : 'fail'}`}>
              {overallPass ? '✓ Meets target, saturation margin, and window fit guidance' : '✗ Fails target, saturation margin, or window fit guidance'}
            </div>

            <div className="result-grid">
              <div className="result-tile">
                <div className="label">{isDm ? 'Required turns (ripple target)' : 'Required turns (impedance target)'}</div>
                <div className="value">{fmt(requiredN, 2)}<span className="unit">turns</span></div>
                <div className="hint">using N = {effectiveTurns}</div>
              </div>
              <div className="result-tile">
                <div className="label">Achieved inductance</div>
                <div className="value">{fmt(achievedL * 1e6, 3)}<span className="unit">µH</span></div>
              </div>
              {isDm ? (
                <div className="result-tile">
                  <div className="label">Achieved ripple</div>
                  <div className="value">{fmt(achievedRippleDm, 2)}<span className="unit">A pk-pk</span></div>
                  <div className="hint">peak current {fmt(peakCurrentDm, 1)} A</div>
                </div>
              ) : (
                <div className="result-tile">
                  <div className="label">Achieved impedance</div>
                  <div className={`value ${achievedZCm >= targetImpedanceOhm ? 'pos' : 'neg'}`}>{fmt(achievedZCm, 1)}<span className="unit">Ω</span></div>
                  <div className="hint">target {fmt(targetImpedanceOhm, 1)} Ω</div>
                </div>
              )}
              <div className="result-tile">
                <div className="label">Peak flux density</div>
                <div className={`value ${satPass ? 'pos' : 'neg'}`}>{fmt(bPeak, 3)}<span className="unit">T</span></div>
                <div className="hint">{fmt(satFraction * 100, 1)}% of Bsat ({fmt(bSat, 2)} T)</div>
              </div>
              <div className="result-tile">
                <div className="label">Core loss (estimate)</div>
                <div className="value">{fmt(coreLossW, 3)}<span className="unit">W</span></div>
                <div className="hint">{fmt(lossDensityWPerM3 / 1000, 2)} mW/cm³</div>
              </div>
              <div className="result-tile">
                <div className="label">Window fill factor</div>
                <div className={`value ${fillPass ? 'pos' : 'neg'}`}>{fmt(fillFactor * 100, 1)}<span className="unit">%</span></div>
                <div className="hint">typical guidance ≤ 40%</div>
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
          Toroidal and Oval/racetrack core geometry is exact closed-form from the entered dimensions.
          U-core and E-core geometry is approximated as a simple rectangular magnetic loop — real datasheets
          publish part-specific Ae/le/Wa, and there is no single universal formula for those families the
          way there is for a toroid, so cross-check against manufacturer data for a final design. Toroidal
          Ae assumes a rectangular (square-cut) annulus — exact for ferrite/tape-wound/nanocrystalline
          toroids; rounded-cross-section powder toroids (MPP/Kool Mµ) typically have ~15-30% less real Ae
          than this estimate for the same OD/ID/height. Core loss uses a Steinmetz-style estimate with
          representative, editable coefficients, not manufacturer-verified loss curves. The CISPR 25 class
          selector sets a suggested starting target common-mode impedance — a filter-design rule of thumb,
          not a direct CISPR 25 clause value. CM saturation is driven by a user-editable worst-case DC
          imbalance/common-mode current, since a correctly wound balanced multi-phase CM choke has its
          load-current flux cancel. Treat this as a screening/estimation tool, not a substitute for
          prototype/EMC test-house qualification.
        </p>
        <p className="note">
          <b>Validated:</b> every closed-form formula (reluctance-model inductance L=µ₀µᵣAₑN²/lₑ, turns count,
          peak flux density, DM ripple sizing, CM impedance sizing, and Steinmetz core loss) was checked against
          an independent hand re-derivation and matched exactly, and the inverse pairs (turns↔inductance,
          ripple↔inductance, impedance↔inductance) all round-trip back to their inputs exactly. Toroidal core
          geometry (Ae, lₑ, window area) matches the standard published toroid formulas by hand for a 30/15/10 mm
          OD/ID/height example exactly.
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
