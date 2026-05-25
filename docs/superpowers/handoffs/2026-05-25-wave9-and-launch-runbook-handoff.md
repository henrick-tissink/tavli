# Handoff — Wave 9 engineering done · launch runbook is all that's left (2026-05-25)

> Supersedes `2026-05-25-v1-round3-and-features-handoff.md`. This is the
> authoritative state-of-v1 doc. A fresh session can open this cold and know
> exactly where things stand and what tomorrow's work is.

## TL;DR

**All v1 engineering is complete, tested, committed, and pushed — including the
code half of Wave 9 (closure).** What remains is the **operator launch runbook**:
6 items only the user can do (keys/DNS/legal/Coolify), plus 2 we close together
once prod is redeployed. There is **no remaining Claude-side build work** for v1.

- Branch `main`, HEAD **`42fe81f`**, **pushed** to `origin/main` (0 ahead / 0 behind), clean tree.
- Gate: full `jest` **1561 passed / 0 failed / 4 skipped** · `tsc` 0 · `eslint` 0.
- Prod DB migrated through **0060**; prod code **not yet redeployed** (safe — migrations are additive/ahead).
- **Wave 9 is 2/8.** The 6 open items are the launch gate (see runbook below).

## What shipped this session (2 commits)

Closed the **engineering half of Wave 9** — the only two Wave 9 items that are code:

| Commit | What |
|---|---|
| `066464b` | **Erasure-cascade verification.** Extended `src/lib/compliance/__tests__/erasure-cascade.integration.test.ts` from 2 → 4 cases. It existed but had never been run green (DB-gated by `TEST_DATABASE_URL`) and covered only 11 of 12 shipped handlers. Now: seeds/asserts **all 12** (added the missing `marketing_sends` + `review_revisions`), plus an **idempotent-retry** test (reset DSR→`in_progress`, re-run, prove no-op) and a **capstone** that runs the production nightly sweep (`verify.ts`) asserting **zero residual PII** across every shipped table. |
| `42fe81f` | **build-order.md** — marked the two Wave 9 engineering items `[x]`, added a revision note. Wave 9 now 2/8. |

### Verification (all green)
- Erasure integration test: **4/4** against the live local schema (0060).
- Cross-subsystem integration sweep (GDPR + dunning + WhatsApp-gate TV904 + audit): **62/62, 7 suites**.
- Full suite: **1561 passed / 0 failed** (unchanged baseline — the integration file is CI-skipped without `TEST_DATABASE_URL`).
- `tsc` 0 · `eslint` 0.

**To re-run the integration test:**
```
TEST_DATABASE_URL=$(grep DATABASE_URL .env.local | head -1 | cut -d= -f2- | tr -d '"') \
  npx jest src/lib/compliance/__tests__/erasure-cascade.integration.test.ts --forceExit --runInBand
```
Why DB-gated: it seeds/redacts real rows across ~12 tables. Local Supabase DB (127.0.0.1:54322) is at schema 0060.

## 🔴 LAUNCH RUNBOOK — tomorrow's work (operator-only; Claude has no keys/DNS/Coolify)

Ordered by dependency. Items 1–2 unblock most of the rest.

1. **Coolify redeploy** of `main@42fe81f` — gets prod running the new code (currently behind the migrated schema). Most items below need this live.
2. **Env vars** — set the now-**required** **`LINK_TRACKING_SECRET`** (`openssl rand -base64 32`; marketing-email sends throw without it, fail-closed). Plus `PARTNER_SIGNUP_ENABLED` (unset / anything-but-`"false"` = signup CTAs live; `"false"` = wait-list modal), `SENTRY_DSN`, `PGBOSS_DATABASE_URL` + the worker service (`WORKER_MODE=true`, direct Postgres not pgbouncer). When SMS launches: `TWILIO_*` + inbound-SMS webhook → `/api/webhooks/twilio-inbound`.
3. **Stripe go-live** — `STRIPE_SECRET_KEY=… npm run seed:stripe-prices` → set `STRIPE_PRICE_*` envs → `npm run verify:stripe-prices` → webhook + `STRIPE_WEBHOOK_SECRET` → **register Stripe Tax (RO)** (§12 §3.6.4). Marketing overage bills via `invoiceItems.create` once a live key is present.
4. **DKIM / SPF / DMARC** warmup on the sending domain (Resend → Cloudflare DNS).
5. **Sign DPAs** with every sub-processor (Resend, Twilio, Stripe, Supabase, Cloudflare, Sentry) — documented in `docs/operations/sub-processors.md`.
6. **Legal sign-off** — RO/EN/DE legal pages render but the registered entity is still `<Placeholder>`/TBD across all locales and the German text is a faithful draft. Lawyer pass before launch.

**Then close together (need prod up first):**
- **Lighthouse + axe-core + cross-browser** pass on all public surfaces (§15a.7) — can run against the deployed site; I can drive this once prod is redeployed.
- **Final smoke test** against the standing test partner account (`test_partner_account` memory) — and the ANPC/GDPR/PSD2/DSA/WCAG conformance checklist (`docs/operations/launch-conformance-checklist.md`).

**How Claude can help tomorrow** (even without executing): hand you exact `! openssl`/`! stripe`/`npm run` commands to run inline, walk the price-seed + verify scripts, draft the DKIM/SPF/DMARC records, prep the legal-entity fill-in, and drive the Lighthouse/axe pass + smoke test once prod is live.

## Prod state

- **DB:** Supabase, migrated through **0060** (61 tracked rows in `drizzle.__drizzle_migrations`). Schema is ahead of running code — safe; all additive.
- **Code:** pushed to `origin/main` @ `42fe81f`. **Prod is NOT yet running it** — redeploy is runbook item 1.

## Conventions & gotchas (carry-forward)

- **Migrations:** `drizzle-kit generate` is BANNED. Hand-author `drizzle/migrations/NNNN_*.sql` (**next is 0061**), append `_journal.json`, update `schema.ts` (descriptive). Prod apply = `psql "$DATABASE_URL(.env.prod)" --single-transaction -v ON_ERROR_STOP=1 -f <file>` + insert a `drizzle.__drizzle_migrations` row (`hash=sha256(file)`). Local rebuild loop is in the prior handoff.
- **jest:** the DB-integration tests run by exact path with `--forceExit` (one file, or a small explicit list, with `--runInBand`); running the whole suite via one big multi-path glob can hang. `(dashboard)`/`[token]` paths need `--testPathPatterns "regex"`.
- **react-hooks/purity** flags `Date.now()`/`new Date()` in server-component render — disable on the exact line above.
- **Next 16 = Proxy, not Middleware:** `src/proxy.ts` is the active middleware (admin MFA / AAL2). No `middleware.ts`.
- **Server-action `ActionResult`** failures use `.code` + `.message`.

## Repo coordinates

- **Build order (authoritative):** `docs/superpowers/architecture/build-order.md` — Waves 1–8 done, Wave 9 at 2/8.
- **Audits:** `docs/superpowers/audits/2026-05-25-v1-round3-audit.md` (+ conformance sweep + the two prior).
- **Compliance/ops:** `docs/operations/{sub-processors,launch-conformance-checklist,a11y-axe-report}.md`.
- **Memory:** `project_wave9_engineering.md` (this session), `project_v1_round3_remediation.md`, `project_v1_adversarial_remediation.md`, `project_v1_build_phase.md`, `deploy_setup.md`, `test_partner_account.md`.
