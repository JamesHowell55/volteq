import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iso-281')!;

export default function Iso281Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What a bearing rating actually promises</h2>
      <p>
        A rolling bearing doesn't have a single "load it can take". Roll the same load through it long enough
        and the races eventually fail by <b>rolling-contact fatigue</b> — tiny cracks under the surface that
        spall into a pit. The question is never "will it hold?" but "how long will it last?" — and because
        fatigue is statistical, even that has to be a probability. <b>ISO 281</b> is the standard that turns
        a load and a speed into a life, and it's the number stamped implicitly into every bearing catalogue's
        dynamic load rating <code>C</code>.
      </p>

      <h2>L10 and the C/P law</h2>
      <p>
        The headline result is the <b>basic rating life</b>, written L<sub>10</sub>: the number of revolutions
        (in millions) that 90% of a large batch of identical bearings will reach before the first sign of
        fatigue. The 10 means 10% are <em>allowed</em> to have failed by then — it is a design target, not a
        guarantee for any single bearing. It comes from a simple power law:
      </p>
      <p style={{ textAlign: 'center' }}>
        <code>L₁₀ = (C / P)ᵖ</code>
      </p>
      <p>
        <code>C</code> is the bearing's <b>dynamic load rating</b> (the load that would give exactly one
        million revolutions of L<sub>10</sub> life — a catalogue number), <code>P</code> is the actual
        <b> equivalent load</b> the bearing sees, and the exponent <code>p</code> is <b>3 for ball bearings</b>
        and <b>10/3 for roller bearings</b>. That exponent is why bearing life is so sensitive to load:
        halving the load on a ball bearing multiplies life by 2³ = 8. To get hours from revolutions you just
        divide by the speed: <code>L₁₀ₕ = 10⁶·L₁₀ / (60·n)</code>, with n in rpm.
      </p>

      <h2>Equivalent load: P = X·Fr + Y·Fa</h2>
      <p>
        Real bearings rarely see pure radial load. A bearing carrying both a radial force F<sub>r</sub> and an
        axial (thrust) force F<sub>a</sub> is rated on an <b>equivalent dynamic load</b> — the pure radial load
        that would do the same fatigue damage:
      </p>
      <p style={{ textAlign: 'center' }}>
        <code>P = X·Fr + Y·Fa</code>
      </p>
      <p>
        The factors X and Y depend on the bearing type and on how much thrust it's carrying relative to its
        capacity. Below a threshold ratio <code>e</code>, a small amount of thrust is essentially free
        (X = 1, Y = 0, so P = F<sub>r</sub>); above it, the thrust starts to count and X drops while Y rises.
        A deep-groove ball bearing's e and Y even slide with the ratio f₀·F<sub>a</sub>/C₀; an angular-contact
        bearing's factors depend on its contact angle. Bearing types that can't react thrust at all (plain
        cylindrical and needle rollers) simply take P = F<sub>r</sub> and need a separate locating bearing for
        the axial load.
      </p>

      <h2>The other check: static safety</h2>
      <p>
        Fatigue life is about <em>motion</em>. A bearing also has to survive <em>standing still</em> under a
        peak or shock load without the rolling elements brinelling (denting) the races. That's a separate
        check against the <b>static load rating</b> C₀: the static safety factor <code>s₀ = C₀ / P₀</code>,
        where P₀ is the equivalent <em>static</em> load. Typical targets are around 1–2 for smooth running,
        higher for shock; roller bearings (line contact) are held to a higher target than ball bearings
        (point contact). A bearing can easily pass its life target and still fail this one under a rare peak.
      </p>

      <h2>Speed and lubrication set the real ceiling</h2>
      <p>
        L<sub>10</sub> assumes the bearing is properly lubricated. In practice the <b>speed</b> is what caps a
        selection: every catalogue lists a <b>limiting speed</b>, and the speed factor <code>n·d<sub>m</sub></code>
        (speed × mean diameter) has to sit inside the band the chosen lubrication method allows — grease for
        low-to-moderate, oil for higher, with cooling for the extreme end. Housing temperature limits the
        grease and the seals, and a shaft running much hotter than the housing eats into the bearing's
        internal clearance through differential expansion — enough to preload and cook a bearing that passes
        every load check on paper. These are the limits that usually decide the design, not the fatigue sum.
      </p>

      <GuideDeepDive
        title="Worked selection & a design checklist"
        teaser="How the C/P law runs backwards to pick a bearing for a target life, why the plain-bush PV method is a completely different animal, and a checklist for a selection that survives in service — not just on the fatigue sum."
        feature="ISO 281 deep dive"
      >
        <h3>Sizing backwards from a target life</h3>
        <p>
          Selection inverts the rating law. Fix a target life in hours, convert it to millions of revolutions
          at the operating speed, and solve for the <b>required</b> dynamic rating:
          <code> C_req = P·(L₁₀)^(1/p)</code>. Then walk the catalogue for the chosen type from the smallest
          bore that fits the shaft, and take the first bearing whose C exceeds C<sub>req</sub> <em>and</em>
          whose C₀ passes the static check. That order matters — sort by capacity alone and you can end up
          proposing an oversized-bore bearing for a small shaft. An application/shock factor inflates P before
          sizing, and the ISO 281 reliability factor a₁ adjusts the life if you need better than 90% (a₁ &lt; 1
          for higher reliability).
        </p>

        <h3>Plain bushes play by different rules</h3>
        <p>
          A plain (sleeve) bush has no rolling fatigue, so ISO 281 doesn't apply at all. It's sized by the
          <b> pressure-velocity (PV) method</b>: the projected bearing pressure P = F<sub>r</sub>/(d·L), the
          rubbing velocity V = π·d·n/60000, and their product PV, each checked against the bush material's
          limits. Exceed the pressure limit and it extrudes; exceed velocity and it overheats; exceed PV and
          it wears out. A longer bush (higher L/d) spreads load and drops the pressure — but too long
          edge-loads under shaft deflection.
        </p>

        <h3>Selection checklist</h3>
        <ol>
          <li>Resolve the real radial and axial loads at the bearing location, and the operating speed.</li>
          <li>Pick a bearing type suited to the thrust: deep-groove or angular-contact ball for combined loads, cylindrical/needle roller for heavy radial-only, tapered/spherical roller for heavy combined.</li>
          <li>Set a target L₁₀ life (hours) and reliability, apply a shock factor, and size C_req = P·(L₁₀)^(1/p).</li>
          <li>Check the static safety factor s₀ = C₀/P₀ against a target for the duty (higher for shock and roller bearings).</li>
          <li>Confirm the speed factor n·dm and the catalogue limiting speed suit the lubrication method, and the housing temperature suits the grease and seals.</li>
          <li>Check the shaft-to-housing temperature difference won't close the internal clearance; step up the clearance class (C3/C4) if it will.</li>
          <li>Confirm the final designation's dimensions, ratings and clearance against the current manufacturer datasheet before production.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
