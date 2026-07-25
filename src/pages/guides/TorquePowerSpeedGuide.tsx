import GuideLayout, { GuideDeepDive } from './GuideLayout';
import { getGuideBySlug } from '../../lib/guides';

const guide = getGuideBySlug('torque-power-speed')!;

export default function TorquePowerSpeedGuide() {
  return (
    <GuideLayout guide={guide}>
      <h2>One equation ties them together</h2>
      <p>
        Torque, power, and speed on a rotating shaft aren't three independent quantities — fix any two and
        the third is determined by one exact relationship:
      </p>
      <p>
        <code>P = T · ω</code>
      </p>
      <p>
        power equals torque times angular velocity. It holds for <em>any</em> rotating shaft regardless of
        what's driving it — motor, engine, turbine — because it's just the rotational form of "power =
        force × velocity." This is the equation behind every "what motor do I need?" conversation.
      </p>

      <h2>What it actually tells you</h2>
      <p>
        The practical consequence is the trade-off it forces: for a given power, <b>torque and speed are
        inversely related</b>. A motor delivering a fixed power makes high torque only at low speed and low
        torque at high speed. That's why gearboxes exist — to trade the speed a motor is good at for the
        torque a load needs, keeping the power (minus losses) the same on both sides. Want more torque at
        the wheel? Gear it down, and it spins slower in exact proportion.
      </p>

      <h2>The unit trap that catches everyone</h2>
      <p>
        The equation is only clean in <b>consistent SI units</b>: power in watts, torque in newton-metres,
        and angular velocity in <em>radians per second</em>. The mistake people make is plugging in RPM
        directly. Speed almost always comes as RPM, and you must convert:
        <code> ω (rad/s) = RPM × 2π / 60</code>. Skip that factor of 2π/60 and your answer is off by ~9.55×.
        Mixing horsepower, lb-ft, and RPM brings its own conversion constants — the underlying physics is
        identical, only the bookkeeping changes.
      </p>

      <h2>Relating torque to motor current</h2>
      <p>
        For a permanent-magnet motor there's a second useful relationship: torque is roughly proportional
        to current, <code>T = Kt · I</code>, where Kt is the torque constant. It's a handy cross-check —
        estimate torque from the current you're drawing — but it assumes an ideal linear machine. Real
        motors deviate near magnetic saturation or at very high current, so treat it as an estimate, not a
        precise figure.
      </p>

      <GuideDeepDive
        title="Worked conversions, efficiency & checklist"
        teaser="A worked RPM→torque calculation, how efficiency turns mechanical output into electrical input, and a checklist so the units never bite you."
        feature="Torque–power–speed deep dive"
      >
        <h3>A worked example</h3>
        <p>
          A motor delivers 10 kW at 3000 RPM — what's the shaft torque? First convert speed:
          <code> ω = 3000 × 2π/60 = 314.2 rad/s</code>. Then <code>T = P/ω = 10000 / 314.2 = 31.8 N·m</code>.
          Double the speed to 6000 RPM at the same power and the torque halves to 15.9 N·m — the inverse
          relationship in action. This is the whole calculation; the only place to go wrong is the RPM→rad/s
          conversion.
        </p>

        <h3>From shaft power to electrical input</h3>
        <p>
          P = T·ω gives <em>mechanical</em> shaft power. The electrical power you draw from the battery is
          higher, because the motor and inverter aren't perfect: <code>P_elec = P_mech / η</code>, where η
          is the efficiency (motoring). At 95% efficiency, 10 kW of shaft power needs ~10.5 kW electrical,
          and the missing 0.5 kW becomes heat. For regeneration the relationship inverts — mechanical input
          becomes electrical output, times efficiency.
        </p>

        <h3>Checklist</h3>
        <ol>
          <li>Convert RPM to rad/s (× 2π/60) before using P = T·ω — this is the #1 error.</li>
          <li>Keep SI consistent: watts, N·m, rad/s (or use a tool that tracks the conversions).</li>
          <li>Remember torque and speed trade inversely at fixed power — size the gearbox accordingly.</li>
          <li>Use T = Kt·I only as an estimate for PM motors; it breaks down near saturation.</li>
          <li>Divide by efficiency to get electrical input; the shortfall is heat to be cooled.</li>
        </ol>
      </GuideDeepDive>
    </GuideLayout>
  );
}
