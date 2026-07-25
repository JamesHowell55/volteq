// Post-build static prerender. Volteq is a client-rendered SPA, so the raw HTML
// every route serves is index.html's home-page <head> with an empty <body> —
// bad for SEO (non-JS crawlers see the wrong title and no content on every URL).
//
// This runs after `vite build`: it serves dist/ locally, drives a headless
// browser to each indexable route, and writes the fully-rendered HTML back to
// dist/<route>/index.html. The rendered snapshot captures the correct per-route
// <head>/JSON-LD (injected by src/components/Seo.tsx) and the full body prose,
// while keeping the module <script> so the SPA still boots and takes over.
//
// Routes come from dist/sitemap.xml — already the curated indexable set — so a
// new page only needs a sitemap entry to be prerendered.
//
// Chromium: Vercel's build container is missing the system libs a normal
// Chromium needs (libnspr4/libnss3/…), so we use @sparticuz/chromium (a build
// that bundles them) driven by puppeteer-core. Set PUPPETEER_EXECUTABLE_PATH to
// override with a local Chrome (e.g. for a non-Linux dev machine).

import { preview } from 'vite';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Extract route paths from the sitemap's <loc> entries (strip the origin).
async function routesFromSitemap() {
  const xml = await readFile(join(distDir, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs.map((url) => new URL(url).pathname);
}

// Map a route path to its output file: '/' -> index.html, '/foo' -> foo/index.html.
function outputFileFor(route) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  return clean === '' ? join(distDir, 'index.html') : join(distDir, clean, 'index.html');
}

async function main() {
  const routes = await routesFromSitemap();
  console.log(`Prerendering ${routes.length} routes...`);

  const server = await preview({ preview: { port: 0 } });
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');

  // No on-screen rendering is needed for an HTML snapshot; skip the graphics
  // stack so @sparticuz/chromium stays lean.
  chromium.setGraphicsMode = false;
  const localExec = process.env.PUPPETEER_EXECUTABLE_PATH;
  // @sparticuz defaults include --single-process/--no-zygote, which are needed
  // in the constrained Lambda *runtime* but crash Chromium in a normal
  // container. This prerender runs in Vercel's full build VM (and locally), so
  // drop them and let Chromium run multi-process.
  const chromiumArgs = chromium.args.filter(
    (a) => a !== '--single-process' && a !== '--no-zygote',
  );
  const browser = await puppeteer.launch({
    args: localExec ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromiumArgs,
    executablePath: localExec || (await chromium.executablePath()),
    headless: true,
  });

  const failures = [];
  const snapshots = [];

  for (const route of routes) {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 30000 });
      // Wait for the app to have actually rendered this route: an <h1> exists and
      // Seo.tsx has applied a document title. Avoid networkidle — Supabase auth
      // polling can keep the network from ever going idle.
      await page.waitForSelector('h1', { timeout: 30000 });
      await page.waitForFunction(() => document.title && document.title.length > 0, { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 250)); // let JSON-LD injection settle
      const html = await page.content();
      snapshots.push({ route, html });
      console.log(`  ✓ ${route}`);
    } catch (err) {
      failures.push({ route, message: err.message });
      console.error(`  ✗ ${route} — ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await server.close();

  if (failures.length) {
    console.error(`\nPrerender failed for ${failures.length} route(s):`);
    for (const f of failures) console.error(`  ${f.route}: ${f.message}`);
    process.exit(1);
  }

  // Write only after every route rendered cleanly, so a mid-run failure never
  // leaves dist/ half-prerendered.
  for (const { route, html } of snapshots) {
    const file = outputFileFor(route);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html, 'utf8');
  }

  console.log(`\nPrerendered ${snapshots.length} routes into dist/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
