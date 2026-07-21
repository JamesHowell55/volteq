export interface BomColumn {
  id: string;
  label: string;
}

export type BomRow = Record<string, string>;

export type RowStatus = 'new' | 'deleted' | 'revised' | 'unchanged';

export interface BomDiffRow {
  status: RowStatus;
  key: string;
  row: BomRow; // new/revised/unchanged show the new-BoM row; deleted shows the old-BoM row
  previousRevision?: string; // set only when status === 'revised'
}

export const DEFAULT_BOM_COLUMNS: BomColumn[] = [
  { id: 'partNumber', label: 'Part Number' },
  { id: 'revision', label: 'Revision' },
  { id: 'description', label: 'Description' },
];

let columnSeq = 1;
export function makeColumnId(): string {
  return `col_${Date.now().toString(36)}_${columnSeq++}`;
}

export function emptyRow(columns: BomColumn[]): BomRow {
  const row: BomRow = {};
  columns.forEach((c) => { row[c.id] = ''; });
  return row;
}

/** Splits pasted clipboard text into a 2D grid of trimmed cells. Detects
 *  tab- vs comma-delimited by whichever is more common in the first line
 *  (a plain Excel copy is tab-delimited; a saved CSV is comma-delimited). */
export function parseDelimitedText(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const tabCount = (lines[0].match(/\t/g) || []).length;
  const commaCount = (lines[0].match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

/** Maps a raw pasted grid onto the currently configured columns.
 *  - If the first pasted row's cells match ≥2 existing column labels
 *    (case-insensitive), it's treated as a header row and skipped.
 *  - If the pasted grid has more fields than configured columns, extra
 *    columns are appended (named from the header row if one was detected,
 *    otherwise "Column N") so pasted data is never silently dropped. */
export function mapPastedGrid(grid: string[][], columns: BomColumn[]): { rows: BomRow[]; columns: BomColumn[] } {
  if (grid.length === 0) return { rows: [], columns };

  const existingLabels = columns.map((c) => c.label.trim().toLowerCase());
  const firstRowLabels = grid[0].map((c) => c.trim().toLowerCase());
  const headerMatches = firstRowLabels.filter((l) => l.length > 0 && existingLabels.includes(l)).length;
  const looksLikeHeader = headerMatches >= Math.min(2, existingLabels.length);

  const dataGrid = looksLikeHeader ? grid.slice(1) : grid;
  const headerForNaming = looksLikeHeader ? grid[0] : null;

  const maxCols = dataGrid.reduce((max, r) => Math.max(max, r.length), 0);
  let nextColumns = columns;
  if (maxCols > columns.length) {
    const additions: BomColumn[] = [];
    for (let i = columns.length; i < maxCols; i++) {
      const label = headerForNaming?.[i]?.trim() || `Column ${i + 1}`;
      additions.push({ id: makeColumnId(), label });
    }
    nextColumns = [...columns, ...additions];
  }

  const rows: BomRow[] = dataGrid
    .filter((r) => r.some((cell) => cell.length > 0))
    .map((r) => {
      const row: BomRow = {};
      nextColumns.forEach((col, i) => { row[col.id] = r[i] ?? ''; });
      return row;
    });

  return { rows, columns: nextColumns };
}

/** Compares two BoMs keyed by a chosen "part number" column, optionally
 *  flagging revision changes via a chosen "revision" column. Ordering:
 *  new-BoM rows first (original order, tagged new/revised/unchanged), then
 *  old-BoM-only rows appended at the end (tagged deleted). Duplicate keys
 *  within a side keep only the last occurrence. */
export function compareBoms(
  oldRows: BomRow[],
  newRows: BomRow[],
  keyColumnId: string,
  revisionColumnId: string | null
): BomDiffRow[] {
  const keyOf = (row: BomRow) => (row[keyColumnId] ?? '').trim();

  const oldByKey = new Map<string, BomRow>();
  oldRows.forEach((row) => {
    const k = keyOf(row);
    if (k) oldByKey.set(k, row);
  });

  const result: BomDiffRow[] = [];
  const seenKeys = new Set<string>();

  newRows.forEach((row) => {
    const k = keyOf(row);
    if (!k || seenKeys.has(k)) return;
    seenKeys.add(k);
    const oldRow = oldByKey.get(k);
    if (!oldRow) {
      result.push({ status: 'new', key: k, row });
    } else if (revisionColumnId && (oldRow[revisionColumnId] ?? '').trim() !== (row[revisionColumnId] ?? '').trim()) {
      result.push({ status: 'revised', key: k, row, previousRevision: oldRow[revisionColumnId] });
    } else {
      result.push({ status: 'unchanged', key: k, row });
    }
  });

  const seenDeleted = new Set<string>();
  oldRows.forEach((row) => {
    const k = keyOf(row);
    if (!k || seenKeys.has(k) || seenDeleted.has(k)) return;
    seenDeleted.add(k);
    result.push({ status: 'deleted', key: k, row });
  });

  return result;
}
