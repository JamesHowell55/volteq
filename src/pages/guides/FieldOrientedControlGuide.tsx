import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('field-oriented-control')!;

export default function FieldOrientedControlGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>The problem field-oriented control solves</h2>
      <p>
        In a running PMSM, the three phase currents are sinusoids that shift constantly as the rotor
        turns — awkward to control directly. Field-oriented control (FOC) makes the motor behave like a
        simple DC machine by transforming those three time-varying phase currents into <b>two DC values
        that rotate with the rotor</b>: Id and Iq. Once you're in that rotor frame, torque control becomes
        almost trivial, which is why essentially every EV traction drive uses FOC.
      </p>

      <h2>The Clarke and Park transforms</h2>
      <p>
        Two coordinate changes get you there. The <b>Clarke</b> transform collapses the three phase
        currents into an equivalent two-axis (α, β) stationary vector. The <b>Park</b> transform then
        rotates that vector into the rotor's own frame using the measured rotor angle, giving Id and Iq.
        Using the amplitude-invariant convention (the standard in motor control), the d–q vector length
        equals the <em>peak</em> phase current: <code>|Is|_peak = √(Id² + Iq²)</code>, with
        <code> |Is|_rms = |Is|_peak / √2</code>. The current angle γ is measured from the d-axis (the
        rotor flux axis); many drives instead quote the advance angle β = γ − 90° from the q-axis.
      </p>

      <h2>Why split current into two axes?</h2>
      <p>
        Because the two axes do different jobs:
      </p>
      <ul>
        <li><b>Iq</b> (aligned with the q-axis, 90° from the magnets) produces torque against the magnet flux — the "useful" current.</li>
        <li><b>Id</b> (aligned with the rotor flux axis) doesn't make torque against the magnets directly; it's used to <em>weaken the field</em> at high speed, and to exploit reluctance in a salient machine.</li>
      </ul>
      <p>
        For a salient PMSM the torque is a magnet term plus a reluctance term:
      </p>
      <p>
        <code>T = (3/2)·p·[ λpm·Iq + (Ld − Lq)·Id·Iq ]</code>
      </p>
      <p>
        The first term is the permanent-magnet torque; the second only exists when the rotor is salient
        (Lq ≠ Ld) and is why an interior-PM motor can make torque from a <em>negative</em> Id.
      </p>

      <h2>MTPA: getting the most torque per amp</h2>
      <p>
        Since a salient machine makes torque from both terms, there's an optimal current angle that
        maximises torque for a given current magnitude — <b>maximum torque per ampere</b>. There's a
        closed-form d-axis solution for it, and it reduces to <code>Id = 0</code> for a non-salient
        (surface-PM) machine, where all the torque comes from Iq and the best strategy is simply to put
        all your current on the q-axis.
      </p>

      <GuideDeepDive
        title="Worked example, field weakening & checklist"
        teaser="A worked Id/Iq split for a target torque, why negative Id buys both reluctance torque and high-speed operation, and a checklist for choosing an operating point."
        feature="Field-oriented control deep dive"
      >
        <h3>Why the reluctance term wants negative Id</h3>
        <p>
          In an interior-PM machine Ld &lt; Lq, so (Ld − Lq) is negative. For the reluctance term
          (Ld − Lq)·Id·Iq to be <em>positive</em> (adding torque) with a positive torque-producing Iq, Id
          must be <b>negative</b>. So MTPA on a salient machine sits at a negative Id — you deliberately
          push current onto the d-axis to harvest reluctance torque. That same negative Id also opposes
          the magnet flux, which is exactly what you need for <b>field weakening</b> to run above base
          speed, where the back-EMF (ωe·λpm) would otherwise exceed the available bus voltage.
        </p>

        <h3>The limits that bound the operating point</h3>
        <ul>
          <li><b>Current limit</b> — |Is| = √(Id² + Iq²) can't exceed the inverter/motor rating; MTPA picks the best angle on that circle.</li>
          <li><b>Voltage limit</b> — at high speed the back-EMF eats the bus voltage; field weakening (more negative Id) keeps you controllable.</li>
          <li><b>Saturation</b> — real Ld, Lq and λpm vary with operating point, so a real drive uses characterised look-up tables, not fixed constants.</li>
        </ul>

        <h3>Checklist</h3>
        <ol>
          <li>Work in the amplitude-invariant d–q frame; remember |Is| is a peak, not RMS.</li>
          <li>For a surface-PM motor, use Id = 0 and all current on Iq.</li>
          <li>For an interior-PM motor, use the MTPA angle (negative Id) below base speed.</li>
          <li>Add more negative Id for field weakening once back-EMF approaches the bus voltage limit.</li>
          <li>Treat constant-inductance torque/back-EMF as first-order; use saturated LUT parameters for accuracy.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
