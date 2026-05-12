# GDPR + Legal Pages — Design Spec

**Date:** 2026-05-12
**Status:** Approved (brainstorm complete, ready for implementation plan)
**Master gap:** Item #1 of the six-step product-completeness pass

## Goal

Tavli is a Romanian consumer product collecting EU PII (name, phone, email, dietary notes via reservation flow) without any legal pages, consent surface, or GDPR-rights mechanism. This work ships the **minimum compliant surface** so the product can be presented to partners and end-users without active legal liability — and so the broader marketing/partner-acquisition push isn't bottlenecked on legal scaffolding.

## Non-Goals

- **Drafting binding legal advice.** I am not a lawyer. What ships are Romanian-law-aligned templates that **must be reviewed by a Romanian lawyer** (or a service like avocatul.ro / Termly / iubenda) before any partner outreach, paid acquisition, or analytics integration. The codebase carries explicit `[REVIEW BEFORE LAUNCH]` markers in dev mode.
- Self-service GDPR data export or in-product account deletion. All data-subject requests are mailto-handled at `privacy@tavli.ro` (manual processing, 30-day SLA as GDPR requires).
- Granular cookie consent UI (Essential / Functional / Analytics / Marketing categories). Tavli currently has zero non-essential cookies; the minimal disclosure footnote is legally sufficient. Granular consent gets built when (if) analytics/tracking is added.
- Full content-marketing surface (blog, about, help, partner FAQ). Footer link stubs reserve those slots but the pages themselves are out of scope.
- Legal-entity registration. Pages ship with `[ENTITY NAME — TBD]` placeholders; replacing them is a single-file edit when the SRL is registered.
- Self-service account deletion flow. Will come later when we wire up the broader "Account settings" surface; for now the privacy policy directs users to email `privacy@tavli.ro`.

## Brainstorm Decisions (the six clarifying questions)

| # | Decision |
| --- | --- |
| 1 | Legal text source: **I draft Romanian-law-aligned templates** (originally "I'll get a lawyer / draft placeholders now" — Q1 answer was corrected by user mid-flow) |
| 2 | Documents to ship: **Privacy Policy, Terms of Service, Cookie Policy, ANPC + SOL notice** (all four) |
| 3 | Legal entity: **Not registered — use placeholders** (`[ENTITY NAME]`, `[CUI]`, `[J-NUMBER]`, `[REGISTERED ADDRESS]`) |
| 4 | Cookie banner UX: **Minimal disclosure footnote** (single Accept button, no granular categories) |
| 5 | Languages: **Romanian + English in parallel** (RO at root, EN under `/en/`) |
| 6 | GDPR data-subject requests: **Mailto-only** to `privacy@tavli.ro` |

## Architecture

A new route group, a content directory, two reusable components, plus light edits to existing layouts. **No database changes, no migrations, no API endpoints, no environment variables.**

```
Routes (Next.js App Router):
  src/app/(legal)/
    layout.tsx                       ← shared LegalLayout + dev "[REVIEW BEFORE LAUNCH]" banner
    confidentialitate/page.tsx       ← RO Privacy
    termeni/page.tsx                 ← RO Terms
    cookie-uri/page.tsx              ← RO Cookies
    anpc/page.tsx                    ← RO ANPC + SOL
    en/privacy/page.tsx              ← EN Privacy
    en/terms/page.tsx                ← EN Terms
    en/cookies/page.tsx              ← EN Cookies
    en/anpc/page.tsx                 ← EN ANPC + SOL

Content (MDX):
  src/content/legal/
    entity.ts                        ← single placeholder registry
    ro/{privacy,terms,cookies,anpc}.mdx
    en/{privacy,terms,cookies,anpc}.mdx

Components:
  src/components/legal/placeholder.tsx     ← dev-orange-box / prod-plain placeholder renderer
  src/components/legal/cookie-footnote.tsx ← bottom-anchored cookie disclosure
  src/components/site-footer.tsx           ← new desktop footer with legal + ANPC + EU ODR links

Edits to existing components:
  src/app/layout.tsx                       ← mount <CookieFootnote /> globally
  src/app/[city]/(shell)/profile/page.tsx  ← add "Legal & informare" list section
  src/components/reservation-sheet.tsx     ← add ANPC + EU ODR strip + terms acceptance line
```

**New runtime dependency:** `@next/mdx@^16` plus `@mdx-js/loader` + `@mdx-js/react`. Configured in `next.config.ts` with the standard `withMDX` wrapper. No remark/rehype plugins beyond defaults in v1.

**Why MDX over plain TSX:** Tavli will likely ship a blog / help-center / partner-FAQ surface within 6–12 months. Doing the MDX setup once for legal pages amortizes that cost. The trade-off (one dependency, one config change) is small. App-Router MDX is well-supported in Next 16 per the docs.

## Routes & URL Slugs

| Document | RO route | EN route |
| --- | --- | --- |
| Privacy Policy | `/confidentialitate` | `/en/privacy` |
| Terms of Service | `/termeni` | `/en/terms` |
| Cookie Policy | `/cookie-uri` | `/en/cookies` |
| ANPC + SOL Notice | `/anpc` | `/en/anpc` |

- RO at the root because the rest of the app is RO-only; EN deliberately namespaced under `/en/` so the broader EN-locale work (gap #4 of the master list) sits naturally underneath.
- Localized RO slugs (Romanian users search in Romanian; ANPC inspectors prefer Romanian URLs).
- Each route is a server component that imports its matching MDX and wraps it in the shared `(legal)` layout.

## Placeholder Strategy

A single registry. One component. Zero MDX edits when values change.

```ts
// src/content/legal/entity.ts
export const ENTITY = {
  name: "[ENTITY NAME — TBD]",
  cui: "[CUI — TBD]",
  jNumber: "[J-NUMBER — TBD]",
  address: "[REGISTERED ADDRESS — TBD]",
  email: "privacy@tavli.ro",      // real, requires DNS alias (see Action Items)
  contactEmail: "hello@tavli.ro", // already in production footers
} as const;
```

```mdx
<!-- usage inside any *.mdx file -->
Operatorul site-ului este <Placeholder name="name" /> (CUI <Placeholder name="cui" />),
cu sediul în <Placeholder name="address" />.
```

The `<Placeholder>` component:
- Production: renders the value plainly.
- Development (`NODE_ENV !== "production"`): wraps the value in a dashed-orange box with a small "PLACEHOLDER" label so it's impossible to miss during review.
- Inserted into MDX-scope via the `MDXProvider` mounted in the `(legal)` layout — no per-file imports needed.

## Cookie Disclosure Footnote

`src/components/legal/cookie-footnote.tsx`, mounted globally in `src/app/layout.tsx`.

**Behavior:**
- Slides up from bottom on first visit, non-blocking, dismissible.
- Hidden on `/confidentialitate`, `/cookie-uri`, `/termeni`, `/anpc`, and their `/en/` equivalents (don't show the banner on top of the policy you just opened).
- "OK" persists in `localStorage` as `tavli_cookies_ack` with an ISO timestamp value.
- Auto-re-prompts after 30 days even if previously dismissed — so the banner is load-bearing infrastructure for when (if) tracking is added later.
- Reads route prefix to choose copy: `/en/...` → EN; otherwise RO.
- Z-index above MapFab, below SearchOverlay.

**Copy (final):**

- RO: `🍪 Folosim cookie-uri esențiale pentru autentificare și preferințe. Nu te urmărim.  [Detalii]  [OK]`
- EN: `🍪 We use essential cookies for login and preferences. No tracking.  [Details]  [OK]`

**Visual treatment:** `bg-surface-white`, `border-t border-border`, soft drop-shadow, full-width on mobile, `max-w-2xl mx-auto rounded-card mb-4` on desktop.

## Footer Surface, Navigation, and ANPC Compliance

Tavli has no footer today. Two surfaces scoped by viewport:

### Desktop — `<SiteFooter>` (new component)

Rendered on every route **except** `/admin/*` and `/partner/*`. Layout:

```
─────────────────────────────────────────────────────────────────
  Tavli                Despre               Legal
  Găsește-ți masa.     • Cum funcționează   • Confidențialitate
                       • Pentru restaurante • Termeni
                       • Contact            • Cookie-uri
                                            • ANPC

                       [🛡 ANPC SAL]  [⚖ EU ODR]   © 2026 Tavli  RO|EN
─────────────────────────────────────────────────────────────────
```

- ANPC SAL icon → `https://anpc.ro/ce-este-sal/` (Law 38/2015 requirement for e-commerce).
- EU ODR icon → `https://ec.europa.eu/consumers/odr` (EU Regulation 524/2013).
- Both icons use `rel="noopener noreferrer"` and open in a new tab.
- Language switcher (`RO | EN`) — bottom-right. Clicking toggles between paired routes; on non-legal routes, sends you home in the opposite language.
- "Despre" stubs are rendered as **disabled `<span>` elements** (no `<a>` tag, no `href`, muted text color) — until the underlying pages exist. Avoids 404 risk and avoids scope-creeping content marketing into this work. When those pages ship later, swap the `<span>` for `<a>` in one place.

### Mobile — Profile page "Legal & informare" section

Edit `src/app/[city]/(shell)/profile/page.tsx`. New section below the existing notification toggle:

```
─────────────────────
  Notificări     [ • ]
─────────────────────
  Legal & informare
  Confidențialitate     ›
  Termeni               ›
  Cookie-uri            ›
  ANPC & SOL            ›
  Contact: hello@…      ›
─────────────────────
```

Standard mobile pattern. No desktop footer on mobile viewports → no redundant link surface.

### Reservation flow — ANPC strip

Edit `src/components/reservation-sheet.tsx`. New line at the bottom of the confirmation step:

```
Prin rezervare, accepți Termenii și Politica de confidențialitate.
[🛡 ANPC SAL]  [⚖ EU ODR]
```

This is Tavli's only "transactional surface" (no payments — still a distance contract under Law 365/2002). The small print satisfies the disclosure rule and the icons satisfy the consumer-protection link requirement.

## Testing

| Layer | Tests |
| --- | --- |
| Component | `<Placeholder>` (2): dev-mode dashed-orange, prod plain value |
| Component | `<CookieFootnote>` (4): hidden after ack, hidden on policy routes, RO default, EN under `/en/` |
| Component | `<SiteFooter>` (3): hidden on `/admin/*` + `/partner/*`, language switcher pairs routes, external links carry `rel="noopener noreferrer"` |
| Integration | Structural-parity test: parse heading sequences in `ro/*.mdx` and `en/*.mdx`, assert pair-wise identical |
| Route | After build, hit all 8 legal routes in Playwright headed Chromium; assert 200 + `<main>` + `<h1>` |
| Route | Banner sweep: visit `/`, click `[OK]`, reload, confirm banner gone; visit `/confidentialitate`, confirm banner hidden |
| Prod smoke | `curl` 8 routes for 200 + correct content-type; manual visit + screenshot on tavli.ro |
| Manual | Send a test email to `privacy@tavli.ro` to confirm the alias receives |

**Not tested:**
- The legal prose itself (it will churn weekly until lawyer review).
- Live ANPC / EU ODR URLs from CI (external, flaky).
- Visual polish (DOM snapshots would generate noise).

## Action Items For The User (Out of Code Scope)

1. **Set up `privacy@tavli.ro`** — DNS alias (or its own inbox) in your email provider. Page links go live regardless; the manual confirmation that mail flows is a deploy gate. *Owner: user. Blocker: yes.*
2. **Schedule lawyer review** — before any partner outreach or paid acquisition push. Romanian-law-aligned templates are a starting line, not a finishing line. *Owner: user. Blocker: not for deploy; blocker for marketing.*
3. **Replace `[ENTITY NAME — TBD]` etc. in `src/content/legal/entity.ts`** once the SRL is registered. Single file edit. *Owner: user. Blocker: not for deploy; blocker for marketing.*

## Risks & Open Questions

- **Lawyer-review feedback may invalidate template structure.** If the lawyer requires different sectioning (e.g., a separate "Special Categories of Data" article) the MDX files will be reorganized. Plumbing infrastructure (routes, layout, banner, footer, placeholder) is unaffected.
- **EN translation drift.** RO is the canonical source; EN is hand-translated by me from English-language equivalents of Romanian privacy law sections. The structural-parity test catches heading drift, but content semantics could drift quietly. Lawyer review on EN side is a separate ask.
- **`[REVIEW BEFORE LAUNCH]` markers in dev-only output mean we ship "clean" prod by default.** Real production-readiness gate is the lawyer review, not the markers. Documenting clearly so this isn't a false-confidence signal.

## Files Touched (preview — final list in implementation plan)

```
New:
  next.config.ts                                ← + withMDX wrapper (modified, not new)
  src/app/(legal)/layout.tsx
  src/app/(legal)/confidentialitate/page.tsx
  src/app/(legal)/termeni/page.tsx
  src/app/(legal)/cookie-uri/page.tsx
  src/app/(legal)/anpc/page.tsx
  src/app/(legal)/en/privacy/page.tsx
  src/app/(legal)/en/terms/page.tsx
  src/app/(legal)/en/cookies/page.tsx
  src/app/(legal)/en/anpc/page.tsx
  src/content/legal/entity.ts
  src/content/legal/ro/{privacy,terms,cookies,anpc}.mdx
  src/content/legal/en/{privacy,terms,cookies,anpc}.mdx
  src/components/legal/placeholder.tsx
  src/components/legal/cookie-footnote.tsx
  src/components/site-footer.tsx
  src/components/__tests__/cookie-footnote.test.tsx
  src/components/__tests__/site-footer.test.tsx
  src/components/legal/__tests__/placeholder.test.tsx
  src/content/legal/__tests__/parity.test.ts

Modified:
  package.json (+ @next/mdx, @mdx-js/loader, @mdx-js/react)
  next.config.ts (withMDX wrapper)
  src/app/layout.tsx (mount <CookieFootnote />, <SiteFooter />)
  src/app/[city]/(shell)/profile/page.tsx (add Legal section)
  src/components/reservation-sheet.tsx (add ANPC strip + terms-acceptance line)
```
