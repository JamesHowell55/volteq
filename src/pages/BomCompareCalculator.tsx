import { useMemo, useState, type ClipboardEvent } from 'react';
import {
  DEFAULT_BOM_COLUMNS,
  compareBoms,
  emptyRow,
  makeColumnId,
  mapPastedGrid,
  parseDelimitedText,
  type BomColumn,
  type BomRow,
  type RowStatus,
} from '../lib/bomCompare';

const STATUS_META: Record<RowStatus, { label: string; bg: string; accent: string; text: string }> = {
  new: { label: 'NEW', bg: 'color-mix(in srgb, var(--pos) 14%, transparent)', accent: 'var(--pos)', text: 'var(--pos)' },
  deleted: { label: 'DELETED', bg: 'color-mix(in srgb, var(--neg) 14%, transparent)', accent: 'var(--neg)', text: 'var(--neg)' },
  revised: { label: 'REVISED', bg: 'color-mix(in srgb, var(--warn) 16%, transparent)', accent: 'var(--warn)', text: 'var(--warn)' },
  unchanged: { label: '—', bg: 'transparent', accent: 'transparent', text: 'var(--text-faint)' },
};

function stripKey(row: BomRow, id: string): BomRow {
  const rest = { ...row };
  delete rest[id];
  return rest;
}

interface BomEditableTableProps {
  title: string;
  rows: BomRow[];
  columns: BomColumn[];
  onCellChange: (rowIdx: number, colId: string, value: string) => void;
  onPasteGrid: (grid: string[][]) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIdx: number) => void;
  onClear: () => void;
}

function BomEditableTable({ title, rows, columns, onCellChange, onPasteGrid, onAddRow, onRemoveRow, onClear }: BomEditableTableProps) {
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    onPasteGrid(parseDelimitedText(text));
  };

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <p className="hint" style={{ marginTop: '-0.3rem', marginBottom: '0.75rem' }}>
        Click a cell, then paste (Ctrl/Cmd+V) straight from Excel — replaces the rows below.
      </p>
      <div onPaste={handlePaste} style={{ overflowX: 'auto' }}>
        <table className="bom-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c) => (
                  <td key={c.id}>
                    <input value={row[c.id] ?? ''} onChange={(e) => onCellChange(ri, c.id, e.target.value)} />
                  </td>
                ))}
                <td>
                  <button className="btn small danger" onClick={() => onRemoveRow(ri)} disabled={rows.length <= 1}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
        <button className="btn small" onClick={onAddRow}>+ Add row</button>
        <button className="btn small" onClick={onClear}>Clear</button>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

export default function BomCompareCalculator() {
  const [columns, setColumns] = useState<BomColumn[]>(DEFAULT_BOM_COLUMNS);
  const [keyColumnId, setKeyColumnId] = useState(DEFAULT_BOM_COLUMNS[0].id);
  const [revisionColumnId, setRevisionColumnId] = useState<string | null>(DEFAULT_BOM_COLUMNS[1].id);
  const [oldRows, setOldRows] = useState<BomRow[]>([emptyRow(DEFAULT_BOM_COLUMNS)]);
  const [newRows, setNewRows] = useState<BomRow[]>([emptyRow(DEFAULT_BOM_COLUMNS)]);
  const [hideUnchanged, setHideUnchanged] = useState(false);

  const addColumn = () => setColumns((cols) => [...cols, { id: makeColumnId(), label: `Column ${cols.length + 1}` }]);
  const renameColumn = (id: string, label: string) => setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, label } : c)));
  const removeColumn = (id: string) => {
    if (columns.length <= 1) return;
    const next = columns.filter((c) => c.id !== id);
    setColumns(next);
    if (keyColumnId === id) setKeyColumnId(next[0].id);
    if (revisionColumnId === id) setRevisionColumnId(null);
    setOldRows((rows) => rows.map((r) => stripKey(r, id)));
    setNewRows((rows) => rows.map((r) => stripKey(r, id)));
  };

  const updateCell = (which: 'old' | 'new', rowIdx: number, colId: string, value: string) => {
    const setter = which === 'old' ? setOldRows : setNewRows;
    setter((rows) => rows.map((r, i) => (i === rowIdx ? { ...r, [colId]: value } : r)));
  };
  const addRow = (which: 'old' | 'new') => (which === 'old' ? setOldRows : setNewRows)((rows) => [...rows, emptyRow(columns)]);
  const removeRow = (which: 'old' | 'new', rowIdx: number) =>
    (which === 'old' ? setOldRows : setNewRows)((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== rowIdx)));
  const clearRows = (which: 'old' | 'new') => (which === 'old' ? setOldRows : setNewRows)([emptyRow(columns)]);
  const pasteGrid = (which: 'old' | 'new', grid: string[][]) => {
    const mapped = mapPastedGrid(grid, columns);
    if (mapped.columns.length !== columns.length) setColumns(mapped.columns);
    (which === 'old' ? setOldRows : setNewRows)(mapped.rows.length > 0 ? mapped.rows : [emptyRow(mapped.columns)]);
  };

  const diffRows = useMemo(
    () => compareBoms(oldRows, newRows, keyColumnId, revisionColumnId),
    [oldRows, newRows, keyColumnId, revisionColumnId]
  );

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { new: 0, deleted: 0, revised: 0, unchanged: 0 };
    diffRows.forEach((d) => { c[d.status]++; });
    return c;
  }, [diffRows]);

  const visibleDiffRows = hideUnchanged ? diffRows.filter((d) => d.status !== 'unchanged') : diffRows;

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● BoM Compare</div>
        <h1>Bill of Materials Compare</h1>
        <p>
          Paste a previous and a new bill of materials straight from Excel and get a part-by-part comparison —
          added, removed, and up-revisioned parts are picked out automatically. Columns are configurable to match
          whatever your BoM export actually looks like.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.9rem' }}>
          {columns.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input value={c.label} onChange={(e) => renameColumn(c.id, e.target.value)} style={{ width: 150 }} />
              <button className="btn small danger" disabled={columns.length <= 1} onClick={() => removeColumn(c.id)}>Remove</button>
            </div>
          ))}
          <button className="btn small" onClick={addColumn}>+ Add column</button>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Match parts by</label>
            <select value={keyColumnId} onChange={(e) => setKeyColumnId(e.target.value)}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Flag revision changes using</label>
            <select value={revisionColumnId ?? ''} onChange={(e) => setRevisionColumnId(e.target.value || null)}>
              <option value="">None</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <BomEditableTable
          title="Previous BoM"
          rows={oldRows}
          columns={columns}
          onCellChange={(ri, colId, v) => updateCell('old', ri, colId, v)}
          onPasteGrid={(grid) => pasteGrid('old', grid)}
          onAddRow={() => addRow('old')}
          onRemoveRow={(ri) => removeRow('old', ri)}
          onClear={() => clearRows('old')}
        />
        <BomEditableTable
          title="New BoM"
          rows={newRows}
          columns={columns}
          onCellChange={(ri, colId, v) => updateCell('new', ri, colId, v)}
          onPasteGrid={(grid) => pasteGrid('new', grid)}
          onAddRow={() => addRow('new')}
          onRemoveRow={(ri) => removeRow('new', ri)}
          onClear={() => clearRows('new')}
        />
      </div>

      <div className="card">
        <div className="card-title">Comparison</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.1rem', marginBottom: '0.9rem' }}>
          {(['new', 'deleted', 'revised', 'unchanged'] as RowStatus[]).map((status) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_META[status].accent, display: 'inline-block' }} />
              <span style={{ color: 'var(--text-2)' }}>{STATUS_META[status].label === '—' ? 'Unchanged' : STATUS_META[status].label[0] + STATUS_META[status].label.slice(1).toLowerCase()}</span>
              <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{counts[status]}</span>
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-2)' }}>
            <input type="checkbox" checked={hideUnchanged} onChange={(e) => setHideUnchanged(e.target.checked)} style={{ width: 'auto' }} />
            Hide unchanged parts
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="bom-table">
            <thead>
              <tr>
                <th>Status</th>
                {columns.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleDiffRows.map((d, i) => {
                const meta = STATUS_META[d.status];
                return (
                  <tr key={i} style={{ background: meta.bg }}>
                    <td style={{ borderLeft: `3px solid ${meta.accent}`, color: meta.text, fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      {meta.label}
                    </td>
                    {columns.map((c) => (
                      <td key={c.id}>
                        {d.status === 'revised' && c.id === revisionColumnId ? (
                          <>
                            <span style={{ color: 'var(--text-faint)', textDecoration: 'line-through' }}>{d.previousRevision}</span>
                            {' → '}
                            <strong>{d.row[c.id]}</strong>
                          </>
                        ) : (
                          d.row[c.id] ?? ''
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleDiffRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} style={{ color: 'var(--text-faint)', textAlign: 'center', padding: '1.4rem' }}>
                    Paste both BoMs above to see a comparison.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
