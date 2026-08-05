import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('aperture-shielding')!;

export default function ApertureShieldingGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why the holes matter more than the metal</h2>
      <p>
        A solid sheet of aluminum a millimeter thick can show 100dB or more of shielding
        effectiveness against a plane wave in the tens-of-MHz range — see this site's Shielding
        Effectiveness calculator. Almost no real enclosure achieves anywhere near that number,
        because almost no real enclosure is a solid, unbroken sheet. Every seam, vent hole, cable
        entry, display cutout, and access panel is a place where the field can get through more
        easily than it can through the metal — and past a certain point, an opening stops merely
        "leaking" and starts actively radiating.
      </p>

      <h2>A slot is an antenna once it's big enough</h2>
      <p>
        A gap or slot's leakage depends on its <em>longest</em> dimension, not its area — a long
        thin slot is far worse than a compact round hole of the same open area, because the
        longest dimension is what determines whether the opening can support a resonant current
        at a given frequency. The classical result is
        <code> SE(dB) = 20·log₁₀(λ/(2·d))</code>: shielding falls as frequency rises, and hits
        exactly 0dB once the opening's longest dimension reaches half a wavelength — at that
        point the slot isn't leaking a field anymore, it's radiating one, functioning as a slot
        antenna. This is why EMC guidance consistently prefers many small holes over one long
        slot of the same total open area.
      </p>

      <h2>How a vent panel breathes without leaking RF</h2>
      <p>
        Ventilation looks like it should be at odds with shielding — but a hole with real depth
        behaves completely differently from a thin slot. Below its cutoff frequency, a hole acts
        as a short section of waveguide that simply can't support a propagating wave, so the field
        decays exponentially along its depth rather than passing through. That gives vent panels
        (drilled/punched perforated sheet, or honeycomb) their key property: airflow moves through
        in a straight line just fine, but RF below the cutoff frequency is attenuated by an amount
        that grows with the hole's depth-to-diameter ratio — a deep, narrow hole blocks RF far
        better than a shallow, wide one of the same open area, which is exactly why honeycomb vent
        panels use many small deep hexagonal cells rather than a few large holes.
      </p>

      <GuideDeepDive
        title="Array effects, cutoff-frequency limits, and a vent-panel design checklist"
        teaser="Why more holes reduce shielding even at fixed hole size, why a vent panel formula stops being valid near cutoff, and a checklist for sizing a real vent panel."
        feature="Aperture & vent shielding deep dive"
      >
        <h3>More holes means less shielding, even at the same hole size</h3>
        <p>
          A single small hole blocks RF well below its cutoff frequency — but a real vent panel
          needs dozens or hundreds of holes for adequate airflow, and packing many identical holes
          close together (within roughly a wavelength of each other) measurably reduces the
          panel's overall shielding versus a single hole, in proportion to the square root of the
          hole count. Doubling the hole count from 50 to 100 costs about 1.5dB; going from 1 hole
          to 100 costs 10dB — a real, non-negligible effect that a "just check one hole" design
          approach would miss entirely.
        </p>

        <h3>The cutoff-frequency ceiling</h3>
        <p>
          Waveguide-below-cutoff theory only holds, unsurprisingly, <em>below cutoff</em> — as the
          operating frequency approaches a hole's own cutoff frequency (set by its diameter), the
          exponential-decay assumption weakens and the simple attenuation formula becomes
          optimistic. Practical vent-panel designs keep meaningful margin (several times) between
          the highest frequency of concern and the hole cutoff frequency, which in practice means
          keeping the hole diameter small relative to the wavelength at that frequency — smaller
          holes push the cutoff frequency higher.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>For any unavoidable seam or gap, keep its longest dimension well under half a wavelength at your highest frequency of concern — many EMC design guides target 1/20th of a wavelength for real margin, not the 0dB boundary itself.</li>
          <li>Prefer many small round holes over fewer large ones or long slots, for the same open area.</li>
          <li>For a vent panel, check the cutoff-frequency margin at your highest frequency of concern — this calculator flags when it drops below about 3×.</li>
          <li>Account for the array reduction when sizing a real multi-hole vent panel, not just a single representative hole.</li>
          <li>Remember gasketed seams have their own contact-impedance behavior, not covered by either model here — that needs manufacturer gasket data.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
