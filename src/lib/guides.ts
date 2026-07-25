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
