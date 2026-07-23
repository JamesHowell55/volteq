import { useCallback, useMemo, useState } from 'react';
import {
  solveBeam,
  rectangleSection,
  circularSolidSection,
  circularTubeSection,
  BEAM_MATERIAL_PRESETS,
  type BeamSupportType,
  type FixedEnd,
  type BeamLoad,
  type LoadKind,
  type SectionProperties,
} from '../lib/beamPhysics';
import BeamDiagram from '../components/BeamDiagram';
import BeamResponseChart from '../components/BeamResponseChart';
import SavedCalculations from '../components/SavedCalculations';
import PremiumGate from '../components/PremiumGate';
import CalculatorActions from '../components/CalculatorActions';
import { useSavedCalculations } from '../lib/useSavedCalculations';
import { useBranding } from '../lib/useBranding';
import { useTheme } from '../lib/ThemeContext';
import { deriveAccentOnLight } from '../lib/theme';
import { useUnitSystem } from '../lib/UnitSystemContext';
import { toDisplay, fromDisplay, unitLabel, UNIT_LENGTH, UNIT_FORCE, UNIT_MOMENT, UNIT_STIFFNESS, UNIT_MODULUS, UNIT_STRESS, UNIT_AREA_MOMENT } from '../lib/globalUnits';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { renderBeamSchematicSvg, renderBeamResponseChartSvg, type PdfBeamSupport, type PdfBeamLoad } from '../lib/pdfDiagrams';

type SectionShape = 'rectangle' | 'circular' | 'tube' | 'custom';
type ChartKind = 'schematic' | 'shear' | 'moment' | 'deflection' | null;

let nextLoadId = 0;
const newLoad = (kind: LoadKind, position: number, magnitude: number): BeamLoad => ({
  id: `ld-${nextLoadId++}`,
  kind,
  label: '',
  position,
  endPosition: position + 200,
  magnitude,
  endMagnitude: magnitude,
});

const LOAD_KIND_LABEL: Record<LoadKind, string> = {
  'point-force': 'Point force',
  'point-moment': 'Point moment',
  distributed: 'Distributed load',
};

export default function BeamCalculator() {
  const { unitSystem } = useUnitSystem();
  const { accentHex } = useTheme();
  const branding = useBranding();
  const saved = useSavedCalculations('beam-bending');

  const [length, setLength] = useState(2000);
  const [supportType, setSupportType] = useState<BeamSupportType>('simply-supported');
  const [fixedEnd, setFixedEnd] = useState<FixedEnd>('left');
  const [propPosition, setPropPosition] = useState(2000);
  const [supportAPosition, setSupportAPosition] = useState(0);
  const [supportBPosition, setSupportBPosition] = useState(2000);

  const [materialId, setMaterialId] = useState('steel');
  const [customE, setCustomE] = useState(200000);
  const material = BEAM_MATERIAL_PRESETS.find((m) => m.id === materialId) ?? BEAM_MATERIAL_PRESETS[0];
  const E = materialId === 'custom' ? customE : material.E;

  const [sectionShape, setSectionShape] = useState<SectionShape>('rectangle');
  const [rectWidth, setRectWidth] = useState(50);
  const [rectHeight, setRectHeight] = useState(100);
  const [circDiameter, setCircDiameter] = useState(60);
  const [tubeOuter, setTubeOuter] = useState(60);
  const [tubeInner, setTubeInner] = useState(48);
  const [customI, setCustomI] = useState(4166667);
  const [customC, setCustomC] = useState(50);

  const [allowableStress, setAllowableStress] = useState(250);

  const [loads, setLoads] = useState<BeamLoad[]>([newLoad('point-force', 1000, 5000)]);
  const [chartExpanded, setChartExpanded] = useState<ChartKind>(null);

  const addLoad = (kind: LoadKind) => setLoads((prev) => [...prev, newLoad(kind, Math.round(length / 2), kind === 'distributed' ? 5 : 5000)]);
  const updateLoad = (id: string, patch: Partial<BeamLoad>) => setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLoad = (id: string) => setLoads((prev) => prev.filter((l) => l.id !== id));

  const section: SectionProperties = useMemo(() => {
    if (sectionShape === 'rectangle') return rectangleSection(rectWidth, rectHeight);
    if (sectionShape === 'circular') return circularSolidSection(circDiameter);
    if (sectionShape === 'tube') return circularTubeSection(tubeOuter, tubeInner);
    return { I: customI, c: customC };
  }, [sectionShape, rectWidth, rectHeight, circDiameter, tubeOuter, tubeInner, customI, customC]);

  const configValid =
    length > 0 &&
    section.I > 0 &&
    E > 0 &&
    (supportType !== 'propped-cantilever' || (propPosition > 0 && propPosition <= length)) &&
    (supportType !== 'overhanging' || (supportAPosition >= 0 && supportBPosition > supportAPosition && supportBPosition <= length)) &&
    loads.every((l) => l.kind !== 'distributed' || l.endPosition > l.position);

  const config = useMemo(
    () => ({ length, supportType, fixedEnd, propPosition, supportAPosition, supportBPosition }),
    [length, supportType, fixedEnd, propPosition, supportAPosition, supportBPosition],
  );

  const result = useMemo(() => {
    if (!configValid) return null;
    try {
      return solveBeam(config, loads, { E }, section);
    } catch {
      return null;
    }
  }, [configValid, config, loads, E, section]);

  const passes = result && allowableStress > 0 ? result.maxBendingStress <= allowableStress : null;

  const xs = result?.points.map((p) => p.x) ?? [];
  const shearValues = result?.points.map((p) => p.shear) ?? [];
  const momentValues = result?.points.map((p) => p.moment) ?? [];
  const deflectionValues = result?.points.map((p) => p.deflection) ?? [];

  const supportsForPdf: PdfBeamSupport[] = useMemo(() => {
    switch (supportType) {
      case 'simply-supported':
        return [{ x: 0, kind: 'pin' }, { x: length, kind: 'roller' }];
      case 'overhanging':
        return [{ x: supportAPosition, kind: 'pin' }, { x: supportBPosition, kind: 'roller' }];
      case 'cantilever':
        return [{ x: fixedEnd === 'left' ? 0 : length, kind: 'fixed' }];
      case 'propped-cantilever':
        return [{ x: fixedEnd === 'left' ? 0 : length, kind: 'fixed' }, { x: propPosition, kind: 'roller' }];
      case 'fixed-fixed':
        return [{ x: 0, kind: 'fixed' }, { x: length, kind: 'fixed' }];
    }
  }, [supportType, fixedEnd, propPosition, supportAPosition, supportBPosition, length]);

  const loadsForPdf: PdfBeamLoad[] = loads.map((l) => ({ kind: l.kind, position: l.position, endPosition: l.endPosition, magnitude: l.magnitude, endMagnitude: l.endMagnitude }));

  const getInputs = useCallback(
    () => ({
      length,
      supportType,
      fixedEnd,
      propPosition,
      supportAPosition,
      supportBPosition,
      materialId,
      customE,
      sectionShape,
      rectWidth,
      rectHeight,
      circDiameter,
      tubeOuter,
      tubeInner,
      customI,
      customC,
      allowableStress,
      loads: loads.map(({ id: _id, ...rest }) => rest),
    }),
    [length, supportType, fixedEnd, propPosition, supportAPosition, supportBPosition, materialId, customE, sectionShape, rectWidth, rectHeight, circDiameter, tubeOuter, tubeInner, customI, customC, allowableStress, loads],
  );

  const restoreInputs = useCallback((inp: Record<string, unknown>) => {
    if (typeof inp.length === 'number') setLength(inp.length);
    if (typeof inp.supportType === 'string') setSupportType(inp.supportType as BeamSupportType);
    if (typeof inp.fixedEnd === 'string') setFixedEnd(inp.fixedEnd as FixedEnd);
    if (typeof inp.propPosition === 'number') setPropPosition(inp.propPosition);
    if (typeof inp.supportAPosition === 'number') setSupportAPosition(inp.supportAPosition);
    if (typeof inp.supportBPosition === 'number') setSupportBPosition(inp.supportBPosition);
    if (typeof inp.materialId === 'string') setMaterialId(inp.materialId);
    if (typeof inp.customE === 'number') setCustomE(inp.customE);
    if (typeof inp.sectionShape === 'string') setSectionShape(inp.sectionShape as SectionShape);
    if (typeof inp.rectWidth === 'number') setRectWidth(inp.rectWidth);
    if (typeof inp.rectHeight === 'number') setRectHeight(inp.rectHeight);
    if (typeof inp.circDiameter === 'number') setCircDiameter(inp.circDiameter);
    if (typeof inp.tubeOuter === 'number') setTubeOuter(inp.tubeOuter);
    if (typeof inp.tubeInner === 'number') setTubeInner(inp.tubeInner);
    if (typeof inp.customI === 'number') setCustomI(inp.customI);
    if (typeof inp.customC === 'number') setCustomC(inp.customC);
    if (typeof inp.allowableStress === 'number') setAllowableStress(inp.allowableStress);
    if (Array.isArray(inp.loads)) {
      setLoads(
        inp.loads.map((l) => {
          const load = l as Omit<BeamLoad, 'id'>;
          return { ...load, id: `ld-${nextLoadId++}` };
        }),
      );
    }
  }, []);

  const handleExportPdf = () => {
    if (!result) return;
    const pdfAccent = deriveAccentOnLight(accentHex);

    const inputSections: ReportSection[] = [
      {
        heading: 'Beam configuration',
        rows: [
          { label: 'Support type', value: SUPPORT_TYPE_LABEL[supportType] },
          { label: 'Length', value: `${toDisplay(length, unitSystem, UNIT_LENGTH).toFixed(1)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          ...(supportType === 'cantilever' || supportType === 'propped-cantilever' ? [{ label: 'Fixed end', value: fixedEnd }] : []),
          ...(supportType === 'propped-cantilever' ? [{ label: 'Prop position', value: `${toDisplay(propPosition, unitSystem, UNIT_LENGTH).toFixed(1)} ${unitLabel(unitSystem, UNIT_LENGTH)}` }] : []),
          ...(supportType === 'overhanging'
            ? [
                { label: 'Support A position', value: `${toDisplay(supportAPosition, unitSystem, UNIT_LENGTH).toFixed(1)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
                { label: 'Support B position', value: `${toDisplay(supportBPosition, unitSystem, UNIT_LENGTH).toFixed(1)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
              ]
            : []),
        ],
      },
      {
        heading: 'Section & material',
        rows: [
          { label: 'Material', value: materialId === 'custom' ? 'Custom' : material.label },
          { label: "Young's modulus E", value: `${toDisplay(E, unitSystem, UNIT_MODULUS).toFixed(2)} ${unitLabel(unitSystem, UNIT_MODULUS)}` },
          { label: 'Section shape', value: sectionShape },
          { label: 'Second moment of area I', value: `${toDisplay(section.I, unitSystem, UNIT_AREA_MOMENT).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitLabel(unitSystem, UNIT_AREA_MOMENT)}` },
          { label: 'Extreme fibre distance c', value: `${toDisplay(section.c, unitSystem, UNIT_LENGTH).toFixed(2)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          ...(allowableStress > 0 ? [{ label: 'Allowable bending stress', value: `${toDisplay(allowableStress, unitSystem, UNIT_STRESS).toFixed(1)} ${unitLabel(unitSystem, UNIT_STRESS)}` }] : []),
        ],
      },
      {
        heading: 'Loads',
        rows: loads.map((l, i) => ({
          label: `${i + 1}. ${LOAD_KIND_LABEL[l.kind]} @ ${toDisplay(l.position, unitSystem, UNIT_LENGTH).toFixed(0)}${l.kind === 'distributed' ? `–${toDisplay(l.endPosition, unitSystem, UNIT_LENGTH).toFixed(0)}` : ''} ${unitLabel(unitSystem, UNIT_LENGTH)}`,
          value: loadMagnitudeLabel(l, unitSystem),
        })),
      },
    ];

    const outputSections: ReportSection[] = [
      {
        heading: 'Reactions',
        rows: result.reactions.map((r) => ({
          label: `${r.label} @ ${toDisplay(r.position, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}`,
          value: r.kind === 'force' ? `${toDisplay(r.value, unitSystem, UNIT_FORCE).toFixed(1)} ${unitLabel(unitSystem, UNIT_FORCE)}` : `${toDisplay(r.value, unitSystem, UNIT_MOMENT).toFixed(1)} ${unitLabel(unitSystem, UNIT_MOMENT)}`,
        })),
      },
      {
        heading: 'Extremes',
        rows: [
          { label: 'Max shear', value: `${toDisplay(result.maxShear.value, unitSystem, UNIT_FORCE).toFixed(1)} ${unitLabel(unitSystem, UNIT_FORCE)} @ ${toDisplay(result.maxShear.x, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          { label: 'Min shear', value: `${toDisplay(result.minShear.value, unitSystem, UNIT_FORCE).toFixed(1)} ${unitLabel(unitSystem, UNIT_FORCE)} @ ${toDisplay(result.minShear.x, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          { label: 'Max moment', value: `${toDisplay(result.maxMoment.value, unitSystem, UNIT_MOMENT).toFixed(1)} ${unitLabel(unitSystem, UNIT_MOMENT)} @ ${toDisplay(result.maxMoment.x, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          { label: 'Min moment', value: `${toDisplay(result.minMoment.value, unitSystem, UNIT_MOMENT).toFixed(1)} ${unitLabel(unitSystem, UNIT_MOMENT)} @ ${toDisplay(result.minMoment.x, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          { label: 'Max deflection', value: `${toDisplay(result.maxDeflection.value, unitSystem, UNIT_LENGTH).toFixed(3)} ${unitLabel(unitSystem, UNIT_LENGTH)} @ ${toDisplay(result.maxDeflection.x, unitSystem, UNIT_LENGTH).toFixed(0)} ${unitLabel(unitSystem, UNIT_LENGTH)}` },
          { label: 'Max bending stress', value: `${toDisplay(result.maxBendingStress, unitSystem, UNIT_STRESS).toFixed(1)} ${unitLabel(unitSystem, UNIT_STRESS)}` },
        ],
      },
    ];

    const calculationSteps: CalcStepData[] = [
      {
        title: 'Support reactions',
        formula: result.indeterminacyDegree > 0 ? 'Force (flexibility) method — unit-load / virtual-work compatibility' : 'Static equilibrium: ΣFy = 0, ΣM = 0',
        substitution: result.indeterminacyDegree > 0 ? `Statically indeterminate to degree ${result.indeterminacyDegree}` : 'Statically determinate',
        result: result.reactions.map((r) => `${r.label}: ${r.kind === 'force' ? `${r.value.toFixed(1)} N` : `${r.value.toFixed(1)} N·mm`}`).join('; '),
      },
      {
        title: 'Maximum bending moment',
        formula: 'M(x), evaluated by superposition of every load’s contribution to the section moment',
        result: `${Math.max(Math.abs(result.maxMoment.value), Math.abs(result.minMoment.value)).toFixed(1)} N·mm at x = ${result.maxMoment.value >= Math.abs(result.minMoment.value) ? result.maxMoment.x.toFixed(0) : result.minMoment.x.toFixed(0)} mm`,
      },
      {
        title: 'Maximum deflection',
        formula: 'θ(x) = ∫M(x)/EI dx,  y(x) = ∫θ(x) dx, constants fixed by this configuration’s zero-deflection/zero-slope conditions',
        substitution: `EI = ${E.toFixed(0)} MPa × ${section.I.toFixed(1)} mm⁴ = ${(E * section.I).toExponential(3)} N·mm²`,
        result: `${result.maxDeflection.value.toFixed(3)} mm at x = ${result.maxDeflection.x.toFixed(0)} mm`,
      },
      {
        title: 'Bending stress check',
        formula: 'σ = M·c / I',
        substitution: `σ = ${Math.max(Math.abs(result.maxMoment.value), Math.abs(result.minMoment.value)).toFixed(0)} N·mm × ${section.c.toFixed(2)} mm / ${section.I.toFixed(1)} mm⁴`,
        result: allowableStress > 0 ? `${result.maxBendingStress.toFixed(1)} MPa vs ${allowableStress.toFixed(1)} MPa allowable — ${passes ? 'PASS' : 'FAIL'}` : `${result.maxBendingStress.toFixed(1)} MPa`,
      },
    ];

    exportReportToPdf({
      tabName: 'Beam_Bending_Calculator',
      pageTitle: 'Beam Bending Calculator',
      accentHex,
      passStatus: passes !== null ? { pass: passes, label: passes ? 'Within allowable stress' : 'Exceeds allowable stress' } : null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [
        { title: 'Beam schematic', svgMarkup: renderBeamSchematicSvg(length, supportsForPdf, loadsForPdf, pdfAccent) },
        { title: 'Shear force diagram', svgMarkup: renderBeamResponseChartSvg(xs, shearValues, '#0284C7', 'N', 'Shear') },
        { title: 'Bending moment diagram', svgMarkup: renderBeamResponseChartSvg(xs, momentValues, pdfAccent, 'N·mm', 'Moment') },
        { title: 'Deflected shape', svgMarkup: renderBeamResponseChartSvg(xs, deflectionValues, '#CA8A04', 'mm', 'Deflection') },
      ],
      disclaimer: 'Engineering estimation tool. Beam bending per Euler-Bernoulli theory (plane sections remain plane, small deflections, linear-elastic, prismatic uniform section); statically indeterminate reactions solved by the unit-load (virtual-work) method. Cross-checked against Roark’s Formulas for Stress and Strain (Table 3) standard cases. Verify against the referenced standards and, where required, physical testing.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">● Mechanical</div>
          <h1>Beam Bending Calculator</h1>
          <p>
            Reactions, shear force, bending moment, and deflection for simply supported, cantilever, fixed-fixed,
            propped-cantilever, and overhanging beams under any combination of point loads, point moments, and
            distributed loads — solved numerically (unit-load / virtual-work method for indeterminate cases),
            cross-checked against Roark's Formulas for Stress and Strain.
          </p>
        </div>
        <CalculatorActions saved={saved} getInputs={getInputs}>
          <PremiumGate feature="PDF export">
            <button className="btn primary" onClick={handleExportPdf} disabled={!result}>Export PDF</button>
          </PremiumGate>
        </CalculatorActions>
      </div>

      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-title"><span><span className="step-num">1</span>Beam configuration</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Support type</label>
                <select value={supportType} onChange={(e) => setSupportType(e.target.value as BeamSupportType)}>
                  <option value="simply-supported">Simply supported</option>
                  <option value="cantilever">Cantilever</option>
                  <option value="fixed-fixed">Fixed-fixed</option>
                  <option value="propped-cantilever">Propped cantilever</option>
                  <option value="overhanging">Overhanging</option>
                </select>
              </div>
              <div className="field">
                <label>Length ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                <input type="number" min={0.1} value={toDisplay(length, unitSystem, UNIT_LENGTH)} onChange={(e) => setLength(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
              </div>

              {(supportType === 'cantilever' || supportType === 'propped-cantilever') && (
                <div className="field">
                  <label>Fixed end</label>
                  <div className="segmented">
                    <button type="button" className={fixedEnd === 'left' ? 'active' : ''} onClick={() => setFixedEnd('left')}>Left</button>
                    <button type="button" className={fixedEnd === 'right' ? 'active' : ''} onClick={() => setFixedEnd('right')}>Right</button>
                  </div>
                </div>
              )}
              {supportType === 'propped-cantilever' && (
                <div className="field">
                  <label>Prop position ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input type="number" min={0.1} value={toDisplay(propPosition, unitSystem, UNIT_LENGTH)} onChange={(e) => setPropPosition(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              )}
              {supportType === 'overhanging' && (
                <>
                  <div className="field">
                    <label>Support A position ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0} value={toDisplay(supportAPosition, unitSystem, UNIT_LENGTH)} onChange={(e) => setSupportAPosition(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Support B position ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0} value={toDisplay(supportBPosition, unitSystem, UNIT_LENGTH)} onChange={(e) => setSupportBPosition(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </>
              )}
            </div>
            {!configValid && <p className="note" style={{ color: 'var(--neg)', marginTop: '0.75rem' }}>Check the configuration above — support positions must lie on the beam and be correctly ordered.</p>}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Section &amp; material</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Material</label>
                <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                  {BEAM_MATERIAL_PRESETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              {materialId === 'custom' && (
                <div className="field">
                  <label>Young's modulus E ({unitLabel(unitSystem, UNIT_MODULUS)})</label>
                  <input type="number" min={0.001} value={toDisplay(customE, unitSystem, UNIT_MODULUS)} onChange={(e) => setCustomE(fromDisplay(Number(e.target.value), unitSystem, UNIT_MODULUS))} />
                </div>
              )}
              <div className="field">
                <label>Section shape</label>
                <select value={sectionShape} onChange={(e) => setSectionShape(e.target.value as SectionShape)}>
                  <option value="rectangle">Rectangular</option>
                  <option value="circular">Circular solid</option>
                  <option value="tube">Circular tube</option>
                  <option value="custom">Custom (I &amp; c)</option>
                </select>
              </div>
              <div />

              {sectionShape === 'rectangle' && (
                <>
                  <div className="field">
                    <label>Width ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0.01} value={toDisplay(rectWidth, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectWidth(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Height ({unitLabel(unitSystem, UNIT_LENGTH)}, bending axis)</label>
                    <input type="number" min={0.01} value={toDisplay(rectHeight, unitSystem, UNIT_LENGTH)} onChange={(e) => setRectHeight(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </>
              )}
              {sectionShape === 'circular' && (
                <div className="field">
                  <label>Diameter ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                  <input type="number" min={0.01} value={toDisplay(circDiameter, unitSystem, UNIT_LENGTH)} onChange={(e) => setCircDiameter(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                </div>
              )}
              {sectionShape === 'tube' && (
                <>
                  <div className="field">
                    <label>Outer diameter ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0.01} value={toDisplay(tubeOuter, unitSystem, UNIT_LENGTH)} onChange={(e) => setTubeOuter(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                  <div className="field">
                    <label>Inner diameter ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0} value={toDisplay(tubeInner, unitSystem, UNIT_LENGTH)} onChange={(e) => setTubeInner(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </>
              )}
              {sectionShape === 'custom' && (
                <>
                  <div className="field">
                    <label>Second moment of area I ({unitLabel(unitSystem, UNIT_AREA_MOMENT)})</label>
                    <input type="number" min={0.001} value={toDisplay(customI, unitSystem, UNIT_AREA_MOMENT)} onChange={(e) => setCustomI(fromDisplay(Number(e.target.value), unitSystem, UNIT_AREA_MOMENT))} />
                  </div>
                  <div className="field">
                    <label>Extreme fibre distance c ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" min={0.001} value={toDisplay(customC, unitSystem, UNIT_LENGTH)} onChange={(e) => setCustomC(fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH))} />
                  </div>
                </>
              )}

              <div className="field">
                <label>Allowable bending stress ({unitLabel(unitSystem, UNIT_STRESS)})</label>
                <input type="number" min={0} value={toDisplay(allowableStress, unitSystem, UNIT_STRESS)} onChange={(e) => setAllowableStress(fromDisplay(Number(e.target.value), unitSystem, UNIT_STRESS))} />
                <span className="hint">0 to skip the pass/fail check</span>
              </div>
            </div>
            <p className="note" style={{ marginTop: '0.75rem' }}>
              I = {section.I.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm⁴ &middot; c = {section.c.toFixed(2)} mm
            </p>
          </div>

          <div className="card">
            <div className="card-title">
              <span><span className="step-num">3</span>Loads</span>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn small" onClick={() => addLoad('point-force')}>+ Point force</button>
                <button className="btn small" onClick={() => addLoad('point-moment')}>+ Moment</button>
                <button className="btn small" onClick={() => addLoad('distributed')}>+ Distributed</button>
              </span>
            </div>
            {loads.length === 0 && <p className="hint">Add at least one load.</p>}
            {loads.map((l, i) => (
              <div className="step-row" key={l.id} style={{ gridTemplateColumns: l.kind === 'distributed' ? '28px 1fr 1fr 1fr 1fr auto' : '28px 1fr 1fr auto' }}>
                <div className="bar-index">{i + 1}</div>
                <div className="field">
                  <label>{LOAD_KIND_LABEL[l.kind]}</label>
                  <input
                    type="number"
                    value={toDisplay(l.position, unitSystem, UNIT_LENGTH)}
                    onChange={(e) => updateLoad(l.id, { position: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })}
                    placeholder={`position (${unitLabel(unitSystem, UNIT_LENGTH)})`}
                  />
                </div>
                {l.kind === 'distributed' && (
                  <div className="field">
                    <label>End position ({unitLabel(unitSystem, UNIT_LENGTH)})</label>
                    <input type="number" value={toDisplay(l.endPosition, unitSystem, UNIT_LENGTH)} onChange={(e) => updateLoad(l.id, { endPosition: fromDisplay(Number(e.target.value), unitSystem, UNIT_LENGTH) })} />
                  </div>
                )}
                <div className="field">
                  <label>{l.kind === 'distributed' ? `Start (${unitLabel(unitSystem, UNIT_STIFFNESS)})` : `Magnitude (${unitLabel(unitSystem, l.kind === 'point-moment' ? UNIT_MOMENT : UNIT_FORCE)})`}</label>
                  <input
                    type="number"
                    value={toDisplay(l.magnitude, unitSystem, l.kind === 'point-moment' ? UNIT_MOMENT : l.kind === 'distributed' ? UNIT_STIFFNESS : UNIT_FORCE)}
                    onChange={(e) => updateLoad(l.id, { magnitude: fromDisplay(Number(e.target.value), unitSystem, l.kind === 'point-moment' ? UNIT_MOMENT : l.kind === 'distributed' ? UNIT_STIFFNESS : UNIT_FORCE) })}
                  />
                </div>
                {l.kind === 'distributed' && (
                  <div className="field">
                    <label>End ({unitLabel(unitSystem, UNIT_STIFFNESS)})</label>
                    <input type="number" value={toDisplay(l.endMagnitude, unitSystem, UNIT_STIFFNESS)} onChange={(e) => updateLoad(l.id, { endMagnitude: fromDisplay(Number(e.target.value), unitSystem, UNIT_STIFFNESS) })} />
                  </div>
                )}
                <button className="btn small danger" onClick={() => removeLoad(l.id)}>Remove</button>
              </div>
            ))}
            <p className="hint" style={{ marginTop: '0.6rem' }}>Positive values act downward (point/distributed) or clockwise (moment).</p>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Results</div>
            {passes !== null && (
              <div className={`status-banner ${passes ? 'pass' : 'fail'}`}>
                {passes ? '✓ Within allowable bending stress' : '✗ Exceeds allowable bending stress'}
              </div>
            )}
            {result ? (
              <div className="result-grid">
                {result.reactions.map((r, i) => (
                  <div className="result-tile" key={i}>
                    <div className="label">{r.label}</div>
                    <div className="value">
                      {r.kind === 'force' ? toDisplay(r.value, unitSystem, UNIT_FORCE).toFixed(1) : toDisplay(r.value, unitSystem, UNIT_MOMENT).toFixed(1)}
                      <span className="unit">{r.kind === 'force' ? unitLabel(unitSystem, UNIT_FORCE) : unitLabel(unitSystem, UNIT_MOMENT)}</span>
                    </div>
                  </div>
                ))}
                <div className="result-tile">
                  <div className="label">Max moment</div>
                  <div className="value">{toDisplay(Math.max(Math.abs(result.maxMoment.value), Math.abs(result.minMoment.value)), unitSystem, UNIT_MOMENT).toFixed(1)}<span className="unit">{unitLabel(unitSystem, UNIT_MOMENT)}</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Max shear</div>
                  <div className="value">{toDisplay(Math.max(Math.abs(result.maxShear.value), Math.abs(result.minShear.value)), unitSystem, UNIT_FORCE).toFixed(1)}<span className="unit">{unitLabel(unitSystem, UNIT_FORCE)}</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Max deflection</div>
                  <div className="value">{toDisplay(result.maxDeflection.value, unitSystem, UNIT_LENGTH).toFixed(3)}<span className="unit">{unitLabel(unitSystem, UNIT_LENGTH)}</span></div>
                </div>
                <div className="result-tile">
                  <div className="label">Max bending stress</div>
                  <div className={`value ${passes === false ? 'neg' : ''}`}>{toDisplay(result.maxBendingStress, unitSystem, UNIT_STRESS).toFixed(1)}<span className="unit">{unitLabel(unitSystem, UNIT_STRESS)}</span></div>
                </div>
              </div>
            ) : (
              <p className="note">Fix the configuration to see results.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Beam schematic
              <button className="icon-btn" onClick={() => setChartExpanded('schematic')} title="Expand" aria-label="Expand">⛶</button>
            </div>
            <BeamDiagram config={config} loads={loads} points={result?.points ?? []} showDeflection={!!result} />
          </div>

          <div className="card">
            <div className="card-title">
              Shear force diagram
              <button className="icon-btn" onClick={() => setChartExpanded('shear')} title="Expand" aria-label="Expand">⛶</button>
            </div>
            <BeamResponseChart xs={xs} values={shearValues.map((v) => toDisplay(v, unitSystem, UNIT_FORCE))} color="var(--blue)" unit={unitLabel(unitSystem, UNIT_FORCE)} valueLabel="Shear" />
          </div>

          <div className="card">
            <div className="card-title">
              Bending moment diagram
              <button className="icon-btn" onClick={() => setChartExpanded('moment')} title="Expand" aria-label="Expand">⛶</button>
            </div>
            <BeamResponseChart xs={xs} values={momentValues.map((v) => toDisplay(v, unitSystem, UNIT_MOMENT))} color="var(--accent)" unit={unitLabel(unitSystem, UNIT_MOMENT)} valueLabel="Moment" />
          </div>

          <div className="card">
            <div className="card-title">
              Deflected shape
              <button className="icon-btn" onClick={() => setChartExpanded('deflection')} title="Expand" aria-label="Expand">⛶</button>
            </div>
            <BeamResponseChart xs={xs} values={deflectionValues.map((v) => toDisplay(v, unitSystem, UNIT_LENGTH))} color="var(--warn)" unit={unitLabel(unitSystem, UNIT_LENGTH)} valueLabel="Deflection" decimals={3} />
          </div>
        </div>
      </div>

      <SavedCalculations
        saves={saved.saves}
        loading={saved.loading}
        loggedIn={saved.loggedIn}
        onSave={(label) => saved.save(label, getInputs())}
        onLoad={restoreInputs}
        onUpdate={(id) => saved.update(id, getInputs())}
        onRename={saved.rename}
        onDelete={saved.remove}
      />

      <div className="card">
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Assumes Euler-Bernoulli beam theory: a prismatic (uniform cross-section), linear-elastic, straight beam
          with small deflections, where plane sections remain plane. Statically determinate configurations (simply
          supported, cantilever, overhanging) are solved directly from static equilibrium; statically indeterminate
          configurations (fixed-fixed, propped-cantilever) are solved by the force (flexibility) method, using the
          unit-load / virtual-work theorem to enforce zero deflection/slope at the redundant support(s). Deflection
          is found by numerically double-integrating M(x)/EI. Results are cross-checked against the standard cases
          tabulated in Roark's Formulas for Stress and Strain (Table 3: shear, moment, slope, and deflection
          formulas for elastic straight beams). Shear/moment sign convention: upward reactions and sagging moments
          are positive; loads are entered positive-downward.
        </p>
      </div>

      {result && (
        <div className="card">
          <div className="card-title">Calculation steps</div>
          <div className="calc-step">
            <div className="step-title">1. Support reactions</div>
            <div className="step-formula">{result.indeterminacyDegree > 0 ? 'Force method (unit-load / virtual-work compatibility)' : 'Static equilibrium: ΣFy = 0, ΣM = 0'}</div>
            <div className="step-sub">{result.indeterminacyDegree > 0 ? `Statically indeterminate to degree ${result.indeterminacyDegree}` : 'Statically determinate'}</div>
            <div className="step-result">{result.reactions.map((r) => `${r.label}: ${r.kind === 'force' ? `${r.value.toFixed(1)} N` : `${r.value.toFixed(1)} N·mm`}`).join(' · ')}</div>
          </div>
          <div className="calc-step">
            <div className="step-title">2. Maximum bending moment</div>
            <div className="step-formula">M(x) — superposition of every load's contribution to the section moment</div>
            <div className="step-result"><b>{Math.max(Math.abs(result.maxMoment.value), Math.abs(result.minMoment.value)).toFixed(1)} N·mm</b> at x = {(result.maxMoment.value >= Math.abs(result.minMoment.value) ? result.maxMoment.x : result.minMoment.x).toFixed(0)} mm</div>
          </div>
          <div className="calc-step">
            <div className="step-title">3. Maximum deflection</div>
            <div className="step-formula">θ(x) = ∫M(x)/EI dx, y(x) = ∫θ(x) dx</div>
            <div className="step-sub">EI = {E.toFixed(0)} MPa × {section.I.toFixed(1)} mm⁴ = {(E * section.I).toExponential(3)} N·mm²</div>
            <div className="step-result"><b>{result.maxDeflection.value.toFixed(3)} mm</b> at x = {result.maxDeflection.x.toFixed(0)} mm</div>
          </div>
          <div className="calc-step">
            <div className="step-title">4. Bending stress check</div>
            <div className="step-formula">σ = M·c / I</div>
            <div className="step-sub">σ = {Math.max(Math.abs(result.maxMoment.value), Math.abs(result.minMoment.value)).toFixed(0)} N·mm × {section.c.toFixed(2)} mm / {section.I.toFixed(1)} mm⁴</div>
            <div className="step-result">
              <b>{result.maxBendingStress.toFixed(1)} MPa</b>
              {allowableStress > 0 && ` vs ${allowableStress.toFixed(1)} MPa allowable — ${passes ? 'PASS' : 'FAIL'}`}
            </div>
          </div>
        </div>
      )}

      {chartExpanded && (
        <div className="chart-modal-backdrop" onClick={() => setChartExpanded(null)}>
          <div className="chart-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="card-title">
              {chartExpanded === 'schematic' ? 'Beam schematic' : chartExpanded === 'shear' ? 'Shear force diagram' : chartExpanded === 'moment' ? 'Bending moment diagram' : 'Deflected shape'}
              <button className="icon-btn" onClick={() => setChartExpanded(null)} title="Close" aria-label="Close">✕</button>
            </div>
            <div className="chart-modal-body">
              {chartExpanded === 'schematic' && <BeamDiagram config={config} loads={loads} points={result?.points ?? []} showDeflection={!!result} />}
              {chartExpanded === 'shear' && <BeamResponseChart xs={xs} values={shearValues.map((v) => toDisplay(v, unitSystem, UNIT_FORCE))} color="var(--blue)" unit={unitLabel(unitSystem, UNIT_FORCE)} valueLabel="Shear" />}
              {chartExpanded === 'moment' && <BeamResponseChart xs={xs} values={momentValues.map((v) => toDisplay(v, unitSystem, UNIT_MOMENT))} color="var(--accent)" unit={unitLabel(unitSystem, UNIT_MOMENT)} valueLabel="Moment" />}
              {chartExpanded === 'deflection' && <BeamResponseChart xs={xs} values={deflectionValues.map((v) => toDisplay(v, unitSystem, UNIT_LENGTH))} color="var(--warn)" unit={unitLabel(unitSystem, UNIT_LENGTH)} valueLabel="Deflection" decimals={3} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SUPPORT_TYPE_LABEL: Record<BeamSupportType, string> = {
  'simply-supported': 'Simply supported',
  cantilever: 'Cantilever',
  'fixed-fixed': 'Fixed-fixed',
  'propped-cantilever': 'Propped cantilever',
  overhanging: 'Overhanging',
};

function loadMagnitudeLabel(l: BeamLoad, unitSystem: Parameters<typeof toDisplay>[1]): string {
  if (l.kind === 'point-force') return `${toDisplay(l.magnitude, unitSystem, UNIT_FORCE).toFixed(1)} ${unitLabel(unitSystem, UNIT_FORCE)}`;
  if (l.kind === 'point-moment') return `${toDisplay(l.magnitude, unitSystem, UNIT_MOMENT).toFixed(1)} ${unitLabel(unitSystem, UNIT_MOMENT)}`;
  return `${toDisplay(l.magnitude, unitSystem, UNIT_STIFFNESS).toFixed(2)}–${toDisplay(l.endMagnitude, unitSystem, UNIT_STIFFNESS).toFixed(2)} ${unitLabel(unitSystem, UNIT_STIFFNESS)}`;
}
