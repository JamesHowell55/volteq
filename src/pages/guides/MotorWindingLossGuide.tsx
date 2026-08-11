import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('motor-winding-loss')!;

export default function MotorWindingLossGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why a winding's AC resistance isn't its DC resistance</h2>
      <p>
        A winding's DC resistance is simple geometry: resistivity times length over area. But run AC
        current through it — and every traction motor does, at whatever frequency the drive is switching
        the phases — and the effective resistance climbs above that DC value. Two effects are responsible.
        <b> Skin effect</b> pushes current in a single isolated conductor toward its surface, shrinking the
        area it actually uses. <b>Proximity effect</b> is the more aggressive of the two in a real winding:
        the alternating field from every <em>neighbouring</em> turn induces eddy currents in each
        conductor, crowding current into thin regions and multiplying loss well beyond what skin effect
        alone would predict. In a slot with several layers of turns stacked on top of each other, proximity
        effect usually dominates.
      </p>

      <h2>Dowell's equation: the classical way to capture both at once</h2>
      <p>
        The standard tool for this is P.L. Dowell's 1966 transformer-winding analysis, which treats a
        stack of conductor layers as if they were sheets of foil and derives a single closed-form
        AC/DC resistance ratio, F<sub>R</sub>, as a function of two things: how thick each layer is
        compared to the skin depth (the <b>penetration ratio</b>, Δ), and how many layers are stacked in
        the direction the field builds (<b>m</b>). The formula splits cleanly into a skin-effect term and
        a proximity-effect term that scales with <code>m²−1</code> — which is why doubling the number of
        layers in a slot doesn't double the AC loss, it can multiply it several times over. A flat or
        hairpin conductor <em>is</em> a foil layer already, so Dowell's equation applies directly. A layer
        of round wires gets converted to an equivalent foil first, using a porosity factor for how tightly
        the round wires actually fill the layer.
      </p>

      <h2>Why round wire, hairpin and litz behave so differently</h2>
      <p>
        The three winding conductor types sit at different points on the same trade-off. <b>Round wire</b>
        is cheap and easy to wind, but a single thick strand has a lot of area exposed to the proximity
        field — the classic fix is to split it into several thinner strands in hand. <b>Flat/hairpin</b>
        conductors pack a slot efficiently and are the mainstream choice for modern EV traction motors, but
        their large, flat faces are exactly what proximity effect punishes hardest — which is why hairpin
        motors are usually designed with several thin conductors stacked radially (4 or 8 layers) rather
        than one tall one. <b>Litz wire</b> attacks the problem directly: many separately-insulated strands,
        twisted or bunched so each one only sees the average field, keep every individual strand thin
        enough that neither skin nor proximity effect gets much purchase — at the cost of a lower copper
        fill factor and a real construction limit (twist a litz bundle from too many strands in one
        operation and it stops behaving ideally).
      </p>

      <GuideDeepDive
        title="Sullivan's closed form, the litz construction limit, and what the model doesn't capture"
        teaser="Why round wire and litz wire share the same formula, how to tell if a litz bundle is well-built, and the one real AC loss mechanism this calculator doesn't model."
        feature="Winding AC loss deep dive"
      >
        <h3>Round wire and litz wire share one formula</h3>
        <p>
          When a conductor is thin compared to the skin depth — the usual case for both round magnet wire
          and individual litz strands — Dowell's equation simplifies to a single closed-form term (Sullivan
          &amp; Zhang, 2014): F<sub>R</sub> = 1 + (π·n·N)²·d⁶/(192·δ⁴·b²), where n is the number of strands
          per turn (just 1 for round wire), N is the number of turns stacked across the field-build
          direction, d is the strand diameter, δ is the skin depth, and b is the winding breadth. It's worth
          noticing that round wire is mathematically just litz wire with one strand — the same physics, the
          same formula, and that's exactly how this calculator's round-wire and litz-wire engines work
          under the hood.
        </p>

        <h3>Litz wire isn't automatically loss-free</h3>
        <p>
          Twisting strands together only helps if the twist is tight enough that each strand really does
          see the average field rather than its own local position. Push too many strands into a single
          twisting operation and the bundle starts behaving less like ideal litz and more like a solid
          conductor at high frequency — Sullivan gives a simple limit for how many strands a first twisting
          operation can safely combine, and this calculator checks a litz design against it. Exceed the
          limit and the real AC resistance will run higher than the ideal formula predicts; a well-built
          multi-stage ("bunch of bunches") construction is the usual fix.
        </p>

        <h3>What this model doesn't capture</h3>
        <p>
          Every formula here assumes the field builds uniformly across the slot and that every conductor
          in the slot carries the same current — a fair assumption for a simple series-wound coil. It
          breaks down for hairpin windings with multiple <em>parallel</em> current paths that aren't
          perfectly transposed: those paths can develop circulating currents between themselves, on top of
          the proximity loss modelled here, and that mechanism can dominate in a badly-designed parallel
          winding. It's a real, active research topic in EV motor design and isn't something a closed-form
          formula captures — it needs FEA. Treat this calculator's hairpin result as the proximity-effect
          floor, not the whole story, for a winding with parallel paths.
        </p>
      </GuideDeepDive>
    </GuideLayout>
  );
}
