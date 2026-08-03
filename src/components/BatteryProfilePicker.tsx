import { useState } from 'react';
import { Link } from 'react-router-dom';
import PremiumGate from './PremiumGate';
import InfoTooltip from './InfoTooltip';
import { useComponentProfiles } from '../lib/useComponentProfiles';
import { batteryProfileSummary, type BatteryProfileParams } from '../lib/batteryProfiles';

// Drop-in "pull from a saved battery" control — one-shot load (same
// convention as MotorProfilePicker/SavedCalculations), not a persistent live
// link. Renders nothing if the user isn't signed in or has no battery
// profiles yet (with a link to create one).
export default function BatteryProfilePicker({ onApply, hint }: {
  onApply: (params: BatteryProfileParams) => void;
  hint?: string;
}) {
  const { profiles, loading, loggedIn } = useComponentProfiles<BatteryProfileParams>('battery');
  const [selectedId, setSelectedId] = useState('');

  if (!loggedIn || loading) return null;

  if (profiles.length === 0) {
    return <p className="hint">No saved batteries yet — <Link to="/battery-profiles">create a battery profile</Link> to pull its parameters in here.</p>;
  }

  const selected = profiles.find((p) => p.id === selectedId);

  return (
    <div className="field">
      <label>
        Load from battery profile
        {hint && <InfoTooltip>{hint}</InfoTooltip>}
      </label>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ flex: 1 }}>
          <option value="">Select a battery…</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <PremiumGate feature="Load from a saved battery profile">
          <button className="btn small" disabled={!selected} onClick={() => selected && onApply(selected.params)}>Load</button>
        </PremiumGate>
      </div>
      {selected && <span className="hint">{batteryProfileSummary(selected.params)}</span>}
    </div>
  );
}
