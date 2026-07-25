import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('mohrs-circle')!;

export default function MohrsCircleGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>The problem Mohr's circle solves</h2>
      <p>
        At a point in a loaded part, the stress you calculate depends on the orientation of the plane you
        look at. The same point can show pure shear on one plane and pure tension on another rotated 45°.
        The question a strength check really needs answered is: across <em>all</em> orientations, what are
        the <b>largest normal stress</b> and the <b>largest shear stress</b>? Mohr's circle is the
        graphical answer — and the plane-stress transformation equations are the algebra behind it.
      </p>

      <h2>From a stress state to a circle</h2>
      <p>
        A 2-D (plane) stress state is three numbers: σx, σy, and the shear τxy. Plot the two faces as
        points — the x-face at (σx, τxy) and the y-face at (σy, −τxy) — and they turn out to be the ends
        of a diameter of a circle on a normal-stress (horizontal) vs shear (vertical) plot. That circle is
        centred at the average normal stress and has a radius equal to the maximum shear:
      </p>
      <ul>
        <li>Centre: <code>σ_avg = (σx + σy) / 2</code></li>
        <li>Radius: <code>R = √[((σx − σy)/2)² + τxy²]</code></li>
      </ul>
      <p>
        Everything else is read straight off the circle. Rotating the physical element by an angle θ
        corresponds to rotating <em>twice</em> that angle (2θ) around the circle — the factor-of-two
        relationship that makes the construction work.
      </p>

      <h2>What you read off it</h2>
      <ul>
        <li>
          <b>Principal stresses</b> — the max and min normal stresses, where the circle crosses the
          horizontal axis: <code>σ1,2 = σ_avg ± R</code>. On these planes the shear is zero. Their
          orientation is <code>θp = ½·atan2(2τxy, σx − σy)</code>, and the two principal planes are 90°
          apart.
        </li>
        <li>
          <b>Maximum in-plane shear</b> — equals the radius R, on planes 45° from the principal planes,
          where the normal stress is σ_avg.
        </li>
        <li>
          <b>Stresses on any rotated plane</b> — just another point on the circle.
        </li>
      </ul>

      <h2>The subtlety simpler calculators get wrong</h2>
      <p>
        Because this is a <em>plane</em>-stress state, the third principal stress is zero. The
        <b> absolute</b> maximum shear is taken over the full set {'{'}σ1, σ2, 0{'}'} — not just σ1 and σ2.
        When σ1 and σ2 have the <b>same sign</b> (e.g. both tensile), the governing shear plane is
        out-of-plane, involving that zero third stress, and the absolute max shear is <em>larger</em> than
        the in-plane value. Miss this and you underestimate the shear that actually drives yielding.
      </p>

      <GuideDeepDive
        title="Worked example & how to use it for a strength check"
        teaser="A worked transformation from a stress state to principal stresses and von Mises, the absolute-vs-in-plane shear trap in numbers, and how to turn the circle into a factor of safety."
        feature="Mohr's Circle deep dive"
      >
        <h3>From stresses to a yield check</h3>
        <p>
          Mohr's circle gives you the principal stresses; a strength check turns them into an equivalent
          stress to compare against the material's allowable. Two common criteria:
        </p>
        <ul>
          <li><b>von Mises</b> (ductile metals): the plane-stress form <code>√(σ1² − σ1·σ2 + σ2²)</code>.</li>
          <li><b>Tresca</b> (more conservative): σmax − σmin over the full principal set {'{'}σ1, σ2, 0{'}'}.</li>
        </ul>
        <p>
          Divide the material yield by the equivalent stress and you have the factor of safety. The point:
          the circle is the geometry, but the equivalent stress is what you actually design to.
        </p>

        <h3>The same-sign shear trap, in numbers</h3>
        <p>
          Take σ1 = 100 MPa, σ2 = 40 MPa (both tensile). The in-plane maximum shear is
          (σ1 − σ2)/2 = 30 MPa. But the absolute maximum shear, using the zero third principal, is
          (σ1 − 0)/2 = <b>50 MPa</b> — 67% higher, and on an out-of-plane plane. For a shear-driven
          failure criterion, the 50 MPa is what governs. If σ1 and σ2 had opposite signs, the in-plane
          value would already be the absolute one.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Get a consistent sign convention (tension positive; τxy positive on the +x face acting in +y).</li>
          <li>Compute centre and radius; read principal stresses and their orientation.</li>
          <li>For shear-based checks, use the absolute max shear over {'{'}σ1, σ2, 0{'}'}, not just the in-plane value.</li>
          <li>Form the von Mises or Tresca equivalent and compare to the allowable with a safety factor.</li>
          <li>Remember the idealisations: linear-elastic, isotropic, true plane stress, no stress concentrations.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
