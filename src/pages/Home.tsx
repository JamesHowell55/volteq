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
  '/speed-torque-power': 'Ω',
  '/conversions': '⇄',
  '/pcb-trace-width': '≣',
};

// Tighter, homepage-only taglines. navCategories.ts descriptions stay full-length
// for the nav dropdowns and search engines; the homepage needs a faster scan.
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
  '/dc-link': 'DC-link capacitance, ripple current, and bank layout.',
  '/speed-torque-power': 'Solve torque, power, or speed from the other two.',
  '/id-iq-current': 'Id/Iq decomposition and MTPA for PMSM FOC.',
  '/battery-pack-series-parallel': 'Pack voltage, capacity, and voltage sag under load.',
  '/beam-bending': 'Reactions, shear, moment, and deflection for any beam and load combination.',
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
      <div className="icon">{icon}</div>
      <h3>{link.label}</h3>
      <p>{description}</p>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">● Power electronics &amp; EV engineering</div>
        <h1>The calculation layer for power electronics and EV engineering.</h1>
        <p className="hero-sub">
          From busbar thermals to SiC inverter losses to bolted-joint preload — every calculator shows its
          full derivation, cites the governing standard, and exports straight to a client-ready report.
        </p>
        <div className="hero-actions">
          <Link to="/busbar" className="btn primary">Start calculating</Link>
          <Link to="/account" className="btn">Create a free account</Link>
        </div>
        <div className="hero-stats">
          <span><b>22</b> calculators</span>
          <span><b>10+</b> standards referenced</span>
          <span><b>Full</b> derivations shown</span>
          <span><b>PDF</b> export</span>
        </div>
      </section>

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

      <section className="card home-cta">
        <div>
          <h2>Ready to start calculating?</h2>
          <p>Create a free account to save your inputs and pick up where you left off.</p>
        </div>
        <Link to="/account" className="btn primary">Create a free account</Link>
      </section>
    </div>
  );
}
