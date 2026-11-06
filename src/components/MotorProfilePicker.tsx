import { useState } from 'react';
import { Link } from 'react-router-dom';
import PremiumGate from './PremiumGate';
import InfoTooltip from './InfoTooltip';
import ProfileApplyNote from './ProfileApplyNote';
import { useComponentProfiles } from '../lib/useComponentProfiles';
import type { ProfileApplyResult } from '../lib/profileApply';
import { motorProfileSummary, type MotorProfileParams } from '../lib/motorProfiles';

// Drop-in "pull from a saved motor" control for any calculator that consumes
// motor parameters — one-shot load (same convention as SavedCalculations'
// "Load" button), not a persistent live link: picking a profile copies its
// values into the calculator's own fields once, and editing them afterward is
// just normal manual entry. Renders nothing if the user isn't signed in or has
// no motor profiles yet (with a link to create one), so it stays out of the
// way for anyone not using this feature.
//
// `onApply` may return a ProfileApplyResult naming the calculator inputs it
// couldn't populate (because this profile doesn't define them); when it does,
// a note under the picker tells the user rather than the load silently doing
// nothing.
export default function MotorProfilePicker({ onApply, hint }: {
  onApply: (params: MotorProfileParams) => ProfileApplyResult | void;
  hint?: string;
}) {
  const { profiles, loading, loggedIn } = useComponentProfiles<MotorProfileParams>('motor');
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState<ProfileApplyResult | null>(null);

  if (!loggedIn || loading) return null;

  if (profiles.length === 0) {
    return <p className="hint">No saved motors yet — <Link to="/motor-profiles">create a motor profile</Link> to pull its parameters in here.</p>;
  }

  const selected = profiles.find((p) => p.id === selectedId);

  return (
    <div className="field">
      <label>
        Load from motor profile
        {hint && <InfoTooltip>{hint}</InfoTooltip>}
      </label>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setNote(null); }} style={{ flex: 1 }}>
          <option value="">Select a motor…</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <PremiumGate feature="Load from a saved motor profile">
          <button className="btn small" disabled={!selected} onClick={() => selected && setNote(onApply(selected.params) ?? { skipped: [] })}>Load</button>
        </PremiumGate>
      </div>
      {selected && <span className="hint">{motorProfileSummary(selected.params)}</span>}
      {selected && note && <ProfileApplyNote result={note} editHref={`/motor-profiles?edit=${selected.id}`} />}
    </div>
  );
}
