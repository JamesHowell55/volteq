import screenshot from '../assets/hero/speed-torque-power-screenshot.png';

// A real screenshot of a real calculator (not a fake mockup UI) — framed as a
// tilted window card for the landing page hero. Deliberately a genuine product
// screenshot rather than an illustrative graphic, consistent with the "show
// your work" trust positioning the rest of the site leads with.
export default function HeroCalculatorMockup() {
  return (
    <div className="hero-mockup">
      <div className="hero-mockup-bar">
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-dot" />
        <span className="hero-mockup-title">Speed ↔ Torque ↔ Power Calculator</span>
      </div>
      <img
        src={screenshot}
        alt="Volteq's Speed, Torque and Power calculator showing a solved result"
        className="hero-mockup-img"
      />
    </div>
  );
}
