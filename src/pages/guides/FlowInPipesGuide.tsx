import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('flow-in-pipes')!;

export default function FlowInPipesGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>Why a cooler needs a pump, and a pump needs a pressure drop</h2>
      <p>
        You can size a heatsink or a heat exchanger perfectly, but nothing moves the coolant through
        it for free. Every metre of pipe, every bend and every valve resists the flow, and the pump
        has to make up that resistance as a pressure rise. Sizing the pump therefore comes down to
        one number: the total pressure drop of the loop at the flow rate you need. Get that, and the
        pump head and power fall straight out of it.
      </p>

      <h2>Darcy-Weisbach: the master equation</h2>
      <p>
        The pressure drop along a straight pipe is given by the Darcy-Weisbach equation,
        <code> ΔP = f·(L/D)·(ρ·v²/2)</code>. Three of those terms are just geometry and flow: the
        pipe's length-to-diameter ratio L/D, and the dynamic pressure ρ·v²/2 (how much "push" the
        moving fluid carries, which rises with the square of velocity). The fourth, the Darcy
        friction factor <em>f</em>, is where all the physics hides — it captures how much the pipe
        wall drags on the flow, and it depends on whether the flow is smooth (laminar) or chaotic
        (turbulent).
      </p>

      <h2>Where the friction factor comes from</h2>
      <p>
        The dividing line is the Reynolds number, <code>Re = v·D/ν</code>, which weighs the fluid's
        inertia against its viscosity. Below about Re = 2300 the flow is laminar and orderly, and
        the friction factor is exactly <code>f = 64/Re</code> — no roughness dependence at all,
        because the fluid glides in smooth layers that never touch the wall's texture. Above about
        Re = 4000 the flow is turbulent, the wall roughness starts to matter, and the friction
        factor is read from the Moody chart — or, for a design tool, from the Swamee-Jain equation,
        an explicit formula that reproduces the chart without the iteration the original Colebrook
        equation needs. In between (2300–4000) the flow is genuinely unpredictable, so this
        calculator just interpolates across the gap.
      </p>

      <GuideDeepDive
        title="Minor losses, pump head vs power, and a coolant-loop checklist"
        teaser="Why fittings can dominate a short run, the difference between pump head and pump power, and how to turn all of this into a pump specification."
        feature="Pipe flow & pump sizing deep dive"
      >
        <h3>"Minor" losses that aren't always minor</h3>
        <p>
          Every elbow, tee, valve and pipe entrance adds a local loss, tallied as
          <code> ΔP = ΣK·(ρ·v²/2)</code>, where each fitting contributes a loss coefficient K (a
          90° elbow ≈ 0.9, a fully-open globe valve ≈ 10, a sharp entrance ≈ 0.5). They're called
          "minor" losses by tradition, but on a short, fitting-heavy run — exactly what a compact
          liquid-cooling loop tends to be — they can easily outweigh the straight-pipe friction. The
          published K values vary a lot between sources and connection types, so treat them as
          representative and use a manufacturer's figure for anything dominant (a control valve, say).
        </p>

        <h3>Head and power are not the same thing</h3>
        <p>
          Two different numbers come out of the pressure drop. The <strong>pump head</strong>,
          <code> H = ΔP/(ρ·g)</code>, is a height of fluid — it's what you match against a pump's
          published head-vs-flow curve to check the pump can actually deliver your flow. The
          <strong> pump power</strong> is energy per second: the hydraulic power ΔP·Q is the useful
          part, and dividing by the pump's efficiency (small coolant pumps are often only 30–60%
          efficient) gives the shaft/electrical power the pump actually draws. A pump can have plenty
          of head yet still need surprising electrical power once its efficiency is accounted for.
        </p>

        <h3>Coolant-loop checklist</h3>
        <ol>
          <li>Fix the flow rate from the heat you need to move and the allowable coolant temperature rise (the Heat Exchanger and Heatsink calculators set this).</li>
          <li>Keep pipe velocity in the ~1–3 m/s band: below that, air and sediment don't clear; above it, pressure drop and erosion climb fast.</li>
          <li>Add up every fitting's K — on a compact loop the fittings often dominate, so don't skip them.</li>
          <li>Compute the total pressure drop at your design flow, convert to head, and check it against the pump's curve <em>at that flow</em>, not just its dead-head maximum.</li>
          <li>Size the electrical supply from the shaft power (hydraulic ÷ efficiency), and leave margin — a fouled cold plate or a partially-closed valve raises the system resistance over time.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
