import { deriveAccentOnLight } from './theme';

export interface ReportRow {
  label: string;
  value: string;
}

export interface ReportSection {
  heading: string;
  rows: ReportRow[];
}

export interface CalcStepData {
  title: string;
  formula: string;
  substitution?: string;
  result: string;
}

export interface ReportDiagram {
  title: string;
  svgMarkup: string; // a complete, self-contained <svg>...</svg> string with literal colors (no CSS vars)
}

export interface ReportGridTable {
  title: string;
  rowLabels: string[];
  colLabels: string[];
  cellValues: string[][]; // [rowIdx][colIdx], already formatted for display (e.g. "5.97 mm")
  highlightRow?: number; // -1 or omitted = no highlight
  highlightCol?: number;
}

export interface ReportSpec {
  tabName: string; // used in the filename, e.g. 'Busbar_Calculator'
  pageTitle: string;
  accentHex: string;
  passStatus?: { pass: boolean; label: string } | null;
  inputSections: ReportSection[];
  outputSections: ReportSection[];
  calculationSteps: CalcStepData[];
  disclaimer: string;
  // Graphical representations (cross-sections, load-profile chart, etc.) —
  // rendered on their own page between the summary and the calculation steps.
  diagrams?: ReportDiagram[];
  // Row x column reference tables (e.g. Material Group x Pollution Degree) —
  // rendered on their own page, after diagrams and before calculation steps.
  gridTables?: ReportGridTable[];
  // Premium report branding — when present, shown in place of the Volteq mark.
  companyName?: string;
  companyLogoUrl?: string;
}

export function buildPdfFilename(tabName: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}${m}${d}_${hh}_${mm}_Volteq_${tabName}.pdf`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSection(section: ReportSection): string {
  const rowsHtml = section.rows.map(r => `
    <tr>
      <td style="padding:2px 8px 2px 0; color:#565C53; white-space:nowrap;">${escapeHtml(r.label)}</td>
      <td style="padding:2px 0; font-weight:600; text-align:right;">${escapeHtml(r.value)}</td>
    </tr>`).join('');
  return `
    <div style="break-inside: avoid; margin-bottom:8px;">
      <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#14170F; margin-bottom:3px;">${escapeHtml(section.heading)}</div>
      <table style="width:100%; border-collapse:collapse; font-size:10.5px;">${rowsHtml}</table>
    </div>`;
}

function renderTwoColumnSections(sections: ReportSection[]): string {
  return `<div style="display:flex; gap:24px;">
    <div style="flex:1;">${sections.filter((_, i) => i % 2 === 0).map(renderSection).join('')}</div>
    <div style="flex:1;">${sections.filter((_, i) => i % 2 === 1).map(renderSection).join('')}</div>
  </div>`;
}

function renderGridTable(grid: ReportGridTable, accent: string): string {
  const headerCells = grid.colLabels.map(c => `
    <th style="padding:4px 8px; text-align:center; font-size:9px; text-transform:uppercase; letter-spacing:0.03em; color:#797D74; border-bottom:1px solid #EBEDEA;">${escapeHtml(c)}</th>`).join('');
  const bodyRows = grid.rowLabels.map((rowLabel, ri) => {
    const isRowHighlighted = ri === grid.highlightRow;
    const cells = grid.colLabels.map((_, ci) => {
      const isHighlighted = isRowHighlighted && ci === grid.highlightCol;
      return `
      <td style="padding:4px 8px; text-align:center; font-family:'SFMono-Regular',Consolas,monospace; font-size:10px; border-bottom:1px solid #F5F6F4; ${isHighlighted ? `color:${accent}; font-weight:700;` : ''}">${escapeHtml(grid.cellValues[ri]?.[ci] ?? '')}</td>`;
    }).join('');
    return `
    <tr>
      <td style="padding:4px 8px; font-size:10px; color:${isRowHighlighted ? accent : '#565C53'}; font-weight:${isRowHighlighted ? 700 : 400}; border-bottom:1px solid #F5F6F4;">${escapeHtml(rowLabel)}</td>${cells}
    </tr>`;
  }).join('');
  return `
    <div style="break-inside: avoid; margin-bottom:16px;">
      <div style="font-size:10.5px; font-weight:700; color:#14170F; margin-bottom:6px;">${escapeHtml(grid.title)}</div>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th></th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

function buildPrintableDom(spec: ReportSpec): HTMLDivElement {
  const accent = deriveAccentOnLight(spec.accentHex);
  const now = new Date();
  const timestamp = now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const passBadge = spec.passStatus
    ? `<div style="display:inline-block; margin-top:4px; padding:3px 10px; border-radius:4px; font-size:10.5px; font-weight:700;
        background:${spec.passStatus.pass ? '#E6F7EE' : '#FDECEC'}; color:${spec.passStatus.pass ? '#15803D' : '#B91C1C'};">
        ${spec.passStatus.pass ? '✓' : '✗'} ${escapeHtml(spec.passStatus.label)}
      </div>`
    : '';

  const gridTablesHtml = (spec.gridTables ?? []).map(g => renderGridTable(g, accent)).join('');

  const diagramsHtml = (spec.diagrams ?? []).map(d => `
    <div style="break-inside: avoid; margin-bottom:18px;">
      <div style="font-size:10.5px; font-weight:700; color:#14170F; margin-bottom:6px;">${escapeHtml(d.title)}</div>
      <div style="border:1px solid #EBEDEA; border-radius:6px; padding:10px; background:#FAFBFA;">${d.svgMarkup}</div>
    </div>`).join('');

  const stepsHtml = spec.calculationSteps.map((s, i) => `
    <div style="break-inside: avoid; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #EBEDEA;">
      <div style="font-size:11px; font-weight:700; color:#14170F; margin-bottom:2px;">${i + 1}. ${escapeHtml(s.title)}</div>
      <div style="font-family:'SFMono-Regular',Consolas,monospace; font-size:10px; color:${accent}; background:#F5F6F4; border-radius:4px; padding:4px 6px; margin:3px 0;">${escapeHtml(s.formula)}</div>
      ${s.substitution ? `<div style="font-family:'SFMono-Regular',Consolas,monospace; font-size:9.5px; color:#565C53;">${escapeHtml(s.substitution)}</div>` : ''}
      <div style="font-size:10px; margin-top:2px;">${escapeHtml(s.result)}</div>
    </div>`).join('');

  const root = document.createElement('div');
  // No custom position/z-index here: html2pdf.js clones this element as-is
  // into its OWN off-screen overlay (position:fixed; left:-100000px) before
  // rendering, so any position/z-index we set ourselves is preserved onto
  // the clone and fights with html2pdf's own wrapper, which was silently
  // producing a blank capture. Keep this element plain/normal-flow; it's
  // never actually shown, since it's cloned rather than measured in place.
  root.style.cssText = 'width:750px; background:#ffffff; color:#14170F; font-family:Arial,Helvetica,sans-serif;';
  root.innerHTML = `
    <div style="padding:28px 32px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid ${accent}; padding-bottom:10px; margin-bottom:14px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${spec.companyLogoUrl ? `<img src="${spec.companyLogoUrl}" style="height:20px; max-width:120px; object-fit:contain;" />` : ''}
            <div style="font-size:12px; font-weight:700; letter-spacing:0.05em; color:${accent};">${escapeHtml(spec.companyName || 'VOLTEQ')}</div>
          </div>
          <div style="font-size:16px; font-weight:700; margin-top:2px;">${escapeHtml(spec.pageTitle)}</div>
        </div>
        <div style="font-size:9.5px; color:#797D74; text-align:right;">
          Generated ${escapeHtml(timestamp)}
          ${spec.companyName ? `<div style="margin-top:2px;">via Volteq</div>` : ''}
        </div>
      </div>
      ${passBadge}
      <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 6px;">Inputs</div>
      ${renderTwoColumnSections(spec.inputSections)}
      <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin:14px 0 6px;">Results</div>
      ${renderTwoColumnSections(spec.outputSections)}
      <div style="margin-top:20px; padding-top:8px; border-top:1px solid #EBEDEA; font-size:8px; color:#9A9D95; line-height:1.4;">
        ${escapeHtml(spec.disclaimer)}
      </div>
    </div>
    ${diagramsHtml ? `<div style="break-before: page; padding:28px 32px;">
      <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:${accent};">Diagrams</div>
      ${diagramsHtml}
    </div>` : ''}
    ${gridTablesHtml ? `<div style="break-before: page; padding:28px 32px;">
      <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:${accent};">Reference tables</div>
      ${gridTablesHtml}
    </div>` : ''}
    <div style="break-before: page; padding:28px 32px;">
      <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:${accent};">Calculation steps</div>
      ${stepsHtml}
    </div>`;
  return root;
}

export async function exportReportToPdf(spec: ReportSpec): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  // Deliberately not appended to the document: html2pdf.js's own toContainer()
  // step clones this element into ITS OWN off-screen overlay and measures the
  // clone's dimensions there, so this element never needs to be attached or
  // laid out itself — attaching it (or giving it any position/visibility
  // trick of our own) previously caused a blank render, since our styling
  // carried over onto the clone and fought with html2pdf's own wrapper.
  const container = buildPrintableDom(spec);
  const options = {
    margin: 0,
    filename: buildPdfFilename(spec.tabName),
    windowWidth: 750,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css'] },
  };
  // `windowWidth`/`pagebreak` are real html2pdf.js options not present in its bundled .d.ts
  const worker = html2pdf();
  await worker.set(options as unknown as Parameters<typeof worker.set>[0]).from(container).save();
}
