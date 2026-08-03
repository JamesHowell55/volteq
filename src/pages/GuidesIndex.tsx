import { Link } from 'react-router-dom';
import { GUIDES, guidePath } from '../lib/guides';

// The /guides landing page: a grid of guide cards (reusing the Home tool-card
// styling) linking to each standard's explainer. Free and indexable — the
// top-of-funnel entry point for the reference content.
export default function GuidesIndex() {
  return (
    <div className="directory-page guides-directory">
      <header className="directory-hero">
        <div className="v3-kicker"><span /> Reference library</div>
        <h1>Engineering standards,<br /><em>made legible.</em></h1>
        <p>
          Plain-language guides to the standards behind Volteq's calculators — what each one actually
          says, the governing formula in words, when it applies, and where the simplifications bite.
          Each guide links straight through to the calculator that implements it.
        </p>
        <div className="directory-stats">
          <span><b>{GUIDES.length}</b> technical guides</span>
          <span><b>Free</b> to read</span>
          <span><b>Direct</b> model links</span>
        </div>
      </header>

      <main className="directory-content">
        <div className="directory-section-head guides-head">
          <span>INDEX</span><h2>Technical reference</h2><p>{GUIDES.length} articles</p>
        </div>
        <div className="guide-index">
        {GUIDES.map((g, index) => (
          <Link key={g.slug} to={guidePath(g.slug)} className="guide-index-card">
            <div className="guide-index-meta"><span>{String(index + 1).padStart(2, '0')}</span><b>{g.standard}</b></div>
            <h2>{g.title}</h2>
            <p>{g.blurb}</p>
            <div className="guide-index-link"><span>Linked model</span><b>{g.calculator.label}</b><i>↗</i></div>
          </Link>
        ))}
        </div>
      </main>

      <footer className="directory-cta">
        <div><span className="v3-section-label">Ready to calculate?</span><h2>Put the methodology<br />to work.</h2></div>
        <Link to="/calculators" className="btn primary">Open the model library ↗</Link>
      </footer>
    </div>
  );
}
