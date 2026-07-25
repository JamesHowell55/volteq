import { Link } from 'react-router-dom';
import { getGuideForCalculator, guidePath } from '../lib/guides';

// Drops a "Read the guide" link into a calculator's Reference & assumptions
// card, if a guide exists for that calculator (renders nothing otherwise). The
// calculator ↔ guide interlink is the internal-linking that gives the guides
// their SEO value; keeping it in one component means new guides light up their
// calculator automatically once registered in guides.ts.
export default function GuideBacklink({ calculatorPath }: { calculatorPath: string }) {
  const guide = getGuideForCalculator(calculatorPath);
  if (!guide) return null;
  return (
    <p className="note" style={{ marginTop: '0.85rem' }}>
      <span aria-hidden="true">📖</span> New to {guide.standard}?{' '}
      <Link to={guidePath(guide.slug)}>Read the guide: {guide.title}</Link> — a plain-language
      explainer of the standard behind this calculator.
    </p>
  );
}
