import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('vdi-2230')!;

export default function Vdi2230Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What VDI 2230 is</h2>
      <p>
        VDI 2230 is the German engineering guideline for the <em>systematic calculation of highly
        stressed bolted joints</em>. It's the reference most mechanical engineers cite when they need
        to defend a preload or torque number rather than just picking a value off a chart. Its central
        idea is that a bolted joint is a spring system: the bolt stretches, the clamped members
        compress, and the two share any external load in proportion to their stiffnesses.
      </p>

      <h2>The cone of compression</h2>
      <p>
        The hard part of a bolted joint is figuring out how stiff the <em>clamped members</em> are —
        the bolt is easy, but the plates don't compress uniformly. VDI 2230's model is the
        "cone of compression" (or frustum method): the clamping force spreads out from each bearing face
        into the material as a cone with roughly a 30° half-angle, so a truncated-cone (frustum) of
        material actually carries the load rather than the whole plate.
      </p>
      <p>
        The common textbook realization (Shigley's <em>Mechanical Engineering Design</em>) chains these
        frustums: a two-cone model for a standard nut-and-bolt joint, or a single cone for a tapped or
        threaded-insert joint. Each frustum's stiffness depends on its material, its thickness, and the
        bearing diameter it starts from. That member stiffness, combined with the bolt's own stiffness,
        is what tells you how much of an external load actually shows up as extra bolt tension versus
        being absorbed by relieving the clamp — the whole reason a preloaded joint survives fatigue.
      </p>

      <h2>Torque and preload: T = K · F · d</h2>
      <p>
        You can't measure preload directly with a torque wrench — you measure torque and <em>infer</em>
        preload. The relationship is captured by the nut factor equation:
      </p>
      <p>
        <code>T = K · F · d</code>
      </p>
      <p>
        where <code>T</code> is the tightening torque, <code>F</code> is the resulting preload,
        <code> d</code> is the nominal bolt diameter, and <code>K</code> is the "nut factor" — a lumped
        coefficient rolling up thread friction, under-head bearing friction, and thread geometry. For a
        typical lightly-lubricated steel joint (µ ≈ 0.15 on both thread and bearing), K works out to
        around 0.2, which is the value most torque tables implicitly assume.
      </p>
      <p>
        The critical, non-obvious consequence: <b>K is dominated by friction, not by the bolt.</b> Lubricate
        a joint and the same torque produces substantially more preload — a torque spec written for a dry
        joint will badly overtighten a lubricated one. This is the single most common way bolted joints get
        preload wrong.
      </p>

      <h2>Where the simplified method applies</h2>
      <ul>
        <li>
          The two-cone / single-cone model is an excellent <b>general-purpose estimate</b>, and matches
          full analysis well for ordinary stacks.
        </li>
        <li>
          On stacks with many plates of sharply different diameters, VDI 2230's own full multi-segment
          method can diverge from the simplified cones — treat the simple model as a screening tool there.
        </li>
        <li>
          Property-class strengths (ISO 898-1 / SAE J429), prevailing-torque nut values, and
          tightening-method scatter factors are representative values, not a substitute for your
          fastener supplier's certified data.
        </li>
      </ul>

      <GuideDeepDive
        title="Worked example, the K-factor & checklist"
        teaser="A worked torque↔preload round-trip, why the 0.215 K-factor lands where it does, and a checklist for specifying a joint that actually holds its preload."
        feature="VDI 2230 deep dive"
      >
        <h3>Worked example: preload ↔ torque round-trip</h3>
        <p>
          Take a joint tightened to 10,000 N of preload. With µ = 0.15 on both the thread and the bearing
          face, the cone-of-compression method and the torque relationship give about 25.8 N·m of tightening
          torque — and running that torque back through the inverse relationship returns exactly 10,000 N.
          The implied nut factor is K ≈ 0.215 in T = K·F·d, squarely inside the ~0.2 range Shigley documents
          for that friction regime. That round-trip consistency is the sanity check: if a tool's torque and
          preload don't invert cleanly, its friction model is off.
        </p>

        <h3>Why the K-factor lands near 0.2</h3>
        <p>
          The nut factor isn't a fudge — it decomposes into a thread-pitch (lead) term and two friction
          terms (thread and bearing). For a coarse-thread steel bolt at µ ≈ 0.15, the geometry and friction
          combine to ≈ 0.2. Change the friction and K moves proportionally, which is why the same bolt can
          need very different torques depending on its finish and lubrication.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Target a preload high enough that the external load never fully relieves the joint (typically 60–90% of proof load).</li>
          <li>Pick the friction coefficient for the <em>actual</em> surface condition — dry, lubricated, or coated — not a generic default.</li>
          <li>Compute member stiffness with the cone method, not by assuming the whole plate compresses.</li>
          <li>Check both the bolt and the clamped members against yield at full preload plus external load.</li>
          <li>Verify thread engagement length — too little and the threads strip before the bolt reaches preload.</li>
          <li>Account for tightening-method scatter (αA): a torque wrench has far more preload spread than angle or stretch control.</li>
        </ol>

        <h3>Common mistakes</h3>
        <ul>
          <li><b>Reusing a dry-joint torque on a lubricated bolt</b> — the classic overtightening failure.</li>
          <li><b>Ignoring embedding/relaxation</b> — soft surfaces and coatings lose preload after assembly.</li>
          <li><b>Under-preloading to "be safe"</b> — a loose joint fatigues far faster than a properly preloaded one.</li>
        </ul>
      </GuideDeepDive>
    </GuideLayout>
  );
}
