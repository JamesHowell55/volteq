import { useState } from 'react';
import { Link } from 'react-router-dom';
import PremiumGate from './PremiumGate';
import InfoTooltip from './InfoTooltip';
import ProfileApplyNote from './ProfileApplyNote';
import { useComponentProfiles } from '../lib/useComponentProfiles';
import type { ProfileApplyResult } from '../lib/profileApply';
import { controllerProfileSummary, type ControllerProfileParams } from '../lib/controllerProfiles';

// Drop-in "pull from a saved controller" control — one-shot load, same
// convention as MotorProfilePicker/BatteryProfilePicker. `onApply` may return a
// ProfileApplyResult naming the calculator inputs it couldn't populate (because
// this profile doesn't define them); when it does, a note under the picker
// tells the user rather than the load silently doing nothing.
export default function ControllerProfilePicker({ onApply, hint }: {
  onApply: (params: ControllerProfileParams) => ProfileApplyResult | void;
  hint?: string;
}) {
  const { profiles, loading, loggedIn } = useComponentProfiles<ControllerProfileParams>('controller');
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState<ProfileApplyResult | null>(null);

  if (!loggedIn || loading) return null;

  if (profiles.length === 0) {
    return <p className="hint">No saved controllers yet — <Link to="/controller-profiles">create a controller profile</Link> to pull its parameters in here.</p>;
  }

  const selected = profiles.find((p) => p.id === selectedId);

  return (
    <div className="field">
      <label>
        Load from controller profile
        {hint && <InfoTooltip>{hint}</InfoTooltip>}
      </label>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setNote(null); }} style={{ flex: 1 }}>
          <option value="">Select a controller…</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <PremiumGate feature="Load from a saved controller profile">
          <button className="btn small" disabled={!selected} onClick={() => selected && setNote(onApply(selected.params) ?? { skipped: [] })}>Load</button>
        </PremiumGate>
      </div>
      {selected && <span className="hint">{controllerProfileSummary(selected.params)}</span>}
      {selected && note && <ProfileApplyNote result={note} editHref={`/controller-profiles?edit=${selected.id}`} />}
    </div>
  );
}
