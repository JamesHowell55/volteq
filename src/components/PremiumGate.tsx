import type { ReactNode } from 'react';
import { useEntitlement } from '../lib/useEntitlement';

interface Props {
  feature: string;
  children: ReactNode;
}

// Wraps a premium-only control (a button, checkbox, data table, whole
// section, etc.) — renders it as-is for a premium user. For everyone else,
// renders the same content greyed out and inert (so it still reads as "this
// is the feature", not a placeholder), with a full-cover link over it that
// opens the upgrade page in a NEW TAB — a same-tab navigation would unmount
// the calculator and lose whatever the user has entered. This checks a
// real, server-verified entitlement row (via useEntitlement -> Supabase),
// not a spoofable local flag.
export default function PremiumGate({ feature, children }: Props) {
  const { isPremium, loading } = useEntitlement();

  if (loading) return null;
  if (isPremium) return <>{children}</>;

  return (
    <span className="premium-locked">
      <fieldset disabled className="premium-locked-content">{children}</fieldset>
      <a
        href="/account"
        target="_blank"
        rel="noopener noreferrer"
        className="premium-locked-overlay"
        title={`${feature} is a Premium feature — click to upgrade (opens in a new tab)`}
        aria-label={`${feature} is a Premium feature. Opens the upgrade page in a new tab.`}
      />
    </span>
  );
}
