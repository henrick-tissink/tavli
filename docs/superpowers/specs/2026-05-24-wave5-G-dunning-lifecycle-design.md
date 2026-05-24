# Wave 5 sub-unit G — §12 tiered dunning + lifecycle jobs (design)

> The dunning state machine + access-tier computation (§11.5) and the §12 §13
> operational jobs. Closes Wave 5. **No keys** — pure logic + cron handlers,
> unit-tested; the nightly Stripe reconcile uses an injected client (mocked).

**Date:** 2026-05-24
**Build-order line:** §12 tiered dunning — day 0–6 full / day 7 soft-lock / day 21 read-only (§11.5).
**Source:** `12-billing-and-subscriptions.md` §11, §13.

## 1. Scope (build + unit-test; no keys)

### G.1 Dunning access tier (§11.5) — the build-order line
- **`src/lib/billing/dunning.ts`** — pure `computeBillingAccess({ status, pastDueSince, now })`
  → `'full' | 'soft_lock' | 'read_only'`:
  - status `active`/`trialing` → `full`.
  - status `past_due`: days 0–6 → `full`; day ≥ 7 → `soft_lock`.
  - status `unpaid` → `read_only`.
  - status `cancelled` (immediate) → `read_only` (grace), else `full` until period end.
  Diner protection (§11.6): this gates the **operator portal** only; diner-facing
  booking is never blocked (callers apply it to operator writes, not booking flow).
- **`loadBillingAccess(orgId)`** — reads the subscription mirror (status +
  status_synced_at as the `past_due_since` proxy) → returns the access tier via
  `computeBillingAccess`. `React.cache()`-memoized like `loadActiveSubscription`;
  returns `'full'` for orgs with no subscription (free-tier, unconstrained).
  This is the contract enforcement points (photo upload, campaign send, settings)
  consult; wiring into each consumer is adopted incrementally (like
  `loadActiveSubscription`) — not a blanket middleware change in this sub-unit.
- **`enforceDunningTier` cron** (every 6 h) — walk `past_due` subscriptions; when
  `now - status_synced_at >= 21 days`, transition status → `unpaid` (+ audit
  `subscription_updated` after_status `unpaid`). Days 7–20 stay `past_due`
  (soft-lock is computed at read time, not a status change).

### G.2 §13 lifecycle jobs (complete the §12 operational surface)
Registry keys already exist (`JOBS.billing.*`):
- **`expireOrphanIncomplete`** (hourly) — delete `incomplete` subscriptions with
  no payment method older than 24 h (§6.1 cleanup).
- **`archiveCancelledOrgs`** (nightly) — for orgs cancelled > 30 days, set
  `organizations.status = 'suspended'` (§10.3). (`'archived'` enum value not yet
  added — deferred; suspended is the v1 terminal handled state.)
- **`syncStripeSubscription`** (nightly) — defence-in-depth: re-fetch each active
  subscription from Stripe (injected client) and reconcile the mirror status;
  log drift. Bypasses the §3.5 cache.

Worker wiring: `boss.work` + `boss.schedule` for all four (6 h / hourly /
nightly / nightly per §13 table).

## 2. Out of scope
- Wiring `loadBillingAccess` into every operator write (photo/campaign/settings)
  — adopted incrementally by those domains, like `loadActiveSubscription`.
- Past-due/trial banners (UI — §15/W5-E).
- `organizations.status = 'archived'` true-hard-delete (§10.3 90-day path) — the
  retention purge (§13) owns it; out of Wave 5.

## 3. Foundations registry
- AUDIT.billing.subscription_updated exists. JOBS.billing.{enforceDunningTier,
  expireOrphanIncomplete, archiveCancelledOrgs, syncStripeSubscription} all exist.
- No migration (uses W5-B columns + existing org_status enum).

## 4. Testing (no keys)
- `computeBillingAccess`: full/soft_lock/read_only across status + day boundaries (6/7/21).
- `loadBillingAccess`: maps mirror status → tier; null subscription → 'full'.
- `enforceDunningTier`: transitions a >21-day past_due to unpaid + audit; leaves day-10 past_due alone.
- lifecycle jobs: expireOrphanIncomplete deletes the right rows; archiveCancelledOrgs suspends; syncStripeSubscription reconciles a drifted mirror (mocked Stripe).

## 5. Risks / notes
- `past_due_since` proxy = `status_synced_at` (set when W5-D flips status). Good
  enough for v1; a dedicated column could refine it later.
- `syncStripeSubscription` needs the Stripe API (injected; nightly, worker-side);
  no key → it throws at run time on prod until configured (acceptable; it's a
  reconcile backstop, not a request-path dependency).
