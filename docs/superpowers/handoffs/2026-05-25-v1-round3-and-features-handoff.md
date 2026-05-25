# Handoff — v1 round-3 fixes + deferred features complete (2026-05-25)

> Supersedes `2026-05-25-v1-launch-readiness-handoff.md`. This is the authoritative
> state-of-v1 after the round-3 adversarial sweep remediation **and** the build of
> every previously-deferred feature.

## TL;DR

**All v1 engineering is complete, tested, committed, and pushed.** The codebase is
launch-ready; what remains is **operator-only** (Coolify redeploy + env/keys/DNS/DPAs
+ live smoke). The audit's deferred-feature list is now empty.

- Branch `main`, HEAD **`feab484`**, **pushed** to `origin/main` (0 ahead / 0 behind), clean tree.
- Gate: `tsc` 0 errors · full `jest` **1561 passed / 2 skipped / 0 failed** · 0 new lint errors.
- **Prod DB migrated through 0060** (61 rows in `drizzle.__drizzle_migrations`) — schema is ahead of the running code (safe; additive).
- Two prior sessions are folded in: the 18-finding + round-2 conformance audits (`project_v1_adversarial_remediation`) and this session's round-3 + features (`project_v1_round3_remediation`).

## What shipped this session

### Round-3 adversarial remediation (20 fixes, commits `514c611..1880cda`)
Full record: `docs/superpowers/audits/2026-05-25-v1-round3-audit.md`. Highlights: 5
launch-blocking criticals (one-off campaign crash, reviews-unreachable-by-erasure,
reviews-never-counted, staff-invite lockout, cross-window capacity race) + HIGH/MED
(live-view host lockout, List-Unsubscribe + email link tracking, cross-org PII read,
sparse-webhook annual-refund clobber, review-submit §4.1 rules, Pro-feature status
gating, attribution scoping, frequency-switch extra_location, feedback-PII out of the
fiscal log, registry-guard free-text scan, AUDIT.user.created, BNR staleness audit).
**Debunked 2 auditor false-positives:** admin-MFA (Next 16 renamed middleware→`proxy.ts`,
which enforces it) and the menu-limit (1-menu-per-restaurant model).

### All 15 deferred features (14 commits `3b5195e..def78c8` + tsc follow-up `feab484`)
Migrations **0055–0060** (applied locally AND to prod this session).

| # | Feature | Key artifacts |
|---|---------|---------------|
| F1 | 24h pre-arrival reminder | mig 0055 `reservations.reminder_sent_at`; `src/lib/reservations/jobs/send-reminders.ts` hourly sweep, claim-before-send; worker `0 * * * *` |
| F2 | auto-mark-no-show + free table | mig 0056 `restaurants.auto_no_show` (opt-in, default OFF); `auto-mark-no-show.ts`; worker `30 * * * *` |
| F4-core | table↔reservation invariant | `src/lib/tables/validate-or-clear-table-assignment.ts` — wired into no-show/cancel/unassign |
| F3 | post-visit review → pg-boss | `send-post-visit-reviews.ts` (venue-tz); `/api/cron/post-visit-emails` is now a thin CRON_SECRET delegate; worker `15 * * * *` |
| F4 | assign/unassign to table | `live-actions.ts` assignReservationToTableAction / unassignReservationAction (IDOR-scoped, `table.update`) |
| F5 | reservation_status_log | mig 0059; `status-log.ts` wired into create/update/cancel/auto-no-show |
| F6 | live-view assignment UI | `LiveFloor.tsx` reservations panel → seat to a free table |
| F7 | inbound STOP/START | `/api/webhooks/twilio-inbound` + `src/lib/sms/{inbound-keyword,handle-inbound}.ts` |
| F8 | transactional-SMS consent | `consent.recordTransactionalSmsConsent` + `createReservation` `smsConsent` flag |
| F9 | overage → Stripe | `src/lib/billing/overage-reporter.ts` (`invoiceItems.create`, gated on live key) |
| F10/F11 | owner responses + review edit | mig 0058 `review_responses`/`review_revisions`; `respond.ts`/`edit.ts`; `review.respond` perm; pseudonymise nulls `prior_body` |
| F12 | DSA statement-of-reasons | `ReviewRemovedStatementEmail` sent on upheld report |
| F13 | restrict/object DSR | mig 0057 `diners.processing_restricted`; `approveDsrRestriction`; TV1104 gate; fan-out exclusion |
| F14 | diner modify-by-link | mig 0060 `reservations.version`+modified_*; `modify-by-token.ts`; `/reservations/[token]/modify` page |
| F15 | DE legal pages | 6 docs `src/content/legal/de/*` + `/de/*` routes; parity test extended (12/12) |

## Verification status

- **Verified (automated):** full `jest`, `tsc`, `eslint`; new SQL smoke-tested against the live local schema (capacity race reproduced; migrations applied clean 0053→0060).
- **NOT yet verified (operator's live test):** authenticated partner surfaces, live Stripe payment/webhook, real email/SMS deliverability, the new live-floor assignment UI + modify-by-link page under a real session, and a visual check.

## Prod state

- **DB:** Supabase, migrated through **0060** (61 tracked rows; ids for 0053–0060 inserted this session via `psql --single-transaction` from `.env.prod` with sha256 bookkeeping per `deploy_setup`). Pre-flighted each before apply.
- **Code:** pushed to `origin/main` @ `feab484`. **Prod is NOT yet running this code** — redeploy needed.

## 🔴 LAUNCH RUNBOOK (operator-only — the remaining critical path)

1. **Coolify redeploy** of `main@feab484` (Claude has no Coolify access).
2. **Env vars** — ⚠️ **`LINK_TRACKING_SECRET` is now REQUIRED in production** (fail-closed; marketing-email sends throw without it — `openssl rand -base64 32`). Plus `PARTNER_SIGNUP_ENABLED`, `SENTRY_DSN`, `PGBOSS_DATABASE_URL` + the worker service, and (when SMS launches) `TWILIO_*` + the inbound-SMS webhook → `/api/webhooks/twilio-inbound`.
3. **Stripe go-live:** seed prices → set `STRIPE_PRICE_*` → webhook + `STRIPE_WEBHOOK_SECRET`; register **Stripe Tax (RO)**. (Marketing overage now bills via `invoiceItems.create` once a live key is present.)
4. **DKIM / SPF / DMARC** on the sending domain (Resend → Cloudflare DNS); **sign DPAs** (`docs/operations/sub-processors.md`).
5. **Legal sign-off:** the RO/EN/DE legal pages render but the registered entity is still `<Placeholder>`/TBD across all locales and the German text is a faithful draft — get a lawyer pass before launch.
6. **Backfill** triggered campaigns; **crons** auto-register on worker boot (now incl. reservation reminder/no-show/post-visit).
7. **Live smoke test** — standing test partner account (`test_partner_account` memory).

## Intentional deferrals (gated, not gaps)

- **Transactional-SMS booking-form checkbox** — the backend consent path exists (F8); the visible opt-in is gated to SMS-launch (showing it while SMS is off platform-wide would promise messages that won't send).
- **Full drag-drop** table assignment — shipped functional click/select-to-assign (F6); drag is a v1.5 polish.
- **A10 inbound-SMS** is now built (F7); it activates with SMS.

## Conventions & gotchas

- **Migrations:** `drizzle-kit generate` is BANNED. Hand-author `drizzle/migrations/NNNN_*.sql` (next is **0061**), append `_journal.json`, update `schema.ts` (descriptive), apply via `psql -f`. Prod apply = `psql "$DATABASE_URL(.env.prod)" --single-transaction -v ON_ERROR_STOP=1 -f <file>` + insert a `drizzle.__drizzle_migrations` row (`hash=sha256(file)`, `created_at`=ms epoch). Local rebuild: `npx --no-install supabase db reset && for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done && npm run db:seed`.
- **jest contention gotcha:** running multiple test files via one `npx jest <pathA> <pathB>` (esp. with `(parens)` paths) sometimes hangs in this env. Run by exact path with `--forceExit`, or one file at a time. `--testPathPatterns` (plural) is the current flag.
- **`(dashboard)`/`[token]` paths** need `--testPathPatterns "regex"` (the literal parens/brackets confuse the glob matcher).
- **`react-hooks/purity`** flags `Date.now()`/`new Date()` in server-component render — use `// eslint-disable-next-line react-hooks/purity` immediately above the line (the line offset matters), as elsewhere in the codebase.
- **Next 16 = Proxy, not Middleware:** `src/proxy.ts` is the active middleware (forces admin MFA enrolment + AAL2). Don't look for `middleware.ts`.
- **Server-action `ActionResult` failures** use `.code` + `.message` (not `.error`); `notFound()/forbidden()/unauthenticated()` take no args.

## Repo coordinates

- Prod/deploy: `deploy_setup` memory + this runbook. Build-order: `docs/superpowers/architecture/build-order.md`.
- Audits: `docs/superpowers/audits/2026-05-25-v1-round3-audit.md` (+ the two prior).
- Project memory: `project_v1_round3_remediation.md` (this session, full log), `project_v1_adversarial_remediation.md`, `project_v1_build_phase.md`.
- Compliance docs: `docs/operations/{sub-processors,launch-conformance-checklist,a11y-axe-report}.md`.
