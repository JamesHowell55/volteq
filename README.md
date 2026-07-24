# Volteq — Engineering Calculators

A React + TypeScript site for first-principles engineering calculators, branded for Volteq. Dark,
technical UI with a teal brand accent (`src/assets/brand/` has the source logo files).

Built with Vite + React 19 + react-router-dom.

## Tools

- **Busbar Calculator** (`/busbar`) — model a single busbar (up to 10 lengthwise sections of varying
  cross-section, with axial heat conduction between them) or a stack of parallel bars, then apply continuous,
  short-circuit/fault, or a multi-step load-profile current and calculate conductor temperature over time.
  All formulas are shown with substituted values. See [src/lib/busbarPhysics.ts](src/lib/busbarPhysics.ts) for
  the nodal thermal network, skin effect (IEC 60287-1-1), short-circuit heating (IEC 60865-1), and coating
  thermal resistance model.
- **Creepage & Clearance Calculator** (`/creepage-clearance`) — minimum clearance and creepage distances per
  IEC 60664-1, accounting for overvoltage category (or a custom value), pollution degree, material group (CTI),
  insulation type, electric field condition (Case A inhomogeneous / Case B homogeneous), a configurable factor
  of safety, and altitude correction from sea level to 50,000 ft, cross-checked against Paschen's Law. See
  [src/lib/creepageClearance.ts](src/lib/creepageClearance.ts) for the source tables (IEC 60664-1 Tables
  F.1/F.2/F.10, IEC 60335-1 Tables 17/18) and [src/lib/paschen.ts](src/lib/paschen.ts) for the physics cross-check.

## Theming

The header/navbar is always black (fixed `--navbar-*` tokens in `src/index.css`, independent of theme). Everything
else supports light/dark mode plus a custom accent colour, via the "Theme" control in the navbar
(`src/components/ThemeControls.tsx`). State (`mode`, `accentHex`) lives in `src/lib/ThemeContext.tsx`, persisted to
`localStorage`; `src/lib/theme.ts` derives the full on-dark/on-light accent variants from a single hex (HSL-based)
and applies them as runtime CSS custom-property overrides. Defaults to the Volteq teal (`#5DCAA5`).

## PDF export

Each calculator has an "Export PDF" button. `src/lib/pdfExport.ts` builds an off-screen, print-styled report
(inputs + outputs + a small disclaimer on page 1, calculation steps on page 2 via `break-before: page`) and
renders it with `html2pdf.js`. Filenames follow `YYYYMMDD_HH_MM_Volteq_<Tab_Name>.pdf`
(`buildPdfFilename()`). Each calculator page builds its own `inputSections`/`outputSections`/`calculationSteps`
data from current state — see `BusbarCalculator.tsx` or `CreepageClearanceCalculator.tsx` for the pattern.

## Premium tier (auth, billing, feature gating)

Free tier: the calculation itself, on every tool. Premium (paid) tier: PDF export, custom report branding
(company name/logo on exports), and "advanced" calculation modes (e.g. the Bolted Joint Calculator's
"Advanced: override component data"). Gating is enforced by a real, server-verified entitlement record
(Supabase), not a client-side flag — see `src/components/PremiumGate.tsx`.

Stack: **Supabase** (auth + Postgres, for the `entitlements`/`branding` tables) + **Stripe** (Checkout +
Billing Portal, both subscription and one-time-lifetime pricing) + **Vercel Serverless Functions** (`/api` —
the only place Stripe secret keys / webhook verification / the Supabase service-role key are used; never
shipped to the browser).

**One-time setup** (do this before real payments will work):
1. Create a Supabase project, then run [supabase/migration.sql](supabase/migration.sql) in its SQL editor
   (creates `entitlements` + `branding` tables with row-level security, and a public `branding-logos` storage
   bucket).
2. Create a Stripe account/product ("Volteq Premium") with 3 Prices: monthly recurring, annual recurring, and
   one-time (lifetime). Note the 3 price IDs and the secret key.
3. Add a Stripe webhook endpoint at `https://<your-domain>/api/stripe-webhook` for events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Note the
   signing secret.
4. Copy [.env.local.example](.env.local.example) to `.env.local` (gitignored) and fill in all values; add the
   same values to the Vercel project's Environment Variables for production.

**Local development**: plain `vite dev` does not run the `/api/*` serverless functions — use `npx vercel dev`
instead when testing checkout/webhook flows. Use Stripe's test-mode keys and test card (`4242 4242 4242 4242`),
and `stripe listen --forward-to localhost:3000/api/stripe-webhook` (Stripe CLI) to receive webhook events
locally.

**Known limitation**: this is a fully client-rendered app with no server-side calculation step, so gating is a
UI-level convenience gate backed by a real entitlement check (not spoofable via `localStorage`/devtools) — it
does not hide the advanced-mode source code itself from a technically determined user inspecting the JS
bundle. That would require moving that logic server-side, which is out of scope today.

## SEO

Each route gets its own `<title>`, meta description, `rel=canonical`, Open Graph/Twitter tags, and a
`WebApplication` JSON-LD block, set on every navigation by `src/components/Seo.tsx` (rendered once in
`App.tsx`, driven by `useLocation()`). The actual title/description text is *not* duplicated in `Seo.tsx` —
it reads from `src/lib/seo.ts`, which in turn reads from `NAV_CATEGORIES` in `src/lib/navCategories.ts` (the
same single source of truth used by the nav/Home/App routing), plus a couple of static entries for `/`,
`/account`, and `/reset-password` (the latter two are marked `noindex` — no SEO value). `index.html` carries
matching static fallback tags for the brief pre-hydration window and for crawlers/link-preview bots that
don't execute JS.

`public/robots.txt` and `public/sitemap.xml` are static files, hand-maintained alongside `navCategories.ts`
(see step 7 below) rather than generated at build time — consistent with the rest of this checklist already
being a manual multi-file update.

## Adding a new calculator

1. Add a `src/lib/<name>Physics.ts` module with the pure calculation functions.
2. Add a `src/pages/<Name>Calculator.tsx` page.
3. Register the route in `src/App.tsx` and the nav link in `src/components/NavBar.tsx`.
4. Add a tool card to `src/pages/Home.tsx`.
5. For PDF export, build `inputSections`/`outputSections`/`calculationSteps` (see `src/lib/pdfExport.ts` types)
   from your page's state, and add an "Export PDF" button calling `exportReportToPdf(...)` — follow the existing
   calculators for the pattern.
6. **Premium gating, built in from the start, not retrofitted later**: wrap the "Export PDF" button in
   `<PremiumGate feature="PDF export">`, spread `useBranding()`'s result into the `exportReportToPdf(...)` call
   so a premium user's saved company name/logo appears on their reports, and if the calculator has an
   "advanced"/override mode, wrap its toggle in `<PremiumGate feature="...">` too (plus a `useEffect` that
   forces the mode off if `useEntitlement().isPremium` becomes false, in case a subscription lapses while the
   toggle was already on — see `BoltedJointCalculator.tsx` for the reference implementation of all of this).
7. **SEO**: if the nav `label` in `navCategories.ts` wouldn't make a good search-result title on its own (too
   short, or doesn't mention the standard it's checked against), add a `seoTitle` override on that entry — see
   the "SEO" section above. Then add a `<url>` entry for the new path to `public/sitemap.xml`.
