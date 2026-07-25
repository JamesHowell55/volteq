import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GuideMeta } from '../../lib/guides';
import { GUIDES_INDEX_PATH } from '../../lib/guides';
import PremiumGate from '../../components/PremiumGate';

// Shared chrome for every guide page: the header (standard eyebrow + title), a
// prominent link through to the guide's calculator, the free explainer body,
// and a link back to the guides index. Guide-specific prose is passed as
// children. The free/premium split is handled per-section by GuideDeepDive.

interface Props {
  guide: GuideMeta;
  children: ReactNode; // the free explainer + any GuideDeepDive sections
}

export default function GuideLayout({ guide, children }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● {guide.standard} Guide</div>
        <h1>{guide.title}</h1>
        <p>{guide.seoDescription}</p>
        <div style={{ marginTop: '1rem' }}>
          <Link to={guide.calculator.path} className="btn primary">
            Open the {guide.calculator.label} →
          </Link>
        </div>
      </div>

      <div className="card guide-body">{children}</div>

      <p className="note" style={{ marginTop: '1.25rem' }}>
        <Link to={GUIDES_INDEX_PATH}>← All guides</Link>
        {'  ·  '}
        <Link to={guide.calculator.path}>Open the {guide.calculator.label}</Link>
      </p>
    </div>
  );
}

// A premium "deep dive" block within a guide: the heading and a short teaser are
// always visible (so a logged-out visitor sees what's behind the paywall and the
// page still reads as complete for SEO), while the detailed content is gated.
export function GuideDeepDive({ title, teaser, feature, children }: {
  title: string;
  teaser: string;
  feature: string;
  children: ReactNode;
}) {
  return (
    <div className="guide-deepdive">
      <h2>{title}</h2>
      <p>{teaser}</p>
      <PremiumGate feature={feature}>
        <>{children}</>
      </PremiumGate>
    </div>
  );
}
