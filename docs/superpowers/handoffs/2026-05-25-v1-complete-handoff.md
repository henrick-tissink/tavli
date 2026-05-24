# Tavli v1 — BUILD COMPLETE → handoff (2026-05-25)

> All 8 build-order waves are shipped and merged; the deferred operator UI is built;
> a set of v1.5 enhancements are in; the test suite is fully green; everything is
> pushed to `main` (HEAD `dcf7a69`) and prod DB migrations are applied (0000–0045).
> **No remaining v1 *build* work.** What's left is the go-live operational phase
> (deliberately deferred by the user) + two consciously-flagged v1.5 items.

## 0. Verify start state
- `git rev-parse --short HEAD` → `dcf7a69`; `git status` → clean; all pushed to `origin/main`.
- `npx tsc --noEmit` → 0; `npx eslint` (prod) → 0 errors; `npx next build` → exit 0.
- `npx jest` → **0 failed, 1331 passed, 1 skipped** (the skipped one is `TEST_DATABASE_URL`-gated).
- Prod `drizzle.__drizzle_migrations` count = **46** (0000–0045 all applied).

## 1. What shipped (the whole arc)
- **Waves 1–8** (per `docs/superpowers/architecture/build-order.md`): foundations, identity+bookings,
  diner CRM+comms, compliance baseline+§08 tables+§05 translations, multi-location+billing, analytics,
  marketing engine, setup tooling + the §15 editorial trilingual pricing page. All merged.
- **Deferred operator UI built this session** (substrate had shipped UI-less): billing management
  (`/partner/billing`), multi-location org (`/partner/org/[orgId]…`), marketing
  (`/partner/marketing` + `/segments`), translations editor, review surface, §08 floor-plan
  drag-drop canvas. Six sidebar nav entries added.
- **v1.5 additions**: active-venue switcher (cookie-based, no middleware), marketing quota-alert
  banners + trilingual template library + per-locale copy editor + visual segment builder.
- **Test suite fixed to fully green**: root-caused the 6 pre-existing failures (3 wall-clock-flaky
  component tests → `src/test-support/clock.ts`; 3 stale fixtures → org-membership rows + seeded
  availability). Reproduced each before fixing.
- **Local DB rebuilt** clean (`npx supabase db reset` → all 46 migrations via psql → `npm run db:seed`),
  which also proved the migration chain is internally consistent end-to-end.

## 2. What's left
**(A) Go-live / operational — DEFERRED by user choice (do not start without their go-ahead):**
- Coolify redeploy (prod runs pre-Wave-4 code; schema is ahead — additive, safe).
- Stripe: `npm run seed:stripe-prices` (live key) → set `STRIPE_PRICE_*` envs → `npm run verify:stripe-prices`; wire the Stripe webhook + secrets.
- Set `PARTNER_SIGNUP_ENABLED` (`false` = waitlist mode; unset/true = live signup CTAs).
- Authenticated/live end-to-end testing — incl. pixel-level visual verification of every partner
  surface built this session + the W6-D analytics dashboard (one partner login unlocks the sweep).

**(B) Flagged v1.5 — NOT built (would be hollow or are large standalone efforts):**
- Marketing A/B testing — **no engine substrate**; build the engine first or it's a façade.
- Passkeys/WebAuthn — a separate security project.
- Billing Stripe-portal live flow — code present (`createBillingPortalSessionAction`), untestable without keys.

## 3. Conventions & gotchas to carry
- **No live keys** until the user lifts the go-live deferral; build + verify against tsc/lint/build/jest only.
- **Migrations are hand-applied** (`psql -f`) with 3-step bookkeeping (insert `drizzle.__drizzle_migrations`
  row `hash = sha256(file)` + `created_at` ms epoch; journal + snapshot committed). See `deploy_setup` memory.
- **Rebuild local DB**: `npx supabase db reset && for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done && npm run db:seed` (supabase CLI only via `npx --no-install supabase`).
- **Ownership is membership-based** since migration 0015: `is_owner_of()` / `can()` check
  `organization_members` + `restaurant_staff`, NOT `profiles.role`. Test fixtures must seed membership.
- **The reservations capacity trigger** (`reservations_check_capacity`) applies to ALL insert paths
  (incl. corporate accept) — reservations need matching `restaurant_availability` or they raise TV001.
- **Time-flaky tests**: use `src/test-support/clock.ts` `freezeClock()` (freezes Date only; real timers
  for user-event) for any test rendering time-of-day-relative slots.
- **`@jest-environment node`** for tests importing pg-boss / resend / twilio.
- House style: Fraunces/Inter, stone + orange `#F97316`, `rounded-card`; partner pages are RSC with
  small client islands; lint baseline has a few pre-existing `react-hooks/set-state-in-effect` errors
  in older files (e.g. PartnerSidebar effects) — not introduced here.

## 4. The adversarial audit (this milestone)
A team of read-only adversarial auditors swept the codebase at this milestone. Findings:
`docs/superpowers/audits/2026-05-25-v1-adversarial-audit.md` (severity-ranked; triage before fixing).

## 5. Pending USER actions
Coolify redeploy + Stripe seed/envs/webhook + `PARTNER_SIGNUP_ENABLED` (all under §2A). Everything
else is code-complete and pushed.
