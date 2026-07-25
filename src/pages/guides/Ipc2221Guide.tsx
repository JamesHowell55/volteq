import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('ipc-2221')!;

export default function Ipc2221Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What IPC-2221 is</h2>
      <p>
        IPC-2221 is the IPC's <em>Generic Standard on Printed Board Design</em> (the successor to the
        older IPC-D-275). Among many other things, it gives the rule that almost every PCB
        trace-width calculator on the internet is built on: how much current a copper trace can carry
        for a given allowable temperature rise. When someone says a trace is sized "to IPC-2221," this
        curve is what they mean.
      </p>

      <h2>The one equation that matters</h2>
      <p>
        IPC-2221 models current-carrying capacity as an empirical curve fit:
      </p>
      <p>
        <code>I = k · ΔT^0.44 · A^0.725</code>
      </p>
      <p>
        where <code>I</code> is the current in amps, <code>ΔT</code> is the allowable temperature rise
        of the trace above ambient in °C, <code>A</code> is the trace's cross-sectional area in square
        mils, and <code>k</code> is a constant that depends on where the trace runs:
      </p>
      <ul>
        <li><b>k = 0.048</b> for <b>external</b> traces (on an outer layer, exposed to air).</li>
        <li><b>k = 0.024</b> for <b>internal</b> traces (buried between layers, no direct air cooling).</li>
      </ul>
      <p>
        Because the internal constant is exactly half the external one, an internal trace of identical
        geometry is rated for exactly half the current — a buried trace can't shed heat to the air, so
        it derates hard. The cross-sectional area <code>A</code> is just the trace width multiplied by
        the copper thickness, and the copper thickness comes from the copper weight (1 oz/ft² of copper
        is about 1.37 mil, or 0.0348 mm, thick).
      </p>

      <h2>Where the formula comes from — and what it doesn't do</h2>
      <p>
        It's important to understand that this is a <em>curve fit to IPC's original thermal test data</em>,
        not a first-principles physics derivation. Actually modelling how a trace sheds heat — in-plane
        spreading through copper pours and plane layers, conduction down into the FR4, heat escaping
        through vias and connectors — is a full 3-D thermal problem with no closed-form solution. The
        IPC-2221 curve deliberately sidesteps all of that with a single empirical relationship, which is
        why it's easy to compute but also why it's only an estimate.
      </p>
      <p>
        This is exactly why IPC's newer <b>IPC-2152</b> standard, which refines the underlying data to
        account for board thickness, adjacent copper planes, and trace length, publishes only
        <em> charts</em> rather than a formula — the refined behaviour genuinely doesn't reduce to a
        clean equation. A calculator can reproduce IPC-2221 exactly because the equation is disclosed;
        it cannot reproduce IPC-2152 exactly without transcribing unverifiable chart readings.
      </p>

      <h2>When to trust it (and when not to)</h2>
      <ul>
        <li>Use it as a <b>screening / first-pass</b> tool for trace sizing on typical boards.</li>
        <li>
          IPC-2221's underlying test data spans roughly ΔT = 10–100 °C. Pushing far outside that range
          means the curve is extrapolating.
        </li>
        <li>
          For high-reliability or high-power designs, cross-check against your fab's process
          capability and, where available, IPC-2152 chart data or a proper thermal simulation.
        </li>
        <li>
          The equation ignores nearby copper planes that can dramatically improve cooling — so it's
          often <em>conservative</em> for a trace over a solid plane, and less so for an isolated trace.
        </li>
      </ul>

      <GuideDeepDive
        title="Worked example & design checklist"
        teaser="A fully worked external-trace sizing example (10 mil, 1 oz, 10 °C rise), plus a step-by-step checklist and the mistakes that bite most often."
        feature="IPC-2221 deep dive"
      >
        <h3>Worked example: a 10 mil, 1 oz external trace</h3>
        <p>
          Take a 10 mil wide external trace in 1 oz/ft² copper, and allow a 10 °C rise. The copper
          thickness is 1 oz ≈ 1.37 mil, so the cross-sectional area is A = 10 × 1.37 = 13.7 mil².
          Then:
        </p>
        <p>
          <code>I = 0.048 · 10^0.44 · 13.7^0.725 ≈ 0.88 A</code>
        </p>
        <p>
          That 0.88 A sits right in the range of the ~1 A rule of thumb often quoted for this exact
          case — the rule of thumb is just this equation, rounded. The Volteq calculator computes from
          the equation directly rather than rounding, and all three solve directions
          (current → width, width → current, and temperature rise) round-trip back to the same inputs
          exactly. Drop the same trace to an internal layer and the capacity halves to ≈ 0.44 A, exactly
          as the k = 0.024 vs 0.048 constants require.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Pick an allowable rise ΔT — 10 °C is a common conservative default; 20–30 °C is used where the board runs hot but reliably.</li>
          <li>Use the <b>external</b> constant only for outer-layer traces exposed to air; use <b>internal</b> for anything buried.</li>
          <li>Convert copper weight to thickness (1 oz ≈ 0.0348 mm) before computing area.</li>
          <li>Add margin for vias, connector pads, and any local hot spots the 1-D curve can't see.</li>
          <li>For anything safety- or power-critical, verify against IPC-2152 charts or thermal sim.</li>
        </ol>

        <h3>Common mistakes</h3>
        <ul>
          <li><b>Using the external rating for an internal trace</b> — you'll be off by 2×.</li>
          <li><b>Confusing ambient with the temperature rise</b> — ΔT is the rise <em>above</em> ambient, not the final trace temperature.</li>
          <li><b>Treating IPC-2221 as exact</b> — it's a screening curve; real cooling depends on plane copper the formula ignores.</li>
          <li><b>Forgetting fusing current ≠ continuous current</b> — this curve is steady-state ampacity, not the current a trace survives briefly.</li>
        </ul>
      </GuideDeepDive>
    </GuideLayout>
  );
}
