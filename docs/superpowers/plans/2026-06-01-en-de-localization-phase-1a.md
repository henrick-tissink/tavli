# EN/DE Localization — Phase 1a (Storefront Routing Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the entire consumer storefront (city home, search, map, restaurant detail, menu, events, saved, profile), the root landing, and the token flows (reservations/reviews/event-requests) under `(public)/[lang]`, threading the `lang` param everywhere, so the storefront renders correctly under `/en`, `/de`, and unprefixed RO — with the proxy, `<html lang>`, locale switcher, hreflang, and sitemap all working. **UI text stays Romanian** in this phase; string extraction is Phase 1b.

**Architecture:** Builds on Phase 0. Move the storefront route trees out of `(app)` into `(public)/[lang]`; broaden the `src/proxy.ts` locale block from pricing-only to the whole public surface (as-needed prefix, RO unprefixed) — this is where the bare-`/` validation gate finally applies. Wrap the storefront in `MessagesProvider` and mount `<LocaleSwitcher mode="path">`. Expand hreflang + sitemap to the now-localized storefront.

**Tech Stack:** Next.js 16.2.4 (App Router, `proxy.ts`), React, TypeScript, Jest. Phase 0 i18n primitives in `src/lib/i18n/*`.

**Spec:** `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`
**Branch:** `feat/en-de-localization-phase-1a` (already checked out).

**Conventions:** `@/*`→`src/*`; tests in `__tests__/`, run `npm test`; commit per task. AGENTS.md: re-read the Next 16 route-groups / proxy / generate-static-params docs before structural work.

---

## Phase 0 recap (already on main)
- `src/lib/i18n/`: `locale.ts` (Locale/LOCALES/DEFAULT_LOCALE/isLocale/BCP47/matchLocale), `format.ts`, `t.ts`, `messages.ts` (`getMessages`, `NAMESPACES`, `common` ns), `messages-provider.tsx` (`MessagesProvider`/`useT`), `cookie.ts` (`setLocaleCookie`, `LOCALE_COOKIE`), `routing.ts` (`localeFromPathname`, `decideLocaleAction({pathname, cookieLocale, accept})`, `withLocale`), `hreflang.ts` (`buildAlternates`), `session-locale.ts`.
- `src/proxy.ts`: the active middleware. Locale block currently scoped to `isLocalePath = pathname === "/pricing" || /^\/(en|de)(\/|$)/.test(pathname)`.
- Route groups: `src/app/(public)/[lang]/` (root `<html lang>`, `generateStaticParams` over LOCALES, `dynamicParams=false`) holds pricing. `src/app/(app)/` holds storefront/partner/admin/legal/landing/token-flows (interim). `RootScaffold`, `site-metadata.ts`.
- `src/components/i18n/LocaleSwitcher.tsx` exists (modes `path`/`preference`) but is NOT mounted.
- `src/messages/{ro,en,de}/common.json` includes `cities` (display names) + switcher labels.

## File moves in this phase (the structural core)
```
FROM  src/app/(app)/[city]/…                 TO  src/app/(public)/[lang]/[city]/…
FROM  src/app/(app)/page.tsx                  TO  src/app/(public)/[lang]/page.tsx
FROM  src/app/(app)/reservations/[token]/…    TO  src/app/(public)/[lang]/reservations/[token]/…
FROM  src/app/(app)/reviews/[token]/…         TO  src/app/(public)/[lang]/reviews/[token]/…
FROM  src/app/(app)/event-requests/[token]/…  TO  src/app/(public)/[lang]/event-requests/[token]/…
```
`(app)/(legal)`, `(app)/partner`, `(app)/admin`, `(app)/onboard`, `(app)/invitations` STAY in `(app)`. (Legal folds into `[lang]` in Phase 1b.)

---

## Task 1: Move storefront + landing + token flows under `(public)/[lang]`; thread `lang`

**Files:** moves above; modify the moved layout/pages to accept `lang`.

- [ ] **Step 1: Read the Next docs** (`route-groups.md`, `dynamic-routes.md`, `generate-static-params.md`) and confirm: a `[lang]/[city]/…` nested-dynamic-segment tree is valid; `params` is a Promise; the `(public)/[lang]/layout.tsx` root already does `generateStaticParams`+`dynamicParams=false`.

- [ ] **Step 2: Move the trees with `git mv`** (preserves history):

```bash
cd /Users/henricktissink/Sauce/tavli/src/app
git mv "(app)/[city]" "(public)/[lang]/[city]"
git mv "(app)/page.tsx" "(public)/[lang]/page.tsx"
git mv "(app)/reservations" "(public)/[lang]/reservations"
git mv "(app)/reviews" "(public)/[lang]/reviews"
git mv "(app)/event-requests" "(public)/[lang]/event-requests"
```

- [ ] **Step 3: Fix import paths.** Grep for any `@/app/(app)/[city]`, `@/app/(app)/reservations`, `@/app/(app)/reviews`, `@/app/(app)/event-requests`, `@/app/(app)/page` references across `src/` and rewrite them to `@/app/(public)/[lang]/…`. Run:
```bash
grep -rn "@/app/(app)/\[city\]\|@/app/(app)/reservations\|@/app/(app)/reviews\|@/app/(app)/event-requests" src/ | grep -v node_modules
```
Fix each hit. (Relative imports within the moved trees move together and are unaffected.)

- [ ] **Step 4: Thread `lang` into the shell layout.** `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` currently does `params: Promise<{ city: string }>`. Change to `params: Promise<{ lang: string; city: string }>`, read both, and pass `lang` to `CityShell`:

```tsx
export default async function CityShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang, city } = await params;
  const displayCity = formatCityName(city);
  const restaurants = await getRestaurants();
  return (
    <CityShell lang={lang} city={city} displayCity={displayCity} restaurants={restaurants}>
      {children}
    </CityShell>
  );
}
```
Add `lang: string` to `CityShellProps` in `CityShell.tsx` and thread it into `Inner` (it will be consumed by the switcher in Task 3; for now just accept+forward it — do not break existing logic).

- [ ] **Step 5: Fix the landing redirect.** `src/app/(public)/[lang]/page.tsx` currently `redirect("/bucuresti")`. Make it locale-aware:
```tsx
import { redirect } from "next/navigation";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const l = isLocale(lang) ? lang : DEFAULT_LOCALE;
  redirect(l === DEFAULT_LOCALE ? "/bucuresti" : `/${l}/bucuresti`);
}
```

- [ ] **Step 6: Thread `lang` into the token pages.** Each of `reservations/[token]/page.tsx`, `reservations/[token]/modify/page.tsx`, `reviews/[token]/page.tsx`, `event-requests/[token]/page.tsx` now has `params: Promise<{ lang: string; token: string }>`. Update each signature to destructure `lang` alongside `token` (read it via `await params`). The pages don't need to USE `lang` yet (text is RO in Phase 1a), but the param must be accepted so routing resolves. Confirm each page still reads `token` correctly.

- [ ] **Step 7: Verify build + routes.**
```bash
npx tsc --noEmit   # source clean
npm run build      # MUST succeed
```
Confirm the build route table shows the storefront under `/[lang]/[city]/…` and token flows under `/[lang]/…`. No "parallel routes resolve to same path" error. (At this point the proxy still only rewrites /pricing,/en,/de — so the storefront is reachable at `/en/bucuresti` and `/de/bucuresti` directly, but bare `/bucuresti` will NOT yet resolve because the proxy doesn't rewrite it to `/ro/bucuresti`. That's expected and fixed in Task 2. Do NOT smoke bare `/bucuresti` yet.)

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "feat(i18n): move storefront + landing + token flows under (public)/[lang]; thread lang param"
```

---

## Task 2: Broaden the proxy locale block to the whole public surface (bare-`/` gate)

**Files:** `src/lib/i18n/routing.ts` (no change expected), `src/proxy.ts` (broaden `isLocalePath`), `src/__tests__/proxy.test.ts` (new cases).

> Now that the entire public site lives under `[lang]`, the proxy must do as-needed prefixing for ALL public paths (RO unprefixed via internal rewrite to `/ro/…`), not just pricing. Auth/app paths (`/admin`, `/partner`) and non-page paths must be excluded.

- [ ] **Step 1: Write failing proxy tests** in `src/__tests__/proxy.test.ts` (node env, no Supabase needed for locale paths):
  - GET `/bucuresti`, no cookie, `accept-language: ro` → rewrite to `/ro/bucuresti`, set-cookie NEXT_LOCALE=ro.
  - GET `/bucuresti`, no cookie, `accept-language: de-DE` → redirect to `/de/bucuresti`, set-cookie de.
  - GET `/bucuresti`, cookie NEXT_LOCALE=en → redirect to `/en/bucuresti`.
  - GET `/` (bare root), no cookie, `accept-language: ro` → rewrite to `/ro`, set-cookie ro.
  - GET `/en/bucuresti` → next (no rewrite).
  - GET `/reservations/abc123` (unprefixed legacy email link), no cookie, accept ro → rewrite `/ro/reservations/abc123` (old links still work).
  - **Guard:** GET `/partner/sign-in` → NOT locale-rewritten (no `/ro/partner` rewrite); auth logic still applies.
  - **Guard:** GET `/admin` → NOT locale-rewritten.

- [ ] **Step 2: Run → fail.** `npm test -- proxy` (new cases fail because `/bucuresti` isn't matched by `isLocalePath` yet).

- [ ] **Step 3: Broaden `isLocalePath` in `src/proxy.ts`.** Replace the pricing-only check with an exclusion-based one — locale handling applies to every public path EXCEPT the authenticated apps and non-page paths:
```ts
// Phase 1a: the whole public site lives under [lang]. Apply as-needed locale
// prefixing to every public path except the authenticated apps, API, auth
// callback, tracking handlers, and asset/internal paths.
const NON_LOCALE_PREFIXES = ["/admin", "/partner", "/api", "/auth", "/c/", "/u/", "/_next"];
const isLocalePath =
  !NON_LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)) &&
  !/\.[a-z0-9]+$/i.test(pathname); // skip files with an extension
```
Keep the rest of the locale block (the `decideLocaleAction` call + redirect/rewrite/cookie) exactly as-is. The block still runs after the server-action bypass and before the Supabase-env early-out. Do NOT change the auth gating below it. Note: `/admin` and `/partner` are excluded here from locale handling but still flow into the existing auth gating further down (unchanged).

- [ ] **Step 4: Run → pass.** `npm test -- proxy` (all auth + locale cases green). Also `npm test -- routing` stays green.

- [ ] **Step 5: tsc + build + bare-`/` smoke.**
```bash
npx tsc --noEmit
npm run build
```
Then `npm run dev` and verify (the bare-`/` validation gate from spec §3.2):
- [ ] `/` → rewrites to `/ro` → redirects to `/bucuresti` (RO storefront) — resolves 200.
- [ ] `/bucuresti` → RO storefront 200 (internal rewrite to `/ro/bucuresti`).
- [ ] `/en/bucuresti`, `/de/bucuresti` → storefront 200.
- [ ] `/partner/sign-in`, `/admin/sign-in` → still work (auth gating intact, no locale rewrite).
- [ ] **If bare `/` or `/bucuresti` fails to resolve via rewrite**, apply the spec §3.2 fallback: switch to `localePrefix: always` — make `decideLocaleAction` redirect unprefixed→`/ro/…` (instead of rewrite) and accept the `/ro/...` visible URL; update tests; document in the commit.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat(i18n): broaden proxy locale handling to the whole public storefront (as-needed prefix)"
```

---

## Task 3: MessagesProvider + mount LocaleSwitcher in the storefront

**Files:** `src/app/(public)/[lang]/[city]/(shell)/CityShell.tsx`, `src/components/top-nav.tsx` (mount switcher), test.

- [ ] **Step 1: Wrap the shell in `MessagesProvider`.** In `CityShell.tsx`, import `MessagesProvider` and `getMessages` is server-only — so load messages in the SERVER layout and pass them down. Update `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` to build the client bundle:
```tsx
import { getMessages } from "@/lib/i18n/messages";
// inside the layout, after reading lang:
const bundle = { common: getMessages(lang, "common") };
// pass to CityShell:
<CityShell lang={lang} bundle={bundle} city={city} ...>
```
In `CityShell.tsx` add `lang: Locale` and `bundle: Record<string, Record<string, unknown>>` to props, and wrap the existing provider stack:
```tsx
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { type Locale } from "@/lib/i18n/locale";
// wrap the outermost returned tree:
<MessagesProvider locale={lang} bundle={bundle}>
  {/* existing FilterProvider/TimeContextProvider/... */}
</MessagesProvider>
```
(Only `common` is needed now; Phase 1b adds storefront namespaces.)

- [ ] **Step 2: Mount `<LocaleSwitcher mode="path">` in the top nav.** In `src/components/top-nav.tsx`, accept the current `lang` and `pathname` (TopNav is rendered within CityShell which has `usePathname`). Render `<LocaleSwitcher mode="path" current={lang} pathname={pathname} />` in an appropriate nav slot. Pass `lang` from CityShell→TopNav. Use `usePathname()` for the current path (already imported in CityShell; pass down or call in TopNav if it's a client component).

- [ ] **Step 3: Test** (`src/app/(public)/[lang]/[city]/(shell)/__tests__/CityShell.test.tsx` or extend existing): render CityShell with `lang="en"`, a `common` bundle, and minimal props; assert the language switcher links render (Română/English/Deutsch) and the English one is marked current. Mock providers/router as the existing CityShell test does (check the existing test for the mock setup).

- [ ] **Step 4: Verify.** `npm test -- CityShell LocaleSwitcher`, `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(i18n): wrap storefront in MessagesProvider and mount LocaleSwitcher"
```

---

## Task 4: hreflang/canonical on storefront + per-locale sitemap expansion

**Files:** storefront page `generateMetadata` (city home, restaurant detail, menu, events), `src/app/sitemap.ts`.

- [ ] **Step 1: Add alternates to storefront metadata.** For the storefront pages that export (or should export) `generateMetadata` — at minimum the restaurant detail (`[city]/(shell)/[slug]/page.tsx`), menu (`[city]/[slug]/menu/page.tsx`), city home (`[city]/(shell)/page.tsx`), and events (`[city]/events/page.tsx`) — add `alternates: buildAlternates(unprefixedPath, lang, getSiteUrl())`, where `unprefixedPath` is the path WITHOUT the locale prefix (e.g. `/bucuresti/casa-veche`). Read `lang` from params. Example for the detail page:
```tsx
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
export async function generateMetadata({ params }: { params: Promise<{ lang: string; city: string; slug: string }> }) {
  const { lang, city, slug } = await params;
  return { alternates: buildAlternates(`/${city}/${slug}`, isLocale(lang) ? lang : "ro", getSiteUrl()) };
}
```
(If a page already has `generateMetadata`, merge `alternates` in rather than overwrite.)

- [ ] **Step 2: Expand the sitemap.** In `src/app/sitemap.ts`, now that storefront URLs exist per-locale, emit each via `buildAlternates`. Replace the RO-only home/restaurant/city entries with localized entries:
```ts
import { LOCALES } from "@/lib/i18n/locale";
import { buildAlternates } from "@/lib/i18n/hreflang";

function localized(unprefixedPath: string, base: string, lastModified: Date, changeFrequency: "weekly" | "daily" | "monthly", priority: number): MetadataRoute.Sitemap {
  return LOCALES.map((l) => {
    const alt = buildAlternates(unprefixedPath, l, base);
    return { url: alt.canonical, lastModified, changeFrequency, priority, alternates: { languages: alt.languages } };
  });
}
// home "/", each restaurant "/{citySlug}/{slug}", each city "/{slug}/events", and pricing "/pricing" → flatMap through localized(...)
```
Keep `getSitemapRestaurants()` + the city dedupe; only the emission changes. Pricing entries from Phase 0 fold into the same `localized()` helper.

- [ ] **Step 3: Verify.** `npm run build` (sitemap compiles); spot-check that `generateMetadata` returns alternates (a small unit test on one page's metadata is optional but nice). `npx tsc --noEmit`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(i18n): storefront hreflang/canonical + per-locale sitemap"
```

---

## Task 5: Phase 1a acceptance

**Files:** none — verification only.

- [ ] **Step 1:** `npm test -- i18n routing proxy LocaleSwitcher CityShell` → all green.
- [ ] **Step 2:** `npm run build` → succeeds; route table shows storefront + token flows under `/[lang]/…`; pricing still SSG ro/en/de; one Proxy.
- [ ] **Step 3:** `npx tsc --noEmit` → clean; `npx eslint <changed files>` → clean.
- [ ] **Step 4: Dev smoke** (`npm run dev`):
  - [ ] `/` → RO storefront (`/bucuresti`); `/en` → `/en/bucuresti`; `/de` → `/de/bucuresti`.
  - [ ] `/bucuresti`, `/en/bucuresti`, `/de/bucuresti`, a restaurant detail, a menu, events, saved, profile — all render in each locale (text still RO — expected).
  - [ ] Language switcher in the top nav swaps locale (URL + `<html lang>`), preserving the current path.
  - [ ] A reservation token page renders under `/en/reservations/<token>`; an old unprefixed `/reservations/<token>` link still resolves (RO via rewrite).
  - [ ] View source on `/en/bucuresti`: `<html lang="en">`, canonical + hreflang alternates present.
  - [ ] `/partner/sign-in`, `/admin` unaffected.
- [ ] **Step 5: Confirm no new test failures** vs the known pre-existing set (local-DB ECONNREFUSED, restaurant-card token, events diacritic). The moved storefront tests should still pass (their imports moved with them; fix any `@/app/(app)/[city]` test imports → `@/app/(public)/[lang]/[city]`).

---

## Phase 1a Definition of Done
- [ ] Storefront, landing, and token flows live under `(public)/[lang]` and render in ro/en/de (RO text).
- [ ] Proxy does as-needed locale prefixing for the whole public surface; `/`, `/bucuresti`, `/en/...`, `/de/...` all resolve; auth apps unaffected; old unprefixed token links still work.
- [ ] `<html lang>` correct per locale; LocaleSwitcher mounted and working; hreflang/canonical + per-locale sitemap cover the storefront.
- [ ] `npm test` (no NEW failures), `npm run build`, `npx tsc --noEmit`, lint of changed files — all green.

> **Not in Phase 1a:** UI string extraction (Phase 1b — the ~746 strings); restaurant/menu content translations, the `locale` migration, localized emails (Phase 1c); folding `(legal)` into `[lang]` (Phase 1b).
