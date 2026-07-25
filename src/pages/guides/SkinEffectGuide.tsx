import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('skin-effect')!;

export default function SkinEffectGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What skin effect is</h2>
      <p>
        Skin effect is the tendency of alternating current to concentrate near a conductor's surface as
        frequency rises. The mechanism is self-inflicted: the AC creates a changing magnetic field inside
        the conductor, that changing field induces eddy currents, and those eddy currents oppose the flow
        in the centre while reinforcing it near the surface. The higher the frequency, the more the
        current is pushed outward — so less of the copper actually carries current, and the effective AC
        resistance rises above the DC value.
      </p>

      <h2>Skin depth: the one number that quantifies it</h2>
      <p>
        Skin depth δ is the depth at which the current density has fallen to about 37% (1/e) of its value
        at the surface — a convenient single measure of how far the current penetrates. It's given by:
      </p>
      <p>
        <code>δ = √( ρ / (π · f · µ₀ · µr) )</code>
      </p>
      <p>
        where ρ is the material's resistivity, f the frequency, µ₀ = 4π×10⁻⁷ H/m the permeability of free
        space, and µr the material's relative permeability. Higher frequency or higher permeability → less
        penetration; higher resistivity → more.
      </p>

      <h2>The key insight: it depends on material and frequency, not size</h2>
      <p>
        Notice what's <em>not</em> in that formula: the conductor's diameter or shape. Skin depth is a
        property of the <b>material and frequency alone</b>. A 1 mm wire and a 100 mm busbar of the same
        copper at the same frequency have identical skin depth. What changes with size is how much that
        skin depth <em>matters</em>: when δ is comparable to or larger than the conductor, skin effect is
        negligible; when δ is much smaller than the conductor, most of the cross-section is wasted and the
        AC/DC resistance ratio climbs.
      </p>

      <h2>Magnetic materials are a trap</h2>
      <p>
        Non-magnetic conductors — copper, aluminium, silver, gold, brass, austenitic stainless — have
        µr = 1, and skin depth is well-behaved. Ferromagnetic materials (steel, nickel) have µr ≫ 1, which
        <b> sharply reduces</b> skin depth. But their µr is not a fixed constant: it depends on field
        strength, saturates well below the DC values often quoted, and is itself frequency-dependent. So a
        skin-depth number for a magnetic material should be treated as illustrative only, not a precise
        design value.
      </p>

      <GuideDeepDive
        title="Worked values, AC resistance & where it bites"
        teaser="Skin depth for copper across the frequency range, why the effective-area shortcut is only an approximation, and where skin effect actually matters in EV power electronics."
        feature="Skin effect deep dive"
      >
        <h3>Copper skin depth, across frequency</h3>
        <p>
          For copper the numbers are worth memorising as anchors: about 8.5 mm at 60 Hz, ~0.66 mm at
          10 kHz, and ~66 µm at 1 MHz. So at mains/line frequency skin effect barely touches a normal
          conductor, at a motor drive's switching harmonics it starts to matter for thick bars, and at
          RF the current lives in a whisker-thin surface layer — which is why RF conductors are often
          silver-plated (only the surface conducts anyway).
        </p>

        <h3>Effective area is only an approximation</h3>
        <p>
          A common shortcut treats the current as flowing uniformly in a surface ring one skin-depth
          thick and zero in the centre. That's a useful mental model, but the real current density falls
          off <em>smoothly</em>, not as a step, so the true AC/DC resistance ratio for a given geometry
          needs a full Bessel-function solution. For a real busbar or cable AC resistance, use the
          IEC 60287-1-1 empirical kₛ correction (which the Busbar and Cable/Wire Sizing calculators apply)
          rather than the effective-area shortcut.
        </p>

        <h3>Where it actually matters in EV power electronics</h3>
        <ul>
          <li><b>Busbars carrying motor-phase current</b> — the drive's fundamental and its harmonics raise AC resistance and thus I²R heating.</li>
          <li><b>Inductor and transformer windings</b> — high switching frequencies push toward litz wire or foil to keep resistance down.</li>
          <li><b>Anywhere you're tempted to "just add copper"</b> — beyond a few skin depths, extra thickness in the centre carries almost no current and doesn't lower AC resistance.</li>
        </ul>
      </GuideDeepDive>
    </GuideLayout>
  );
}
