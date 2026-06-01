# Design: Full EN/DE Localization for Tavli

**Date:** 2026-06-01
**Status:** Approved & self-reviewed — ready for Phase 0 implementation planning
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
- **No localized URL slugs.** City and restaurant slugs stay canonical (RO) across
  locales; only display names and content localize.

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
  (public)/[lang]/            ← ROOT LAYOUT #1 lives here: <html lang={lang}>
    layout.tsx                ← root layout; generateStaticParams → ro|en|de; dynamicParams=false
    page.tsx                  ← home (served at /ro after proxy rewrites bare /)
    [city]/(shell)/…          ← consumer storefront (moved here)
    [city]/[slug]/menu/…
    events/…
    reservations/[token]/…    ← token flows: email links carry the /<lang>/ prefix
    reviews/[token]/…
    event-requests/[token]/…
    pricing/…                 ← folded in from app/(en|de)/pricing + app/pricing
    (legal)/…                 ← folded in from app/(legal)/(en|de|ro)
  (app)/                      ← ROOT LAYOUT #2: <html lang={resolvedLocale}>, always dynamic
    layout.tsx
    partner/…                 ← incl. pre-auth sign-in / sign-up / verify-email / onboard
    admin/…
  api/…, auth/…, c/…, u/…     ← route handlers (no <html>, no layout) — remain top-level, unaffected
```

- **No top-level `app/layout.tsx`.** Two root layouts via route groups (supported;
  full reload when crossing them — fine, they are different apps). Shared
  `<head>`/font/`<body>` scaffolding is factored into a shared component imported
  by both roots.
- **ALL public routes live under `(public)/[lang]/`**, including the token flows.
  The root layout is `app/(public)/[lang]/layout.tsx`; it reads `lang` from the
  route **param** and sets real `<html lang={lang}>`. There is exactly one,
  uniform locale source for the whole public tree. Token-flow **email links embed
  the locale as a path prefix** (`/en/reservations/<token>`); old unprefixed links
  (`/reservations/<token>`) still resolve as RO via the proxy rewrite, so existing
  emails keep working.
- **`lang` is a route param, not `headers()`** — so static pages (pricing, legal)
  keep their per-locale static/ISR generation. This is exactly what the audit-#17
  `headers()` concern blocked; the `[lang]` param sidesteps it. DB-backed consumer
  pages stay dynamic (they are already `force-dynamic`) and render correct
  per-locale SSR. `dynamicParams = false` → only ro/en/de are valid; any other
  prefix 404s.
- **`(app)` root layout** is always dynamic (authenticated / non-indexed) and
  resolves `<html lang>` via the precedence in §3.3 (session profile → cookie →
  Accept-Language → RO) — correct for both post-auth pages AND pre-auth pages
  (sign-in, sign-up, verify-email, onboarding). No URL prefix.
- **Superseded** for the public site: the audit-#17 `display:contents` `lang`
  wrappers (we now emit a real `<html lang>`).

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
- **Bare `/` and the root.** `/` (and any unprefixed public path) is rewritten to
  its `/ro/…` equivalent in the proxy before routing, so
  `app/(public)/[lang]/page.tsx` serves it with `lang=ro`. **Phase-0 validation
  gate:** confirm Next 16 serves the home route purely via proxy rewrite with no
  literal top-level `/` page (this as-needed-prefix behavior is the single most
  unproven piece, since we hand-roll what next-intl normally provides).
  **Documented fallback** if it proves brittle: switch to `localePrefix: always`
  — RO is also prefixed at `/ro`, with a permanent `/ → /ro` redirect. That keeps
  the entire rest of the design intact and only changes the RO URL shape.

### 3.3 Locale resolution, switching & persistence

**`(public)` (consumer)** — the **URL is authoritative**. The `[lang]` segment
decides the language, so an `/en/…` link is shareable and crawlable. The proxy
only *chooses* the prefix on first entry (§3.2); it never overrides an explicit
prefix afterwards.

**`(app)` (partner/admin)** — resolved server-side in the root layout, in order:
1. authenticated session's `profiles.locale`,
2. `NEXT_LOCALE` cookie,
3. `Accept-Language` best match,
4. RO.
This single precedence covers post-auth pages and pre-auth pages
(sign-in / sign-up / verify-email / onboarding) uniformly.

**Switcher (`<LocaleSwitcher>`)** in the consumer nav and the partner/admin shells:
- **Consumer**: client navigation to the same route under the chosen prefix
  (RO → strip prefix); always sets `NEXT_LOCALE`; **also updates `profiles.locale`
  when a diner is logged in**, so the choice sticks across devices.
- **Partner/admin**: server action updates `profiles.locale` **if logged in**,
  else just `NEXT_LOCALE` (pre-auth); then refresh. No URL change.

**Login sync**: on any successful sign-in, set `NEXT_LOCALE` from the user's
`profiles.locale` so the consumer experience and outbound emails immediately match
their saved preference.

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
- **Prefer server-side `t`.** Server components/actions call `getMessages`
  directly (zero client cost); the provider exists only for genuinely-client
  components, so the diner's JS payload carries only the strings rendered
  client-side.

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
- **Currency code mapping**: the app's currency *labels* (`lei`/`EUR`/`TRY`) are
  mapped to ISO 4217 for `Intl.NumberFormat` (`lei → RON`, `EUR → EUR`,
  `TRY → TRY`) — `Intl` rejects non-ISO codes. Prices stay in their native
  currency (no FX conversion): an EN/DE diner sees the same lei the venue charges,
  formatted per their locale.

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
- **Slugs stay canonical** (the existing RO city/restaurant slugs) across all
  locales — slugs are identifiers, not translated content, so we avoid
  localized-slug routing/redirect complexity. Only the **city display name** is
  localized (`bucuresti` → "București" / "Bucharest" / "Bukarest"); the current
  hardcoded `formatCityName` map moves into the `common`/`nav` catalogue.

---

## 6. Emails & notifications (diner- and partner-facing)

- **Persisted locale (requires a migration).** Reminders and post-visit emails are
  sent later by background jobs with **no request context**, so the diner's locale
  must be stored, not re-derived. Add a `locale` column to `reservations` and
  `event_requests` (default `'ro'`), set from the active request locale at
  creation. This is a **hand-authored migration** per AGENTS.md (drizzle-kit
  generate is banned): new `drizzle/migrations/NNNN_*.sql` + `_journal.json` entry
  + descriptive `schema.ts` update; additive only.
- **Diner-facing emails** (confirmation, 24h reminder, post-visit review request,
  event-request OTP / quote / expiry) render in the **diner's locale** read from
  that persisted column (booking/event flows run under a known locale at creation).
- **Partner-facing emails** (new-booking alert, partner-cancelled, event nudges)
  render in the **partner's `profiles.locale`**.
- Mechanism: `sendTransactionalEmail` already takes `locale`; replace hardcoded
  `"ro"` at call sites with the resolved locale. Email React templates read from
  the `emails` namespace via `getMessages(locale, "emails")`.
- Token links in emails carry the `/<lang>/` **path prefix** (§3.1), so the landed
  confirmation / cancel / review / event page renders in the diner's language;
  unprefixed legacy links fall back to RO via the proxy rewrite.

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
- **Primary — `no-literal-string` lint rule** (i18next-style) scoped to JSX text,
  `aria-*`, `placeholder`, `alt`, and `title` in the localized trees, with a small
  allowlist. Forces new UI strings through `t()` and catches even diacritic-free
  Romanian (e.g. "Meniu", "Salut"), which a diacritic scan would miss.
- **Complement — diacritic/stopword scan** flagging RO diacritics (`ă â î ș ț`) or
  known RO stopwords, as a backstop for literals the lint allowlist lets through.
- **Honest limitation**: neither is airtight; the lint rule is the real guard and
  the scan is a safety net. Both run in CI.

### 8.3 Translation register (style guide, in the spec)
- **Tone**: warm, concise, restaurant-hospitality voice.
- **German**: formal **Sie** (standard for restaurant/booking context).
- **Romanian**: informal **tu** (matches the existing copy's voice).
- **English**: neutral, friendly; `en-GB` spelling.
- **Authoring & review (realistic):** initial EN/DE strings are authored to a high
  standard during extraction, following the register + glossary. A
  **native-speaker review pass is recommended before each phase's public launch**
  (especially German formal register); the product ships functional translations
  in the meantime and improves via glossary-pinned terms. Build-time key-parity
  guarantees no string is ever silently missing — at worst a key is imperfectly
  translated, never absent.
- A short glossary pins product terms (e.g. "rezervare"→"reservation"/"Reservierung",
  "masă"→"table"/"Tisch", "oaspete"→"guest"/"Gast") for consistency.

---

## 9. Phasing (each phase independently shippable)

> **Sizing.** This is a multi-phase program touching 200+ files. Each phase is a
> substantial body of work and gets its **own implementation plan** — we do not
> plan all four at once. Phase 0 is the critical-path foundation that must be
> proven before the rest; Phases 1–3 are large but largely mechanical (string
> extraction + translation) and parallelizable within a phase.

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
| Translation quality | Native-speaker review pass recommended per phase; glossary + register guide; key-parity enforced at build (no missing strings, ever). |
| Static generation regressions from new root layouts | `generateStaticParams` over the three locales; verify pricing/legal still SSG/ISR in Phase 0. |
| Token flows live under `[lang]` | Email links stamp the `/<lang>/` path prefix; old unprefixed links still resolve as RO via the proxy rewrite (backward compatible). |
| Bare `/` under as-needed prefix is unproven hand-rolled behavior | Phase-0 validation gate; documented `localePrefix: always` fallback (§3.2) that leaves the rest of the design intact. |
| Email-locale persistence needs a schema change | Hand-authored additive migration (`locale` on `reservations`/`event_requests`) per the banned-drizzle-generate process; default `'ro'` so existing rows are safe. |
| `proxy.ts` redirect loops / crawler issues | Detect-once + cookie; serve URL locale as-is afterward; matcher excludes app/api/_next/assets; explicit tests. |

---

## 11. Affected/created artifacts (indicative, not exhaustive)

- **New**: `proxy.ts`; `src/lib/i18n/` (`get-messages.ts`, `messages-provider.tsx`,
  `t.ts`, `format.ts`, `locale.ts` generalized); `src/messages/{ro,en,de}/<ns>.json`
  (many); `<LocaleSwitcher>`; menu-translation loader; hreflang/sitemap helpers;
  tests + regression guard; **a hand-authored migration** adding `locale` to
  `reservations` and `event_requests` (`drizzle/migrations/NNNN_*.sql` +
  `_journal.json` + descriptive `schema.ts`).
- **Moved**: consumer routes → `app/(public)/[lang]/…`; partner/admin →
  `app/(app)/…`; pricing/legal folded into `(public)/[lang]`.
- **Changed**: root layout split; `sendTransactionalEmail` call sites (locale);
  email templates (read `emails` namespace); `profiles.locale` write path;
  `restaurants-repo`/menu rendering to consume content translations.
- **Superseded**: audit-#17 `display:contents` `lang` wrappers for the public site.
