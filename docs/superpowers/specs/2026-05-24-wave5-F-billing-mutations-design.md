# Wave 5 sub-unit F — §12 billing mutations (design)

> The subscription-mutation surface: cancellation + pro-rata annual refund
> (§10), tier swap Base↔Pro + frequency switch deferred to period-end
> (§8.2/§8.3), and per-additional-location quantity sync (§8.1) — which fills
> the forward-declared `venue-hooks` seam shipped in W5-A. **No keys** — all
> Stripe via injected client, unit-tested with mocks. UI surfaces (cancel
> screen, change-plan UI) deferred to §15/W5-E per the established pattern.

**Date:** 2026-05-24
**Build-order lines:** cancellation + pro-rata annual refund (§10); tier swap + frequency switch (§8.2/§8.3); per-location quantity sync (§8.1).
**Source:** `12-billing-and-subscriptions.md` §8.1, §8.2, §8.3, §10.1, §10.2.

## 1. Scope (build + unit-test; no keys)

### F.1 `src/lib/billing/sync-extra-location.ts` (§8.1) — fills the W5-A seam
`makeSyncExtraLocationQuantity(deps)` → `(orgId)`: `loadActiveSubscription`; bail
if null or `tier !== 'pro'`. Count live venues (`restaurants` where
`organizationId = orgId AND archivedAt IS NULL`). `extra = max(0, count - 3)`.
Find the `extra_location` subscription item: if absent and `extra > 0` →
`stripe.subscriptionItems.create({ subscription, price: priceIdForExtraLocation(freq),
quantity: extra, proration_behavior: 'create_prorations' })` + insert mirror; if
present and `quantity !== extra` → `stripe.subscriptionItems.update(...)` + update
mirror. Then **rewire `venue-hooks.ts`**: `onVenueAdded`/`onVenueRemoved` call
`syncExtraLocationQuantity(orgId)` (was no-op). W5-A's venue-action tests inject a
fake `billingHooks`, so they're unaffected.

### F.2 `src/lib/billing/cancel-subscription.ts` (§10)
`cancelSubscription({ organizationId, mode: 'period_end'|'immediate', reason?, actorUserId })`:
load active sub (assert status ∈ active/trialing/past_due/unpaid); for
`period_end` → `stripe.subscriptions.update(id, { cancel_at_period_end: true })` +
mirror `cancelAtPeriodEnd=true`; for `immediate` → `stripe.subscriptions.cancel(id)`
+ mirror status `cancelled` + `cancelledAt`. If annual + immediate + within paid
period → **pro-rata refund** (§10.2): `unused = (annual_paid_through - now) /
(annual_paid_through - current_period_start)`; `refundCents = round(amountPaid ×
unused)`; `stripe.refunds.create({ payment_intent, amount, reason:
'requested_by_customer' })` + audit `refund_issued`. Always: audit
`subscription_cancelled` (reason/feedback/mode). (Data-export-on-cancel trigger
→ §13/§07; out of scope here — a TODO seam.)

### F.3 `src/lib/billing/change-plan.ts` (§8.2/§8.3)
- `upgradeSubscriptionTier(orgId, 'pro')`: swap the `base_tier` item to the Pro
  price (`proration_behavior: 'create_prorations'`); if venue_count > 3 call
  syncExtraLocationQuantity; set `tier='pro'`; audit `subscription_upgraded`.
- `downgradeSubscriptionTier(orgId, 'base')`: **block (`TV1005`
  `downgrade_blocked_venue_count`)** if live venue_count > 1; else swap to Base price.
- `requestFrequencyChange(orgId, newFreq)`: set `pending_frequency_change`,
  `pending_frequency_effective_at = current_period_end`, requested_at/by; audit
  `frequency_change_requested`. `cancelPendingFrequencyChange(orgId)`: clear the
  four pending columns.
- Cron handler `applyPendingFrequencyChanges` (every 30 min): for subs where
  `pending_frequency_change IS NOT NULL AND pending_frequency_effective_at <= now()
  AND status='active'` → swap item prices to the new frequency, clear pending
  columns, set `frequency`, audit `frequency_changed`. Worker `boss.work` +
  `boss.schedule(JOBS.billing.applyPendingFrequencyChanges, "*/30 * * * *")`.

## 2. Out of scope
- Cancel/change-plan UI (§15/W5-E). Build the actions; the UI calls them later.
- Data-export-on-cancel (§07/§13 — TODO seam in cancelSubscription).
- Dunning + lifecycle jobs (W5-G).

## 3. Foundations registry
- TV1005 `downgrade_blocked_venue_count` already exists (§12 range). No new codes.
- AUDIT.billing.* (subscription_upgraded/cancelled, frequency_change_requested/
  changed, refund_issued) all exist. JOBS.billing.applyPendingFrequencyChanges exists.
- No migration (uses W5-B columns: pending_frequency_*, annual_paid_through, cancel_*).

## 4. Testing (no keys)
Jest + mocked Stripe + DI:
- sync-extra-location: pro w/ 5 venues → creates/updates extra item qty 2;
  base/null → no-op; qty unchanged → no Stripe call.
- cancel: period_end sets cancel_at_period_end; immediate sets cancelled;
  annual+immediate computes pro-rata refund + refund audit; status guard rejects.
- change-plan: upgrade swaps price + audit; downgrade with >1 venue → TV1005;
  requestFrequencyChange sets pending cols + audit; cancelPending clears them;
  applyPendingFrequencyChanges swaps + clears + audit.
- venue-hooks: onVenueAdded now delegates to syncExtraLocationQuantity.

## 5. Risks / notes
- **No keys:** injected Stripe; `priceIdForExtraLocation` throws without
  STRIPE_PRICE_* envs, but only reached on the pro+venue path at runtime (tests
  inject prices/mocks). Consistent with W5-C.
- Refund math uses `annual_paid_through` + `current_period_start` (W5-B columns).
- The §8.1 venue-count query uses `restaurants.organizationId` (exists in schema;
  local DB drift is a test-infra issue — unit tests mock the db).
