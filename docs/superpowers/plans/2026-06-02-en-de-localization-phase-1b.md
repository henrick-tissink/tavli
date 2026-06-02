# EN/DE Localization — Phase 1b (Consumer UI String Extraction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Translate the consumer storefront UI into EN/DE by extracting every hardcoded Romanian string into namespaced message catalogues (RO = verbatim current text, EN/DE authored per the glossary), replacing inline strings with `t()`/`getMessages`, finishing the deferred secondary-link locale-prefixing, folding `(legal)` under `[lang]`, and adding the no-literal-string regression guard.

**Architecture:** Phase 0 i18n core (`getMessages`, `MessagesProvider`/`useT`, `t`, plural/format, `withLocale`). Phase 1a put the storefront under `(public)/[lang]` with a `MessagesProvider` in the shell. This phase fills catalogues and converts components.

**Branch:** `feat/en-de-localization-phase-1b`. **Spec:** `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`.

---

## THE METHODOLOGY (read before any task)

For each component/page in an area:
1. **Find** the hardcoded RO UI strings: JSX text, `aria-label`, `placeholder`, `alt`, `title`, button labels, `toast(...)`/error messages, and string consts used as UI text. (Skip: code identifiers, class names, data values, log/console strings, test files.)
2. **Add keys** to the area's namespace JSON under `src/messages/{ro,en,de}/<ns>.json`:
   - `ro` value = the **verbatim current Romanian string** (exact — this is what keeps existing tests green).
   - `en`/`de` = translations per the **Glossary & Register** below.
   - Use nested objects keyed by component/feature. Use `{var}` interpolation for dynamic parts. Use a plural bag `{ one, few, other }` whenever a count drives the text (RO needs `few`).
3. **Replace** inline strings:
   - **Server component/page:** `const m = getMessages(locale, "<ns>");` then `m.path.to.key` (or `translate(locale, m.key, vars)` for plurals/interpolation — import `translate` from `@/lib/i18n/t`).
   - **Client component:** `const t = useT("<ns>");` then `t("path.to.key", vars)`.
4. **Wire the namespace into the provider bundle** for the route (see Provider Wiring). Add the namespace to `src/lib/i18n/messages.ts` `CATALOGS` with a TS interface (build-time parity).
5. **Locale-prefix internal storefront links** in the same file using the `lang` the component now receives (helper `localized(path, lang)` = `lang === DEFAULT_LOCALE ? path : \`/${lang}${path}\``, or `withLocale`). This clears the Phase-1a secondary-link deferral for that file.
6. **Verify the area:** existing component tests (which assert RO text) STILL pass unchanged → proves faithful extraction; `npm run build`; `npx tsc --noEmit`; cross-locale parity holds (the `messages.test.ts` parity test covers every registered namespace).

> **Why this is safe:** because `ro` values are verbatim, the RO render is byte-identical, so the existing RO-asserting tests are the regression oracle. If a test that wasn't pre-existing-broken fails, the extraction changed RO output — fix it.

## Provider Wiring (where each namespace is supplied)
- **Shell-scoped namespaces** (`discovery`, `restaurant`, `profile`) → add to the bundle in `src/app/(public)/[lang]/[city]/(shell)/layout.tsx`. Use the new `buildBundle(lang, [...])` helper (Task 1).
- **Menu route** (`src/app/(public)/[lang]/[city]/[slug]/menu/page.tsx`) is OUTSIDE the shell → wrap `MenuPageClient` in its own `<MessagesProvider locale={lang} bundle={buildBundle(lang, ["common","menu"])}>`.
- **Token pages** (`reservations`, `reviews`, `event-requests` under `[lang]`) are outside the shell → each wraps its client form in a `MessagesProvider` with the relevant namespace(s) (`booking` / `reviews` / `events`).
- **Server components** (e.g. `events/page.tsx`, the reservation token server pages) use `getMessages(lang, ns)` directly — no provider needed for the server-rendered parts.

## Glossary & Register (authoritative — all areas follow this)
**Register:** German formal **Sie**; Romanian informal **tu**; English **en-GB**. Warm, concise hospitality voice.
**Glossary (ro → en / de):**
- rezervare → reservation / Reservierung · rezervă → book / reservieren
- masă (table) → table / Tisch · persoane → people / Personen · oaspete → guest / Gast
- meniu → menu / Speisekarte · fel/preparat → dish / Gericht
- recenzie → review / Bewertung · notă/rating → rating / Bewertung
- caută/căutare → search / Suche · salvează/salvat → save/saved → Save/Gespeichert
- acasă → home / Start · hartă → map / Karte · profil → profile / Profil
- eveniment privat → private event / private Veranstaltung · ofertă → quote / Angebot
- anulează → cancel / stornieren · modifică → change / ändern · confirmă → confirm / bestätigen
- terasă → terrace / Terrasse · interior → indoor / drinnen
- Keep brand "Tavli" untranslated. Keep city slugs canonical (display names live in `common.cities`).

## Namespaces (each registered in messages.ts with an interface)
`common` (exists), `discovery`, `restaurant`, `menu`, `booking`, `reviews`, `events`, `profile`, `legal`.

---

## Task 1: `buildBundle` helper + glossary committed
**Files:** `src/lib/i18n/messages.ts` (add helper), test.

- [ ] **Step 1 (test):** add to `src/lib/i18n/__tests__/messages.test.ts` a case: `buildBundle("en", ["common"])` returns `{ common: <en common catalogue> }`; `buildBundle("de", ["common"])` likewise for de.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3:** add to `messages.ts`:
```ts
/** Assemble a client-provider bundle for the given namespaces. */
export function buildBundle(locale: string, namespaces: Namespace[]): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const ns of namespaces) bundle[ns] = getMessages(locale, ns) as unknown as Record<string, unknown>;
  return bundle;
}
```
- [ ] **Step 4:** run → pass. `npx tsc --noEmit` clean.
- [ ] **Step 5:** refactor the shell layout to use `buildBundle(lang, ["common"])` (replaces the manual object). Build + shell tests green.
- [ ] **Step 6:** commit `feat(i18n): buildBundle helper + use it in the shell layout`.

---

## Task 2: Discovery area (~46 strings)
**Files (extract + prefix links):** `(shell)/page.tsx`, `(shell)/FeedPageClient.tsx`, `(shell)/CityShell.tsx`, `(shell)/map/*`, and components: `search-overlay.tsx`, `filter-pill-bar.tsx`, `filter-sheet.tsx`, `restaurant-card.tsx`, `city-cover-hero.tsx`, `context-banner.tsx`, `editorial-interstitial.tsx`, `dietary-filter-row.tsx`, `rating-chip.tsx`, `horizontal-section.tsx`, `map-carousel.tsx`, `top-nav.tsx`, `tab-bar.tsx`.
**Namespace:** `discovery` (new). Wire into shell bundle: `buildBundle(lang, ["common","discovery"])`.

- [ ] **Step 1:** Create `src/messages/{ro,en,de}/discovery.json` and a `DiscoveryMessages` interface; register in `messages.ts` `CATALOGS`. Populate by extracting every RO string from the files above (ro=verbatim, en/de=translated). Group keys by component (e.g. `search.placeholder`, `filters.clear`, `feed.trendingTitle`, `card.bookCta`, `nav.home/saved/profile`, `tabs.*`).
- [ ] **Step 2:** Convert each file: client components → `useT("discovery")`; server `page.tsx`/layout → `getMessages`. Thread `lang` where a component lacks it (pass from CityShell/layout). **Also locale-prefix every internal storefront link** in `FeedPageClient` (restaurant cards), `map/MapPageClient`, `filter-pill-bar`, and the `top-nav` logo using `localized(path, lang)`.
- [ ] **Step 3 (parity):** the `messages.test.ts` cross-locale parity test now covers `discovery` — run it; fix any key mismatch.
- [ ] **Step 4 (regression oracle):** `npm test -- "[city]" search filter restaurant-card CityShell top-nav` (and any discovery component tests) → must pass with RO unchanged. `npm run build`; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `feat(i18n): extract discovery UI strings + prefix discovery links (en/de)`.

---

## Task 3: Restaurant detail (~part of 52)
**Files:** `(shell)/[slug]/DetailPageClient.tsx`, `(shell)/[slug]/page.tsx`, `photo-gallery.tsx`, `review-card.tsx`, `review-intelligence.tsx`.
**Namespace:** `restaurant`. Wire into shell bundle (`["common","discovery","restaurant"]`).
- [ ] Extract per methodology; prefix DetailPageClient internal links (menu href, back links) via `localized`. Verify detail/review tests + build + tsc + parity. Commit `feat(i18n): extract restaurant-detail UI strings (en/de)`.

## Task 4: Menu (~rest of 52)
**Files:** `[slug]/menu/page.tsx`, `[slug]/menu/MenuPageClient.tsx`, `menu-viewer.tsx`, `menu-item-card.tsx`, `menu-item-detail-sheet.tsx`.
**Namespace:** `menu`. Wrap `MenuPageClient` in its own `MessagesProvider` (`buildBundle(lang,["common","menu"])`) in the menu page (read `lang` from params).
- [ ] Extract; prefix MenuPageClient back-link. Verify menu tests + build + tsc + parity. Commit `feat(i18n): extract menu UI strings (en/de)`.

## Task 5: Booking (~102 strings — largest)
**Files:** `src/components/reservation-sheet-v2/*` (Step* + index), `reservation-confirmed.tsx`, `modify-reservation-form.tsx`, `reservation-cancel-form.tsx`, and the reservation token pages under `[lang]/reservations`.
**Namespace:** `booking`. Token pages wrap their client forms in `MessagesProvider` (`["common","booking"]`); server parts use `getMessages`. Use plural bags for party-size/“N persoane” and date/time formatting via `formatDate`.
- [ ] Extract; verify booking/reservation tests + build + tsc + parity. Commit `feat(i18n): extract booking UI strings (en/de)`.

## Task 6: Reviews + Events (~68 strings)
**Files:** `review-submit-form.tsx`, `[lang]/reviews/*`; `event-request-sheet.tsx`, `event-request-cta*.tsx`, `[lang]/[city]/events/*`, `[lang]/event-requests/*` (incl. `TrackingClient.tsx`).
**Namespaces:** `reviews`, `events`. Providers on the token/review pages and the events page (server → getMessages; client sheet → provider). Prefix events-page restaurant links.
- [ ] Extract; verify reviews/events tests + build + tsc + parity. Commit `feat(i18n): extract reviews + events UI strings (en/de)`.

## Task 7: Profile + Saved + Auth (~45 strings)
**Files:** `(shell)/profile/*`, `(shell)/saved/*`, `auth-sheet.tsx`, `city-selector.tsx`, `empty-state.tsx`, `CookieBanner.tsx`.
**Namespace:** `profile`. Wire into shell bundle. Prefix profile/saved internal links (`city-selector`, saved cards).
- [ ] Extract; verify profile/saved/auth tests + build + tsc + parity. Commit `feat(i18n): extract profile + auth UI strings (en/de)`.

## Task 8: Legal fold into `[lang]`
**Files:** move `src/app/(app)/(legal)` → `src/app/(public)/[lang]/(legal)`; consolidate the per-locale variants (anpc, confidentialitate/privacy, cookie-uri/cookies, termeni/terms, mentiuni-legale/imprint, prelucrare-date/data-processing) into param-driven pages that select the localized body by `lang` (reuse the existing translated content — do NOT rewrite legal text). Remove the literal `/en/*`,`/de/*` legal folders.
- [ ] Verify each legal page renders per locale under `[lang]`; build; tsc; hreflang on legal pages via `buildAlternates`. Commit `feat(i18n): fold legal pages under (public)/[lang]`.

## Task 9: Regression guard (no-literal-string)
**Files:** ESLint flat-config rule + allowlist.
- [ ] Add an ESLint rule (e.g. a local rule or `eslint-plugin-react`/custom) that flags string literals in JSX text / `aria-*` / `placeholder` / `alt` / `title` within `src/app/(public)/[lang]` and the converted `src/components/*`, with a small allowlist for legitimate non-text literals. Tune to avoid false positives. Run `npm run lint` → resolve any genuine leftovers (strings missed in Tasks 2–7). Commit `chore(i18n): no-literal-string regression guard for the storefront`.

## Task 10: Phase 1b acceptance
- [ ] `npm test` → no NEW failures vs baseline (the storefront component tests still pass = RO unchanged; parity test green for all namespaces).
- [ ] `npm run build`; `npx tsc --noEmit`; `npm run lint` (guard passes).
- [ ] Dev smoke: browse the storefront in EN and DE — UI chrome renders translated; RO unchanged; switching persists; links stay in-locale.

## Definition of Done
- [ ] All consumer UI strings render in EN/DE (RO verbatim-preserved); namespaces parity-enforced at build.
- [ ] Secondary links locale-prefixed; legal folded under `[lang]`; regression guard active.
- [ ] `npm test`/`build`/`tsc`/`lint` green; no new test failures.

> **Not in 1b (→ Phase 1c):** restaurant/menu **content** translations (partner-authored data via `loadRestaurantTranslation` + menu loader); the `locale` column migration on `reservations`/`event_requests`; localized diner/partner emails.
