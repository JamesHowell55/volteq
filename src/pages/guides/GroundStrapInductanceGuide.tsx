import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('ground-strap-inductance')!;

export default function GroundStrapInductanceGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>A "good ground" at DC can be a terrible one at RF</h2>
      <p>
        Measure a grounding strap or bonding jumper with a multimeter and it will read a fraction
        of an ohm — by DC resistance alone, it looks like an excellent connection. But EMC problems
        rarely live at DC. At any real frequency, what matters is impedance, not resistance, and a
        straight conductor's impedance is dominated by its self-inductance:
        <code> Z = 2π·f·L</code>. Because that grows directly with frequency, a strap that's
        essentially a short circuit at 60Hz can present tens of ohms at 100MHz — enough to
        completely defeat the purpose of the bond.
      </p>

      <h2>Where a straight conductor's inductance comes from</h2>
      <p>
        Even a straight length of wire or strap, with no coil or loop in sight, has self-inductance
        — the classical Grover/Terman result for a straight conductor's external inductance depends
        on its length and its cross-sectional geometry: a flat strap follows
        <code> L(nH) = 0.2·l·[ln(2l/(w+t)) + 0.2235·(w+t)/l + 0.5]</code> and a round wire follows
        <code> L(nH) = 0.2·l·[ln(4l/d) − 1]</code> (all dimensions in mm). Both share the same
        dominant behavior — inductance scales roughly with length and only logarithmically with
        cross-section — which is the key insight for grounding practice: <strong>length matters
        far more than how thick the conductor is.</strong>
      </p>

      <h2>Why straps beat wires</h2>
      <p>
        For the same length, a wide flat strap has meaningfully lower inductance than a round wire
        — because the logarithmic term depends on the conductor's width-plus-thickness rather than
        just its diameter, a strap with the same cross-sectional area as a wire, but spread wide and
        thin instead of round, presents noticeably less impedance. This is the physical basis for
        one of the most repeated pieces of EMC grounding advice: replace a wire "pigtail" with a
        flat strap wherever possible, and keep it as short as the installation allows.
      </p>

      <GuideDeepDive
        title="Why length dominates, and a bonding-strap design checklist"
        teaser="How much strap width actually helps (and where it stops helping), and a practical checklist for specifying an RF bonding strap."
        feature="Grounding strap inductance deep dive"
      >
        <h3>Width helps, but with diminishing returns</h3>
        <p>
          Because the strap's width and thickness only appear inside a logarithm, doubling a
          strap's width doesn't halve its inductance — it reduces it by a much smaller amount.
          Going from a 5mm-wide strap to a 20mm-wide strap (4×) typically only cuts inductance by
          roughly a third, not by a factor of four. That doesn't mean width is pointless — every
          bit of impedance reduction matters at RF — but it does mean chasing an ever-wider strap
          has rapidly diminishing returns, and length reduction is almost always the more effective
          lever if the installation allows it.
        </p>

        <h3>What this calculator doesn't include</h3>
        <p>
          This is the strap's own self-inductance only. A real bonding connection's total
          impedance also includes the loop it forms with whatever return path the current actually
          takes (which can dominate over the strap's own inductance if the loop area is large),
          contact/joint resistance at each end, and proximity effects from nearby conductors. Treat
          this number as one input to a bonding decision, not the complete picture of a real
          installation's RF performance.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Keep the strap as short as the physical installation allows — length has the strongest effect on inductance.</li>
          <li>Use a flat strap, not a round-wire pigtail, wherever the installation permits it.</li>
          <li>Check impedance (not just inductance) at your actual frequency of concern — the same strap that's fine at 1MHz may not be at 100MHz.</li>
          <li>Remember this covers the strap's own self-inductance only — a large return-current loop area can dominate the total bonding impedance regardless of strap geometry.</li>
          <li>For genuinely low-impedance RF bonding, consider multiple parallel straps or a solid conductive panel/gasket rather than relying on strap width alone.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
