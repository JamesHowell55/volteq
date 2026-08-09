import type { Segment } from '../lib/coldPlatePhysics';

interface Props {
  segments: Segment[];
}

const DRAW_W = 700;
const DRAW_H = 300;
const MARGIN = 40;

type Pt = { x: number; y: number };
type Ribbon = { pts: Pt[]; widthMm: number; kind: 'channel' | 'pin' | 'bend'; idx: number; angle?: number };

// Route the ordered segments into a folded centreline (mm-space). Straights advance along
// the current heading; bends turn it by their angle, alternating turn direction so a run of
// 180° U-turns folds into a serpentine. The ribbon thickness carries the channel width.
function routePath(segments: Segment[]): { ribbons: Ribbon[]; start: Pt; end: Pt } {
  const ribbons: Ribbon[] = [];
  let x = 0, y = 0, heading = 0, turnSign = 1, lastWidth = 4;
  const start = { x, y };
  segments.forEach((seg, i) => {
    if (seg.type === 'straight') {
      const x2 = x + seg.lengthMm * Math.cos(heading);
      const y2 = y + seg.lengthMm * Math.sin(heading);
      ribbons.push({ pts: [{ x, y }, { x: x2, y: y2 }], widthMm: seg.widthMm, kind: seg.pins ? 'pin' : 'channel', idx: i });
      x = x2; y = y2; lastWidth = seg.widthMm;
    } else {
      const angle = (seg.angleDeg * Math.PI) / 180;
      const R = Math.max(lastWidth * 1.2, 3);
      const perp = heading + turnSign * Math.PI / 2;
      const cx = x + R * Math.cos(perp);
      const cy = y + R * Math.sin(perp);
      const a0 = Math.atan2(y - cy, x - cx);
      const aEnd = a0 + turnSign * angle;
      const steps = Math.max(6, Math.round(seg.angleDeg / 12));
      const pts: Pt[] = [];
      for (let s = 0; s <= steps; s++) {
        const a = a0 + ((aEnd - a0) * s) / steps;
        pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
      }
      ribbons.push({ pts, widthMm: lastWidth, kind: 'bend', idx: i, angle: seg.angleDeg });
      x = pts[pts.length - 1].x; y = pts[pts.length - 1].y;
      heading += turnSign * angle;
      turnSign = -turnSign;
    }
  });
  return { ribbons, start, end: { x, y } };
}

export default function ColdPlatePathDiagram({ segments }: Props) {
  const straights = segments.filter((s) => s.type === 'straight') as Extract<Segment, { type: 'straight' }>[];
  const invalid = straights.length === 0 || straights.some((s) => s.lengthMm <= 0 || s.widthMm <= 0);
  if (invalid) {
    return (
      <svg viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} width="100%" style={{ maxHeight: 300 }}>
        <text x={DRAW_W / 2} y={DRAW_H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">
          Add at least one straight section with positive width and length
        </text>
      </svg>
    );
  }

  const { ribbons, start, end } = routePath(segments);

  // Bounding box over every centreline point, padded by half the widest channel.
  const allPts = ribbons.flatMap((r) => r.pts);
  const maxWidth = Math.max(...ribbons.map((r) => r.widthMm));
  const pad = maxWidth / 2 + 2;
  const minX = Math.min(...allPts.map((p) => p.x)) - pad;
  const maxX = Math.max(...allPts.map((p) => p.x)) + pad;
  const minY = Math.min(...allPts.map((p) => p.y)) - pad;
  const maxY = Math.max(...allPts.map((p) => p.y)) + pad;
  const bboxW = Math.max(maxX - minX, 1);
  const bboxH = Math.max(maxY - minY, 1);
  const scale = Math.min((DRAW_W - 2 * MARGIN) / bboxW, (DRAW_H - 2 * MARGIN) / bboxH);
  const offX = MARGIN + (DRAW_W - 2 * MARGIN - bboxW * scale) / 2;
  const offY = MARGIN + (DRAW_H - 2 * MARGIN - bboxH * scale) / 2;
  const tx = (x: number) => offX + (x - minX) * scale;
  const ty = (y: number) => offY + (y - minY) * scale;
  const poly = (r: Ribbon) => r.pts.map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');

  // Section labels: centred on each straight's ribbon so passes don't crowd each other.
  const labels = ribbons
    .filter((r) => r.kind !== 'bend')
    .map((r, n) => {
      const p0 = r.pts[0], p1 = r.pts[r.pts.length - 1];
      return {
        x: (tx(p0.x) + tx(p1.x)) / 2,
        y: (ty(p0.y) + ty(p1.y)) / 2,
        seg: r, order: n + 1, lengthMm: (segments[r.idx] as any).lengthMm as number,
      };
    });

  return (
    <svg viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} width="100%" style={{ maxHeight: 300 }}>
      <defs>
        <pattern id="pinDots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="3.5" cy="3.5" r="1.4" fill="#fff" opacity="0.85" />
        </pattern>
      </defs>

      {/* channel + bend ribbons (thickness = channel width) */}
      {ribbons.map((r) => (
        <polyline
          key={`rib-${r.idx}`}
          points={poly(r)}
          fill="none"
          stroke={r.kind === 'pin' ? '#a855f7' : 'var(--accent)'}
          strokeOpacity={r.kind === 'bend' ? 0.55 : 0.9}
          strokeWidth={Math.max(r.widthMm * scale, 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* pin texture overlay on pin sections */}
      {ribbons.filter((r) => r.kind === 'pin').map((r) => (
        <polyline key={`pin-${r.idx}`} points={poly(r)} fill="none" stroke="url(#pinDots)"
          strokeWidth={Math.max(r.widthMm * scale, 2)} strokeLinecap="butt" />
      ))}

      {/* inlet / outlet markers */}
      <circle cx={tx(start.x)} cy={ty(start.y)} r={5} fill="var(--blue, #38bdf8)" stroke="#fff" strokeWidth={1} />
      <text x={tx(start.x)} y={ty(start.y) - 9} textAnchor="middle" fontSize="9.5" fill="var(--blue, #38bdf8)" fontFamily="ui-monospace, monospace">in</text>
      <circle cx={tx(end.x)} cy={ty(end.y)} r={5} fill="var(--warn, #f59e0b)" stroke="#fff" strokeWidth={1} />
      <text x={tx(end.x)} y={ty(end.y) - 9} textAnchor="middle" fontSize="9.5" fill="var(--warn, #f59e0b)" fontFamily="ui-monospace, monospace">out</text>

      {/* per-section labels */}
      {labels.map((l) => (
        <text key={`lbl-${l.seg.idx}`} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="9.5" fill="#fff" fontWeight={600} fontFamily="ui-monospace, monospace"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 2.5 }}>
          {l.order}: {l.lengthMm}mm{l.seg.kind === 'pin' ? ' ⬢' : ''}
        </text>
      ))}

      <text x={DRAW_W / 2} y={DRAW_H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">
        plan view · {straights.length} section{straights.length > 1 ? 's' : ''} · ribbon width = channel width · ⬢ = pin-fin · dimensions in mm
      </text>
    </svg>
  );
}
