import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('sic-inverter-loss')!;

export default function SicInverterLossGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why inverter loss is worth getting right</h2>
      <p>
        The losses in a traction inverter's power devices set two things that dominate an EV powertrain's
        design: the <b>efficiency</b> (range) and the <b>cooling</b> (how big and heavy the heatsink and
        coolant loop have to be). Getting the loss estimate right early tells you whether a given SiC
        device, paralleling, and switching frequency will stay inside its junction-temperature limit — or
        cook. The losses split into a few distinct mechanisms, each with its own scaling.
      </p>

      <h2>Conduction loss</h2>
      <p>
        When a SiC MOSFET is on, it behaves like a resistor: it drops <code>I·R_ds(on)</code> and
        dissipates <code>I²·R_ds(on)</code>. Two things to respect. First, R_ds(on) rises significantly
        with junction temperature, so conduction loss and temperature chase each other and you have to
        iterate. Second, running synchronous rectification (the normal way to run SiC — channel conducts
        in both directions instead of the body diode) makes the total conduction loss symmetric between
        motoring and generating; the motor/generator distinction only shows up explicitly when sync rect
        is off and the body diode carries part of the current.
      </p>

      <h2>Switching loss</h2>
      <p>
        Every turn-on and turn-off dissipates a packet of energy while voltage and current overlap during
        the transition. Datasheets give these as Eon/Eoff at a test point, and they scale two ways:
        <b> linearly with the switched current</b>, and with voltage by
        <code> (V_dc / V_test)^kv</code>. Total switching loss is that energy times the switching
        frequency — which is why raising f_sw for smaller passives directly buys you more switching loss.
        A useful SiC fact: Eon/Eoff barely change with junction temperature (unlike silicon IGBTs), so
        they're treated as temperature-independent.
      </p>

      <h2>Reverse-recovery loss</h2>
      <p>
        When the opposing device turns on, it has to sweep out the charge stored in the freewheeling
        device's diode — reverse recovery. SiC's big advantage over silicon is how <em>small</em> this
        is. It's taken from the datasheet Err where published, or approximated as
        <code> Q_rr·V_dc / 4</code> for a soft-recovery device.
      </p>

      <h2>What doesn't heat the die</h2>
      <p>
        Gate-drive loss is real power, but it's dissipated in the driver and gate resistors, not the
        silicon — so it's excluded from the junction-temperature solve (though it still matters for the
        gate-drive supply budget).
      </p>

      <GuideDeepDive
        title="The junction-temperature loop & sizing checklist"
        teaser="How conduction, switching and recovery losses feed a thermal solve that chases its own tail, what paralleling and switching frequency do, and a checklist for sizing a SiC inverter stage."
        feature="SiC inverter loss deep dive"
      >
        <h3>The loss ↔ temperature loop</h3>
        <p>
          Total device loss = conduction + switching + reverse recovery. That power times the
          junction-to-case (and case-to-coolant) thermal resistance gives the junction temperature rise
          above coolant. But conduction loss depends on R_ds(on), which depends on that very temperature —
          so the solve iterates: guess a temperature, compute losses, get a new temperature, repeat until
          it settles. If it settles below the device's T_vj,max with margin, the design is thermally
          viable; if it runs away, you need a bigger device, more parallel devices, lower f_sw, or better
          cooling.
        </p>

        <h3>The levers</h3>
        <ul>
          <li><b>Paralleling devices</b> — splits the current, cutting conduction loss per device roughly with the square of the count; the main way to raise current capability.</li>
          <li><b>Switching frequency</b> — trades directly against switching loss; higher f_sw shrinks the DC-link cap and filter but heats the devices.</li>
          <li><b>Operating point</b> — the worst case for the devices isn't always peak power; check across the drive cycle.</li>
        </ul>

        <h3>Checklist</h3>
        <ol>
          <li>Sum conduction (I²·R_ds(on), temperature-dependent), switching (Eon/Eoff × f_sw, current- and voltage-scaled), and reverse-recovery loss.</li>
          <li>Iterate the junction temperature until R_ds(on) and losses are self-consistent.</li>
          <li>Confirm the settled T_vj is below the datasheet maximum with margin, at the worst operating point.</li>
          <li>Use paralleling and/or f_sw to bring it in range; re-check the DC-link and filter impact of any f_sw change.</li>
          <li>Transcribe real datasheet loss parameters before trusting absolute numbers — verify critical designs by double-pulse and calorimetric test.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
