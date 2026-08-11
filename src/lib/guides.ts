// Single source of truth for the reference/guides content section — the guides
// analogue of navCategories.ts. Drives the /guides index page, the NavBar
// "Guides" link, per-route SEO (src/lib/seo.ts), the hand-maintained sitemap,
// and the "Read the guide" back-links on each guide's calculator.
//
// Each guide is a two-tier page: a free, indexable explainer (the top-of-funnel
// SEO content) plus a Premium "deep dive" section gated with PremiumGate. When
// adding a guide: add an entry here, create its page component in
// src/pages/guides/, register the route in App.tsx, and add its URL to
// public/sitemap.xml.

export interface GuideMeta {
  slug: string;               // URL segment, e.g. 'ipc-2221' → /guides/ipc-2221
  title: string;              // on-page <h1> and index card title
  standard: string;           // short standard label, e.g. 'IPC-2221'
  seoTitle: string;           // <title>/OG title (without the " | Volteq" suffix)
  seoDescription: string;     // meta description
  blurb: string;              // one-line summary for the index card + calculator back-link
  calculator: {
    label: string;            // calculator name for the "Open the calculator" link
    path: string;             // calculator route
  };
}

export const GUIDES: GuideMeta[] = [
  {
    slug: 'ipc-2221',
    title: 'PCB Trace Width & Current Capacity: What IPC-2221 Actually Says',
    standard: 'IPC-2221',
    seoTitle: 'IPC-2221 PCB Trace Width Explained — Current Capacity Formula',
    seoDescription:
      'A plain-language guide to IPC-2221 PCB trace sizing: where the I = k·ΔT^0.44·A^0.725 current-capacity formula comes from, external vs internal layer constants, what it assumes, and how it differs from IPC-2152.',
    blurb:
      'Where the IPC-2221 current-capacity curve fit comes from, what it assumes, and how it differs from IPC-2152.',
    calculator: { label: 'PCB Trace Width Calculator', path: '/pcb-trace-width' },
  },
  {
    slug: 'iec-60664-1',
    title: 'Creepage & Clearance: How IEC 60664-1 Sets Insulation Distances',
    standard: 'IEC 60664-1',
    seoTitle: 'IEC 60664-1 Creepage & Clearance Explained — Pollution Degree, CTI, Altitude',
    seoDescription:
      'A plain-language guide to IEC 60664-1: the difference between creepage and clearance, how pollution degree, material group (CTI), working voltage and altitude set the required distances, and where the simplifications bite.',
    blurb:
      'Creepage vs clearance, and how pollution degree, CTI, working voltage and altitude drive IEC 60664-1 distances.',
    calculator: { label: 'Creepage & Clearance Calculator', path: '/creepage-clearance' },
  },
  {
    slug: 'vdi-2230',
    title: 'Bolt Preload & Torque: How VDI 2230 Models a Bolted Joint',
    standard: 'VDI 2230',
    seoTitle: 'VDI 2230 Bolted Joint Preload Explained — Cone of Compression & Torque',
    seoDescription:
      'A plain-language guide to VDI 2230 bolted-joint design: the cone-of-compression (frustum) stiffness model, how the T = K·F·d torque-preload relationship works, load factors, and where the simplified method applies.',
    blurb:
      'The cone-of-compression stiffness model and the T = K·F·d torque-preload relationship behind VDI 2230.',
    calculator: { label: 'Bolted Joint Calculator', path: '/bolted-joint' },
  },
  {
    slug: 'iso-6722',
    title: 'EV Cable Sizing: What ISO 6722 Says About Ampacity',
    standard: 'ISO 6722',
    seoTitle: 'ISO 6722 EV Cable Sizing Explained — Ampacity & Temperature Class',
    seoDescription:
      'A plain-language guide to sizing EV powertrain cable to ISO 6722: how the insulation temperature class sets ampacity, why it comes from a heat balance rather than a table, and how bundling derates current.',
    blurb:
      'How ISO 6722 temperature classes set EV cable ampacity, why it comes from a heat balance, and how bundling derates it.',
    calculator: { label: 'Cable & Wire Sizing Calculator', path: '/cable-sizing' },
  },
  {
    slug: 'dc-link-ripple',
    title: 'DC-Link Capacitor Ripple: The Kolar & Round Method',
    standard: 'DC-Link Ripple',
    seoTitle: 'DC-Link Capacitor Ripple Current Explained — Kolar & Round Formula',
    seoDescription:
      'A plain-language guide to DC-link capacitor ripple current in a three-phase inverter: the Kolar & Round closed-form expression, why ripple peaks near modulation index 0.6, and what actually sizes the capacitor.',
    blurb:
      'The Kolar & Round ripple-current formula for a three-phase inverter, why it peaks near M≈0.6, and what sizes the cap.',
    calculator: { label: 'DC-Link Capacitor Sizing Calculator', path: '/dc-link' },
  },
  {
    slug: 'as568-iso-3601',
    title: 'O-Ring Gland Design: Squeeze, Stretch & Fill to AS568 / ISO 3601',
    standard: 'AS568 / ISO 3601',
    seoTitle: 'O-Ring Gland Design Explained — AS568 / ISO 3601 Squeeze & Fill',
    seoDescription:
      'A plain-language guide to O-ring gland design: what squeeze, stretch and gland fill mean, the AS568 / ISO 3601 size and tolerance system, and the limits that keep a seal working.',
    blurb:
      'Squeeze, stretch and gland fill explained, plus the AS568 / ISO 3601 size system and the limits that keep a seal working.',
    calculator: { label: 'O-Ring Seal Calculator', path: '/o-ring' },
  },
  {
    slug: 'iec-60287',
    title: 'Busbar Heating: Ampacity to IEC 60287 and Faults to IEC 60865-1',
    standard: 'IEC 60287 / 60865-1',
    seoTitle: 'Busbar Ampacity & Short-Circuit Heating — IEC 60287 / IEC 60865-1',
    seoDescription:
      'A plain-language guide to busbar thermal sizing: how continuous ampacity comes from an I²R heat balance with IEC 60287 skin effect, and how IEC 60865-1 sets the adiabatic short-circuit temperature rise.',
    blurb:
      'Continuous ampacity from an I²R heat balance (IEC 60287 skin effect) and adiabatic short-circuit heating per IEC 60865-1.',
    calculator: { label: 'Busbar Calculator', path: '/busbar' },
  },
  {
    slug: 'iso-286',
    title: 'Interference Fits: ISO 286 Tolerances and Lamé Stresses',
    standard: 'ISO 286',
    seoTitle: 'Interference Fit Design Explained — ISO 286 Fits & Lamé Pressure',
    seoDescription:
      'A plain-language guide to press/shrink fits: how ISO 286 tolerance classes set the interference, how Lamé thick-cylinder theory turns it into contact pressure and stress, and why temperature can lose the fit.',
    blurb:
      'How ISO 286 fits set the interference and Lamé thick-cylinder theory turns it into contact pressure, stress and insertion force.',
    calculator: { label: 'Fits & Limits Calculator', path: '/fits-and-limits' },
  },
  {
    slug: 'mohrs-circle',
    title: "Mohr's Circle & Plane-Stress Transformation, Explained",
    standard: "Mohr's Circle",
    seoTitle: "Mohr's Circle Explained — Plane Stress, Principal Stress & von Mises",
    seoDescription:
      "A plain-language guide to plane-stress transformation and Mohr's circle: principal stresses and their orientation, maximum shear, the absolute-vs-in-plane shear subtlety, and von Mises / Tresca equivalents.",
    blurb:
      'Plane-stress transformation and the Mohr\'s-circle construction: principal stresses, max shear, and von Mises / Tresca.',
    calculator: { label: "Mohr's Circle Calculator", path: '/mohrs-circle' },
  },
  {
    slug: 'skin-effect',
    title: 'Skin Depth & Skin Effect: Why AC Current Crowds the Surface',
    standard: 'Skin Effect',
    seoTitle: 'Skin Depth Explained — Skin Effect, the δ Formula & AC Resistance',
    seoDescription:
      'A plain-language guide to skin effect and skin depth: why AC current concentrates near a conductor surface, the δ = √(ρ/(π·f·µ₀·µr)) formula, and why it depends on material and frequency, not conductor size.',
    blurb:
      'Why AC current crowds a conductor\'s surface, the skin-depth formula, and why it depends on material and frequency, not size.',
    calculator: { label: 'Skin Depth Calculator', path: '/skin-depth' },
  },
  {
    slug: 'cm-dm-chokes',
    title: 'Common-Mode & Differential-Mode Choke Sizing, Explained',
    standard: 'CM / DM Chokes',
    seoTitle: 'Common-Mode & Differential-Mode Choke Sizing — Core, Saturation & Loss',
    seoDescription:
      'A plain-language guide to sizing EMC chokes for an inverter: the difference between common-mode and differential-mode, how core geometry sets inductance, and the saturation and Steinmetz core-loss limits.',
    blurb:
      'CM vs DM chokes, how core geometry sets inductance, and the saturation and Steinmetz core-loss limits that size them.',
    calculator: { label: 'Choke Sizing Calculator', path: '/choke-sizing' },
  },
  {
    slug: 'sic-inverter-loss',
    title: 'SiC Inverter Losses: Conduction, Switching & Reverse Recovery',
    standard: 'SiC Inverter Loss',
    seoTitle: 'SiC Inverter Loss Explained — Conduction, Switching & Junction Temp',
    seoDescription:
      'A plain-language guide to where the losses go in a SiC traction inverter: conduction (Rds(on)), switching (Eon/Eoff scaling), reverse recovery, and how they set the junction temperature.',
    blurb:
      'Where a SiC inverter\'s losses go — conduction, switching, reverse recovery — and how they set junction temperature.',
    calculator: { label: 'MOSFET Loss Calculator', path: '/mosfet-loss' },
  },
  {
    slug: 'field-oriented-control',
    title: 'Id/Iq & Field-Oriented Control: The Park Transform and MTPA',
    standard: 'Field-Oriented Control',
    seoTitle: 'Field-Oriented Control Explained — Id/Iq, Park Transform & MTPA',
    seoDescription:
      'A plain-language guide to PMSM field-oriented control: what the Clarke/Park transform does, how Id and Iq split torque into magnet and reluctance terms, and how maximum-torque-per-ampere works.',
    blurb:
      'What the Clarke/Park transform does, how Id/Iq split PMSM torque into magnet and reluctance terms, and how MTPA works.',
    calculator: { label: 'Id/Iq Current Vector Calculator', path: '/id-iq-current' },
  },
  {
    slug: 'motor-winding-loss',
    title: 'Motor Winding AC Copper Loss: Skin Effect, Proximity Effect and Dowell\'s Equation',
    standard: 'Winding AC Resistance (Dowell 1966 / Sullivan & Zhang 2014)',
    seoTitle: 'Motor Winding AC Copper Loss Explained — Skin, Proximity & Dowell\'s Equation',
    seoDescription:
      'A plain-language guide to why a motor winding\'s AC resistance exceeds its DC resistance: skin effect, proximity effect between turns, Dowell\'s classical m-layer equation, and why round wire, flat/hairpin conductors and litz wire behave so differently.',
    blurb:
      'Why a winding\'s AC resistance exceeds its DC value, how Dowell\'s equation captures skin and proximity effect together, and why round, hairpin and litz wire behave so differently.',
    calculator: { label: 'Motor Winding / AC Copper Loss Calculator', path: '/motor-winding-loss' },
  },
  {
    slug: 'bolt-group-elastic',
    title: 'Bolt Pattern Analysis: The Elastic Method for Bolt Groups',
    standard: 'Bolt Group (Elastic Method)',
    seoTitle: 'Bolt Pattern Analysis Explained — Elastic Method for Bolt Groups',
    seoDescription:
      'A plain-language guide to bolt-group analysis by the elastic method: how direct and torsional shear combine, how out-of-plane moments distribute tension, and where the rigid-plate assumption holds.',
    blurb:
      'The elastic method for eccentrically-loaded bolt groups: direct + torsional shear, moment-driven tension, and its limits.',
    calculator: { label: 'Bolt Pattern Calculator', path: '/bolt-pattern' },
  },
  {
    slug: 'euler-bernoulli-beams',
    title: "Beam Bending: Euler–Bernoulli Theory and Roark's Formulas",
    standard: 'Beam Theory',
    seoTitle: "Beam Bending Explained — Euler–Bernoulli Theory & Roark's Formulas",
    seoDescription:
      'A plain-language guide to beam bending: what Euler–Bernoulli theory assumes, the shear/moment/deflection chain, the difference between determinate and indeterminate beams, and where Roark\'s formulas come in.',
    blurb:
      'What Euler–Bernoulli theory assumes, the shear→moment→deflection chain, and determinate vs indeterminate beams.',
    calculator: { label: 'Beam Bending Calculator', path: '/beam-bending' },
  },
  {
    slug: 'torque-power-speed',
    title: 'Torque, Power & Speed: The P = T·ω Relationship',
    standard: 'P = T·ω',
    seoTitle: 'Torque, Power & Speed Explained — the P = T·ω Relationship',
    seoDescription:
      'A plain-language guide to the torque–power–speed relationship P = T·ω: why it holds for any rotating shaft, the unit traps that catch people out, and how motor torque relates to current.',
    blurb:
      'Why P = T·ω holds for any rotating shaft, the unit traps, and how motor torque relates to current.',
    calculator: { label: 'Speed / Torque / Power Calculator', path: '/speed-torque-power' },
  },
  {
    slug: 'series-parallel-cells',
    title: 'Battery Pack Configuration: What S×P Does to a Cell',
    standard: 'Series / Parallel Cells',
    seoTitle: 'Battery Pack Series/Parallel Explained — Voltage, Capacity & Resistance',
    seoDescription:
      'A plain-language guide to battery pack series/parallel (S×P) configuration: how cells in series add voltage, cells in parallel add capacity, how internal resistance combines, and what it means for sag.',
    blurb:
      'How series adds voltage, parallel adds capacity, how internal resistance combines, and what S×P means for voltage sag.',
    calculator: { label: 'Battery Pack Series/Parallel Calculator', path: '/battery-pack-series-parallel' },
  },
  {
    slug: 'wire-bundle-diameter',
    title: 'Wire Bundle Diameter: Circle Packing and the Glenair Method',
    standard: 'Glenair Bundle Method',
    seoTitle: 'Wire Bundle Diameter Explained — Circle Packing & the Glenair Method',
    seoDescription:
      'A plain-language guide to estimating wire harness bundle diameter: the two approaches (2D circle packing and the Glenair multiplication-factor table), what coverings add, and why it\'s a planning estimate.',
    blurb:
      'The two ways to estimate harness bundle diameter — circle packing and the Glenair factor table — and what coverings add.',
    calculator: { label: 'Harness Bundle Diameter Calculator', path: '/harness-bundle-diameter' },
  },
  {
    slug: 'heat-exchanger-ntu',
    title: 'Heat Exchanger Sizing: The Effectiveness-NTU Method',
    standard: 'Effectiveness-NTU',
    seoTitle: 'Effectiveness-NTU Method Explained — Radiator & Heat Exchanger Sizing',
    seoDescription:
      'A plain-language guide to sizing a liquid-to-air heat exchanger with the effectiveness-NTU method: what UA, NTU, Cmin and Cr mean, why crossflow effectiveness has its own formula, and what limits a core\'s heat rejection.',
    blurb:
      'What UA, NTU, Cmin and Cr mean, the crossflow-both-unmixed effectiveness formula, and what really limits a core\'s heat rejection.',
    calculator: { label: 'Heat Exchanger Sizing Calculator', path: '/heat-exchanger-sizing' },
  },
  {
    slug: 'cold-plate',
    title: 'Cold Plate Design: Rectangular-Channel Heat Transfer and Pressure Drop',
    standard: 'Liquid Cold Plate Design',
    seoTitle: 'Cold Plate Design Explained — Channel Heat Transfer, Pressure Drop & Rth',
    seoDescription:
      'A plain-language guide to sizing a liquid cold plate: why a rectangular channel isn\'t a round pipe, how the Shah-London correlations set the heat-transfer coefficient and friction, how bends add pressure drop, and how it all becomes a thermal resistance and base temperature.',
    blurb:
      'Why a rectangular channel isn\'t a round pipe, how Shah-London sets the heat-transfer coefficient and friction, and how it all becomes a base temperature.',
    calculator: { label: 'Cold Plate Designer', path: '/cold-plate' },
  },
  {
    slug: 'flow-in-pipes',
    title: 'Pipe Pressure Drop & Pump Sizing: Darcy-Weisbach and the Friction Factor',
    standard: 'Darcy-Weisbach / Colebrook-White',
    seoTitle: 'Pipe Pressure Drop Explained — Darcy-Weisbach, Friction Factor & Pump Head',
    seoDescription:
      'A plain-language guide to sizing a coolant pump: how Darcy-Weisbach turns flow, pipe size and roughness into a pressure drop, where the friction factor comes from (laminar vs turbulent, Swamee-Jain), how fitting minor losses add up, and how pressure drop becomes pump head and power.',
    blurb:
      'How Darcy-Weisbach turns flow, pipe size and roughness into a pressure drop, and how that becomes the pump head and power you need to specify.',
    calculator: { label: 'Flow in Pipes / Pump Sizing', path: '/flow-in-pipes' },
  },
  {
    slug: 'heatsink-thermal',
    title: 'Heatsink Sizing: Junction-to-Ambient Rth and Natural-Convection Fin Arrays',
    standard: 'Heatsink Thermal Design',
    seoTitle: 'Heatsink Thermal Design Explained — Rth Budget & Fin-Array Sizing',
    seoDescription:
      'A plain-language guide to heatsink thermal design: how the junction-to-ambient Rth chain sets the sink budget, and how the Churchill-Chu correlation and fin efficiency size a natural-convection fin array.',
    blurb:
      'How the Rjc+Rcs+Rsa chain sets the sink budget, and how Churchill-Chu convection and fin efficiency size a natural-convection fin array.',
    calculator: { label: 'Heatsink Thermal Calculator', path: '/heatsink-thermal' },
  },
  {
    slug: 'shielding-effectiveness',
    title: 'EMC Shielding Effectiveness: How Schelkunoff\'s SE = A + R + B Works',
    standard: 'Schelkunoff / Ott Shielding Theory',
    seoTitle: 'Shielding Effectiveness Explained — Absorption, Reflection & Schelkunoff Theory',
    seoDescription:
      'A plain-language guide to EMC shielding effectiveness: how absorption loss and reflection loss combine (SE = A + R + B), why near-field sources behave differently from far-field plane waves, and why real enclosures are usually limited by apertures rather than the solid barrier.',
    blurb:
      'How absorption and reflection loss combine into SE = A + R + B, and why near-field sources need a different reflection-loss formula than a far-field plane wave.',
    calculator: { label: 'Shielding Effectiveness Calculator', path: '/shielding-effectiveness' },
  },
  {
    slug: 'aperture-shielding',
    title: 'Apertures & Vent Panels: Why Openings Set Your Real EMC Shielding',
    standard: 'Radiating-Aperture & Waveguide-Below-Cutoff Theory',
    seoTitle: 'Aperture & Vent Shielding Explained — Slot Antennas & Waveguide-Below-Cutoff',
    seoDescription:
      'A plain-language guide to EMC aperture and vent-panel shielding: why a slot behaves like an antenna above half a wavelength, how waveguide-below-cutoff theory lets a vent panel breathe while still blocking RF, and why openings usually set an enclosure\'s real shielding, not the solid metal.',
    blurb:
      'Why a slot radiates like an antenna above half a wavelength, and how waveguide-below-cutoff theory lets a vent panel breathe while still blocking RF.',
    calculator: { label: 'Aperture & Vent Panel Shielding Calculator', path: '/aperture-shielding' },
  },
  {
    slug: 'enclosure-resonance',
    title: 'Enclosure Cavity Resonance: When a Shield Becomes an Antenna',
    standard: 'Rectangular Cavity Resonator Theory',
    seoTitle: 'Enclosure Cavity Resonance Explained — Rectangular Cavity Modes',
    seoDescription:
      'A plain-language guide to EMC enclosure cavity resonance: why a shielded box has resonant frequencies of its own, how the rectangular-cavity mode formula works, and why shielding effectiveness can collapse at those specific frequencies.',
    blurb:
      'Why a shielded enclosure has resonant frequencies of its own, and why shielding effectiveness can collapse at those specific frequencies regardless of barrier material.',
    calculator: { label: 'Enclosure Cavity Resonance Calculator', path: '/enclosure-resonance' },
  },
  {
    slug: 'ground-strap-inductance',
    title: 'Grounding Strap Inductance: Why Impedance, Not Resistance, Rules RF Bonding',
    standard: 'Grover/Terman Straight-Conductor Self-Inductance',
    seoTitle: 'Grounding Strap Inductance Explained — Impedance vs. Resistance in RF Bonding',
    seoDescription:
      'A plain-language guide to grounding and bonding strap inductance: why impedance rather than DC resistance governs a bond\'s effectiveness at RF, and why a wide flat strap beats a round-wire pigtail of the same length.',
    blurb:
      'Why impedance, not DC resistance, governs a grounding or bonding connection at RF — and why a wide flat strap always beats a round-wire pigtail of the same length.',
    calculator: { label: 'Grounding / Bond Strap Inductance Calculator', path: '/ground-strap-inductance' },
  },
  {
    slug: 'mil-dtl-38999',
    title: 'MIL-DTL-38999 Connectors: Contact Sizes, Ratings & Pinouts',
    standard: 'MIL-DTL-38999',
    seoTitle: 'MIL-DTL-38999 Connectors Explained — Contact Sizes, Ratings & Pinouts',
    seoDescription:
      'A plain-language guide to MIL-DTL-38999 circular connectors: what the standard covers, how contact size sets current rating, shell/insert basics, and how a point-to-point harness pinout is laid out.',
    blurb:
      'What MIL-DTL-38999 covers, how contact size sets current rating, and how a point-to-point harness pinout is laid out.',
    calculator: { label: 'Harness Designer', path: '/harness-designer' },
  },
  {
    slug: 'iso-281',
    title: 'Bearing Life & Selection: How ISO 281 Rates a Rolling Bearing',
    standard: 'ISO 281',
    seoTitle: 'ISO 281 Bearing Life Explained — L10, Dynamic Load Rating & C/P',
    seoDescription:
      'A plain-language guide to rolling-bearing selection to ISO 281: where the L10 = (C/P)^p rating-life formula comes from, the equivalent load P = X·Fr + Y·Fa, the static safety check, and how speed and lubrication set the limits.',
    blurb:
      'Where the L10 = (C/P)^p rating-life formula comes from, the equivalent load P = X·Fr + Y·Fa, and the static and lubrication limits.',
    calculator: { label: 'Bearing Calculator', path: '/bearing-calculator' },
  },
  {
    slug: 'iso-4156',
    title: 'Involute Splines: Geometry, Measurement Over Pins & Torque Capacity',
    standard: 'ISO 4156',
    seoTitle: 'Involute Splines Explained — ISO 4156 Geometry, Pin Measurement & Torque',
    seoDescription:
      'A plain-language guide to involute splines to ISO 4156 / ANSI B92.2M: how module and pressure angle set the geometry, how measurement over pins inspects tooth thickness, and how the SAE method rates torque capacity.',
    blurb:
      'How module and pressure angle set involute-spline geometry, how measurement over pins works, and how splines are rated for torque.',
    calculator: { label: 'Spline Sizing Calculator', path: '/spline-sizing' },
  },
];

export const GUIDES_INDEX_PATH = '/guides';

export function guidePath(slug: string): string {
  return `${GUIDES_INDEX_PATH}/${slug}`;
}

export function getGuideBySlug(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

// Resolve a full pathname (e.g. '/guides/ipc-2221') to its guide, for SEO lookup.
export function getGuideByPath(pathname: string): GuideMeta | undefined {
  const prefix = `${GUIDES_INDEX_PATH}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  return getGuideBySlug(pathname.slice(prefix.length));
}

// The guide (if any) that a calculator route should link out to, for the
// "Read the guide" back-link on the calculator's Reference & assumptions card.
export function getGuideForCalculator(calculatorPath: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.calculator.path === calculatorPath);
}
