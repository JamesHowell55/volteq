import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PremiumGate from '../components/PremiumGate';
import { useComponentProfiles, type ComponentProfile } from '../lib/useComponentProfiles';
import { BLANK_BATTERY_PROFILE, batteryProfileSummary, type BatteryProfileParams } from '../lib/batteryProfiles';

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

interface FormState { label: string; params: BatteryProfileParams; }

function BatteryProfileForm({ initial, onCancel, onSave, saving }: {
  initial: FormState;
  onCancel: () => void;
  onSave: (f: FormState) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<FormState>(initial);
  const p = f.params;
  const patch = (k: keyof BatteryProfileParams, v: unknown) => setF((s) => ({ ...s, params: { ...s.params, [k]: v } }));

  return (
    <div className="card">
      <div className="card-title">{initial.label ? `Edit "${initial.label}"` : 'New battery profile'}</div>
      <div className="field">
        <label>Profile name</label>
        <input autoComplete="off" value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="e.g. 400V traction pack" />
      </div>
      <div className="grid grid-2">
        <div className="field"><label>Max voltage (V)</label><input type="number" min={0} value={p.maxVoltageV} onChange={(e) => patch('maxVoltageV', Number(e.target.value))} /></div>
        <div className="field"><label>Min voltage (V)</label><input type="number" min={0} value={p.minVoltageV} onChange={(e) => patch('minVoltageV', Number(e.target.value))} /></div>
        <div className="field"><label>Pack resistance (mΩ)</label><input type="number" min={0} step={0.1} value={p.packResistanceMOhm ?? ''} onChange={(e) => patch('packResistanceMOhm', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Pack inductance (µH)</label><input type="number" min={0} step={0.1} value={p.inductanceUh ?? ''} onChange={(e) => patch('inductanceUh', numOrNull(e.target.value))} placeholder="optional" /></div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={p.notes} onChange={(e) => patch('notes', e.target.value)} rows={2} placeholder="optional" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <PremiumGate feature="Save battery profile">
          <button className="btn primary" disabled={saving || !f.label.trim()} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save profile'}</button>
        </PremiumGate>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function BatteryProfilesPage() {
  const { user } = useAuth();
  const { profiles, loading, save, update, remove } = useComponentProfiles<BatteryProfileParams>('battery');
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({ id: null, form: { label: '', params: { ...BLANK_BATTERY_PROFILE } } });
  const startEdit = (p: ComponentProfile<BatteryProfileParams>) => setEditing({ id: p.id, form: { label: p.label, params: p.params } });

  // Deep-link edit: ?edit=<id> (e.g. from Account's "Saved equipment" list)
  // opens that profile's edit form directly, same convention as
  // SavedCalculations' ?load=<id> and MotorProfilesPage's own ?edit=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const editedRef = useRef<string | null>(null);
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!editId || editedRef.current === editId) return;
    const match = profiles.find((p) => p.id === editId);
    if (match) {
      editedRef.current = editId;
      startEdit(match);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  }, [editId, profiles, searchParams, setSearchParams]);

  const handleSave = async (f: FormState) => {
    setSaving(true);
    const result = editing?.id ? await update(editing.id, f.label, f.params) : await save(f.label, f.params);
    setSaving(false);
    if (result.error) { alert(result.error); return; }
    setEditing(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● Battery Profiles</div>
        <h1>Battery Profiles</h1>
        <p>
          Define a battery pack once — max/min voltage, pack resistance, pack inductance — and pull it
          straight into DC-Link Capacitor Sizing and Cable/Wire Sizing instead of retyping the same
          numbers in each one.
        </p>
        <p style={{ marginTop: '0.5rem' }}><Link to="/account">← Back to Account</Link></p>
      </div>

      {!user ? (
        <div className="card">
          <p>Battery profiles are saved to your account. <Link to="/account">Sign in or create an account</Link> to build your battery library.</p>
        </div>
      ) : (
        <>
          {!editing && (
            <div className="card">
              <div className="card-title">Your batteries</div>
              {loading && <p className="hint">Loading…</p>}
              {!loading && profiles.length === 0 && <p className="hint">No battery profiles yet.</p>}
              {profiles.length > 0 && (
                <table className="data-table">
                  <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Summary</th><th style={{ width: 1 }}></th></tr></thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'left' }}>{p.label}</td>
                        <td style={{ textAlign: 'left', color: 'var(--text-2)' }}>{batteryProfileSummary(p.params)}</td>
                        <td><span style={{ display: 'flex', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                          <button className="btn small" onClick={() => startEdit(p)}>Edit</button>
                          <button className="btn small" onClick={() => { if (confirm(`Delete "${p.label}"?`)) remove(p.id); }}>Delete</button>
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button className="btn primary" style={{ marginTop: '0.75rem' }} onClick={startNew}>+ New battery profile</button>
            </div>
          )}

          {editing && (
            <BatteryProfileForm initial={editing.form} saving={saving} onCancel={() => setEditing(null)} onSave={handleSave} />
          )}
        </>
      )}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">How this works</div>
        <p className="note">
          A battery profile is the pack-level electrical characteristics — max/min voltage across the
          state-of-charge window, pack resistance, and pack inductance — not the cell-level build-up
          (for sizing a pack from cells, use the Battery Pack Series/Parallel calculator instead; a
          profile here describes an already-defined pack). Each consuming calculator only pulls the
          field it needs: DC-Link and Cable Sizing use the max voltage as the bus/system voltage.
        </p>
      </div>
    </div>
  );
}
