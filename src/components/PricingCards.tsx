import { Link } from 'react-router-dom';

// The 3 real Stripe billing options for Premium — same feature set on every
// plan (Premium is a single tier), differing only in billing cadence/price.
interface PricingPlan {
  id: 'monthly' | 'annual' | 'lifetime';
  label: string;
  priceDisplay: string;
  cadence: string;
  note?: string;
  highlight?: string;
}

const PLANS: PricingPlan[] = [
  { id: 'monthly', label: 'Monthly', priceDisplay: '$12', cadence: '/ month' },
  { id: 'annual', label: 'Annual', priceDisplay: '$108', cadence: '/ year', note: '$9/month, billed annually', highlight: 'Save 25%' },
  { id: 'lifetime', label: 'Lifetime', priceDisplay: '$249', cadence: 'one-time', highlight: 'Best value' },
];

const PREMIUM_FEATURES = [
  'PDF export with your company\'s branding',
  'Save and reload calculations',
  'Every advanced / custom-input mode',
  'Full standards reference tables',
];

export default function PricingCards() {
  return (
    <div className="pricing-grid">
      {PLANS.map((plan) => (
        <div className="pricing-card" key={plan.id}>
          {plan.highlight && <div className="pricing-badge">{plan.highlight}</div>}
          <div className="pricing-plan-label">{plan.label}</div>
          <div className="pricing-price">
            {plan.priceDisplay}
            <span className="pricing-cadence">{plan.cadence}</span>
          </div>
          {plan.note && <div className="pricing-note">{plan.note}</div>}
          <ul className="pricing-features">
            {PREMIUM_FEATURES.map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
          <Link to="/account" className="btn primary">Get started</Link>
        </div>
      ))}
    </div>
  );
}
