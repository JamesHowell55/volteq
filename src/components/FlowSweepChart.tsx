import { useState, type MouseEvent } from 'react';

interface Props {
  xs: number[]; // ascending; each value gets an x-axis tick and a point marker
  ys: number[];
  color: string;
  xLabel: string;
  yLabel: string;
  yUnit: string;
  decimals?: number;
  marker?: { x: number; y: number }; // current operating point
}

const W = 520;
const H = 220;
const M = { left: 58, right: 16, top: 14, bottom: 34 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const fmtX = (x: number) => (Number.isInteger(Math.round(x * 100) / 100) ? x.toFixed(0) : x.toFixed(1));

export default function FlowSweepChart({ xs, ys, color, xLabel, yLabel, yUnit, decimals = 2, marker }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (xs.length < 2) return null;
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const yMax = Math.max(...ys, 1e-9) * 1.05;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * PW;
  const sy = (y: number) => M.top + PH - (y / yMax) * PH;
  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = xMin + ((px - M.left) / PW) * (xMax - xMin);
    let best = 0;
    xs.forEach((x, i) => { if (Math.abs(x - xv) < Math.abs(xs[best] - xv)) best = i; });
    setHover(best);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={sy(yMax * t)} y2={sy(yMax * t)} stroke="var(--border, #444)" strokeOpacity={0.4} />
          <text x={M.left - 6} y={sy(yMax * t) + 3} textAnchor="end" fontSize={10} fill="var(--muted, #888)">{(yMax * t).toFixed(yMax < 1 ? 3 : yMax < 10 ? 2 : 0)}</text>
        </g>
      ))}
      {xs.map((x) => (
        <g key={x}>
          <line x1={sx(x)} x2={sx(x)} y1={M.top} y2={M.top + PH} stroke="var(--border, #444)" strokeOpacity={0.25} />
          <text x={sx(x)} y={H - M.bottom + 14} textAnchor="middle" fontSize={10} fill="var(--muted, #888)">{fmtX(x)}</text>
        </g>
      ))}
      <text x={M.left + PW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted, #888)">{xLabel}</text>
      <text x={12} y={M.top + PH / 2} textAnchor="middle" fontSize={11} fill="var(--muted, #888)" transform={`rotate(-90 12 ${M.top + PH / 2})`}>{yLabel} ({yUnit})</text>
      <path d={path} fill="none" stroke={color} strokeWidth={2.2} />
      {xs.map((x, i) => <circle key={x} cx={sx(x)} cy={sy(ys[i])} r={2.5} fill={color} />)}
      {marker && marker.x >= xMin && marker.x <= xMax && (
        <circle cx={sx(marker.x)} cy={sy(Math.min(marker.y, yMax))} r={5} fill="none" stroke="var(--text, #fff)" strokeWidth={2} />
      )}
      {hover !== null && (
        <g>
          <circle cx={sx(xs[hover])} cy={sy(ys[hover])} r={4} fill={color} />
          <text x={Math.min(sx(xs[hover]) + 8, W - 130)} y={Math.max(sy(ys[hover]) - 8, 12)} fontSize={11} fill="var(--text, #fff)">
            {fmtX(xs[hover])} L/min · {ys[hover].toFixed(decimals)} {yUnit}
          </text>
        </g>
      )}
    </svg>
  );
}
