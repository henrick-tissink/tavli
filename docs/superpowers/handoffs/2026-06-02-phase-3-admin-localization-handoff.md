# Handoff — EN/DE Localization Phase 3 (Admin)

**Date:** 2026-06-02 · **For:** a fresh session executing Phase 3 · **Status of prior work:** Phases 0–2 complete & merged to `main`.

---

## 0. TL;DR

The **entire diner-facing product AND the entire partner dashboard** are now trilingual (ro/en/de) on `main`. Phase 3 is the last internal surface: the **admin dashboard** (`src/app/(app)/admin/**`, ~11 routes). It is under `(app)` → **identical plumbing to partner** (locale from `profiles.locale`, `resolveAppLocale()`, preference switcher, MessagesProvider). The work is mechanical and proven — follow "THE METHODOLOGY" area-by-area.

**Important Phase-3 nuance:** a quick scan shows admin is **almost entirely English-source** (only ~2 files contain RO diacritics). So for most admin strings the oracle is **EN-verbatim**, with `ro`/`de` as *translations* (the same dual-source pattern used for the partner `security` section in Phase 2 — see §5). Localizing admin is a genuine improvement: RO/DE operators currently see English.

**How to start:** read this handoff + the design spec (`docs/superpowers/specs/2026-06-01-en-de-localization-design.md`), then execute area-by-area via `subagent-driven-development` (same loop as Phase 2): branch → implementer subagent → combined spec+quality review → fix → build → merge+push.

---

## 1. What's done (all merged to `main`)

| Phase | What |
|---|---|
| 0–1c | i18n foundation + entire consumer product (UI, content, emails) trilingual; prod migration 0061 applied |
| 2 | **entire partner dashboard** trilingual: shell provider + preference switcher, and namespaces `partner.{common,reservations,menu,tables,diners,marketing,analytics,billing,staffSecurity,settings,corporate,org,onboarding,dashboard,reviews}` |

**Phase 2 acceptance (all green on `main`):** `npx jest` = zero new failures (the ~46 failing suites are all pre-existing local-DB `ECONNREFUSED`); `npm run build` clean; `npx tsc --noEmit` clean; `npm run lint` = 235 problems / 149 errors = **identical to the pre-Phase-2 baseline** (zero new); the extended no-Romanian guard passes. The one acceptance step NOT run: a live browser dev-smoke of the partner dashboard in EN/DE (needs a DB-connected env + partner login — local Supabase was down). Recommend doing that smoke once before relying on it in prod.

---

## 2. The i18n toolbox (built; use it)

All under `src/lib/i18n/`:
- **`app-locale.ts`** → `resolveAppLocale()` (server): session `profiles.locale` → `NEXT_LOCALE` cookie → `Accept-Language` → `ro`. Use in every `(app)` server page/action.
- **`messages.ts`** → `getMessages(locale, ns)` (server, typed), `buildBundle(locale, ns[])` (client bundle). **Register each new `admin.*` namespace here** with a TS interface (`Record<Locale, NsMessages>` = build-time completeness contract — missing keys become a build error).
- **`messages-provider.tsx`** → `<MessagesProvider locale bundle>`, `useT(ns)`, `useLocale()`.
- **`t.ts`** → `interpolate`, `translate` (handles string OR plural-bag `{one,few,other}`).
- **`format.ts`** → `formatDate`, `formatNumber`, `formatCurrency`, `pluralCategory`. `locale.ts` → `BCP47` (ro→ro-RO/en→en-GB/de→de-DE), `LOCALES`, `isLocale`.
- **`use-date-labels.ts`** → `usePartnerDateLabels()` (client) → `{ shortDate, weekdaysShort, monthsShort }` for the "Weekday Day Month" label. (Despite the name it reads `partner.common.dateFormat`; fine to reuse, or add an admin equivalent.)
- **`<LocaleSwitcher mode="preference" current={locale} />`** (built) → calls `setAppLocale` (`src/app/(app)/locale-action.ts`) which writes `profiles.locale` + cookie.
- Catalogues: `src/messages/{ro,en,de}/<ns>.json`.

---

## 3. THE METHODOLOGY (the proven recipe — follow exactly)

For each route/component in an area:
1. **Find** hardcoded UI strings: JSX text, `aria-label`, `placeholder`, `alt`, `title`, button labels, `toast(...)`, returned server-action error strings, string consts used as UI. **Skip:** code identifiers, CSS classes, data/enum values, console/log strings, slugs, DB `error.message` passthroughs, machine error codes, helper-returned errors (from imported libs), operator-entered data.
2. **Add keys** to the area's `admin.<area>.json` (all 3 locales), nested by feature. **Oracle:** the *source-language* value must be **byte-identical** to the original (for admin that's usually `en`; for any RO-source file it's `ro`). The other locales are translations: `en` = en-GB, `de` = **formal Sie**. Use `{var}` interpolation; for counts use plural bags whose source-language forms reproduce the original output for **every** count (don't invent grammar the original lacked).
3. **Replace** inline strings: server components/actions → `getMessages(await resolveAppLocale(), ns)` (+ `translate`/`interpolate`); client components → `useT(ns)`.
4. **Register** the namespace in `messages.ts` (import + interface + CATALOGS entry).
5. **Wire the bundle** (see §4 — admin shell vs standalone).
6. **Verify (regression oracle):** existing component/action tests assert source-language text → they MUST still pass with **assertions unchanged**. Converted client-component tests need a `<MessagesProvider locale=<sourceLang> bundle={{...}}>` wrapper; node action tests that now call `resolveAppLocale()` need `jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("<sourceLang>") }))`. Then `npx tsc --noEmit`, `npx jest <area> messages`, `npx eslint <changed files>`, and a full `npm run build` before merge.
7. **Review** each area: combined spec-compliance (source-lang verbatim + parity + no over/under-extraction) + quality (translation quality, DE formal Sie, no shape changes), via a fresh subagent reading the base..head diff. Fix loop, then merge `--no-ff` to `main` + push (the established cadence; the user authorized direct pushes to main for this localization work).

---

## 4. Phase-3 specifics — admin plumbing

- Admin lives under **`src/app/(app)/admin/(gated)/**`** with **`src/app/(app)/admin/(gated)/layout.tsx`** as the gate/shell — **the natural MessagesProvider host**. Mirror the partner dashboard layout (`src/app/(app)/partner/(dashboard)/layout.tsx`): `const locale = await resolveAppLocale(); const bundle = buildBundle(locale, ["admin.common", ...]); <MessagesProvider locale bundle>...`. Mount `<LocaleSwitcher mode="preference" current={locale} />` in the admin shell/nav. **Task 0 for Phase 3 = wire that provider + switcher + an `admin.common` namespace (shell chrome / shared buttons / generic action errors).**
- If any admin page lives OUTSIDE the `(gated)` shell (standalone), give it its own per-page/per-layout provider — see the partner `marketing`/`org` pattern (`src/app/(app)/partner/marketing/page.tsx`, `src/app/(app)/partner/org/[orgId]/layout.tsx`).
- Namespace prefix: `admin.*`. Suggested split by route: restaurants approval, invitations, review-report moderation, GDPR/compliance requests, users, setups, security. Order by traffic/value; keep each area one branch.
- **Extend the no-Romanian guard** (`src/__tests__/i18n-no-romanian-guard.test.ts`) to add `src/app/(app)/admin` to its `ROOTS` array once admin extraction is done (it currently scans consumer + partner + onboard + converted components). Use `// i18n-allow` for legitimate non-UI literals.

---

## 5. Hard-won Phase-2 learnings (read — they will save you)

1. **Dual source-language.** Some internal sections were authored in **English**, not Romanian (Phase 2: the partner `security` section; Phase 3: most of admin). For an English-source file the oracle is **EN-verbatim** (en = byte-identical to base; ro/de = translations). Detect with a diacritic scan: a file/section with **0 RO diacritics but English UI strings is English-source**. Don't blindly set `ro` = the English string and call it "verbatim RO" — that would freeze English for RO users; instead set `en` = verbatim, translate ro/de.
2. **Shell vs standalone provider.** Pages under the gated shell get the shell's provider (add the namespace to its `buildBundle`). Standalone pages need their own provider. Trace EVERY client component to an enclosing provider whose bundle contains the namespace its `useT("<ns>")` uses — a missing namespace = silent runtime "raw key strings" bug that **build/tsc do NOT catch** (Phase 2 hit this with org/analytics rendering the shared `AnalyticsView`, which needs `partner.analytics` in the org bundle). The reviewers caught it by tracing; make your reviewer do the same.
3. **Shared cross-surface components → `*.common`.** A component used by two surfaces (e.g. partner `PhotoUploader`/`HoursEditor` used by both onboard and the settings dashboard) should put its strings in the `common` namespace (always in every bundle) to avoid bundle coupling.
4. **Scan before declaring done.** The original Phase-2 area decomposition silently MISSED the partner dashboard home page and the entire reviews route. Before the finalize step, run a diacritic scan over the whole target tree (excluding tests/comments/`i18n-allow`) to catch missed surfaces — don't trust the route list alone.
5. **Date/number/currency faithfulness.** Switch `toLocaleString("ro-RO")` / `Intl.*("ro-RO", …)` to `BCP47[locale]` so RO stays byte-identical while en/de vary. Don't apply `Intl` short weekday/month to RO (it changes capitalization/punctuation) — use the comma-joined catalogue arrays / `usePartnerDateLabels()` pattern. Verify RO output byte-identical by executing `Intl` in node when unsure.
6. **Code-mapped action errors.** Many server actions return **machine codes** (`forbidden`, `billing_locked`, `auth_required`, …) mapped to localized strings client-side; the `message` arg to `fail(code, message)` is a dev/log fallback (see `src/lib/server-action.ts`) and is NOT user-facing — leave it or `// i18n-allow` it; only localize the genuinely-rendered strings.
7. **Avoid shadowing the translator `t`** — rename loop/param vars (`tab`, `tag`, `row`, …). Recurring review nit.
8. **Smart quotes / apostrophes.** Preserve the source byte-for-byte: `&apos;`→straight `'`, `&quot;`→straight `"`, `&ldquo;/&rdquo;`→`„ "`. German quotes are `„ … "` (closing = U+201C). Don't "smarten" straight apostrophes in the EN oracle.

---

## 6. Open items / tracked follow-ups (carry forward)

1. **Native-German review** of all `src/messages/{en,de}/*.json` (now large, incl. all partner namespaces) before public launch. Phase-2 flagged DE nits were fixed inline; a holistic native pass is still wanted.
2. **Partner dashboard dev-smoke in EN/DE** — run once in a DB-connected env (switch via the preference switcher → `profiles.locale` updates → UI renders translated). QA partner/admin demo logins are in the agent memory (`qa-demo-credentials.md`, dev env).
3. **Deploy** — `main` is safe to deploy (prod migration 0061 live; Phase 2 added no migrations).
4. **Dead code spotted (not touched):** `src/app/(app)/partner/(dashboard)/reservations/export-actions.ts` (`bulkExportReservations`) is referenced only by its own test; `src/components/partner/ComingSoon.tsx` has no importers (its RO strings are `i18n-allow`-marked). Clean up opportunistically.
5. Pre-existing carry-overs from earlier phases: consumer SEO metadata still RO for some titles; `restaurantTranslations` prose fields not yet surfaced; nudge email uses diner locale as a proxy. (All pre-Phase-2, unchanged.)

---

## 7. Key references
- **Design spec (locked):** `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`
- **Phase-2 handoff (this one's predecessor):** `docs/superpowers/handoffs/2026-06-02-phase-2-partner-localization-handoff.md`
- **Mirror these:** partner dashboard layout + `PartnerShell` (shell provider), `partner.marketing`/`partner.org` (standalone provider), any merged partner area + its tests (extraction + test-wrapper pattern).
- **Migrations:** `AGENTS.md`. **Guard:** `src/__tests__/i18n-no-romanian-guard.test.ts`.

**First action:** read this + the spec, then Phase-3 Task 0 (admin shell provider + switcher + `admin.common`).
