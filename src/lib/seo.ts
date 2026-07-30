import { getCalculatorLinkByPath } from './navCategories';
import { GUIDES_INDEX_PATH, getGuideByPath } from './guides';

export const SITE_URL = 'https://volteq.io';
export const SITE_NAME = 'Volteq';

export interface SeoEntry {
  title: string;
  description: string;
  noindex?: boolean;
}

const HOME_ENTRY: SeoEntry = {
  title: 'Volteq — First-Principles Engineering Calculators',
  description:
    'Free, first-principles engineering calculators for electrical, power electronics, motor, battery, and mechanical design — busbar temperature, creepage & clearance, bolted joints, beam bending, cable sizing, and more, cross-checked against IEC, ISO, and Roark’s standards.',
};

// Paths not covered by navCategories.ts (auth/account pages have no SEO value and
// shouldn't be indexed — they're either private or duplicate content).
const STATIC_ENTRIES: Record<string, SeoEntry> = {
  '/': HOME_ENTRY,
  '/calculators': {
    title: `All Calculators | ${SITE_NAME}`,
    description:
      'Every Volteq calculator in one place — electrical, power electronics, motors, battery, thermal, and mechanical, each free to use with full derivations shown.',
  },
  '/account': {
    title: `Account | ${SITE_NAME}`,
    description: 'Manage your Volteq account and subscription.',
    noindex: true,
  },
  '/reset-password': {
    title: `Reset Password | ${SITE_NAME}`,
    description: 'Reset your Volteq account password.',
    noindex: true,
  },
  '/motor-profiles': {
    title: `Motor Profiles | ${SITE_NAME}`,
    description: 'Manage your saved motor profiles.',
    noindex: true,
  },
  '/battery-profiles': {
    title: `Battery Profiles | ${SITE_NAME}`,
    description: 'Manage your saved battery profiles.',
    noindex: true,
  },
  '/controller-profiles': {
    title: `Controller Profiles | ${SITE_NAME}`,
    description: 'Manage your saved motor controller / inverter profiles.',
    noindex: true,
  },
  '/powertrain': {
    title: `Powertrain Workspace | ${SITE_NAME}`,
    description: 'Bundle your saved motor, battery, and controller profiles into one powertrain.',
    noindex: true,
  },
};

const GUIDES_INDEX_ENTRY: SeoEntry = {
  title: `Engineering Standards, Explained — Reference Guides | ${SITE_NAME}`,
  description:
    'Plain-language guides to the engineering standards behind Volteq’s calculators — IPC-2221 PCB trace sizing, IEC 60664-1 creepage & clearance, VDI 2230 bolted-joint preload, and more — each linked to the calculator that implements it.',
};

export function getSeoForPath(pathname: string): SeoEntry {
  const staticEntry = STATIC_ENTRIES[pathname];
  if (staticEntry) return staticEntry;

  if (pathname === GUIDES_INDEX_PATH) return GUIDES_INDEX_ENTRY;

  const guide = getGuideByPath(pathname);
  if (guide) {
    return {
      title: `${guide.seoTitle} | ${SITE_NAME}`,
      description: guide.seoDescription,
    };
  }

  const link = getCalculatorLinkByPath(pathname);
  if (link && link.available) {
    return {
      title: `${link.seoTitle ?? link.label} | ${SITE_NAME}`,
      description: link.description,
    };
  }

  // Unregistered path or a not-yet-built "Coming soon" placeholder — nothing worth
  // indexing.
  return {
    title: `Coming Soon | ${SITE_NAME}`,
    description: 'This calculator is coming soon to Volteq.',
    noindex: true,
  };
}
