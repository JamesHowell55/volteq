import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('cm-dm-chokes')!;

export default function CmDmChokesGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Two kinds of noise, two kinds of choke</h2>
      <p>
        A switching inverter generates conducted EMI that comes in two flavours, and they need different
        filtering:
      </p>
      <ul>
        <li>
          <b>Differential-mode (DM)</b> noise flows down one line and back the other — the same path as
          the useful current. A DM choke puts inductance in series with that loop.
        </li>
        <li>
          <b>Common-mode (CM)</b> noise flows the same direction on all lines together, returning through
          ground/chassis. A CM choke is wound so the <em>load</em> current's flux cancels (the balanced
          currents cancel in the core) while the common-mode current sees the full inductance.
        </li>
      </ul>
      <p>
        That cancellation is the whole trick of a CM choke: because the wanted current produces no net
        flux, you can use a small high-permeability core and get large impedance to CM noise without the
        core saturating on the load current.
      </p>

      <h2>How the core sets the inductance</h2>
      <p>
        Inductance comes from the magnetic circuit: <code>L = N² / R_m</code>, where N is the turns and
        R_m is the core's reluctance (its "resistance" to flux, set by the magnetic path length, the
        effective cross-section area Ae, and the material permeability). A toroid has an exact closed-form
        geometry; U- and E-cores are approximated as a rectangular loop, but real datasheets publish
        part-specific Ae/le/window area because those families have no single universal formula — so a
        final design cross-checks the manufacturer's numbers.
      </p>

      <h2>The two limits that actually size the choke</h2>
      <ul>
        <li>
          <b>Saturation</b> — push too much flux and the core saturates, its permeability collapses, and
          the inductance vanishes exactly when you need it. For a DM choke that's driven by the full load
          current; for a CM choke it's driven by the <em>imbalance</em> (a worst-case DC offset or
          common-mode current), since the balanced load flux cancels.
        </li>
        <li>
          <b>Core loss</b> — the AC flux swing heats the core every cycle. This is estimated with a
          Steinmetz-style law (loss rising with frequency and flux-swing amplitude to material-specific
          powers). Too much loss and the core overheats regardless of saturation.
        </li>
      </ul>
      <p>
        The window also has to physically fit the turns, and the target impedance (a CISPR 25 class gives
        a starting rule-of-thumb) sets how much inductance you need in the first place.
      </p>

      <GuideDeepDive
        title="Worked sizing flow & checklist"
        teaser="How the impedance target, saturation limit and core loss trade against each other, why powder toroids need a derated Ae, and a checklist for sizing a CM or DM choke."
        feature="CM / DM choke deep dive"
      >
        <h3>The sizing flow</h3>
        <p>
          Start from the impedance you need at the noise frequency (from the EMC target) — that sets the
          required inductance. Pick a core and material, then work the two limits: check the peak flux
          density against saturation at the worst-case current (load for DM, imbalance for CM), and check
          the Steinmetz core loss (plus copper loss) against an acceptable temperature rise. Turns is the
          lever that trades them: more turns raises inductance (N²) but also raises flux and can overfill
          the window. You iterate core size, material and turns until impedance, saturation, loss and
          window-fit all pass at once.
        </p>

        <h3>The powder-toroid gotcha</h3>
        <p>
          A square-cut ferrite or tape-wound toroid's effective area matches the geometric annulus. But
          rounded-cross-section powder toroids (MPP, Kool Mµ) have ~15–30% <em>less</em> real Ae than the
          OD/ID/height suggest — so a naive geometric estimate over-predicts inductance and
          under-predicts flux density. Use the datasheet Ae for those, or you'll saturate earlier than
          expected.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Set the target impedance/inductance from the EMC class and noise frequency.</li>
          <li>For a CM choke, size saturation on the worst-case imbalance, not the (cancelling) load current.</li>
          <li>Check peak flux against the material's saturation with margin at max current.</li>
          <li>Estimate Steinmetz core loss + copper loss against the allowed temperature rise.</li>
          <li>Confirm the turns physically fit the window; use datasheet Ae for powder cores.</li>
          <li>Validate the final design against manufacturer loss curves and EMC test-house measurement.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
