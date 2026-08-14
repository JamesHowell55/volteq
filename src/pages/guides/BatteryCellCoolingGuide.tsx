import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('battery-cell-cooling')!;

export default function BatteryCellCoolingGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>A cell doesn't heat up from a single point</h2>
      <p>
        The intuitive way to think about a cell's internal thermal resistance is "heat travels from the
        middle to the surface" — a single point source at the core, conducting outward. That picture is
        wrong in a way that matters: a cell's I²R heating happens <em>throughout its volume</em>, not at
        one spot. Every layer of the jellyroll or electrode stack generates its own share of the heat, and
        the layers near the surface have a much shorter trip out than the ones at the centre. Solve the
        conduction equation properly for that distributed picture and the resistance from the hottest
        interior point to the cooled surface comes out <b>lower</b> than the naive "point source" formula
        would suggest — by a factor of 2 if you're cooling from one face, and by a factor of 8 if you're
        cooling from both. Get this wrong and you'll over-predict the cell's temperature rise by as much as
        8×, which is exactly the kind of error worth building a calculator to avoid.
      </p>

      <h2>Every cell format has a grain — and a natural cooling face</h2>
      <p>
        Both cylindrical jellyrolls and stacked prismatic/pouch cells are built from many thin layers, and
        that layering makes them <b>anisotropic</b>: they conduct heat much better in one direction than
        another. A cylindrical cell's metal current-collector foils run the full length of the winding
        axis, so heat moves easily <em>along</em> that axis but has to fight through dozens of
        low-conductivity electrode/separator interfaces to move <em>across</em> the winding (radially). A
        prismatic or pouch cell is the same idea in a different shape: heat moves easily <em>along</em> the
        flat electrode sheets (in-plane) but poorly <em>through</em> the stack (through-thickness). That's
        why real packs cool cylindrical cells from the can wall (the short, radial path) and prismatic/pouch
        cells from their large flat faces (the short, through-thickness path) — not end-to-end through the
        cell's long axis. This calculator lets you pick any cooling face, but it'll warn you when you've
        picked the slow one.
      </p>

      <GuideDeepDive
        title="Why the internal cell resistance is often the bottleneck, and what this model doesn't capture"
        teaser="The genuinely uncertain part of this physics, why conduction — not convection — is usually what limits a battery pack's cooling, and the honest limits of a first-pass model."
        feature="Battery cell cooling deep dive"
      >
        <h3>The part of this physics that's still genuinely unsettled</h3>
        <p>
          A cylindrical cell's <em>radial</em> thermal conductivity — the one that matters for the
          recommended side-cooling path — is reasonably well agreed upon in the published literature, in
          the range of roughly 0.2 to 0.5 W/m·K. Its <em>axial</em> conductivity is not: different
          measurement methods in the literature report anywhere from about 2 to 30 W/m·K for what should be
          the same physical property, likely because the axial direction is hard to isolate experimentally
          from the rest of the cell's structure. This calculator defaults toward the higher, more commonly
          cited value, but discloses the uncertainty rather than hiding it — and conveniently, it barely
          matters for the recommended (side) cooling path anyway, since that path doesn't use the axial
          value at all.
        </p>

        <h3>Why conduction usually wins the argument over convection</h3>
        <p>
          It's tempting to assume that pumping more coolant or picking a fancier thermal interface material
          is the lever that matters most. Run the numbers on a typical cylindrical cell, though, and the
          <em> cell's own internal conduction resistance</em> is often the largest term in the stack — bigger
          than the TIM, bigger than the convection resistance to a well-designed liquid cooling loop. That's
          a direct consequence of how low radial jellyroll conductivity is. This calculator surfaces which
          term dominates for your specific case, because it changes where engineering effort is best spent:
          if conduction dominates, a better coolant or thicker cold plate won't help much — the fix has to
          come from the cell's own construction or from a shorter conduction path (better cell orientation,
          more contact area, side- rather than base-cooling).
        </p>

        <h3>What this model doesn't capture</h3>
        <p>
          The default heat-generation term is Joule (I²R) heating only. Real cells also have a smaller
          reversible/entropic heat term — tied to how the cell's open-circuit voltage shifts with
          temperature — that's typically only 10-15% of the Joule term at the discharge rates a cooling
          system is usually sized against, but it can flip sign with state of charge and between charging
          and discharging. It's left out of the default result and offered as an optional add-on rather than
          silently folded in. The conduction model itself is also 1-D: it doesn't capture 2-D/3-D spreading
          effects, tab/terminal geometry, or how heat behaves in a full multi-cell module with
          neighbour-to-neighbour interactions. Treat this as a first-pass sizing tool — the right order of
          magnitude and the right qualitative story (which term dominates, which face to cool from) — and
          verify a final design against a cell datasheet, FEA, or measurement.
        </p>
      </GuideDeepDive>
    </GuideLayout>
  );
}
