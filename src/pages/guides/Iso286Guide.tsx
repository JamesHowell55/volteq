import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iso-286')!;

export default function Iso286Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What an interference fit is</h2>
      <p>
        An interference (press or shrink) fit joins a shaft into a hub by making the shaft <em>slightly
        bigger</em> than the hole. Forced together, the two elastically deform against each other and the
        resulting contact pressure holds them by friction alone — no key, no adhesive. Designing one is a
        balance: enough interference to transmit the load without slipping, but not so much that the
        contact pressure over-stresses the hub. Two standards do the work — <b>ISO 286</b> sets the
        interference, and <b>Lamé thick-cylinder theory</b> turns it into stress.
      </p>

      <h2>ISO 286: where the interference comes from</h2>
      <p>
        You don't machine parts to an exact size — you machine them to a tolerance band. ISO 286 is the
        system of those bands: a <b>letter</b> giving the position of the band relative to nominal (H for
        a hole starting at nominal, and shaft letters like p, r, s, u sitting progressively above nominal)
        and a <b>number</b>, the IT grade, giving the band's width. So an "H7/s6" fit means a nominal-based
        hole (H7) and an interference shaft (s6) that always ends up larger than the hole — guaranteeing
        interference across the whole tolerance range.
      </p>
      <p>
        The actual interference isn't a single number; it's a <b>range</b>. The tightest case stacks the
        largest shaft against the smallest hole; the loosest stacks the smallest shaft against the largest
        hole. A real design has to work at both ends: enough grip at the loose end, acceptable stress at
        the tight end.
      </p>

      <h2>Lamé theory: interference → pressure → stress</h2>
      <p>
        Given the interference, Lamé's thick-walled-cylinder equations give the contact pressure. The
        interference is shared between the hub expanding outward and the shaft compressing inward, each
        according to its stiffness (modulus, diameters, Poisson's ratio) — the standard treatment in
        Shigley's <em>Mechanical Engineering Design</em>. From the pressure you get the stresses: a solid
        shaft sits under near-uniform hydrostatic compression (σr = σθ = −p), while a hollow shaft or the
        hub sees its <b>highest stress at the bore</b>, where the hoop stress peaks — that's the location
        to check against yield. The same pressure also sets the axial insertion force,
        <code> F = π·f·p·d·L</code>.
      </p>

      <h2>The failure mode people forget: temperature</h2>
      <p>
        If the shaft and hub are different materials, they expand at different rates. Heating the joint can
        <b>lose the fit entirely</b> if the hub grows faster than the shaft (interference goes to zero —
        the part spins), or <b>over-stress</b> it at the cold extreme if the shaft grows faster. The shift
        is <code>d·(α_shaft − α_hub)·(T − 20 °C)</code>, and a proper check evaluates the fit at assembly,
        operating, and storage temperatures — not just at 20 °C.
      </p>

      <GuideDeepDive
        title="Worked example & design checklist"
        teaser="How the interference range turns into a pressure and a bore stress, the shrink-fit assembly trick, and a checklist for a fit that grips without cracking the hub."
        feature="ISO 286 deep dive"
      >
        <h3>The two ends of the tolerance stack</h3>
        <p>
          Work the loosest interference through Lamé and you get the minimum contact pressure — check that
          it gives enough friction grip (holding torque or axial force) with margin. Work the tightest
          interference through and you get the maximum bore hoop stress — check that against the hub's
          yield with a safety factor. A fit only passes if <em>both</em> ends are acceptable
          simultaneously; that's why interference fits are specified as a class, not a single number.
        </p>

        <h3>The shrink-fit assembly trick</h3>
        <p>
          Pressing a tight fit cold needs large force and can gall the surfaces. Instead, heat the hub (or
          chill the shaft) so thermal expansion opens the interference, drop the parts together with no
          force, and let them return to temperature to lock in the grip. The same differential-expansion
          math that's a <em>failure</em> mode in service is the <em>assembly</em> method here.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Pick an ISO 286 fit class that guarantees interference across the whole tolerance range (e.g. H7/s6).</li>
          <li>Check minimum grip at the loosest interference and maximum bore stress at the tightest.</li>
          <li>Keep the peak hub-bore hoop stress below yield with a safety factor (brittle hubs: use compressive strength, treat advisory).</li>
          <li>Evaluate the fit across assembly / operating / storage temperatures — confirm it's never lost and never over-stressed.</li>
          <li>Size the insertion force (or plan a shrink/chill assembly) from the assembly-temperature pressure.</li>
          <li>Confirm against the real holding-force, torque and fatigue requirements before production.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
