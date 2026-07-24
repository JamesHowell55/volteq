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
      { label: 'Harness Bundle Diameter', path: '/harness-bundle-diameter', available: true, description: 'Wire bundle diameter and cross-section for mixed-gauge, mixed-construction harnesses — aerospace M22759/Spec 55 wire, shielded/twisted-pair/CAN bus, plus overbraid, heat-shrink (RNF-100/RNF-3000/HTAT), and Nomex sleeve coverings, cross-checked against the published Glenair bundle-diameter method.' },
      { label: 'Harness Designer', path: '/harness-designer', available: true, description: 'MIL-DTL-38999 Series III connector selection (shell size, contact size, salt-spray finish, mounting type), per-connector pinout tables across multiple branches, and an auto-generated point-to-point wiring schematic with connector naming, pin numbers, and wire specs.' },
      { label: 'Skin Depth Calculator', path: '/skin-depth', available: true, description: 'Classical AC skin depth from a conductor material\'s resistivity and relative permeability at a given frequency — direct-entered or derived from motor speed and pole pairs — with an illustrative cross-section graphic.' },
    ],
  },
  {
    label: 'Power Electronics',
    links: [
      { label: 'Choke Sizing (CM/DM)', path: '/choke-sizing', available: true, description: 'Common-mode and differential-mode choke sizing for an EV motor-controller (inverter) — Toroidal, Oval/racetrack, U-core, or E-core geometry, busbar pass-through or wound turns, sized against a ripple-current or EMC impedance target with saturation, core loss, and window-fit checks.' },
      { label: 'MOSFET Loss (SiC Inverter)', path: '/mosfet-loss', available: true, description: 'Conduction, switching, reverse-recovery, dead-time, and gate losses for an EV traction inverter — 1200 V SiC devices from Wolfspeed, Infineon, ST, and Hitachi Energy (discrete, top-side-cooled, half-bridge, and six-pack packages), with parallel devices, motoring/generating operation, junction-temperature iteration, and duty-cycle profiles.' },
      { label: 'DC-Link Capacitor Sizing', path: '/dc-link', available: true, description: 'Size the DC-link capacitor bank for a three-phase motor inverter — required capacitance and RMS ripple current (Kolar & Round), polypropylene film capacitor down-select (Kemet C4AQ-M or custom), loss, hot-spot temperature and expected life, plus a parallel-bank mechanical layout with array thermal derating and cooling options.' },
    ],
  },
  {
    label: 'Motors',
    links: [
      { label: 'Speed ↔ Torque ↔ Power', path: '/speed-torque-power', available: true, description: 'Solve for any one of torque, power, or speed given the other two (P = T·ω), with common unit conversions built in, plus optional cross-checks for a PM motor\'s torque constant and efficiency-adjusted electrical input power.' },
      { label: 'Id / Iq Current Vector', path: '/id-iq-current', available: true, description: 'Convert between phase-current magnitude (peak or RMS), current angle, and the rotor-frame d-/q-axis currents (Id, Iq) of a PMSM under field-oriented control, with a space-vector diagram plus derived torque (magnet + reluctance), MTPA comparison, and speed-dependent back-EMF and shaft power.' },
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
      { label: 'Beam Bending Calculator', path: '/beam-bending', available: true, description: 'Reactions, shear force, bending moment, and deflection for simply supported, cantilever, fixed-fixed, propped-cantilever, and overhanging beams under any combination of point loads, point moments, and distributed loads — solved numerically (unit-load/virtual-work method for indeterminate cases) and cross-checked against Roark\'s Formulas for Stress and Strain.' },
      { label: 'Bolt Pattern', path: '/bolt-pattern', available: true, description: "Bolt-group analysis for aligned grid, rectangular-perimeter, circular (bolt-circle), or fully custom fastener patterns — direct and torsional shear via the elastic method, axial/tension via unsymmetric bending (including asymmetric custom layouts), combined with preload and checked against the bolt's proof strength." },
      { label: 'Bolted Joint', path: '/bolted-joint', available: true, description: 'Metric and imperial fastener stack-ups, washers and locking nuts, tapped or threaded-insert engagement, VDI 2230 cone-of-compression stiffness, bidirectional preload/torque, and fastener/clamped-member yield checks.' },
      { label: 'BoM Compare', path: '/bom-compare', available: true, description: 'Paste a previous and a new bill of materials straight from Excel and get a part-by-part comparison — added, removed, and up-revisioned parts highlighted automatically, with configurable columns.' },
      { label: 'O-Ring Seal', path: '/o-ring', available: true, description: 'O-Ring gland design to the Trelleborg design guide — static/dynamic radial (rod and piston), axial face, and non-circular face grooves via neutral-axis length, with ISO 286 fits or custom tolerances, AS568 / ISO 3601-1 Class A/B size selection, material guidance, and squeeze/stretch/fill/extrusion checks.' },
      { label: 'Fits & Limits', path: '/fits-and-limits', available: true, description: 'Interference (press/shrink) fit design for a solid or hollow shaft pressed into a hub — ISO 286 fits or custom tolerances, standard or custom shaft/hub materials, and insertion force plus Lamé thick-cylinder hub/shaft stresses across assembly, operational and storage temperatures.' },
      { label: "Mohr's Circle Stresses", path: '/mohrs-circle', available: true, description: "Plane-stress transformation and Mohr's circle for a 2-D stress state (σx, σy, τxy) — principal (max/min) stresses and their orientation, maximum in-plane and absolute shear, the stresses on any rotated plane, von Mises and Tresca equivalents, and a to-scale Mohr's circle with a stress-element schematic." },
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
