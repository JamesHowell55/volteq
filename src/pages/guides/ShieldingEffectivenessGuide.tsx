import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('shielding-effectiveness')!;

export default function ShieldingEffectivenessGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Two very different ways to block a field</h2>
      <p>
        A metal barrier blocks an electromagnetic field two ways at once, and they work for
        completely different reasons. <strong>Absorption</strong> happens because the field
        induces eddy currents as it penetrates the metal, and those currents dissipate its energy
        as heat — the deeper the barrier, relative to the material's skin depth, the more gets
        absorbed. <strong>Reflection</strong> happens purely from an impedance mismatch at the
        surface: a good conductor looks like a near-short-circuit to an electromagnetic wave, so
        most of the wave simply bounces off before it ever gets inside. Schelkunoff's classical
        treatment adds the two together in decibels, plus a small correction for energy that
        reflects back and forth inside a barrier too thin to absorb it fully:
        <code> SE = A + R + B</code>.
      </p>

      <h2>Absorption: a direct extension of skin depth</h2>
      <p>
        Absorption loss is where shielding theory and skin-effect theory are the same physics —
        <code> A(dB) = 8.686·(t/δ)</code>, where δ is exactly the classical skin depth (see this
        site's Skin Depth guide). Every skin depth of thickness costs about 8.7dB, so absorption
        rises quickly with frequency (skin depth shrinks as f increases) and with thickness.
        Copper and aluminum, despite being non-magnetic, are excellent absorbers at RF frequencies
        simply because they're such good conductors that their skin depth is tiny.
      </p>

      <h2>Reflection: it depends on what's making the field</h2>
      <p>
        Reflection loss compares the wave's own impedance against the shield's — the bigger the
        mismatch, the more bounces off. Far from a source, any field settles into a plane wave
        with a fixed impedance of 377Ω (free space). But close to a source — inside roughly a
        sixth of a wavelength — the field impedance depends on <em>what kind</em> of source is
        radiating it. A high-voltage, low-current source (like an unterminated trace or antenna)
        looks like an electric dipole, with a high near-field impedance that's easy to reflect. A
        low-voltage, high-current source (like a current loop, busbar, or cable carrying ripple
        current) looks like a magnetic dipole, with a low near-field impedance that reflects
        poorly — which is exactly why magnetic fields are the hard case for shielding at short
        range, and why absorption (not reflection) tends to dominate the design for low-frequency
        magnetic sources.
      </p>

      <GuideDeepDive
        title="Why real enclosures fall short of the solid-barrier number, and a design checklist"
        teaser="The solid-barrier SE number is a ceiling, not a guarantee — what actually limits a real enclosure, and how to use this calculator's number correctly."
        feature="Shielding effectiveness deep dive"
      >
        <h3>The solid barrier is the easy part</h3>
        <p>
          A 1mm sheet of ordinary aluminum can show 100dB+ of shielding effectiveness against a
          plane wave in the tens-of-MHz range — dramatically more than almost any real system
          needs. In practice, the number this calculator produces is a ceiling: it's what the
          material and thickness alone are capable of, assuming an unbroken, infinite sheet. Every
          real enclosure has seams, vent holes, cable entries, and access panels, and it's almost
          always <em>those</em> features — not the solid metal between them — that set the
          achievable shielding effectiveness. See the companion Aperture &amp; Vent Leakage
          calculator for how a single slot or a ventilation panel's leakage compares to the solid
          barrier's absorption and reflection loss.
        </p>

        <h3>Resonance can erase shielding entirely</h3>
        <p>
          A shielded enclosure is also a cavity, and at its resonant frequencies the enclosure
          effectively becomes an antenna rather than a barrier — shielding effectiveness can drop
          to near 0dB or even go negative at those specific frequencies, regardless of how good
          the barrier material is. See the Enclosure Cavity Resonance calculator to check whether
          your enclosure's dimensions put a resonance inside your frequency range of concern.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Identify whether the dominant concern is a far-field plane wave (radiated emissions/immunity at distance) or a near-field source (something radiating from inside or right next to the enclosure) — they need different reflection-loss assumptions.</li>
          <li>For a near-field magnetic source (motor, choke, busbar, current loop), expect reflection loss to be small — absorption (thickness, conductivity) is doing most of the work.</li>
          <li>Treat the solid-barrier SE number as a best case; check apertures, seams, and cable penetrations separately since they usually set the real limit.</li>
          <li>Check the enclosure's cavity resonant frequencies against your frequency range of concern.</li>
          <li>Remember this model doesn't cover gasketed seams' contact impedance — that depends on the specific gasket and compression, and needs manufacturer data.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
