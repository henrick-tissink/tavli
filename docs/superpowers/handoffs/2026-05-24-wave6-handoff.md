# Tavli v1 — Wave 5 COMPLETE → Wave 6 (Analytics) handoff

> Paste-able cold-start handoff. Wave 5 (multi-location + billing) closed
> 2026-05-24. This session did Waves 5 A–G end-to-end without live Stripe keys.
> Next: **Wave 6 — §07 analytics**.

---

## 1. Current state

- **Branch `main`, head `5cb3109`.** 39 commits this session, **all local/unpushed**
  (per the push-when-asked rule — a new session on this repo sees them).
- Waves 1+2+3+4+5 shipped in code. **`npx tsc --noEmit` clean.**
- **Full test suite: 11 suites / 40 tests fail = the PRE-EXISTING baseline** (stale
  local DB, see Gotchas). Everything I added is green; **zero new regressions** all session.

## 2. Cold-start sequence (do in order)

1. Load `MEMORY.md` — top line = "Wave 5 ✅ COMPLETE; Wave 6 next".
2. Open `docs/superpowers/architecture/build-order.md` → Wave 5 is `✅ COMPLETE`;
   Wave 6 is the lowest open wave (5 unchecked `§07` lines).
3. Read `docs/superpowers/architecture/07-analytics-and-reports.md` (599 lines) —
   the authoritative §07 design. Section map below.
4. Brainstorm → spec → plan → execute (TDD inline), per the conventions in §5.

## 3. Wave 6 scope — §07 analytics (5 build-order lines)

```
- [ ] §07 aggregate + cohort tables
- [ ] §07 JOBS.analytics.runExport ZIP generation
- [ ] §07 Pro dashboards
- [ ] §07 PII access audit logging on every export (§07 §5a)
- [ ] §07 analytics.weeklySummary digest job
```

**§07 doc map** (where the detail lives):
- §3 pillars (pre-computed daily aggregates; 2 tiers; tier-aware archive; async exports)
- §4 data model — **4 new tables** (none exist yet → migration 0042):
  `reservation_daily_aggregates`, `reservation_hourly_aggregates` (Pro),
  `diner_cohort_aggregates` (Pro), `restaurant_export_jobs`. §4.5 RLS.
- §5 aggregation job `analytics.refresh-aggregates` + §5.1a service-label heuristic
  + §5.1b cohort recompute-vs-carry-forward. §5.2 backfill, §5.3 today-delta.
- §6 forecast (Pro). §7 UI surfaces (Base + Pro dashboards + org rollup + export modal).
- §8 CSV export — `analytics.run-export` ZIP job (§8.1), schema (§8.2), the
  contractual full-export-on-cancel promise (§8.3).
- §9 weekly summary email (trigger/content/audience). §10 background jobs.

**Registry gaps Wave 6 must fill** (mirror how W5 added `multilocation`):
- `JOBS.analytics` has only `weeklySummary` + `refreshCohorts`. **Add
  `refreshAggregates: "analytics.refresh-aggregates"` and
  `runExport: "analytics.run-export"`** (single-word domain `analytics`, no
  underscores → passes `src/lib/jobs/__tests__/keys.test.ts`).
- `AUDIT.analytics` **already populated** (`export_run`, `cohort_manually_overridden`,
  `weekly_summary_sent`) — no AUDIT additions needed.
- ERROR_CODES §07 range = TV500–TV599 (`TV501 export_too_large`, `TV502 no_data_in_window`
  exist). Add new TV5xx as needed.

**Wave 6 unblocks:** §11 (segmentation reads cohorts), §12 (overage reporting reads usage).

**Dependency note:** Pro-tier gating uses `loadActiveSubscription` /
`loadBillingAccess` from Wave 5 (both return free/`full` until subscriptions
exist — fine for build-time + tests).

## 4. Suggested decomposition (confirm in brainstorm — don't treat as fixed)

- **W6-A** aggregate/cohort tables (migration 0042) + `refresh-aggregates` job
  (the substrate everything reads). Service-label heuristic (§5.1a) + cohort
  recompute (§5.1b) are the tested cores.
- **W6-B** CSV/ZIP export — `restaurant_export_jobs` + `run-export` job + **PII-access
  audit on every export** (`AUDIT.analytics.export_run`) + the §8.3 cancel-export
  promise (this is also the W5-F `cancel-subscription.ts` "data-export-on-cancel"
  TODO seam — wiring them together closes that seam).
- **W6-C** weekly summary digest job + email template (`src/emails/*.tsx`, RO/EN/DE,
  like the W5-C trial emails).
- **W6-D** dashboards (Base + Pro + org rollup). **GENUINE DECISION for the
  brainstorm:** unlike the billing UI I deferred (not a build-order line),
  "Pro dashboards" IS a Wave 6 line — so it likely should be built. But it's the
  one piece that needs the `frontend-design` skill + visual verification (and a
  running app), which is harder "without keys / without live testing". Decide:
  build dashboards now (frontend-design pass) vs defer the visual layer and ship
  the dashboard *data/query layer* + minimal surface. Aesthetic bar applies
  (`feedback_aesthetic_bar` memory — editorial, not plain).

## 5. Conventions established this session (FOLLOW for consistency)

- **Build without live keys.** USER directive: build ALL remaining waves without
  Stripe/live keys; defer live testing until every wave is done. All external
  clients are **injected via `make*({deps})` DI** and **mocked in tests**; lazy
  `getStripe()` (arrow wrappers) so modules never throw at load without a key.
- **Defer UI/surfaces NOT in the build-order**; forward-declare seams (no-op now,
  filled later) — e.g. W5-A venue-hooks → W5-F sync. Surfaces that ARE build-order
  lines get built (see W6-D decision).
- **Lib-layer `make*({deps})` throws `Error("TV### slug: …")`; app-layer
  `"use server"` wraps via `toResult` + `revalidatePath`.** ActionResult shape:
  `{ok:true,data} | {ok:false,error}`.
- **Migrations:** add Drizzle table to `src/lib/db/schema.ts`, write
  `drizzle/migrations/00NN_<name>.sql` (raw SQL + RLS), append `_journal.json`
  entry (`idx`+1, same `version`, `Date.now()`, tag, `breakpoints:true`).
  Wave 6 migration = **0042**.
- **Jobs:** handler in `src/lib/...`, register in `scripts/worker.ts` via
  `boss.work(JOBS.x, …)` + `boss.schedule(JOBS.x, "<cron>")` (queues auto-bootstrap
  from the JOBS key). JOBS values: single lowercase-word domain, kebab action,
  **no underscores** (keys.test invariant).
- **Email templates:** React-Email components in `src/emails/*.tsx` with inline
  RO/EN/DE `COPY` + `getSubject(locale)`; render via `@react-email/render`.
  **Test gotcha:** mock `@react-email/render` → `renderToStaticMarkup` (jsdom can't
  do the lib's dynamic import). See `src/emails/__tests__/billing-emails.test.ts`.
- **Audit:** general `recordAudit` → `audit_logs`; billing used a separate
  `recordBillingAudit` → `billing_audit_log`. Analytics uses `recordAudit` with
  `AUDIT.analytics.*` (it's in the general AUDIT registry).
- **TDD per piece:** write test → run (fail) → impl → run (pass) → `npx tsc --noEmit`
  → commit. One commit per logical piece, tagged `(§07 Wave 6 sub-unit X.N)`.
- **Verify `tsc` exit directly** (`npx tsc --noEmit; echo $?`) — piping to `tail`
  masks the exit code via `$?`/PIPESTATUS.
- **Execution mode:** tightly-coupled §-domain work → execute INLINE with TDD (the
  subagent-driven skill's own decision tree routes coupled tasks to manual). Specs
  for D/F/G were written lean (the architecture doc carries the heavy detail) and
  executed directly without separate heavyweight plan docs — fine for a focused,
  well-specified domain.

## 6. GOTCHAS (don't lose time on these)

- **Stale local test DB (PRE-EXISTING, not a regression).** `npm test` shows
  **11 DB-integration suites failing** (repos/event-requests/cron/corporate-spaces/
  admin-restaurants) with missing-column errors. The local Supabase DB
  (`127.0.0.1:54322`) is behind the journal (only 7 drizzle bookkeeping rows;
  **missing `restaurants.organization_id` from Wave 2** + 1770 seed rows). I proved
  these fail identically at the session-start commit. **DON'T chase them** — use
  targeted `npx jest <path>` for unit suites; treat "11 failed = baseline" as green.
  Fully fixing needs a destructive local reset+reseed (drops 1770+337 seed rows) —
  needs USER consent.
- **`drizzle-kit migrate` STALLS** (tries to replay all 40+ migrations against the
  drifted DB). To apply a new migration locally, run its SQL directly via
  `psql "$DATABASE_URL" -f drizzle/migrations/00NN_*.sql` (source `.env.local`).
- **Migrations applied to LOCAL this session:** 0040 (partial — venue tables;
  counter backfill skipped, blocked by missing organization_id) + 0041 (full
  billing tables). Wave 6's 0042 will apply cleanly locally IF its tables only
  reference organizations/restaurants/reservations that exist — check before applying.
- **`tax_id` for Stripe is `eu_vat`, not `ro_vat`** (Stripe has no ro_vat type) —
  see `start-subscription.ts`. Stripe status enum is American `canceled`; map via
  `src/lib/billing/stripe-status.ts` (`mapStripeStatus`).

## 7. Pending USER actions (before any live testing — NOT blocking Wave 6 build)

1. **Stripe prices:** `STRIPE_SECRET_KEY=… npm run seed:stripe-prices` → paste the
   printed `STRIPE_PRICE_*` envs → `npm run verify:stripe-prices`. (`price-ids.ts`
   throws until set — blocks startSubscription/sync/change-plan at runtime only.)
2. **Prod migrations** (user-triggered; classifier denies the batch from Claude):
   apply `0033–0039` (Wave 4) + `0040` (W5-A) + `0041` (W5-B) in order + drizzle
   bookkeeping (see `deploy_setup.md` 3-step convention). Wave 6 will add `0042`.
3. **Coolify:** set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_*`;
   point a Stripe webhook at `https://tavli.ro/api/webhooks/stripe`; redeploy worker
   (picks up the new billing crons: applyPendingFrequencyChanges, enforceDunningTier,
   expireOrphanIncomplete, archiveCancelledOrgs, syncStripeSubscription, trial reminders).
4. (Optional) local DB reset+reseed to clear the 11 pre-existing test failures.

## 8. Wave 5 deferrals (recorded — may surface in later waves, NOT Wave 6 blockers)

- Billing/cancel/change-plan **UI + banners** → §15/W5-E.
- Per-action **soft-lock wiring** (`loadBillingAccess` adoption) → consuming domains.
- **data-export-on-cancel** → §07/§13 (W6-B can close the `cancel-subscription.ts` seam).
- `org_status='archived'` true-hard-delete → §13 retention.
- `archived_at` read-path retrofit (§09) → venue-archival-UI wave.

## 9. Key Wave 5 modules (reference; mostly `src/lib/billing/`)

`load-subscription.ts` (loadActiveSubscription §3.5), `price-ids.ts`,
`stripe-price-spec.ts` (+ `scripts/seed-stripe-prices.ts`/`verify-stripe-prices.ts`),
`start-subscription.ts` (§7.1), `billing-audit.ts` (recordBillingAudit),
`stripe-status.ts` (mapStripeStatus), `stripe-webhook-router.ts` + `webhook-idempotency.ts`
+ `src/app/api/webhooks/stripe/route.ts`, `sync-extra-location.ts` (+ `venue-hooks.ts`),
`cancel-subscription.ts`, `change-plan.ts`, `dunning.ts`, `billing-lifecycle.ts`.
Emails: `src/emails/TrialEndingEmail.tsx`, `RecurringChargeConsentEmail.tsx`.
Onboard trial seam: `src/lib/billing/onboard-trial-seam.ts` → `src/app/onboard/[token]/review/actions.ts`.
Specs/plans: `docs/superpowers/{specs,plans}/2026-05-24-wave5-{A..G}-*`.
