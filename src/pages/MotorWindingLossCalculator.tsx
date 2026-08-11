import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useEntitlement } from '../lib/useEntitlement';
import PremiumGate from '../components/PremiumGate';
import ExportPdfButton from '../components/ExportPdfButton';
import CalculatorActions from '../components/CalculatorActions';
import GuideBacklink from '../components/GuideBacklink';
import InfoTooltip from '../components/InfoTooltip';
import SharedCalcBanner from '../components/SharedCalcBanner';
import SavedCalculations from '../components/SavedCalculations';
import BeamResponseChart from '../components/BeamResponseChart';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useShareableLink } from '../lib/useShareableLink';
import { fundamentalElectricalFreqHz } from '../lib/chokePhysics';
import {
  solveWindingLoss, estimateMltMm, type WindingWireType, type WindingGeom,
  type RoundAcMethod, type WindingLossInput,
} from '../lib/motorWindingLossPhysics';

const COPPER_RHO20 = 0.0172; // Ω·mm²/m, matches skinDepthPhysics.ts's copper preset
const COPPER_BETA = 234.5;

type FrequencySource = 'direct' | 'motor';
type MltMode = 'direct' | 'estimate';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

const WIRE_TYPE_LABELS: Record<WindingWireType, string> = {
  round: 'Round wire', flat: 'Flat / hairpin', litz: 'Litz wire',
};

export default function MotorWindingLossCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const { isPremium } = useEntitlement();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);
  const tempUnit = unitLabel(unitSystem, UNIT_TEMP);

  // Duty & frequency
  const [currentARms, setCurrentARms] = useState(250);
  const [tempC, setTempC] = useState(120);
  const [frequencySource, setFrequencySource] = useState<FrequencySource>('motor');
  const [directFrequencyHz, setDirectFrequencyHz] = useState(500);
  const [motorSpeedRpm, setMotorSpeedRpm] = useState(9000);
  const [motorPolePairs, setMotorPolePairs] = useState(4);
  const motorFrequencyHz = fundamentalElectricalFreqHz(motorSpeedRpm, motorPolePairs);
  const frequencyHz = frequencySource === 'direct' ? directFrequencyHz : motorFrequencyHz;

  // Winding
  const [wireType, setWireType] = useState<WindingWireType>('round');
  const [roundDiameterMm, setRoundDiameterMm] = useState(1.0);
  const [strandsInHand, setStrandsInHand] = useState(3);
  const [roundPorosity, setRoundPorosity] = useState(0.8);
  const [roundAcMethod, setRoundAcMethod] = useState<RoundAcMethod>('sullivan');
  const [flatWidthMm, setFlatWidthMm] = useState(6.0);
  const [flatHeightMm, setFlatHeightMm] = useState(2.5);
  const [litzStrandDiaMm, setLitzStrandDiaMm] = useState(0.2);
  const [litzStrandCount, setLitzStrandCount] = useState(100);
  const [seriesTurns, setSeriesTurns] = useState(8);
  const [nParallel, setNParallel] = useState(1);
  const [layersInSlot, setLayersInSlot] = useState(4);
  const [slotWidthMm, setSlotWidthMm] = useState(8);

  // MLT
  const [mltMode, setMltMode] = useState<MltMode>('direct');
  const [mltDirectMm, setMltDirectMm] = useState(350);
  const [boreDiameterMm, setBoreDiameterMm] = useState(180);
  const [stackLengthMm, setStackLengthMm] = useState(120);
  const [endWindingFactor, setEndWindingFactor] = useState(1.4);
  const mltEstimatedMm = estimateMltMm({ boreDiameterMm, stackLengthMm, polePairs: motorPolePairs, endWindingFactor });
  const mltMm = mltMode === 'direct' ? mltDirectMm : mltEstimatedMm;

  const geom: WindingGeom = useMemo(() => {
    if (wireType === 'round') return { kind: 'round', diameterMm: roundDiameterMm, strandsInHand, porosity: roundPorosity };
    if (wireType === 'flat') return { kind: 'flat', widthMm: flatWidthMm, heightMm: flatHeightMm };
    return { kind: 'litz', strandDiameterMm: litzStrandDiaMm, strandCount: litzStrandCount };
  }, [wireType, roundDiameterMm, strandsInHand, roundPorosity, flatWidthMm, flatHeightMm, litzStrandDiaMm, litzStrandCount]);

  const baseInput: Omit<WindingLossInput, 'frequencyHz'> = {
    wireType, geom, rho20OhmMm2PerM: COPPER_RHO20, betaC: COPPER_BETA, tempC,
    seriesTurns, nParallel, layersInSlot, slotWidthMm, roundPorosity, mltMm,
    currentARms, roundAcMethod: isPremium ? roundAcMethod : 'sullivan',
  };

  const result = useMemo(() => solveWindingLoss({ ...baseInput, frequencyHz }), [baseInput, frequencyHz]);

  // Premium frequency sweep
  const sweep = useMemo(() => {
    if (!isPremium) return null;
    const maxF = Math.max(frequencyHz * 3, 2000);
    const points = 40;
    const xs: number[] = [];
    const values: number[] = [];
    for (let i = 0; i <= points; i++) {
      const f = (maxF * i) / points;
      xs.push(f);
      values.push(solveWindingLoss({ ...baseInput, frequencyHz: f }).fR);
    }
    return { xs, values };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium, frequencyHz, JSON.stringify(baseInput)]);

  const getInputs = useCallback((): Record<string, unknown> => ({
    currentARms, tempC, frequencySource, directFrequencyHz, motorSpeedRpm, motorPolePairs,
    wireType, roundDiameterMm, strandsInHand, roundPorosity, roundAcMethod,
    flatWidthMm, flatHeightMm, litzStrandDiaMm, litzStrandCount,
    seriesTurns, nParallel, layersInSlot, slotWidthMm,
    mltMode, mltDirectMm, boreDiameterMm, stackLengthMm, endWindingFactor,
  }), [currentARms, tempC, frequencySource, directFrequencyHz, motorSpeedRpm, motorPolePairs,
    wireType, roundDiameterMm, strandsInHand, roundPorosity, roundAcMethod,
    flatWidthMm, flatHeightMm, litzStrandDiaMm, litzStrandCount,
    seriesTurns, nParallel, layersInSlot, slotWidthMm,
    mltMode, mltDirectMm, boreDiameterMm, stackLengthMm, endWindingFactor]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.currentARms != null) setCurrentARms(v.currentARms);
    if (v.tempC != null) setTempC(v.tempC);
    if (v.frequencySource) setFrequencySource(v.frequencySource);
    if (v.directFrequencyHz != null) setDirectFrequencyHz(v.directFrequencyHz);
    if (v.motorSpeedRpm != null) setMotorSpeedRpm(v.motorSpeedRpm);
    if (v.motorPolePairs != null) setMotorPolePairs(v.motorPolePairs);
    if (v.wireType) setWireType(v.wireType);
    if (v.roundDiameterMm != null) setRoundDiameterMm(v.roundDiameterMm);
    if (v.strandsInHand != null) setStrandsInHand(v.strandsInHand);
    if (v.roundPorosity != null) setRoundPorosity(v.roundPorosity);
    if (v.roundAcMethod) setRoundAcMethod(v.roundAcMethod);
    if (v.flatWidthMm != null) setFlatWidthMm(v.flatWidthMm);
    if (v.flatHeightMm != null) setFlatHeightMm(v.flatHeightMm);
    if (v.litzStrandDiaMm != null) setLitzStrandDiaMm(v.litzStrandDiaMm);
    if (v.litzStrandCount != null) setLitzStrandCount(v.litzStrandCount);
    if (v.seriesTurns != null) setSeriesTurns(v.seriesTurns);
    if (v.nParallel != null) setNParallel(v.nParallel);
    if (v.layersInSlot != null) setLayersInSlot(v.layersInSlot);
    if (v.slotWidthMm != null) setSlotWidthMm(v.slotWidthMm);
    if (v.mltMode) setMltMode(v.mltMode);
    if (v.mltDirectMm != null) setMltDirectMm(v.mltDirectMm);
    if (v.boreDiameterMm != null) setBoreDiameterMm(v.boreDiameterMm);
    if (v.stackLengthMm != null) setStackLengthMm(v.stackLengthMm);
    if (v.endWindingFactor != null) setEndWindingFactor(v.endWindingFactor);
  }, []);

  const saved = useSavedCalculations('motor-winding-loss');
  const shareLink = useShareableLink(restoreInputs);

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const kernelName = wireType === 'litz' ? "Sullivan & Zhang (2014)" : wireType === 'flat' ? "Dowell (1966)" : (isPremium && roundAcMethod === 'dowell' ? 'Dowell (1966), via equivalent foil' : 'Sullivan & Zhang (2014)');
    return [
      {
        title: 'DC resistance',
        formula: 'R_dc = ρ(T)·MLT·N / (A_strand·n_parallel)',
        substitution: `ρ(${fmt(tempC, 0)}°C) = ${fmt(result.rhoOhmMm2PerM, 5)} Ω·mm²/m, MLT = ${fmt(mltMm, 0)} mm, N = ${seriesTurns}, A = ${fmt(result.strandAreaMm2, 4)} mm²`,
        result: `R_dc = ${fmt(result.rdcOhm * 1000, 3)} mΩ`,
      },
      {
        title: `AC/DC resistance ratio (${kernelName})`,
        formula: wireType === 'litz'
          ? 'F_R = 1 + (π·n·N_s)²·d_s⁶ / (192·δ⁴·b²)'
          : (wireType === 'flat' || roundAcMethod === 'dowell')
            ? 'F_R = Δ·[(sinh2Δ+sin2Δ)/(cosh2Δ−cos2Δ) + (2/3)(m²−1)·(sinhΔ−sinΔ)/(coshΔ+cosΔ)]'
            : 'F_R = 1 + (π·N_s)²·d⁶ / (192·δ⁴·b²)',
        substitution: `δ(${fmt(frequencyHz, 0)} Hz) = ${fmt(result.skinDepthMmVal, 3)} mm${result.penetrationRatio != null ? `, Δ = ${fmt(result.penetrationRatio, 4)}` : ''}, m = ${layersInSlot} layers`,
        result: `F_R = ${fmt(result.fR, 4)}`,
      },
      {
        title: 'AC resistance & copper loss',
        formula: 'R_ac = F_R·R_dc,   P_cu = I_rms²·R_ac',
        substitution: `I_rms = ${fmt(currentARms, 0)} A`,
        result: `R_ac = ${fmt(result.racOhm * 1000, 3)} mΩ → P_cu = ${fmt(result.copperLossW, 1)} W`,
      },
    ];
  }, [result, wireType, roundAcMethod, isPremium, tempC, mltMm, seriesTurns, frequencyHz, layersInSlot, currentARms]);

  const inputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Winding',
    rows: [
      { label: 'Wire type', value: WIRE_TYPE_LABELS[wireType] },
      { label: 'Conductor geometry', value: wireType === 'round' ? `Ø${fmtU(roundDiameterMm, unitSystem, UNIT_LENGTH, 2)} ${lenUnit}, ${strandsInHand} strand(s) in hand`
        : wireType === 'flat' ? `${fmtU(flatWidthMm, unitSystem, UNIT_LENGTH, 2)}×${fmtU(flatHeightMm, unitSystem, UNIT_LENGTH, 2)} ${lenUnit}`
        : `${litzStrandCount}× Ø${fmtU(litzStrandDiaMm, unitSystem, UNIT_LENGTH, 3)} ${lenUnit} strands` },
      { label: 'Turns / layers in slot', value: `${seriesTurns} turns, ${layersInSlot} layers` },
      { label: 'Slot width / MLT', value: `${fmtU(slotWidthMm, unitSystem, UNIT_LENGTH, 1)} ${lenUnit} / ${fmtU(mltMm, unitSystem, UNIT_LENGTH, 0)} ${lenUnit}` },
      { label: 'Current / temperature', value: `${fmt(currentARms, 0)} A, ${fmtU(tempC, unitSystem, UNIT_TEMP, 0)}${tempUnit}` },
      { label: 'Frequency', value: frequencySource === 'direct' ? `${fmt(directFrequencyHz, 0)} Hz (direct)` : `${fmt(motorFrequencyHz, 0)} Hz (${motorSpeedRpm} rpm, ${motorPolePairs} pole pairs)` },
    ] as ReportRow[],
  }]), [wireType, roundDiameterMm, strandsInHand, flatWidthMm, flatHeightMm, litzStrandDiaMm, litzStrandCount, seriesTurns, layersInSlot, slotWidthMm, mltMm, currentARms, tempC, frequencySource, directFrequencyHz, motorFrequencyHz, motorSpeedRpm, motorPolePairs, unitSystem, lenUnit, tempUnit]);

  const outputSections: ReportSection[] = useMemo(() => ([{
    heading: 'Results',
    rows: [
      { label: 'Skin depth', value: `${fmt(result.skinDepthMmVal, 3)} mm` },
      { label: 'DC resistance', value: `${fmt(result.rdcOhm * 1000, 3)} mΩ` },
      { label: 'AC/DC ratio (F_R)', value: fmt(result.fR, 4) },
      { label: 'AC resistance', value: `${fmt(result.racOhm * 1000, 3)} mΩ` },
      { label: 'Copper loss', value: `${fmt(result.copperLossW, 1)} W` },
      ...(result.litzN1Max != null ? [{ label: 'Litz construction check', value: `n₁,max ≈ ${fmt(result.litzN1Max, 0)} — ${result.litzConstructionOk ? 'within safe first-twist strand count' : 'exceeds safe first-twist count; real F_R likely higher than the ideal value shown'}` }] : []),
    ] as ReportRow[],
  }]), [result]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Motor_Winding_Loss_Calculator',
      pageTitle: 'Motor Winding / AC Copper Loss',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Stator winding copper loss from a shared DC-resistance basis (ρ(T)·MLT·N/(A·n_parallel), reusing this site\'s copper resistivity/temperature data) plus an AC-resistance inflation factor F_R=Rac/Rdc. Round wire and litz wire use Sullivan & Zhang\'s closed-form single-term proximity formula (APEC 2014); flat/hairpin conductors and round wire in the premium "full Dowell" mode use Dowell\'s classical m-layer foil-winding equation (1966), with round wire converted to an equivalent foil via a porosity factor. All formulas assume a 1-D field building uniformly across the slot width, with every conductor in the slot carrying equal current — circulating currents between parallel winding paths (a real and sometimes dominant AC loss mechanism in badly-transposed hairpin windings) are NOT modelled and require FEA. Layers-in-slot (m) counts distinct radial conductor positions in the field-build direction; conductors side-by-side at the same position add DC copper area but are not separately modelled as additional proximity-coupled layers. Litz wire\'s bundle-level construction check flags when the strand count exceeds what a single twisting operation can safely combine (Sullivan & Zhang eq. 4/16) — beyond that, real AC resistance will exceed the ideal value shown. Verify against FEA or measurement for a final design.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header page-header-actions">
        <div>
          <div className="eyebrow">● Motor Winding / AC Copper Loss</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            Motor Winding / AC Copper Loss
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--warn, #f59e0b)', border: '1px solid var(--warn, #f59e0b)', borderRadius: 'var(--radius-pill, 9999px)', padding: '0.15rem 0.6rem' }}>
              Work in progress
            </span>
          </h1>
          <p>
            DC and AC-inflated copper loss for a motor stator winding — round magnet wire, flat/hairpin
            conductors, or litz wire — from skin and proximity effect (Dowell's equation and Sullivan &amp;
            Zhang's closed-form litz/round-wire method). Pairs with the Skin Depth and MOSFET Loss calculators.
          </p>
          <p className="note" style={{ borderLeft: '3px solid var(--warn, #f59e0b)', paddingLeft: '0.6rem', margin: '0.4rem 0 0' }}>
            <b>Work in progress:</b> this calculator is still being validated and refined — treat its results as
            indicative and cross-check anything design-critical against FEA or measurement. It also does not yet
            model circulating currents between parallel winding paths (a separate calculator is planned for that).
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <ExportPdfButton onClick={handleExportPdf} />
        </CalculatorActions>
      </div>

      <SharedCalcBanner show={shareLink.isViewingShared} onDismiss={shareLink.dismiss} />

      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Wire type &amp; geometry</span></div>
            <div className="segmented" style={{ marginBottom: '0.75rem' }}>
              {(Object.keys(WIRE_TYPE_LABELS) as WindingWireType[]).map((t) => (
                <button key={t} className={wireType === t ? 'active' : ''} onClick={() => setWireType(t)}>{WIRE_TYPE_LABELS[t]}</button>
              ))}
            </div>

            {wireType === 'round' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Wire diameter ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.05} step={0.05} value={toDisplay(roundDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setRoundDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Strands in hand<InfoTooltip>Parallel round wires wound together sharing the current. Adds DC copper area; each strand's own proximity coupling to neighbours at the same slot position is not separately modelled (see assumptions note).</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={1} step={1} value={strandsInHand} onChange={(e) => setStrandsInHand(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
                <div className="field">
                  <label>Layer porosity (0-1)<InfoTooltip>How tightly the round wires fill each layer across the slot width — 1.0 = solid foil, lower = more gaps between wires. 0.8 is a reasonable default without full slot CAD.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0.1} max={1} step={0.05} value={roundPorosity} onChange={(e) => setRoundPorosity(Math.min(1, Math.max(0.05, Number(e.target.value))))} />
                </div>
                <div className="field">
                  <label>AC method<InfoTooltip>Sullivan's closed form is accurate and simple when the wire diameter is smaller than the skin depth (the usual EV traction case). Dowell's full equation (Premium) converts the wire layer to an equivalent foil and stays valid at any diameter-to-skin-depth ratio.</InfoTooltip></label>
                  {isPremium ? (
                    <select value={roundAcMethod} onChange={(e) => setRoundAcMethod(e.target.value as RoundAcMethod)}>
                      <option value="sullivan">Sullivan (closed form)</option>
                      <option value="dowell">Dowell (full equation)</option>
                    </select>
                  ) : (
                    <select disabled value="sullivan"><option value="sullivan">Sullivan (closed form)</option></select>
                  )}
                </div>
              </div>
            )}

            {wireType === 'flat' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Conductor width ({lenUnit})<InfoTooltip>Dimension along the slot width (tangential direction).</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0.5} step={0.1} value={toDisplay(flatWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFlatWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Conductor height ({lenUnit})<InfoTooltip>Dimension along the slot depth — the field-build direction. This is the dominant driver of AC loss: thinner (radially) hairpins have much lower proximity loss.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={0.2} step={0.1} value={toDisplay(flatHeightMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setFlatHeightMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              </div>
            )}

            {wireType === 'litz' && (
              <div className="grid grid-2">
                <div className="field">
                  <label>Strand diameter ({lenUnit})</label>
                  <input autoComplete="off" type="number" min={0.02} step={0.01} value={toDisplay(litzStrandDiaMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setLitzStrandDiaMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
                <div className="field">
                  <label>Strand count<InfoTooltip>Number of individually-insulated strands twisted/bunched together in the bundle. More strands cut strand-level skin loss but a badly-transposed bundle with too many strands can develop bundle-level AC loss the ideal formula doesn't capture — see the construction check in the results.</InfoTooltip></label>
                  <input autoComplete="off" type="number" min={1} step={1} value={litzStrandCount} onChange={(e) => setLitzStrandCount(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
              </div>
            )}

            <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="field">
                <label>Series turns (N)</label>
                <input autoComplete="off" type="number" min={1} step={1} value={seriesTurns} onChange={(e) => setSeriesTurns(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
              <div className="field">
                <label>Layers in slot (m)<InfoTooltip>Number of distinct conductor positions stacked across the slot depth (the field-build direction) — this drives the proximity-effect term. Turns wound side-by-side at the same radial position don't count as extra layers.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={1} step={1} value={layersInSlot} onChange={(e) => setLayersInSlot(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
              <div className="field">
                <label>Slot width ({lenUnit})</label>
                <input autoComplete="off" type="number" min={1} step={0.5} value={toDisplay(slotWidthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setSlotWidthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
              <div className="field">
                <label>Parallel paths<InfoTooltip>Additional parallel current paths beyond strands-in-hand (e.g. parallel-wound coil groups). Affects DC resistance only.</InfoTooltip></label>
                <input autoComplete="off" type="number" min={1} step={1} value={nParallel} onChange={(e) => setNParallel(Math.max(1, Math.round(Number(e.target.value))))} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Duty &amp; frequency</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>RMS current (A)</label>
                <input autoComplete="off" type="number" min={0} step={5} value={currentARms} onChange={(e) => setCurrentARms(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Winding temperature ({tempUnit})</label>
                <input autoComplete="off" type="number" value={toDisplay(tempC, unitSystem, UNIT_TEMP)} onChange={(e) => setTempC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
            </div>
            <div className="segmented" style={{ margin: '0.5rem 0' }}>
              <button className={frequencySource === 'direct' ? 'active' : ''} onClick={() => setFrequencySource('direct')}>Direct entry</button>
              <button className={frequencySource === 'motor' ? 'active' : ''} onClick={() => setFrequencySource('motor')}>From motor speed</button>
            </div>
            {frequencySource === 'direct' ? (
              <div className="field">
                <label>Electrical frequency (Hz)</label>
                <input autoComplete="off" type="number" min={0} step={10} value={directFrequencyHz} onChange={(e) => setDirectFrequencyHz(Number(e.target.value))} />
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="field">
                  <label>Motor speed (rpm)</label>
                  <input autoComplete="off" type="number" min={0} step={100} value={motorSpeedRpm} onChange={(e) => setMotorSpeedRpm(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Pole pairs</label>
                  <input autoComplete="off" type="number" min={1} step={1} value={motorPolePairs} onChange={(e) => setMotorPolePairs(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
                <div className="hint" style={{ gridColumn: '1 / -1' }}>f = {fmt(motorSpeedRpm, 0)} rpm × {motorPolePairs} pole pairs / 60 = {fmt(motorFrequencyHz, 0)} Hz</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">3</span>Mean length per turn</span></div>
            <div className="segmented" style={{ marginBottom: '0.5rem' }}>
              <button className={mltMode === 'direct' ? 'active' : ''} onClick={() => setMltMode('direct')}>Direct entry</button>
              <button className={isPremium ? (mltMode === 'estimate' ? 'active' : '') : ''} onClick={() => isPremium && setMltMode('estimate')} disabled={!isPremium}>Estimate from geometry{!isPremium ? ' (Premium)' : ''}</button>
            </div>
            {mltMode === 'direct' ? (
              <div className="field">
                <label>MLT ({lenUnit})</label>
                <input autoComplete="off" type="number" min={1} step={5} value={toDisplay(mltDirectMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setMltDirectMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>
            ) : (
              <PremiumGate feature="MLT estimate from stator geometry">
                <div className="grid grid-2">
                  <div className="field"><label>Bore diameter ({lenUnit})</label><input autoComplete="off" type="number" min={10} step={5} value={toDisplay(boreDiameterMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setBoreDiameterMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                  <div className="field"><label>Stack length ({lenUnit})</label><input autoComplete="off" type="number" min={5} step={5} value={toDisplay(stackLengthMm, unitSystem, UNIT_LENGTH)} onChange={(e) => setStackLengthMm(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} /></div>
                  <div className="field"><label>End-winding factor<InfoTooltip>Typical 1.2-1.6 for form-wound coils (Pyrhonen, "Design of Rotating Electrical Machines"). Larger for more generous end-turn overhang.</InfoTooltip></label><input autoComplete="off" type="number" min={1} max={3} step={0.1} value={endWindingFactor} onChange={(e) => setEndWindingFactor(Number(e.target.value))} /></div>
                  <div className="hint" style={{ alignSelf: 'end' }}>MLT ≈ {fmt(mltEstimatedMm, 0)} mm</div>
                </div>
              </PremiumGate>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Copper loss</div>
                <div className="value">{fmt(result.copperLossW, 1)}<span className="unit">W</span></div>
                <div className="hint">at {fmt(currentARms, 0)} A, {fmt(frequencyHz, 0)} Hz</div>
              </div>
              <div className="result-tile">
                <div className="label">AC/DC resistance ratio</div>
                <div className={`value ${result.fR > 1.5 ? 'warn' : 'pos'}`}>{fmt(result.fR, 3)}</div>
                <div className="hint">F_R = R_ac / R_dc</div>
              </div>
              <div className="result-tile">
                <div className="label">DC resistance</div>
                <div className="value">{fmt(result.rdcOhm * 1000, 3)}<span className="unit">mΩ</span></div>
                <div className="hint">at {fmt(tempC, 0)}°C</div>
              </div>
              <div className="result-tile">
                <div className="label">AC resistance</div>
                <div className="value">{fmt(result.racOhm * 1000, 3)}<span className="unit">mΩ</span></div>
                <div className="hint">skin depth {fmt(result.skinDepthMmVal, 2)} mm</div>
              </div>
            </div>
            {result.litzN1Max != null && (
              <div className={`note ${result.litzConstructionOk ? '' : 'warn'}`} style={{ marginTop: '0.75rem' }}>
                Litz construction check: safe first-twist strand count n₁,max ≈ {fmt(result.litzN1Max, 0)} — your {litzStrandCount}-strand bundle is
                {result.litzConstructionOk ? ' within it, so the ideal F_R above is a reasonable estimate.' : ' above it; a simply-twisted bundle this large will likely see a higher real AC resistance than the ideal value shown — consider a multi-operation (bunch-of-bunches) construction.'}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">AC/DC ratio vs frequency</div>
            <PremiumGate feature="Frequency sweep chart">
              {sweep && (
                <BeamResponseChart xs={sweep.xs} values={sweep.values} color="var(--accent)" unit="" valueLabel="F_R" decimals={3} />
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
        <GuideBacklink calculatorPath="/motor-winding-loss" />
        <p className="note">
          DC resistance R_dc = ρ(T)·MLT·N/(A_strand·n_parallel), reusing this site's copper resistivity and
          temperature-correction data. AC resistance is R_ac = F_R·R_dc, where F_R comes from one of two
          closed-form kernels depending on wire type: <strong>Sullivan &amp; Zhang's</strong> single-term proximity
          formula (round wire and litz — the small-Δ limit of Dowell's equation, and litz's standard closed form),
          or <strong>Dowell's</strong> classical m-layer foil-winding equation (flat/hairpin conductors directly,
          and round wire in the Premium "full Dowell" mode via an equivalent-foil conversion). "Layers in slot" (m)
          counts distinct radial conductor positions across the slot depth — the field-build direction that drives
          proximity loss; conductors side-by-side at the same position add DC copper area only.
          <strong> The model assumes every conductor in the slot carries equal series current</strong> — circulating
          currents between parallel winding paths, a real and sometimes dominant AC loss mechanism in
          badly-transposed hairpin windings, are not modelled and require FEA. Litz wire's bundle-level
          construction check flags when the strand count exceeds what a single twisting operation can safely
          combine — beyond that, real AC resistance will exceed the ideal value shown. Verify against FEA or
          measurement before finalizing a design.
        </p>
        <p className="note">
          <b>Validated:</b> the Dowell kernel reproduces its own known asymptotic limits exactly (F_R→1 as Δ→0;
          F_R→Δ·(1+⅔(m²−1)) at large Δ), and a hand-worked hairpin example (2.0 mm conductor height, 400 Hz,
          20°C → Δ=0.606) reproduces published-literature figures of F_R≈1.01 at a single layer and F_R≈1.24 at
          four layers. The round-wire Sullivan and Dowell kernels are cross-validated against each other — they
          agree to within 0.1% at low Δ across 1-8 layers, confirming Sullivan's formula as the correct small-Δ
          limit of Dowell's equation for this project's layer-count convention.
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
