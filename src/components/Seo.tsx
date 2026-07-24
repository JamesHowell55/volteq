import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getSeoForPath, SITE_NAME, SITE_URL } from '../lib/seo';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(id: string, data: object | null) {
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement('script');
  el.id = id;
  (el as HTMLScriptElement).type = 'application/ld+json';
  el.textContent = JSON.stringify(data);
  if (!existing) document.head.appendChild(el);
}

// Sets per-route <title>, meta description/robots, canonical link, Open Graph /
// Twitter tags, and JSON-LD structured data. Driven by src/lib/seo.ts, which in
// turn reads from navCategories.ts — the single source of truth for calculator
// metadata — so a new calculator only needs an entry there, not here.
export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = getSeoForPath(pathname);
    const url = `${SITE_URL}${pathname}`;

    document.title = entry.title;
    upsertMeta('name', 'description', entry.description);
    upsertMeta('name', 'robots', entry.noindex ? 'noindex, nofollow' : 'index, follow');
    upsertLink('canonical', url);

    upsertMeta('property', 'og:title', entry.title);
    upsertMeta('property', 'og:description', entry.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);

    upsertMeta('name', 'twitter:card', 'summary');
    upsertMeta('name', 'twitter:title', entry.title);
    upsertMeta('name', 'twitter:description', entry.description);

    upsertJsonLd(
      'seo-jsonld',
      entry.noindex
        ? null
        : {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: entry.title.replace(` | ${SITE_NAME}`, ''),
            description: entry.description,
            url,
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Any (web-based)',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
          },
    );
  }, [pathname]);

  return null;
}
