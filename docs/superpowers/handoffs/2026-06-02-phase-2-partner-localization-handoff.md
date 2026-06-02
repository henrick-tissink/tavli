# Handoff — EN/DE Localization Phase 2 (Partner Dashboard)

**Date:** 2026-06-02 · **For:** a fresh session executing Phase 2 · **Status of prior work:** Phases 0–1c complete & merged to `main`; prod migration `0061` applied.

---

## 0. TL;DR

The **entire diner-facing product is trilingual (ro/en/de)** and on `main`. Phase 2 localizes the **partner dashboard UI** (~33 routes, ~500 strings, 28 components). Phase 3 (admin) follows.

**The work is mechanical and proven** — follow "THE METHODOLOGY" (§4) area-by-area. The one new thing vs. the consumer phases: partner pages live under `app/(app)/` and take their locale from **`profiles.locale`** (not a URL `[lang]` segment), so the locale *plumbing* differs (§5). The i18n *toolbox* (§3) is identical and already built.

**How to start the new session:** the design is locked (`docs/superpowers/specs/2026-06-01-en-de-localization-design.md`) — **skip brainstorming**. For each area: `writing-plans` (optional for small areas — the methodology is the plan) → execute via `subagent-driven-development` → spec-review + quality-review each → fix → merge. Do the **provider-wiring task first** (§6, Task 0) — it unblocks everything.

---

## 1. What's done (all merged to `main`, verified green each step)

| Phase | What | Key commits / artifacts |
|---|---|---|
| 0 | i18n foundation: catalogues + native-`Intl`, `proxy.ts` routing, `(public)/[lang]` + `(app)` route-group split, switcher, hreflang | `src/lib/i18n/*`, `proxy.ts`, `RootScaffold`, `site-metadata` |
| 1a | storefront under `(public)/[lang]`, locale-aware nav, cookie-persisted switching | — |
| 1b | **all consumer UI strings** → ro/en/de (discovery, restaurant, menu, booking, reviews, events, profile) + the no-Romanian guard | `src/messages/{ro,en,de}/{common,discovery,restaurant,menu,booking,reviews,events,profile}.json` |
| 1c-content | restaurant prose + menus + chef picks via the content loaders (RO fallback) | `src/lib/translations/{load,load-menu,apply-*}.ts` |
| 1c-migration | `locale` column on `reservations`/`event_requests` (migration **0061**) + capture at creation | `drizzle/migrations/0061_reservation_event_locale.sql` |
| 1c-emails | transactional emails (reservation lifecycle, partner, event-request) → ro/en/de | `src/messages/{ro,en,de}/emails.json`, `src/emails/*`, `src/lib/email/*` |

**Prod:** migration `0061` was applied to the EU prod DB on 2026-06-02 (both columns + bookkeeping row id 62). The `main` code is safe to deploy.

---

## 2. Repo conventions (read once)

- **Next.js 16.2.4** — middleware is **`src/proxy.ts`** (NOT `middleware.ts`); `params` is a Promise. Read `node_modules/next/dist/docs/` before structural work (AGENTS.md).
- **Path alias** `@/*` → `src/*`.
- **Tests:** Jest. `npm test` (full), `npx jest <pattern>` (focused). Tests in `__tests__/` beside code.
- **Build/typecheck:** `npm run build`, `npx tsc --noEmit` (ignore errors only inside `.next/`).
- **Lint:** `npm run lint`. **Baseline = 219–220 problems / 133 errors, ALL pre-existing** in untouched files (e.g. `src/lib/translations/__tests__/load.test.ts`). Confirm your changed files add zero new problems.
- **Pre-existing test failures (baseline ≈ 46–48 failed):** DB-integration suites fail with `ECONNREFUSED 127.0.0.1:54322` (local Supabase not running) + occasionally a flaky crypto test. Confirm your work introduces **zero new** failures; don't chase the DB ones.
- **Migrations:** `drizzle-kit generate` is BANNED. Hand-author SQL + journal + descriptive `schema.ts` (AGENTS.md). Phase 2 needs **no** migration.
- **Git:** work on `feat/en-de-localization-phase-2-<area>` branches; `--no-ff` merge to `main` + push after each area passes review (the established cadence). Commit messages end with the `Co-Authored-By` trailer.

---

## 3. The i18n toolbox (already built — use it)

All under `src/lib/i18n/`:

- **`locale.ts`** — `type Locale = "ro"|"en"|"de"`, `LOCALES`, `DEFAULT_LOCALE`, `isLocale`, `BCP47` (ro→ro-RO/en→en-GB/de→de-DE), `toIsoCurrency` (lei→RON), `matchLocale(acceptLanguage)`.
- **`format.ts`** — `pluralCategory(locale,n)` (native `Intl.PluralRules` — RO one/few/other), `formatDate`, `formatNumber`, `formatCurrency(cents,label,locale)`.
- **`t.ts`** — `interpolate(tmpl, vars)` (`{var}`), `translate(locale, value, vars)` (handles string OR plural-bag `{one,few,other}`), `MessageValue`/`Vars`.
- **`messages.ts`** — `getMessages(locale, ns)` (server, typed), `buildBundle(locale, ns[])` (assemble a client provider bundle), `NAMESPACES`, `CATALOGS`. **Register each new namespace here** with a TS interface → missing keys become a build error (parity contract). Existing namespaces: `common, discovery, restaurant, menu, booking, reviews, events, profile, emails`.
- **`messages-provider.tsx`** — `<MessagesProvider locale bundle>`, `useT(ns)` → `t(key, vars)`, `useLocale()` → current `Locale`.
- **`cookie.ts`** (`setLocaleCookie`, `LOCALE_COOKIE="NEXT_LOCALE"`, server) + **`cookie-client.ts`** (`setLocaleCookieClient`, client `document.cookie`).
- **`routing.ts`** — `decideLocaleAction`, `withLocale`, `localizedHref`. **Mostly N/A for partner** (no URL locale prefix). Internal partner links don't need locale-prefixing (no `[lang]`).
- **`hreflang.ts`**, **`city-name.ts`** — **N/A for partner** (internal/noindex; no city header).
- **Catalogues:** `src/messages/{ro,en,de}/<ns>.json`.
- **Guard:** `src/__tests__/i18n-no-romanian-guard.test.ts` — currently scoped to `src/app/(public)/[lang]/`. **Phase 2 must extend its `ROOT`/scan to also cover `src/app/(app)/partner/`** (and the converted partner components) once extraction is done, with `i18n-allow`/`i18n-allow-block` markers for legitimate data.
- **Email:** `src/lib/email/resolve-locale.ts` (`resolveDinerLocale`), `emails` namespace. (Partner-facing emails already use `organizations.locale`/`profiles.locale` — see 1c-emails.)

---

## 4. THE METHODOLOGY (the proven recipe — follow exactly)

For each component/page in an area:
1. **Find** hardcoded RO UI strings: JSX text, `aria-label`, `placeholder`, `alt`, `title`, button labels, `toast(...)`/error messages, string consts used as UI text. Skip: code identifiers, class names, data values, console/log strings, slugs.
2. **Add keys** to the area's namespace JSON: `ro` = the **VERBATIM current string** (exact — this is the regression oracle), `en`/`de` = translations per the glossary/register (§7). Nest by component/feature. Use `{var}` interpolation and plural bags `{one,few,other}` wherever a count appears (RO needs `few`). For any RO plural, the `few`/`other` forms must **reproduce the original output for every count** — do NOT add "de" or change wording the original lacked (this bug recurred 3× in Phase 1b; verify against the current code).
3. **Replace** inline strings: server components/actions → `getMessages(locale, ns)` (+ `translate`/`interpolate` for vars/plurals); client components → `useT(ns)` then `t(key, vars)`.
4. **Register** the namespace in `messages.ts` `CATALOGS` with a TS interface.
5. **Verify (regression oracle):** the existing component tests assert RO text → they MUST still pass unchanged (proves faithful extraction). Then `npm run build`, `npx tsc --noEmit`, parity test (`npx jest messages`), and `npm test -- <area>`.
6. **Review** each area: spec-compliance (RO verbatim spot-check + parity + no over/under-extraction) THEN quality (translation quality — DE formal **Sie**; correctness; no shape changes). Fix loop until approved. Then merge.

> **Why it's safe:** RO values are verbatim → RO render is byte-identical → the RO-asserting tests are the oracle. If a not-previously-broken test fails, the extraction changed RO output — fix it.

---

## 5. Phase 2 specifics — KEY DIFFERENCES from the consumer phases

Partner pages live under **`src/app/(app)/partner/**`** — NOT under `[lang]`. So:

- **Locale source = `profiles.locale`**, resolved server-side in the `(app)` root layout (`src/app/(app)/layout.tsx`), which already does: **session `profiles.locale` → `NEXT_LOCALE` cookie → `Accept-Language` → `ro`**, and sets `<html lang>`. This covers post-auth AND pre-auth pages (sign-in/sign-up/verify-email/onboard). **You don't need to build locale resolution — it exists.**
- **No URL locale prefix, no hreflang, no `localizedHref`** for internal partner links (the app is noindex; URLs are stable). Don't prefix partner nav.
- **You DO need to wire a `MessagesProvider`** into the partner shell — it isn't there yet (the consumer shell has one; the partner shell doesn't). See §6 Task 0.
- **Switcher = `<LocaleSwitcher mode="preference" current={locale} />`** (already built) — it calls the `setAppLocale` server action (`src/app/(app)/locale-action.ts`, already built) which updates `profiles.locale` + cookie. Mount it in the partner shell nav. (`mode="path"` is consumer-only.)
- **Register:** partner is a B2B/staff context → German **formal Sie** throughout (definitely, not du).
- **Emails:** partner-facing transactional emails were already localized in 1c-emails (they resolve `organizations.locale`/`profiles.locale`). Phase 2 is the dashboard **UI** only.

To get the resolved locale to the partner pages: the `(app)` layout resolves it (for `<html lang>`); thread that same locale into the partner shell + build the provider bundle there (mirror the consumer shell `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` + `CityShell.tsx`, but the locale comes from the `(app)` resolution, not a `[lang]` param). A clean approach: a small server helper that returns the resolved `(app)` locale (factor it out of the `(app)` layout, e.g. `resolveAppLocale()`), call it in the partner dashboard layout, `buildBundle(locale, [...partnerNs])`, and wrap the shell in `<MessagesProvider>`.

---

## 6. Phase 2 plan — areas, namespaces, and Task 0

**Surface:** ~33 routes (below) + 28 partner components + ~500 RO string-lines.

```
(dashboard)/  page, reservations, menu(+qr), tables(+live), diners(+[id]),
              hours, availability, reviews, profile, photos, preview,
              translations, staff, security, billing, analytics,
              corporate(+events(+[id]), spaces)
marketing/    page, segments
org/          page, [orgId](page, members, venues(+new), analytics)
(pre-auth)    sign-in, sign-up, verify-email   +  onboard/[token]/* (account/profile/hours/menu/photos/review)
```

### Task 0 (DO FIRST) — partner shell provider + switcher
- Factor the `(app)` locale resolution into a reusable `resolveAppLocale()` (server) if not already; have the partner dashboard layout (`src/app/(app)/partner/(dashboard)/layout.tsx` + its shell component, likely `PartnerShell`) build `buildBundle(locale, ["partner.common", ...])` and wrap children in `<MessagesProvider locale bundle>`.
- Mount `<LocaleSwitcher mode="preference" current={locale} />` in the partner nav/sidebar.
- Add the `partner.common` namespace (shell nav, sidebar labels, common buttons like Save/Cancel/Delete, status badges, shared empty states).
- Pre-auth pages (sign-in/sign-up/verify-email, onboarding) aren't under the dashboard shell → wrap each in its own `MessagesProvider` (locale from `resolveAppLocale()`), or add a lightweight provider in their layout.
- Verify build/tsc; mount renders the 3-option preference switcher.

### Then extract by area (suggested namespaces — one per coherent section)
`partner.common` (Task 0), `partner.reservations`, `partner.menu`, `partner.tables`, `partner.diners`, `partner.marketing`, `partner.analytics`, `partner.billing`, `partner.staffSecurity`, `partner.settings` (profile/photos/preview/translations/hours/availability), `partner.corporate`, `partner.org`, `partner.onboarding` (sign-in/up/verify + onboard steps).

Each area = one branch → extract (methodology §4) → review → merge. Order by value/traffic: reservations → menu → tables → diners → the rest. Onboarding/auth can be early (smaller, self-contained).

### Final Phase-2 tasks
- **Extend the no-Romanian guard** (`src/__tests__/i18n-no-romanian-guard.test.ts`) to also scan `src/app/(app)/partner/` (add a second ROOT or generalize), with `i18n-allow` markers for legitimate non-UI data. This locks the done state.
- **Acceptance:** full `npm test` (no new failures), build, tsc, lint, guard; dev-smoke the partner dashboard in EN/DE (switch via the preference switcher → `profiles.locale` updates → UI renders translated).

---

## 7. Glossary & register (extend §8.3 of the spec for partner domain)

**Register:** German **formal Sie**; Romanian **tu** (consistent with consumer); English **en-GB**.
**Partner-domain terms (ro → en / de):**
- rezervare→reservation/Reservierung · masă→table/Tisch · oaspete/diner→guest/Gast
- meniu→menu/Speisekarte · fel/preparat→dish/Gericht · secțiune→section/Bereich
- recenzie→review/Bewertung · neprezentat/no-show→no-show/Nichterscheinen · covers→covers/Gedecke
- analiză/analytics→analytics/Analysen · facturare→billing/Abrechnung · abonament→subscription/Abonnement
- personal/staff→staff/Personal · rol (owner/manager/host)→owner/manager/host→Inhaber/Manager/Empfang
- marketing/campanie→campaign/Kampagne · segment→segment/Segment
- plan sală/floor plan→floor plan/Tischplan · listă de așteptare/walk-in→walk-in/Laufkundschaft
- eveniment/corporate→event/Veranstaltung · ofertă→quote/Angebot · spațiu privat→private space/privater Raum
- organizație→organization/Organisation · locație/venue→venue/Standort · invitație→invitation/Einladung
- Keep brand "Tavli" + product nouns untranslated. Reuse keys from existing namespaces where a string already exists (e.g. dietary tags in `menu`).

---

## 8. Open items / tracked follow-ups (carry forward)

1. **Native-German review** of all `src/messages/{en,de}/*.json` before public launch (catalogues are large). Flagged DE nits: a redundant button label ("Speisekarte ansehen (vollständige Speisekarte)"); event-email word choices (`Veranstaltungsort` vs `Veranstaltungslocation`, `Produkteinführung` vs `Produktpräsentation`, "Das Budget passt nicht").
2. **Nudge email** (`sendEventRequestNudge`, partner-facing) currently uses the *diner's* `event_requests.locale` as a proxy; ideally join `organizations.locale` (1c-emails minor).
3. **3 EN cuisine adjectives** (`restaurant.cuisineAdjectives` French/Balkan/Mediterranean) are slightly literal — and currently not rendered anywhere (provisioned for future synthesis).
4. **Consumer SEO metadata** (restaurant detail/menu `generateMetadata`) still uses RO data for some titles — minor, deferrable.
5. **Restaurant content fields** in `restaurantTranslations` not yet surfaced to diners (`tagline`, `chefBio`, `ambience`, `dressCode`, `parkingNote`) — wire if/when the detail view renders them.
6. **Extend the no-Romanian guard** to partner (Phase 2) and later admin (Phase 3).

---

## 9. Phase 3 (admin) — after Phase 2

Same methodology, smaller surface (`src/app/(app)/admin/**` — restaurants approval, invitations, review-report moderation, GDPR requests, users, setups, security). Admin is also under `(app)` → identical plumbing to Phase 2 (profiles.locale, preference switcher, own/shared provider). Namespace `admin.*`. Lower urgency (internal operators).

---

## 10. Key references

- **Design spec (locked decisions):** `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`
- **Phase plans:** `docs/superpowers/plans/2026-06-01-en-de-localization-phase-{0,1a,1b}.md`, `2026-06-02-en-de-localization-phase-1c.md`
- **Feature inventory:** `docs/FEATURES.md`
- **Migration process:** `AGENTS.md` (Migrations section) + `docs/operations/official-launch-runbook.md`
- **Example to mirror:** the consumer shell `src/app/(public)/[lang]/[city]/(shell)/{layout.tsx,CityShell.tsx}` (provider wiring) and any converted area (e.g. `discovery`) for the extraction pattern.

**First action in the new session:** read this handoff + the spec, then start Phase 2 Task 0 (partner shell provider + switcher + `partner.common`).
