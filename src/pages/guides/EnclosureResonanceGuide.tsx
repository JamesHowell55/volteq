import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('enclosure-resonance')!;

export default function EnclosureResonanceGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>A shielded box is also a cavity</h2>
      <p>
        Every metal enclosure that's built to keep fields out is, geometrically, also built to
        trap fields in — the same conductive walls that block an external field can also support
        a standing electromagnetic wave bouncing back and forth inside the cavity they enclose.
        At specific frequencies, set purely by the enclosure's internal dimensions, that standing
        wave becomes a resonance: energy inside the enclosure builds up rather than dissipating,
        and the enclosure starts behaving like a tuned antenna rather than a passive barrier.
      </p>

      <h2>Where the resonant frequencies come from</h2>
      <p>
        For a rectangular box of internal dimensions l, h, w, the resonant frequencies follow
        directly from solving Maxwell's equations with the boundary condition that the tangential
        electric field must vanish at every conductive wall — the same kind of standing-wave
        condition that sets a guitar string's harmonics, just in three dimensions instead of one:
        <code> f(m,n,p) = (c/2)·√((m/l)² + (n/h)² + (p/w)²)</code>, where m, n, p are non-negative
        integers (with at least two of them nonzero — a mode needs field variation in at least
        two dimensions to exist). A useful sanity-check number: a 1-metre cubic enclosure has a
        lowest resonance right around 212MHz, a commonly-cited rule of thumb in EMC references.
      </p>

      <h2>Why this matters for shielding</h2>
      <p>
        Right at a resonant frequency, the enclosure's shielding effectiveness (see the Shielding
        Effectiveness calculator) doesn't just weaken — it can collapse toward 0dB or even go
        negative, independent of how thick or conductive the barrier material is. A perfectly
        specified 100dB solid-barrier shield is worthless at a frequency where the enclosure
        itself is resonating, which is why cavity resonance is checked as a separate design step
        from the barrier material calculation, not folded into it.
      </p>

      <GuideDeepDive
        title="What actually happens at resonance, and a design checklist"
        teaser="Why real (loaded, lossy) enclosures aren't as bad as the idealized formula suggests, and how to keep resonances out of your frequency range of concern."
        feature="Enclosure resonance deep dive"
      >
        <h3>The idealized formula is a worst case</h3>
        <p>
          The formula above describes an empty, perfectly conductive, lossless cavity — the worst
          case for resonance severity. A real enclosure is neither: it's usually loaded with a
          PCB, cables, and components (which raise the effective dielectric constant inside the
          cavity and shift resonances to somewhat lower frequencies than the empty-box formula
          predicts), and its walls, connectors, and cable penetrations all add loss that damps the
          resonance (lowering its Q — the sharpness and severity of the peak). In practice this
          means resonances are real and worth checking, but a populated, imperfect real enclosure
          usually shows a less severe dip than the idealized number alone would suggest.
        </p>

        <h3>Degenerate modes make it worse, not better</h3>
        <p>
          A cube (or any enclosure with two equal dimensions) has multiple different (m,n,p) mode
          combinations landing on exactly the same frequency — three modes overlapping instead of
          one. Far from being harmless, this "degeneracy" concentrates more resonant energy at a
          single frequency, which is one of several reasons EMC design guidance generally avoids
          cubic or near-cubic enclosure proportions when resonance in a sensitive frequency range
          is a concern.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Compute the enclosure's lowest several resonant modes and compare them against your actual frequency range of concern (switching harmonics, clock frequencies, susceptibility test frequencies).</li>
          <li>If a resonance falls inside your range of concern, consider changing one internal dimension slightly to shift it outside — even a small change moves the resonance meaningfully.</li>
          <li>Avoid cubic or near-cubic proportions if resonance in a sensitive range is a real risk — degenerate modes concentrate energy at a single frequency.</li>
          <li>Remember a populated, lossy real enclosure is somewhat better-behaved than the idealized empty-cavity formula — but don't rely on that margin for a compliance-critical design without verification.</li>
          <li>Absorptive material (RF foam) inside the enclosure can damp resonance peaks substantially where a dimensional change isn't practical.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
