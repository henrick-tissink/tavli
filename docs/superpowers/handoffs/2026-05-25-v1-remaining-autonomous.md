# Handoff — v1 remaining work that needs NO user action

> Written 2026-05-25. Purpose: let a fresh session (or another agent) finish every
> remaining v1 item that does **not** require the human operator. Everything here
> is code/tests/docs you can do autonomously, verify, and commit. The explicitly
> **excluded** (user-only) items are listed at the bottom so nothing is silently
> dropped.

## 0. Repo state at handoff

- Branch `main`, HEAD `e03fc9e`. **~13 commits local/unpushed** (the user pushes).
- Full suite green: **1442 passed, 1 skipped, 0 failed** (the 1 skip is the
  `TEST_DATABASE_URL`-gated erasure integration test — see D1).
- All v1 **features** are complete (Waves 1–8 + the 4 "functional gaps":
  triggered campaigns, diner-aggregate jobs, dunning enforcement, birthday, §08
  table-ops). What remains is a correctness/security backlog + the Wave-9
  closure artifacts that don't need the human.

### House rules (do not violate)
- **TDD**: test first (or alongside) for every logic change; run it red→green.
- **Migrations**: `drizzle-kit generate` is BANNED. Hand-author
  `drizzle/migrations/NNNN_<name>.sql` (next is **0050**), append a matching
  entry to `drizzle/migrations/meta/_journal.json`, update `schema.ts`
  (descriptive only), apply locally with `psql "$DATABASE_URL" -f <file>`.
  Additive only (no DROP/TRUNCATE of data).
- **Verify before claiming done**: after each task run `npx tsc --noEmit`,
  `npx eslint <changed files>` (0 NEW errors — the `PartnerSidebar`
  `set-state-in-effect` error is a pre-existing baseline, ignore it), the
  targeted `npx jest <path>`, then the full `npx jest` before the final commit
  of a phase. Run `npm run build` when you touch a route/page.
- **Commit per task** (small, reviewable), conventional-commit style, end with
  the `Co-Authored-By: Claude Opus 4.7 (1M context)` trailer.
- Aesthetic bar applies to any UI; trilingual (RO canonical) for any new
  user-facing copy; never name competitors in customer-facing copy.

### Known gotchas
- Importing `@/lib/jobs/enqueue` (pg-boss) or `resend` in a test needs
  `@jest-environment node` (jsdom lacks TextEncoder), OR mock those modules.
- `src/lib/authz/__tests__/matrix.test.ts` has a `SPEC` array that MIRRORS
  `PERMISSION_MATRIX` — adding/removing a permission requires editing BOTH.
- Several action tests drive a **sequenced** `dbAdmin` mock; inserting a new DB
  call (e.g. a guard) shifts the sequence — mock the new dependency instead.
- Local DB is kept current via `psql -f`, not `drizzle-kit migrate`. Rebuild:
  `npx --no-install supabase db reset && for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done && npm run db:seed`.
- RLS policies that join `restaurants.organization_id` don't apply on the local
  DB (drift) but are correct for prod — don't chase those as failures.

---

## Phase A — MED correctness / security

### A1 — atomic diner upsert (`src/lib/diners/upsert.ts`)
**Problem:** `findOrCreateDinerForReservation` does SELECT-then-INSERT; two
concurrent first-bookings for the same phone race and create duplicate diners /
lose linkage. **Fix:** make the insert an `INSERT ... ON CONFLICT (organization_id, phone)
WHERE phone IS NOT NULL DO UPDATE` (and the email-only branch on the
`diners_org_email_unique` partial index) so the unique index resolves the race;
return the surviving row + `isNew` correctly. Preserve the occasion-write logic
added this session. **Tests:** extend `src/lib/diners/__tests__/upsert.test.ts`
with a conflict-path case. No migration (indices already exist).

### A2 — reservation status mutations gate on `can()` (`src/app/partner/(dashboard)/reservations/actions.ts`)
**Problem:** `updateReservationStatus` / `cancelReservation` authorize via
`currentUserPrimaryRestaurant` (ownership) not `can('reservation.mark_no_show'|
'reservation.cancel'|'reservation.modify', {restaurant, org})` → least-privilege
(matrix roles) unenforced. **Fix:** resolve the venue's org, call `can()` with
the right action; keep the existing restaurant scoping. **Tests:** new cases
asserting a role lacking the perm is denied. No migration.

### A3 — marketing consent org-scope + unique index
**Problem:** SMS consent lookup is unscoped by org and there's no unique index on
`marketing_consents(organization_id, diner_id, channel)` → `.limit(1)` is
nondeterministic. **Fix:** (migration **0050**) add the unique index (partial if
needed for NULL diner_id); scope the consent query in `src/lib/marketing/consent.ts`
by org. **Tests:** consent lib unit test for the scoped lookup. Migration +
journal + schema.ts.

### A4 — quiet-hours defers instead of drops (`src/lib/marketing/send/policy.ts`)
**Problem:** when `inQuietHours` is true the send is SKIPPED (dropped), violating
§11 §10.3 (should defer to the window end). **Fix:** the policy result should
return a `deferUntil` (next allowed local time) instead of a hard skip; the leaf
(`send-message-handler.ts`) re-enqueues `JOBS.marketing.sendMessage` with
`startAfter: deferUntil` rather than dropping. **Tests:** policy unit test
(midnight-wrapping window → correct defer time) + leaf re-enqueue assertion.

### A5 — `onSubscriptionCreated` replay guard (`src/lib/billing/stripe-webhook-router.ts`)
**Problem:** the `customer.subscription.created` path isn't guarded by
`wasEventApplied`, so a webhook replay can regress status. **Fix:** add the same
`wasEventApplied` idempotency check used by the other webhook branches. **Tests:**
extend `stripe-webhook-router.test.ts` with a replay case.

### A6 — `fn_seed_setup_progress` hardening (migration **0050/0051**)
**Problem:** the trigger fn is SECURITY INVOKER with an unpinned `search_path`
and writes RLS-protected `setup_progress` → it will fail for any future
non-owner restaurant insert. (Sibling trigger was fixed in 0049; this one
missed.) **Fix:** `SECURITY DEFINER` + `SET search_path = public, pg_temp`
(mirror the 0049 fix). Migration + journal.

### A7 — `setup_progress` dedup index (migration, same batch as A6)
**Problem:** the unique index is NULLS-DISTINCT → org-level (NULL restaurant_id)
steps won't dedup. **Fix:** recreate the index `NULLS NOT DISTINCT` (Postgres 15+).
Migration + journal + schema.ts.

### A8 — wire `diner_pii_access_log` 24-month purge
**Problem:** `diner_pii_access_log` (`src/lib/db/schema.ts:1241`) grows unbounded;
no purge job. **Fix:** add `JOBS.compliance.purgePiiAccessLog` (or
`diner.purgePiiAccessLog`) key + a handler (delete rows older than 24 months) +
schedule it nightly in `scripts/worker.ts` (mirror `purgeStaleUnverifiedOrgs`).
**Tests:** handler unit test. No migration.

### A9 — registry-completeness schema-introspection test
**Problem:** `src/lib/compliance/__tests__/pii-table-registry.test.ts` only checks
internal consistency of present entries — it didn't catch `walkin_queue` /
`billing_audit_log` being omitted. **Fix:** add a test that introspects the live
schema (information_schema or the drizzle schema export) for tables with
PII-looking columns (phone/email/full_name/etc.) and FAILS if any is absent from
the registry. Gate on `TEST_DATABASE_URL` if it needs the DB, or use the static
drizzle `schema.ts` export (preferred — no DB needed).

### A10 — STOP inbound opt-out (§04 §5.3) — LOW URGENCY (SMS off at launch)
Inbound "STOP" SMS handling is unimplemented. The Twilio inbound webhook +
suppression write is mostly code (`src/lib/marketing/send/stop-suffix.ts` has the
outbound suffix). Mitigated because SMS is disabled at launch — **do this last**,
or leave for v1.5 with a one-line note. If done: add an inbound webhook handler
that matches STOP keywords → `recordConsent` opt-out + suppression.

---

## Phase B — LOW correctness

- **B1** `walkin_queue` → add to `src/lib/compliance/pii-table-registry.ts`
  (guest_name/guest_phone are PII) + a `redacted_at` column (migration) + include
  in the diner erasure cascade + a retention predicate.
- **B2** `marketing_consent_audit`: flip `shipped` true + fix the retention
  predicate that always throws (it's de-linked via diner FK SET NULL — handle the
  null case).
- **B3** grab-bag (each tiny, can be one commit "fix(misc): LOW-severity polish"):
  redact phone+body in the dev SMS fallback log; close the photo-cap TOCTOU
  (count inside the same tx/lock); apply the waitlist per-IP cap even when
  `x-forwarded-for` is absent (fall back to a coarse key); add a
  `prefers-reduced-motion` guard to the motion-heavy components; make the
  org `current_venue_count` a recount not ±1 in `removeVenueFromOrg`; fix
  `removeVenueFromOrg` to consider `seated` reservations + use venue-local date
  not UTC; set `campaign_version_id` on `marketing_sends` rows. (Nested segment
  DSL → defer to v1.5; note it.)

---

## Phase C — non-diner DSR (§13) — embeds a product default

**Problem:** DSR intake (`src/lib/compliance/dsr-actions.ts`) accepts
`identifier_email/phone`, but the erasure cascade only acts on rows reachable via
a `diner` row — pure prospects / event-request guests can't be erased on demand.
**Recommended approach (do this):** extend the cascade to also match by
`identifier_email`/`identifier_phone` across the non-diner PII tables already in
the registry (`prospect_waitlist`, `event_requests`, `marketing_consents`/
`suppressions`, `walkin_queue` after B1) and redact/anonymise them. **Alternative
(if the user prefers):** document a retention-only stance for non-diner subjects.
This is the one Phase item with a product judgment baked in — implement the
recommended cascade, and leave a clear note in the PR/commit that the user can
downgrade to retention-only. **Tests:** extend
`erasure-cascade.integration.test.ts` (D1) with a no-diner-row subject.

---

## Phase D — Wave 9 closure (the autonomous parts)

### D1 — make the erasure-cascade integration test runnable + green
`src/lib/compliance/__tests__/erasure-cascade.integration.test.ts` is gated by
`TEST_DATABASE_URL` (`SKIP` at line 23, `describe.skip` at 150). **Do:** run it
locally against the dev DB (`TEST_DATABASE_URL=$DATABASE_URL npx jest erasure-cascade.integration`),
fix anything it surfaces, and extend it to cover EVERY domain handler end-to-end
(the §13 cascade across diners/reservations/reviews/marketing/event-requests/
prospect-waitlist + the new non-diner path from Phase C). Document the one-command
local run in the test header. (CI wiring of the DB is an ops concern — out of
scope — but the test must pass locally.)

### D2 — integration sweep
Add focused integration tests for the cross-domain invariants the unit tests
don't cover: audit-cascade (a mutation writes the right `AUDIT.*` row), dunning
(soft_lock/read_only actually blocks the gated write paths — exercise a couple of
the Phase-2 NEW-5 sites), GDPR cascade (D1), and the WhatsApp TV904 gate. Group
under `src/**/__tests__/*.integration.test.ts`, `@jest-environment node`.

### D3 — automated a11y / Lighthouse pass + fixes
Use the Playwright MCP (available) to load the key public surfaces (`/`, a venue
page, `/pricing`, the booking widget) and the partner surfaces, run axe-core, and
fix violations (labels, contrast, focus order, `prefers-reduced-motion`). Capture
a short report in `docs/operations/`. Full Lighthouse perf budget is nice-to-have;
WCAG 2.2 AA correctness is the priority. (Cross-browser via Playwright
chromium/firefox/webkit.)

### D4 — draft `docs/operations/sub-processors.md`
Doesn't exist. Draft the sub-processor register (Resend, Twilio, Stripe, Supabase,
Cloudflare, Sentry) — purpose, data categories, location, DPA status column left
as "PENDING SIGNATURE". The user signs the actual DPAs (excluded); the document is
the deliverable.

### D5 — draft the conformance checklist
Create `docs/operations/launch-conformance-checklist.md` mapping each
ANPC/GDPR/PSD2/DSA/WCAG-2.2-AA requirement to its implementing code/file +
status. Audit the code against it as you fill it in; file any gaps found as new
Phase-A/B tasks. (The legal sign-off itself is the user's.)

---

## Suggested order
A1–A2 (security, no migration) → A8/A9 (jobs+test, no migration) → A3/A6/A7
(one migration batch 0050, apply locally) → A4/A5 → Phase C (+ D1 to test it) →
D1/D2 (tests) → B grab-bag → D4/D5 (docs) → D3 (a11y, last, needs the build).
Each task is independently committable; nothing here blocks on the user.

## Verification gate before declaring this handoff complete
`npx tsc --noEmit` clean · `npx eslint` 0 new errors · full `npx jest` green
(including the now-un-skipped D1 against a local `TEST_DATABASE_URL`) ·
`npm run build` clean. Update `MEMORY.md` + the project memory note. Leave the
push to the user.

---

## EXCLUDED — needs the user (do NOT attempt)
1. **DKIM / SPF / DMARC** warmup on the sending domain (DNS).
2. **DPAs signed** with each sub-processor (D4 drafts the register; signing is theirs).
3. **Stripe Tax registration in RO** confirmed (§12 §3.6.4).
4. **Apply migrations to prod** (0046–0049 already pending + any new 0050+ from Phase A) via psql + the 3-step bookkeeping.
5. **Stripe go-live config**: `seed:stripe-prices`, `STRIPE_PRICE_*` envs, webhook, `PARTNER_SIGNUP_ENABLED`, Coolify redeploy.
6. **Run `scripts/backfill-triggered-campaigns.ts`** against prod.
7. **`git push`** the local commits.
8. **Authenticated / live smoke verification** of the substrate-first partner surfaces (billing, multi-location, marketing, translations, reviews, floor-plan, analytics, staff/members, sign-up, diners, tables/live) — needs a live session + the standing test partner account, and final Stripe smoke. Code is verified by tsc/lint/build/tests only.
9. **Two confirm-intent decisions** (product judgment): reservations `ON DELETE CASCADE` hard-deletes booking history on venue delete (keep, or soft-delete?); `incomplete → full` billing grace (keep, or tighten?). Surface for a yes/no; don't change unilaterally.
