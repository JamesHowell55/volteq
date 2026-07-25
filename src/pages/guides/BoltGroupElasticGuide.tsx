import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('bolt-group-elastic')!;

export default function BoltGroupElasticGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What the elastic method is for</h2>
      <p>
        When a bracket is bolted down and loaded off-centre, the bolts don't share the load equally — the
        ones farthest from the load work hardest. The <b>elastic method</b> is the classic way to find how
        much force each bolt actually sees. It's the same treatment in Shigley's <em>Mechanical
        Engineering Design</em>, Blodgett's <em>Design of Weldments</em> (applied to weld groups), and the
        AISC Steel Construction Manual — and it's what lets you check the worst-loaded bolt against its
        strength rather than guessing.
      </p>

      <h2>The core idea: bolts as point areas</h2>
      <p>
        Every bolt is assumed identical and treated as a unit "point area" at its location. That's valid
        because a single bolt's own cross-section is tiny compared with how far the <em>pattern</em>
        spreads the bolts apart — so the group's geometry, not the individual bolt size, governs the force
        distribution. From the bolt coordinates you compute the pattern's centroid and its moments of
        inertia, and everything follows from those.
      </p>

      <h2>In-plane shear: direct + torsional</h2>
      <p>
        An in-plane load on a bolt group splits into two parts:
      </p>
      <ul>
        <li>
          <b>Direct shear</b> — the total force shared equally, F/n on every bolt.
        </li>
        <li>
          <b>Torsional shear</b> — if the force acts off the centroid, it also applies a twisting moment
          Mz. That's distributed by the polar moment of inertia J = Ixx + Iyy: each bolt gets
          <code> Mz·r/J</code>, perpendicular to its radius from the centroid, so bolts farther out carry
          more.
        </li>
      </ul>
      <p>
        The two components add as vectors at each bolt; the bolt with the largest resultant is the one to
        check. An off-centre load is first reduced to an equivalent force-plus-moment at the centroid
        (standard moment transfer) before distributing.
      </p>

      <h2>Out-of-plane moments: tension</h2>
      <p>
        A moment that tries to pry the bracket off the surface puts the bolts into tension, distributed by
        the general unsymmetric-bending formula. The rigorous version keeps the product of inertia Ixy, so
        it handles a genuinely <b>asymmetric</b> custom bolt layout correctly — many simplified treatments
        assume Ixy = 0 (principal axes aligned with the pattern), which only holds when the pattern is
        symmetric about an axis. The neutral axis is taken at the centroid, valid while the joint faces
        stay in contact (this is not a cracked-section concrete-anchor prying analysis).
      </p>

      <GuideDeepDive
        title="Combining shear + tension, preload & checklist"
        teaser="How the worst-bolt shear and tension combine into a von Mises check, how preload and the joint stiffness ratio enter, and a checklist for analysing a bolt pattern."
        feature="Bolt group deep dive"
      >
        <h3>Combining shear and tension</h3>
        <p>
          The critical bolt usually carries both shear (from in-plane load) and tension (from an
          out-of-plane moment). These combine via the distortion-energy (von Mises) criterion,
          <code> σ_vM = √(σ_tension² + 3·τ²)</code>, checked against the bolt's proof strength — the same
          convention as a single-bolt joint analysis, for consistency.
        </p>

        <h3>Where preload comes in</h3>
        <p>
          An external tension on a preloaded bolt doesn't add one-for-one — the clamped members share it.
          Bolt tension is <code>Fb = Fi + C·P</code>, where Fi is preload, P the external tension, and C
          the joint-stiffness ratio (≈0.2 for a typical steel joint without a soft gasket). The joint
          starts to separate when <code>Fi − (1−C)·P ≤ 0</code>. Use C = 1.0 for the most conservative
          "no stiffness credit" check, or compute an exact C from the specific clamped stack.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Lay out the bolt coordinates; compute the centroid and moments of inertia (keep Ixy for asymmetric patterns).</li>
          <li>Reduce any off-centre load to an equivalent force + moment at the centroid.</li>
          <li>Add direct and torsional shear as vectors; find the worst-loaded bolt.</li>
          <li>Distribute out-of-plane moments to bolt tension via unsymmetric bending.</li>
          <li>Combine shear + tension (with preload) and check the critical bolt against proof strength (von Mises).</li>
          <li>Remember the idealisations: rigid plates, linear-elastic, no fatigue/vibration/impact — add those checks separately.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
