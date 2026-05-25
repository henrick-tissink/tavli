# Tavli v1 — Round-3 Adversarial Audit + Remediation (2026-05-25)

> Seven domain auditors swept §00–§15 against the code at HEAD `2241da8` (the
> launch-readiness handoff). Findings independently hand-verified before fixing.
> This is round 3 (after the 18-finding adversarial audit + the round-2
> conformance sweep). Remediation done TDD, each fix its own commit on `main`.

## Gate after remediation
`tsc` 0 errors · full `jest` **1495 passed / 2 skipped / 0 failed** · 0 new lint errors.
Migrations added: **0053** (reviews diner_id backfill), **0054** (capacity advisory lock).

## FIXED (20 commits, `514c611..418f84b`)

### Launch-blocking CRITICALs
- **C1 one-off campaign crash** (`514c611`) — `compileSegmentFilter([])` threw TV900 on every UI-created one-off; segment-less = broadcast to all opted-in diners (consent enforced per-recipient downstream).
- **C2 reviews unreachable by GDPR erasure** (`0af997a`) — submit now stamps `diner_id`; migration 0053 backfills.
- **C3 reviews never counted toward rating** (`5db1ff8`) — wired the §05 §4.5 aggregate-consent checkbox + `aggregate_consent_at`.
- **C4 invited staff locked out** (`1052ad2`) — `acceptStaffInvitation` promotes `profiles.role` consumer→restaurant_owner in the claim tx.
- **C5 cross-window capacity overbook race** (`4c78e9f`) — `(restaurant,date)` advisory xact lock (migration 0054); verified against the live DB.

### HIGH / MEDIUM correctness
- Live-view host lockout — operational ops gate on `table.update` not `floor_plan.edit` (`3f882b5`).
- Marketing `List-Unsubscribe` header + email link tracking + `LINK_TRACKING_SECRET` fail-closed (`95c2b28`) — `signSendToken` finally has a producer.
- Cross-org PII read on the diner page — loader org-scoped (`a50734f`).
- Billing: sparse `subscription.updated` no longer nulls annual-refund columns (`b6a2005`).
- Review-submit §4.1 rules — visit-occurred + 30-day window (TV402) + audit + per-IP rate limit (`3072e0f`).
- Pro features gated on paying/trialing status (photo cap + analytics) via `isProFeatureActive` (`ce4d0a7`).
- Marketing conversion attribution scoped to the one clicked send (`ee74482`).
- Billing frequency switch re-prices the `extra_location` item too (`d56264f`).
- Free-text cancel `feedback` kept out of the 7-yr fiscal log (`89753e7`).
- Registry-completeness guard now scans `notes`/`comment`/`message` columns (`00686f3`).
- `AUDIT.user.created` emitted on partner signup (`4594299`).
- BNR `rate_stale_critical` audit, runs even when the fetch fails (`418f84b`).

## DEBUNKED (no fix — auditor was wrong)
- **Admin MFA "not mandatory" (HIGH)** — FALSE. Next 16 renamed Middleware→**Proxy**; `src/proxy.ts` forces admin enrolment (`nextLevel==='aal1'`→`/admin/security?enrol=required`) + the AAL2 gate. The auditor searched for `middleware.ts`.
- **Menu-limit TV302 (MED)** — N/A. Data model is 1 menu/restaurant (1:1 `menus`); multi-menu isn't built (documented deferral), so a Base venue is always ≤2.

## DEFERRED — large greenfield features (flagged v1/v1.5; not bugs)
Per product decision, NOT built this round:
- §08 table↔reservation assignment lifecycle + live-view assignment UI (the audit's "C6/C7"); `reservation_status_log` + status history; modify-by-link; reservation/table background jobs (auto-no-show, reminders, turn-time aggregates).
- §06 owner-responses-to-reviews + edit + revision history; DSA statement-of-reasons email.
- §11 end-to-end triggered SMS + transactional-SMS consent capture; marketing overage → Stripe metering (`Billing.meterEvents`); in-confirmation upsell.
- §13 `restrict_processing`/`object` DSR fulfilment (`diners.processing_restricted` column).

## REMAINING small tail (LOW / needs-decision / infra / content)
- `addVenueToOrg`/`reactivateVenue` blind `+1` vs authoritative recount (LOW; nightly reconcile self-heals; not cleanly unit-testable — `sql` is fully mocked in the harness).
- `serverActions.allowedOrigins` unset (needs the exact prod domains).
- Impersonation cookie TTL 4h vs spec's 15min (deliberate support-UX tradeoff — confirm intent).
- `billing-lifecycle` nightly reconcile syncs only `status`, not period columns (defense-in-depth for refund inputs).
- §14 Pro `first_campaigns` setup step never created (internal /setups tooling; multi-site hook).
- DE legal pages missing (content/translation task, not code).
- At-risk/quota alert sinks are `console.log` stubs (needs the real Sentry/ops notification wiring; the BNR critical-staleness audit now routes through the same future seam).
