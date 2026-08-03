// Controller (motor controller / inverter) component-profile schema — the
// reusable, named "one inverter, many calculators" data bag. Field list is
// grounded in what a real commercial traction inverter datasheet actually
// states (cross-checked against the Rinehart/Cascadia Motion PM100 series
// propulsion inverter spec sheet): DC operating voltage range, continuous/
// peak output current, peak power, PWM switching frequency, and onboard
// DC-link capacitance. Pack-level/unit-level, not device-level — the
// individual switching-device datasheet numbers (Rds(on), gate charge, etc.)
// stay in the MOSFET Loss calculator's own device library (sicDevices.ts),
// which is a different, more granular concern.
//
// Switching frequency is this profile's standout field: it's an inverter-
// level property that neither the Motor nor Battery profile carries, and
// three different calculators (DC-Link, MOSFET Loss, Choke Sizing) each
// already have their own switching-frequency input it can feed.

export type CoolingMethod = 'air' | 'liquid';

export const COOLING_METHOD_LABELS: Record<CoolingMethod, string> = {
  air: 'Air-cooled',
  liquid: 'Liquid-cooled',
};

export interface ControllerProfileParams {
  maxDcVoltageV: number;              // DC operating voltage, upper end of range
  minDcVoltageV: number;              // DC operating voltage, lower end of range
  continuousCurrentARms: number | null; // rated continuous output (motor) current
  peakCurrentARms: number | null;       // rated peak output (motor) current, short-duration
  peakPowerKw: number | null;
  switchingFrequencyKhz: number | null; // inverter PWM switching frequency
  dcLinkCapacitanceUf: number | null;   // onboard DC-link capacitance, informational
  coolingMethod: CoolingMethod | null;
  notes: string;
}

export const BLANK_CONTROLLER_PROFILE: ControllerProfileParams = {
  maxDcVoltageV: 400,
  minDcVoltageV: 50,
  continuousCurrentARms: null,
  peakCurrentARms: null,
  peakPowerKw: null,
  switchingFrequencyKhz: null,
  dcLinkCapacitanceUf: null,
  coolingMethod: null,
  notes: '',
};

export function controllerProfileSummary(p: ControllerProfileParams): string {
  const bits = [`${p.minDcVoltageV}–${p.maxDcVoltageV} V`];
  if (p.peakPowerKw != null) bits.push(`${p.peakPowerKw} kW`);
  if (p.switchingFrequencyKhz != null) bits.push(`${p.switchingFrequencyKhz} kHz`);
  return bits.join(' · ');
}
