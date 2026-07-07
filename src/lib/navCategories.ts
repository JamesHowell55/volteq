// Single source of truth for site navigation: the NavBar dropdowns, the Home page
// tool grid, and App.tsx's placeholder route registration all read from this file,
// so a new calculator only needs to be added here once. `links` within each
// category are kept in alphabetical order by label.
//
// Only calculators that actually exist (available: true) are listed here — the
// full backlog of ~110 not-yet-built "Coming soon" placeholders that used to
// clutter every dropdown was removed 2026-07-06 and is kept in this project's
// memory (project_calculator_roadmap.md) instead, so the nav only shows real
// tools. When a new calculator is built, add its entry to the matching category
// below (or start a new category if none fits) and remove the corresponding
// line from the roadmap memory file.

export interface CalculatorLink {
  label: string;
  path: string;
  available: boolean;
  description: string;
}

export interface NavCategory {
  label: string;
  links: CalculatorLink[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: 'Electrical',
    links: [
      { label: 'Busbar Calculation', path: '/busbar', available: true, description: 'Build a busbar cross-section from multiple bar sections, apply AC or DC current, duration, ambient temperature and material, and calculate steady-state or short-circuit conductor temperature.' },
      { label: 'Cable/Wire Sizing (EV Powertrain)', path: '/cable-sizing', available: true, description: 'Ampacity and voltage drop for EV powertrain cables (battery interconnects, battery-to-inverter, inverter-to-motor) from a first-principles steady-state heat balance, ISO 6722 insulation temperature classes, and bundling derating.' },
      { label: 'Creepage and Clearance', path: '/creepage-clearance', available: true, description: 'Minimum creepage and clearance distances per IEC 60664-1 — pollution degree, material group (CTI), overvoltage category, and altitude correction from sea level up to 50,000 ft.' },
    ],
  },
  {
    label: 'Power Electronics',
    links: [
      { label: 'Choke Sizing (CM/DM)', path: '/choke-sizing', available: true, description: 'Common-mode and differential-mode choke sizing for an EV motor-controller (inverter) — Toroidal, Oval/racetrack, U-core, or E-core geometry, busbar pass-through or wound turns, sized against a ripple-current or EMC impedance target with saturation, core loss, and window-fit checks.' },
      { label: 'MOSFET Loss (SiC Inverter)', path: '/mosfet-loss', available: true, description: 'Conduction, switching, reverse-recovery, dead-time, and gate losses for an EV traction inverter — 1200 V SiC devices from Wolfspeed, Infineon, ST, and Hitachi Energy (discrete, top-side-cooled, half-bridge, and six-pack packages), with parallel devices, motoring/generating operation, junction-temperature iteration, and duty-cycle profiles.' },
    ],
  },
  {
    label: 'Motors',
    links: [
      { label: 'Speed ↔ Torque ↔ Power', path: '/speed-torque-power', available: true, description: 'Solve for any one of torque, power, or speed given the other two (P = T·ω), with common unit conversions built in, plus optional cross-checks for a PM motor\'s torque constant and efficiency-adjusted electrical input power.' },
    ],
  },
  {
    label: 'Battery',
    links: [
      { label: 'Battery Pack Series/Parallel Calculator', path: '/battery-pack-series-parallel', available: true, description: 'Resulting pack voltage, capacity, energy, and internal resistance from a chosen series/parallel (SxP) cell arrangement, plus a voltage-sag check under load.' },
    ],
  },
  {
    label: 'Mechanical',
    links: [
      { label: 'Bolted Joint', path: '/bolted-joint', available: true, description: 'Metric and imperial fastener stack-ups, washers and locking nuts, tapped or threaded-insert engagement, VDI 2230 cone-of-compression stiffness, bidirectional preload/torque, and fastener/clamped-member yield checks.' },
    ],
  },
];

export const CONVERSIONS_LINK: CalculatorLink = {
  label: 'Conversions',
  path: '/conversions',
  available: true,
  description: 'Convert between units across distance, mass, force, torque, pressure, temperature, energy, power, area, volume, acceleration, speed, density, angular velocity, and wire gauge.',
};

export const ALL_CALCULATOR_LINKS: CalculatorLink[] = [...NAV_CATEGORIES.flatMap((c) => c.links), CONVERSIONS_LINK];

export function getCalculatorLinkByPath(path: string): CalculatorLink | undefined {
  return ALL_CALCULATOR_LINKS.find((l) => l.path === path);
}
