# Handoff — v1 launch readiness (2026-05-25)

> Supersedes `2026-05-25-v1-remaining-autonomous.md` (that plan is now fully
> executed). This is the authoritative state-of-v1 + launch runbook.

## TL;DR

**All code-side v1 work is complete, verified, committed, and pushed.** The
codebase is launch-ready. What remains is **operator-only** (env/keys/DNS/DPAs +
a Coolify redeploy + the live smoke test) — no remaining engineering tasks.

- Branch `main`, HEAD **`48d42b0`**, **pushed** to `origin/main` (0 ahead / 0 behind), clean tree.
- **15 commits this session** (`a8e380d..48d42b0`).
- **Prod DB migrated through 0052** (53 tracked in `drizzle.__drizzle_migrations`).
- Gate: `tsc` 0 errors · full `jest` **1468 passed / 2 skipped / 0 failed** · `next build` exit 0 · axe a11y **4/4 green (0 disabled rules)**.

## What shipped this session

The prior handoff's backlog (Phases A–D + the two product decisions) — all done:

| Item | Commit | Notes |
|------|--------|-------|
| A1 atomic diner upsert (race fix) | `a8e380d` | `INSERT … ON CONFLICT` + xmax; email path = optimistic insert + 23505 recovery |
| A2 reservation mutations gate on `can()` | `ebecb21` | no_show/seated/completed/cancel each gated |
| A8 `diner_pii_access_log` 24-mo purge | `c94e72b` | nightly job |
| A9 PII-registry schema-drift guard | `50583ac` | static introspection test |
| A3/A6/A7 → **migration 0050** | `9e27fdd` | consent active-unique index + fn search_path + setup_progress NULLS NOT DISTINCT |
| A4 quiet-hours defer + A5 sub.created replay guard | `0cea1e0` | |
| Phase C non-diner DSR + D1 erasure integration test | `4692191` | **found & fixed 3 real prod bugs** (see below) + migration **0051** |
| D4 sub-processors + D5 conformance checklist | `842c2f1` | `docs/operations/` |
| B3 LOW polish | `edb12f5` | SMS-log redaction, waitlist IP cap, `prefers-reduced-motion` |
| B1 walk-in queue GDPR erasure | `f64f7d6` | migration **0052** |
| D3 a11y axe pass (initial) | `4045aac` | harness `e2e/a11y.spec.ts` |
| B3 removeVenueFromOrg fixes | `60a9906` | seated guard + venue-local date + recount |
| a11y AA retone + close-out | `8d37a1d`, `827aaa7` | full WCAG 2.2 AA, 0 disabled rules |
| `campaign_version_id` on sends | `48d42b0` | snapshot at send + stamp in both send paths |

**The 3 prod bugs D1 surfaced** (would have broken *every* real GDPR erasure):
1. `ANY(${jsArray}::uuid[])` — drizzle expands JS arrays → "malformed array literal" on single-element. Rewrote audit-logs + partner-notifications phase 1/2 to `ARRAY[$1,…]::uuid[]`.
2. `diners_identity_required` CHECK forbade nulling phone+email (which erasure does) → migration **0051** exempts redacted rows.
3. Phase-2's system-actor sentinel `00000000-…` isn't a real `auth.users` row → `erasure_log` FK violation; now stored NULL.

## Verification status

- **Verified (automated):** full `jest` suite, `tsc`, `next build`, `eslint` (0 new errors), the erasure-cascade integration test (run locally against `TEST_DATABASE_URL`), and the axe a11y sweep (4/4, real browser via Playwright against a `next start` build). New SQL (migrations + `campaign_version_id` subqueries) was smoke-tested against the live schema.
- **NOT yet verified (the operator's live test):** authenticated partner surfaces under a real session, live Stripe payment/webhook flow, real email/SMS deliverability, and a **visual** check of the retoned brand colors + the restructured RestaurantCard. My a11y/color changes are functionally + axe + build verified; the *look* is for the live test.

## Prod state

- **DB:** Supabase, migrated through **0052** (`drizzle.__drizzle_migrations` has 53 rows; ids 51/52/53 are 0050/0051/0052, applied this session via `psql --single-transaction` from `.env.prod`, with sha256 bookkeeping per `deploy_setup`). Pre-flighted 0 duplicate-data before the index creations. Also fixed a pre-existing `id`-sequence drift (setval→53).
- **Code:** pushed to `origin/main` @ `48d42b0`. **Prod is NOT yet running this code** — additive migrations are safe sitting ahead of the code until the redeploy.
- Prod has 0 live diners/consents/setup rows (pre-launch).

## 🔴 LAUNCH RUNBOOK (operator-only — the remaining critical path)

1. **Coolify redeploy** of `main@48d42b0` so prod runs the new code (Claude has no Coolify access — you trigger it).
2. **Stripe go-live:** `STRIPE_SECRET_KEY=… npm run seed:stripe-prices` → set `STRIPE_PRICE_*` envs → `npm run verify:stripe-prices`; configure the Stripe **webhook** endpoint + `STRIPE_WEBHOOK_SECRET`; set **`PARTNER_SIGNUP_ENABLED`** (unset/anything-but-`"false"` = signup CTAs live; `"false"` = wait-list modal).
3. **Stripe Tax** — register for RO VAT collection (§12 §3.6.4).
4. **Email deliverability** — DKIM / SPF / DMARC on the sending domain.
5. **Sign DPAs** with each sub-processor in `docs/operations/sub-processors.md` (Supabase, Stripe, Resend, Twilio, Sentry, Hetzner).
6. **Backfill** — `npx tsx --env-file=.env.prod scripts/backfill-triggered-campaigns.ts` (seeds triggered campaigns for existing orgs; new orgs auto-seed).
7. **Crons** auto-register on worker boot (analytics/marketing/setup/pricing/compliance + the new `compliance.purgePiiAccessLog`).
8. **Live smoke test** — authenticated partner walkthrough + a real Stripe payment + visual check of colors/card. Standing test partner account: see `test_partner_account` memory.

## ✅ Resolved this session (no action needed)

- **Reservations `ON DELETE CASCADE`** — investigated: the *only* hard-delete of a restaurant is the abandoned-signup purge (`status='draft'` + org `pending_verification` >30d). Operator "remove venue" is a soft archive. No launched venue is ever hard-deleted → cascade is safe. **Kept.**
- **Billing `incomplete → full`** — it's a bounded, self-cleaning transient (≤24h; `expireOrphanIncomplete` deletes stale incompletes; Stripe `incomplete_expired`→`cancelled`→read_only). Real enforcement is at `past_due`/`unpaid`. **Kept.**

## 🟡 Deferred — v1.5 / not blocking

- **A10 inbound SMS STOP** — needs Twilio inbound webhook + number; pointless until SMS launches. ⚠️ **Becomes legally required (opt-out) the moment SMS is enabled** — gate it on SMS launch, not a date.
- **B2 `marketing_consent_audit` predicate-AST retention engine** — table already de-links via FK SET NULL; retention is an effectively-never (9999-day) policy whose `exception_predicate` is skipped (Sentry alert each nightly run is the only artifact). Near-zero value.
- **`next dev` stack-overflow crash** — non-reproducible now (boots + serves all routes under concurrent load); prod (`next start`) unaffected. Monitor only.
- Nested-segment DSL, marketing A/B engine, passkeys/WebAuthn — pre-existing v1.5 items.

## Conventions & gotchas for the next session

- **Migrations:** `drizzle-kit generate` is BANNED. Hand-author `drizzle/migrations/NNNN_*.sql` (next is **0053**), append `_journal.json`, update `schema.ts` (descriptive only), apply via `psql -f`. Prod apply = `psql "$DATABASE_URL(.env.prod)" --single-transaction -v ON_ERROR_STOP=1 -f <file>` + insert a `drizzle.__drizzle_migrations` row (`hash=sha256(file)`, `created_at`=ms epoch). The `id` sequence is now synced (post-drift-fix).
- **Local DB** is kept current via `psql -f`, not `drizzle-kit migrate`. Rebuild: `npx --no-install supabase db reset && for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done && npm run db:seed`.
- **a11y harness:** `E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/a11y.spec.ts` against a `next start` build. It now passes with **zero disabled rules** — keep it that way (it's a real regression guard). Report: `docs/operations/a11y-axe-report.md`.
- **Brand colors retoned for AA:** `--color-brand-primary #C2410C`, `-dark #9A3412`, `--color-text-secondary #6B6560`, `--color-text-muted #6E6862` (globals.css). The RestaurantCard is now a stretched-link (non-interactive container + stretched primary `<button>`).
- **jest gotchas:** importing `@/lib/jobs/enqueue` (pg-boss) or `resend` needs `@jest-environment node` (jsdom lacks TextEncoder) — or mock them. `matrix.test.ts` mirrors `PERMISSION_MATRIX` in a `SPEC` array (edit both). Several action tests mock `drizzle-orm` — adding an operator (e.g. `inArray`) means adding it to that mock.
- **Erasure integration test** (`erasure-cascade.integration.test.ts`) is `TEST_DATABASE_URL`-gated → shows as 1 skipped under plain `npx jest`. Run it: `TEST_DATABASE_URL=$DATABASE_URL npx jest erasure-cascade.integration`.

## Repo coordinates

- Prod/deploy: `deploy_setup` memory + this runbook. Build-order: `docs/superpowers/architecture/build-order.md`.
- Project memory: `project_v1_adversarial_remediation.md` (this session's full log) + `project_v1_build_phase.md`.
- Compliance docs: `docs/operations/{sub-processors,launch-conformance-checklist,a11y-axe-report}.md`.
