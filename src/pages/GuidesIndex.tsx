import { Link } from 'react-router-dom';
import { GUIDES, guidePath } from '../lib/guides';

// The /guides landing page: a grid of guide cards (reusing the Home tool-card
// styling) linking to each standard's explainer. Free and indexable — the
// top-of-funnel entry point for the reference content.
export default function GuidesIndex() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● Reference &amp; guides</div>
        <h1>Engineering standards, explained</h1>
        <p>
          Plain-language guides to the standards behind Volteq's calculators — what each one actually
          says, the governing formula in words, when it applies, and where the simplifications bite.
          Each guide links straight through to the calculator that implements it.
        </p>
      </div>

      <div className="tool-grid">
        {GUIDES.map((g) => (
          <Link key={g.slug} to={guidePath(g.slug)} className="tool-card available">
            <div className="icon">📖</div>
            <h3>{g.standard}</h3>
            <p>{g.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
