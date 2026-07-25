import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iec-60287')!;

export default function Iec60287Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Two different questions a busbar has to answer</h2>
      <p>
        A busbar (or any heavy conductor) has to survive two very different thermal duties, and they're
        governed by different standards:
      </p>
      <ul>
        <li>
          <b>Continuous ampacity</b> — how much current it can carry indefinitely without the metal
          exceeding its allowable operating temperature. This is a steady-state heat-balance problem,
          and IEC 60287 supplies the AC-resistance piece of it.
        </li>
        <li>
          <b>Short-circuit withstand</b> — how hot the bar gets during a brief, enormous fault current
          before protection clears it. This is a fast transient where the bar has no time to shed heat,
          and IEC 60865-1 gives the adiabatic method for it.
        </li>
      </ul>

      <h2>Continuous rating: it's a heat balance, not a table</h2>
      <p>
        At steady state the bar sits at whatever temperature makes the heat it <em>generates</em> equal
        the heat it <em>sheds</em>. Heat generated is <code>P = I²·R_ac</code> (current is RMS, which is
        defined precisely so this gives the correct average heating). Heat shed is natural convection plus
        radiation from the bar's surface, in series with any coating or overmould's conduction resistance
        (<code>t/(k·A)</code>). Balance the two and you get the operating temperature; find the current
        that lands it exactly at the allowable limit and you have the ampacity.
      </p>
      <p>
        The subtlety IEC 60287 handles is the <b>AC resistance</b>. At DC the whole cross-section carries
        current evenly, but at AC the current crowds toward the surface (skin effect) and toward or away
        from neighbouring conductors (proximity effect), raising the effective resistance above the DC
        value. IEC 60287-1-1 gives the empirical skin-effect factor kₛ that corrects DC resistance to the
        AC value actually used in I²R. (For a bar built from several sections of different width, the heat
        also conducts axially between them — a fin-type problem — but each section still balances I²R
        against its own surface losses.)
      </p>

      <h2>Short-circuit: the adiabatic assumption (IEC 60865-1)</h2>
      <p>
        A fault current can be tens of kA for a fraction of a second. Over that time the bar simply can't
        shed a meaningful fraction of the heat — so IEC 60865-1 makes the <b>adiabatic</b> assumption: all
        the I²R energy goes into raising the metal's temperature, none escapes. That turns a hard thermal
        problem into a clean closed form relating the final temperature to the current density and the
        fault duration, using material constants (for copper K ≈ 226 A·√s/mm² and β = 234.5 °C; for
        aluminium 148 and 228 °C). Because conduction is negligible over a fault, each section is checked
        on its own.
      </p>

      <GuideDeepDive
        title="Worked example, coatings & checklist"
        teaser="How the adiabatic fault formula sets a minimum cross-section, what a coating or liquid-cooled face does to the continuous rating, and a checklist for sizing a busbar for both duties."
        feature="IEC 60287 / 60865-1 deep dive"
      >
        <h3>The adiabatic fault check, concretely</h3>
        <p>
          The IEC 60865-1 adiabatic relation ties together the fault current, the conductor area, the
          duration, and the temperature rise from an initial to a final temperature. Rearranged, it gives
          the <b>minimum cross-section</b> that keeps a given fault current within the allowable
          short-circuit temperature for the clearing time — the number that often sizes the bar more than
          the continuous rating does. Halving the clearing time lets you use a smaller bar (the energy
          scales with time); doubling the fault current demands a much larger one.
        </p>

        <h3>Coatings and cooling change the continuous rating</h3>
        <p>
          Anything in the heat-shedding path moves the ampacity. A coating or overmould adds a series
          conduction resistance (<code>t/(k·A)</code>) before the surface film — insulating the bar and
          <em> lowering</em> ampacity, though a high-emissivity finish can help radiation. A liquid-cooled
          face replaces air convection on that face with a much stronger conduction path to a coolant
          sink, <em>raising</em> ampacity — but only on the face that's actually cooled, which is then
          removed from the air-exposed area.
        </p>

        <h3>Sizing checklist</h3>
        <ol>
          <li>Set the allowable continuous and short-circuit temperatures for your conductor material and insulation.</li>
          <li>Size continuous ampacity from the I²R-vs-surface-loss balance, using AC resistance (IEC 60287 skin factor), at the real ambient.</li>
          <li>Separately check the IEC 60865-1 adiabatic minimum area for the prospective fault current and protection clearing time.</li>
          <li>Take the larger requirement of the two — faults often govern.</li>
          <li>Account for coatings/overmould (lower ampacity) or liquid cooling (higher, on the cooled face only).</li>
          <li>Verify critical designs against manufacturer test data.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
