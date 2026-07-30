// Powertrain bundle — a named set referencing one motor, one battery, and one
// controller profile (by id), plus the system-level fields that don't belong
// to any single component (the DC cable length between battery and inverter).
// This is the "virtual powertrain / concept-phase workspace" layer: lay out
// the whole architecture once, then feed it into the detailed component-level
// calculators. Stored in component_profiles with type 'powertrain'; its params
// hold references to other component_profiles rows rather than duplicating
// their data (so editing a component profile updates every powertrain using it).

export interface PowertrainProfileParams {
  motorProfileId: string | null;
  batteryProfileId: string | null;
  controllerProfileId: string | null;
  dcCableLengthM: number | null; // battery-to-inverter DC cable length
  notes: string;
}

export const BLANK_POWERTRAIN_PROFILE: PowertrainProfileParams = {
  motorProfileId: null,
  batteryProfileId: null,
  controllerProfileId: null,
  dcCableLengthM: null,
  notes: '',
};

// The calculators a powertrain can pre-fill, with the fields each pulls from
// the bundle. Drives the "Open in…" links on the workspace page.
export const POWERTRAIN_TARGETS: { label: string; path: string; feeds: string }[] = [
  { label: 'DC-Link Sizing', path: '/dc-link', feeds: 'bus voltage, switching freq, phase current' },
  { label: 'Cable Sizing', path: '/cable-sizing', feeds: 'system voltage, current, DC cable length' },
  { label: 'MOSFET Loss', path: '/mosfet-loss', feeds: 'DC voltage, switching freq' },
  { label: 'Choke Sizing', path: '/choke-sizing', feeds: 'DC voltage, switching freq' },
  { label: 'Id / Iq Current', path: '/id-iq-current', feeds: 'pole pairs, flux linkage, Ld/Lq' },
  { label: 'Torque / Power / Speed', path: '/speed-torque-power', feeds: 'peak torque, power, speed, Kt' },
];
