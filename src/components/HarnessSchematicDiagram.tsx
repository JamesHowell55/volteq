import type { SchematicLayout } from '../lib/harnessSchematicLayout';

interface Props {
  layout: SchematicLayout;
}

// Wiring-diagram-style schematic: connector boxes with numbered pins, straight
// point-to-point wires labelled with signal name + wire spec, and a standard
// ground symbol for grounded pins. Deterministic layout (computed in
// harnessSchematicLayout.ts) — this component only renders it.
export default function HarnessSchematicDiagram({ layout }: Props) {
  const connectedPins = new Set<string>();
  for (const w of layout.wires) {
    // netId encodes both endpoints as "connectorId:pin" pairs sorted+joined with '|'
    for (const part of w.netId.split('|')) connectedPins.add(part);
  }
  for (const g of layout.grounds) connectedPins.add(`${g.connectorId}:${g.pin}`);

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" style={{ minHeight: 240 }}>
      {layout.wires.map((w) => {
        const midX = (w.x1 + w.x2) / 2;
        const midY = (w.y1 + w.y2) / 2;
        return (
          <g key={w.netId}>
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="var(--accent)" strokeWidth={1.5} />
            <rect x={midX - w.label.length * 2.6} y={midY - 12} width={w.label.length * 5.2} height={12} fill="var(--bg-card)" opacity={0.9} />
            <text x={midX} y={midY - 3} textAnchor="middle" fontSize="8.5" fill="var(--text-2)" fontFamily="ui-monospace, monospace">{w.label}</text>
          </g>
        );
      })}

      {layout.grounds.map((g, i) => (
        <g key={`gnd-${i}`}>
          <line x1={g.stubX1} y1={g.stubY1} x2={g.x} y2={g.y} stroke="var(--text-2)" strokeWidth={1.5} />
          <line x1={g.x} y1={g.y - 8} x2={g.x} y2={g.y + 8} stroke="var(--text)" strokeWidth={1.5} />
          <line x1={g.x + 4} y1={g.y - 5} x2={g.x + 4} y2={g.y + 5} stroke="var(--text)" strokeWidth={1.3} />
          <line x1={g.x + 8} y1={g.y - 2} x2={g.x + 8} y2={g.y + 2} stroke="var(--text)" strokeWidth={1} />
          <text x={g.x + 12} y={g.y + 3} fontSize="8" fill="var(--text-2)" fontFamily="ui-monospace, monospace">GND</text>
        </g>
      ))}

      {layout.connectors.map((box) => (
        <g key={box.id}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={4} fill="var(--bg-card)" stroke="var(--border-strong)" strokeWidth={1.5} />
          <rect x={box.x} y={box.y} width={box.width} height={30} rx={4} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="var(--border-strong)" strokeWidth={1} />
          <text x={box.x + box.width / 2} y={box.y + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)" fontFamily="ui-monospace, monospace">{box.name}</text>
          <text x={box.x + box.width / 2} y={box.y + 25} textAnchor="middle" fontSize="8" fill="var(--text-2)" fontFamily="ui-monospace, monospace">{box.shellLabel}</text>

          {box.pins.map((p) => {
            const connected = connectedPins.has(`${box.id}:${p.pin}`);
            return (
              <g key={p.pin}>
                <line x1={box.x} x2={box.x + box.width} y1={p.y} y2={p.y} stroke="var(--border-subtle)" strokeWidth={0.5} />
                <circle cx={box.x} cy={p.y} r={2.5} fill={connected ? 'var(--accent)' : 'var(--text-faint)'} />
                <circle cx={box.x + box.width} cy={p.y} r={2.5} fill={connected ? 'var(--accent)' : 'var(--text-faint)'} />
                <text x={box.x + 6} y={p.y + 3} fontSize="7.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">{p.pin}</text>
                <text x={box.x + box.width / 2} y={p.y + 3} textAnchor="middle" fontSize="8" fill={connected ? 'var(--text)' : 'var(--text-faint)'} fontFamily="ui-monospace, monospace">{p.signalName}</text>
                <text x={box.x + box.width - 6} y={p.y + 3} textAnchor="end" fontSize="7.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">{p.pin}</text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
