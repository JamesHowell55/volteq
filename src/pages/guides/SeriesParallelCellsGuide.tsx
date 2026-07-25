import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('series-parallel-cells')!;

export default function SeriesParallelCellsGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>How a pack is built from one cell</h2>
      <p>
        A battery pack is just many copies of a single cell wired in a <b>series–parallel (S×P)</b>
        arrangement. Pick a cell, choose how many go in series (S) and how many of those strings in
        parallel (P), and the whole pack's voltage, capacity, energy, and internal resistance follow from
        the one cell's spec by simple circuit rules. "10S4P" means 10 cells in series, 4 such strings in
        parallel — 40 cells total.
      </p>

      <h2>Series adds voltage; parallel adds capacity</h2>
      <ul>
        <li>
          <b>Series (S)</b> stacks cells to add <b>voltage</b>: pack voltage = S × cell voltage. Their
          internal resistances also add in series.
        </li>
        <li>
          <b>Parallel (P)</b> adds <b>capacity</b> (amp-hours) and current capability: pack capacity =
          P × cell capacity. Parallel resistances combine as R/P — more parallel cells means lower
          resistance.
        </li>
      </ul>
      <p>
        Energy is the product: <b>total energy = S × P × (cell voltage × cell capacity)</b>. So 10S4P and
        20S2P and 40S1P all store the same energy from the same 40 cells — but at very different voltages
        and currents. The S×P split is how you hit a target <em>voltage</em> (which the motor/inverter
        needs) and a target <em>current/energy</em> (which the range and power need) from the same cell.
      </p>

      <h2>Internal resistance and voltage sag</h2>
      <p>
        The pack's internal resistance is <code>R_pack = S × R_cell / P</code>. It matters because under
        load the terminal voltage <b>sags</b> below the open-circuit value by <code>I × R_pack</code>. Draw
        a big current (hard acceleration) and a high-resistance pack droops — losing usable power and
        generating heat (<code>I²·R</code>) inside the cells. More parallel cells lower the resistance and
        the sag; that's often why a pack has more parallel cells than the energy alone would require.
      </p>

      <GuideDeepDive
        title="Worked example, the limits & checklist"
        teaser="A worked 10S4P pack (voltage, capacity, energy, sag), the real-world effects this simple model ignores, and a checklist for choosing an S×P split."
        feature="Series/parallel deep dive"
      >
        <h3>Worked example: a 10S4P 18650 pack</h3>
        <p>
          Take a 3.6 V, 3.0 Ah cell with ~30 mΩ internal resistance. A 10S4P pack gives:
        </p>
        <ul>
          <li><b>Voltage:</b> 10 × 3.6 = 36 V nominal.</li>
          <li><b>Capacity:</b> 4 × 3.0 = 12 Ah.</li>
          <li><b>Energy:</b> 36 V × 12 Ah = 432 Wh (= 40 cells × 10.8 Wh each).</li>
          <li><b>Resistance:</b> 10 × 30 mΩ / 4 = 75 mΩ. At a 40 A draw the pack sags 40 × 0.075 = 3 V, and dissipates 40²×0.075 = 120 W of heat.</li>
        </ul>
        <p>
          Want the same energy at higher voltage for a faster motor? Go 20S2P: 72 V, 6 Ah, still 432 Wh —
          but now 300 mΩ and a much bigger sag at the same current. The split is a real design lever.
        </p>

        <h3>What this simple model leaves out</h3>
        <ul>
          <li><b>Cell imbalance</b> — real cells vary; the weakest cell in a series string limits the pack, which is why a BMS balances them.</li>
          <li><b>Temperature</b> — resistance and capacity both change with temperature; cold packs sag much more.</li>
          <li><b>Aging</b> — resistance rises and capacity fades over cycles, so a pack that's fine when new may not be at end of life.</li>
        </ul>

        <h3>Checklist</h3>
        <ol>
          <li>Set S from the target pack voltage the inverter/motor needs.</li>
          <li>Set P from the energy (range) and the current/sag the load demands — resistance falls as R/P.</li>
          <li>Check voltage sag (I × R_pack) at peak current stays within usable limits.</li>
          <li>Budget the I²·R heat inside the cells for the cooling and BMS.</li>
          <li>Use real datasheet cell values and add margin for imbalance, temperature and aging.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
