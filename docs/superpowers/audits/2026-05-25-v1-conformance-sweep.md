# Tavli v1 — Conformance + Wave-Completeness Sweep (2026-05-25, round 2)

> Seven adversarial conformance auditors swept the codebase at HEAD `ea74cb9` (after the
> 18-finding remediation), scoped by domain to the §00–§15 architecture specs + build-order.
> Focus: (1) re-verify the 18 prior fixes hold, (2) spec/architecture conformance, (3) wave
> completeness vs build-order, (4) fresh adversarial code review. The three top-severity NEW
> findings below were independently re-verified by hand. **Triage before fixing.**

## Remediation progress (2026-05-25)
**3 verified criticals FIXED + committed** (TDD, full suite green at 1363 passed): NEW-3 table IDOR
(`43ca23c`), NEW-1 Stripe current_period drift incl. refund payment-intent + pending-frequency cascade
(`134e286`), NEW-2 marketing double-insert (`7a8b6ce`). **Remaining:** HIGH conformance (NEW-4–11),
the three feature builds (signup/invite, triggered campaigns+SMS, §08 table-ops), MED/LOW cleanup +
non-diner DSR — all confirmed in v1 scope by the user; the feature builds warrant their own planned sessions.

## Re-verification of the 18 prior fixes

**17 of 18 HOLD.** One regressed — not by my change, but by a Stripe SDK shape the original code never matched:

- #1 diner IDOR ✅ · #2 migration rollback IDOR ✅ · #4/#5/#12 GDPR handlers ✅ · #6 FK constraint ✅ ·
  #7 pricing hash ✅ · #8/#9 turn-time trigger ✅ (exhaustively reproduced: overlap-block, UPDATE
  enforcement, self-exclusion, terminal-status exemption, FOR-UPDATE serialisation) · #10 dunning clock ✅ ·
  #11 webhook idempotency ✅ · #13/#15/#18 marketing ✅ · #14 freq-cap ✅ logic (but its input is poisoned by NEW-2).
- **#3 annual pro-rata refund — RE-OPENED (CRITICAL).** See NEW-1.

## NEW — CRITICAL (verified by hand)

**NEW-1 [incomplete-fix] Stripe SDK drift silently re-kills the annual refund (and more).**
`stripe@22.1.1` (API `2026-04-22.dahlia`) **removed `current_period_start`/`current_period_end` from the
Subscription object** — they now live on `subscription.items.data[].current_period_*`
(verified: absent from `node_modules/stripe/esm/resources/Subscriptions.d.ts` interface body; present at
`SubscriptionItems.d.ts:50,54`). `stripe-webhook-router.ts` reads them off the top-level subscription via
untyped casts → `undefined` → `null`. So `currentPeriodStart`/`annualPaidThrough` are written null, the
refund branch (`cancel-subscription.ts:84`) never fires, and **a real annual customer who cancels mid-term
is still refunded €0** (the original #3). The unit tests pass only because their fixtures use the *old* wire
shape. Cascades: (NEW-1b) pending monthly↔annual frequency changes never apply (`pendingFrequencyEffectiveAt`
= null → the `lte(...,now())` filter never matches); (NEW-1c) `cancel-subscription.ts` reads
`invoice.payment_intent`, also moved in this API gen, so even with NEW-1 fixed the refund target can't be
resolved. **Root cause is systemic:** §12 was built against the spec's older Stripe shapes; a full pass
reconciling every Stripe field/method against the installed `.d.ts` is warranted (overage uses the removed
`createUsageRecord` too — see NEW-9). **Fix:** read period fields from `items.data[0]`; fix fixtures; resolve
the PaymentIntent via the current Invoice payments shape.

**NEW-2 [code-defect] Every marketing send writes TWO `marketing_sends` rows; the first is orphaned.**
`fan-out.ts` / `fire-triggered.ts` INSERT a `queued` row and enqueue `sendMessage({sendId})`. The leaf
(`send-message-handler.ts`) loads that row only to read it, then calls `senders.sendEmail/Sms/Whatsapp(input)`
→ `dispatch()` (`send/senders.ts:79`) which **INSERTs a brand-new row** (`MarketingSendInput` has no `sendId`).
The fan-out row stays `queued` forever; a second row goes `sent`. Consequences: the #14 frequency cap counts
the orphans (under-sends), quota/analytics double-count, click/unsubscribe attribution lands on whichever row
the link carries. **Fix:** the leaf must UPDATE the pre-inserted row by `sendId` (run policy → deliver →
update), not INSERT a new one.

**NEW-3 [code-defect] Cross-tenant IDOR in table/section mutate + archive.**
`src/lib/tables/actions.ts` `updateTable`/`archiveTable`/`updateSection`/`archiveSection` gate
`can('floor_plan.edit', {restaurantId})` on the **client-supplied** `restaurantId`, but the UPDATE/DELETE keys
on the client-supplied row `id` with **no `WHERE restaurant_id` scoping** (e.g. `:114`). A user who owns venue
A passes `{restaurantId: A, id: <table in venue B>}` → edits/archives another tenant's floor plan. Identical
class to the already-fixed #1/#2 — this file was missed. Found independently by two auditors + hand-verified.
**Fix:** load the row's `restaurant_id`, assert it equals the gated restaurant, scope the write by both.

## NEW — HIGH

- **NEW-4 [conformance-gap] Admin MFA is not actually mandatory.** `admin/sign-in/actions.ts:134-145`: an admin
  with zero enrolled TOTP factors signs straight to `/admin` at AAL1 with full admin power; the gated layout
  checks only `role==='admin'`, never AAL2/enrolment. Spec §01 §5a.2 requires sign-in to refuse without an
  enrolled factor. (Impersonation itself does require AAL2, so blast radius = all admin tooling except impersonation.)
- **NEW-5 [conformance-gap] Dunning soft-lock / read-only is display-only.** `loadBillingAccess` is consumed
  only by `billing/page.tsx`; no write path (bookings, campaigns, settings, photo upload) gates on it, and it
  doesn't query `cancelled` orgs. §12 §11.5 day-7 soft-lock / day-21 read-only and the §10.3 30-day post-cancel
  grace are unenforced — a delinquent/cancelled operator keeps full write access.
- **NEW-6 [conformance-gap] `authentication_required` never routes to `incomplete`.** `stripe-webhook-router.ts:161-169`
  unconditionally sets `past_due` on `invoice.payment_failed`. §12 §6.3/§7.3 require SCA-step-up (day-91 MIT)
  to enter `incomplete` (→ 3DS hosted-invoice path). EU customers needing step-up get dunning emails instead of a 3DS link.
- **NEW-7 [conformance-gap] `billing_audit_log` survives GDPR erasure.** Live, 7-year-retained table holding
  operator/diner PII in `context`; registry marks it `shipped:false`, no handler, no `redacted_at`. §13 §6.3.j
  context-replacement unimplemented. Compounded by `recordBillingAudit` bypassing `assertNoSensitiveKeys`
  (writes operator free-text cancel `feedback` into the fiscal record).
- **NEW-8 [conformance-gap] Marketing cross-channel dedup (§11 §8.4 step 6) absent.** Fan-out emits one send per
  diner row with no de-dup on shared email/phone → "one human, two messages" + double cap/quota burn.
- **NEW-9 [conformance-gap] Marketing overage computed but never billed.** `monthly-overage.ts` enqueues
  `JOBS.billing.reportMarketingOverage`; **no worker handler is registered** for it → Pro overage never reaches
  Stripe (revenue leak). The spec's `subscriptionItems.createUsageRecord` is also gone in this SDK (→ `Billing.meterEvents`).
- **NEW-10 [conformance-gap] Triggered-campaign engine is dead end-to-end.** The five triggered campaigns (marquee
  §11 §6 feature) have a consumer (`fireTriggeredCampaign`) but **no seed creates campaign rows and no §02/§03
  event emitter enqueues the job** → they can never fire.
- **NEW-11 [conformance-gap] `revealPiiBatch` is never invoked.** The §03 §5.5 PII-access audit ("one row per
  bulk PII reveal", ANPC defensibility) is dead code — `searchDiners`/`getDinerProfile` return PII without routing
  through it. 0 call sites outside tests.

## NEW / PERSISTING — MEDIUM
- Diner aggregate jobs (`recompute-aggregates`, `frequency-bucket-rebalance`) + `diner_pii_access_log` 24-mo purge are unwired/unscheduled → Pro segmentation reads empty `frequency_bucket`/`visit_count`; PII log grows unbounded.
- `diner_pii_access_log`-style upsert race in `findOrCreateDinerForReservation` (SELECT-then-INSERT, not the spec's atomic ON CONFLICT) → concurrent first-bookings silently lose diner linkage.
- SMS consent check unscoped by org + no unique index on `marketing_consents(org,diner,channel)` → `.limit(1)` nondeterministic.
- STOP-keyword inbound opt-out unimplemented (§04 §5.3) — mitigated: SMS is off by default at launch.
- Quiet-hours SKIPS (drops the message) instead of DEFERRING/rescheduling (§11 §10.3).
- `onSubscriptionCreated` unguarded by `wasEventApplied` + can regress status on replay (partially defeats #10 on that path).
- `recordBillingAudit` bypasses `assertNoSensitiveKeys` (7-yr fiscal log; see NEW-7).
- `fn_seed_setup_progress` SECURITY INVOKER + unpinned search_path (the sibling trigger was fixed in 0049; this one missed) + writes RLS-protected `setup_progress` → fails for any future non-owner restaurant insert.
- `setup_progress` unique index is NULLS-DISTINCT → org-level (NULL restaurant_id) steps won't dedup.
- Reservation status mutations (`markNoShow`/`markSeated`) + several partner actions scope by `currentUserPrimaryRestaurant` instead of `can()` → role distinctions (matrix) unenforced (no cross-tenant write, but no least-privilege).
- The registry-completeness test only checks internal consistency of present entries — it does NOT fail when a PII-bearing table is omitted (why walkin_queue/billing_audit_log slipped). Add a schema-introspection test.

## NEW / PERSISTING — LOW
- `walkin_queue` PII not in registry / no redacted_at / no retention (latent — 0 rows, no write path yet).
- `marketing_consent_audit` live but `shipped:false`, retention predicate always throws (de-linked via diner FK SET NULL).
- Dev SMS fallback logs full phone+body; photo-cap TOCTOU; waitlist per-IP cap skipped when XFF absent; no `prefers-reduced-motion` guard; venue-count rollup is ±1 not a recount; `removeVenueFromOrg` guard ignores `seated` + uses UTC date; segment DSL is single-level not nested; sends never set `campaign_version_id`.

## DECISIONS NEEDED (v1 scope, not bugs)
1. **Triggered campaigns + SMS + in-confirmation upsell** — engine substrate exists, end-to-end wiring doesn't (NEW-10). Ship in v1 or cut + remove the UI claims?
2. **Operator self-serve sign-up + staff-invitation flow (§01 §5/§6) are entirely unbuilt** — every operator must be admin-provisioned; "up to 5 staff accounts" cannot be fulfilled in-product. Intended for v1?
3. **Non-diner DSR (§13):** pure prospects / event-request guests (no diner row) can't be erased on-demand, only by time-retention. Pass DSR identifier_email/phone into the cascade, or document retention-only?
4. **§08 table-ops:** walk-in queue / combine-split / live view / status-transition UI are substrate-only. v1 or v1.5?
5. **Dunning enforcement (NEW-5):** wire `loadBillingAccess` into write paths for v1, or accept display-only?

## Doc-drift (corrected in build-order.md this session)
build-order.md was last updated 2026-05-21 and was **backwards**: §15 pricing P3–P5 marked `[ ]` are all SHIPPED;
three "deferred post-v1" notes (translations editor, floor-plan canvas, partner review surface) are false;
Wave 9 closure is genuinely **0/8** and is the real launch gate (no sub-processors.md/DPAs, no Lighthouse/axe,
no Stripe Tax RO confirmation, the erasure integration test is CI-skipped). Features are ~complete; compliance/ops closure is not.

## Suggested remediation order
1. Verified criticals: NEW-3 (table IDOR — same quick pattern as #1/#2), NEW-1+1b+1c (Stripe period/PI fields), NEW-2 (marketing single-row).
2. Then NEW-4 (admin MFA), NEW-7 (billing_audit_log erasure), NEW-5/6 (dunning enforce + SCA route).
3. Scope decisions (NEW-10, signup/invite, non-diner DSR, table-ops).
4. MED/LOW cleanup pass + the registry-completeness test.
