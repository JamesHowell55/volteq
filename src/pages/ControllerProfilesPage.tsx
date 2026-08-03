import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PremiumGate from '../components/PremiumGate';
import { useComponentProfiles, type ComponentProfile } from '../lib/useComponentProfiles';
import {
  BLANK_CONTROLLER_PROFILE, COOLING_METHOD_LABELS, controllerProfileSummary,
  type ControllerProfileParams, type CoolingMethod,
} from '../lib/controllerProfiles';

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

interface FormState { label: string; params: ControllerProfileParams; }

function ControllerProfileForm({ initial, onCancel, onSave, saving }: {
  initial: FormState;
  onCancel: () => void;
  onSave: (f: FormState) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<FormState>(initial);
  const p = f.params;
  const patch = (k: keyof ControllerProfileParams, v: unknown) => setF((s) => ({ ...s, params: { ...s.params, [k]: v } }));

  return (
    <div className="card">
      <div className="card-title">{initial.label ? `Edit "${initial.label}"` : 'New controller profile'}</div>
      <div className="field">
        <label>Profile name</label>
        <input autoComplete="off" value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="e.g. PM100DX traction inverter" />
      </div>
      <div className="grid grid-2">
        <div className="field"><label>Max DC voltage (V)</label><input type="number" min={0} value={p.maxDcVoltageV} onChange={(e) => patch('maxDcVoltageV', Number(e.target.value))} /></div>
        <div className="field"><label>Min DC voltage (V)</label><input type="number" min={0} value={p.minDcVoltageV} onChange={(e) => patch('minDcVoltageV', Number(e.target.value))} /></div>
        <div className="field"><label>Continuous current (A rms)</label><input type="number" min={0} value={p.continuousCurrentARms ?? ''} onChange={(e) => patch('continuousCurrentARms', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Peak current (A rms)</label><input type="number" min={0} value={p.peakCurrentARms ?? ''} onChange={(e) => patch('peakCurrentARms', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Peak power (kW)</label><input type="number" min={0} value={p.peakPowerKw ?? ''} onChange={(e) => patch('peakPowerKw', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Switching frequency (kHz)</label><input type="number" min={0} step={0.5} value={p.switchingFrequencyKhz ?? ''} onChange={(e) => patch('switchingFrequencyKhz', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>DC-link capacitance (µF)</label><input type="number" min={0} value={p.dcLinkCapacitanceUf ?? ''} onChange={(e) => patch('dcLinkCapacitanceUf', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field">
          <label>Cooling</label>
          <select value={p.coolingMethod ?? ''} onChange={(e) => patch('coolingMethod', e.target.value ? e.target.value as CoolingMethod : null)}>
            <option value="">— optional —</option>
            {Object.entries(COOLING_METHOD_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={p.notes} onChange={(e) => patch('notes', e.target.value)} rows={2} placeholder="optional" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <PremiumGate feature="Save controller profile">
          <button className="btn primary" disabled={saving || !f.label.trim()} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save profile'}</button>
        </PremiumGate>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function ControllerProfilesPage() {
  const { user } = useAuth();
  const { profiles, loading, save, update, remove } = useComponentProfiles<ControllerProfileParams>('controller');
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({ id: null, form: { label: '', params: { ...BLANK_CONTROLLER_PROFILE } } });
  const startEdit = (p: ComponentProfile<ControllerProfileParams>) => setEditing({ id: p.id, form: { label: p.label, params: p.params } });

  // Deep-link edit: ?edit=<id>, same convention as Motor/Battery profiles.
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
        <div className="eyebrow">● Controller Profiles</div>
        <h1>Controller Profiles</h1>
        <p>
          Define a motor controller / inverter once — DC voltage range, continuous/peak current, peak
          power, switching frequency — and pull it straight into DC-Link Capacitor Sizing, Cable/Wire
          Sizing, MOSFET Loss, and Choke Sizing instead of retyping the same numbers in each one.
        </p>
        <p style={{ marginTop: '0.5rem' }}><Link to="/account">← Back to Account</Link></p>
      </div>

      {!user ? (
        <div className="card">
          <p>Controller profiles are saved to your account. <Link to="/account">Sign in or create an account</Link> to build your controller library.</p>
        </div>
      ) : (
        <>
          {!editing && (
            <div className="card">
              <div className="card-title">Your controllers</div>
              {loading && <p className="hint">Loading…</p>}
              {!loading && profiles.length === 0 && <p className="hint">No controller profiles yet.</p>}
              {profiles.length > 0 && (
                <table className="data-table">
                  <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Summary</th><th style={{ width: 1 }}></th></tr></thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'left' }}>{p.label}</td>
                        <td style={{ textAlign: 'left', color: 'var(--text-2)' }}>{controllerProfileSummary(p.params)}</td>
                        <td><span style={{ display: 'flex', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                          <button className="btn small" onClick={() => startEdit(p)}>Edit</button>
                          <button className="btn small" onClick={() => { if (confirm(`Delete "${p.label}"?`)) remove(p.id); }}>Delete</button>
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button className="btn primary" style={{ marginTop: '0.75rem' }} onClick={startNew}>+ New controller profile</button>
            </div>
          )}

          {editing && (
            <ControllerProfileForm initial={editing.form} saving={saving} onCancel={() => setEditing(null)} onSave={handleSave} />
          )}
        </>
      )}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">How this works</div>
        <p className="note">
          Fields match what a real commercial traction inverter datasheet states (DC operating voltage
          range, continuous/peak output current, peak power, PWM switching frequency, onboard DC-link
          capacitance) — unit-level ratings, not individual switching-device specs (those live in the
          MOSFET Loss calculator's own device library). Each consuming calculator only pulls the field
          it needs: DC-Link and Choke Sizing use max voltage and switching frequency; MOSFET Loss uses
          DC bus voltage and switching frequency; Cable Sizing uses current and voltage.
        </p>
      </div>
    </div>
  );
}
