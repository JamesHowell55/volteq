import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_TEMP, UNIT_PRESSURE } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import InfoTooltip from '../components/InfoTooltip';
import ORingGlandDiagram from '../components/ORingGlandDiagram';
import { fitDeviationsMm, HOLE_FITS, SHAFT_FITS } from '../lib/isoFits';
import {
  ORING_CROSS_SECTIONS,
  ORING_MATERIALS,
  getORingMaterial,
  sizesForCrossSection,
  crossSectionToleranceMm,
  insideDiameterToleranceMm,
  grooveRecommendationForCs,
  type ToleranceClass,
  type ORingSize,
} from '../lib/oringData';
import {
  solveORingSeal,
  roundedRectPerimeterMm,
  type SealType,
  type DutyType,
  type PressureDirection,
  type Dim,
  type ORingSealInput,
} from '../lib/oringPhysics';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtU(valueSI: number, unitSystem: ReturnType<typeof useUnitSystem>['unitSystem'], def: Parameters<typeof toDisplay>[2], digits = 2): string {
  return fmt(toDisplay(valueSI, unitSystem, def), digits);
}

// A toleranced dimension's editable state: nominal (mm), and either an ISO 286
// fit designation or custom +/− deviations (mm, magnitudes).
interface DimState {
  nom: number;
  mode: 'iso' | 'custom';
  fit: string;
  plus: number;
  minus: number;
}

function makeDim(nom: number, fit: string | null, plus = 0.1, minus = 0.1): DimState {
  return { nom, mode: fit ? 'iso' : 'custom', fit: fit ?? 'H8', plus, minus };
}

function resolveDim(d: DimState): Dim {
  if (d.mode === 'iso') {
    const dev = fitDeviationsMm(d.fit, d.nom);
    if (dev) return { nom: d.nom, upper: dev.upperMm, lower: dev.lowerMm };
  }
  return { nom: d.nom, upper: Math.abs(d.plus), lower: -Math.abs(d.minus) };
}

const SEAL_TYPE_LABELS: Record<SealType, string> = {
  outerRadial: 'Outer radial (piston)',
  innerRadial: 'Inner radial (rod)',
  axialFace: 'Axial face',
  nonCircularFace: 'Axial face — non-circular',
};

export default function ORingCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();
  const { unitSystem } = useUnitSystem();
  const lenUnit = unitLabel(unitSystem, UNIT_LENGTH);

  const [sealType, setSealType] = useState<SealType>('outerRadial');
  const [duty, setDuty] = useState<DutyType>('static');
  const [pressureDirection, setPressureDirection] = useState<PressureDirection>('internal');

  // Radial geometry
  const [boreDia, setBoreDia] = useState<DimState>(makeDim(50, 'H8'));
  const [grooveRootDia, setGrooveRootDia] = useState<DimState>(makeDim(44.6, 'h9'));
  const [rodDia, setRodDia] = useState<DimState>(makeDim(25, 'f7'));
  const [housingGrooveDia, setHousingGrooveDia] = useState<DimState>(makeDim(30.4, 'H9'));
  const [radialGrooveWidth, setRadialGrooveWidth] = useState<DimState>(makeDim(4.8, null, 0.2, 0));
  const [pistonLandDia, setPistonLandDia] = useState<DimState>(makeDim(49.9, 'g6'));
  const [rodBoreDia, setRodBoreDia] = useState<DimState>(makeDim(25, 'H8'));
  const [useCounterDia, setUseCounterDia] = useState(true);

  // Axial face geometry
  const [grooveOuterDia, setGrooveOuterDia] = useState<DimState>(makeDim(70, null, 0.1, 0.1));
  const [grooveInnerDia, setGrooveInnerDia] = useState<DimState>(makeDim(60, null, 0.1, 0.1));
  const [grooveDepth, setGrooveDepth] = useState<DimState>(makeDim(2.7, null, 0.05, 0));

  // Non-circular geometry
  const [perimeterMode, setPerimeterMode] = useState<'rect' | 'direct'>('rect');
  const [rectW, setRectW] = useState(120);
  const [rectH, setRectH] = useState(80);
  const [rectR, setRectR] = useState(12);
  const [directPerimeter, setDirectPerimeter] = useState(380);
  const [perimeterTol, setPerimeterTol] = useState(0.5);
  const [ncGrooveWidth, setNcGrooveWidth] = useState<DimState>(makeDim(5.0, null, 0.2, 0));
  const [ncGrooveDepth, setNcGrooveDepth] = useState<DimState>(makeDim(2.7, null, 0.05, 0));

  // O-Ring selection
  const [cs, setCs] = useState<number>(3.53);
  const [toleranceClass, setToleranceClass] = useState<ToleranceClass>('B');
  const [selectedDash, setSelectedDash] = useState<string>('224'); // 3.53 × 44.04 — matches the default 44.6 groove root
  const [materialId, setMaterialId] = useState('nbr');
  const [shoreA, setShoreA] = useState(70);
  const [tempMinC, setTempMinC] = useState(-20);
  const [tempMaxC, setTempMaxC] = useState(80);
  const [pressureMPa, setPressureMPa] = useState(1);

  const material = getORingMaterial(materialId);
  const handleMaterialChange = (id: string) => {
    setMaterialId(id);
    setShoreA(getORingMaterial(id).shoreA >= 85 ? 90 : 70);
  };

  const isRadial = sealType === 'innerRadial' || sealType === 'outerRadial';
  const isFace = sealType === 'axialFace';
  const isNonCircular = sealType === 'nonCircularFace';
  const effectiveDuty: DutyType = isRadial ? duty : 'static';

  const sizes = useMemo(() => sizesForCrossSection(cs), [cs]);
  const selectedSize: ORingSize = useMemo(
    () => sizes.find((s) => s.dash === selectedDash) ?? sizes[0],
    [sizes, selectedDash]
  );
  const d1Tol = useMemo(() => insideDiameterToleranceMm(selectedSize, toleranceClass), [selectedSize, toleranceClass]);
  const csTol = crossSectionToleranceMm(cs);
  const grooveRec = grooveRecommendationForCs(cs);

  const perimeterNom = perimeterMode === 'rect' ? roundedRectPerimeterMm(rectW, rectH, rectR) : directPerimeter;

  const sealInput: ORingSealInput = useMemo(() => {
    const base = {
      sealType,
      duty: effectiveDuty,
      pressureDirection,
      d1: selectedSize.d1,
      d1TolMm: d1Tol,
      cs,
      csTolMm: csTol,
      pressureMPa,
      shoreA,
    };
    if (sealType === 'outerRadial') {
      return {
        ...base,
        sealDiameter: resolveDim(boreDia),
        grooveDiameter: resolveDim(grooveRootDia),
        grooveWidth: resolveDim(radialGrooveWidth),
        counterDiameter: useCounterDia ? resolveDim(pistonLandDia) : null,
      };
    }
    if (sealType === 'innerRadial') {
      return {
        ...base,
        sealDiameter: resolveDim(rodDia),
        grooveDiameter: resolveDim(housingGrooveDia),
        grooveWidth: resolveDim(radialGrooveWidth),
        counterDiameter: useCounterDia ? resolveDim(rodBoreDia) : null,
      };
    }
    if (sealType === 'axialFace') {
      return {
        ...base,
        grooveOuterDiameter: resolveDim(grooveOuterDia),
        grooveInnerDiameter: resolveDim(grooveInnerDia),
        grooveDepth: resolveDim(grooveDepth),
      };
    }
    return {
      ...base,
      neutralPerimeter: { nom: perimeterNom, upper: Math.abs(perimeterTol), lower: -Math.abs(perimeterTol) },
      cornerRadiusMm: perimeterMode === 'rect' ? rectR : null,
      grooveWidth: resolveDim(ncGrooveWidth),
      grooveDepth: resolveDim(ncGrooveDepth),
    };
  }, [sealType, effectiveDuty, pressureDirection, selectedSize, d1Tol, cs, csTol, pressureMPa, shoreA,
    boreDia, grooveRootDia, rodDia, housingGrooveDia, radialGrooveWidth, pistonLandDia, rodBoreDia, useCounterDia,
    grooveOuterDia, grooveInnerDia, grooveDepth, perimeterNom, perimeterTol, perimeterMode, rectR, ncGrooveWidth, ncGrooveDepth]);

  const result = useMemo(() => solveORingSeal(sealInput), [sealInput]);

  // Nearest standard size to the geometry-ideal d1
  const suggestedSize: ORingSize | null = useMemo(() => {
    if (!isFinite(result.idealD1Mm) || sizes.length === 0) return null;
    let best = sizes[0];
    for (const s of sizes) {
      if (Math.abs(s.d1 - result.idealD1Mm) < Math.abs(best.d1 - result.idealD1Mm)) best = s;
    }
    return best;
  }, [sizes, result.idealD1Mm]);

  // Material / temperature checks
  const tempOk = tempMinC >= material.tempMinC && tempMaxC <= material.tempMaxC;
  const tempShortOk = tempMaxC <= material.tempMaxShortC;
  const dynamicMismatch = effectiveDuty !== 'static' && !material.dynamicSuitable;

  const getInputs = useCallback((): Record<string, unknown> => ({
    sealType, duty, pressureDirection,
    boreDia, grooveRootDia, rodDia, housingGrooveDia, radialGrooveWidth, pistonLandDia, rodBoreDia, useCounterDia,
    grooveOuterDia, grooveInnerDia, grooveDepth,
    perimeterMode, rectW, rectH, rectR, directPerimeter, perimeterTol, ncGrooveWidth, ncGrooveDepth,
    cs, toleranceClass, selectedDash, materialId, shoreA, tempMinC, tempMaxC, pressureMPa,
  }), [sealType, duty, pressureDirection, boreDia, grooveRootDia, rodDia, housingGrooveDia, radialGrooveWidth,
    pistonLandDia, rodBoreDia, useCounterDia, grooveOuterDia, grooveInnerDia, grooveDepth, perimeterMode, rectW, rectH, rectR,
    directPerimeter, perimeterTol, ncGrooveWidth, ncGrooveDepth, cs, toleranceClass, selectedDash, materialId,
    shoreA, tempMinC, tempMaxC, pressureMPa]);

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    const v = inp as Record<string, any>;
    if (v.sealType) setSealType(v.sealType);
    if (v.duty) setDuty(v.duty);
    if (v.pressureDirection) setPressureDirection(v.pressureDirection);
    if (v.boreDia) setBoreDia(v.boreDia);
    if (v.grooveRootDia) setGrooveRootDia(v.grooveRootDia);
    if (v.rodDia) setRodDia(v.rodDia);
    if (v.housingGrooveDia) setHousingGrooveDia(v.housingGrooveDia);
    if (v.radialGrooveWidth) setRadialGrooveWidth(v.radialGrooveWidth);
    if (v.pistonLandDia) setPistonLandDia(v.pistonLandDia);
    if (v.rodBoreDia) setRodBoreDia(v.rodBoreDia);
    if (v.useCounterDia != null) setUseCounterDia(v.useCounterDia);
    if (v.grooveOuterDia) setGrooveOuterDia(v.grooveOuterDia);
    if (v.grooveInnerDia) setGrooveInnerDia(v.grooveInnerDia);
    if (v.grooveDepth) setGrooveDepth(v.grooveDepth);
    if (v.perimeterMode) setPerimeterMode(v.perimeterMode);
    if (v.rectW != null) setRectW(v.rectW);
    if (v.rectH != null) setRectH(v.rectH);
    if (v.rectR != null) setRectR(v.rectR);
    if (v.directPerimeter != null) setDirectPerimeter(v.directPerimeter);
    if (v.perimeterTol != null) setPerimeterTol(v.perimeterTol);
    if (v.ncGrooveWidth) setNcGrooveWidth(v.ncGrooveWidth);
    if (v.ncGrooveDepth) setNcGrooveDepth(v.ncGrooveDepth);
    if (v.cs != null) setCs(v.cs);
    if (v.toleranceClass) setToleranceClass(v.toleranceClass);
    if (v.selectedDash) setSelectedDash(v.selectedDash);
    if (v.materialId) setMaterialId(v.materialId);
    if (v.shoreA != null) setShoreA(v.shoreA);
    if (v.tempMinC != null) setTempMinC(v.tempMinC);
    if (v.tempMaxC != null) setTempMaxC(v.tempMaxC);
    if (v.pressureMPa != null) setPressureMPa(v.pressureMPa);
  }, []);

  const saved = useSavedCalculations('o-ring');

  // ---- Reusable toleranced-dimension input ----
  function DimInput({ label, dim, onChange, isoKind, hint }: {
    label: string;
    dim: DimState;
    onChange: (d: DimState) => void;
    isoKind: 'hole' | 'shaft' | null;
    hint?: string;
  }) {
    const resolved = resolveDim(dim);
    const fits = isoKind === 'hole' ? HOLE_FITS : SHAFT_FITS;
    return (
      <div className="field">
        <label>{label} ({lenUnit})</label>
        <input autoComplete="off" type="number" min={0} step={0.1}
          value={toDisplay(dim.nom, unitSystem, UNIT_LENGTH)}
          onChange={(e) => onChange({ ...dim, nom: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
        {isoKind !== null && (
          <div className="segmented" style={{ marginTop: '0.35rem' }}>
            <button className={dim.mode === 'iso' ? 'active' : ''} onClick={() => onChange({ ...dim, mode: 'iso' })}>ISO fit</button>
            <button className={dim.mode === 'custom' ? 'active' : ''} onClick={() => onChange({ ...dim, mode: 'custom' })}>Custom ±</button>
          </div>
        )}
        {dim.mode === 'iso' && isoKind !== null ? (
          <>
            <select style={{ marginTop: '0.35rem' }} value={dim.fit} onChange={(e) => onChange({ ...dim, fit: e.target.value })}>
              {fits.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <span className="hint">
              {dim.fit}: {resolved.upper >= 0 ? '+' : ''}{fmtU(resolved.upper, unitSystem, UNIT_LENGTH, 4)} / {resolved.lower >= 0 ? '+' : ''}{fmtU(resolved.lower, unitSystem, UNIT_LENGTH, 4)} {lenUnit}
            </span>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center' }}>
            <span className="hint">+</span>
            <input autoComplete="off" type="number" min={0} step={0.01}
              value={toDisplay(dim.plus, unitSystem, UNIT_LENGTH)}
              onChange={(e) => onChange({ ...dim, mode: 'custom', plus: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
            <span className="hint">−</span>
            <input autoComplete="off" type="number" min={0} step={0.01}
              value={toDisplay(dim.minus, unitSystem, UNIT_LENGTH)}
              onChange={(e) => onChange({ ...dim, mode: 'custom', minus: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
          </div>
        )}
        {hint && <span className="hint">{hint}</span>}
      </div>
    );
  }

  const stretchLabel =
    result.stretchKind === 'idStretch' ? 'Installed stretch (d1 → groove root)'
      : result.stretchKind === 'circumferentialCompression' ? 'Circumferential compression (OD → groove Ø)'
        : result.stretchKind === 'seatInternal' ? 'OD oversize vs outer groove wall'
          : result.stretchKind === 'seatExternal' ? 'd1 undersize vs inner groove wall'
            : 'Centreline stretch (ring → groove path)';

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [];
    if (isNonCircular) {
      steps.push({
        title: 'Neutral-axis groove path length → equivalent diameter',
        formula: perimeterMode === 'rect' ? 'L = 2(W−2r) + 2(H−2r) + 2πr (centreline), d_eq = L/π' : 'd_eq = L/π',
        substitution: perimeterMode === 'rect' ? `W = ${fmt(rectW, 1)} mm, H = ${fmt(rectH, 1)} mm, r = ${fmt(rectR, 1)} mm` : `L = ${fmt(perimeterNom, 1)} mm`,
        result: `L = ${fmt(perimeterNom, 2)} mm, equivalent Ø = ${fmt(perimeterNom / Math.PI, 2)} mm`,
      });
    }
    steps.push({
      title: stretchLabel,
      formula: result.stretchKind === 'idStretch' ? 'ε = (d3 − d1)/d1 — guide limit: 8% installed (d1 < 50 mm), 6% (d1 > 50 mm)'
        : result.stretchKind === 'circumferentialCompression' ? 'ε = (d6 − OD)/OD, OD = d1 + 2·d2 — guide limit: max 3% compression'
          : result.stretchKind === 'seatInternal' ? '(OD − d7)/d7, OD = d1 + 2·d2 — target +1 to +2% (ring seats on outer wall under internal pressure)'
            : result.stretchKind === 'seatExternal' ? '(d8 − d1)/d8 — target 1 to 3% (ring seats on inner wall under external pressure)'
              : 'ε = (L − π(d1+d2)) / π(d1+d2) — target ~1–3%, same installed-stretch limits as radial seals',
      substitution: `d1 = ${fmt(selectedSize.d1, 2)} ±${fmt(d1Tol, 2)} mm, d2 = ${fmt(cs, 2)} ±${fmt(csTol, 2)} mm`,
      result: `${fmt(result.stretchPct.nom, 2)}% nominal (${fmt(result.stretchPct.min, 2)}% … ${fmt(result.stretchPct.max, 2)}% across tolerances)`,
    });
    steps.push({
      title: 'Effective cross-section after stretch',
      formula: 'Δd2 ≈ −0.5% per +1% stretch (guide approximation of its exact reduction formula); slight bulge for circumferential compression',
      result: `d2_eff = ${fmt(result.effectiveCsMm.nom, 3)} mm nominal (${fmt(result.effectiveCsMm.min, 3)} … ${fmt(result.effectiveCsMm.max, 3)} mm)`,
    });
    steps.push({
      title: 'Gland height and initial squeeze',
      formula: isRadial ? 'h = (Ø_outer − Ø_inner)/2, squeeze = (d2_eff − h)/d2_eff' : 'h = groove depth t, squeeze = (d2_eff − t)/d2_eff',
      substitution: `h = ${fmt(result.glandHeightMm.nom, 3)} mm nominal (${fmt(result.glandHeightMm.min, 3)} … ${fmt(result.glandHeightMm.max, 3)} mm)`,
      result: `Squeeze = ${fmt(result.squeezePct.nom, 1)}% nominal (${fmt(result.squeezePct.min, 1)} … ${fmt(result.squeezePct.max, 1)}%) vs guide band ${fmt(result.squeezeRec.min, 0)}–${fmt(result.squeezeRec.max, 0)}% (${result.squeezeApplication === 'axial' ? 'axial static' : result.squeezeApplication === 'radialStatic' ? 'radial static' : result.squeezeApplication === 'hydraulicDynamic' ? 'hydraulic dynamic' : 'pneumatic dynamic'})`,
    });
    steps.push({
      title: 'Gland fill',
      formula: 'fill = (π/4 · d2_eff²) / (b · h) — rectangular groove idealisation, ≤75% recommended nominal / ≤85% worst-case',
      substitution: `b = ${fmt(result.grooveWidthMm.nom, 2)} mm, h = ${fmt(result.glandHeightMm.nom, 3)} mm`,
      result: `Fill = ${fmt(result.fillPct.nom, 1)}% nominal, ${fmt(result.fillPct.worst, 1)}% worst-case`,
    });
    if (result.extrusionGap && pressureMPa > 0) {
      steps.push({
        title: 'Extrusion gap vs guide Table XII',
        formula: 'Worst-case radial clearance S vs permissible S(d2, pressure, hardness)',
        substitution: `p = ${fmt(pressureMPa, 1)} MPa, ${shoreA} Shore A`,
        result: `S = ${fmt(result.extrusionGap.actualMaxMm, 3)} mm vs permissible ${result.extrusionGap.allowableMm !== null ? fmt(result.extrusionGap.allowableMm, 2) + ' mm' : 'beyond table — use back-up rings'}${result.extrusionGap.backupRingsRecommended ? ' · back-up rings recommended at this pressure' : ''}`,
      });
    }
    return steps;
  }, [result, isNonCircular, isRadial, perimeterMode, rectW, rectH, rectR, perimeterNom, selectedSize, d1Tol, cs, csTol, pressureMPa, shoreA, stretchLabel]);

  const inputSections: ReportSection[] = useMemo(() => {
    const geoRows: ReportRow[] = [{ label: 'Seal configuration', value: `${SEAL_TYPE_LABELS[sealType]}${isRadial ? ` · ${effectiveDuty === 'static' ? 'static' : effectiveDuty === 'hydraulicDynamic' ? 'dynamic (hydraulic)' : 'dynamic (pneumatic)'}` : ` · static · ${pressureDirection} pressure`}` }];
    const dimRow = (label: string, d: DimState) => {
      const r = resolveDim(d);
      geoRows.push({ label, value: `${fmt(d.nom, 2)} mm ${d.mode === 'iso' ? d.fit : ''} (${r.upper >= 0 ? '+' : ''}${fmt(r.upper, 3)}/${fmt(r.lower, 3)})` });
    };
    if (sealType === 'outerRadial') {
      dimRow('Bore Ø', boreDia); dimRow('Groove root Ø d3', grooveRootDia); dimRow('Groove width b', radialGrooveWidth);
      if (useCounterDia) dimRow('Piston Ø', pistonLandDia);
    } else if (sealType === 'innerRadial') {
      dimRow('Rod Ø d5', rodDia); dimRow('Housing groove Ø d6', housingGrooveDia); dimRow('Groove width b', radialGrooveWidth);
      if (useCounterDia) dimRow('Housing bore Ø', rodBoreDia);
    } else if (sealType === 'axialFace') {
      dimRow('Groove OD d7', grooveOuterDia); dimRow('Groove ID d8', grooveInnerDia); dimRow('Groove depth t', grooveDepth);
    } else {
      geoRows.push({ label: 'Groove path', value: perimeterMode === 'rect' ? `rounded rectangle ${fmt(rectW, 1)} × ${fmt(rectH, 1)} mm, r = ${fmt(rectR, 1)} mm` : 'direct perimeter entry' });
      geoRows.push({ label: 'Neutral-axis length L', value: `${fmt(perimeterNom, 2)} ±${fmt(perimeterTol, 2)} mm` });
      dimRow('Groove width b', ncGrooveWidth); dimRow('Groove depth t', ncGrooveDepth);
    }
    const oringRows: ReportRow[] = [
      { label: 'O-Ring size', value: `AS568-${selectedSize.dash} / ISO 3601-1 — d1 ${fmt(selectedSize.d1, 2)} ±${fmt(d1Tol, 2)} mm × d2 ${fmt(cs, 2)} ±${fmt(csTol, 2)} mm (Class ${toleranceClass})` },
      { label: 'Material', value: `${material.name} (${material.fullName}), ${shoreA} Shore A` },
      { label: 'Operating temperature', value: `${fmt(tempMinC, 0)} … ${fmt(tempMaxC, 0)} °C` },
      { label: 'System pressure', value: `${fmt(pressureMPa, 1)} MPa` },
    ];
    return [
      { heading: 'Gland geometry', rows: geoRows },
      { heading: 'O-Ring & service', rows: oringRows },
    ];
  }, [sealType, isRadial, effectiveDuty, pressureDirection, boreDia, grooveRootDia, radialGrooveWidth, pistonLandDia, rodBoreDia, useCounterDia,
    rodDia, housingGrooveDia, grooveOuterDia, grooveInnerDia, grooveDepth, perimeterMode, rectW, rectH, rectR, perimeterNom,
    perimeterTol, ncGrooveWidth, ncGrooveDepth, selectedSize, d1Tol, cs, csTol, toleranceClass, material, shoreA, tempMinC, tempMaxC, pressureMPa]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Seal metrics',
      rows: [
        { label: stretchLabel, value: `${fmt(result.stretchPct.nom, 2)}% (${fmt(result.stretchPct.min, 2)} … ${fmt(result.stretchPct.max, 2)}%)` },
        { label: 'Initial squeeze', value: `${fmt(result.squeezePct.nom, 1)}% (${fmt(result.squeezePct.min, 1)} … ${fmt(result.squeezePct.max, 1)}%) vs band ${fmt(result.squeezeRec.min, 0)}–${fmt(result.squeezeRec.max, 0)}%` },
        { label: 'Gland fill', value: `${fmt(result.fillPct.nom, 1)}% nominal / ${fmt(result.fillPct.worst, 1)}% worst-case` },
        { label: 'Effective cross-section', value: `${fmt(result.effectiveCsMm.nom, 3)} mm` },
        { label: 'Gland height', value: `${fmt(result.glandHeightMm.nom, 3)} mm` },
        ...(result.extrusionGap && pressureMPa > 0 ? [{ label: 'Extrusion gap (worst)', value: `${fmt(result.extrusionGap.actualMaxMm, 3)} mm vs permissible ${result.extrusionGap.allowableMm !== null ? fmt(result.extrusionGap.allowableMm, 2) + ' mm' : '— (beyond table)'}` }] : []),
        ...(result.equivalentDiameterMm !== null ? [{ label: 'Equivalent groove Ø (L/π)', value: `${fmt(result.equivalentDiameterMm, 2)} mm` }] : []),
      ],
    },
    {
      heading: 'Checks',
      rows: result.checks.map((c) => ({ label: `${c.severity === 'pass' ? '✓' : c.severity === 'warn' ? '⚠' : '✗'} ${c.label}`, value: c.detail })),
    },
  ], [result, stretchLabel, pressureMPa]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'ORing_Calculator',
      pageTitle: 'O-Ring Seal Calculator',
      accentHex,
      passStatus: { pass: result.overallPass, label: result.overallPass ? 'Gland design within guide limits' : 'Gland design fails one or more checks — see below' },
      inputSections,
      outputSections,
      calculationSteps,
      disclaimer:
        'Engineering estimation tool implementing the Trelleborg Sealing Solutions O-Rings design guide method (squeeze bands per cross-section, installed stretch/circumferential-compression limits, cross-section reduction with stretch, Table XII extrusion clearances, Table XV groove dimensions). O-Ring sizes and Class A inside-diameter tolerances are the AS568/ISO 3601-1 values transcribed from published manufacturer tables; Class B tolerances interpolate a published DIN ISO 3601-1:2013 Class B table. ISO 286 fits are computed from the standard\'s formulas, not table-transcribed. Gland fill limits (75%/85%) are standard industry guidance. Material temperature ranges are typical compound values — actual limits depend on the specific compound and medium. Verify against the current standards, the compound datasheet, and seal-supplier review before production use.',
      ...branding,
    });
  };

  const suggestGroove = () => {
    if (sealType === 'outerRadial') {
      const t = effectiveDuty === 'static' ? grooveRec.radialDepthStaticMm : grooveRec.radialDepthDynamicMm;
      setGrooveRootDia({ ...grooveRootDia, nom: Number((boreDia.nom - 2 * t).toFixed(2)) });
      setRadialGrooveWidth({ ...radialGrooveWidth, nom: grooveRec.radialWidthMm, plus: 0.2, minus: 0, mode: 'custom' });
    } else if (sealType === 'innerRadial') {
      const t = effectiveDuty === 'static' ? grooveRec.radialDepthStaticMm : grooveRec.radialDepthDynamicMm;
      setHousingGrooveDia({ ...housingGrooveDia, nom: Number((rodDia.nom + 2 * t).toFixed(2)) });
      setRadialGrooveWidth({ ...radialGrooveWidth, nom: grooveRec.radialWidthMm, plus: 0.2, minus: 0, mode: 'custom' });
    } else if (sealType === 'axialFace') {
      setGrooveDepth({ ...grooveDepth, nom: grooveRec.axialDepthMm, plus: 0.05, minus: 0, mode: 'custom' });
      setGrooveOuterDia({ ...grooveOuterDia, nom: Number((grooveInnerDia.nom + 2 * grooveRec.axialWidthMm).toFixed(2)) });
    } else {
      setNcGrooveDepth({ ...ncGrooveDepth, nom: grooveRec.axialDepthMm, plus: 0.05, minus: 0, mode: 'custom' });
      setNcGrooveWidth({ ...ncGrooveWidth, nom: grooveRec.axialWidthMm, plus: 0.2, minus: 0, mode: 'custom' });
    }
  };

  const failingChecks = result.checks.filter((c) => c.severity === 'fail');
  const warningChecks = result.checks.filter((c) => c.severity === 'warn');

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● O-Ring Calculator</div>
          <h1>O-Ring Seal Calculator</h1>
          <p>
            Gland design to the Trelleborg O-Ring design guide — static and dynamic radial seals (rod and
            piston), axial face seals, and non-circular face grooves via neutral-axis length. ISO 286 fits or
            custom tolerances on every dimension, AS568 / ISO 3601-1 Class A/B size selection, and squeeze,
            stretch, gland-fill and extrusion-gap checks with worst-case tolerance stacks.
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
            <div className="card-title">
              <span>
                <span className="step-num">1</span>Seal configuration
                <InfoTooltip>Outer radial (piston): groove on the inner part, O-Ring seals against the bore — the ring is stretched onto its groove. Inner radial (rod): groove in the housing, O-Ring seals against the rod — the ring is held by slight circumferential compression. Axial face seals are compressed between two flat faces; the pressure direction decides which groove wall the ring should rest against.</InfoTooltip>
              </span>
            </div>
            <div className="field">
              <div className="segmented">
                {(Object.keys(SEAL_TYPE_LABELS) as SealType[]).map((t) => (
                  <button key={t} className={sealType === t ? 'active' : ''} onClick={() => setSealType(t)}>{SEAL_TYPE_LABELS[t]}</button>
                ))}
              </div>
            </div>
            {isRadial && (
              <div className="field" style={{ marginTop: '0.6rem' }}>
                <label>
                  Duty
                  <InfoTooltip>Dynamic (reciprocating) seals use less squeeze than static ones to limit friction and wear — the guide gives separate bands for hydraulic and pneumatic service. Face seals are static by definition.</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={duty === 'static' ? 'active' : ''} onClick={() => setDuty('static')}>Static</button>
                  <button className={duty === 'hydraulicDynamic' ? 'active' : ''} onClick={() => setDuty('hydraulicDynamic')}>Dynamic — hydraulic</button>
                  <button className={duty === 'pneumaticDynamic' ? 'active' : ''} onClick={() => setDuty('pneumaticDynamic')}>Dynamic — pneumatic</button>
                </div>
              </div>
            )}
            {(isFace || isNonCircular) && (
              <div className="field" style={{ marginTop: '0.6rem' }}>
                <label>
                  Pressure direction
                  <InfoTooltip>With internal pressure the ring should rest against the OUTER groove wall (O-Ring OD ≈ 1–2% larger than groove OD). With external pressure (or vacuum inside) it should rest against the INNER wall (d1 ≈ 1–3% smaller than groove ID).</InfoTooltip>
                </label>
                <div className="segmented">
                  <button className={pressureDirection === 'internal' ? 'active' : ''} onClick={() => setPressureDirection('internal')}>Internal (from centre)</button>
                  <button className={pressureDirection === 'external' ? 'active' : ''} onClick={() => setPressureDirection('external')}>External / vacuum</button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">2</span>Gland geometry
                <InfoTooltip>Enter your hardware dimensions. Every diameter can carry a standard ISO 286 fit (computed from the standard's formulas) or your own ± deviations. The "Use guide groove" button fills the groove from the Trelleborg Table XV recommendation for the selected cross-section.</InfoTooltip>
              </span>
              <button className="btn small" onClick={suggestGroove}>Use guide groove (d2 = {fmt(cs, 2)})</button>
            </div>
            <div className="grid grid-2">
              {sealType === 'outerRadial' && (
                <>
                  <DimInput label="Bore Ø (cylinder)" dim={boreDia} onChange={setBoreDia} isoKind="hole" />
                  <DimInput label="Groove root Ø d3" dim={grooveRootDia} onChange={setGrooveRootDia} isoKind="shaft" hint="The O-Ring is stretched over this diameter." />
                  <DimInput label="Groove width b" dim={radialGrooveWidth} onChange={setRadialGrooveWidth} isoKind={null} />
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="checkbox" checked={useCounterDia} onChange={(e) => setUseCounterDia(e.target.checked)} style={{ width: 'auto' }} />
                      Check extrusion gap (piston Ø)
                    </label>
                    {useCounterDia && <DimInput label="Piston land Ø" dim={pistonLandDia} onChange={setPistonLandDia} isoKind="shaft" />}
                  </div>
                </>
              )}
              {sealType === 'innerRadial' && (
                <>
                  <DimInput label="Rod Ø d5" dim={rodDia} onChange={setRodDia} isoKind="shaft" hint="Sealing surface — the ring seats by its OD in the housing groove." />
                  <DimInput label="Housing groove Ø d6" dim={housingGrooveDia} onChange={setHousingGrooveDia} isoKind="hole" />
                  <DimInput label="Groove width b" dim={radialGrooveWidth} onChange={setRadialGrooveWidth} isoKind={null} />
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="checkbox" checked={useCounterDia} onChange={(e) => setUseCounterDia(e.target.checked)} style={{ width: 'auto' }} />
                      Check extrusion gap (housing bore Ø)
                    </label>
                    {useCounterDia && <DimInput label="Housing bore Ø" dim={rodBoreDia} onChange={setRodBoreDia} isoKind="hole" />}
                  </div>
                </>
              )}
              {sealType === 'axialFace' && (
                <>
                  <DimInput label="Groove OD d7" dim={grooveOuterDia} onChange={setGrooveOuterDia} isoKind="hole" />
                  <DimInput label="Groove ID d8" dim={grooveInnerDia} onChange={setGrooveInnerDia} isoKind="hole" />
                  <DimInput label="Groove depth t" dim={grooveDepth} onChange={setGrooveDepth} isoKind={null} />
                  <div className="field">
                    <label>Groove width b (derived)</label>
                    <input value={`${fmtU(result.grooveWidthMm.nom, unitSystem, UNIT_LENGTH, 3)} ${lenUnit}`} readOnly />
                    <span className="hint">b = (d7 − d8)/2</span>
                  </div>
                </>
              )}
              {isNonCircular && (
                <>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>
                      Groove path input
                      <InfoTooltip>The groove follows a non-circular path. Its neutral-axis (centreline) length is converted to an equivalent circular diameter (L/π) so a standard O-Ring can be selected. Enter a rounded rectangle, or the centreline length directly for any other profile.</InfoTooltip>
                    </label>
                    <div className="segmented">
                      <button className={perimeterMode === 'rect' ? 'active' : ''} onClick={() => setPerimeterMode('rect')}>Rounded rectangle</button>
                      <button className={perimeterMode === 'direct' ? 'active' : ''} onClick={() => setPerimeterMode('direct')}>Direct perimeter</button>
                    </div>
                  </div>
                  {perimeterMode === 'rect' ? (
                    <>
                      <div className="field">
                        <label>Centreline width W ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} value={toDisplay(rectW, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectW(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                      </div>
                      <div className="field">
                        <label>Centreline height H ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} value={toDisplay(rectH, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectH(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                      </div>
                      <div className="field">
                        <label>Corner radius r ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} value={toDisplay(rectR, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectR(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                        <span className="hint">Recommend r ≥ 3×d2 = {fmtU(3 * cs, unitSystem, UNIT_LENGTH, 2)} {lenUnit}</span>
                      </div>
                      <div className="field">
                        <label>Neutral-axis length L (derived)</label>
                        <input value={`${fmtU(perimeterNom, unitSystem, UNIT_LENGTH, 2)} ${lenUnit}`} readOnly />
                        <span className="hint">Equivalent Ø = L/π = {fmtU(perimeterNom / Math.PI, unitSystem, UNIT_LENGTH, 2)} {lenUnit}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label>Neutral-axis length L ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} value={toDisplay(directPerimeter, unitSystem, UNIT_LENGTH)} onChange={(e) => setDirectPerimeter(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                        <span className="hint">Equivalent Ø = L/π = {fmtU(perimeterNom / Math.PI, unitSystem, UNIT_LENGTH, 2)} {lenUnit}</span>
                      </div>
                      <div className="field">
                        <label>Perimeter tolerance ± ({lenUnit})</label>
                        <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(perimeterTol, unitSystem, UNIT_LENGTH)} onChange={(e) => setPerimeterTol(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                      </div>
                    </>
                  )}
                  <DimInput label="Groove width b" dim={ncGrooveWidth} onChange={setNcGrooveWidth} isoKind={null} />
                  <DimInput label="Groove depth t" dim={ncGrooveDepth} onChange={setNcGrooveDepth} isoKind={null} />
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">3</span>O-Ring selection
                <InfoTooltip>Pick a cross-section, then a standard AS568 / ISO 3601-1 size. Class A carries the tighter AS568 inside-diameter tolerances (aerospace/precision); Class B the wider general-industrial tolerances of DIN ISO 3601-1:2013. Cross-section tolerances are common to both classes.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Cross-section d2</label>
                <div className="segmented">
                  {ORING_CROSS_SECTIONS.map((c) => (
                    <button key={c} className={cs === c ? 'active' : ''} onClick={() => { setCs(c); const s = sizesForCrossSection(c); if (!s.some((x) => x.dash === selectedDash)) setSelectedDash(s[Math.floor(s.length / 2)].dash); }}>
                      {fmt(c, 2)}
                    </button>
                  ))}
                </div>
                <span className="hint">mm · ±{fmt(csTol, 2)} mm (ISO 3601-1)</span>
              </div>
              <div className="field">
                <label>Tolerance class</label>
                <div className="segmented">
                  <button className={toleranceClass === 'A' ? 'active' : ''} onClick={() => setToleranceClass('A')}>Class A</button>
                  <button className={toleranceClass === 'B' ? 'active' : ''} onClick={() => setToleranceClass('B')}>Class B</button>
                </div>
                <span className="hint">{toleranceClass === 'A' ? 'AS568-equivalent (tighter, aerospace/precision)' : 'General industrial (DIN ISO 3601-1:2013)'}</span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Size (AS568 / ISO 3601-1)</label>
                <select value={selectedSize.dash} onChange={(e) => setSelectedDash(e.target.value)}>
                  {sizes.map((s) => (
                    <option key={s.dash} value={s.dash}>
                      -{s.dash} — d1 {fmt(s.d1, 2)} × d2 {fmt(s.cs, 2)} mm{suggestedSize?.dash === s.dash ? '  ← suggested' : ''}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Geometry-ideal d1 ≈ {fmt(result.idealD1Mm, 2)} mm.
                  {suggestedSize && suggestedSize.dash !== selectedSize.dash && (
                    <> Nearest standard: -{suggestedSize.dash} (d1 {fmt(suggestedSize.d1, 2)}). <button className="btn small" style={{ marginLeft: '0.4rem' }} onClick={() => setSelectedDash(suggestedSize.dash)}>Use suggested</button></>
                  )}
                  {suggestedSize && suggestedSize.dash === selectedSize.dash && ' Selected size is the nearest standard size.'}
                </span>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Selected O-Ring</label>
                <input value={`AS568-${selectedSize.dash}: d1 ${fmt(selectedSize.d1, 2)} ±${fmt(d1Tol, 2)} × d2 ${fmt(cs, 2)} ±${fmt(csTol, 2)} mm (Class ${toleranceClass}) · OD ≈ ${fmt(selectedSize.d1 + 2 * cs, 2)} mm`} readOnly />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                <span className="step-num">4</span>Material &amp; service
                <InfoTooltip>Material choice is driven by the medium first, then temperature. The ranges here are typical continuous-service limits for standard compounds — always confirm against the specific compound datasheet and the medium at temperature.</InfoTooltip>
              </span>
            </div>
            <div className="grid grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Elastomer</label>
                <select value={materialId} onChange={(e) => handleMaterialChange(e.target.value)}>
                  {ORING_MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.fullName} ({m.tempMinC}…{m.tempMaxC}°C)</option>
                  ))}
                </select>
                <span className="hint">{material.notes}</span>
              </div>
              <div className="field">
                <label>Hardness</label>
                <div className="segmented">
                  <button className={shoreA === 70 ? 'active' : ''} onClick={() => setShoreA(70)}>70 Sh A</button>
                  <button className={shoreA === 80 ? 'active' : ''} onClick={() => setShoreA(80)}>80 Sh A</button>
                  <button className={shoreA === 90 ? 'active' : ''} onClick={() => setShoreA(90)}>90 Sh A</button>
                </div>
                <span className="hint">Drives the permissible extrusion gap (Table XII uses 70/90 Shore; 80 uses the 90-Shore table conservatively... see notes).</span>
              </div>
              <div className="field">
                <label>System pressure ({unitLabel(unitSystem, UNIT_PRESSURE)})</label>
                <input autoComplete="off" type="number" min={0} step={0.1} value={toDisplay(pressureMPa, unitSystem, UNIT_PRESSURE)} onChange={(e) => setPressureMPa(fromDisplay(Number(e.target.value), unitSystem, UNIT_PRESSURE))} />
                <span className="hint">0 = skip the extrusion-gap check.</span>
              </div>
              <div className="field">
                <label>Min operating temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(tempMinC, unitSystem, UNIT_TEMP)} onChange={(e) => setTempMinC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
              <div className="field">
                <label>Max operating temperature ({unitLabel(unitSystem, UNIT_TEMP)})</label>
                <input autoComplete="off" type="number" value={toDisplay(tempMaxC, unitSystem, UNIT_TEMP)} onChange={(e) => setTempMaxC(fromDisplay(Number(e.target.value), unitSystem, UNIT_TEMP))} />
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <div style={{ color: tempOk ? 'var(--pos)' : tempShortOk ? 'var(--warn)' : 'var(--neg)', fontWeight: 600 }}>
                {tempOk
                  ? `✓ ${material.name} covers ${fmtU(tempMinC, unitSystem, UNIT_TEMP, 0)}…${fmtU(tempMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)} (rated ${fmtU(material.tempMinC, unitSystem, UNIT_TEMP, 0)}…${fmtU(material.tempMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)} continuous)`
                  : tempShortOk
                    ? `⚠ Operating range exceeds ${material.name}'s continuous rating (${fmtU(material.tempMinC, unitSystem, UNIT_TEMP, 0)}…${fmtU(material.tempMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}; short-period peak ${fmtU(material.tempMaxShortC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}) — check the compound datasheet`
                    : `✗ Operating range is outside ${material.name}'s capability (${fmtU(material.tempMinC, unitSystem, UNIT_TEMP, 0)}…${fmtU(material.tempMaxC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}, short-period ${fmtU(material.tempMaxShortC, unitSystem, UNIT_TEMP, 0)}${unitLabel(unitSystem, UNIT_TEMP)}) — pick a different elastomer`}
              </div>
              {dynamicMismatch && (
                <div style={{ color: 'var(--warn)', fontWeight: 600 }}>⚠ {material.name} is not recommended for dynamic/sliding duty (poor tear/abrasion resistance) — prefer NBR, HNBR, FKM or PU.</div>
              )}
              <div style={{ color: 'var(--text-2)', marginTop: '0.35rem' }}><b>Good for:</b> {material.goodFor}</div>
              <div style={{ color: 'var(--text-2)' }}><b>Avoid:</b> {material.avoid}</div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className={`status-banner ${result.overallPass ? 'pass' : 'fail'}`}>
              {result.overallPass
                ? warningChecks.length > 0
                  ? `✓ Within guide limits — ${warningChecks.length} advisory note${warningChecks.length === 1 ? '' : 's'} below`
                  : '✓ Gland design within guide limits'
                : `✗ Gland design fails ${failingChecks.length} check${failingChecks.length === 1 ? '' : 's'} — see below`}
            </div>
            {result.checks.filter((c) => c.severity !== 'pass').length > 0 && (
              <div style={{ margin: '0 0 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.checks.filter((c) => c.severity !== 'pass').map((c) => (
                  <div key={c.id} style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <div style={{ color: c.severity === 'fail' ? 'var(--neg)' : 'var(--warn)', fontWeight: 700 }}>{c.severity === 'fail' ? '✗' : '⚠'} {c.label}</div>
                    <div style={{ color: 'var(--text-2)' }}>→ {c.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">
                  Initial squeeze
                  <InfoTooltip>Compression of the cross-section between the groove root and the mating surface — what actually creates the seal. Checked against the guide's band for this cross-section and application.</InfoTooltip>
                </div>
                <div className={`value ${result.checks.find((c) => c.id === 'squeeze')?.severity === 'fail' ? 'neg' : result.checks.find((c) => c.id === 'squeeze')?.severity === 'warn' ? 'warn' : 'pos'}`}>{fmt(result.squeezePct.nom, 1)}<span className="unit">%</span></div>
                <div className="hint">{fmt(result.squeezePct.min, 1)}–{fmt(result.squeezePct.max, 1)}% tol. · band {fmt(result.squeezeRec.min, 0)}–{fmt(result.squeezeRec.max, 0)}%</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  {result.stretchKind === 'circumferentialCompression' ? 'Circumf. compression' : result.stretchKind === 'idStretch' ? 'Installed stretch' : result.stretchKind === 'centerlineStretch' ? 'Centreline stretch' : 'Wall seating'}
                  <InfoTooltip>{stretchLabel}. Positive = stretch, negative = compression for radial metrics; for face seals this is the over/undersize against the pressure-side groove wall.</InfoTooltip>
                </div>
                <div className={`value ${result.checks.find((c) => c.id === 'stretch')?.severity === 'fail' ? 'neg' : result.checks.find((c) => c.id === 'stretch')?.severity === 'warn' ? 'warn' : 'pos'}`}>
                  {fmt(result.stretchKind === 'circumferentialCompression' ? -result.stretchPct.nom : result.stretchPct.nom, 2)}<span className="unit">%</span>
                </div>
                <div className="hint">{fmt(result.stretchPct.min, 2)} … {fmt(result.stretchPct.max, 2)}% across tolerances</div>
              </div>
              <div className="result-tile">
                <div className="label">
                  Gland fill
                  <InfoTooltip>How much of the groove cross-section the ring occupies. Room must remain for thermal expansion and media swell — ≤75% nominal recommended, ≤85% at worst-case tolerances.</InfoTooltip>
                </div>
                <div className={`value ${result.fillPct.worst > 85 ? 'neg' : result.fillPct.nom > 75 ? 'warn' : 'pos'}`}>{fmt(result.fillPct.nom, 0)}<span className="unit">%</span></div>
                <div className="hint">worst-case {fmt(result.fillPct.worst, 0)}%</div>
              </div>
              <div className="result-tile">
                <div className="label">Effective cross-section</div>
                <div className="value">{fmtU(result.effectiveCsMm.nom, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{lenUnit}</span></div>
                <div className="hint">after stretch · nominal d2 {fmtU(cs, unitSystem, UNIT_LENGTH, 3)} {lenUnit}</div>
              </div>
              <div className="result-tile">
                <div className="label">Gland height</div>
                <div className="value">{fmtU(result.glandHeightMm.nom, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{lenUnit}</span></div>
                <div className="hint">{fmtU(result.glandHeightMm.min, unitSystem, UNIT_LENGTH, 3)} … {fmtU(result.glandHeightMm.max, unitSystem, UNIT_LENGTH, 3)} {lenUnit}</div>
              </div>
              {result.extrusionGap && pressureMPa > 0 && (
                <div className="result-tile">
                  <div className="label">Extrusion gap (worst)</div>
                  <div className={`value ${result.checks.find((c) => c.id === 'extrusion')?.severity === 'fail' ? 'neg' : 'pos'}`}>{fmtU(result.extrusionGap.actualMaxMm, unitSystem, UNIT_LENGTH, 3)}<span className="unit">{lenUnit}</span></div>
                  <div className="hint">permissible {result.extrusionGap.allowableMm !== null ? `${fmtU(result.extrusionGap.allowableMm, unitSystem, UNIT_LENGTH, 3)} ${lenUnit}` : '— beyond table'}</div>
                </div>
              )}
              {result.equivalentDiameterMm !== null && (
                <div className="result-tile">
                  <div className="label">Equivalent groove Ø</div>
                  <div className="value">{fmtU(result.equivalentDiameterMm, unitSystem, UNIT_LENGTH, 2)}<span className="unit">{lenUnit}</span></div>
                  <div className="hint">L/π from the neutral-axis path</div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Gland cross-section</div>
            <ORingGlandDiagram
              sealType={sealType}
              pressureDirection={pressureDirection}
              sealDiameterMm={sealType === 'outerRadial' ? boreDia.nom : rodDia.nom}
              grooveDiameterMm={sealType === 'outerRadial' ? grooveRootDia.nom : housingGrooveDia.nom}
              counterDiameterMm={isRadial && useCounterDia ? (sealType === 'outerRadial' ? pistonLandDia.nom : rodBoreDia.nom) : null}
              grooveWidthMm={isRadial ? radialGrooveWidth.nom : isNonCircular ? ncGrooveWidth.nom : result.grooveWidthMm.nom}
              grooveOuterDiameterMm={grooveOuterDia.nom}
              grooveInnerDiameterMm={grooveInnerDia.nom}
              grooveDepthMm={isFace ? grooveDepth.nom : ncGrooveDepth.nom}
              perimeterMm={isNonCircular ? perimeterNom : undefined}
              rectWidthMm={isNonCircular && perimeterMode === 'rect' ? rectW : null}
              rectHeightMm={isNonCircular && perimeterMode === 'rect' ? rectH : null}
              rectCornerRadiusMm={isNonCircular && perimeterMode === 'rect' ? rectR : null}
              d1Mm={selectedSize.d1}
              squeezePct={result.squeezePct.nom}
              unitSystem={unitSystem}
            />
          </div>
        </div>
      </div>

      <SavedCalculations saves={saved.saves} loading={saved.loading} loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())} onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())} onRename={saved.rename} onDelete={saved.remove} />

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Method and limits follow the Trelleborg Sealing Solutions O-Rings design guide: initial-squeeze bands
          per cross-section and application (Figures 15/16 — chart-read values, so treat band edges as ±1%),
          installed stretch limited to 8% (d1 &lt; 50 mm) / 6% (d1 &gt; 50 mm), circumferential compression to 3%,
          cross-section reduction approximated as 0.5% per 1% of stretch, axial seals seated against the
          pressure-side groove wall (OD 1–2% over the outer wall for internal pressure, d1 1–3% under the inner
          wall for external), permissible extrusion clearances from Table XII (70/90 Shore A; 80 Shore uses the
          90-Shore table, which is optimistic — interpolate towards the 70-Shore values for marginal cases), and
          suggested groove dimensions from Table XV. Sizes and Class A inside-diameter tolerances are the
          AS568 / ISO 3601-1 values transcribed from published manufacturer tables; Class B tolerances
          interpolate a published DIN ISO 3601-1:2013 Class B table. ISO 286 fits are computed from the
          standard's formulas (they can differ from the rounded table values by a micron or two). Gland fill is
          computed against a rectangular idealised groove (corner radii and the clearance-gap volume neglected —
          slightly conservative) with the ≤75% nominal / ≤85% worst-case limits used across industry gland
          calculators. Worst cases stack every tolerance at its unfavourable limit simultaneously. Material
          temperature ranges are typical compound values from the guide — the specific compound datasheet and
          medium compatibility (including swell, which eats gland-fill margin) govern. Non-circular grooves use
          the neutral-axis length method with common-practice corner-radius guidance (r ≥ 3×d2 recommended,
          ≥ 2×d2 minimum). This is an estimation tool — have the final gland reviewed by your seal supplier.
        </p>
        <p className="note">
          <b>Validated:</b> a hand-worked static outer-radial (piston) seal — 20 mm d1, 3 mm cross-section,
          20.4 mm groove root (2.0% stretch), 25.8 mm bore, 4.4 mm groove width — should give 2.97 mm effective
          cross-section after stretch-thinning, 9.09% squeeze (0.27 mm), and 58.3% gland fill by hand; this
          calculator returns all four numbers exactly.
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
