import { getCalculatorLinkByPath } from './navCategories';

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
};

export function getSeoForPath(pathname: string): SeoEntry {
  const staticEntry = STATIC_ENTRIES[pathname];
  if (staticEntry) return staticEntry;

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
