import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PremiumGate from '../components/PremiumGate';
import { useComponentProfiles, type ComponentProfile } from '../lib/useComponentProfiles';
import { motorProfileSummary, type MotorProfileParams } from '../lib/motorProfiles';
import { batteryProfileSummary, type BatteryProfileParams } from '../lib/batteryProfiles';
import { controllerProfileSummary, type ControllerProfileParams } from '../lib/controllerProfiles';
import { BLANK_POWERTRAIN_PROFILE, POWERTRAIN_TARGETS, type PowertrainProfileParams } from '../lib/powertrainProfiles';

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

interface Lists {
  motors: ComponentProfile<MotorProfileParams>[];
  batteries: ComponentProfile<BatteryProfileParams>[];
  controllers: ComponentProfile<ControllerProfileParams>[];
}

interface FormState { label: string; params: PowertrainProfileParams; }

function PowertrainForm({ initial, lists, onCancel, onSave, saving }: {
  initial: FormState;
  lists: Lists;
  onCancel: () => void;
  onSave: (f: FormState) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<FormState>(initial);
  const p = f.params;
  const patch = (k: keyof PowertrainProfileParams, v: unknown) => setF((s) => ({ ...s, params: { ...s.params, [k]: v } }));

  const componentSelect = (
    label: string,
    key: 'motorProfileId' | 'batteryProfileId' | 'controllerProfileId',
    options: { id: string; label: string }[],
    path: string,
    typeLabel: string,
  ) => (
    <div className="field">
      <label>{label}</label>
      {options.length === 0 ? (
        <span className="hint">No {typeLabel} profiles yet — <Link to={path}>create one</Link>.</span>
      ) : (
        <select value={p[key] ?? ''} onChange={(e) => patch(key, e.target.value || null)}>
          <option value="">— none —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );

  return (
    <div className="card">
      <div className="card-title">{initial.label ? `Edit "${initial.label}"` : 'New powertrain'}</div>
      <div className="field">
        <label>Powertrain name</label>
        <input autoComplete="off" value={f.label} onChange={(e) => setF((s) => ({ ...s, label: e.target.value }))} placeholder="e.g. 250kW rear-drive powertrain" />
      </div>
      <div className="grid grid-2">
        {componentSelect('Motor', 'motorProfileId', lists.motors, '/motor-profiles', 'motor')}
        {componentSelect('Battery', 'batteryProfileId', lists.batteries, '/battery-profiles', 'battery')}
        {componentSelect('Controller / inverter', 'controllerProfileId', lists.controllers, '/controller-profiles', 'controller')}
        <div className="field"><label>DC cable length (m)</label><input type="number" min={0} step={0.1} value={p.dcCableLengthM ?? ''} onChange={(e) => patch('dcCableLengthM', numOrNull(e.target.value))} placeholder="optional" /></div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={p.notes} onChange={(e) => patch('notes', e.target.value)} rows={2} placeholder="optional" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <PremiumGate feature="Save powertrain">
          <button className="btn primary" disabled={saving || !f.label.trim()} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save powertrain'}</button>
        </PremiumGate>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PowertrainCard({ pt, lists, onEdit, onDelete }: {
  pt: ComponentProfile<PowertrainProfileParams>;
  lists: Lists;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const motor = lists.motors.find((m) => m.id === pt.params.motorProfileId);
  const battery = lists.batteries.find((b) => b.id === pt.params.batteryProfileId);
  const controller = lists.controllers.find((c) => c.id === pt.params.controllerProfileId);

  const row = (label: string, name: string | undefined, summary: string | undefined) => (
    <tr>
      <td style={{ color: 'var(--text-faint)', width: 90 }}>{label}</td>
      <td>{name ? <><b>{name}</b> <span style={{ color: 'var(--text-2)' }}>· {summary}</span></> : <span style={{ color: 'var(--text-faint)' }}>— not set —</span>}</td>
    </tr>
  );

  return (
    <div className="card">
      <div className="card-title">
        <span>{pt.label}</span>
        <span style={{ display: 'flex', gap: '0.3rem' }}>
          <button className="btn small" onClick={onEdit}>Edit</button>
          <button className="btn small" onClick={onDelete}>Delete</button>
        </span>
      </div>
      <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
        <tbody>
          {row('Motor', motor?.label, motor && motorProfileSummary(motor.params))}
          {row('Battery', battery?.label, battery && batteryProfileSummary(battery.params))}
          {row('Controller', controller?.label, controller && controllerProfileSummary(controller.params))}
          {pt.params.dcCableLengthM != null && (
            <tr><td style={{ color: 'var(--text-faint)' }}>DC cable</td><td>{pt.params.dcCableLengthM} m</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.4rem' }}>Open pre-filled in:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {POWERTRAIN_TARGETS.map((t) => (
            <Link key={t.path} className="btn small" to={`${t.path}?powertrain=${pt.id}`} title={`Feeds: ${t.feeds}`}>{t.label} →</Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PowertrainPage() {
  const { user } = useAuth();
  const { profiles, loading, save, update, remove } = useComponentProfiles<PowertrainProfileParams>('powertrain');
  const motors = useComponentProfiles<MotorProfileParams>('motor');
  const batteries = useComponentProfiles<BatteryProfileParams>('battery');
  const controllers = useComponentProfiles<ControllerProfileParams>('controller');
  const lists: Lists = { motors: motors.profiles, batteries: batteries.profiles, controllers: controllers.profiles };

  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({ id: null, form: { label: '', params: { ...BLANK_POWERTRAIN_PROFILE } } });
  const startEdit = (pt: ComponentProfile<PowertrainProfileParams>) => setEditing({ id: pt.id, form: { label: pt.label, params: pt.params } });

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
        <div className="eyebrow">● Powertrain Workspace</div>
        <h1>Powertrain Workspace</h1>
        <p>
          Bundle a motor, battery, and controller into one named powertrain — the concept-phase view of
          the whole system — then open any component-level calculator (DC-Link, Cable Sizing, MOSFET
          Loss, Choke Sizing, Id/Iq, Torque/Power/Speed) pre-filled with the relevant parameters in one
          click.
        </p>
        <p style={{ marginTop: '0.5rem' }}><Link to="/account">← Back to Account</Link></p>
      </div>

      {!user ? (
        <div className="card">
          <p>Powertrains are saved to your account. <Link to="/account">Sign in or create an account</Link> to build one.</p>
        </div>
      ) : editing ? (
        <PowertrainForm initial={editing.form} lists={lists} saving={saving} onCancel={() => setEditing(null)} onSave={handleSave} />
      ) : (
        <>
          {loading && <div className="card"><p className="hint">Loading…</p></div>}
          {!loading && profiles.length === 0 && (
            <div className="card"><p className="hint">No powertrains yet. Bundle your saved motor, battery, and controller profiles into one.</p></div>
          )}
          {profiles.map((pt) => (
            <PowertrainCard key={pt.id} pt={pt} lists={lists} onEdit={() => startEdit(pt)} onDelete={() => { if (confirm(`Delete "${pt.label}"?`)) remove(pt.id); }} />
          ))}
          <button className="btn primary" onClick={startNew}>+ New powertrain</button>
        </>
      )}

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">How this works</div>
        <p className="note">
          A powertrain references your saved motor, battery, and controller profiles (edit a component
          and every powertrain using it updates), plus system-level fields like the DC cable length that
          don't belong to any single component. The "Open in…" links carry the bundle into each
          calculator and apply the fields it accepts — where two components would set the same field (e.g.
          the DC bus voltage), the battery's pack voltage takes precedence over the controller's rated
          maximum. Anything a calculator needs that the bundle doesn't provide is left for manual entry.
        </p>
      </div>
    </div>
  );
}
