import { Link } from 'react-router-dom';
import { NAV_CATEGORIES, CONVERSIONS_LINK, type CalculatorLink } from '../lib/navCategories';

// Per-category default icon (this library now spans ~130 calculators, too many for
// a maintainable per-path map) with a few per-path overrides for the flagship tools.
const CATEGORY_ICONS: Record<string, string> = {
  Electrical: '⚡',
  'Power Electronics': '⎓',
  Motors: '⟲',
  Battery: '⏻',
  Mechanical: '⚙',
  Thermal: '♨',
  'Vehicle & Motion': '▶',
  Material: '⬡',
  'Cost & Project': '◈',
};

const PATH_ICON_OVERRIDES: Record<string, string> = {
  '/busbar': '⌁',
  '/creepage-clearance': '⏚',
  '/bolted-joint': '⛭',
  '/cable-sizing': '⏛',
  '/battery-pack-series-parallel': '⫴',
  '/conversions': '⇄',
};

function ToolCard({ link, categoryLabel }: { link: CalculatorLink; categoryLabel: string }) {
  const icon = PATH_ICON_OVERRIDES[link.path] ?? CATEGORY_ICONS[categoryLabel] ?? '●';
  if (!link.available) {
    return (
      <div className="tool-card">
        <div className="icon">{icon}</div>
        <h3>{link.label}</h3>
        <p>{link.description}</p>
        <span className="tag">Coming soon</span>
      </div>
    );
  }
  return (
    <Link to={link.path} className="tool-card available">
      <div className="icon">{icon}</div>
      <h3>{link.label}</h3>
      <p>{link.description}</p>
      <span className="tag">Available</span>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● First-principles engineering tools</div>
        <h1>Engineering Calculators</h1>
        <p>
          A growing library of calculators for electrical, power electronics, motor, battery, mechanical,
          thermal, and vehicle design work — transparent formulas, standards-referenced, every step shown.
        </p>
      </div>

      {NAV_CATEGORIES.map((category) => (
        <div key={category.label} style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{category.label}</h2>
          <div className="tool-grid">
            {category.links.map((link) => (
              <ToolCard key={link.path} link={link} categoryLabel={category.label} />
            ))}
          </div>
        </div>
      ))}

      <div>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Conversions</h2>
        <div className="tool-grid">
          <ToolCard link={CONVERSIONS_LINK} categoryLabel="Conversions" />
        </div>
      </div>
    </div>
  );
}
