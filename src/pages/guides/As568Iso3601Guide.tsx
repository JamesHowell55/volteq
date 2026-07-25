import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('as568-iso-3601')!;

export default function As568Iso3601Guide() {
  return (
    <GuideLayout guide={guide}>
      <h2>What AS568 and ISO 3601 are</h2>
      <p>
        AS568 (the US aerospace size standard) and ISO 3601 (its international counterpart) define the
        <b> standard O-ring sizes</b> — the inside diameters and cross-sections you can actually buy off
        the shelf — along with their dimensional tolerances. When someone specifies a "-214 O-ring," that
        dash number is an AS568 size. Designing a seal is mostly about choosing one of these standard
        rings and then cutting a groove (the "gland") around it that squeezes it the right amount.
      </p>

      <h2>The three numbers that make a seal work</h2>
      <ul>
        <li>
          <b>Squeeze</b> — how much the groove compresses the ring's cross-section. Too little and it
          won't seal or will leak as pressure cycles; too much and the rubber over-stresses, takes a
          permanent set, and fails early. Design guides give recommended squeeze bands per cross-section
          and application (a static seal tolerates more squeeze than a dynamic one).
        </li>
        <li>
          <b>Stretch</b> — how much the ring is stretched over its groove diameter on installation. A
          little stretch keeps the ring seated, but too much thins the cross-section (reducing squeeze)
          and accelerates aging. Common limits are about 8% for small rings (d1 &lt; 50 mm) and 6% for
          large ones, with roughly 0.5% cross-section reduction per 1% of stretch.
        </li>
        <li>
          <b>Gland fill</b> — how much of the groove volume the ring occupies. Elastomers are nearly
          incompressible, so the groove must have room for the squeezed ring to flow into, plus margin for
          thermal expansion and fluid swell. Industry practice keeps fill at ≤75% nominal (≤85% worst
          case). Over-fill it and the ring has nowhere to go — it jams and extrudes.
        </li>
      </ul>

      <h2>The failure mode the standards guard against: extrusion</h2>
      <p>
        Under pressure, an O-ring is pushed against the low-pressure side of the groove and tries to
        squeeze out through the clearance gap between the mating parts. Whether it survives depends on the
        <b> clearance gap, the pressure, and the rubber hardness</b> — a harder compound (higher Shore A)
        resists extrusion better. Design guides tabulate permissible extrusion clearances against those
        variables; exceed them and the ring shaves itself away.
      </p>

      <h2>How the geometry is actually computed</h2>
      <p>
        A gland calculation stacks these effects: the standard AS568 / ISO 3601 size and its tolerance,
        the stretch from the groove diameter (which thins the effective cross-section), the resulting
        squeeze against the groove depth, and the gland fill against the groove width. A rigorous check
        runs the <b>worst case</b> — every tolerance stacked at its unfavourable limit simultaneously —
        because that's the combination that actually shows up on a bad-but-in-spec part. Tolerances come
        from the AS568 / ISO 3601-1 Class A tables; ISO 286 fits on the bore and groove add their own
        contribution.
      </p>

      <GuideDeepDive
        title="Worked example & design checklist"
        teaser="A fully worked static radial-seal gland (stretch, effective cross-section, squeeze and fill), plus a checklist for specifying a gland that seals and survives."
        feature="AS568 / ISO 3601 deep dive"
      >
        <h3>Worked example: a static outer-radial (piston) seal</h3>
        <p>
          Take a 20 mm inside-diameter ring with a 3 mm cross-section, seated on a 20.4 mm groove root
          (that's 2.0% stretch), in a 25.8 mm bore with a 4.4 mm groove width. Working it through:
        </p>
        <ul>
          <li>2.0% stretch thins the 3 mm cross-section to an effective <b>2.97 mm</b> (≈0.5% reduction per 1% stretch).</li>
          <li>The bore/groove-root geometry compresses that to give <b>9.1% squeeze</b> (0.27 mm) — inside the static-seal band.</li>
          <li>The squeezed ring occupies about <b>58% of the groove volume</b> — comfortably under the 75% fill limit, leaving room for thermal/swell expansion.</li>
        </ul>
        <p>
          All three land in their healthy ranges, so this gland seals without over-stressing the ring or
          risking a hydraulic lock.
        </p>

        <h3>Design checklist</h3>
        <ol>
          <li>Pick a standard AS568 / ISO 3601 size — don't design a custom ring you then can't source.</li>
          <li>Target the squeeze band for your application (static tolerates more than dynamic).</li>
          <li>Keep stretch within ~8% (small) / ~6% (large) and remember it thins the cross-section.</li>
          <li>Keep gland fill ≤75% nominal — leave room for thermal expansion and fluid swell.</li>
          <li>Check the extrusion clearance against pressure and compound hardness; harder rings or back-up rings for high pressure.</li>
          <li>Run the worst-case tolerance stack, and confirm compound compatibility with the sealed medium (swell eats fill margin).</li>
        </ol>

        <h3>Common mistakes</h3>
        <ul>
          <li><b>Over-filling the gland</b> — an incompressible ring with nowhere to expand jams and extrudes.</li>
          <li><b>Ignoring stretch-thinning</b> — stretch quietly reduces the squeeze you thought you had.</li>
          <li><b>Only checking nominal dimensions</b> — the failure shows up at the worst-case tolerance stack.</li>
          <li><b>Forgetting fluid swell</b> — a compound that swells in the medium loses gland-fill margin over time.</li>
        </ul>
      </GuideDeepDive>
    </GuideLayout>
  );
}
