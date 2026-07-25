import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('euler-bernoulli-beams')!;

export default function EulerBernoulliBeamsGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What beam bending theory gives you</h2>
      <p>
        Load a beam and you want to know four things along its length: the <b>reactions</b> at the
        supports, the <b>shear force</b>, the <b>bending moment</b>, and the <b>deflection</b>. The bending
        moment tells you the stress (and whether it yields); the deflection tells you whether it's stiff
        enough. Euler–Bernoulli beam theory is the standard framework that produces all four, and it's what
        the tabulated formulas in Roark's <em>Formulas for Stress and Strain</em> are built on.
      </p>

      <h2>The Euler–Bernoulli assumptions</h2>
      <p>
        The theory is simple because it assumes a lot — and knowing the assumptions is knowing when it
        applies:
      </p>
      <ul>
        <li><b>Prismatic</b> — uniform cross-section along the length.</li>
        <li><b>Linear-elastic</b> — stress proportional to strain, no yielding.</li>
        <li><b>Small deflections</b> — the beam bends a little, not into a big curve.</li>
        <li><b>Plane sections remain plane</b> — a flat cross-section stays flat and perpendicular to the beam axis as it bends (this is what neglects shear deformation — fine for slender beams, less so for short deep ones).</li>
      </ul>

      <h2>The shear → moment → deflection chain</h2>
      <p>
        The four quantities are linked by integration. Start from the distributed load, integrate to get
        shear, integrate again for bending moment, then the deflection comes from double-integrating
        <code> M(x)/EI</code> (moment over the bending stiffness — E is the material's modulus, I the
        section's second moment of area). So a stiffer material or a deeper section (bigger EI) bends less
        for the same moment. This chain is exactly why the bending stress depends on the section shape
        through I, and the deflection depends on it again.
      </p>

      <h2>Determinate vs indeterminate beams</h2>
      <p>
        The solution method depends on whether statics alone can find the reactions:
      </p>
      <ul>
        <li>
          <b>Statically determinate</b> (simply supported, cantilever, overhanging) — the support reactions
          come straight from force and moment equilibrium. Solvable by hand.
        </li>
        <li>
          <b>Statically indeterminate</b> (fixed-fixed, propped cantilever) — there are more supports than
          equilibrium equations, so you need an extra condition: the deflection or slope at a redundant
          support must be zero. That compatibility requirement, solved by the force (flexibility) method
          using virtual work, closes the problem.
        </li>
      </ul>

      <GuideDeepDive
        title="Worked reasoning, section choice & checklist"
        teaser="Why the same load deflects a beam 16× more as a cantilever than simply supported, how to pick a section for stiffness vs strength, and a checklist for a beam check."
        feature="Beam theory deep dive"
      >
        <h3>Support conditions matter enormously</h3>
        <p>
          The same point load at midspan produces very different results depending on the supports. A
          cantilever with an end load deflects far more than the same beam simply supported — deflection
          scales with the cube of the effective length, so how the ends are held dominates the answer.
          This is why "will it be stiff enough?" almost always comes down to the support condition and the
          span before the section even matters.
        </p>

        <h3>Choosing a section: strength vs stiffness</h3>
        <p>
          Bending stress is <code>M·c/I</code> and deflection scales with <code>1/(E·I)</code>. Both
          improve with a larger second moment of area I — which rewards putting material <em>far</em> from
          the neutral axis (why I-beams and tubes are efficient). But strength cares about I/c (the section
          modulus) while stiffness cares about I alone, so a section optimised for one isn't automatically
          best for the other. Decide which governs — a floor beam is usually deflection-limited, a
          highly-stressed bracket strength-limited.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Confirm the beam is slender and elastic — Euler–Bernoulli understates deflection for short, deep beams (shear matters there).</li>
          <li>Get the support condition right first; it dominates both moment and deflection.</li>
          <li>Find the maximum bending moment and check the stress (M·c/I) against the allowable with a safety factor.</li>
          <li>Check the maximum deflection against the serviceability limit (often a span fraction like L/360).</li>
          <li>For indeterminate beams, trust a compatibility-based solution (or a validated tool), not statics alone.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
