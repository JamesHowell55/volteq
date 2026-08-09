import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('cold-plate')!;

export default function ColdPlateGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>A cold plate is a pipe you can machine into any shape</h2>
      <p>
        A liquid cold plate is a metal block with a coolant channel milled into it: the heat-generating
        parts bolt to one face, coolant runs through the channel, and the two never touch. Design comes
        down to two competing numbers. The <strong>thermal resistance</strong> tells you how hot the
        mounting face runs for a given heat load — you want it low. The <strong>pressure drop</strong>
        tells you how hard the pump has to push to keep the coolant moving — you want that low too. Push
        the channel smaller and faster to cut the thermal resistance and the pressure drop shoots up;
        the whole job is finding the balance.
      </p>

      <h2>Why a rectangular channel isn't a round pipe</h2>
      <p>
        Milled channels are rectangular, not round, and that changes the physics in a way that's easy to
        get wrong. For a round pipe in slow (laminar) flow, the friction factor is exactly
        <code> f = 64/Re</code>. For a rectangular channel it isn't 64 at all — the Poiseuille number
        <code> f·Re</code> ranges from about 57 for a square channel up to 96 for a very wide, thin one
        (the parallel-plate limit). The heat transfer shifts the same way: the laminar Nusselt number
        (which sets the heat-transfer coefficient <code>h = Nu·k/Dh</code>) is about 3.6 for a square
        channel and climbs toward 8.2 as the channel gets thin. This calculator uses the Shah &amp;
        London polynomials that capture that aspect-ratio dependence exactly, keyed off the channel's
        width-to-height ratio, rather than borrowing the round-pipe numbers.
      </p>

      <h2>The bends are not free</h2>
      <p>
        A serpentine cold plate turns the flow around many times, and every turn costs pressure. Each
        45°, 90° or 180° bend adds a minor loss <code>K·(ρv²/2)</code> on top of the straight-section
        friction — and on a compact plate with tight U-turns those bends can rival the straight-run
        losses. The K values depend heavily on how sharp the corner is: a square-milled 180° U-turn
        loses far more than a generously radiused one. The values here (roughly 0.3, 1.1 and 2.0 for
        45°, 90° and 180°) are representative of sharp milled bends; radiused or vaned turns are lower.
      </p>

      <h2>Direct cooling and offset pin fins</h2>
      <p>
        Most modern power modules have abandoned the flat baseplate-on-cold-plate sandwich entirely. Instead the
        module's baseplate is itself a field of little pins — an <strong>offset (staggered) pin-fin</strong> array
        — that dips straight into the coolant, so the heat never has to cross a thermal-interface layer. Infineon's
        HybridPACK and the Danfoss ShowerPower designs are the familiar examples. Turning a plain channel into a
        pin field does two things at once: it multiplies the wetted surface area and it forces the coolant to weave
        between staggered pins, which trips turbulence at a far lower Reynolds number than a smooth channel. The
        heat-transfer coefficient can jump by several times — but the pressure drop climbs even faster, often by one
        to two <em>orders of magnitude</em>, because the flow is now squeezing through narrow gaps and paying a loss
        at every row. That's the whole reason this calculator lets you drop a pin field into a single section and
        watch both numbers move: the pins are only worth it where the heat flux genuinely demands them, and the pump
        has to be sized for the penalty. The physics here uses the Zukauskas staggered-bank correlation for the heat
        transfer and the Gaddis-Gnielinski (VDI Heat Atlas) drag coefficient for the pressure drop, both classic
        tube-bank methods applied to the pins, with each pin derated by its own fin efficiency.
      </p>

      <GuideDeepDive
        title="From heat-transfer coefficient to a base temperature, and the fin-efficiency caveat"
        teaser="How the convective, caloric and conduction resistances stack up to a base temperature, why tall channels don't deliver all the area they seem to, and a cold-plate design checklist."
        feature="Cold plate design deep dive"
      >
        <h3>Three resistances in series</h3>
        <p>
          The temperature rise from the coolant inlet to the mounting face is the heat load times a
          thermal resistance, and that resistance is really three effects stacked up. The
          <strong> convective</strong> resistance <code>R_conv = 1/(h·A)</code> is the film between the
          channel wall and the fluid — more wetted area or a higher heat-transfer coefficient lowers it.
          The <strong>caloric</strong> resistance <code>1/(2·ṁ·cp)</code> accounts for the coolant
          simply heating up as it collects the load: with too little flow the outlet runs hot and drags
          the whole plate up with it (the factor of two is because the average fluid sits halfway between
          inlet and outlet). Finally, if the power module mounts on a base of some thickness, a
          <strong> conduction</strong> resistance <code>t/(k·A)</code> carries the heat down to the
          channel. Add them and multiply by the heat load to get the base temperature above the inlet
          coolant.
        </p>

        <h3>The fin-efficiency caveat</h3>
        <p>
          There's an optimism baked into the simple picture worth being honest about. When you count the
          full wetted perimeter of a channel as heat-transfer area, you're implicitly assuming the side
          and top walls are as effective as the heated base wall. They aren't — they act as fins, and a
          tall thin wall gets cooler toward its tip, so it moves less heat per unit area than the base
          does. Ignoring that fin efficiency <em>over</em>-estimates the conductance and makes the plate
          look a little better than it is, especially for deep channels. That's why the result here is a
          first-order estimate: good for comparing channel layouts and catching a design that's obviously
          under- or over-cooled, but worth confirming with CFD or a bench test before it's final.
        </p>

        <h3>Cold-plate design checklist</h3>
        <ol>
          <li>Set the flow rate from the heat load and the coolant temperature rise you'll tolerate — the caloric resistance alone puts a floor on how cold the plate can be.</li>
          <li>Favour wider, shallower channels for heat transfer, but watch the pressure drop climb as you shrink the cross-section.</li>
          <li>Keep channel velocity in a sensible band (roughly 0.5–2 m/s for water/glycol): too slow and the heat-transfer coefficient collapses, too fast and the pump work and erosion climb.</li>
          <li>Count the bends — a many-pass serpentine trades pressure drop for a longer wetted path; sometimes several parallel channels beat one long serpentine.</li>
          <li>Check both outputs together: a plate that hits its temperature target but needs a 2-bar pump may lose to a slightly warmer design that runs on a fraction of the pump power.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
