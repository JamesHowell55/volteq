import type { ReactElement } from 'react';
import type { BoltLoadResult, PatternGeometry } from '../lib/boltPatternPhysics';

// Plan (top-down) view of the bolt pattern in its local x-y plane: every bolt as a
// numbered circle, the pattern centroid with its x/y axes, the load application
// point (if offset from the centroid), and a resultant in-plane shear vector at
// each bolt — the classic "shear vector field" plot used in AISC-style eccentric
// bolt-group diagrams. The critical (lowest safety-factor) bolt is highlighted.

interface Props {
  geometry: PatternGeometry;
  bolts: BoltLoadResult[];
  criticalBoltId: number;
  appXmm: number;
  appYmm: number;
  hasOffsetLoad: boolean;
}

const W = 480;
const H = 420;
const MONO = 'ui-monospace, monospace';

export default function BoltPatternDiagram({ geometry, bolts, criticalBoltId, appXmm, appYmm, hasOffsetLoad }: Props) {
  if (bolts.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 420 }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Add bolts to see the pattern</text>
      </svg>
    );
  }

  const { centroidXmm: cx, centroidYmm: cy } = geometry;

  // Fit all bolts (plus the load-application point and vector tips) into the
  // drawing area with margin, preserving aspect ratio (true-to-scale plan view).
  const allX = bolts.map((b) => b.xMm).concat(hasOffsetLoad ? [cx + appXmm] : []);
  const allY = bolts.map((b) => b.yMm).concat(hasOffsetLoad ? [cy + appYmm] : []);
  const minX = Math.min(...allX, cx) - 1e-6;
  const maxX = Math.max(...allX, cx) + 1e-6;
  const minY = Math.min(...allY, cy) - 1e-6;
  const maxY = Math.max(...allY, cy) + 1e-6;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const margin = 56;
  const availW = W - 2 * margin;
  const availH = H - 2 * margin;
  const scale = Math.min(availW / spanX, availH / spanY);

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const px = (x: number) => W / 2 + (x - midX) * scale;
  const py = (y: number) => H / 2 - (y - midY) * scale; // screen y flips

  const boltRadiusPx = Math.max(7, Math.min(16, scale * 0.06));
  const maxShear = Math.max(...bolts.map((b) => b.resultantShearN), 1e-9);
  const vecScale = maxShear > 0 ? (boltRadiusPx * 2.6) / maxShear : 0;

  const els: ReactElement[] = [];

  // Centroid axes (dashed, faint) spanning the drawing.
  const ccx = px(cx), ccy = py(cy);
  els.push(<line key="axis-x" x1={margin * 0.4} y1={ccy} x2={W - margin * 0.4} y2={ccy} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3 4" />);
  els.push(<line key="axis-y" x1={ccx} y1={margin * 0.4} x2={ccx} y2={H - margin * 0.4} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3 4" />);
  els.push(<text key="axis-x-lbl" x={W - margin * 0.4 + 3} y={ccy + 4} fontSize="10" fontFamily={MONO} fill="var(--text-faint)">+x</text>);
  els.push(<text key="axis-y-lbl" x={ccx + 5} y={margin * 0.4 - 4} fontSize="10" fontFamily={MONO} fill="var(--text-faint)">+y</text>);

  // Centroid marker.
  els.push(<circle key="centroid" cx={ccx} cy={ccy} r={3.5} fill="none" stroke="var(--text-2)" strokeWidth={1.4} />);
  els.push(<line key="centroid-h" x1={ccx - 6} y1={ccy} x2={ccx + 6} y2={ccy} stroke="var(--text-2)" strokeWidth={1.2} />);
  els.push(<line key="centroid-v" x1={ccx} y1={ccy - 6} x2={ccx} y2={ccy + 6} stroke="var(--text-2)" strokeWidth={1.2} />);
  els.push(<text key="centroid-lbl" x={ccx + 8} y={ccy - 8} fontSize="10" fontFamily={MONO} fill="var(--text-2)">centroid</text>);

  // Load application point + connecting line, if offset from centroid.
  if (hasOffsetLoad) {
    const lx = px(cx + appXmm), ly = py(cy + appYmm);
    els.push(<line key="load-line" x1={ccx} y1={ccy} x2={lx} y2={ly} stroke="var(--accent-2, #f59e0b)" strokeWidth={1.3} strokeDasharray="4 3" />);
    els.push(<circle key="load-pt" cx={lx} cy={ly} r={4.5} fill="var(--accent-2, #f59e0b)" />);
    els.push(<text key="load-lbl" x={lx + 7} y={ly - 7} fontSize="10.5" fontFamily={MONO} fill="var(--accent-2, #f59e0b)" fontWeight={600}>load applied here</text>);
  }

  // Bolts: circle + number, resultant in-plane shear vector, worst-case highlighted.
  for (const b of bolts) {
    const bx = px(b.xMm), by = py(b.yMm);
    const isCritical = b.id === criticalBoltId;
    const fill = isCritical ? 'var(--neg, #f87171)' : 'var(--accent-glow)';
    const stroke = isCritical ? 'var(--neg, #f87171)' : 'var(--accent)';

    els.push(<circle key={`bolt-${b.id}`} cx={bx} cy={by} r={boltRadiusPx} fill={fill} stroke={stroke} strokeWidth={1.6} opacity={isCritical ? 0.85 : 1} />);
    els.push(<text key={`bolt-lbl-${b.id}`} x={bx} y={by + 3.5} fontSize={Math.max(8, boltRadiusPx * 0.85)} fontFamily={MONO} fill={isCritical ? '#fff' : 'var(--accent-contrast-text, #fff)'} textAnchor="middle" fontWeight={600}>{b.id + 1}</text>);

    // Resultant shear vector (screen-y is flipped vs. the physics +y, so negate fy).
    if (b.resultantShearN > 1e-6) {
      const vx = bx + b.totalShearXN * vecScale;
      const vy = by - b.totalShearYN * vecScale;
      const ang = Math.atan2(vy - by, vx - bx);
      const ah = 5;
      els.push(<line key={`vec-${b.id}`} x1={bx} y1={by} x2={vx} y2={vy} stroke="var(--text-1, var(--text-2))" strokeWidth={1.4} opacity={0.85} />);
      els.push(<path key={`vec-h-${b.id}`} d={`M${vx} ${vy} L${(vx - ah * Math.cos(ang - 0.4)).toFixed(1)} ${(vy - ah * Math.sin(ang - 0.4)).toFixed(1)} L${(vx - ah * Math.cos(ang + 0.4)).toFixed(1)} ${(vy - ah * Math.sin(ang + 0.4)).toFixed(1)} z`} fill="var(--text-1, var(--text-2))" opacity={0.85} />);
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 420 }}>
      {els}
      <text x={W / 2} y={H - 8} textAnchor="middle" fill="var(--text-faint)" fontSize="10" fontFamily={MONO}>
        plan view · true scale · black arrows = resultant in-plane shear · red = critical bolt
      </text>
    </svg>
  );
}
