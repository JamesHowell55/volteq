import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PremiumGate from '../components/PremiumGate';
import InfoTooltip from '../components/InfoTooltip';
import { useComponentProfiles, type ComponentProfile } from '../lib/useComponentProfiles';
import {
  BLANK_MOTOR_PROFILE, MOTOR_TYPE_LABELS, motorProfileSummary,
  type MotorProfileParams, type MotorType,
} from '../lib/motorProfiles';

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

interface FormState { label: string; params: MotorProfileParams; }

function MotorProfileForm({ initial, onCancel, onSave, saving }: {
  initial: FormState;
  onCancel: () => void;
  onSave: (f: FormState) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<FormState>(initial);
  const p = f.params;
  const patch = (k: keyof MotorProfileParams, v: unknown) => setF((s) => ({ ...s, params: { ...s.params, [k]: v } }));

  return (
    <div className="card">
      <div className="card-title">{initial.label ? `Edit "${initial.label}"` : 'New motor profile'}</div>
      <div className="field">
        <label>Profile name</label>
        <input autoComplete="off" value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="e.g. 250kW IPM traction motor" />
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label>Motor type</label>
          <select value={p.motorType} onChange={(e) => patch('motorType', e.target.value as MotorType)}>
            {Object.entries(MOTOR_TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div className="field"><label>Rated power (kW)</label><input type="number" min={0} value={p.ratedPowerKw} onChange={(e) => patch('ratedPowerKw', Number(e.target.value))} /></div>
        <div className="field"><label>Peak torque (N·m)</label><input type="number" min={0} value={p.peakTorqueNm} onChange={(e) => patch('peakTorqueNm', Number(e.target.value))} /></div>
        <div className="field"><label>Continuous torque (N·m)</label><input type="number" min={0} value={p.continuousTorqueNm ?? ''} onChange={(e) => patch('continuousTorqueNm', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field">
          <label>Kt — torque constant (N·m/A)<InfoTooltip>As printed on the datasheet. Not used to derive current for a salient (IPM) motor — reluctance torque means peak torque ≠ Kt × current.</InfoTooltip></label>
          <input type="number" min={0} step={0.01} value={p.ktNmPerA ?? ''} onChange={(e) => patch('ktNmPerA', numOrNull(e.target.value))} placeholder="optional" />
        </div>
        <div className="field">
          <label>Ke — back-EMF constant (V/krpm)<InfoTooltip>As printed on the datasheet. Stored for reference only — the convention (peak/RMS, line/phase) varies by manufacturer, so this isn't auto-converted to flux linkage.</InfoTooltip></label>
          <input type="number" min={0} step={0.1} value={p.keVPerKrpm ?? ''} onChange={(e) => patch('keVPerKrpm', numOrNull(e.target.value))} placeholder="optional" />
        </div>
        <div className="field"><label>Pole pairs</label><input type="number" min={1} value={p.polePairs ?? ''} onChange={(e) => patch('polePairs', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Ld — d-axis inductance (mH)</label><input type="number" min={0} step={0.01} value={p.ldMh ?? ''} onChange={(e) => patch('ldMh', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Lq — q-axis inductance (mH)</label><input type="number" min={0} step={0.01} value={p.lqMh ?? ''} onChange={(e) => patch('lqMh', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field">
          <label>Flux linkage λpm (Wb)<InfoTooltip>Peak, per-phase — needed by the Id/Iq calculator's torque breakdown. Enter directly if known; it is not derived from Ke here.</InfoTooltip></label>
          <input type="number" min={0} step={0.001} value={p.fluxLinkageWb ?? ''} onChange={(e) => patch('fluxLinkageWb', numOrNull(e.target.value))} placeholder="optional" />
        </div>
        <div className="field"><label>Continuous current (A RMS)</label><input type="number" min={0} value={p.continuousCurrentARms ?? ''} onChange={(e) => patch('continuousCurrentARms', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Peak current (A RMS)</label><input type="number" min={0} value={p.peakCurrentARms ?? ''} onChange={(e) => patch('peakCurrentARms', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Rated speed (rpm)</label><input type="number" min={0} value={p.ratedSpeedRpm ?? ''} onChange={(e) => patch('ratedSpeedRpm', numOrNull(e.target.value))} placeholder="optional" /></div>
        <div className="field"><label>Max speed (rpm)</label><input type="number" min={0} value={p.maxSpeedRpm ?? ''} onChange={(e) => patch('maxSpeedRpm', numOrNull(e.target.value))} placeholder="optional" /></div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={p.notes} onChange={(e) => patch('notes', e.target.value)} rows={2} placeholder="optional" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <PremiumGate feature="Save motor profile">
          <button className="btn primary" disabled={saving || !f.label.trim()} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save profile'}</button>
        </PremiumGate>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function MotorProfilesPage() {
  const { user } = useAuth();
  const { profiles, loading, save, update, remove } = useComponentProfiles<MotorProfileParams>('motor');
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({ id: null, form: { label: '', params: { ...BLANK_MOTOR_PROFILE } } });
  const startEdit = (p: ComponentProfile<MotorProfileParams>) => setEditing({ id: p.id, form: { label: p.label, params: p.params } });

  // Deep-link edit: arriving with ?edit=<id> (e.g. from Account's "Saved
  // equipment" list) opens that profile's edit form directly, same convention
  // as SavedCalculations' ?load=<id> handling.
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
        <div className="eyebrow">● Motor Profiles</div>
        <h1>Motor Profiles</h1>
        <p>
          Define a motor once — type, power, torque, Kt/Ke, pole pairs, Ld/Lq — and pull it straight into the
          Id/Iq Current Vector, DC-Link Capacitor Sizing, Cable/Wire Sizing, and Speed↔Torque↔Power
          calculators instead of retyping the same numbers in each one.
        </p>
        <p style={{ marginTop: '0.5rem' }}><Link to="/account">← Back to Account</Link></p>
      </div>

      {!user ? (
        <div className="card">
          <p>Motor profiles are saved to your account. <Link to="/account">Sign in or create an account</Link> to build your motor library.</p>
        </div>
      ) : (
        <>
          {!editing && (
            <div className="card">
              <div className="card-title">Your motors</div>
              {loading && <p className="hint">Loading…</p>}
              {!loading && profiles.length === 0 && <p className="hint">No motor profiles yet.</p>}
              {profiles.length > 0 && (
                <table className="data-table">
                  <thead><tr><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Summary</th><th style={{ width: 1 }}></th></tr></thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'left' }}>{p.label}</td>
                        <td style={{ textAlign: 'left', color: 'var(--text-2)' }}>{motorProfileSummary(p.params)}</td>
                        <td><span style={{ display: 'flex', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                          <button className="btn small" onClick={() => startEdit(p)}>Edit</button>
                          <button className="btn small" onClick={() => { if (confirm(`Delete "${p.label}"?`)) remove(p.id); }}>Delete</button>
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button className="btn primary" style={{ marginTop: '0.75rem' }} onClick={startNew}>+ New motor profile</button>
            </div>
          )}

          {editing && (
            <MotorProfileForm initial={editing.form} saving={saving} onCancel={() => setEditing(null)} onSave={handleSave} />
          )}
        </>
      )}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">How this works</div>
        <p className="note">
          A motor profile is a plain data record — nothing here is cross-derived (Kt, Ke, and flux linkage are
          stored exactly as entered, since converting between them needs a convention — peak vs RMS, line vs
          phase — that varies by manufacturer and would silently risk a wrong number). Each consuming
          calculator only pulls the specific fields it needs: the Id/Iq calculator needs pole pairs, flux
          linkage, and Ld/Lq; DC-Link and Cable Sizing need a phase current; Speed↔Torque↔Power needs Kt,
          rated power, and speed. Fields a calculator needs that aren't in the profile are simply left for
          manual entry.
        </p>
      </div>
    </div>
  );
}
