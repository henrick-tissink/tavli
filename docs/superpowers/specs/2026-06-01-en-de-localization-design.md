# Design: Full EN/DE Localization for Tavli

**Date:** 2026-06-01
**Status:** Approved (design) — pending spec review
**Author:** brainstormed with Henric

---

## 1. Goal & scope

Make Tavli fully usable in **English** and **German**, alongside the Romanian
default, across **all three surfaces**:

- **Consumer storefront** (public, SEO-relevant): city home, search, map,
  restaurant detail, menus, booking, reviews, events, saved, profile, plus the
  tokenized flows (`/reservations/[token]`, `/reviews/[token]`,
  `/event-requests/[token]`) and the already-localized pricing & legal pages.
- **Partner dashboard** (authenticated app): reservations, menu editor, tables,
  diners, marketing, analytics, billing, staff, onboarding, profile/photos/etc.
- **Admin console** (authenticated app): all gated admin routes.

"Usable in EN/DE" means **two distinct things**, both in scope:

1. **UI chrome** — every button/label/heading/placeholder/error, currently
   hardcoded Romanian inline, extracted into message catalogues and translated.
2. **Partner-authored content** — restaurant names, descriptions, menus, etc.,
   shown in the diner's locale when the partner has authored a translation, with
   **silent Romanian fallback** otherwise.

### Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Surfaces | **Everything** (consumer + partner + admin) |
| Routing | **Hybrid** — path-prefix for consumer; `profiles.locale` preference for partner/admin |
| First-visit detection | **Auto-detect + redirect once** via `Accept-Language`, cookie-remembered; switcher overrides |
| Content fallback | **Silent Romanian fallback** (existing `loadRestaurantTranslation`) |
| i18n mechanism | **Static JSON catalogues + native `Intl`** (keep the locked "no next-intl" pattern) |
| `<html lang>` foundation | **Route-group split** — `app/(public)/[lang]/` + `app/(app)/`, each its own root layout |

### Non-goals (YAGNI)

- **No machine-translation pipeline.** Untranslated partner content falls back to RO.
- **No next-intl / next-international / other i18n dependency.** Native `Intl` +
  the existing static-catalogue pattern cover plurals, dates, numbers, currency.
- **No RTL.** ro/en/de are all LTR.
- **No new locales beyond ro/en/de** in this work (the infra is generic, but we
  ship exactly three).

---

## 2. Environment facts (verified against this repo)

These shaped the design and **must** be honored (AGENTS.md: "This is NOT the
Next.js you know — read `node_modules/next/dist/docs/` before writing code").

- **Next.js 16.2.4.** Middleware is now **`proxy.ts`** with
  `export function proxy(request)` (NOT `middleware.ts`). Verified in
  `node_modules/next/dist/docs/01-app/02-guides/internationalization.md` and
  `…/03-api-reference/03-file-conventions/proxy.md`.
- Blessed i18n routing = a **`[lang]` dynamic segment** with
  `generateStaticParams` for per-locale static generation; `params` is a
  **Promise** (`const { lang } = await params`).
- **Multiple root layouts via route groups are supported**
  (`…/route-groups.md`): navigating between two root layouts triggers a full page
  reload (acceptable — consumer vs partner are different apps); routes in
  different groups must not resolve to the same URL; with no top-level
  `app/layout.tsx`, the home route `/` must live inside one group.
- **Existing locked i18n pattern** (`src/lib/i18n/load-messages.ts`): per-locale
  JSON under `src/messages/{ro,en,de}/`, **statically imported**, with a
  `Record<Locale, Messages>` TS interface making any missing key a build error.
  `Locale = "ro" | "en" | "de"`, `LOCALES`, `DEFAULT_LOCALE = "ro"`, `isLocale`
  already exist here.
- **Restaurant-content loader already exists but is dormant**:
  `src/lib/translations/load.ts` → `loadRestaurantTranslation(restaurantId, locale)`
  with row-level RO fallback (`pickTranslationRow`). Zero runtime callers today.
- **`profiles.locale`** column already exists (varchar(5), default `"ro"`).
- Schema already has `restaurantTranslations`, `menuTranslations`,
  `menuSectionTranslations`, `menuItemTranslations`, `restaurantPhotoTranslations`.
- Today there is **no `middleware.ts`/`proxy.ts`**; `/en` & `/de` exist only as
  literal route folders for pricing + legal, using `display:contents` `lang`
  wrappers (audit #17).
- Transactional email (`sendTransactionalEmail`) already accepts a `locale`
  argument — currently hardcoded `"ro"` at call sites.

---

## 3. Architecture overview

### 3.1 Two root-layout groups

```
app/
  (public)/                 ← root layout #1: <html lang={lang}>, per-locale static
    [lang]/
      layout.tsx            ← generateStaticParams → [{lang:'ro'},{lang:'en'},{lang:'de'}]
      [city]/(shell)/…      ← consumer storefront (moved here)
      [city]/[slug]/menu/…
      events/…
      pricing/…             ← folded in from app/(en|de)/pricing + app/pricing
      (legal)/…             ← folded in from app/(legal)/(en|de|ro)
    reservations/[token]/…  ← token flows (locale resolved per §6.3, see note)
    reviews/[token]/…
    event-requests/[token]/…
  (app)/                    ← root layout #2: <html lang={profileLocale}>, dynamic
    partner/…
    admin/…
  api/…                     ← unchanged (no <html>; route handlers)
  auth/, c/, u/             ← unchanged or assigned to a group as needed
```

- **No top-level `app/layout.tsx`.** Shared `<head>`/font/`<body>` setup is
  extracted into a shared component used by both group root layouts. The home
  route `/` lives in `(public)`.
- **`(public)` root layout** sets real `<html lang={lang}>` and is statically
  generated per locale — correct SEO/accessibility, supersedes the audit-#17
  `display:contents` hack for the public site.
- **`(app)` root layout** reads the session's `profiles.locale` (these routes are
  already authenticated/dynamic) and sets `<html lang={profileLocale}>`. No URL
  prefix.

> **Token flows note.** `/reservations/[token]` etc. are public but not
> city-scoped and have no logged-in session. Locale is resolved from, in order:
> (1) an explicit `?lang=` param embedded in the email link, (2) the
> `NEXT_LOCALE` cookie, (3) RO default. They live directly under `(public)` (not
> under `[lang]`) and read the resolved locale via a small server helper rather
> than a route param. The email that generates the link stamps `?lang=` with the
> diner's locale.

### 3.2 `proxy.ts` (locale routing + detection)

A single `proxy.ts` at the project root handles the **consumer** surface only
(its matcher excludes `/partner`, `/admin`, `/api`, `_next`, static assets):

- **As-needed prefix.** RO is unprefixed. A request to `/[city]/…` with no locale
  segment is **rewritten** internally to `/ro/[city]/…` (URL stays unprefixed).
  `/en/…` and `/de/…` are served directly.
- **Detect once.** If the path has no locale prefix AND there is no `NEXT_LOCALE`
  cookie: read `Accept-Language`, pick the best of `ro|en|de`, and — if it is not
  RO — **redirect** to the prefixed URL and set `NEXT_LOCALE`. If RO wins, set the
  cookie and rewrite (no redirect). Once the cookie exists, never auto-redirect
  again (deep links and crawlers always get the locale the URL asks for).
- Locale matching uses `Intl`/`Negotiator`-style parsing of `Accept-Language`
  (small hand-rolled matcher over three locales; no dependency required).

### 3.3 Locale switching & persistence

- **Switcher component** (`<LocaleSwitcher>`), placed in consumer nav and in the
  partner/admin shells.
  - **Consumer**: navigates to the same route under the chosen locale prefix
    (RO → strip prefix) and sets `NEXT_LOCALE`.
  - **Partner/admin**: a server action updates `profiles.locale` (and
    `NEXT_LOCALE`), then refreshes. No URL change.
- **Persistence precedence**: logged-in user → `profiles.locale`; otherwise
  `NEXT_LOCALE` cookie; otherwise detected; otherwise RO.

---

## 4. i18n core (keeps the locked pattern, strengthened)

### 4.1 Catalogues

- Location: `src/messages/{ro,en,de}/<namespace>.json` (extends the existing
  `…/pricing.json`).
- **Namespaces** (so a diner never ships partner/admin strings, and files stay
  focused): `common`, `nav`, `discovery`, `restaurant`, `menu`, `booking`,
  `reviews`, `events`, `legal`, `emails`, `partner.common`, `partner.reservations`,
  `partner.menu`, `partner.tables`, `partner.diners`, `partner.marketing`,
  `partner.analytics`, `partner.billing`, `partner.staff`, `partner.onboarding`,
  `admin`. (Exact split finalized during extraction; principle = one namespace
  per coherent feature area.)
- Each namespace has a TS interface and a `Record<Locale, NsMessages>` map →
  **missing/extra keys are a compile error** in any locale. This is the existing
  `load-messages.ts` contract, generalized.

### 4.2 Access

- **Server (RSC / server components / actions):**
  `getMessages(locale, ns)` returns the typed namespace object. Pure, synchronous
  (static imports), no I/O.
- **Client components:** `<MessagesProvider locale ns-bundle>` provides the
  needed namespaces; `useT(ns)` returns a `t` bound to that namespace. Chosen
  because the storefront and dashboards have many `"use client"` components
  (`FeedPageClient`, reservation sheets, editors) where prop-drilling strings
  would be unworkable. Only the namespaces a route needs are passed to the
  provider, keeping client payload minimal.

### 4.3 `t()` and formatting — native `Intl`

- `t(key, vars?)`:
  - `{var}` interpolation.
  - Pluralization via **`Intl.PluralRules(locale)`**: messages declare forms,
    e.g. `{ "tables": { "one": "{count} masă", "few": "{count} mese", "other": "{count} de mese" } }`.
    `Intl.PluralRules('ro')` returns `one|few|other` correctly (RO: `1`→one,
    `2–19`→few, `0` & `20+`→other-with-"de"); EN/DE use `one|other`. The helper
    selects the right form per locale — **this is the correctness win over naive
    string-swap i18n.**
- Formatting helpers (all wrap native `Intl`, locale-aware):
  - `formatDate(date, locale, opts)` → `Intl.DateTimeFormat` (RO `15 sept. 2026`,
    DE `15. Sept. 2026`, EN `Sep 15, 2026`).
  - `formatNumber` / `formatCurrency(cents, currency, locale)` →
    `Intl.NumberFormat` (correct decimal/grouping per locale; lei/EUR/TRY).
- Locale → BCP-47 mapping for `Intl`: `ro→ro-RO`, `en→en-GB`, `de→de-DE`
  (centralized so we can tune, e.g. en-US vs en-GB, in one place).

---

## 5. Restaurant content & menus

- Wire **`loadRestaurantTranslation`** into the venue detail and any server
  component that renders restaurant prose, keyed by active locale, silent RO
  fallback (already implemented in the loader).
- Add an analogous **menu translation loader** covering `menuTranslations`,
  `menuSectionTranslations`, `menuItemTranslations` (same fallback shape) and wire
  it into the public menu page and the menu sections/items on the venue page.
- Partner-side **Translations editor already writes** these tables — no change
  needed there beyond ensuring all translatable fields are covered.
- Photo alt text: wire `restaurantPhotoTranslations` where alt text is rendered.

---

## 6. Emails & notifications (diner- and partner-facing)

- **Diner-facing emails** (confirmation, 24h reminder, post-visit review request,
  event-request OTP / quote / expiry) render in the **diner's locale**, captured
  at creation time from the active request locale (booking/event flows already run
  under a known locale) and persisted on the row where one isn't already stored.
- **Partner-facing emails** (new-booking alert, partner-cancelled, event nudges)
  render in the **partner's `profiles.locale`**.
- Mechanism: `sendTransactionalEmail` already takes `locale`; replace hardcoded
  `"ro"` at call sites with the resolved locale. Email React templates read from
  the `emails` namespace via `getMessages(locale, "emails")`.
- Links embedded in emails carry `?lang=<locale>` so the landed token page renders
  in the same language (see §3.1 token-flow note).

---

## 7. SEO & accessibility

- **`hreflang`** alternates on every public page: `ro`, `en`, `de`, plus
  `x-default` (→ RO). Generated from the current path + locale set.
- **Localized metadata**: `<title>`, description, OG/Twitter per locale via the
  `meta` keys in each namespace (pricing already does this — generalize).
- **Canonical** per locale (self-referential).
- **`sitemap.ts`**: emit each public URL under all three locales with `hreflang`
  alternates.
- **`<html lang>`** correct per page (from §3.1).
- **`robots`/noindex** unchanged for `(app)`; `(public)` indexable per locale.

---

## 8. Quality, testing & translation register

### 8.1 Tests
- **Key-parity test**: for every namespace, assert `ro`/`en`/`de` have identical
  key sets (the TS `Record<Locale,…>` already enforces this at compile time; the
  test guards JSON drift and nested arrays).
- **Plural-rule unit tests**: `t()` selects correct forms for representative
  counts in each locale (esp. RO `1 / 2 / 20`).
- **Format snapshots**: `formatDate`/`formatCurrency`/`formatNumber` per locale.
- **`proxy.ts` tests**: detection/redirect/rewrite/cookie precedence.
- **Restaurant-content fallback test**: missing EN row → RO value returned.

### 8.2 Regression guard
- A test (or lightweight lint rule) that scans `(public)`/`(app)` JSX for
  **hardcoded Romanian-looking literals** (heuristic: Latin text containing RO
  diacritics `ă â î ș ț` or known RO stopwords in JSX text/`aria-*`/`placeholder`)
  and fails CI, so new code can't reintroduce inline RO strings. Allowlist for
  unavoidable cases. Tuned to minimize false positives.

### 8.3 Translation register (style guide, in the spec)
- **Tone**: warm, concise, restaurant-hospitality voice.
- **German**: formal **Sie** (standard for restaurant/booking context).
- **Romanian**: informal **tu** (matches the existing copy's voice).
- **English**: neutral, friendly; `en-GB` spelling.
- EN/DE catalogue strings must be **native-quality reviewed**, not raw machine
  output. Initial drafts are authored as part of extraction and flagged for human
  review before each phase ships.
- A short glossary pins product terms (e.g. "rezervare"→"reservation"/"Reservierung",
  "masă"→"table"/"Tisch", "oaspete"→"guest"/"Gast") for consistency.

---

## 9. Phasing (each phase independently shippable)

- **Phase 0 — i18n core & foundation**
  - `Locale` infra generalized out of `load-messages.ts`; `getMessages`,
    `MessagesProvider`/`useT`, `t()` + `Intl` format helpers.
  - **Route-group split**: create `app/(public)/[lang]/` and `app/(app)/`; remove
    top-level `app/layout.tsx`; shared root-layout component; `generateStaticParams`.
  - `proxy.ts` (as-needed prefix + detect-once + cookie).
  - `<LocaleSwitcher>` + `profiles.locale` server action.
  - hreflang/canonical/sitemap infra.
  - Fold existing `/en/pricing`, `/de/pricing`, `(legal)` locale trees into
    `(public)/[lang]`. Pricing/legal already have translations → first proof the
    foundation works end-to-end.
  - **Acceptance**: pricing + legal fully work under the new routing in all three
    locales with detection, switching, hreflang, and static generation intact.

- **Phase 1 — consumer storefront**
  - Extract all consumer UI strings into namespaces; translate.
  - Wire restaurant + menu + photo content translations (silent RO fallback).
  - Localize diner-facing emails + token-flow pages.
  - **Acceptance**: a diner can browse, search, view a restaurant/menu, book,
    modify/cancel, review, and request an event entirely in EN or DE, receiving
    localized emails; untranslated partner content falls back to RO cleanly.

- **Phase 2 — partner dashboard**
  - Extract/translate all partner UI; switcher updates `profiles.locale`;
    `(app)` root layout `<html lang>`; partner-facing emails localized.
  - **Acceptance**: a partner can operate the full dashboard in EN/DE.

- **Phase 3 — admin console**
  - Extract/translate all admin UI.
  - **Acceptance**: admin console fully usable in EN/DE.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Route-group split is broad and could break routing/auth/layout assumptions | Phase 0 proves it on pricing/legal first (already translated); full test pass + manual smoke before Phase 1. Read the Next 16 docs for `proxy`, route-groups, `generateStaticParams`, `PageProps`/`LayoutProps` before coding. |
| String-extraction volume (200+ files) | Mechanical and parallelizable; per-namespace; regression guard prevents backslide; phased so value ships incrementally. |
| Translation quality | Native-quality review gate per phase; glossary + register guide; key-parity enforced at build. |
| Static generation regressions from new root layouts | `generateStaticParams` over the three locales; verify pricing/legal still SSG/ISR in Phase 0. |
| Token-flow locale (no session/param) | Email links stamp `?lang=`; cookie + RO fallback otherwise. |
| `proxy.ts` redirect loops / crawler issues | Detect-once + cookie; serve URL locale as-is afterward; matcher excludes app/api/_next/assets; explicit tests. |

---

## 11. Affected/created artifacts (indicative, not exhaustive)

- **New**: `proxy.ts`; `src/lib/i18n/` (`get-messages.ts`, `messages-provider.tsx`,
  `t.ts`, `format.ts`, `locale.ts` generalized); `src/messages/{ro,en,de}/<ns>.json`
  (many); `<LocaleSwitcher>`; menu-translation loader; hreflang/sitemap helpers;
  tests + regression guard.
- **Moved**: consumer routes → `app/(public)/[lang]/…`; partner/admin →
  `app/(app)/…`; pricing/legal folded into `(public)/[lang]`.
- **Changed**: root layout split; `sendTransactionalEmail` call sites (locale);
  email templates (read `emails` namespace); `profiles.locale` write path;
  `restaurants-repo`/menu rendering to consume content translations.
- **Superseded**: audit-#17 `display:contents` `lang` wrappers for the public site.
```
