import { Link } from 'react-router-dom';
import type { ProfileApplyResult } from '../lib/profileApply';

// Shown under a profile picker straight after a "Load": confirms the load and,
// when the profile didn't define everything the calculator pulls, spells out
// which inputs were left unchanged and links to the profile so the user can
// fill in the missing values.
export default function ProfileApplyNote({ result, editHref }: {
  result: ProfileApplyResult;
  editHref: string;
}) {
  if (result.skipped.length === 0) {
    return <span className="hint" style={{ color: 'var(--pos)' }}>✓ Loaded into the calculator.</span>;
  }

  const n = result.skipped.length;
  return (
    <span
      className="hint"
      style={{
        display: 'block',
        marginTop: '0.4rem',
        padding: '0.5rem 0.65rem',
        borderLeft: '3px solid var(--warn)',
        background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-2)',
        lineHeight: 1.5,
      }}
    >
      <strong>⚠ Loaded, but {n} input{n > 1 ? 's were' : ' was'} left unchanged</strong> — this profile
      doesn't define: {result.skipped.join(', ')}.{' '}
      <Link to={editHref}>Edit this profile</Link> to add the missing values.
    </span>
  );
}
