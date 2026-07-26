import { useEffect, useState } from 'react';
import busbarScreenshot from '../assets/hero/busbar-screenshot.png';
import dcLinkScreenshot from '../assets/hero/dc-link-screenshot.png';
import harnessBundleScreenshot from '../assets/hero/harness-bundle-screenshot.png';
import beamBendingScreenshot from '../assets/hero/beam-bending-screenshot.png';
import speedTorquePowerScreenshot from '../assets/hero/speed-torque-power-screenshot.png';

const ROTATE_MS = 4500;

// Real screenshots of real calculators (never a fake mockup UI), cycled in a
// tilted "window card" frame — the same trust-through-honesty reasoning as
// the single-screenshot version this replaces, just with more variety.
const SLIDES = [
  { title: 'Busbar Temperature & Ampacity Calculator', image: busbarScreenshot },
  { title: 'DC-Link Capacitor Sizing', image: dcLinkScreenshot },
  { title: 'Harness Bundle Diameter Calculator', image: harnessBundleScreenshot },
  { title: 'Beam Bending Calculator', image: beamBendingScreenshot },
  { title: 'Speed ↔ Torque ↔ Power Calculator', image: speedTorquePowerScreenshot },
];

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  const slide = SLIDES[index];

  return (
    <div
      className="hero-mockup"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hero-mockup-bar">
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-title">{slide.title}</span>
      </div>
      <img
        key={slide.image}
        src={slide.image}
        alt={`Volteq's ${slide.title} showing a solved result`}
        className="hero-mockup-img"
      />
      <div className="hero-mockup-nav">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            className={i === index ? 'active' : ''}
            aria-label={`Show ${s.title}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
