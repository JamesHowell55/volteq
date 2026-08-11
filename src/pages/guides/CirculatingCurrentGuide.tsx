import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('circulating-current')!;

export default function CirculatingCurrentGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Parallel strands should share current equally. They often don't.</h2>
      <p>
        When a winding needs more copper than one conductor can conveniently provide, the usual fix is to run
        several strands in parallel — several thin round wires "in hand," or several hairpin sub-conductors
        stacked radially in a slot. Wired in parallel and carrying the same net current, you'd expect each strand
        to carry an equal share. It doesn't, if the strands sit at <em>different depths</em> within the slot.
        The slot's leakage field builds up with depth — near-zero at the bottom, strongest near the top — so a
        strand sitting deep in the slot links a different amount of flux than one near the opening. Because the
        strands are joined together at both ends, that difference in linked flux drives an EMF imbalance, and an
        EMF imbalance across a short-circuited loop does exactly what you'd expect: it drives a current around
        the loop. That's <b>circulating current</b> — extra current flowing between strands that contributes
        nothing to the useful bundle current, just extra I²R loss.
      </p>

      <h2>Transposition is the classical fix</h2>
      <p>
        This isn't a new problem — large synchronous generators have wrestled with it for over a century, in
        the parallel strands of a Roebel bar. The century-old solution is <b>transposition</b>: physically
        rotate each strand through every position in the slot depth over the length of the winding, so that,
        averaged over the whole length, every strand links the same total flux. Do that perfectly and the EMF
        imbalance — and the circulating current — cancels to zero. Do it partially, or not at all, and the
        strands fight each other for the whole active length. This calculator lets you compare the two extremes
        directly: enter your strands' positions with no transposition, then flip to "ideal (full Roebel)" and
        watch the circulating current collapse.
      </p>

      <GuideDeepDive
        title="The slot-leakage loop inductance, why it had to be added, and what this model doesn't capture"
        teaser="The physics that actually limits circulating current, why an earlier version of this calculator got it wildly wrong, and the honest limits of a closed-form model."
        feature="Circulating current deep dive"
      >
        <h3>What actually limits circulating current</h3>
        <p>
          An EMF imbalance alone doesn't tell you how big the circulating current gets — that depends on what's
          in its way. The strands' own resistance is part of it, but for thick, low-resistance copper at the
          hundreds-of-hertz to few-kilohertz frequencies typical of an EV traction inverter, resistance alone
          barely limits anything. The thing that actually caps circulating current is the <b>mutual coupling
          between the strands</b> — equivalently, the inductance of the loop the circulating current has to flow
          around, formed by "out" through one strand's position and "back" through the other's. That loop
          inductance follows the same classical slot-leakage-permeance formula used throughout AC machine
          design: proportional to how far apart the two strands sit, and inversely proportional to the slot's
          width. Two strands right next to each other barely couple to different field levels and see a small
          loop inductance; two strands at opposite ends of the slot see a large separation and a correspondingly
          larger loop inductance holding their circulating current in check.
        </p>

        <h3>Why this mattered enough to redo the model</h3>
        <p>
          An earlier version of this calculator's engine modelled only each strand's own tiny self-inductance,
          missing that mutual coupling entirely — and for realistic hairpin strand dimensions, that produced a
          circulating current of tens of thousands of amps on a few-hundred-amp bundle, which is obviously not
          physical. The fix was to bring in the actual loop inductance between strand positions, cross-checked
          against the modern hairpin-motor literature, the classical two-layer transformer leakage formula, and
          an independent energy-based derivation — all of which agree. With that in place, the same realistic
          numbers come out in the hundreds of amps for badly-placed, untransposed strands and tens of amps for
          strands that sit close together — physically sane, and a genuine demonstration of why real designs
          transpose or keep parallel strand counts modest.
        </p>

        <h3>What this model still doesn't capture</h3>
        <p>
          It's a thin-strand (point-conductor) approximation — it doesn't correct for a strand's own physical
          height, which means it somewhat <em>over-predicts</em> circulating current for strands that sit close
          together relative to their own thickness (a conservative, safe-side bias, not an optimistic one). It
          assumes the strands you enter are the slot's entire conductor content, so it doesn't account for other,
          separate turns sharing the same slot. It treats transposition as each strand's length-averaged
          position rather than modelling the continuous rotation exactly. And like the rest of this project's
          winding tools, it's a 1-D slot-leakage picture — no 2-D/3-D field fringing, no iron saturation, no
          end-region leakage. Treat its output as an order-of-magnitude and relative-comparison guide — is
          transposition worth it, does moving a strand help — rather than a precise absolute number, and verify
          against FEA before it drives a final design decision.
        </p>
      </GuideDeepDive>
    </GuideLayout>
  );
}
