import { Link } from 'react-router-dom';
import LandingGraphic from '../components/LandingGraphic';
import HeroCarousel from '../components/HeroCarousel';
import PricingCards from '../components/PricingCards';
import { ALL_CALCULATOR_LINKS } from '../lib/navCategories';

const DISCIPLINES = [
  { icon: '⚡', label: 'Electrical', description: 'Busbar, cable sizing, creepage & clearance, PCB traces, harnesses.' },
  { icon: '⎓', label: 'Power Electronics', description: 'SiC/MOSFET loss, DC-link capacitors, CM/DM choke sizing.' },
  { icon: '⟲', label: 'Motors', description: 'Torque/power/speed, Id/Iq field-oriented control.' },
  { icon: '⏻', label: 'Battery', description: 'Pack series/parallel voltage, capacity, and sag under load.' },
  { icon: '♨', label: 'Thermal', description: 'Heatsink Rth budgets, heat exchanger sizing via effectiveness-NTU.' },
  { icon: '⚙', label: 'Mechanical', description: 'Beams, bolted joints, bolt patterns, fits, O-rings, Mohr\'s circle.' },
];

const FEATURES = [
  { icon: '◎', title: 'Accurate by design', description: 'Every calculator uses documented, citable formulas — no black-box results, ever.' },
  { icon: '⏱', title: 'Save time', description: 'Skip the spreadsheet rebuild — get a full derivation and a client-ready PDF in minutes.' },
  { icon: '⛨', title: 'Built with trust', description: 'Each result is checked against a published textbook or standard worked example.' },
  { icon: '↻', title: 'Continuously improved', description: 'New calculators and guides ship regularly, covering more of the EV powertrain stack.' },
];

export default function Home() {
  const calculatorCount = ALL_CALCULATOR_LINKS.filter((l) => l.available).length;

  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">● Engineering intelligence</div>
            <h1>Calculators and tools for engineers.</h1>
            <p className="hero-sub">
              High-accuracy, first-principles engineering calculators for EV powertrain and power
              electronics design — full derivations, cited standards, and a client-ready PDF on every result.
            </p>
            <div className="hero-actions">
              <Link to="/calculators" className="btn primary">Explore calculators →</Link>
              <Link to="/calculators" className="btn">View all tools</Link>
            </div>
            <div className="hero-badges">
              <span>Built by engineers</span>
              <span>Verified methodology</span>
              <span>SI units by default</span>
            </div>
          </div>
          <HeroCarousel />
        </div>
      </section>

      <section className="feature-grid-section">
        <h2>Designed for engineering teams building the future.</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-copy">
          <div className="eyebrow">● Show your work</div>
          <h2>Every answer comes with its derivation.</h2>
          <p>
            No calculator on Volteq just hands you a number. Each one shows the full step-by-step
            calculation and is checked against a published worked example from the governing standard —
            IEC, ISO, IPC, VDI, or a recognized reference text — with a "Validated:" note on the result.
            Export the whole thing to a client-ready PDF.
          </p>
        </div>
        <div className="landing-graphic">
          <LandingGraphic variant="motor-winding" />
        </div>
      </section>

      <section className="landing-section reverse">
        <div className="landing-copy">
          <div className="eyebrow">● Built for EV powertrain &amp; power electronics</div>
          <h2>Every discipline. Every stage.</h2>
          <p>
            Volteq is purpose-built for one vertical: EV powertrain and power electronics design — not
            adapted from a generic mechanical-engineering toolbox. {calculatorCount} calculators across six
            disciplines, with more shipping regularly.
          </p>
          <Link to="/calculators" className="btn">Explore all calculators →</Link>
        </div>
        <div className="discipline-grid">
          {DISCIPLINES.map((d) => (
            <div className="discipline-item" key={d.label}>
              <div className="icon">{d.icon}</div>
              <div>
                <h3>{d.label}</h3>
                <p>{d.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-section">
        <div className="eyebrow" style={{ textAlign: 'center' }}>● Pricing</div>
        <h2>The calculation is always free. Premium adds the rest.</h2>
        <PricingCards />
      </section>

      <section className="card home-cta">
        <div>
          <h2>Ready to engineer better?</h2>
          <p>
            The calculation is always free, with no paywall on the math. Create a free account to save your
            inputs and pick up where you left off.
          </p>
        </div>
        <Link to="/account" className="btn primary">Get started for free →</Link>
      </section>
    </div>
  );
}
