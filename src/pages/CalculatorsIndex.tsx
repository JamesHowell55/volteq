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
  EMC: '◎',
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
  '/speed-torque-power': 'Ω',
  '/conversions': '⇄',
  '/pcb-trace-width': '≣',
};

// Tighter, listing-page-only taglines. navCategories.ts descriptions stay full-length
// for the nav dropdowns and search engines; this page needs a faster scan.
const SHORT_DESCRIPTIONS: Record<string, string> = {
  '/busbar': 'Steady-state and short-circuit conductor temperature.',
  '/cable-sizing': 'Ampacity and voltage drop for EV powertrain cables.',
  '/creepage-clearance': 'Minimum creepage and clearance per IEC 60664-1.',
  '/harness-bundle-diameter': 'Bundle diameter for mixed-gauge wiring harnesses.',
  '/harness-designer': 'MIL-DTL-38999 connector pinouts and wiring schematics.',
  '/pcb-trace-width': 'Current capacity and trace width per IPC-2221.',
  '/skin-depth': 'AC skin depth from material, frequency, and geometry.',
  '/choke-sizing': 'CM/DM choke sizing with saturation and core-loss checks.',
  '/mosfet-loss': 'Conduction, switching, and thermal losses for SiC inverters.',
  '/heatsink-thermal': 'Junction-to-ambient Rth budget and natural-convection fin-array sizing.',
  '/heat-exchanger-sizing': 'Radiator and oil-cooler heat rejection via the effectiveness-NTU method.',
  '/dc-link': 'DC-link capacitance, ripple current, and bank layout.',
  '/speed-torque-power': 'Solve torque, power, or speed from the other two.',
  '/id-iq-current': 'Id/Iq decomposition and MTPA for PMSM FOC.',
  '/battery-pack-series-parallel': 'Pack voltage, capacity, and voltage sag under load.',
  '/beam-bending': 'Reactions, shear, moment, and deflection for any beam and load combination.',
  '/bearing-calculator': 'ISO 281 life-based bearing selection with lubrication guidance.',
  '/bolted-joint': 'Preload, torque, and yield checks to VDI 2230.',
  '/o-ring': 'Gland design to the Trelleborg guide and AS568/ISO 3601.',
  '/fits-and-limits': 'Interference-fit stresses to ISO 286 and Lamé theory.',
  '/conversions': 'Unit conversions across engineering quantities.',
};

function ToolCard({ link, categoryLabel }: { link: CalculatorLink; categoryLabel: string }) {
  const icon = PATH_ICON_OVERRIDES[link.path] ?? CATEGORY_ICONS[categoryLabel] ?? '●';
  const description = SHORT_DESCRIPTIONS[link.path] ?? link.description;
  if (!link.available) {
    return (
      <div className="tool-card">
        <div className="icon">{icon}</div>
        <h3>{link.label}</h3>
        <p>{description}</p>
        <span className="tag">Coming soon</span>
      </div>
    );
  }
  return (
    <Link to={link.path} className="tool-card available">
      <div className="directory-card-top"><div className="icon">{icon}</div><span>Open model ↗</span></div>
      <h3>{link.label}</h3>
      <p>{description}</p>
    </Link>
  );
}

// The full calculator directory — every tool, grouped by category, each with a
// description. Extracted out of Home.tsx (which is now a landing page) so this
// SEO/discovery surface isn't lost; linked from the hero CTA and the navbar.
export default function CalculatorsIndex() {
  const calculatorCount = NAV_CATEGORIES.reduce((total, category) => total + category.links.length, 1);

  return (
    <div className="directory-page">
      <header className="directory-hero">
        <div className="v3-kicker"><span /> Model library</div>
        <h1>Every engineering model.<br /><em>One clear workspace.</em></h1>
        <p>
          Electrical, power electronics, motors, battery, thermal, and mechanical — every calculator is
          free to use, shows its full derivation, and cites the standard it's checked against.
        </p>
        <div className="directory-stats">
          <span><b>{calculatorCount}</b> live calculators</span>
          <span><b>{NAV_CATEGORIES.length + 1}</b> disciplines</span>
          <span><b>100%</b> transparent methods</span>
        </div>
      </header>

      <nav className="directory-jump" aria-label="Calculator categories">
        <span>Jump to</span>
        {NAV_CATEGORIES.map((category, index) => (
          <a key={category.label} href={`#${category.label.toLowerCase().replaceAll(' ', '-')}`}>
            {String(index + 1).padStart(2, '0')} {category.label}
          </a>
        ))}
        <a href="#conversions">{String(NAV_CATEGORIES.length + 1).padStart(2, '0')} Conversions</a>
      </nav>

      <main className="directory-content">
      {NAV_CATEGORIES.map((category, index) => (
        <section className="directory-section" id={category.label.toLowerCase().replaceAll(' ', '-')} key={category.label}>
          <div className="directory-section-head">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{category.label}</h2>
            <p>{category.links.length} {category.links.length === 1 ? 'model' : 'models'}</p>
          </div>
          <div className="directory-grid">
            {category.links.map((link) => (
              <ToolCard key={link.path} link={link} categoryLabel={category.label} />
            ))}
          </div>
        </section>
      ))}

      <section className="directory-section" id="conversions">
        <div className="directory-section-head">
          <span>{String(NAV_CATEGORIES.length + 1).padStart(2, '0')}</span>
          <h2>Conversions</h2><p>1 utility</p>
        </div>
        <div className="directory-grid">
          <ToolCard link={CONVERSIONS_LINK} categoryLabel="Conversions" />
        </div>
      </section>
      </main>

      <footer className="directory-cta">
        <div><span className="v3-section-label">Need the methodology?</span><h2>Understand the engineering<br />behind the result.</h2></div>
        <Link to="/guides" className="btn primary">Explore technical guides ↗</Link>
      </footer>
    </div>
  );
}
