import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SavedCalculation } from '../lib/useSavedCalculations';

interface Props {
  saves: SavedCalculation[];
  loading: boolean;
  loggedIn: boolean;
  onSave: (label: string) => void;
  onLoad: (inputs: Record<string, unknown>) => void;
  onUpdate: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}

// Note: `onSave` remains in Props (call sites still pass it) but is no longer
// used here — saving now happens via the "Save calculation" button in the page
// header (CalculatorActions). This panel is the load/manage list only, and
// hides itself entirely when there is nothing saved yet.
export default function SavedCalculations({ saves, loading, loggedIn, onLoad, onUpdate, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const loadedRef = useRef<string | null>(null);

  // Deep-link load: arriving with ?load=<id> (e.g. "Open" from the Account page)
  // restores that save's inputs onto this calculator as soon as it appears in the
  // fetched list, then strips the param so a refresh doesn't reapply it. Runs
  // before the early returns so it still fires while the list is empty/loading.
  const loadId = searchParams.get('load');
  useEffect(() => {
    if (!loadId || loadedRef.current === loadId) return;
    const match = saves.find((s) => s.id === loadId);
    if (match) {
      loadedRef.current = loadId;
      onLoad(match.inputs);
      const next = new URLSearchParams(searchParams);
      next.delete('load');
      setSearchParams(next, { replace: true });
    }
  }, [loadId, saves, onLoad, searchParams, setSearchParams]);

  if (!loggedIn) return null;
  if (!loading && saves.length === 0) return null;

  const handleRename = async (id: string) => {
    if (!editLabel.trim()) return;
    await onRename(id, editLabel.trim());
    setEditingId(null);
  };

  return (
    <div className="card">
      <div className="card-title">Saved calculations</div>

      {loading && <p className="hint">Loading saves...</p>}

      {saves.length > 0 && (
        <table className="data-table" style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th>Saved</th>
              <th style={{ width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {saves.map((s) => (
              <tr key={s.id}>
                <td style={{ textAlign: 'left' }}>
                  {editingId === s.id ? (
                    <span style={{ display: 'flex', gap: '0.3rem' }}>
                      <input
                        autoComplete="off"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(s.id)}
                        style={{ fontSize: '0.8rem', flex: 1 }}
                        autoFocus
                      />
                      <button className="btn small" onClick={() => handleRename(s.id)}>OK</button>
                      <button className="btn small" onClick={() => setEditingId(null)}>Cancel</button>
                    </span>
                  ) : (
                    s.label
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: '0.75rem' }}>
                  {new Date(s.updated_at).toLocaleDateString()}
                </td>
                <td>
                  <span style={{ display: 'flex', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                    <button className="btn small" onClick={() => onLoad(s.inputs)}>Load</button>
                    <button className="btn small" onClick={() => onUpdate(s.id)}>Overwrite</button>
                    <button className="btn small" onClick={() => { setEditingId(s.id); setEditLabel(s.label); }}>Rename</button>
                    <button className="btn small" onClick={() => onDelete(s.id)}>Delete</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
