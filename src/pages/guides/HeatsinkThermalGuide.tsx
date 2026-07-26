import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('heatsink-thermal')!;

export default function HeatsinkThermalGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why the heatsink is a budget, not a single number</h2>
      <p>
        A power device's junction temperature isn't set by the heatsink alone — it's the last link in a
        chain of thermal resistances that heat has to cross to get from the silicon die to the surrounding
        air: junction-to-case (Rjc, fixed by the device package), case-to-sink (Rcs, set by whatever
        thermal interface material sits between them), and sink-to-ambient (Rsa, the heatsink itself).
        Each one adds a temperature rise proportional to the power flowing through it, so the useful
        question isn't "how good is this heatsink?" but "how much Rsa can the rest of the chain afford?"
      </p>

      <h2>The budget: Tj = Ta + P·(Rjc + Rcs + Rsa)</h2>
      <p>
        Rearranging that equation the other way answers the sizing question directly: given a maximum
        allowed junction temperature, the ambient temperature, the power to dissipate, and the two
        resistances the designer doesn't control (Rjc from the datasheet, Rcs from the chosen TIM), the
        maximum sink resistance the design can tolerate falls out as
        <code> Rsa(required) = (Tj_max − Ta)/P − Rjc − Rcs</code>. Any heatsink at or below that number
        keeps the junction in spec; anything above it doesn't, no matter how good it looks on a shelf.
      </p>

      <h2>Case-to-sink: a resistance you choose</h2>
      <p>
        Unlike Rjc (fixed by the device) or Rsa (fixed by the heatsink), Rcs is largely a design choice —
        it's the thermal interface material's thickness divided by its conductivity and contact area
        (<code>Rcs = t/(k·A)</code>). Thermal grease, gap pads, and graphite pads all trade off thickness,
        conductivity, and ease of assembly differently, and a poor TIM choice can eat a surprising chunk of
        the whole budget.
      </p>

      <h2>Sizing the sink itself: natural convection off a fin array</h2>
      <p>
        For a natural-convection (no fan) extruded heatsink, air rising past each fin behaves — to a good
        approximation — like buoyancy-driven flow along a vertical flat plate, which is where the
        Churchill-Chu correlation comes in: it gives the convection coefficient h from the Rayleigh number
        (buoyancy vs. viscosity) and Prandtl number (fluid properties) for any vertical surface, laminar or
        turbulent. Multiply h by the fin array's effective surface area — corrected by a fin-efficiency
        factor since a fin's tip runs cooler than its base — and add radiation, and the two together have
        to carry away the target power at some base-to-ambient temperature rise. That temperature rise,
        divided by the power, is Rsa.
      </p>

      <GuideDeepDive
        title="Fin efficiency, tight spacing, and a sizing checklist"
        teaser="Why a fin isn't uniformly at its base temperature, why packing fins too close backfires, and a checklist for sizing a natural-convection heatsink."
        feature="Heatsink thermal deep dive"
      >
        <h3>Why fin efficiency matters</h3>
        <p>
          A fin conducts heat from its base outward while losing it to the air along the way, so its tip
          runs cooler than its base — it isn't doing full duty over its whole area. The standard fix is a
          fin-efficiency factor <code>η = tanh(mLc)/(mLc)</code>, where m depends on the convection
          coefficient and the fin's conductivity and thickness, and Lc is the fin length corrected for the
          (usually adiabatic) tip. A thick, highly-conductive fin has η close to 1 (nearly isothermal); a
          thin, poorly-conductive one can fall well short — which is why aluminum and copper fins, not
          plastic ones, dominate heatsink design.
        </p>

        <h3>The tight-spacing trap</h3>
        <p>
          Treating each fin gap as an isolated vertical plate is a good approximation only when fins aren't
          packed so close that they interfere with each other's rising air — the "channeling" effect that
          the Elenbaas / Bar-Cohen correlation was developed to capture. Below roughly 6mm of spacing,
          neighboring fins start choking off each other's airflow, and a model that ignores this will
          over-predict how much heat the array actually carries. Published guidance puts the practical
          near-optimal spacing for natural convection heatsinks around 6-12mm — closer isn't automatically
          better once you account for the airflow the fins are competing for.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Get Rjc from the device datasheet, and pick a TIM (Rcs) — don't let a poor TIM choice quietly eat the budget.</li>
          <li>Compute the required Rsa from the budget equation at the worst-case ambient and power.</li>
          <li>Size (or look up) a heatsink whose Rsa is at or below that number, with margin for tolerance stack-up.</li>
          <li>For a natural-convection fin array, keep spacing in the ~6-12mm range unless you've modelled channeling explicitly.</li>
          <li>Remember this is a natural-convection-only screening model — forced air/fan cooling changes the convection physics entirely and needs its own correlation.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
