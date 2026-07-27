import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel';
import PricingCards from '../components/PricingCards';
import { ALL_CALCULATOR_LINKS } from '../lib/navCategories';
import busbarScreenshot from '../assets/hero/busbar-screenshot.png';
import dcLinkScreenshot from '../assets/hero/dc-link-screenshot1.png';
import beamScreenshot from '../assets/hero/beam-bending-screenshot1.png';

const PRINCIPLES = [
  { index: '01', icon: '∫', title: 'Physics, not guesswork', description: 'First-principles models with visible assumptions, intermediate values, and governing equations.' },
  { index: '02', icon: '✓', title: 'Traceable by default', description: 'Methods reference recognised standards and validation examples, so every result has a defensible basis.' },
  { index: '03', icon: '↻', title: 'Made for iteration', description: 'Move from an early estimate to a reviewable design record without rebuilding another spreadsheet.' },
];

const DISCIPLINES = [
  ['Electrical', 'Busbars, cable sizing, insulation, PCB traces'],
  ['Power electronics', 'SiC losses, DC-link capacitors, magnetics'],
  ['Thermal', 'Heatsinks, exchangers, temperature rise'],
  ['Mechanical', 'Beams, joints, seals, fits, stress'],
  ['Motors & control', 'Torque, power, speed, Id/Iq vectors'],
  ['Battery systems', 'Pack architecture, capacity, voltage sag'],
];

const PRODUCT_SHOTS = [
  { eyebrow: 'Electrical', title: 'Busbar thermal modelling', image: busbarScreenshot, className: 'shot-busbar' },
  { eyebrow: 'Power electronics', title: 'DC-link capacitor sizing', image: dcLinkScreenshot, className: 'shot-dclink' },
  { eyebrow: 'Mechanical', title: 'Beam response analysis', image: beamScreenshot, className: 'shot-beam' },
];

export default function Home() {
  const calculatorCount = ALL_CALCULATOR_LINKS.filter((link) => link.available).length;

  return (
    <div className="page home-page home-v3">
      <section className="v3-hero">
        <div className="v3-hero-grid">
          <div className="v3-hero-copy">
            <div className="v3-kicker"><span /> Engineering intelligence</div>
            <h1>Engineering decisions,<br /><em>made visible.</em></h1>
            <p>
              High-fidelity calculators for teams designing electrified systems. Model real constraints,
              interrogate every step, and turn first-principles analysis into work ready for review.
            </p>
            <div className="v3-actions">
              <Link to="/calculators" className="btn primary">Explore calculators <span>↗</span></Link>
              <Link to="/guides" className="v3-text-action">Read the methodology <span>→</span></Link>
            </div>
            <div className="v3-meta">
              <span><b>{calculatorCount}</b> live calculators</span>
              <span><b>47</b> technical routes</span>
              <span><b>6</b> disciplines</span>
            </div>
          </div>

          <div className="v3-stage">
            <svg className="v3-wave" viewBox="0 0 900 650" aria-hidden="true">
              {Array.from({ length: 16 }, (_, index) => (
                <path key={index} d={`M-80 ${560 + index * 5} C140 ${360 - index * 9} 345 ${650 - index * 7} 555 ${325 - index * 6} S800 ${120 + index * 4} 980 ${90 + index * 2}`} />
              ))}
            </svg>
            <div className="v3-stage-axis axis-x" /><div className="v3-stage-axis axis-y" />
            <div className="v3-stage-label label-a">SOLVE / VERIFY / EXPORT</div>
            <div className="v3-stage-label label-b">MODEL_01</div>
            <HeroCarousel />
            <div className="v3-stage-readout"><span>MODEL STATUS</span><b><i /> VALIDATED</b></div>
          </div>
        </div>
      </section>

      <section className="v3-trusted" aria-label="Trusted by engineers at">
        <span>Trusted by engineers at</span>
        <div className="v3-logo-space" aria-hidden="true" />
      </section>

      <section className="v3-intro v3-section">
        <div className="v3-section-label">The platform</div>
        <div className="v3-intro-copy">
          <h2>Move faster without<br />losing the engineering.</h2>
          <p>
            Volteq sits between a quick online calculator and a bespoke simulation. Fast enough for the
            design loop; rigorous enough to expose how the answer was reached.
          </p>
        </div>
      </section>

      <section className="v3-principles">
        {PRINCIPLES.map((principle) => (
          <article key={principle.index}>
            <div className="v3-principle-top">
              <span className="v3-index">{principle.index}</span>
              <div className="v3-principle-icon" aria-hidden="true">{principle.icon}</div>
            </div>
            <h3>{principle.title}</h3>
            <p>{principle.description}</p>
          </article>
        ))}
      </section>

      <section className="v3-showcase v3-section">
        <div className="v3-showcase-head">
          <div>
            <div className="v3-section-label">Inside the toolkit</div>
            <h2>One environment.<br />Multiple domains.</h2>
          </div>
          <p>Purpose-built models for the calculations that connect electrical, thermal, and mechanical design.</p>
        </div>
        <div className="v3-shot-stage">
          <div className="v3-shot-grid" aria-hidden="true" />
          {PRODUCT_SHOTS.map((shot) => (
            <article className={`v3-product-shot ${shot.className}`} key={shot.title}>
              <div className="v3-shot-caption"><span>{shot.eyebrow}</span><b>{shot.title}</b></div>
              <img src={shot.image} alt={`${shot.title} calculator interface`} />
            </article>
          ))}
        </div>
        <Link to="/calculators" className="v3-inline-link">View the complete calculator library <span>↗</span></Link>
      </section>

      <section className="v3-disciplines v3-section">
        <div className="v3-discipline-lead">
          <div className="v3-section-label">Coverage</div>
          <h2>Designed around the system—not the silo.</h2>
          <p>Explore the linked decisions behind modern EV, energy, and electromechanical products.</p>
        </div>
        <div className="v3-discipline-list">
          {DISCIPLINES.map(([title, description], index) => (
            <Link to="/calculators" key={title}>
              <span>0{index + 1}</span><b>{title}</b><p>{description}</p><i>↗</i>
            </Link>
          ))}
        </div>
      </section>

      <section className="v3-workflow v3-section">
        <div className="v3-section-label">From question to evidence</div>
        <div className="v3-workflow-line">
          <article><span>01</span><h3>Define</h3><p>Set geometry, materials, boundary conditions, and operating cases.</p></article>
          <article><span>02</span><h3>Solve</h3><p>Run a transparent engineering model with units carried through every step.</p></article>
          <article><span>03</span><h3>Interrogate</h3><p>Review derivations, sensitivities, diagrams, and validation references.</p></article>
          <article><span>04</span><h3>Document</h3><p>Save the calculation or export a clear, branded engineering record.</p></article>
        </div>
      </section>

      <section className="pricing-section v3-pricing v3-section">
        <div className="v3-pricing-head">
          <div><div className="v3-section-label">Pricing</div><h2>Serious tools.<br />Simple access.</h2></div>
          <p>The engineering calculation stays free. Premium adds continuity, collaboration, and presentation.</p>
        </div>
        <PricingCards />
      </section>

      <section className="v3-final-cta">
        <div className="v3-cta-lines" aria-hidden="true" />
        <div><div className="v3-kicker"><span /> Start building</div><h2>Make the next decision<br />with confidence.</h2></div>
        <Link to="/calculators" className="btn primary">Open the toolkit <span>↗</span></Link>
      </section>
    </div>
  );
}
