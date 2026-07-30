// Battery component-profile schema — the reusable, named "one battery pack,
// many calculators" data bag, matching the pack-level fields the user
// specified for the virtual-powertrain concept: max/min voltage (the SOC
// operating window), pack resistance, and pack inductance. Deliberately
// pack-level, not cell-level — this describes an already-assembled pack's
// electrical characteristics, distinct from the Battery Pack Series/Parallel
// calculator (which derives pack numbers FROM cell + topology inputs, so it
// isn't a natural consumer of this profile — nothing to map backwards into
// cell-level inputs). Consumers are calculators that take a pack voltage/
// inductance as a plain given: DC-Link bus voltage, Cable Sizing system
// voltage.

export interface BatteryProfileParams {
  maxVoltageV: number;         // pack voltage at full charge
  minVoltageV: number;         // pack voltage at the discharge cutoff
  packResistanceMOhm: number | null;
  inductanceUh: number | null;
  notes: string;
}

export const BLANK_BATTERY_PROFILE: BatteryProfileParams = {
  maxVoltageV: 420,
  minVoltageV: 320,
  packResistanceMOhm: null,
  inductanceUh: null,
  notes: '',
};

export function batteryProfileSummary(p: BatteryProfileParams): string {
  const bits = [`${p.minVoltageV}–${p.maxVoltageV} V`];
  if (p.packResistanceMOhm != null) bits.push(`${p.packResistanceMOhm} mΩ`);
  if (p.inductanceUh != null) bits.push(`${p.inductanceUh} µH`);
  return bits.join(' · ');
}
