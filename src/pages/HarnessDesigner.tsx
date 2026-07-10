import { useMemo, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { exportReportToPdf, type ReportSection, type ReportRow, type CalcStepData } from '../lib/pdfExport';
import { useBranding } from '../lib/useBranding';
import PremiumGate from '../components/PremiumGate';
import HarnessSchematicDiagram from '../components/HarnessSchematicDiagram';
import { renderHarnessSchematicSvg } from '../lib/pdfDiagrams';
import { CONTACT_SIZE_SPECS, CONTACT_SIZES, type ContactSize } from '../lib/connectorLibrary';
import {
  makeDefaultConnector, setPinDestination, setTwistedPartner, setShieldDrain, getShieldTargets,
  applyPinSpec, isTwistable, pruneDanglingShieldDrains, pruneInvalidTwists, DEFAULT_CONSTRUCTION_ID,
  type ConnectorSpec, type Destination,
} from '../lib/harnessDesignerLogic';
import { buildSchematicLayout } from '../lib/harnessSchematicLayout';
import { WIRE_CONSTRUCTIONS, getWireConstruction } from '../lib/harnessWireTypes';

function destValue(d: Destination): string {
  if (d.kind === 'unused') return 'unused';
  if (d.kind === 'ground') return 'ground';
  return `${d.connectorId}:${d.pin}`;
}

/** How many OTHER pins (not the one whose dropdown we're rendering) already
 *  point at this candidate pin — picking a candidate with count > 0 doesn't
 *  steal anything, it joins a multi-drop splice with whichever pins are
 *  already there. */
function splicedCount(connectors: ConnectorSpec[], candidateConnectorId: string, candidatePin: number, editingConnectorId: string, editingPin: number): number {
  let count = 0;
  for (const c of connectors) {
    for (const p of c.pins) {
      if (c.id === editingConnectorId && p.pin === editingPin) continue;
      if (p.destination.kind === 'pin' && p.destination.connectorId === candidateConnectorId && p.destination.pin === candidatePin) count++;
    }
  }
  return count;
}

let nextConnectorId = 3;

export default function HarnessDesigner() {
  const { accentHex } = useTheme();
  const branding = useBranding();

  const [connectors, setConnectors] = useState<ConnectorSpec[]>([
    makeDefaultConnector('c1', 'CON1', '16'),
    makeDefaultConnector('c2', 'CON2', '16'),
  ]);
  const [activeId, setActiveId] = useState('c1');
  const active = connectors.find((c) => c.id === activeId) ?? connectors[0];

  const addConnector = () => {
    const id = `c${nextConnectorId++}`;
    const conn = makeDefaultConnector(id, `CON${connectors.length + 1}`, '16');
    setConnectors((cs) => [...cs, conn]);
    setActiveId(id);
  };
  const removeConnector = (id: string) => {
    setConnectors((cs) => {
      const remaining = cs.filter((c) => c.id !== id);
      return remaining.map((c) => ({
        ...c,
        pins: c.pins.map((p) => (p.destination.kind === 'pin' && p.destination.connectorId === id ? { ...p, destination: { kind: 'unused' as const } } : p)),
      }));
    });
    if (activeId === id) {
      const remaining = connectors.filter((c) => c.id !== id);
      setActiveId(remaining[0]?.id ?? '');
    }
  };

  const updateConnectorSpec = (id: string, patch: Partial<Pick<ConnectorSpec, 'name' | 'contactSize'>>) => {
    setConnectors((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const next: ConnectorSpec = { ...c, ...patch };
      if (patch.contactSize !== undefined) {
        const allowedAwg = CONTACT_SIZE_SPECS[next.contactSize].awgRange;
        next.pins = next.pins.map((p) => (allowedAwg.includes(p.awg) ? p : { ...p, awg: allowedAwg[0] }));
      }
      return next;
    }));
  };

  const setPinCount = (id: string, count: number) => {
    setConnectors((cs) => {
      const conn = cs.find((c) => c.id === id);
      if (!conn) return cs;
      const target = Math.max(1, Math.min(Math.round(count), 128));
      if (target === conn.pins.length) return cs;
      if (target > conn.pins.length) {
        const awg = CONTACT_SIZE_SPECS[conn.contactSize].awgRange[0];
        const newPins = [...conn.pins];
        for (let i = conn.pins.length; i < target; i++) {
          newPins.push({ pin: i + 1, signalName: `SIG${i + 1}`, constructionId: DEFAULT_CONSTRUCTION_ID, awg, destination: { kind: 'unused' } });
        }
        return cs.map((c) => (c.id === id ? { ...c, pins: newPins } : c));
      }
      // Shrinking: drop the rows, then clear everything that referenced the
      // removed pins — other connectors' destinations pointing at them, and
      // this connector's twist links / shield drains left dangling.
      return cs.map((c) => {
        if (c.id === id) return pruneDanglingShieldDrains(pruneInvalidTwists({ ...c, pins: c.pins.slice(0, target) }));
        return {
          ...c,
          pins: c.pins.map((p) => (p.destination.kind === 'pin' && p.destination.connectorId === id && (p.destination.pin ?? 0) > target
            ? { ...p, destination: { kind: 'unused' as const } }
            : p)),
        };
      });
    });
  };

  const updatePin = (connectorId: string, pin: number, patch: Partial<{ signalName: string; constructionId: string; awg: number }>) => {
    // Construction/AWG describe the whole physical wire, so those edits go
    // through applyPinSpec, which propagates them to the wire's other end
    // (and across splices) and prunes twist/drain refs they invalidate.
    if (patch.constructionId !== undefined || patch.awg !== undefined) {
      setConnectors((cs) => applyPinSpec(cs, connectorId, pin, patch));
      return;
    }
    setConnectors((cs) => cs.map((c) => (c.id === connectorId ? { ...c, pins: c.pins.map((p) => (p.pin === pin ? { ...p, ...patch } : p)) } : c)));
  };

  const updatePinDestination = (connectorId: string, pin: number, destination: Destination) => {
    setConnectors((cs) => setPinDestination(cs, connectorId, pin, destination));
  };

  const updateTwistedPartner = (connectorId: string, pin: number, partnerPin: number | null) => {
    setConnectors((cs) => setTwistedPartner(cs, connectorId, pin, partnerPin));
  };

  const updateShieldDrain = (connectorId: string, drainPin: number, targetPin: number | null) => {
    setConnectors((cs) => setShieldDrain(cs, connectorId, drainPin, targetPin));
  };

  const layout = useMemo(() => buildSchematicLayout(connectors), [connectors]);

  const calculationSteps: CalcStepData[] = useMemo(() => [
    {
      title: 'Net extraction',
      formula: 'Every pin\'s destination (Unused / Ground / another connector\'s pin) builds an undirected graph; each connected component of 2+ pins is one net — exactly 2 members is a point-to-point wire, 3+ is a multi-drop splice (rendered as spokes from one shared anchor pin). A shield/drain wire is a separate, ordinary pin assigned to enclose a shielded conductor or twisted pair, wired like any other pin.',
      substitution: `${connectors.length} connector(s), ${connectors.reduce((a, c) => a + c.pins.length, 0)} total pins`,
      result: `${layout.wires.length} pin-to-pin net(s), ${layout.grounds.length} ground connection(s)${layout.shields.length > 0 ? `, ${layout.shields.length} shield/drain assignment(s)` : ''}`,
    },
  ], [connectors, layout]);

  const inputSections: ReportSection[] = useMemo(() => connectors.map((c) => {
    const rows: ReportRow[] = [
      { label: 'Contact size', value: `#${c.contactSize} (${CONTACT_SIZE_SPECS[c.contactSize].currentRatingA} A rated)` },
      { label: 'Pin count', value: `${c.pins.length}` },
      ...c.pins.map((p): ReportRow => {
        const drainTarget = getShieldTargets(c).find((t) => t.pin === p.shieldDrainForPin);
        return {
          label: `Pin ${p.pin} — ${p.signalName}`,
          value: `${p.awg} AWG ${getWireConstruction(p.constructionId).label}${p.twistedWithPin != null ? ` (twisted w/ pin ${p.twistedWithPin})` : ''}${drainTarget ? ` (drain for ${drainTarget.label})` : ''} → ${p.destination.kind === 'unused' ? 'Unused' : p.destination.kind === 'ground' ? 'Ground/chassis' : `${connectors.find((o) => o.id === p.destination.connectorId)?.name ?? '?'} pin ${p.destination.pin}`}`,
        };
      }),
    ];
    return { heading: `Connector ${c.name}`, rows };
  }), [connectors]);

  const outputSections: ReportSection[] = useMemo(() => [
    {
      heading: 'Validation summary',
      rows: [
        { label: 'Nets', value: `${layout.wires.length} pin-to-pin, ${layout.grounds.length} ground${layout.shields.length > 0 ? `, ${layout.shields.length} shield/drain` : ''}` },
      ],
    },
  ], [layout]);

  const handleExportPdf = () => {
    exportReportToPdf({
      tabName: 'Harness_Designer',
      pageTitle: 'Harness Designer',
      accentHex,
      passStatus: null,
      inputSections,
      outputSections,
      calculationSteps,
      diagrams: [
        { title: 'Wiring schematic', svgMarkup: renderHarnessSchematicSvg(layout, accentHex) },
      ],
      disclaimer: 'Engineering design tool for connector pinout and wiring planning. Contact-size current ratings are sourced from a real MIL-DTL-38999 Series III contact cross-reference catalog; this tool scopes to a single dominant contact size and a direct user-entered pin count per connector. Multiple pins may point at the same target pin to form a multi-drop splice, drawn as a filled junction dot at one representative anchor pin with a wire from every other spliced pin back to it (electrically equivalent to a real splice, not a literal drawing of a splice sleeve/crimp at a separate mid-harness point). A twisted pair routed straight between two connectors is drawn with its two conductors visibly crossing over each other along the run, the standard drafting convention for a twist. Wire construction, gauge, and twisted-pair links describe the whole physical wire and are synchronized across both ends automatically — they can be specified at either connector. A shielded conductor or twisted pair can be assigned its own drain-wire pin (a real, separately-wired pin, not an abstract flag), drawn as an oval shield marker around the conductor(s) at each end of the run with a 90° tap to the drain pin\'s own position — a symbolic marker, not a to-scale cable jacket drawing. The generated schematic is a point-to-point wiring diagram (connectors as labelled boxes with numbered pins), not a to-scale connector face/pin-arrangement drawing — verify final pin arrangement against the manufacturer\'s insert arrangement drawing before cutting a harness.',
      ...branding,
    });
  };

  if (!active) return null;
  const otherConnectors = connectors.filter((c) => c.id !== active.id);
  const shieldTargets = getShieldTargets(active);

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div className="eyebrow">● Harness Designer</div>
          <h1>Harness Designer</h1>
          <p>
            Connector naming, per-pin wire assignment across multiple branches (including multi-drop splices),
            and an auto-generated point-to-point wiring schematic with connector naming, pin numbers, and wire specs.
          </p>
        </div>
        <PremiumGate feature="PDF export">
          <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={handleExportPdf}>Export PDF</button>
        </PremiumGate>
      </div>

      <div className="card">
        <div className="card-title">
          <span><span className="step-num">1</span>Connectors</span>
          <button className="btn small" onClick={addConnector} disabled={connectors.length >= 8}>+ Add connector</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {connectors.map((c) => (
            <button
              key={c.id}
              className={c.id === activeId ? 'active' : ''}
              onClick={() => setActiveId(c.id)}
              style={{
                padding: '0.5rem 0.9rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                border: c.id === activeId ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: c.id === activeId ? 'var(--accent-glow)' : 'var(--bg-input)',
                color: 'var(--text)',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="two-col">
        {/* LEFT COLUMN — connector settings */}
        <div>
          <div className="card">
            <div className="card-title">
              <span><span className="step-num">2</span>{active.name} settings</span>
              <button className="btn small" onClick={() => removeConnector(active.id)} disabled={connectors.length <= 1}>Remove connector</button>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Connector name</label>
                <input autoComplete="off" value={active.name} onChange={(e) => updateConnectorSpec(active.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>Contact size</label>
                <select value={active.contactSize} onChange={(e) => updateConnectorSpec(active.id, { contactSize: e.target.value as ContactSize })}>
                  {CONTACT_SIZES.map((size) => (
                    <option key={size} value={size}>#{size} ({CONTACT_SIZE_SPECS[size].currentRatingA} A, {CONTACT_SIZE_SPECS[size].awgRange.join('/')} AWG)</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Pin count</label>
                <input autoComplete="off" type="number" min={1} value={active.pins.length} onChange={(e) => setPinCount(active.id, Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — results */}
        <div>
          <div className="card">
            <div className="card-title">Results</div>
            <div className="result-grid">
              <div className="result-tile">
                <div className="label">Nets</div>
                <div className="value">{layout.wires.length + layout.grounds.length}</div>
                <div className="hint">{layout.wires.length} pin-to-pin, {layout.grounds.length} ground{layout.shields.length > 0 ? `, ${layout.shields.length} shield/drain` : ''}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{active.name} pinout</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: '0.78rem' }}>
            <thead>
              <tr><th>Pin</th><th>Signal</th><th>Wire</th><th>AWG</th><th>Twisted w/</th><th>Drain for</th><th>Destination</th></tr>
            </thead>
            <tbody>
              {active.pins.map((p) => {
                const twistable = isTwistable(p.constructionId);
                const twistCandidates = active.pins.filter((op) => op.pin !== p.pin && isTwistable(op.constructionId));
                return (
                <tr key={p.pin}>
                  <td>{p.pin}</td>
                  <td><input autoComplete="off" value={p.signalName} onChange={(e) => updatePin(active.id, p.pin, { signalName: e.target.value })} style={{ width: '90px', fontSize: '0.78rem' }} /></td>
                  <td>
                    <select value={p.constructionId} onChange={(e) => updatePin(active.id, p.pin, { constructionId: e.target.value })} style={{ fontSize: '0.75rem' }}>
                      {WIRE_CONSTRUCTIONS.map((w) => (
                        <option key={w.id} value={w.id}>{w.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={p.awg} onChange={(e) => updatePin(active.id, p.pin, { awg: Number(e.target.value) })} style={{ fontSize: '0.75rem' }}>
                      {CONTACT_SIZE_SPECS[active.contactSize].awgRange.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {twistable ? (
                      <select
                        value={p.twistedWithPin ?? ''}
                        onChange={(e) => updateTwistedPartner(active.id, p.pin, e.target.value === '' ? null : Number(e.target.value))}
                        style={{ fontSize: '0.75rem' }}
                      >
                        <option value="">None</option>
                        {twistCandidates.map((op) => (
                          <option key={op.pin} value={op.pin}>Pin {op.pin} ({op.signalName})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="hint" title="Only available when this pin's wire construction is a twisted-pair category">—</span>
                    )}
                  </td>
                  <td>
                    {shieldTargets.length > 0 ? (
                      <select
                        value={p.shieldDrainForPin ?? ''}
                        onChange={(e) => updateShieldDrain(active.id, p.pin, e.target.value === '' ? null : Number(e.target.value))}
                        style={{ fontSize: '0.75rem' }}
                        title="This pin is the drain wire for a shielded conductor or twisted pair elsewhere on this connector"
                      >
                        <option value="">None</option>
                        {shieldTargets.filter((t) => t.pin !== p.pin && t.partnerPin !== p.pin).map((t) => (
                          <option key={t.pin} value={t.pin}>{t.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="hint" title="No shielded conductor or twisted shielded pair on this connector yet">—</span>
                    )}
                  </td>
                  <td>
                    <select value={destValue(p.destination)} onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'unused') updatePinDestination(active.id, p.pin, { kind: 'unused' });
                      else if (v === 'ground') updatePinDestination(active.id, p.pin, { kind: 'ground' });
                      else {
                        const [cid, pinStr] = v.split(':');
                        updatePinDestination(active.id, p.pin, { kind: 'pin', connectorId: cid, pin: Number(pinStr) });
                      }
                    }} style={{ fontSize: '0.75rem' }}>
                      <option value="unused">Unused</option>
                      <option value="ground">Ground / chassis</option>
                      {otherConnectors.map((oc) => (
                        <optgroup key={oc.id} label={oc.name}>
                          {oc.pins.map((op) => {
                            const spliced = splicedCount(connectors, oc.id, op.pin, active.id, p.pin);
                            return (
                              <option key={op.pin} value={`${oc.id}:${op.pin}`}>
                                {oc.name} pin {op.pin} ({op.signalName}){spliced > 0 ? ` — splice (+${spliced} joined)` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Reference &amp; assumptions</div>
        <p className="note">
          Contact-size current ratings are sourced from a real MIL-DTL-38999 Series III contact cross-reference
          catalog. Scope: one dominant contact size per connector with a direct user-entered pin count (no
          shell/insert-arrangement modelling). Multiple pins may point at the same target pin to form a
          multi-drop splice — the schematic draws one shared filled junction dot at a single representative
          anchor pin and a wire from every other spliced pin back to it, which is electrically equivalent to a
          real splice but not a literal drawing of a splice sleeve/crimp at a separate mid-harness point. A
          twisted pair routed straight between two connectors is drawn with its two conductors visibly crossing
          over each other along the run — the standard drafting convention for indicating a twist — rather than
          a literal helix; an elbow-routed pair keeps parallel lanes with diagonal crossing tick marks, and a
          pair split across non-adjacent connectors still wires correctly but carries no twist marker. A wire's
          construction, gauge, and twisted-pair link describe the whole physical wire, so setting them at either
          end applies to the far end automatically (when a connection is made, a still-default end adopts the
          configured end's wire spec, and gauges snap to each connector's own contact range). A shielded
          conductor or twisted shielded pair can be assigned its own drain-wire pin — a
          real, separately-wired pin like any other, not an abstract flag — drawn as an oval shield marker
          around the conductor(s) at each end of the run, with a 90° tap from the drain-side oval to the drain
          pin's own position; the ovals are a symbolic marker, not a to-scale cable jacket drawing. The schematic
          is a point-to-point wiring diagram (labelled connector boxes with numbered pins), not a to-scale
          connector face/pin-arrangement drawing — verify final pin arrangement against the manufacturer's
          insert arrangement drawing.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">Wiring schematic</div>
        <HarnessSchematicDiagram layout={layout} />
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
