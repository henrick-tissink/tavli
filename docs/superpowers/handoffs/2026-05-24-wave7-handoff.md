# Tavli v1 — Wave 6 COMPLETE → Wave 7 (Marketing suite) handoff

> Cold-start handoff. Wave 6 (§07 analytics) closed 2026-05-24, built end-to-end
> without live keys. Next: **Wave 7 — §11 marketing suite**.

## 1. Current state
- **Branch `main`**, ~36 Wave-6 commits this session, **all local/unpushed** (push-when-asked rule).
- Waves 1–6 shipped in code. **`npx tsc --noEmit` clean; analytics prod files lint-clean.**
- **Full suite: 11 suites / 40 tests fail = the PRE-EXISTING baseline** (stale local DB). ~126 new Wave-6 tests, zero new regressions.

## 2. Cold-start sequence
1. `MEMORY.md` top line — full Wave-6 summary + gotchas + pending user actions.
2. `docs/superpowers/architecture/build-order.md` → Wave 6 `✅ COMPLETE`; Wave 7 is the lowest open wave (7 `§11` lines).
3. Read `docs/superpowers/architecture/11-marketing-suite.md` (the authoritative §11 design).
4. Brainstorm → spec → plan → execute inline with TDD (same flow as Waves 5 & 6).

## 3. Wave 7 scope — §11 marketing (7 build-order lines)
```
- [ ] §11 marketing_campaigns + segments + sends + suppressions + consents + quotas
- [ ] §11 fan-out job mesh: scheduled + triggered + per-recipient (§11 §14)
- [ ] §11 RFC 8058 unsubscribe + STOP suffix (foundations §6.5, §7.1)
- [ ] §11 WhatsApp Meta-verification gate — TV904 (§11)
- [ ] §11 monthly overage feed → JOBS.billing.reportMarketingOverage (§12 §9.1)
- [ ] §11 reservations.campaign_id FK constraint (column owned by §02; constraint owned by §11)
- [ ] §11 cross-domain audit-key mapping (§11 §11.2 table)
```
- Wave 7 **reads Wave 6 cohorts** (segmentation) and **closes the §12 overage loop** (`JOBS.billing.reportMarketingOverage` already exists in the registry).
- Next migration = **0043**.

## 4. Conventions (unchanged across Waves 5–6 — FOLLOW)
- **Build without live keys**; external clients injected via `make*({deps})` DI + mocked; lazy client getters so modules never throw at import.
- **Lib `make*({deps})` throws `TV###`; app `"use server"` wraps via `toResult`.** ActionResult `{ok,data}|{ok,error}`.
- **`"use server"` action files may export ONLY async functions** (+ types) — never a `make*` factory (that's the cookie-consent build bug). Keep factories in `"server-only"` lib files.
- **Migrations:** schema.ts + raw `00NN_*.sql` (+ RLS) + `_journal.json` (idx+1, same version, `Date.now()`, tag, breakpoints:true); apply locally via `psql "$DATABASE_URL" -f` NOT `drizzle-kit migrate`.
- **JOBS:** single-word domain, kebab action, no underscores (keys.test invariant).
- **Emails:** React-Email `src/emails/*.tsx` with per-locale `COPY` + `getSubject`; **test gotcha — mock `@react-email/render`** + use `@jest-environment node` (resend's CJS fails under jsdom).
- **TDD per piece** → `npx tsc --noEmit; echo $?` (verify exit directly) → commit tagged `(§11 Wave 7 sub-unit X.N)`.
- **VERIFY THE DOC AGAINST REAL SCHEMA FIRST** — Wave 6's verification round caught 4 doc-vs-reality mismatches (missing timezone col, wrong permission name, no i18n, public-vs-private bucket). Dispatch Explore agents to confirm column/enum/permission names before writing SQL.

## 5. Gotchas (don't lose time)
- **Stale local DB:** missing `restaurants.organization_id` (Wave 2) AND `reservations.diner_id` (Wave 3) AND ~1770 seed rows. RLS policies joining those + diner-joined SQL are prod-only-validatable; smoke-test the diner-independent parts via psql. 11 suites fail = baseline.
- **`next build` is broken** by a pre-existing `src/lib/cookie-consent/actions.ts` `"use server"` non-async factory export (Turbopack). Blocks build-verification of any UI. Either fix that one file first, or rely on tsc + lint + correct client/server boundaries (what Wave 6 did).
- **archiver@8 is ESM-only** → breaks jest; the repo is pinned to **archiver@7** (CJS). Same risk for any new ESM-only dep — check before adding.
- Permission names are singular where you'd expect plural (`campaign.read`, not `campaigns.read`). Grep `src/lib/authz/permissions.ts` for the exact `Action` union before using one.

## 6. Wave 6 key modules (reference, mostly `src/lib/analytics/`)
`service-label.ts`, `source-fold.ts`, `cancel-reason.ts`, `forecast.ts`, `cohort.ts` (pure cores);
`refresh-aggregates.ts` (+ `refreshRestaurantDay`/`refreshForecast`), `refresh-cohorts.ts`, `backfill-aggregates.ts`, `purge-hourly.ts`;
`run-export.ts` (+ `enqueueBypassExport`), `expire-stale-exports.ts`, `weekly-summary.ts` (+ `weekly-summary-core.ts`), `queries.ts`.
Emails: `ExportReadyEmail.tsx`, `WeeklySummaryEmail.tsx`. Action: `src/app/partner/(dashboard)/analytics/export-actions.ts`.
UI: `src/app/partner/(dashboard)/analytics/{page.tsx,_components/*}` + `src/app/partner/org/[orgId]/analytics/page.tsx`.
Migration 0042; JOBS.analytics.{refreshAggregates,backfillAggregates,runExport,expireStaleExports,purgeStaleHourlyWindows}.

## 7. Pending USER actions (none block Wave 7 building)
1. Prod-apply migrations 0033–0039 + 0040 + 0041 + **0042** + drizzle bookkeeping, in order.
2. Stripe: `npm run seed:stripe-prices` → set `STRIPE_PRICE_*` → `verify:stripe-prices`.
3. Coolify: Stripe webhook + envs; analytics crons auto-register from worker.ts on redeploy.
4. (Optional) fix the cookie-consent `"use server"` build blocker; local DB reset+reseed to clear the 11 baseline failures.

## 8. Wave 6 deferrals (NOT Wave 7 blockers)
Org-level heat-map/lead-time/forecast + split-by-venue toggle (v1.5); org-aggregate table for >10-venue chains (v1.5); §11.1 `FOR SHARE` lock (live-billing hardening); admin cohort-override UI; top-dishes in weekly email (§08); custom date-range picker; lead-time histogram (currently p50/p90 trend — no raw lead times in aggregates).
