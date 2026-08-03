import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('iso-4156')!;

export default function Iso4156Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why splines, and why involute ones</h2>
      <p>
        A spline is a set of teeth cut straight along a shaft that mesh with matching internal teeth in a hub
        — a way to transmit torque while letting the two parts slide axially and self-centre, which a single
        key can't do. You could cut those teeth with straight (parallel) sides, but almost all modern splines
        use an <b>involute</b> profile: the same tooth form as a gear. It's stronger at the root, it centres
        itself under load, and — the practical clincher — it's made with ordinary gear-cutting tools.
        <b> ISO 4156</b> (identical in substance to ANSI B92.2M, and sharing its 30° geometry with ANSI B92.1
        and DIN 5480) is the standard that defines these splines by metric module.
      </p>

      <h2>Module and pressure angle set everything</h2>
      <p>
        An involute spline is defined by just a few numbers. The <b>module</b> m is the tooth size (bigger m =
        bigger, fewer teeth); the <b>number of teeth</b> z; and the <b>pressure angle</b> α — the slope of the
        tooth flank, standardised at 30°, 37.5° or 45°. From those, the geometry falls out directly:
      </p>
      <ul>
        <li><b>Pitch (reference) diameter</b> D = m·z — the notional circle where tooth and space are equal.</li>
        <li><b>Base diameter</b> D<sub>b</sub> = m·z·cos α — the circle the involute is generated from.</li>
        <li><b>Major (tip) diameter</b> D<sub>ee</sub> = m·(z + 1) for a 30° external spline, with the tip stubbier at higher pressure angles.</li>
        <li><b>Circular tooth thickness</b> s = ½·π·m at the pitch circle — exactly half the pitch, by definition.</li>
      </ul>
      <p>
        The 30° profile is the workhorse; 37.5° and 45° use shorter, stubbier teeth (fillet root only) that
        suit thin-walled hubs and high tooth counts. A <b>flat root</b> (available at 30°) is a little stronger
        in bending; a <b>fillet root</b> is more common and easier to hob. Because it's a <em>side-fit</em>
        spline, the flanks carry the torque and do the centring — the major and minor diameters clear each
        other and don't locate anything.
      </p>

      <h2>Measurement over pins: how you actually inspect one</h2>
      <p>
        You can't put a caliper on a single spline tooth and get a meaningful thickness. Instead, splines are
        inspected by <b>measurement over pins</b>: drop two precision balls or pins into opposite tooth spaces
        and measure across them. That dimension is a proxy for the tooth thickness at the pitch circle — the
        thing that actually controls the fit — and it's what goes on the drawing for the inspector to check.
      </p>
      <p>
        The geometry is pure involute. A pin of diameter D<sub>R</sub> seated in a space contacts both flanks
        at a pressure angle φ found from
        <code> inv φ = s/D + inv α + D_R/D_b − π/z</code>, where <code>inv α = tan α − α</code> is the
        involute function. The measurement over two pins is then <code>M = D_b/cos φ + D_R</code> for an even
        tooth count (odd counts multiply the first term by cos(90°/z), because opposite a space is a tooth).
        The standard tabulates a pin size for each spline; the key point is that the measurement follows
        exactly from the tooth thickness, so it's a genuine functional check, not an approximation.
      </p>

      <h2>Rating a spline for torque</h2>
      <p>
        Geometry aside, the design question is: will it carry the torque? A spline has three ways to give way,
        and the classic <b>SAE / ANSI B92.1 (Dudley)</b> method checks each:
      </p>
      <ul>
        <li><b>Tooth shear</b> — the teeth shear off at the pitch line: <code>τ = 2·T·Ks / (L·z·t·D)</code>.</li>
        <li><b>Flank bearing (compressive) stress</b> — the flanks crush or wear: <code>σc = 2·T·Ks / (L·z·h·D)</code>, with engagement height h ≈ one module.</li>
        <li><b>Shaft core</b> — the shaft itself twists off at the minor diameter: <code>τ = 16·T·Ks / (π·D_ie³)</code>.</li>
      </ul>
      <p>
        Here T is torque, L the engagement length, z the tooth count, t the tooth thickness, D the pitch
        diameter and D<sub>ie</sub> the minor diameter. The capacity is the <em>lowest</em> of the three — the
        governing failure mode — and more teeth, more length, a bigger module or a harder material all raise
        it. Notice length and diameter matter as much as the teeth: a longer, larger spline is a stronger one.
      </p>

      <h2>The service factor: fixed vs flexible splines</h2>
      <p>
        The <code>Ks</code> in those formulas is a <b>service factor</b> that bundles the duty into one number,
        and it splits on how the spline is used. A <b>fixed</b> (non-sliding) spline is limited by fatigue:
        <code> Ks = Ka / Kf</code>, where Ka is an application/shock factor and Kf a fatigue-life factor that
        shrinks with cycle count. A <b>flexible</b> (sliding) spline is limited by wear instead:
        <code> Ks = Ka·Km·Kd / Kw</code>, adding a misalignment load-distribution factor Km and a wear-life
        factor Kw. Same spline, same torque — a sliding one is derated harder because it frets and wears where
        a fixed one just fatigues.
      </p>

      <GuideDeepDive
        title="Worked design, the DXF profile & a checklist"
        teaser="How the capacity formula runs backwards to pick a tooth count for a target torque, why the measurement over pins is quoted at maximum material, what a spline DXF is (and isn't), and a checklist for a spline that meshes and lasts."
        feature="ISO 4156 deep dive"
      >
        <h3>Sizing for a target torque</h3>
        <p>
          Design inverts the rating. Fix the torque and material allowables, then solve each mode for the
          torque it permits and read off the smallest spline that clears the target — usually by stepping up
          the tooth count at a fixed module (which grows the pitch diameter) until capacity meets the demand.
          Because capacity scales with L·z·t·D, you have several levers: a longer engagement, more teeth, a
          coarser module, or a harder material. Watch which mode governs — if it's the shaft core, more teeth
          won't help and you need a bigger minor diameter or a stronger shaft.
        </p>

        <h3>Why the pin measurement is quoted at maximum material</h3>
        <p>
          The nominal measurement over pins is computed at the <b>basic (maximum-material) tooth thickness</b>,
          s = ½·π·m. A real spline is cut a little thinner to leave room for a fit, so its actual measurement
          is slightly smaller — the ISO 4156-2 tolerance class (4H/4h through 7H/7h) sets that band. Quoting
          the max-material value gives the inspector the top of the range; the drawing then carries the class
          that defines how far below it the part may fall.
        </p>

        <h3>What a spline DXF is — and isn't</h3>
        <p>
          A DXF of the tooth profile is the true involute outline plus the pitch, base, major and minor
          reference circles — exactly the geometry a wire-EDM, laser or CAM tool needs as a starting curve.
          It's a <em>nominal</em> profile, though: it carries no tolerances, no fillet detail beyond the form
          diameter, and no fit allowance. Treat it as reference/CAM geometry to build a real, toleranced
          manufacturing drawing from — not as the drawing itself.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Pick module, tooth count and pressure angle for the shaft diameter and torque; keep the pitch diameter D = m·z sensible for the shaft.</li>
          <li>Choose a flat root (30°, stronger) or fillet root (more common) and a fixed or flexible fit — they derate differently.</li>
          <li>Size the engagement length; L on the order of the pitch diameter is a common starting point.</li>
          <li>Check all three modes (tooth shear, flank bearing, shaft core) and confirm the governing capacity clears the torque with margin.</li>
          <li>Apply the right service factor: Ka/Kf for a fixed spline, Ka·Km·Kd/Kw for a sliding one.</li>
          <li>Quote the drawing dimensions including measurement over pins, and specify the ISO 4156 fit and tolerance class.</li>
          <li>Confirm against the applicable standard and a durability (fretting/fatigue) assessment before production.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
