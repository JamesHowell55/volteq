import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('dc-link-ripple')!;

export default function DcLinkRippleGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why the DC-link capacitor exists</h2>
      <p>
        In a three-phase inverter, the switches chop the DC bus into PWM pulses at the switching
        frequency. That switching draws a violently pulsating current from the DC side, but the battery
        (through its cabling inductance) can't supply a fast-changing current cleanly. The <b>DC-link
        capacitor</b> bridges the gap: it sources and sinks the high-frequency ripple current locally, so
        the bus voltage stays stiff and the pulses don't propagate back up the cable. Sizing that
        capacitor is really about two things — the <b>ripple current</b> it has to carry (which drives
        heating and life) and the <b>peak voltage</b> it must withstand.
      </p>

      <h2>The ripple current — and the Kolar &amp; Round formula</h2>
      <p>
        The hard part is knowing how much RMS ripple current the capacitor actually sees, because it
        depends on the operating point: the load current, the power factor, and the modulation index (how
        deep the PWM is driving toward full output). Kolar &amp; Round published a <b>closed-form
        expression</b> for exactly this (IEE Proc. Electr. Power Appl., 2006) — the RMS DC-link capacitor
        current for a three-phase voltage-source PWM inverter with sinusoidal output current and a
        constant DC-link voltage. It replaces a full switching simulation with one equation.
      </p>
      <p>
        The key result to carry in your head: the ripple current <b>peaks near a modulation index of
        M ≈ 0.6</b>, at roughly <b>0.6–0.65 × the RMS phase current</b>. So the worst case for capacitor
        heating isn't at full modulation — it's partway up. Sizing for full-modulation ripple alone can
        under-size the capacitor for the operating point that actually cooks it.
      </p>

      <h2>The peak voltage: ripple pushes the rating up</h2>
      <p>
        A film DC-link capacitor's rated voltage is a <b>peak</b> limit for the (non-reversing) DC
        waveform — datasheets state the peak voltage must not exceed the rated voltage. So the governing
        voltage isn't the DC bus alone, it's:
      </p>
      <p>
        <code>V_peak = V_bus + ½·ΔV_pp</code>
      </p>
      <p>
        the bus plus half the peak-to-peak ripple. The ripple pushes the required voltage rating up. Two
        more effects tighten it: above ~85 °C the permissible voltage <em>derates</em> (down to roughly
        0.7× rated at 105 °C), and a fast switching turn-off adds a repetitive overshoot spike
        (<code>ΔV = L_loop·di/dt</code>) on top — which, because it repeats every cycle, also has to stay
        inside the rating.
      </p>

      <h2>What actually sizes the capacitance</h2>
      <p>
        The required capacitance is the larger of two constraints:
      </p>
      <ul>
        <li>
          <b>Switching-ripple-voltage limit</b> — enough capacitance that the ripple current at the
          switching frequency doesn't produce more than your allowed ripple voltage
          (<code>C = I_C,rms / (2π·f_sw·V_rip,rms)</code>).
        </li>
        <li>
          <b>Source-decoupling minimum</b> — enough capacitance to keep the resonance between the cable
          inductance and the capacitor <em>below</em> the switching frequency
          (<code>C ≥ 1 / (L_cable·(2π·f_sw)²)</code>), so the harness doesn't ring.
        </li>
      </ul>

      <GuideDeepDive
        title="Worked example, thermal life & checklist"
        teaser="Where the ripple actually peaks across modulation index, how ESR turns ripple into a hot-spot temperature and a lifetime, and a checklist for specifying a DC-link bank."
        feature="DC-link ripple deep dive"
      >
        <h3>Where the ripple peaks</h3>
        <p>
          Sweep the modulation index from 0 to 1 with the phase current fixed and the Kolar &amp; Round
          expression traces a hump: the RMS capacitor current rises, peaks around M ≈ 0.6 at about
          0.6–0.65 × the RMS phase current, then falls again toward full modulation. Size the bank's
          current rating for that peak, not for the M = 1 endpoint — otherwise the capacitor runs hottest
          exactly where you didn't design for it.
        </p>

        <h3>From ripple current to temperature and life</h3>
        <p>
          The ripple current dissipates power in the capacitor's equivalent series resistance:
          <code> P = ESR·I²</code>, shared across the parallel bank. That power times the thermal
          resistance gives the hot-spot rise <code>ΔT = ESR·I²·R_th</code>. Life then follows a film-cap
          model anchored to the datasheet — roughly halving every ~15 °C of hot-spot temperature, with a
          strong voltage-acceleration factor (on the order of (V_rated/V_applied)⁷). Two levers fall out:
          run the bank cool, and run it below its rated voltage — continuous operation at ≤0.8× rated
          greatly extends life.
        </p>

        <h3>Sizing checklist</h3>
        <ol>
          <li>Compute ripple current with Kolar &amp; Round across the operating range and take the peak (near M ≈ 0.6), not full modulation.</li>
          <li>Size voltage for V_peak = V_bus + ½·ΔV_pp, then derate for temperature and add the switching overshoot spike.</li>
          <li>Take capacitance as the larger of the ripple-voltage limit and the source-decoupling minimum.</li>
          <li>Split the ripple current across a parallel bank to keep each part's ESR loss and hot spot in check.</li>
          <li>Remember real bank ESL is dominated by the busbar/interconnect layout, not the part datasheet — laminate the busbar.</li>
          <li>Verify against the specific series' datasheet curves and, for critical designs, by test.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
