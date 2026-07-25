import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iso-6722')!;

export default function Iso6722Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What ISO 6722 is</h2>
      <p>
        ISO 6722 is the standard for <em>single-core road-vehicle cables</em> — the insulated wire used
        throughout a vehicle's electrical system, including the high-current battery, inverter and motor
        cabling in an EV powertrain. Its most-cited role in sizing is defining <b>temperature classes</b>:
        it grades a cable's insulation by the maximum continuous temperature it can withstand, from
        Class A (85 °C) up to Class H (250 °C).
      </p>

      <h2>Why the temperature class, not a current table, is what matters</h2>
      <p>
        The instinct from building wiring is to look up an ampacity table (like NEC Table 310). That's
        the wrong model for EV cabling. What physically limits the current is simple: the conductor heats
        up as current flows, and the <b>insulation must not exceed its rated temperature</b>. So the
        temperature class is the real constraint — it sets the ceiling, and the ampacity is whatever
        current brings the conductor up to that ceiling under the actual operating conditions.
      </p>
      <p>
        That's why a serious EV cable calculation comes from a <b>heat balance</b>, not a table lookup:
        at the rated current, the resistive heat generated in the conductor equals the heat the cable can
        shed to its surroundings. Balance the two and you get the steady-state conductor temperature; find
        the current that lands it exactly at the insulation's limit and you have the ampacity.
      </p>

      <h2>What goes into the heat balance</h2>
      <ul>
        <li>
          <b>Conductor heat generated</b> — I²R, using the <em>AC</em> resistance (skin effect raises the
          effective resistance at the motor drive's fundamental frequency; the standard IEC 60287-1-1
          skin-effect formula handles this).
        </li>
        <li>
          <b>Heat conducted out</b> through the insulation wall (a thermal resistance set by the wall
          thickness and the insulation's conductivity).
        </li>
        <li>
          <b>Heat shed from the surface</b> by natural convection and radiation. For a round cable the
          correct convection model is a horizontal cylinder (the Churchill–Chu correlation) — flat-plate
          correlations used for busbars don't apply to round wire.
        </li>
      </ul>
      <p>
        A note on the standard itself: ISO 6722's own numeric current-rating tables sit behind the
        paywalled standard text and aren't publicly reproducible, so a good tool computes ampacity from
        this physics rather than transcribing an unverifiable table — and anchors the maximum conductor
        temperature to the ISO 6722 class you select.
      </p>

      <h2>Bundling: cables cook each other</h2>
      <p>
        A wire run in free air sheds heat easily; the same wire buried in a thick harness bundle is
        surrounded by other warm cables and can't. That mutual heating <b>derates</b> the allowable
        current, often substantially. The widely-published NEC 310.15(B)(3)(a) adjustment factors (e.g. 3
        conductors → 1.00, 6 → 0.80, 30 → 0.45) are commonly reused as a disclosed approximation for this.
      </p>

      <GuideDeepDive
        title="Worked example & sizing checklist"
        teaser="How the ampacity heat balance plays out for a typical HV cable, the numbers that anchor it, and a checklist for sizing EV powertrain cable without over- or under-building it."
        feature="ISO 6722 deep dive"
      >
        <h3>The heat balance, concretely</h3>
        <p>
          Suppose an 80 °C conductor surface in 20 °C ambient air, 20 mm outer diameter. The Churchill–Chu
          horizontal-cylinder correlation gives a natural-convection coefficient of about
          <code> h = 8.06 W/m²K</code> — comfortably inside the textbook-typical 2–25 W/m²K range for
          natural convection in air. That coefficient, times the surface area and the surface-to-ambient
          temperature difference, is the convective heat shed; radiation adds to it. Set that total equal
          to I²R at the AC resistance and solve for the current that holds the conductor at the insulation
          class limit — that's the ampacity. Push the current higher and the conductor exceeds the class
          temperature; that's the failure the standard is protecting against.
        </p>

        <h3>Sizing checklist</h3>
        <ol>
          <li>Pick the conductor size (mm² or AWG) and the ISO 6722 temperature class of the insulation you'll actually use.</li>
          <li>Use the true operating ambient — under-hood and near-motor ambients are far above 20 °C and eat directly into ampacity.</li>
          <li>Use AC resistance (skin effect) at the drive's fundamental frequency for phase cables, not DC resistance.</li>
          <li>Apply a bundling derate for the number of current-carrying conductors in the harness.</li>
          <li>Check voltage drop separately — a cable can be thermally fine but still drop too much volts over a long run.</li>
          <li>Treat the result as a screening estimate; real harnesses are qualified by OEM test, not calculation alone.</li>
        </ol>

        <h3>Common mistakes</h3>
        <ul>
          <li><b>Using a building-wiring ampacity table</b> — wrong thermal environment, wrong assumptions for a powertrain harness.</li>
          <li><b>Sizing at 20 °C ambient</b> — a powertrain cable rarely lives at 20 °C; ampacity collapses as ambient rises toward the class limit.</li>
          <li><b>Ignoring bundling</b> — a cable rated fine in free air can overheat in the middle of a thick loom.</li>
          <li><b>Confusing temperature class with operating temperature</b> — the class is a ceiling, not the temperature the cable will run at.</li>
        </ul>
      </GuideDeepDive>
    </GuideLayout>
  );
}
