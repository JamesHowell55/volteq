import type { ReactNode } from 'react';
import type { CoreDimensions } from '../lib/chokeCoreGeometry';

interface Props {
  dims: CoreDimensions;
  turnsConfig: 'passthrough' | 'wound';
  turns: number;
}

const DRAW_W = 420;
const DRAW_H = 300;
const PAD = 30;

// Schematic 2D cross-section of the selected core profile, with a pass-through
// busbar or a representative set of wound turns overlaid. Not to a single fixed
// scale across profiles (each profile is scaled to fill the drawing area) —
// this is a schematic for visualising proportions and topology, not a precision
// engineering drawing.
export default function ChokeCoreCrossSection({ dims, turnsConfig, turns }: Props) {
  const availW = DRAW_W - 2 * PAD;
  const availH = DRAW_H - 2 * PAD - 20; // leave room for the caption line

  let body: ReactNode;
  let caption: string;

  if (dims.profile === 'toroidal') {
    const { outerDiameterMm: od, innerDiameterMm: id, heightMm: h } = dims;
    const scale = Math.min(availW, availH) / od;
    const rOuter = (od * scale) / 2;
    const rInner = (id * scale) / 2;
    const cx = DRAW_W / 2;
    const cy = PAD + availH / 2;

    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: Math.min(Math.max(Math.round(turns), 1), 16) }, (_, i) => {
          const angle = (i / Math.min(Math.max(Math.round(turns), 1), 16)) * Math.PI * 2;
          const x1 = cx + Math.cos(angle) * (rInner - 3);
          const y1 = cy + Math.sin(angle) * (rInner - 3);
          const x2 = cx + Math.cos(angle) * (rOuter + 3);
          const y2 = cy + Math.sin(angle) * (rOuter + 3);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeWidth={2} />;
        })
      : null;

    body = (
      <g>
        <circle cx={cx} cy={cy} r={rOuter} fill="color-mix(in srgb, var(--text-3) 30%, transparent)" stroke="var(--text-2)" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={rInner} fill="var(--bg-card)" stroke="var(--text-2)" strokeWidth={1.5} />
        {turnsConfig === 'passthrough' && (
          <rect x={cx - rInner * 0.55} y={cy - rInner * 0.28} width={rInner * 1.1} height={rInner * 0.56} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} />
        )}
        {turnMarks}
        <text x={cx} y={cy - rOuter - 10} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">OD {od} mm</text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="var(--text-2)" fontFamily="ui-monospace, monospace">ID {id} mm</text>
      </g>
    );
    caption = `Toroidal · height (stack) ${h} mm · ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`}`;
  } else if (dims.profile === 'oval') {
    const { straightLengthMm: s, innerRadiusMm: ri, outerRadiusMm: ro, heightMm: h } = dims;
    const totalW = s + 2 * ro;
    const totalH = 2 * ro;
    const scale = Math.min(availW / totalW, availH / totalH);
    const sPx = s * scale;
    const roPx = ro * scale;
    const riPx = ri * scale;
    const cx = DRAW_W / 2;
    const cy = PAD + availH / 2;
    const left = cx - sPx / 2;
    const right = cx + sPx / 2;

    const outerPath = `M ${left} ${cy - roPx} L ${right} ${cy - roPx} A ${roPx} ${roPx} 0 0 1 ${right} ${cy + roPx} L ${left} ${cy + roPx} A ${roPx} ${roPx} 0 0 1 ${left} ${cy - roPx} Z`;
    const innerPath = `M ${left} ${cy - riPx} L ${right} ${cy - riPx} A ${riPx} ${riPx} 0 0 1 ${right} ${cy + riPx} L ${left} ${cy + riPx} A ${riPx} ${riPx} 0 0 1 ${left} ${cy - riPx} Z`;

    const nOval = Math.min(Math.max(Math.round(turns), 1), 16);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: nOval }, (_, i) => {
          const t = i / nOval;
          const x = left + t * sPx * 2 > right ? right - (t * sPx * 2 - sPx) : left + t * sPx * 2;
          return <line key={i} x1={x} y1={cy - riPx + 3} x2={x} y2={cy - roPx - 3} stroke="var(--accent)" strokeWidth={2} />;
        })
      : null;

    body = (
      <g>
        <path d={outerPath} fill="color-mix(in srgb, var(--text-3) 30%, transparent)" stroke="var(--text-2)" strokeWidth={1.5} fillRule="evenodd" />
        <path d={innerPath} fill="var(--bg-card)" stroke="var(--text-2)" strokeWidth={1.5} />
        {turnsConfig === 'passthrough' && (
          <rect x={cx - riPx * 0.5} y={cy - riPx * 0.25} width={riPx} height={riPx * 0.5} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} />
        )}
        {turnMarks}
        <text x={cx} y={cy - roPx - 10} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">straight {s} mm</text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="var(--text-2)" fontFamily="ui-monospace, monospace">ri {ri} / ro {ro} mm</text>
      </g>
    );
    caption = `Oval / racetrack · height (stack) ${h} mm · ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`}`;
  } else if (dims.profile === 'ucore') {
    const { legWidthMm: a, stackDepthMm: d, windowHeightMm: hw, windowWidthMm: ww } = dims;
    const totalW = ww + 2 * a;
    const totalH = hw + 2 * a;
    const scale = Math.min(availW / totalW, availH / totalH);
    const outerWPx = totalW * scale;
    const outerHPx = totalH * scale;
    const aPx = a * scale;
    const x0 = DRAW_W / 2 - outerWPx / 2;
    const y0 = PAD + availH / 2 - outerHPx / 2;

    const nUcore = Math.min(Math.max(Math.round(turns), 1), 12);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: nUcore }, (_, i) => {
          const y = y0 + aPx + ((i + 0.5) / nUcore) * (outerHPx - 2 * aPx);
          return <line key={i} x1={x0 + aPx * 0.3} y1={y} x2={x0 + outerWPx - aPx * 0.3} y2={y} stroke="var(--accent)" strokeWidth={1.5} opacity={0.7} />;
        })
      : null;

    body = (
      <g>
        <rect x={x0} y={y0} width={outerWPx} height={outerHPx} fill="color-mix(in srgb, var(--text-3) 30%, transparent)" stroke="var(--text-2)" strokeWidth={1.5} />
        <rect x={x0 + aPx} y={y0 + aPx} width={outerWPx - 2 * aPx} height={outerHPx - 2 * aPx} fill="var(--bg-card)" stroke="var(--text-2)" strokeWidth={1.5} />
        {turnsConfig === 'passthrough' && (
          <rect x={x0 + outerWPx / 2 - (outerHPx - 2 * aPx) * 0.18} y={y0 + aPx} width={(outerHPx - 2 * aPx) * 0.36} height={outerHPx - 2 * aPx} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} />
        )}
        {turnMarks}
        <text x={x0 + outerWPx / 2} y={y0 - 10} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">leg {a} mm</text>
        <text x={x0 + outerWPx / 2} y={y0 + outerHPx / 2 + 3} textAnchor="middle" fontSize="9" fill="var(--text-2)" fontFamily="ui-monospace, monospace">window {ww}×{hw} mm</text>
      </g>
    );
    caption = `U-core · stack depth ${d} mm · ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`} · simplified rectangular loop`;
  } else {
    const { centerLegWidthMm: a, stackDepthMm: d, windowHeightMm: hw, windowWidthMm: ww } = dims;
    const outerLegW = a * 0.7;
    const totalW = ww * 2 + a + 2 * outerLegW;
    const totalH = hw + 2 * outerLegW;
    const scale = Math.min(availW / totalW, availH / totalH);
    const outerWPx = totalW * scale;
    const outerHPx = totalH * scale;
    const legPx = outerLegW * scale;
    const centerLegPx = a * scale;
    const wwPx = ww * scale;
    const x0 = DRAW_W / 2 - outerWPx / 2;
    const y0 = PAD + availH / 2 - outerHPx / 2;
    const centerX = x0 + legPx + wwPx;

    const nEcore = Math.min(Math.max(Math.round(turns), 1), 12);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: nEcore }, (_, i) => {
          const y = y0 + legPx + ((i + 0.5) / nEcore) * (outerHPx - 2 * legPx);
          return <line key={i} x1={centerX - centerLegPx * 0.6} y1={y} x2={centerX + centerLegPx * 1.6} y2={y} stroke="var(--accent)" strokeWidth={1.5} opacity={0.7} />;
        })
      : null;

    body = (
      <g>
        <rect x={x0} y={y0} width={outerWPx} height={outerHPx} fill="color-mix(in srgb, var(--text-3) 30%, transparent)" stroke="var(--text-2)" strokeWidth={1.5} />
        <rect x={x0 + legPx} y={y0 + legPx} width={wwPx} height={outerHPx - 2 * legPx} fill="var(--bg-card)" stroke="var(--text-2)" strokeWidth={1} />
        <rect x={centerX + centerLegPx} y={y0 + legPx} width={wwPx} height={outerHPx - 2 * legPx} fill="var(--bg-card)" stroke="var(--text-2)" strokeWidth={1} />
        {turnsConfig === 'passthrough' && (
          <rect x={centerX + centerLegPx * 0.22} y={y0 + legPx} width={centerLegPx * 0.56} height={outerHPx - 2 * legPx} fill="var(--accent-glow)" stroke="var(--accent)" strokeWidth={1.5} />
        )}
        {turnMarks}
        <text x={centerX + centerLegPx / 2} y={y0 - 10} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="ui-monospace, monospace">center leg {a} mm</text>
        <text x={centerX + centerLegPx / 2} y={y0 + outerHPx + 16} textAnchor="middle" fontSize="9" fill="var(--text-2)" fontFamily="ui-monospace, monospace">window {ww}×{hw} mm (×2)</text>
      </g>
    );
    caption = `E-core · stack depth ${d} mm · ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`} · simplified rectangular loop`;
  }

  return (
    <svg viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} width="100%" style={{ maxHeight: 320 }}>
      {body}
      <text x={DRAW_W / 2} y={DRAW_H - 10} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)" fontFamily="ui-monospace, monospace">
        {caption}
      </text>
    </svg>
  );
}
