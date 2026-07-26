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

// The full calculator directory — every tool, grouped by category, each with a
// description. Extracted out of Home.tsx (which is now a landing page) so this
// SEO/discovery surface isn't lost; linked from the hero CTA and the navbar.
export default function CalculatorsIndex() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● All calculators</div>
        <h1>Every Volteq calculator, in one place</h1>
        <p>
          Electrical, power electronics, motors, battery, thermal, and mechanical — every calculator is
          free to use, shows its full derivation, and cites the standard it's checked against.
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
