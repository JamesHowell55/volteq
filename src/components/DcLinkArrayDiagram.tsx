import type { ReactElement } from 'react';
import { toDisplay, unitLabel, UNIT_LENGTH, type UnitSystem } from '../lib/globalUnits';

// Plan (top-down) view of the DC-link capacitor bank laid out on a board:
// a rows × columns grid of L×T footprints with a set inter-capacitor gap, the
// overall envelope dimensions called out, and the worst-case (most enclosed,
// hottest) capacitor highlighted. Drawn to scale within the viewport.

interface Props {
  count: number;
  columns: number;
  rows: number;
  lastRowCount: number;
  boxLengthMm: number;   // L — drawn horizontally
  boxThicknessMm: number; // T — drawn vertically
  boxHeightMm: number;    // H — standing height (labelled, not drawn)
  spacingMm: number;
  envelopeWmm: number;
  envelopeDmm: number;
  hotColumn: number;      // 0-based column of the worst cap
  hotRow: number;         // 0-based row of the worst cap
  unitSystem: UnitSystem;
}

const W = 480;
const H = 340;
const MONO = 'ui-monospace, monospace';

function fmtDim(mm: number, unitSystem: UnitSystem): string {
  const v = toDisplay(mm, unitSystem, UNIT_LENGTH);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: unitSystem === 'imperial' ? 2 : 1 })} ${unitLabel(unitSystem, UNIT_LENGTH)}`;
}

export default function DcLinkArrayDiagram(props: Props) {
  const { count, columns, rows, lastRowCount, boxLengthMm: L, boxThicknessMm: T, boxHeightMm: Hbox,
    spacingMm: s, envelopeWmm, envelopeDmm, hotColumn, hotRow, unitSystem } = props;

  if (count < 1 || L <= 0 || T <= 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 340 }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-faint)" fontSize="13">Select a capacitor to lay out the bank</text>
      </svg>
    );
  }

  // Scale the envelope to fit the drawing area (leave margins for labels).
  const availW = W - 120;
  const availH = H - 90;
  const scale = Math.min(availW / envelopeWmm, availH / envelopeDmm);
  const gridW = envelopeWmm * scale;
  const gridH = envelopeDmm * scale;
  const x0 = (W - gridW) / 2 + 10;
  const y0 = 46;

  const cellW = L * scale;
  const cellH = T * scale;
  const gap = s * scale;

  const els: ReactElement[] = [];

  // Envelope bounding box.
  els.push(<rect key="env" x={x0 - 4} y={y0 - 4} width={gridW + 8} height={gridH + 8} fill="none" stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="4 3" />);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const inThisRow = r === rows - 1 ? lastRowCount : columns;
    for (let c = 0; c < inThisRow; c++) {
      const cx = x0 + c * (cellW + gap);
      const cy = y0 + r * (cellH + gap);
      const isHot = r === hotRow && c === hotColumn;
      els.push(
        <rect key={`cap-${idx}`} x={cx} y={cy} width={cellW} height={cellH} rx={Math.min(3, cellW * 0.12)}
          fill={isHot ? 'var(--neg, #f87171)' : 'var(--accent-glow)'}
          stroke={isHot ? 'var(--neg, #f87171)' : 'var(--accent)'} strokeWidth={1.4}
          opacity={isHot ? 0.55 : 1} />
      );
      // Terminal dots to hint at the radial leads.
      if (cellW > 14 && cellH > 8) {
        els.push(<circle key={`t1-${idx}`} cx={cx + cellW * 0.32} cy={cy + cellH / 2} r={1.6} fill="var(--accent)" />);
        els.push(<circle key={`t2-${idx}`} cx={cx + cellW * 0.68} cy={cy + cellH / 2} r={1.6} fill="var(--accent)" />);
      }
      idx++;
    }
  }

  // Width dimension (below).
  const dimY = y0 + gridH + 22;
  els.push(
    <g key="wdim" stroke="var(--text-faint)" strokeWidth={1}>
      <line x1={x0} y1={dimY} x2={x0 + gridW} y2={dimY} />
      <line x1={x0} y1={dimY - 4} x2={x0} y2={dimY + 4} />
      <line x1={x0 + gridW} y1={dimY - 4} x2={x0 + gridW} y2={dimY + 4} />
      <text x={x0 + gridW / 2} y={dimY + 14} fontSize="10" fill="var(--text-2)" fontFamily={MONO} textAnchor="middle" stroke="none">W = {fmtDim(envelopeWmm, unitSystem)}</text>
    </g>
  );
  // Depth dimension (right).
  const dimX = x0 + gridW + 16;
  els.push(
    <g key="ddim" stroke="var(--text-faint)" strokeWidth={1}>
      <line x1={dimX} y1={y0} x2={dimX} y2={y0 + gridH} />
      <line x1={dimX - 4} y1={y0} x2={dimX + 4} y2={y0} />
      <line x1={dimX - 4} y1={y0 + gridH} x2={dimX + 4} y2={y0 + gridH} />
      <text x={dimX + 6} y={y0 + gridH / 2} fontSize="10" fill="var(--text-2)" fontFamily={MONO} textAnchor="start" stroke="none" transform={`rotate(90 ${dimX + 6} ${y0 + gridH / 2})`}>D = {fmtDim(envelopeDmm, unitSystem)}</text>
    </g>
  );

  els.push(<text key="title" x={x0 - 4} y={y0 - 12} fontSize="10.5" fill="var(--text-2)" fontFamily={MONO}>{rows}×{columns} grid · {count} caps · gap {fmtDim(s, unitSystem)}</text>);
  els.push(<text key="height" x={W / 2} y={H - 8} textAnchor="middle" fill="var(--text-faint)" fontSize="10" fontFamily={MONO}>plan view · standing height H = {fmtDim(Hbox, unitSystem)} · red = worst-case (hottest) position</text>);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 340 }}>
      {els}
    </svg>
  );
}
