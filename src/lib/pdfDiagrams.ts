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
const POS = '#16A34A';
const NEG = '#DC2626';

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

import type { CoreDimensions } from './chokeCoreGeometry';

/** Choke core cross-section (Toroidal/Oval/U-core/E-core), matching ChokeCoreCrossSection.tsx. */
export function renderChokeCoreProfileSvg(
  dims: CoreDimensions,
  turnsConfig: 'passthrough' | 'wound',
  turns: number,
  accentColor: string
): string {
  const W = 420;
  const H = 300;
  const PAD = 30;
  const availW = W - 2 * PAD;
  const availH = H - 2 * PAD - 20;
  const coreFill = 'color-mix(in srgb, #565C53 15%, white)';
  const turnColor = accentColor;
  const passthroughFill = `color-mix(in srgb, ${accentColor} 15%, white)`;

  let body = '';
  let caption = '';

  if (dims.profile === 'toroidal') {
    const { outerDiameterMm: od, innerDiameterMm: id, heightMm: h } = dims;
    const scale = Math.min(availW, availH) / od;
    const rOuter = (od * scale) / 2;
    const rInner = (id * scale) / 2;
    const cx = W / 2;
    const cy = PAD + availH / 2;
    const n = Math.min(Math.max(Math.round(turns), 1), 16);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2;
        const x1 = cx + Math.cos(angle) * (rInner - 3);
        const y1 = cy + Math.sin(angle) * (rInner - 3);
        const x2 = cx + Math.cos(angle) * (rOuter + 3);
        const y2 = cy + Math.sin(angle) * (rOuter + 3);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${turnColor}" stroke-width="2" />`;
      }).join('')
      : '';
    body = `
      <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${coreFill}" stroke="${TEXT_2}" stroke-width="1.5" />
      <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="white" stroke="${TEXT_2}" stroke-width="1.5" />
      ${turnsConfig === 'passthrough' ? `<rect x="${cx - rInner * 0.55}" y="${cy - rInner * 0.28}" width="${rInner * 1.1}" height="${rInner * 0.56}" fill="${passthroughFill}" stroke="${accentColor}" stroke-width="1.5" />` : ''}
      ${turnMarks}
      <text x="${cx}" y="${cy - rOuter - 10}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">OD ${od} mm</text>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">ID ${id} mm</text>`;
    caption = `Toroidal &middot; height (stack) ${h} mm &middot; ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`}`;
  } else if (dims.profile === 'oval') {
    const { straightLengthMm: s, innerRadiusMm: ri, outerRadiusMm: ro, heightMm: h } = dims;
    const totalW = s + 2 * ro;
    const totalH = 2 * ro;
    const scale = Math.min(availW / totalW, availH / totalH);
    const sPx = s * scale;
    const roPx = ro * scale;
    const riPx = ri * scale;
    const cx = W / 2;
    const cy = PAD + availH / 2;
    const left = cx - sPx / 2;
    const right = cx + sPx / 2;
    const outerPath = `M ${left} ${cy - roPx} L ${right} ${cy - roPx} A ${roPx} ${roPx} 0 0 1 ${right} ${cy + roPx} L ${left} ${cy + roPx} A ${roPx} ${roPx} 0 0 1 ${left} ${cy - roPx} Z`;
    const innerPath = `M ${left} ${cy - riPx} L ${right} ${cy - riPx} A ${riPx} ${riPx} 0 0 1 ${right} ${cy + riPx} L ${left} ${cy + riPx} A ${riPx} ${riPx} 0 0 1 ${left} ${cy - riPx} Z`;
    const n = Math.min(Math.max(Math.round(turns), 1), 16);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: n }, (_, i) => {
        const t = i / n;
        const x = left + t * sPx * 2 > right ? right - (t * sPx * 2 - sPx) : left + t * sPx * 2;
        return `<line x1="${x}" y1="${cy - riPx + 3}" x2="${x}" y2="${cy - roPx - 3}" stroke="${turnColor}" stroke-width="2" />`;
      }).join('')
      : '';
    body = `
      <path d="${outerPath}" fill="${coreFill}" stroke="${TEXT_2}" stroke-width="1.5" fill-rule="evenodd" />
      <path d="${innerPath}" fill="white" stroke="${TEXT_2}" stroke-width="1.5" />
      ${turnsConfig === 'passthrough' ? `<rect x="${cx - riPx * 0.5}" y="${cy - riPx * 0.25}" width="${riPx}" height="${riPx * 0.5}" fill="${passthroughFill}" stroke="${accentColor}" stroke-width="1.5" />` : ''}
      ${turnMarks}
      <text x="${cx}" y="${cy - roPx - 10}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">straight ${s} mm</text>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">ri ${ri} / ro ${ro} mm</text>`;
    caption = `Oval / racetrack &middot; height (stack) ${h} mm &middot; ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`}`;
  } else if (dims.profile === 'ucore') {
    const { legWidthMm: a, stackDepthMm: d, windowHeightMm: hw, windowWidthMm: ww } = dims;
    const totalW = ww + 2 * a;
    const totalH = hw + 2 * a;
    const scale = Math.min(availW / totalW, availH / totalH);
    const outerWPx = totalW * scale;
    const outerHPx = totalH * scale;
    const aPx = a * scale;
    const x0 = W / 2 - outerWPx / 2;
    const y0 = PAD + availH / 2 - outerHPx / 2;
    const n = Math.min(Math.max(Math.round(turns), 1), 12);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: n }, (_, i) => {
        const y = y0 + aPx + ((i + 0.5) / n) * (outerHPx - 2 * aPx);
        return `<line x1="${x0 + aPx * 0.3}" y1="${y}" x2="${x0 + outerWPx - aPx * 0.3}" y2="${y}" stroke="${turnColor}" stroke-width="1.5" opacity="0.7" />`;
      }).join('')
      : '';
    body = `
      <rect x="${x0}" y="${y0}" width="${outerWPx}" height="${outerHPx}" fill="${coreFill}" stroke="${TEXT_2}" stroke-width="1.5" />
      <rect x="${x0 + aPx}" y="${y0 + aPx}" width="${outerWPx - 2 * aPx}" height="${outerHPx - 2 * aPx}" fill="white" stroke="${TEXT_2}" stroke-width="1.5" />
      ${turnsConfig === 'passthrough' ? `<rect x="${x0 + outerWPx / 2 - (outerHPx - 2 * aPx) * 0.18}" y="${y0 + aPx}" width="${(outerHPx - 2 * aPx) * 0.36}" height="${outerHPx - 2 * aPx}" fill="${passthroughFill}" stroke="${accentColor}" stroke-width="1.5" />` : ''}
      ${turnMarks}
      <text x="${x0 + outerWPx / 2}" y="${y0 - 10}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">leg ${a} mm</text>
      <text x="${x0 + outerWPx / 2}" y="${y0 + outerHPx / 2 + 3}" text-anchor="middle" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">window ${ww}&times;${hw} mm</text>`;
    caption = `U-core &middot; stack depth ${d} mm &middot; ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`} &middot; simplified rectangular loop`;
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
    const x0 = W / 2 - outerWPx / 2;
    const y0 = PAD + availH / 2 - outerHPx / 2;
    const centerX = x0 + legPx + wwPx;
    const n = Math.min(Math.max(Math.round(turns), 1), 12);
    const turnMarks = turnsConfig === 'wound'
      ? Array.from({ length: n }, (_, i) => {
        const y = y0 + legPx + ((i + 0.5) / n) * (outerHPx - 2 * legPx);
        return `<line x1="${centerX - centerLegPx * 0.6}" y1="${y}" x2="${centerX + centerLegPx * 1.6}" y2="${y}" stroke="${turnColor}" stroke-width="1.5" opacity="0.7" />`;
      }).join('')
      : '';
    body = `
      <rect x="${x0}" y="${y0}" width="${outerWPx}" height="${outerHPx}" fill="${coreFill}" stroke="${TEXT_2}" stroke-width="1.5" />
      <rect x="${x0 + legPx}" y="${y0 + legPx}" width="${wwPx}" height="${outerHPx - 2 * legPx}" fill="white" stroke="${TEXT_2}" stroke-width="1" />
      <rect x="${centerX + centerLegPx}" y="${y0 + legPx}" width="${wwPx}" height="${outerHPx - 2 * legPx}" fill="white" stroke="${TEXT_2}" stroke-width="1" />
      ${turnsConfig === 'passthrough' ? `<rect x="${centerX + centerLegPx * 0.22}" y="${y0 + legPx}" width="${centerLegPx * 0.56}" height="${outerHPx - 2 * legPx}" fill="${passthroughFill}" stroke="${accentColor}" stroke-width="1.5" />` : ''}
      ${turnMarks}
      <text x="${centerX + centerLegPx / 2}" y="${y0 - 10}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">center leg ${a} mm</text>
      <text x="${centerX + centerLegPx / 2}" y="${y0 + outerHPx + 16}" text-anchor="middle" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">window ${ww}&times;${hw} mm (&times;2)</text>`;
    caption = `E-core &middot; stack depth ${d} mm &middot; ${turnsConfig === 'passthrough' ? 'busbar pass-through (N=1)' : `${Math.round(turns)} turns wound`} &middot; simplified rectangular loop`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    ${body}
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">${caption}</text>
  </svg>`;
}

export interface PdfLossBar {
  label: string;
  conductionChannelW: number;
  conductionDiodeW: number;
  deadTimeDiodeW: number;
  switchingW: number;
  reverseRecoveryW: number;
}

/** Stacked per-device loss-breakdown bars, matching LossBreakdownBars.tsx with literal colors. */
export function renderLossBreakdownSvg(bars: PdfLossBar[], accentColor: string): string {
  const SEGMENTS: { key: keyof Omit<PdfLossBar, 'label'>; label: string; color: string }[] = [
    { key: 'conductionChannelW', label: 'Conduction (channel)', color: accentColor },
    { key: 'conductionDiodeW', label: 'Conduction (body diode)', color: WARN },
    { key: 'deadTimeDiodeW', label: 'Dead-time diode', color: '#A98307' },
    { key: 'switchingW', label: 'Switching (Eon+Eoff)', color: BLUE },
    { key: 'reverseRecoveryW', label: 'Reverse recovery', color: '#7396A8' },
  ];
  const BAR_H = 26;
  const ROW_GAP = 14;
  const LABEL_W = 110;
  const VALUE_W = 80;
  const W = 640;
  if (bars.length === 0) return `<svg viewBox="0 0 ${W} 60" width="100%"></svg>`;

  const totals = bars.map(b => SEGMENTS.reduce((a, s) => a + (b[s.key] as number), 0));
  const maxTotal = Math.max(...totals, 1e-9);
  const plotW = W - LABEL_W - VALUE_W;
  const legendH = 20;
  const H = bars.length * (BAR_H + ROW_GAP) + 40 + legendH;

  const barsHtml = bars.map((b, i) => {
    const y = i * (BAR_H + ROW_GAP) + 8;
    let x = LABEL_W;
    const segs = SEGMENTS.map(s => {
      const v = b[s.key] as number;
      const w = (v / maxTotal) * plotW;
      const rect = v > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(w, 0.5)}" height="${BAR_H}" fill="${s.color}" stroke="white" stroke-width="0.5" />` : '';
      x += w;
      return rect;
    }).join('');
    return `<g>
      <text x="${LABEL_W - 8}" y="${y + BAR_H / 2 + 4}" text-anchor="end" font-size="11" fill="${TEXT_2}" font-family="ui-monospace, monospace">${escapeXml(b.label)}</text>
      ${segs}
      <text x="${x + 8}" y="${y + BAR_H / 2 + 4}" text-anchor="start" font-size="11" fill="#14170F" font-family="ui-monospace, monospace">${totals[i] >= 100 ? totals[i].toFixed(0) : totals[i].toFixed(1)} W</text>
    </g>`;
  }).join('');

  const legendHtml = SEGMENTS.map((s, i) => `
    <g font-size="9" font-family="ui-monospace, monospace">
      <rect x="${LABEL_W + i * 105}" y="${H - legendH - 4}" width="8" height="8" fill="${s.color}" />
      <text x="${LABEL_W + i * 105 + 12}" y="${H - legendH + 3}" fill="${TEXT_2}">${escapeXml(s.label)}</text>
    </g>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    ${barsHtml}
    ${legendHtml}
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">per-device die losses &middot; shared scale across bars</text>
  </svg>`;
}

export interface PdfSeries {
  label: string;
  color: string;
  values: number[];
}

function pdfNiceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const step = span / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(min + step * i);
  return ticks;
}

/** Static current/temperature-vs-time chart, matching TimeSeriesChart.tsx's
 *  traces and axis ticks (no hover interactivity needed in a printed report,
 *  so the worst point is annotated permanently instead of on hover). */
export function renderTimeSeriesChartSvg(timeS: number[], currentA: number[], series: PdfSeries[], ambientC: number, maxTempC: number): string {
  const W = 700;
  const H = 320;
  const MARGIN = { left: 55, right: 55, top: 20, bottom: 52 };
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
  const timeTicks = pdfNiceTicks(0, tMax, 5);
  const currentTicks = pdfNiceTicks(0, iMax, 4);
  const tempTicks = pdfNiceTicks(tempMin, tempMax, 4);

  // Worst point across the whole profile — hottest temperature reached by any
  // node/series, at any time — annotated permanently since there's no hover here.
  let peakIdx = 0;
  let peakTempC = -Infinity;
  let peakLabel = series[0]?.label ?? '';
  series.forEach(s => {
    s.values.forEach((v, i) => {
      if (v > peakTempC) { peakTempC = v; peakIdx = i; peakLabel = s.label; }
    });
  });
  const hasPeak = series.length > 0 && isFinite(peakTempC);

  const seriesHtml = series.map(s => `<path d="${pathFor(xs, s.values.map(yTempScale))}" fill="none" stroke="${s.color}" stroke-width="2" />`).join('');
  const legendHtml = series.map((s, i) => `
    <g font-size="9" font-family="ui-monospace, monospace">
      <rect x="${MARGIN.left + i * 95}" y="${H - 10}" width="8" height="8" fill="${s.color}" />
      <text x="${MARGIN.left + i * 95 + 12}" y="${H - 3}" fill="${TEXT_2}">${escapeXml(s.label)}</text>
    </g>`).join('');

  const currentTickHtml = currentTicks.map(c => `
    <text x="${MARGIN.left - 8}" y="${yCurrentScale(c) + 3}" text-anchor="end" font-size="8.5" fill="${BLUE}" font-family="ui-monospace, monospace">${Math.round(c)}</text>
    <line x1="${MARGIN.left - 4}" x2="${MARGIN.left}" y1="${yCurrentScale(c)}" y2="${yCurrentScale(c)}" stroke="${BLUE}" stroke-width="1" />`).join('');
  const tempTickHtml = tempTicks.map(t => `
    <text x="${W - MARGIN.right + 8}" y="${yTempScale(t) + 3}" text-anchor="start" font-size="8.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">${t.toFixed(0)}</text>
    <line x1="${W - MARGIN.right}" x2="${W - MARGIN.right + 4}" y1="${yTempScale(t)}" y2="${yTempScale(t)}" stroke="${TEXT_2}" stroke-width="1" />`).join('');
  const timeTickHtml = timeTicks.map(t => `
    <text x="${xScale(t)}" y="${H - MARGIN.bottom + 15}" text-anchor="middle" font-size="8.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">${t.toFixed(0)}s</text>
    <line x1="${xScale(t)}" x2="${xScale(t)}" y1="${H - MARGIN.bottom}" y2="${H - MARGIN.bottom + 4}" stroke="${TEXT_FAINT}" stroke-width="1" />`).join('');

  const peakLabelW = 150;
  const peakX = hasPeak ? xs[peakIdx] : 0;
  const peakY = hasPeak ? yTempScale(peakTempC) : 0;
  const peakLabelX = hasPeak ? Math.min(Math.max(peakX - peakLabelW / 2, MARGIN.left), W - MARGIN.right - peakLabelW) : 0;
  const peakLabelY = hasPeak ? Math.max(peakY - 38, MARGIN.top + 2) : 0;
  const peakHtml = hasPeak ? `
    <line x1="${peakX}" x2="${peakX}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${WARN}" stroke-dasharray="4,2" stroke-width="1" opacity="0.6" />
    <circle cx="${peakX}" cy="${yCurrentScale(currentA[peakIdx])}" r="4" fill="none" stroke="${BLUE}" stroke-width="1.75" />
    <circle cx="${peakX}" cy="${peakY}" r="4" fill="none" stroke="${WARN}" stroke-width="1.75" />
    <rect x="${peakLabelX}" y="${peakLabelY}" width="${peakLabelW}" height="32" rx="4" fill="white" stroke="${WARN}" stroke-width="1" />
    <text x="${peakLabelX + 7}" y="${peakLabelY + 13}" font-size="9.5" font-weight="700" fill="${WARN}" font-family="ui-monospace, monospace">Peak ${peakTempC.toFixed(1)}&deg;C &middot; ${escapeXml(peakLabel.slice(0, 12))}</text>
    <text x="${peakLabelX + 7}" y="${peakLabelY + 26}" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">t=${timeS[peakIdx].toFixed(1)}s, I=${currentA[peakIdx].toFixed(1)}A</text>` : '';

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${yTempScale(ambientC)}" y2="${yTempScale(ambientC)}" stroke="${TEXT_FAINT}" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${W - MARGIN.right + 4}" y="${yTempScale(ambientC) + 3}" font-size="8.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">ambient</text>
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${yTempScale(maxTempC)}" y2="${yTempScale(maxTempC)}" stroke="#DC2626" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${W - MARGIN.right + 4}" y="${yTempScale(maxTempC) + 3}" font-size="8.5" fill="#DC2626" font-family="ui-monospace, monospace">limit</text>
    <path d="${pathFor(xs, currentYs)}" fill="none" stroke="${BLUE}" stroke-width="1.5" opacity="0.85" />
    ${seriesHtml}
    ${peakHtml}
    <line x1="${MARGIN.left}" x2="${MARGIN.left}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <line x1="${W - MARGIN.right}" x2="${W - MARGIN.right}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${H - MARGIN.bottom}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    ${currentTickHtml}
    ${tempTickHtml}
    ${timeTickHtml}
    <text x="12" y="${MARGIN.top - 6}" font-size="9" fill="${BLUE}" font-family="ui-monospace, monospace">A (current)</text>
    <text x="${W - MARGIN.right}" y="${MARGIN.top - 6}" text-anchor="end" font-size="9" fill="${TEXT_2}" font-family="ui-monospace, monospace">&deg;C (temp)</text>
    <text x="${(MARGIN.left + W - MARGIN.right) / 2}" y="${H - MARGIN.bottom + 27}" text-anchor="middle" font-size="9" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">time (s)</text>
    ${legendHtml}
  </svg>`;
}

import type { WireCategory } from './harnessWireTypes';
import type { SchematicLayout } from './harnessSchematicLayout';

export interface PdfBundleWire {
  id: number;
  x: number;
  y: number;
  d: number;
  category: WireCategory;
}

const CATEGORY_LABELS: Record<WireCategory, string> = {
  single: 'Single conductor',
  twistedPair: 'Twisted pair',
  shielded: 'Shielded single',
  twistedShieldedPair: 'Twisted shielded pair',
  canBus: 'CAN bus (120 Ω pair)',
};

/** Bundle cross-section (every wire drawn to scale + covering rings), matching BundleCrossSection.tsx. */
export function renderBundleCrossSectionSvg(
  wires: PdfBundleWire[],
  bundleDiameterMm: number,
  overbraidThicknessMm: number,
  finishedOuterDiameterMm: number | null,
  coveringLabel: string | undefined,
  accentColor: string
): string {
  const DRAW_SIZE = 420;
  const PAD = 56;
  const CATEGORY_COLORS: Record<WireCategory, string> = {
    single: accentColor,
    twistedPair: BLUE,
    shielded: WARN,
    twistedShieldedPair: `color-mix(in srgb, ${BLUE} 55%, ${WARN})`,
    canBus: `color-mix(in srgb, ${accentColor} 50%, ${BLUE})`,
  };

  const outerDiameterMm = finishedOuterDiameterMm ?? (bundleDiameterMm + 2 * overbraidThicknessMm);
  const avail = DRAW_SIZE - 2 * PAD;
  const scale = outerDiameterMm > 0 ? avail / outerDiameterMm : 1;
  const cx = DRAW_SIZE / 2;
  const cy = DRAW_SIZE / 2;
  const bundleRadiusPx = (bundleDiameterMm / 2) * scale;
  const overbraidRadiusPx = bundleRadiusPx + overbraidThicknessMm * scale;
  const outerRadiusPx = (outerDiameterMm / 2) * scale;
  const categoriesPresent = Array.from(new Set(wires.map((w) => w.category)));

  const outerRing = finishedOuterDiameterMm !== null
    ? `<circle cx="${cx}" cy="${cy}" r="${outerRadiusPx}" fill="color-mix(in srgb, ${TEXT_2} 12%, transparent)" stroke="${BORDER_STRONG}" stroke-width="1.5" stroke-dasharray="4,3" />`
    : '';
  const braidRing = overbraidThicknessMm > 0
    ? `<circle cx="${cx}" cy="${cy}" r="${overbraidRadiusPx}" fill="color-mix(in srgb, ${TEXT_2} 18%, white)" stroke="${TEXT_2}" stroke-width="1.2" />`
    : '';

  const wiresHtml = wires.map((w) => `<circle cx="${cx + w.x * scale}" cy="${cy + w.y * scale}" r="${Math.max((w.d / 2) * scale, 1)}" fill="${CATEGORY_COLORS[w.category]}" stroke="white" stroke-width="0.6" />`).join('');
  const legendHtml = categoriesPresent.map((cat, i) => `
    <g font-size="9" font-family="ui-monospace, monospace">
      <rect x="8" y="${8 + i * 14}" width="9" height="9" fill="${CATEGORY_COLORS[cat]}" />
      <text x="21" y="${16 + i * 14}" fill="${TEXT_2}">${escapeXml(CATEGORY_LABELS[cat])}</text>
    </g>`).join('');

  return `<svg viewBox="0 0 ${DRAW_SIZE} ${DRAW_SIZE}" width="100%">
    ${outerRing}
    ${braidRing}
    <circle cx="${cx}" cy="${cy}" r="${bundleRadiusPx}" fill="none" stroke="${TEXT_FAINT}" stroke-width="1" stroke-dasharray="2,3" />
    ${wiresHtml}
    <text x="${cx}" y="${cy - bundleRadiusPx - 8}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">bundle &empty;${bundleDiameterMm.toFixed(2)} mm</text>
    ${finishedOuterDiameterMm !== null ? `<text x="${cx}" y="${cy + outerRadiusPx + 16}" text-anchor="middle" font-size="10" fill="${TEXT_2}" font-family="ui-monospace, monospace">finished &empty;${finishedOuterDiameterMm.toFixed(2)} mm${coveringLabel ? ` (${escapeXml(coveringLabel)})` : ''}</text>` : ''}
    ${legendHtml}
  </svg>`;
}

const HOP_R = 5;

/** Builds an SVG path string for an orthogonal polyline, matching
 *  pathWithHops in HarnessSchematicDiagram.tsx — inserts a small semicircular
 *  "hop" bump on any horizontal segment where a different net's wire crosses
 *  it without connecting. */
function pdfPathWithHops(points: { x: number; y: number }[], hops: { x: number; y: number }[]): string {
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

// Cycled by wire-spec index (see harnessSchematicLayout's legend), matching
// HarnessSchematicDiagram.tsx's WIRE_PALETTE — accentColor stands in for the
// live theme's var(--accent) since the PDF is always forced light-theme.
function wireSpecPalette(accentColor: string): string[] {
  return [
    accentColor,
    BLUE,
    WARN,
    POS,
    NEG,
    `color-mix(in srgb, ${BLUE} 55%, ${WARN})`,
    `color-mix(in srgb, ${accentColor} 50%, ${BLUE})`,
    `color-mix(in srgb, ${WARN} 50%, ${NEG})`,
    `color-mix(in srgb, ${POS} 50%, ${BLUE})`,
    `color-mix(in srgb, ${accentColor} 50%, ${NEG})`,
    `color-mix(in srgb, ${POS} 50%, ${WARN})`,
    `color-mix(in srgb, ${NEG} 50%, ${BLUE})`,
  ];
}

/** Point-to-point wiring schematic, matching HarnessSchematicDiagram.tsx. */
export function renderHarnessSchematicSvg(layout: SchematicLayout, accentColor: string): string {
  const connectedPins = new Set<string>();
  for (const w of layout.wires) {
    for (const part of w.netId.split('|')) connectedPins.add(part);
  }
  for (const g of layout.grounds) connectedPins.add(`${g.connectorId}:${g.pin}`);
  // A drain pin's own ground stub is suppressed in favour of the shield tap,
  // but it's still a connected pin.
  for (const s of layout.shields) connectedPins.add(`${s.drainConnectorId}:${s.drainPin}`);

  const palette = wireSpecPalette(accentColor);
  const colorForSpec = (i: number) => palette[i % palette.length];

  const wiresHtml = layout.wires.map((w) => `<path d="${pdfPathWithHops(w.points, w.hops)}" fill="none" stroke="${colorForSpec(w.specIndex)}" stroke-width="1.5" />`).join('');

  const twistHtml = layout.twistBundles.map((b) => b.crossings.map((c) =>
    `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="${TEXT_2}" stroke-width="1" />`
  ).join('')).join('');

  const shieldsHtml = layout.shields.map((s) => {
    const tapD = `M ${s.tap[0].x} ${s.tap[0].y} ` + s.tap.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
    return `<g fill="none" stroke="${NEG}" stroke-width="1.2">
      <ellipse cx="${s.end1.cx}" cy="${s.end1.cy}" rx="${s.end1.rx}" ry="${s.end1.ry}" />
      <ellipse cx="${s.end2.cx}" cy="${s.end2.cy}" rx="${s.end2.rx}" ry="${s.end2.ry}" />
      <path d="${tapD}" />
    </g>`;
  }).join('');

  const groundsHtml = layout.grounds.map((g) => `<g>
    <path d="${pdfPathWithHops([{ x: g.stubX1, y: g.stubY1 }, { x: g.x, y: g.y }], g.hops)}" fill="none" stroke="${colorForSpec(g.specIndex)}" stroke-width="1.5" />
    <line x1="${g.x}" y1="${g.y - 8}" x2="${g.x}" y2="${g.y + 8}" stroke="#14170F" stroke-width="1.5" />
    <line x1="${g.x + 4}" y1="${g.y - 5}" x2="${g.x + 4}" y2="${g.y + 5}" stroke="#14170F" stroke-width="1.3" />
    <line x1="${g.x + 8}" y1="${g.y - 2}" x2="${g.x + 8}" y2="${g.y + 2}" stroke="#14170F" stroke-width="1" />
    <text x="${g.x + 12}" y="${g.y + 3}" font-size="8" fill="${TEXT_2}" font-family="ui-monospace, monospace">GND</text>
  </g>`).join('');

  const boxesHtml = layout.connectors.map((box) => {
    const pinsHtml = box.pins.map((p) => {
      const connected = connectedPins.has(`${box.id}:${p.pin}`);
      const dotColor = connected ? accentColor : TEXT_FAINT;
      const textColor = connected ? '#14170F' : TEXT_FAINT;
      const dotR = p.isSpliceAnchor ? 4.5 : 2.5;
      const haloAttrs = p.isSpliceAnchor ? ` stroke="white" stroke-width="1"` : '';
      return `<g>
        <line x1="${box.x}" x2="${box.x + box.width}" y1="${p.y}" y2="${p.y}" stroke="${BORDER_STRONG}" stroke-width="0.5" />
        <circle cx="${box.x}" cy="${p.y}" r="${dotR}" fill="${dotColor}"${haloAttrs} />
        <circle cx="${box.x + box.width}" cy="${p.y}" r="${dotR}" fill="${dotColor}"${haloAttrs} />
        <text x="${box.x + 6}" y="${p.y + 3}" font-size="7.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">${p.pin}</text>
        <text x="${box.x + box.width / 2}" y="${p.y + 3}" text-anchor="middle" font-size="8" fill="${textColor}" font-family="ui-monospace, monospace">${escapeXml(p.signalName)}</text>
        <text x="${box.x + box.width - 6}" y="${p.y + 3}" text-anchor="end" font-size="7.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">${p.pin}</text>
      </g>`;
    }).join('');

    return `<g>
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="#FAFBFA" stroke="${BORDER_STRONG}" stroke-width="1.5" />
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="30" rx="4" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${BORDER_STRONG}" stroke-width="1" />
      <text x="${box.x + box.width / 2}" y="${box.y + 14}" text-anchor="middle" font-size="11" font-weight="700" fill="#14170F" font-family="ui-monospace, monospace">${escapeXml(box.name)}</text>
      <text x="${box.x + box.width / 2}" y="${box.y + 25}" text-anchor="middle" font-size="8" fill="${TEXT_2}" font-family="ui-monospace, monospace">${escapeXml(box.subtitle)}</text>
      ${pinsHtml}
    </g>`;
  }).join('');

  const LEGEND_WIDTH = 190;
  const legendHeading = layout.legend.length > 0
    ? `<text x="${layout.width + 14}" y="10" font-size="8" font-weight="700" fill="${TEXT_2}" font-family="ui-monospace, monospace">WIRE SPEC KEY</text>`
    : '';
  const legendHtml = layout.legend.map((entry, i) => `<g>
      <rect x="${layout.width + 14}" y="${20 + i * 16}" width="10" height="10" fill="${colorForSpec(i)}" />
      <text x="${layout.width + 30}" y="${29 + i * 16}" font-size="8.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">${escapeXml(entry.label)}</text>
    </g>`).join('');
  const totalWidth = layout.width + (layout.legend.length > 0 ? LEGEND_WIDTH : 0);
  const totalHeight = Math.max(layout.height, 20 + layout.legend.length * 16 + 10);

  return `<svg viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%">
    ${wiresHtml}
    ${twistHtml}
    ${shieldsHtml}
    ${groundsHtml}
    ${boxesHtml}
    ${legendHeading}
    ${legendHtml}
  </svg>`;
}

/** Round-conductor skin-depth cross-section, matching SkinDepthCrossSection.tsx.
 *  Only the skin-depth:radius ratio is drawn to scale (see that component for why). */
export function renderSkinDepthCrossSectionSvg(radiusMm: number, skinDepthMmValue: number, isIllustrative: boolean, accentColor: string): string {
  const W = 400;
  const H = 320;
  const CX = W / 2;
  const CY = 145;
  const OUTER_PX = 110;

  const ratio = isFinite(skinDepthMmValue) ? Math.min(Math.max(skinDepthMmValue / Math.max(radiusMm, 1e-9), 0), 1) : 1;
  const innerPx = OUTER_PX * (1 - ratio);
  const fillsWholeConductor = ratio >= 1;
  const radiusLabel = `${radiusMm.toFixed(radiusMm < 10 ? 2 : 1)} mm${isIllustrative ? ' (illustrative)' : ''}`;
  const skinLabel = isFinite(skinDepthMmValue) ? skinDepthMmValue.toFixed(skinDepthMmValue < 10 ? 3 : 1) : '&#8734;';

  const coreHatch = fillsWholeConductor ? '' : `
    <defs>
      <pattern id="pdfSkinCoreHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="${TEXT_2}" opacity="0.08" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="${TEXT_2}" stroke-width="1.2" opacity="0.35" />
      </pattern>
      <marker id="pdfSkinArrowStart" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M5,1 L1,3 L5,5" fill="none" stroke="${accentColor}" stroke-width="1" />
      </marker>
      <marker id="pdfSkinArrowEnd" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M1,1 L5,3 L1,5" fill="none" stroke="${accentColor}" stroke-width="1" />
      </marker>
    </defs>
    <circle cx="${CX}" cy="${CY}" r="${innerPx}" fill="url(#pdfSkinCoreHatch)" stroke="${TEXT_2}" stroke-width="1" stroke-dasharray="3 2" />
    <line x1="${CX + innerPx}" y1="${CY + 4}" x2="${CX + innerPx}" y2="${CY + 28}" stroke="${accentColor}" stroke-width="1" />
    <line x1="${CX + OUTER_PX}" y1="${CY + 4}" x2="${CX + OUTER_PX}" y2="${CY + 28}" stroke="${accentColor}" stroke-width="1" />
    <line x1="${CX + innerPx}" y1="${CY + 22}" x2="${CX + OUTER_PX}" y2="${CY + 22}" stroke="${accentColor}" stroke-width="1" marker-start="url(#pdfSkinArrowStart)" marker-end="url(#pdfSkinArrowEnd)" />
    <text x="${(CX + innerPx + CX + OUTER_PX) / 2}" y="${CY + 40}" text-anchor="middle" font-size="9.5" fill="${accentColor}" font-family="ui-monospace, monospace">&#948; = ${skinLabel} mm</text>`;

  const legend = `
    <rect x="30" y="260" width="12" height="12" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${accentColor}" stroke-width="1" />
    <text x="48" y="270" font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">Current-carrying region (surface to one skin depth in)</text>
    ${fillsWholeConductor ? '' : `
    <rect x="30" y="280" width="12" height="12" fill="url(#pdfSkinCoreHatch)" stroke="${TEXT_2}" stroke-width="1" stroke-dasharray="3 2" />
    <text x="48" y="290" font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">Low-current core</text>`}`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <circle cx="${CX}" cy="${CY}" r="${OUTER_PX}" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${accentColor}" stroke-width="1.5" />
    ${coreHatch}
    <line x1="${CX}" y1="${CY}" x2="${CX + OUTER_PX}" y2="${CY}" stroke="${TEXT_2}" stroke-width="1" stroke-dasharray="2 2" />
    <text x="${CX + OUTER_PX / 2}" y="${CY - 6}" text-anchor="middle" font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">r = ${radiusLabel}</text>
    ${fillsWholeConductor ? `<text x="${CX}" y="${CY + 5}" text-anchor="middle" font-size="9.5" fill="${accentColor}" font-family="ui-monospace, monospace">&#948; &#8805; r &mdash; current fills the conductor</text>` : ''}
    ${legend}
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">round conductor, cross-section &middot; only the &#948;:r ratio is to scale</text>
  </svg>`;
}

// ── Beam bending: schematic + shear/moment/deflection charts, matching
// BeamDiagram.tsx / BeamResponseChart.tsx's layout logic with literal colors. ──

export interface PdfBeamSupport {
  x: number;
  kind: 'pin' | 'roller' | 'fixed';
}

export interface PdfBeamLoad {
  kind: 'point-force' | 'point-moment' | 'distributed';
  position: number;
  endPosition: number;
  magnitude: number;
  endMagnitude: number;
}

export function renderBeamSchematicSvg(length: number, supports: PdfBeamSupport[], loads: PdfBeamLoad[], accentColor: string): string {
  const W = 760;
  const H = 300;
  const MARGIN = 56;
  const BEAM_THICKNESS = 10;
  const LOAD_ARROW_H = 44;
  const SUPPORT_SIZE = 20;
  if (length <= 0) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${TEXT_FAINT}" font-size="13">No beam</text></svg>`;
  }

  const scale = (W - 2 * MARGIN) / length;
  const beamY = 128;
  const toPx = (x: number) => MARGIN + x * scale;

  const pointLoads = loads.filter(l => l.kind === 'point-force');
  const momentLoads = loads.filter(l => l.kind === 'point-moment');
  const distLoads = loads.filter(l => l.kind === 'distributed');
  const maxPointMag = Math.max(1, ...pointLoads.map(l => Math.abs(l.magnitude)));
  const maxDistMag = Math.max(1, ...distLoads.flatMap(l => [Math.abs(l.magnitude), Math.abs(l.endMagnitude)]));

  const supportsHtml = supports.map(s => {
    const x = toPx(s.x);
    if (s.kind === 'fixed') {
      const isLeft = s.x <= length / 2;
      const hatchX = isLeft ? x - 14 : x;
      return `
        <line x1="${x}" y1="${beamY - 22}" x2="${x}" y2="${beamY + 22}" stroke="${BORDER_STRONG}" stroke-width="2.5" />
        <rect x="${hatchX}" y="${beamY - 22}" width="14" height="44" fill="url(#pdfBeamFixedHatch)" stroke="${BORDER_STRONG}" stroke-width="1" />`;
    }
    const triY = beamY + BEAM_THICKNESS / 2;
    const rollerHtml = s.kind === 'roller' ? `
        <circle cx="${x - 6}" cy="${triY + SUPPORT_SIZE + 5}" r="3.5" fill="white" stroke="${TEXT_2}" stroke-width="1.2" />
        <circle cx="${x + 6}" cy="${triY + SUPPORT_SIZE + 5}" r="3.5" fill="white" stroke="${TEXT_2}" stroke-width="1.2" />
        <line x1="${x - 12}" y1="${triY + SUPPORT_SIZE + 9}" x2="${x + 12}" y2="${triY + SUPPORT_SIZE + 9}" stroke="${TEXT_2}" stroke-width="1.2" />` : '';
    return `
        <path d="M${x},${triY} L${x - SUPPORT_SIZE / 2},${triY + SUPPORT_SIZE} L${x + SUPPORT_SIZE / 2},${triY + SUPPORT_SIZE} Z" fill="white" stroke="${TEXT_2}" stroke-width="1.5" />
        ${rollerHtml}`;
  }).join('');

  const pointLoadsHtml = pointLoads.map(l => {
    const x = toPx(l.position);
    const h = LOAD_ARROW_H * (0.5 + 0.5 * (Math.abs(l.magnitude) / maxPointMag));
    const yTop = beamY - BEAM_THICKNESS / 2 - h;
    return `
        <line x1="${x}" y1="${yTop}" x2="${x}" y2="${beamY - BEAM_THICKNESS / 2 - 3}" stroke="${NEG}" stroke-width="2" marker-end="url(#pdfBeamArrowDown)" />
        <text x="${x}" y="${yTop - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${NEG}" font-family="ui-monospace, monospace">${fmtNum(l.magnitude)} N</text>`;
  }).join('');

  const momentLoadsHtml = momentLoads.map(l => {
    const x = toPx(l.position);
    const r = 16;
    const sweep = l.magnitude >= 0 ? 1 : 0;
    return `
        <path d="M${x - r},${beamY - BEAM_THICKNESS / 2 - 20} A${r},${r} 0 1,${sweep} ${x + r},${beamY - BEAM_THICKNESS / 2 - 20}" fill="none" stroke="${WARN}" stroke-width="2" marker-end="url(#pdfBeamArrowMoment)" />
        <text x="${x}" y="${beamY - BEAM_THICKNESS / 2 - 42}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${WARN}" font-family="ui-monospace, monospace">${fmtNum(l.magnitude)} N&middot;mm</text>`;
  }).join('');

  const distLoadsHtml = distLoads.map(l => {
    const xa = toPx(l.position);
    const xb = toPx(l.endPosition);
    const ha = LOAD_ARROW_H * 0.35 + LOAD_ARROW_H * 0.55 * (Math.abs(l.magnitude) / maxDistMag);
    const hb = LOAD_ARROW_H * 0.35 + LOAD_ARROW_H * 0.55 * (Math.abs(l.endMagnitude) / maxDistMag);
    const arrowCount = Math.max(3, Math.min(9, Math.round((xb - xa) / 26)));
    const topY = (h: number) => beamY - BEAM_THICKNESS / 2 - h;
    const arrows = Array.from({ length: arrowCount }, (_, k) => {
      const t = arrowCount === 1 ? 0 : k / (arrowCount - 1);
      const x = xa + t * (xb - xa);
      const h = ha + t * (hb - ha);
      return `<line x1="${x}" y1="${topY(h)}" x2="${x}" y2="${beamY - BEAM_THICKNESS / 2 - 3}" stroke="${NEG}" stroke-width="1.5" marker-end="url(#pdfBeamArrowDown)" opacity="0.85" />`;
    }).join('');
    return `
        <path d="M${xa},${topY(ha)} L${xb},${topY(hb)}" stroke="${NEG}" stroke-width="1.25" fill="none" />
        ${arrows}
        <text x="${xa}" y="${topY(ha) - 6}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${NEG}" font-family="ui-monospace, monospace">${fmtNum(l.magnitude)}</text>
        <text x="${xb}" y="${topY(hb) - 6}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${NEG}" font-family="ui-monospace, monospace">${fmtNum(l.endMagnitude)}</text>
        <text x="${(xa + xb) / 2}" y="${topY(Math.max(ha, hb)) - 20}" text-anchor="middle" font-size="9" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">N/mm</text>`;
  }).join('');

  const dimY = beamY + SUPPORT_SIZE + 34;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    <defs>
      <marker id="pdfBeamArrowDown" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto"><path d="M0,0 L8,0 L4,8 Z" fill="${NEG}" /></marker>
      <marker id="pdfBeamArrowMoment" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="${WARN}" /></marker>
      <pattern id="pdfBeamFixedHatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#FAFBFA" /><line x1="0" y1="0" x2="0" y2="8" stroke="${BORDER_STRONG}" stroke-width="2" />
      </pattern>
    </defs>
    <rect x="${toPx(0)}" y="${beamY - BEAM_THICKNESS / 2}" width="${length * scale}" height="${BEAM_THICKNESS}" rx="2" fill="color-mix(in srgb, ${accentColor} 12%, white)" stroke="${accentColor}" stroke-width="1.5" />
    ${supportsHtml}
    ${pointLoadsHtml}
    ${momentLoadsHtml}
    ${distLoadsHtml}
    <g font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">
      <line x1="${toPx(0)}" y1="${dimY - 6}" x2="${toPx(0)}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <line x1="${toPx(length)}" y1="${dimY - 6}" x2="${toPx(length)}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <line x1="${toPx(0)}" y1="${dimY}" x2="${toPx(length)}" y2="${dimY}" stroke="${BORDER_STRONG}" stroke-width="1" />
      <text x="${(toPx(0) + toPx(length)) / 2}" y="${dimY + 15}" text-anchor="middle">L = ${length} mm</text>
    </g>
    <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">loads shown positive-downward &middot; not to scale</text>
  </svg>`;
}

export function renderBeamResponseChartSvg(xs: number[], values: number[], color: string, unit: string, valueLabel: string, decimals = 1): string {
  const W = 900;
  const H = 260;
  const MARGIN = { left: 66, right: 20, top: 16, bottom: 34 };
  const PLOT_W = W - MARGIN.left - MARGIN.right;
  const PLOT_H = H - MARGIN.top - MARGIN.bottom;
  if (xs.length === 0) return `<svg viewBox="0 0 ${W} ${H}" width="100%"></svg>`;

  const xMax = Math.max(...xs, 0.001);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const pad = Math.max((rawMax - rawMin) * 0.12, Math.abs(rawMax || rawMin || 1) * 0.05, 1e-9);
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const xScale = (x: number) => MARGIN.left + (x / xMax) * PLOT_W;
  const yScale = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;
  const zeroY = yScale(0);

  const pxXs = xs.map(xScale);
  const pxYs = values.map(yScale);
  const linePath = pxXs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${pxYs[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pxXs[pxXs.length - 1].toFixed(1)},${zeroY.toFixed(1)} L${pxXs[0].toFixed(1)},${zeroY.toFixed(1)} Z`;

  const yTicksCount = 4;
  const yTicks = Array.from({ length: yTicksCount + 1 }, (_, i) => yMin + ((yMax - yMin) / yTicksCount) * i);
  const xTicksCount = 5;
  const xTicks = Array.from({ length: xTicksCount + 1 }, (_, i) => (xMax / xTicksCount) * i);

  const gridHtml = yTicks.map(t => `<line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${yScale(t)}" y2="${yScale(t)}" stroke="#EBEDEA" stroke-width="1" />`).join('');
  const yLabelsHtml = yTicks.map(t => `<text x="${MARGIN.left - 8}" y="${yScale(t) + 3}" text-anchor="end" font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">${t.toFixed(decimals)}</text>`).join('');
  const xLabelsHtml = xTicks.map(t => `<text x="${xScale(t)}" y="${H - MARGIN.bottom + 16}" text-anchor="middle" font-size="9.5" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">${t.toFixed(0)}</text>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%">
    ${gridHtml}
    <path d="${areaPath}" fill="${color}" opacity="0.12" />
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${zeroY}" y2="${zeroY}" stroke="${TEXT_FAINT}" stroke-width="1" stroke-dasharray="3,3" />
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.9" />
    <line x1="${MARGIN.left}" x2="${MARGIN.left}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    <line x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${H - MARGIN.bottom}" y2="${H - MARGIN.bottom}" stroke="${BORDER_STRONG}" stroke-width="1" />
    ${yLabelsHtml}
    <text x="14" y="${MARGIN.top - 4}" font-size="9.5" fill="${TEXT_2}" font-family="ui-monospace, monospace">${unit}</text>
    ${xLabelsHtml}
    <text x="${(MARGIN.left + W - MARGIN.right) / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${TEXT_FAINT}" font-family="ui-monospace, monospace">x (mm)</text>
    <text x="${W - MARGIN.right - 4}" y="${MARGIN.top + 12}" text-anchor="end" font-size="10" fill="${color}" font-family="ui-monospace, monospace">${valueLabel}</text>
  </svg>`;
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
