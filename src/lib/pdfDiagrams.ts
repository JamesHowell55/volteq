// Standalone SVG string generators for embedding diagrams in the PDF report.
// Deliberately NOT reusing the live on-page components (BusbarLengthProfile,
// BusbarCrossSection, ConductionStackCrossSection, TimeSeriesChart) directly:
// those use CSS custom properties (var(--text-2), var(--accent), etc.) that
// flip between light/dark theme. The PDF report is always forced light
// (see pdfExport.ts), so embedding the live themed markup as-is risks
// unreadable text for anyone using the site in dark mode (its default) —
// these generators use the same literal light-theme hex values the rest of
// the PDF template already hardcodes, so they render correctly regardless
// of the live site's current theme.

const TEXT_2 = '#565C53';
const TEXT_FAINT = '#9A9D95';
const BORDER_STRONG = '#C8CBC5';
const BLUE = '#0284C7';
const WARN = '#CA8A04';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface PdfSection {
  width: number;
  length: number;
  coolingEnabled?: boolean;
}

/** Plan view of lengthwise busbar sections, matching BusbarLengthProfile.tsx's
 *  layout logic with hardcoded light-theme colors. */
export function renderLengthProfileSvg(sections: PdfSection[], accentColor: string): string {
  const W = 700;
  const H = 220;
  const MARGIN = 48;
  if (sections.length === 0 || sections.some(s => s.width <= 0 || s.length <= 0)) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${TEXT_FAINT}" font-size="13">No sections</text></svg>`;
  }

  const totalLength = sections.reduce((s, sec) => s + sec.length, 0);
  const maxWidth = Math.max(...sections.map(s => s.width));
  const availW = W - 2 * MARGIN;
  const availH = H - 2 * MARGIN - 20;
  const scale = Math.min(availW / totalLength, availH / maxWidth);
  const centerY = MARGIN + availH / 2;

  let cursor = 0;
  const rects = sections.map(s => {
    const w = s.length * scale;
    const h = s.width * scale;
    const x = MARGIN + cursor * scale;
    const y = centerY - h / 2;
    cursor += s.length;
    return { x, y, w, h, section: s };
  });
  const dimY = centerY + (maxWidth * scale) / 2 + 24;

  const rectsHtml = rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${accentColor}" stroke-width="1.5" rx="1" />`).join('');
  const hatchHtml = rects.filter(r => r.section.coolingEnabled)
    .map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#pdfCoolingHatch)" stroke="${BLUE}" stroke-width="1.5" rx="1" />`).join('');
  const dimsHtml = rects.map(r => `
    <g font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">
      <line x1="${r.x}" y1="${dimY - 6}" x2="${r.x}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <line x1="${r.x + r.w}" y1="${dimY - 6}" x2="${r.x + r.w}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <line x1="${r.x}" y1="${dimY}" x2="${r.x + r.w}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <text x="${r.x + r.w / 2}" y="${dimY + 13}" text-anchor="middle">${r.section.length} mm</text>
      <text x="${r.x + r.w / 2}" y="${r.y - 6}" text-anchor="middle">${r.section.width}mm</text>
      ${r.section.coolingEnabled ? `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3}" text-anchor="middle" fill="${BLUE}" font-weight="700">conduction</text>` : ''}
    </g>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <defs>
      <pattern id="pdfCoolingHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="${BLUE}" opacity="0.12" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="${BLUE}" stroke-width="2.2" />
      </pattern>
    </defs>
    ${rectsHtml}
    ${hatchHtml}
    <line x1="${MARGIN}" x2="${MARGIN + totalLength * scale}" y1="${centerY}" y2="${centerY}" stroke="${TEXT_FAINT}" stroke-dasharray="2,3" stroke-width="1" />
    ${dimsHtml}
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">
      plan view &middot; ${sections.length} section${sections.length > 1 ? 's' : ''} &middot; current flows left to right &middot; dimensions in mm
    </text>
  </svg>`;
}

export interface PdfBar {
  width: number;
  thickness: number;
  gapAfter: number;
}

/** Cross-section of stacked parallel bars, matching BusbarCrossSection.tsx. */
export function renderCrossSectionSvg(bars: PdfBar[], orientation: 'vertical' | 'horizontal', accentColor: string): string {
  const W = 480;
  const H = 300;
  const MARGIN = 56;
  if (bars.length === 0 || bars.some(b => b.width <= 0 || b.thickness <= 0)) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${TEXT_FAINT}" font-size="13">No bar sections</text></svg>`;
  }

  const isVertical = orientation === 'vertical';
  const totalSpan = bars.reduce((s, b) => s + b.thickness, 0) + bars.slice(0, -1).reduce((s, b) => s + b.gapAfter, 0);
  const maxCross = Math.max(...bars.map(b => b.width));
  const availW = W - 2 * MARGIN;
  const availH = H - 2 * MARGIN;
  const spanMm = isVertical ? totalSpan : maxCross;
  const crossMm = isVertical ? maxCross : totalSpan;
  const scale = Math.min(availW / spanMm, availH / crossMm, 12);
  const spanPx = spanMm * scale;
  const crossPx = crossMm * scale;
  const originX = (W - spanPx) / 2;
  const originY = (H - crossPx) / 2;

  let cursor = 0;
  const rects = bars.map(bar => {
    const thickPx = bar.thickness * scale;
    const widthPx = bar.width * scale;
    const pos = cursor;
    cursor += bar.thickness + bar.gapAfter;
    if (isVertical) {
      return { x: originX + pos * scale, y: originY + (crossPx - widthPx), w: thickPx, h: widthPx, thickness: bar.thickness };
    }
    return { x: originX, y: originY + pos * scale, w: widthPx, h: thickPx, thickness: bar.thickness };
  });

  const baseY = originY + crossPx + 26;
  const baseX = originX - 26;
  const rectsHtml = rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${accentColor}" stroke-width="1.5" rx="1" />`).join('');
  const dimsHtml = isVertical
    ? rects.map(r => `
      <g font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">
        <line x1="${r.x}" y1="${baseY - 6}" x2="${r.x}" y2="${baseY}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <line x1="${r.x + r.w}" y1="${baseY - 6}" x2="${r.x + r.w}" y2="${baseY}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <line x1="${r.x}" y1="${baseY}" x2="${r.x + r.w}" y2="${baseY}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <text x="${r.x + r.w / 2}" y="${baseY + 13}" text-anchor="middle">${r.thickness}</text>
      </g>`).join('')
    : rects.map(r => `
      <g font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">
        <line x1="${baseX - 6}" y1="${r.y}" x2="${baseX}" y2="${r.y}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <line x1="${baseX - 6}" y1="${r.y + r.h}" x2="${baseX}" y2="${r.y + r.h}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <line x1="${baseX}" y1="${r.y}" x2="${baseX}" y2="${r.y + r.h}" stroke="${BORDER_STRONG}" stroke-width="1" />
        <text x="${baseX - 10}" y="${r.y + r.h / 2 + 3}" text-anchor="end">${r.thickness}</text>
      </g>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    ${rectsHtml}
    ${dimsHtml}
    <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">
      ${bars.length} bar${bars.length > 1 ? 's' : ''} &middot; ${orientation === 'vertical' ? 'edge-mounted' : 'flat-mounted'} &middot; dimensions in mm
    </text>
  </svg>`;
}

/** Conduction-cooling stack (busbar -> TIM -> metallic section -> fluid),
 *  matching ConductionStackCrossSection.tsx. */
export function renderConductionStackSvg(
  busbarThicknessMm: number,
  timThicknessMm: number,
  timConductivity: number,
  metalThicknessMm: number,
  metalConductivity: number,
  accentColor: string
): string {
  const W = 420;
  const H = 300;
  const MARGIN_TOP = 30;
  const MARGIN_BOTTOM = 40;
  const MARGIN_X = 100;
  const FLUID_BAND_PX = 46;

  const stackW = W - 2 * MARGIN_X;
  const availH = H - MARGIN_TOP - MARGIN_BOTTOM - FLUID_BAND_PX;
  const totalMm = Math.max(busbarThicknessMm + timThicknessMm + metalThicknessMm, 0.001);
  const scale = availH / totalMm;

  const busbarPx = Math.max(busbarThicknessMm * scale, 10);
  const timPx = Math.max(timThicknessMm * scale, 4);
  const metalPx = Math.max(metalThicknessMm * scale, 8);
  const busbarY = MARGIN_TOP;
  const timY = busbarY + busbarPx;
  const metalY = timY + timPx;
  const fluidY = metalY + metalPx;

  const layers = [
    { y: busbarY, h: busbarPx, fill: `color-mix(in srgb, ${accentColor} 12%, white)`, stroke: accentColor, label: 'Busbar (conductor)', dim: `${busbarThicknessMm} mm` },
    { y: timY, h: timPx, fill: 'color-mix(in srgb, #CA8A04 15%, white)', stroke: WARN, label: 'Thermal interface material', dim: `${timThicknessMm} mm, k=${timConductivity} W/m&middot;K` },
    { y: metalY, h: metalPx, fill: 'color-mix(in srgb, #565C53 15%, white)', stroke: TEXT_2, label: 'Metallic section', dim: `${metalThicknessMm} mm, k=${metalConductivity} W/m&middot;K` },
  ];

  const layersHtml = layers.map(l => `
    <g>
      <rect x="${MARGIN_X}" y="${l.y}" width="${stackW}" height="${l.h}" fill="${l.fill}" stroke="${l.stroke}" stroke-width="1.5" />
      <text x="${MARGIN_X - 10}" y="${l.y + l.h / 2 + 3}" text-anchor="end" font-size="10" fill="${l.stroke}" font-family="ui-monospace, monospace">${escapeXml(l.label)}</text>
      <text x="${MARGIN_X + stackW + 10}" y="${l.y + l.h / 2 + 3}" text-anchor="start" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">${l.dim}</text>
    </g>`).join('');

  const arrows = [0.2, 0.45, 0.7, 0.95].map(f => {
    const cx = MARGIN_X + stackW * f;
    const cy = fluidY + FLUID_BAND_PX / 2;
    return `<path d="M ${cx - 8} ${cy} L ${cx + 4} ${cy} L ${cx} ${cy - 5} M ${cx + 4} ${cy} L ${cx} ${cy + 5}" stroke="${BLUE}" stroke-width="1.3" fill="none" opacity="0.85" />`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <defs>
      <pattern id="pdfCoolingHatch2" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="${BLUE}" opacity="0.12" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="${BLUE}" stroke-width="2.2" />
      </pattern>
    </defs>
    ${layersHtml}
    <rect x="${MARGIN_X}" y="${fluidY}" width="${stackW}" height="${FLUID_BAND_PX}" fill="url(#pdfCoolingHatch2)" stroke="${BLUE}" stroke-width="1.5" />
    <text x="${MARGIN_X - 10}" y="${fluidY + FLUID_BAND_PX / 2 + 3}" text-anchor="end" font-size="10" fill="${BLUE}" font-family="ui-monospace, monospace">Coolant / fluid</text>
    ${arrows}
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">
      conduction path (one face) &middot; layers to scale except fluid band
    </text>
  </svg>`;
}

export interface PdfSeries {
  label: string;
  color: string;
  values: number[];
}

/** Static current/temperature-vs-time chart, matching TimeSeriesChart.tsx's
 *  traces (no hover interactivity needed in a printed report). */
export function renderTimeSeriesChartSvg(timeS: number[], currentA: number[], series: PdfSeries[], ambientC: number, maxTempC: number): string {
  const W = 700;
  const H = 320;
  const MARGIN = { left: 55, right: 55, top: 20, bottom: 40 };
  const PLOT_W = W - MARGIN.left - MARGIN.right;
  const PLOT_H = H - MARGIN.top - MARGIN.bottom;
  if (timeS.length === 0) return `<svg viewBox="0 0 ${W} ${H}" width="100%"></svg>`;

  const tMax = Math.max(...timeS, 0.001);
  const iMax = Math.max(...currentA, 1) * 1.1;
  const allTemps = series.flatMap(s => s.values).concat([ambientC, maxTempC]);
  const tempMinRaw = Math.min(...allTemps);
  const tempMaxRaw = Math.max(...allTemps);
  const tempPad = Math.max((tempMaxRaw - tempMinRaw) * 0.1, 2);
  const tempMin = tempMinRaw - tempPad;
  const tempMax = tempMaxRaw + tempPad;

  const xScale = (t: number) => MARGIN.left + (t / tMax) * PLOT_W;
  const yCurrentScale = (i: number) => MARGIN.top + (1 - i / iMax) * PLOT_H;
  const yTempScale = (temp: number) => MARGIN.top + (1 - (temp - tempMin) / (tempMax - tempMin)) * PLOT_H;
  const pathFor = (xs: number[], ys: number[]) => xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  const xs = timeS.map(xScale);
  const currentYs = currentA.map(yCurrentScale);

  const seriesHtml = series.map(s => `<path d="${pathFor(xs, s.values.map(yTempScale))}" fill="none" stroke="${s.color}" stroke-width="2" />`).join('');
  const legendHtml = series.map((s, i) => `
    <g font-size="9" font-family="ui-monospace, monospace">
      <rect x="${MARGIN.left + i * 95}" y="${H - 10}" width="8" height="8" fill="${s.color}" />
      <text x="${MARGIN.left + i * 95 + 12}" y="${H - 3}" fill="${TEXT_2}">${escapeXml(s.label)}</text>
    </g>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${yTempScale(ambientC)}" y2="${yTempScale(ambientC)}" stroke="${TEXT_FAINT}" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${W - MARGIN.right + 4}" y="${yTempScale(ambientC) + 3}" font-size="8.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">ambient</text>
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${yTempScale(maxTempC)}" y2="${yTempScale(maxTempC)}" stroke="#DC2626" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${W - MARGIN.right + 4}" y="${yTempScale(maxTempC) + 3}" font-size="8.5" fill="#DC2626" font-family="ui-monospace, monospace">limit</text>
    <path d="${pathFor(xs, currentYs)}" fill="none" stroke="${BLUE}" stroke-width="1.5" opacity="0.85" />
    ${seriesHtml}
    <line x1="${MARGIN.left}" x2="${MARGIN.left}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <line x1="${W - MARGIN.right}" x2="${W - MARGIN.right}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${H - MARGIN.bottom}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <text x="12" y="${MARGIN.top - 6}" font-size="9" fill="${BLUE}" font-family="ui-monospace, monospace">A (current)</text>
    <text x="${W - MARGIN.right}" y="${MARGIN.top - 6}" text-anchor="end" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">&deg;C (temp)</text>
    <text x="${(MARGIN.left + W - MARGIN.right) / 2}" y="${H - MARGIN.bottom + 14}" text-anchor="middle" font-size="9" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">time (s)</text>
    ${legendHtml}
  </svg>`;
}
