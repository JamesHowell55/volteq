import { useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import InfoTooltip from '../components/InfoTooltip';
import BundleCrossSection, { type BundleWireVisual } from '../components/BundleCrossSection';
import { renderBundleCrossSectionSvg } from '../lib/pdfDiagrams';
import {
  WIRE_CONSTRUCTIONS, getWireConstruction, wireOverallDiameterMm, awgToDiameterMm,
  OVERBRAID_PRESETS, getOverbraid, COVERING_FAMILIES, getCoveringFamily, selectCoveringSize,
  PART_MARKING_PRESETS,
} from '../lib/harnessWireTypes';
import { packCircles, glenairFactorEstimate } from '../lib/bundlePacking';

function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

interface WireGroup {
  id: string;
  label: string;
  count: number;
  awg: number;
  constructionId: string;
}

let nextGroupId = 4;

export default function BundleDiameterCalculator() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [groups, setGroups] = useState<WireGroup[]>([
    { id: '1', label: 'Signal wires', count: 8, awg: 22, constructionId: 'm22759-32' },
    { id: '2', label: 'Twisted-pair signal', count: 4, awg: 24, constructionId: 'twisted-pair-m22759-34' },
    { id: '3', label: 'Shielded power', count: 2, awg: 20, constructionId: 'shielded-single' },
  ]);
  const addGroup = () => setGroups((g) => [...g, { id: String(nextGroupId++), label: 'New group', count: 4, awg: 22, constructionId: 'm22759-32' }]);
  const removeGroup = (id: string) => setGroups((g) => g.filter((x) => x.id !== id));
  const updateGroup = (id: string, patch: Partial<WireGroup>) => setGroups((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const [overbraidId, setOverbraidId] = useState('none');
  const overbraid = getOverbraid(overbraidId);
  const [coveringFamilyId, setCoveringFamilyId] = useState('rnf-100');
  const coveringFamily = coveringFamilyId !== 'none' ? getCoveringFamily(coveringFamilyId) : undefined;
  const [partMarkingId, setPartMarkingId] = useState('none');
  const partMarking = PART_MARKING_PRESETS.find((p) => p.id === partMarkingId) ?? PART_MARKING_PRESETS[0];

  const allWires = useMemo(() => {
    const list: { id: number; diameterMm: number; construction: ReturnType<typeof getWireConstruction>; groupLabel: string; awg: number }[] = [];
    let id = 0;
    for (const g of groups) {
      const construction = getWireConstruction(g.constructionId);
      const d = wireOverallDiameterMm(construction, g.awg);
      for (let i = 0; i < Math.max(0, Math.round(g.count)); i++) {
        list.push({ id: id++, diameterMm: d, construction, groupLabel: g.label, awg: g.awg });
      }
    }
    return list;
  }, [groups]);

  const diametersMm = useMemo(() => allWires.map((w) => w.diameterMm), [allWires]);
  const packed = useMemo(() => packCircles(diametersMm), [diametersMm]);
  const glenair = useMemo(() => glenairFactorEstimate(diametersMm), [diametersMm]);

  // packCircles() places wires relative to wherever the first circle happened
  // to land, then separately computes the enclosing circle's true center —
  // the two are not the same point, so positions must be re-centered onto
  // (centerX, centerY) before drawing them relative to the boundary circles,
  // which are always drawn at the diagram's fixed centre.
  const wireVisuals: BundleWireVisual[] = useMemo(
    () => packed.positions.map((p) => ({ id: p.id, x: p.x - packed.centerX, y: p.y - packed.centerY, d: p.d, category: allWires[p.id]?.construction.category ?? 'single' })),
    [packed, allWires]
  );

  const bundleWithBraidMm = packed.bundleDiameterMm + 2 * overbraid.thicknessMm;
  const selectedCoveringSize = coveringFamily ? selectCoveringSize(coveringFamily, bundleWithBraidMm) : null;
  const coveringFits = !coveringFamily || selectedCoveringSize !== null;
  const finishedOuterDiameterMm = selectedCoveringSize ? bundleWithBraidMm + 2 * selectedCoveringSize.wallMm : (overbraid.thicknessMm > 0 ? bundleWithBraidMm : null);

  const totalCopperAreaMm2 = useMemo(
    () => allWires.reduce((sum, w) => {
      const conductorD = awgToDiameterMm(w.awg);
      const strands = w.construction.category === 'twistedPair' || w.construction.category === 'twistedShieldedPair' || w.construction.category === 'canBus' ? 2 : 1;
      return sum + strands * (Math.PI / 4) * conductorD * conductorD;
    }, 0),
    [allWires]
  );

  const totalWireCount = allWires.length;

  const calculationSteps: CalcStepData[] = useMemo(() => {
    const steps: CalcStepData[] = [
      {
        title: 'Per-wire overall diameter',
        formula: 'insulated OD = conductor(AWG) + 2·wall; twisted pair/shielded categories add layers concentrically (twisted OD = 2×insulated OD — the exact bounding-circle diameter for two touching equal circles)',
        substitution: `${groups.length} wire group(s), ${totalWireCount} wires total`,
        result: groups.map((g) => `${g.label}: ${g.count}× ${getWireConstruction(g.constructionId).label} @ ${g.awg}AWG = ⌀${fmt(wireOverallDiameterMm(getWireConstruction(g.constructionId), g.awg), 3)} mm each`).join(' | '),
      },
      {
        title: 'Bundle diameter — circle packing (drives the diagram)',
        formula: 'Greedy tangent-placement packing: largest wires placed first, each subsequent wire placed tangent to the pair of already-placed wires that keeps it closest to the running centroid; bundle boundary = minimum enclosing circle of all placed wires',
        substitution: `${totalWireCount} wires packed`,
        result: `Bundle ⌀ = ${fmt(packed.bundleDiameterMm, 3)} mm (heuristic packing, not a proven-optimal solution)`,
      },
      {
        title: 'Bundle diameter — Glenair factor-table cross-check',
        formula: 'bundleDiameter = avgWireDiameter × factor(N), factor from the published Glenair Wire Bundle Diameter Calculator reference table (interpolated/extrapolated)',
        substitution: `avg diameter = ${fmt(glenair.avgDiameterMm, 3)} mm, N = ${totalWireCount}, factor = ${fmt(glenair.factor, 2)}`,
        result: `Bundle ⌀ (Glenair estimate) = ${fmt(glenair.bundleDiameterMm, 3)} mm — ${(Math.abs(packed.bundleDiameterMm - glenair.bundleDiameterMm) / glenair.bundleDiameterMm * 100).toFixed(1)}% difference from the packed result`,
      },
    ];
    if (overbraid.thicknessMm > 0) {
      steps.push({
        title: 'Overbraid',
        formula: 'OD += 2 × braid thickness',
        substitution: `${overbraid.label}, thickness = ${fmt(overbraid.thicknessMm, 2)} mm`,
        result: `⌀ after overbraid = ${fmt(bundleWithBraidMm, 3)} mm`,
      });
    }
    if (coveringFamily) {
      steps.push({
        title: `Main covering — ${coveringFamily.label}`,
        formula: 'Smallest standard size whose as-supplied (expanded) ID ≥ bundle OD selected; finished OD ≈ bundle OD + 2×recovered wall (tubing/sleeve wraps snugly against the bundle regardless of exact shrink fraction — a first-order estimate, disclosed)',
        substitution: coveringFits && selectedCoveringSize ? `Selected size: ${selectedCoveringSize.label} (expanded ⌀${fmt(selectedCoveringSize.expandedIdMm, 1)} mm, wall ${fmt(selectedCoveringSize.wallMm, 2)} mm)` : 'No standard size in this family covers the bundle — consider splitting the harness or a custom/oversized product',
        result: coveringFits ? `Finished ⌀ = ${fmt(finishedOuterDiameterMm ?? 0, 3)} mm` : 'Exceeds largest standard size',
      });
    }
    if (partMarking.id !== 'none') {
      steps.push({
        title: 'Part marking',
        formula: 'Local legend sleeve — not a length-wise covering',
        substitution: partMarking.label,
        result: partMarking.notes,
      });
    }
    steps.push({
      title: 'Total copper cross-sectional area',
      formula: 'Σ (π/4 × conductorDiameter²), × 2 conductors for twisted/CAN categories',
      substitution: `${totalWireCount} wires`,
      result: `Total copper area = ${fmt(totalCopperAreaMm2, 2)} mm²`,
    });
    return steps;
  }, [groups, totalWireCount, packed, glenair, overbraid, bundleWithBraidMm, coveringFamily, coveringFits, selectedCoveringSize, finishedOuterDiameterMm, partMarking, totalCopperAreaMm2]);

  const inputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Wire groups',
      rows: groups.map((g) => ({ label: g.label, value: `${g.count}× ${getWireConstruction(g.constructionId).label} @ ${g.awg} AWG (⌀${fmt(wireOverallDiameterMm(getWireConstruction(g.constructionId), g.awg), 3)} mm each)` })),
    },
    {
      heading: 'Bundle coverings',
      rows: [
        { label: 'Overbraid', value: overbraid.label },
        { label: 'Main covering', value: coveringFamily ? `${coveringFamily.label} (${coveringFamily.shrinkRatioLabel}, ${coveringFamily.tempRangeC}°C)` : 'None' },
        { label: 'Part marking', value: partMarking.label },
      ],
    },
  ], [groups, overbraid, coveringFamily, partMarking]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Bundle diameter',
      rows: [
        { label: 'Bare bundle (packed)', value: `${fmt(packed.bundleDiameterMm, 3)} mm` },
        { label: 'Bare bundle (Glenair cross-check)', value: `${fmt(glenair.bundleDiameterMm, 3)} mm` },
        { label: 'Finished outer diameter', value: finishedOuterDiameterMm !== null ? `${fmt(finishedOuterDiameterMm, 3)} mm` : `${fmt(packed.bundleDiameterMm, 3)} mm (no covering)` },
      ],
    },
    {
      heading: 'Summary',
      rows: [
        { label: 'Total wire count', value: `${totalWireCount}` },
        { label: 'Total copper cross-sectional area', value: `${fmt(totalCopperAreaMm2, 2)} mm²` },
      ],
    },
  ], [packed, glenair, finishedOuterDiameterMm, totalWireCount, totalCopperAreaMm2]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Harness_Bundle_Diameter_Calculator',
      pageTitle: 'Harness Bundle Diameter Calculator',
      accentHex,
      passStatus: coveringFamily ? { pass: coveringFits, label: coveringFits ? 'Selected covering fits the bundle' : 'No standard covering size fits — review' } : null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [
        { title: 'Bundle cross-section', svgMarkup: renderBundleCrossSectionSvg(wireVisuals, packed.bundleDiameterMm, overbraid.thicknessMm, finishedOuterDiameterMm, selectedCoveringSize?.label, accentHex) },
      ],
      disclaimer: 'Engineering estimation tool. Bundle diameter is computed two independent ways: a real 2D circle-packing algorithm (drives the cross-section diagram; a heuristic, not a proven-optimal packing) and the published Glenair Wire Bundle Diameter Calculator multiplication-factor table (a statistical industry cross-check). Wire construction electrical ratings are sourced from manufacturer datasheets (M22759, Spec 55); wall thicknesses for some constructions and most covering-family size tables are representative class figures rather than a specific vendor part\'s exact published dimensions — see the field-level notes and refine against the actual product datasheet before cutting stock. Actual finished bundle diameter depends on lay length, tie/lace spacing, and harness construction method — treat this as a planning estimate.',
      ...branding,
    });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Harness Bundle Diameter Calculator</div>
          <h1>Harness Bundle Diameter Calculator</h1>
          <p>
            Bundle diameter and cross-section for a mixed-gauge, mixed-construction wire harness — aerospace
            (M22759, Spec 55), shielded/twisted-pair, and 120 Ω CAN bus wire types, with overbraid, heat-shrink
            (RNF-100/RNF-3000/HTAT), and Nomex sleeve coverings.
          </p>
        </div>
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — inputs */}
        <div>
          <div className="card">
            <div className="card-title">
              <span><span className="step-num">1</span>Wire groups</span>
              <button className="btn small" onClick={addGroup} disabled={groups.length >= 20}>+ Add group</button>
            </div>
            {groups.map((g) => (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <input autoComplete="off" value={g.label} onChange={(e) => updateGroup(g.id, { label: e.target.value })} style={{ fontWeight: 600, fontSize: '0.85rem', border: 'none', background: 'transparent', padding: 0 }} />
                  <button className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => removeGroup(g.id)} disabled={groups.length <= 1}>Remove</button>
                </div>
                <div className="grid grid-3">
                  <div className="field">
                    <label>Count</label>
                    <input autoComplete="off" type="number" min={1} value={g.count} onChange={(e) => updateGroup(g.id, { count: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label>AWG</label>
                    <input autoComplete="off" type="number" min={0} max={40} value={g.awg} onChange={(e) => updateGroup(g.id, { awg: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label>OD</label>
                    <div className="hint" style={{ marginTop: '0.6rem' }}>⌀{fmt(wireOverallDiameterMm(getWireConstruction(g.constructionId), g.awg), 3)} mm</div>
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>
                      Wire construction
                      <InfoTooltip>{getWireConstruction(g.constructionId).notes}</InfoTooltip>
                    </label>
                    <select value={g.constructionId} onChange={(e) => updateGroup(g.id, { constructionId: e.target.value })}>
                      {WIRE_CONSTRUCTIONS.map((w) => (
                        <option key={w.id} value={w.id}>{w.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title"><span><span className="step-num">2</span>Bundle coverings</span></div>
            <div className="grid grid-2">
              <div className="field">
                <label>Overbraid</label>
                <select value={overbraidId} onChange={(e) => setOverbraidId(e.target.value)}>
                  {OVERBRAID_PRESETS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Main covering</label>
                <select value={coveringFamilyId} onChange={(e) => setCoveringFamilyId(e.target.value)}>
                  <option value="none">None</option>
                  {COVERING_FAMILIES.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                {coveringFamily && !coveringFits && (
                  <span className="hint" style={{ color: 'var(--warn)' }}>No standard size covers this bundle — split the harness or use a custom/oversized product.</span>
                )}
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  Part marking
                  <InfoTooltip>Applied locally at the marking point — a documentation/BOM item, not a full-length covering, so it does not affect the finished bundle diameter.</InfoTooltip>
                </label>
                <select value={partMarkingId} onChange={(e) => setPartMarkingId(e.target.value)}>
                  {PART_MARKING_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — diagram + results */}
        <div>
          <div className="card">
            <div className="card-title">Bundle cross-section</div>
            <BundleCrossSection
              wires={wireVisuals}
              bundleDiameterMm={packed.bundleDiameterMm}
              overbraidThicknessMm={overbraid.thicknessMm}
              finishedOuterDiameterMm={finishedOuterDiameterMm}
              coveringLabel={selectedCoveringSize?.label}
            />
          </div>

          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Bare bundle diameter</div>
                <div className="value">{fmt(packed.bundleDiameterMm, 2)}<span className="unit">mm</span></div>
                <div className="hint">Glenair cross-check: {fmt(glenair.bundleDiameterMm, 2)} mm</div>
              </div>
              <div className="result-tile">
                <div className="label">Finished outer diameter</div>
                <div className="value">{fmt(finishedOuterDiameterMm ?? packed.bundleDiameterMm, 2)}<span className="unit">mm</span></div>
                <div className="hint">{selectedCoveringSize?.label ?? 'no covering'}</div>
              </div>
              <div className="result-tile">
                <div className="label">Total wire count</div>
                <div className="value">{totalWireCount}</div>
              </div>
              <div className="result-tile">
                <div className="label">Total copper area</div>
                <div className="value">{fmt(totalCopperAreaMm2, 2)}<span className="unit">mm²</span></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Bundle diameter is computed two independent ways: a real 2D circle-packing algorithm (drives the
          cross-section diagram — a heuristic greedy tangent-placement packing, not a proven-optimal
          solution) and the published Glenair Wire Bundle Diameter Calculator multiplication-factor table
          (a statistical industry cross-check, arithmetic-mean diameter × a count-dependent factor). Wire
          electrical ratings (M22759, Spec 55) are sourced from manufacturer datasheets; wall thicknesses
          and most covering-family size tables are representative class figures — see each item's notes and
          refine against the specific product datasheet before cutting stock. A covering's finished OD
          assumes the tubing/sleeve wraps snugly against the bundle, a first-order estimate. Actual bundle
          diameter also depends on lay length and tie/lace spacing — treat this as a planning estimate.
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
