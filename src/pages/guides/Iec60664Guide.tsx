import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iec-60664-1')!;

export default function Iec60664Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What IEC 60664-1 is</h2>
      <p>
        IEC 60664-1 is the base standard for <em>insulation coordination for equipment within
        low-voltage systems</em>. In practice, it's the standard engineers reach for to answer a very
        concrete question: how far apart do two conductors at different potentials need to be so the
        insulation between them doesn't break down? It answers that with two separate distances —
        clearance and creepage — and a small set of environmental inputs that scale them.
      </p>

      <h2>Creepage vs clearance — two different failure modes</h2>
      <p>
        These get used interchangeably in conversation, but they're physically distinct:
      </p>
      <ul>
        <li>
          <b>Clearance</b> is the shortest distance <em>through the air</em> between two conductors. It
          guards against the air itself ionising and arcing over — a fast, voltage-driven breakdown.
        </li>
        <li>
          <b>Creepage</b> is the shortest distance <em>along the surface</em> of the solid insulation
          between them. It guards against a conductive track slowly forming across a contaminated
          surface (tracking) — a slow, contamination-driven failure.
        </li>
      </ul>
      <p>
        Because they fail for different reasons, they're driven by different inputs. Clearance cares
        about voltage and air density; creepage cares about voltage, how dirty the surface gets, and
        how tracking-resistant the insulating material is.
      </p>

      <h2>The inputs that set the numbers</h2>
      <ul>
        <li>
          <b>Working voltage</b> — the RMS or DC voltage actually across the insulation. Both clearance
          and creepage scale with it.
        </li>
        <li>
          <b>Pollution degree (PD1–PD4)</b> — how much conductive contamination the surface sees. A
          sealed module is PD1–PD2; an open industrial environment is PD3–PD4. Higher pollution demands
          more creepage, and the standard imposes minimum floors (PD2 ≥ 0.2 mm, PD3 ≥ 0.8 mm,
          PD4 ≥ 1.6 mm) because a tiny gap can be bridged entirely by a particle or a droplet regardless
          of voltage.
        </li>
        <li>
          <b>Material group (CTI)</b> — the Comparative Tracking Index of the insulator, in four groups
          (I, II, IIIa, IIIb). A higher CTI material resists surface tracking, so it needs less creepage
          for the same conditions.
        </li>
        <li>
          <b>Altitude</b> — thinner air at altitude breaks down more easily, so <em>clearance</em> is
          corrected upward with height (creepage, a surface phenomenon, is not).
        </li>
      </ul>

      <h2>Where the common simplifications bite</h2>
      <p>
        Most calculators (including this one, by design) drive clearance <em>directly</em> from the
        working voltage, altitude-corrected. What that skips is stepping the working voltage up through
        an overvoltage category to a rated impulse withstand voltage (IEC 60664-1 Table F.1) first. That
        step matters for circuits exposed to significant transient overvoltages — most obviously anything
        connected directly to the mains — and skipping it will <em>understate</em> the required clearance
        for those cases. If your circuit sees real transients, add your own margin.
      </p>
      <p>
        Two more things worth knowing: the standard's distance tables approximate a power law, not a
        straight line or a step, so interpolating between tabulated voltage points (rather than jumping
        to the next-higher band) is both legitimate and less over-conservative. And the base numbers
        assume <b>functional insulation</b> — basic, supplementary, and reinforced insulation are handled
        separately and need their own treatment.
      </p>

      <GuideDeepDive
        title="Worked example, Paschen cross-check & checklist"
        teaser="A worked clearance/creepage lookup at a real working voltage, how the first-principles Paschen's-Law sanity check compares, and a design checklist for using the standard safely."
        feature="IEC 60664-1 deep dive"
      >
        <h3>Worked example: a 400 V circuit, PD2, Material Group I</h3>
        <p>
          For 400 V working voltage in pollution degree 2 with a Group I material, IEC 60664-1's tabulated
          creepage is 2.0 mm. Drop to a worse-tracking Group IIIb material at 250 V and PD2 and the required
          creepage is 2.5 mm — a lower voltage but a worse material and the number goes <em>up</em>, which is
          exactly the point of the CTI input. On the clearance side, a 1.0 kV Case A clearance tabulates at
          0.15 mm at sea level, growing as you correct for altitude.
        </p>
        <p>
          These are the kinds of spot values worth memorising as anchors — if a tool hands you a creepage of
          0.2 mm for a 400 V mains-referenced trace, something is wrong.
        </p>

        <h3>The Paschen's-Law sanity check</h3>
        <p>
          Clearance ultimately exists to stop the air arcing over, and air breakdown is described from first
          principles by Paschen's Law: breakdown voltage is a function of pressure × gap. The Volteq calculator
          runs this as an independent cross-check on the standard's clearance number. The caveat is that
          Paschen assumes an idealised uniform field between clean electrodes — real breakdown is usually
          <em> lower</em> because of field non-uniformity, surface roughness, and humidity. So treat the
          Paschen check as a physics sanity check, never as a replacement for the standard's tested margins.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Establish the true working voltage across each insulation boundary (differential, and to chassis).</li>
          <li>Classify the pollution degree for the actual enclosure environment — don't assume PD1 for an unsealed box.</li>
          <li>Look up the material group (CTI) of your actual laminate / potting / housing material.</li>
          <li>Correct clearance for altitude if the product operates or is transported at height.</li>
          <li>If the circuit sees transient overvoltages (mains, switching), add margin the direct-voltage method skips.</li>
          <li>Verify final numbers against the current official IEC 60664-1 text and any product-specific standard before certification.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
