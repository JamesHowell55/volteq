import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('heat-exchanger-ntu')!;

export default function HeatExchangerNtuGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why effectiveness-NTU beats "just use LMTD"</h2>
      <p>
        The classic way to analyse a heat exchanger is the log-mean temperature difference (LMTD), but
        it has an awkward property for design work: it needs the outlet temperatures you're usually
        trying to find, forcing an iterative guess-and-check. The effectiveness-NTU method flips the
        problem around. It asks: of the <em>maximum</em> heat this exchanger could possibly transfer,
        what fraction does it actually achieve? That fraction — the effectiveness ε — comes from a
        closed-form expression, so a radiator or oil cooler can be sized in a single forward pass with
        no iteration.
      </p>

      <h2>The three numbers that define an exchanger</h2>
      <p>
        Each fluid stream carries heat at a <b>capacity rate</b> C = ṁ·cp (W/K) — how many watts it
        absorbs or gives up per degree of temperature change. The smaller of the two streams, Cmin,
        sets the ceiling: the most heat that could ever be transferred is
        <code> Q_max = Cmin·(T_hot,in − T_cold,in)</code>, because the weaker stream would then leave at
        the other stream's inlet temperature — thermodynamics allows no more. The ratio
        <code> Cr = Cmin/Cmax</code> describes how lopsided the two streams are. Finally,
        <b> NTU = UA/Cmin</b> (Number of Transfer Units) measures how much heat-transfer hardware the
        exchanger has relative to the load its weakest stream can carry — UA being the overall
        conductance, the product of the effective heat-transfer coefficient and area.
      </p>

      <h2>Why crossflow gets its own formula</h2>
      <p>
        Effectiveness depends not just on NTU and Cr but on the flow arrangement. Counterflow is the
        best possible; parallel flow the worst; and a radiator — where air crosses the tubes at right
        angles and neither stream mixes sideways — sits in between, with its own well-known
        approximation: <code>ε = 1 − exp[(1/Cr)·NTU^0.22·(exp(−Cr·NTU^0.78) − 1)]</code>. Two limits
        are worth knowing. When Cr → 0 (one stream overwhelmingly larger, or changing phase), every
        arrangement collapses to the same curve, ε = 1 − e^(−NTU). And as NTU grows, ε creeps toward 1
        with brutally diminishing returns — doubling the core area of an already-effective exchanger
        buys very little extra heat.
      </p>

      <h2>Where UA comes from</h2>
      <p>
        UA is a series resistance network, exactly like an electrical circuit: the air-side film
        (usually the bottleneck, which is why cores are covered in fins), the tube wall (usually
        negligible for thin metal), and the coolant-side film. The fins don't count at full value —
        a fin's tip runs cooler than its base, so its area is discounted by a fin efficiency factor
        before it enters UA. Once UA is known, the whole solve is arithmetic: NTU, then ε, then
        <code> Q = ε·Q_max</code>, then each outlet temperature from a plain energy balance.
      </p>

      <GuideDeepDive
        title="What actually limits a radiator, and a sizing checklist"
        teaser="Which side of the core is the real bottleneck, why more fin isn't always the answer, what louvers buy you, and a step-by-step checklist for a first-pass core sizing."
        feature="Heat exchanger deep dive"
      >
        <h3>The air side is almost always the bottleneck</h3>
        <p>
          Liquid-side heat transfer coefficients run one to two orders of magnitude higher than air-side
          ones — water in a small tube manages hundreds to thousands of W/m²K where air over a fin
          manages tens to low hundreds. That imbalance is the entire reason finned surfaces exist: the
          air side compensates with area what it lacks in coefficient. It also means improvements should
          be aimed where the resistance is: a better coolant, higher coolant flow, or thicker tube walls
          barely move the needle once the air side dominates 1/UA.
        </p>

        <h3>The levers, in rough order of power</h3>
        <ul>
          <li><b>Frontal area</b> — more face means more air mass flow and more fin area at the same time; the strongest single lever.</li>
          <li><b>Face velocity</b> — more air helps twice (higher h and higher C_air), but with diminishing returns and a steep fan-power/pressure-drop penalty.</li>
          <li><b>Fin density</b> — more area, but tighter channels raise pressure drop and eventually choke the airflow that feeds them.</li>
          <li><b>Louvers</b> — restarting the boundary layer at each louver edge buys roughly 2–3× on the air-side coefficient, at a comparable pressure-drop penalty; this is why virtually every automotive core is louvered.</li>
          <li><b>Core depth / multiple rows</b> — added rows keep helping, but each deeper row sees air that's already been heated, so the second row transfers less than the first.</li>
        </ul>

        <h3>First-pass sizing checklist</h3>
        <ol>
          <li>Fix the duty: heat to reject, coolant inlet temperature and flow, worst-case air temperature and available face velocity.</li>
          <li>Compute both capacity rates; identify Cmin and Q_max = Cmin·ΔT_inlet. If Q_max is below the duty, no core geometry can save you — change the flows or temperatures first.</li>
          <li>Estimate air-side and coolant-side coefficients, discount the fin area by fin efficiency, and build UA as a series network.</li>
          <li>NTU → ε → Q. Compare against the duty with margin for fouling, non-uniform airflow, and correlation scatter.</li>
          <li>If short: grow frontal area first, then face velocity, then fin density/louvers — and re-check the fan operating point after any air-side change.</li>
          <li>Validate a final design against surface-specific correlation data (Kays &amp; London-type) or test — a first-principles screen gets the trends and rough magnitude, not the last 20%.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
