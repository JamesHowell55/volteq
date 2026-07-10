import type { SchematicLayout, Point } from '../lib/harnessSchematicLayout';

interface Props {
  layout: SchematicLayout;
}

const HOP_R = 5;
const SHIELD_COLOR = 'var(--neg)';

// Cycled by wire-spec index (see harnessSchematicLayout's legend) so every
// distinct construction+AWG combination in a diagram gets its own colour,
// keeping traces identifiable without an on-wire text label that would
// otherwise clash with connector boxes and crossing wires.
const WIRE_PALETTE = [
  'var(--accent)',
  'var(--blue)',
  'var(--warn)',
  'var(--pos)',
  'var(--neg)',
  'color-mix(in srgb, var(--blue) 55%, var(--warn))',
  'color-mix(in srgb, var(--accent) 50%, var(--blue))',
  'color-mix(in srgb, var(--warn) 50%, var(--neg))',
  'color-mix(in srgb, var(--pos) 50%, var(--blue))',
  'color-mix(in srgb, var(--accent) 50%, var(--neg))',
  'color-mix(in srgb, var(--pos) 50%, var(--warn))',
  'color-mix(in srgb, var(--neg) 50%, var(--blue))',
];
function colorForSpec(specIndex: number): string {
  return WIRE_PALETTE[specIndex % WIRE_PALETTE.length];
}

/** Builds an SVG path string for an orthogonal polyline, inserting a small
 *  semicircular "hop" bump on any horizontal segment where a different net's
 *  wire crosses it without connecting — the standard schematic convention
 *  for disambiguating a crossing from a junction. */
function pathWithHops(points: Point[], hops: Point[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1.y === p2.y) {
      const leftToRight = p2.x > p1.x;
      const segHops = hops
        .filter((h) => h.y === p1.y && h.x > Math.min(p1.x, p2.x) && h.x < Math.max(p1.x, p2.x))
        .sort((a, b) => (leftToRight ? a.x - b.x : b.x - a.x));
      for (const hop of segHops) {
        const nearX = leftToRight ? hop.x - HOP_R : hop.x + HOP_R;
        const farX = leftToRight ? hop.x + HOP_R : hop.x - HOP_R;
        d += ` L ${nearX} ${p1.y} A ${HOP_R} ${HOP_R} 0 0 ${leftToRight ? 1 : 0} ${farX} ${p1.y}`;
      }
      d += ` L ${p2.x} ${p2.y}`;
    } else {
      d += ` L ${p2.x} ${p2.y}`;
    }
  }
  return d;
}

function polylinePath(points: Point[]): string {
  if (points.length < 2) return '';
  return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
}

// Wiring-diagram-style schematic: connector boxes with numbered pins,
// orthogonal (90°) point-to-point wires with hop bumps at crossings, a
// standard ground symbol for grounded pins, twisted pairs whose conductors
// literally cross over along the run (or tick marks on elbow-routed pairs),
// and red oval end-markers around a shielded conductor/pair with a 90° tap
// to its drain-wire pin. Deterministic layout (computed in
// harnessSchematicLayout.ts) — this component only renders it.
export default function HarnessSchematicDiagram({ layout }: Props) {
  const connectedPins = new Set<string>();
  for (const w of layout.wires) {
    // netId encodes both endpoints as "connectorId:pin" pairs sorted+joined with '|'
    for (const part of w.netId.split('|')) connectedPins.add(part);
  }
  for (const g of layout.grounds) connectedPins.add(`${g.connectorId}:${g.pin}`);
  // A drain pin's own ground stub is suppressed in favour of the shield tap,
  // but it's still a connected pin.
  for (const s of layout.shields) connectedPins.add(`${s.drainConnectorId}:${s.drainPin}`);

  // Twisted pairs already decorated by a TwistBundle (crossing lines along
  // the run) skip the near-box bracket fallback below, so a pair isn't
  // shown twice.
  const bundledPins = new Set<string>();
  for (const b of layout.twistBundles) {
    for (const netId of [b.netIdA, b.netIdB]) for (const part of netId.split('|')) bundledPins.add(part);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" style={{ minHeight: 240, flex: '1 1 480px' }}>
        {layout.wires.map((w) => (
          <path key={w.netId} d={pathWithHops(w.points, w.hops)} fill="none" stroke={colorForSpec(w.specIndex)} strokeWidth={1.5}>
            <title>{w.tooltip}</title>
          </path>
        ))}

        {layout.twistBundles.map((b, i) => (
          <g key={`twist-${i}`} stroke="var(--text-2)" strokeWidth={1}>
            {b.crossings.map((c, j) => (
              <line key={j} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
            ))}
          </g>
        ))}

        {layout.shields.map((s, i) => (
          <g key={`shield-${i}`} stroke={SHIELD_COLOR} strokeWidth={1.2} fill="none">
            <title>Shield / drain</title>
            <ellipse cx={s.end1.cx} cy={s.end1.cy} rx={s.end1.rx} ry={s.end1.ry} />
            <ellipse cx={s.end2.cx} cy={s.end2.cy} rx={s.end2.rx} ry={s.end2.ry} />
            <path d={polylinePath(s.tap)} />
          </g>
        ))}

        {layout.grounds.map((g, i) => (
          <g key={`gnd-${i}`}>
            <path d={pathWithHops([{ x: g.stubX1, y: g.stubY1 }, { x: g.x, y: g.y }], g.hops)} fill="none" stroke={colorForSpec(g.specIndex)} strokeWidth={1.5} />
            <line x1={g.x} y1={g.y - 8} x2={g.x} y2={g.y + 8} stroke="var(--text)" strokeWidth={1.5} />
            <line x1={g.x + 4} y1={g.y - 5} x2={g.x + 4} y2={g.y + 5} stroke="var(--text)" strokeWidth={1.3} />
            <line x1={g.x + 8} y1={g.y - 2} x2={g.x + 8} y2={g.y + 2} stroke="var(--text)" strokeWidth={1} />
            <text x={g.x + 12} y={g.y + 3} fontSize="8" fill="var(--text-2)" fontFamily="ui-monospace, monospace">GND</text>
          </g>
        ))}

        {layout.connectors.map((box) => {
          const twistPairs: { pinA: number; pinB: number; yA: number; yB: number }[] = [];
          for (const p of box.pins) {
            if (p.twistedWithPin != null && p.twistedWithPin > p.pin && !bundledPins.has(`${box.id}:${p.pin}`)) {
              const partner = box.pins.find((o) => o.pin === p.twistedWithPin);
              if (partner) twistPairs.push({ pinA: p.pin, pinB: partner.pin, yA: p.y, yB: partner.y });
            }
          }
          return (
            <g key={box.id}>
              <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={4} fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth={1.5} />
              <rect x={box.x} y={box.y} width={box.width} height={30} rx={4} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="var(--border-strong)" strokeWidth={1} />
              <text x={box.x + box.width / 2} y={box.y + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)" fontFamily="ui-monospace, monospace">{box.name}</text>
              <text x={box.x + box.width / 2} y={box.y + 25} textAnchor="middle" fontSize="8" fill="var(--text-2)" fontFamily="ui-monospace, monospace">{box.subtitle}</text>

              {box.pins.map((p) => {
                const connected = connectedPins.has(`${box.id}:${p.pin}`);
                const dotColor = connected ? 'var(--accent)' : 'var(--text-faint)';
                const dotR = p.isSpliceAnchor ? 4.5 : 2.5;
                return (
                  <g key={p.pin}>
                    <line x1={box.x} x2={box.x + box.width} y1={p.y} y2={p.y} stroke="var(--border-subtle)" strokeWidth={0.5} />
                    <circle cx={box.x} cy={p.y} r={dotR} fill={dotColor} stroke={p.isSpliceAnchor ? 'var(--bg-card)' : 'none'} strokeWidth={p.isSpliceAnchor ? 1 : 0} />
                    <circle cx={box.x + box.width} cy={p.y} r={dotR} fill={dotColor} stroke={p.isSpliceAnchor ? 'var(--bg-card)' : 'none'} strokeWidth={p.isSpliceAnchor ? 1 : 0} />
                    {p.isSpliceAnchor && <title>Splice — multiple wires joined at this pin</title>}
                    <text x={box.x + 6} y={p.y + 3} fontSize="7.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">{p.pin}</text>
                    <text x={box.x + box.width / 2} y={p.y + 3} textAnchor="middle" fontSize="8" fill={connected ? 'var(--text)' : 'var(--text-faint)'} fontFamily="ui-monospace, monospace">{p.signalName}</text>
                    <text x={box.x + box.width - 6} y={p.y + 3} textAnchor="end" fontSize="7.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">{p.pin}</text>
                  </g>
                );
              })}

              {/* fallback twisted-pair brackets — only for pairs NOT already shown as
                  crossing lines along their shared run (e.g. routed to non-adjacent
                  connectors or mismatched target pins); a small zigzag stands in for
                  the physical twist, per the convention shown in Altium's harness
                  wiring diagrams. */}
              {twistPairs.map((tp) => {
                const bx = box.x + box.width + 5;
                const midY = (tp.yA + tp.yB) / 2;
                return (
                  <g key={`${tp.pinA}-${tp.pinB}`}>
                    <path d={`M ${box.x + box.width} ${tp.yA} L ${bx} ${tp.yA} L ${bx} ${tp.yB} L ${box.x + box.width} ${tp.yB}`} fill="none" stroke="var(--blue)" strokeWidth={1.2} />
                    {[-4, 0, 4].map((dy) => (
                      <path key={dy} d={`M ${bx - 3} ${midY + dy - 2} L ${bx + 3} ${midY + dy} L ${bx - 3} ${midY + dy + 2}`} fill="none" stroke="var(--blue)" strokeWidth={1} />
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {layout.legend.length > 0 && (
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Wire spec key</div>
          {layout.legend.map((entry, i) => (
            <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: colorForSpec(i), flexShrink: 0 }} />
              <span style={{ color: 'var(--text-2)' }}>{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
