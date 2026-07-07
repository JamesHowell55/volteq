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
