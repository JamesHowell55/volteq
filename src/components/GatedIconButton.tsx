import type { ReactNode } from 'react';
import { useEntitlement } from '../lib/useEntitlement';

interface Props {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

// An icon-only calculator action (Export PDF, Save calculation) that's greyed
// out and links to /account for non-premium users, instead of the usual
// PremiumGate text/lock pill — kept plain grey (no lock badge) so it still
// reads as "this row of icons" rather than a separate upsell element. Opens
// in a new tab: a same-tab navigation would unmount the calculator page and
// lose whatever the user has entered.
export default function GatedIconButton({ label, icon, onClick, disabled }: Props) {
  const { isPremium, loading } = useEntitlement();

  if (loading) return null;

  if (!isPremium) {
    return (
      <a
        href="/account"
        target="_blank"
        rel="noopener noreferrer"
        className="calc-action-btn locked"
        title={`${label} is a Premium feature — click to upgrade (opens in a new tab)`}
        aria-label={`${label} is a Premium feature. Opens the upgrade page in a new tab.`}
      >
        {icon}
      </a>
    );
  }

  return (
    <button type="button" className="calc-action-btn" onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      {icon}
    </button>
  );
}
