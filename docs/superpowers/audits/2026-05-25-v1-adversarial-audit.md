# Tavli v1 — Adversarial Audit (2026-05-25)

> Six read-only adversarial auditors swept the codebase at the v1-complete milestone
> (HEAD `dcf7a69`): security/authz, billing/money, GDPR/PII, data/migrations/triggers,
> domain-logic, frontend/a11y. Findings deduped + severity-ranked below. tsc/eslint/
> build/jest were all green — these are correctness/security/compliance defects that
> compile and pass tests. **Triage before fixing.** Items marked **[DECISION]** need a
> product/architecture call, not just a code change.

## CRITICAL — fix before any public launch

1. **Cross-tenant IDOR in diner merge/split** — `src/app/partner/(dashboard)/diners/actions.ts`
   `mergeDinersAction` (:55, delete at :130) and `splitDinerAction` (:174) only call
   `auth.getUser()`; the only org check is that the two diners share an org, NOT that the
   *caller* belongs to it. Any authenticated user can repoint/merge/**delete** another org's
   diners + reservations + reviews. **Fix:** gate with `can(session, …, { kind:"organization",
   id: source.organizationId })` (or membership check) before the mutation. *(Verified.)*

2. **Cross-tenant destructive IDOR in migration rollback** —
   `src/app/partner/(dashboard)/setup/migration-actions.ts:65-97` `can()` is checked against the
   *client-supplied* `restaurantId`, but the `DELETE` keys solely off the client-supplied
   `migrationImportId` (never verified to belong to that restaurant). An operator can delete
   another venue's reservations by passing its import id. **Fix:** load
   `migration_imports.restaurant_id`, verify it equals the gated restaurant, scope the DELETE by both.

3. **Annual pro-rata refunds are structurally dead** — `src/lib/billing/cancel-subscription.ts:84,98`
   The refund branch is gated on `currentPeriodStart` + `annualPaidThrough`, but **no production
   path ever writes those columns** (`start-subscription.ts`, `stripe-webhook-router.ts` set only
   `currentPeriodEnd`). The unit test hand-injects them, masking it. A real annual customer who
   cancels mid-term is silently refunded €0 — breaks the §10.2 contractual promise. **Fix:** populate
   `currentPeriodStart`/`annualPaidThrough` from Stripe in the subscription webhook + start path.

4. **`marketing_sends` PII survives GDPR erasure AND retention** —
   `src/lib/compliance/pii-table-registry.ts:262` (`shipped:false, handler:null`) +
   `retention.ts:111` (`anonymise` action throws). The table stores plaintext diner email/phone
   (`fan-out.ts:89`), retained 1095 days, never erased on a DSR, never purged. The verification
   sweep is blind to it too (`verify.ts:32`). **Fix:** ship the handler (null/delete email+phone by
   `diner_id`), implement `anonymise` or switch the policy to `hard_delete`, add a real verification query.

5. **`prospect_waitlist` is absent from the compliance layer** — `src/lib/db/schema.ts:2238`
   New §15 table holds `email` + `source_ip` (and a `redacted_at` column signalling intent), but it's
   in no registry/handler/retention/verification, and the DSR cascade resolves subjects via `diners`
   only — a prospect has no diner row, so erasure can never reach them. **Fix:** add a registry entry +
   handler keyed on `lower(email)` + a retention/invite-expiry purge. *(Mine — §15 P4. I own this fix.)*

6. **`chk_admin_manual_has_owner` deadlocks its own FK** — `drizzle/migrations/0045_pricing.sql:9`
   The CHECK requires `admin_manual` rows to have `fetched_by_user_id IS NOT NULL`, but that FK is
   `ON DELETE SET NULL`. Deleting an admin who set a manual FX override aborts the delete (auditor
   reproduced the live error) — making the admin undeletable and breaking any auth-user erasure cascade.
   **Fix:** change the FK to `ON DELETE RESTRICT` (+ expire overrides first) or relax the CHECK for
   expired overrides. *(Mine — §15 P1. Needs a follow-up migration.)*

7. **Pricing frequency toggle clobbers all URL hashes on mount** —
   `src/components/pricing/FrequencyPricing.tsx:80` The projection effect runs on mount (freq=monthly)
   and `replaceState`s the hash to `#monthly` whenever it isn't already — so `/pricing#faq` (the
   "cancel anytime" deep-link from `CardOnFileDisclosure`) is rewritten before it can scroll, and every
   plain visit gets a spurious `#monthly`. **Fix:** only write the hash on an actual user toggle (guard
   with a `userToggled` ref / skip first render); never touch an unrelated existing hash. *(Mine — §15 P3.)*

8. **[DECISION] Slot capacity ignores occupancy duration** —
   `drizzle/migrations/0016_slot_concurrency.sql:44` Capacity counts only reservations at the *exact
   same* `reservation_time`; a 19:00 party still seated doesn't count against 19:30. With per-slot
   capacity this systematically over-books a real dining room. **Decision needed:** is single-seating-
   per-slot the intended model? If not, model turn-time and sum party_size over overlapping intervals.

## HIGH

9. **Capacity trigger is INSERT-only — UPDATEs bypass it** — `0016_slot_concurrency.sql`
   Flipping `cancelled→confirmed`, raising `party_size`, or moving date/time skips the capacity check →
   overbooking via edit/reinstate. **Fix:** `BEFORE INSERT OR UPDATE OF status,party_size,date,time`.

10. **Dunning clock resets on every `subscription.updated`** — `stripe-webhook-router.ts:57`
    `statusSyncedAt = now()` is stamped unconditionally; Stripe emits `updated` for many non-status
    reasons (quantity sync, cancel-at-period-end, card changes), so a delinquent org's day-7/day-21
    counter keeps resetting and never reaches read-only. **Fix:** only stamp when `status` actually changed.

11. **Revenue/refund audit writes lack idempotency guards** — `stripe-webhook-router.ts:112,256,267,189`
    `onInvoice`/`onChargeRefunded`/`onDispute`/`onSetupIntentSucceeded` don't call `wasEventApplied`, so a
    replay double-inserts `payment_succeeded`/`refund_issued` audit rows (and re-sends the PSD2 consent
    email). **Fix:** add the layer-2 guard to these handlers.

12. **`event_requests` PII has no erasure path** — heavy PII (guest_name/email/phone, dietary notes),
    keyed by `requested_by_user_id`, never reached by the diner-keyed cascade; no `redacted_at`, no
    retention. **Fix:** add `redacted_at` + handler matching guest_email/phone + a retention policy.

13. **`sendCampaignAction` has no state guard → duplicate sends** — `src/app/partner/marketing/actions.ts:112`
    No `status='draft'` predicate; a `sent`/`sending` campaign can be re-sent (fan-out re-inserts all
    `marketing_sends`), and two concurrent calls both enqueue. **Fix:** `WHERE … AND status='draft'`,
    check rowCount before enqueue. *(Mine — #2.3.)*

14. **Marketing frequency-cap is non-atomic** — `src/lib/marketing/send/policy.ts:79`
    Cap counts rows with `sent_at >= month-start`; fan-out inserts as `queued` (no `sent_at`), so a batch
    of concurrent leaf sends to one diner all pass the cap before any flips to `sent`. **Fix:** count
    queued+sent in-window, or reserve atomically.

15. **Fan-out OFFSET pagination drifts** — `src/lib/marketing/fan-out.ts:78`
    `LIMIT/OFFSET` across self-re-enqueued chunks over a *live* segment skips/duplicates recipients when
    the diner set changes between chunks. **Fix:** keyset-paginate on `d.id > lastId`, or snapshot at send.

16. **Drizzle meta frozen at snapshot 0028** — `drizzle/migrations/meta/`
    46 journal entries but only 29 snapshots; `drizzle-kit generate` would emit a giant phantom migration
    (and some journal `when` timestamps are hand-edited/backward). **Fix:** regenerate/commit snapshots
    0029–0045, or document that `drizzle-kit generate` is banned and schema.ts is descriptive-only.

17. **EN/DE pricing pages render under `<html lang="ro">`** — no `src/app/{en,de}/layout.tsx`; WCAG 3.1.1
    failure + degraded SEO on the trilingual routes. **Fix:** per-segment layouts setting `lang`. *(Mine — §15 P3.)*

18. **Marketing on/off toggle has no accessible name** — `MarketingManager.tsx:82` slider button has only
    `aria-pressed`; SR users hear "button, pressed" with no campaign name. WCAG 4.1.2. **Fix:** `aria-label`
    referencing the campaign. *(Mine — #2.3.)*

## MEDIUM (selected)
- Webhook layer-1 commits `webhook_events` before the handler runs → crash-partial events on unguarded
  handlers can't retry cleanly (`src/lib/webhooks/handle.ts:59`). Consider same-tx insert.
- `computeBillingAccess` maps `incomplete → full` (day-91 payment never succeeded yet full access) — `dunning.ts:28`.
- No downgrade-to-Base cleanup of the `extra_location` item (`change-plan.ts` / `sync-extra-location.ts`).
- `recordBillingAudit` bypasses the `assertNoSensitiveKeys` guard on the 7-year-retained `billing_audit_log` (`billing-audit.ts:43`).
- `setup_progress` unique index is NULLS-DISTINCT → org-level (NULL restaurant_id) steps won't dedup (`0044:28`).
- Trigger functions are SECURITY INVOKER with no pinned `search_path` (`reservations_check_capacity`, `fn_seed_setup_progress`, etc.).
- `fn_seed_setup_progress` (INVOKER) writes RLS-protected `setup_progress` — fails for any future non-owner `authenticated` restaurant insert.
- `computeSlots` silently drops overnight windows (close ≤ open) → late-night venues show zero slots (`availability.ts:41`).
- `removeVenueFromOrg` future-reservation guard ignores `seated` + uses UTC `current_date` (`venue-actions.ts:165`).
- `previewSegmentSizeAction` over-counts vs fan-out (ignores null-identifier diners) (`marketing/actions.ts:133`). *(Mine — #2b.)*
- WaitlistButton modal: no focus trap / focus restore (reuse `BottomSheet`) (`WaitlistButton.tsx`). *(Mine — §15 P4.)*
- VenueSwitcher `role="listbox"` not keyboard-operable (drop roles or implement the pattern) (`VenueSwitcher.tsx`). *(Mine — #2a.)*
- Translations/NewCampaignForm tablists lack `aria-controls`/roving tabindex. *(Mine.)*
- Marketing usage banner uses raw `amber-*` palette instead of house tokens (`marketing/page.tsx:136`). *(Mine — #2b.)*

## LOW (selected)
- `LINK_TRACKING_SECRET` dev-fallback should fail closed in production (`marketing/tokens.ts:10`).
- Waitlist per-IP rate-limit skipped when `x-forwarded-for` absent (`pricing/actions.ts:28`). *(Mine — §15 P4.)*
- `SegmentBuilder` uses array index as React key for mutable rows (`SegmentBuilder.tsx:122`). *(Mine — #2b.)*
- No `prefers-reduced-motion` guard on pricing entrance animations. *(Mine — §15.)*
- Hardcoded `€` in cancel-refund toast instead of `formatEur` (`CancelSubscriptionSheet.tsx:48`). *(Mine — #2.1.)*
- `reservations.restaurant_id ON DELETE CASCADE` hard-deletes historical reservations on venue delete (confirm intent).
- Dev SMS fallback logs full phone+body to console (`sms/send-transactional.ts:272`).
- `pricing.refreshCurrencyRates` cron uses a fixed UTC offset assuming summer (EEST); fine in winter, slightly early.

## What the auditors confirmed solid
Webhook signature verification (Stripe/Resend/Twilio, constant-time, idempotent ingest); segment-DSL
SQL is fully parameterised (no injection); `can()`/org-resolver derives roles from membership and denies
unknown orgs; AES-GCM crypto + impersonation/active-venue cookies validated; RFC 8058 unsubscribe is
GET-safe/POST-revokes; consent→suppression→cap→quota→quiet-hours policy ordering; diner erasure cascade
atomicity + send-email-before-handlers ordering; private exports bucket + 24h signed URLs; year-one
pricing totals + `tax_behavior:'exclusive'` + 90-day trial cadence + overage unit costs; worker
job/cron wiring (no orphan handlers); trilingual key completeness + no competitor names + JSON-LD
`<` escaping; `BottomSheet` is a correct focus-trapping dialog; RSC/client boundaries on the new surfaces.

## Suggested remediation order
1. **Security CRITICALs #1–#2** (IDOR) — small, unambiguous, highest risk.
2. **GDPR CRITICALs #4–#5 + HIGH #12** (erasure coverage) — legal exposure; partly mine.
3. **Billing CRITICAL #3 + HIGH #10–#11** (refunds dead, dunning reset, audit idempotency).
4. **Data CRITICAL #6** (constraint deadlock — needs a migration) + **HIGH #9** (UPDATE capacity).
5. **Frontend CRITICAL #7 + HIGH #17–#18** (hash clobber, lang, toggle a11y) — mostly mine, quick.
6. **#8 (slot duration)** + **#16 (drizzle meta)** — need decisions first.
7. Mediums/Lows as a cleanup pass.
