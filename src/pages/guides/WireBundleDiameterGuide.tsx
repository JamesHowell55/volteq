import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('wire-bundle-diameter')!;

export default function WireBundleDiameterGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why bundle diameter is a real design number</h2>
      <p>
        Bundle a harness of wires together and the finished diameter drives a surprising amount of the
        design: the size of the conduit or grommet it passes through, the clamp and routing spacing, how
        much it weighs, and whether it fits the space claim in a packed engine bay or airframe. But wires
        don't pack into a neat circle — round shapes leave gaps — so estimating the bundle diameter takes
        a bit of geometry. There are two standard ways to do it.
      </p>

      <h2>Method 1: circle packing</h2>
      <p>
        The direct approach is to actually <b>pack the circles</b>: arrange the individual wire
        cross-sections as tightly as possible and measure the smallest circle that encloses them. This
        captures the real geometry — a bundle of mixed-gauge wires nests differently than uniform ones —
        and it's what drives a cross-section diagram. The catch is that optimal circle packing is a hard
        problem; practical tools use a heuristic (greedy tangent placement), which is close but not
        provably the tightest possible arrangement.
      </p>

      <h2>Method 2: the Glenair multiplication-factor table</h2>
      <p>
        Industry's pragmatic shortcut is the published <b>Glenair Wire Bundle Diameter</b> method: take the
        arithmetic-mean wire diameter and multiply by a factor that depends on the number of wires. It's a
        statistical fit — a single number that captures how bundles of N wires typically come out, without
        modelling the exact packing. It's fast, it's the recognised industry cross-check, and it's why a
        good estimate reports <em>both</em> the packed and the Glenair-factor result: if they agree, you can
        trust the number.
      </p>

      <h2>Coverings add to the outside</h2>
      <p>
        The bare bundle is only the start. Overbraid, heat-shrink, and sleeving each add wall thickness
        around the outside, growing the finished OD. A covering's finished diameter assumes it wraps snugly
        against the bundle — a first-order estimate, since real tubing recovers to its own limits and
        loose coverings sit larger.
      </p>

      <GuideDeepDive
        title="Why it's a planning estimate & a checklist"
        teaser="What lay length and tie spacing do that no diameter formula captures, how to use the two methods against each other, and a checklist for a bundle-diameter estimate."
        feature="Bundle diameter deep dive"
      >
        <h3>What the diameter formulas can't see</h3>
        <p>
          Both methods assume the wires lie straight and parallel. A real harness is twisted and tied: the
          <b> lay length</b> (how tightly the bundle is twisted) and the <b>tie/lace spacing</b> both change
          the effective diameter — a tightly-laced bundle is smaller and rounder, a loosely-dressed one
          larger and lumpier. No cross-section calculation captures this, which is why the result is a
          planning estimate to size conduit and space claim, not a guaranteed as-built dimension.
        </p>

        <h3>Use the two methods against each other</h3>
        <p>
          Circle packing is geometric and per-bundle; the Glenair factor is statistical and generic. When
          they agree, the estimate is solid. When they diverge — often for very mixed gauges or small wire
          counts — treat the larger as the conservative planning number and refine against the specific wire
          and covering datasheets before committing conduit sizes.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Collect the real finished OD of each wire (insulation included), not just the conductor gauge.</li>
          <li>Estimate the bare-bundle diameter both ways (packing and Glenair factor) and compare.</li>
          <li>Add each covering's wall thickness (overbraid, heat-shrink, sleeve) to the OD in turn.</li>
          <li>Add margin for lay length and tie spacing — the bundle is never as tidy as the calculation.</li>
          <li>Confirm against product datasheets before sizing conduit, grommets and clamps.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
