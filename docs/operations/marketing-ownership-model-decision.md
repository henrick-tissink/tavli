# Marketing ownership model — decision memo

**Date:** 2026-07-17 · **Method:** 6-lens analysis (deliverability, GDPR/compliance,
billing/MoR, platform infra, product/GTM, BYO-adversary) + synthesis, grounded in
the send path, schema, and billing code.

## Verdict

**Ship CENTRALIZED-MANAGED now** (it is exactly what the code already implements —
near-zero build delta). **Evolve to HYBRID/CONNECTED** (per-venue sub-identities
*under Tavli's own accounts*) later, **channel-by-channel, triggered by blast-radius
and tenant count — never scheduled**. **Never build BYO-credentials.**

Restaurants only ever touch **business-level** settings (brand, reply-to, quiet
hours, consent copy, content, and their diner list + consent attestation). Tavli
owns every provider account, domain, number, WhatsApp sender, and the
merchant-of-record relationship. All six lenses converged; the only live debate is
the *timing* of the hybrid migration, not its direction.

### Why not BYO
The Twilio RO regulatory bundle and Meta WhatsApp verification that bloodied a
technical founder become an 80%+ onboarding wall for non-technical restaurateurs.
BYO also buys **zero** GDPR-controller relief (controller/processor status doesn't
change with who holds the API key) while adding a tenant-secret custody surface the
schema doesn't have. Off the roadmap except as a bespoke enterprise SKU.

### The real design decision
Not managed-vs-BYO — that's settled. It's **reputation isolation timing**: keep one
shared `tavli.ro` sending identity (simple; one bad tenant hurts everyone; STOP is
global) vs. auto-provision per-venue subdomains/numbers *on Tavli's accounts*
(isolation, zero restaurant work). Answer: shared now, isolate when you onboard a
list you didn't build.

## Decision matrix

| Dimension | Launch (handful) | Scale (trigger) |
|---|---|---|
| **Email identity** | Shared `tavli.ro` + per-venue display name/reply-to (as coded). Point `MARKETING_FROM_EMAIL` at `mkt.tavli.ro` to wall marketing off from transactional. | Auto-provision per-venue subdomains (`x.mail.tavli.ro`): Resend create-domain → write DKIM/SPF/DMARC to Cloudflare via API → poll verify → new `email_sending_domain` column. Restaurant does nothing. |
| **Email IP reputation** | Accept shared Resend IP pool. | Dedicated IP only once volume sustains warmup (1000s/day). |
| **SMS number** | One shared Tavli `+40` two-way number under the software-SRL bundle (as coded). | Twilio subaccounts + per-venue RO numbers when carrier filtering / STOP pooling bites (~10–20 tenants). |
| **STOP scope** | Global (only carrier-compliant behavior on a shared number). But narrow `handle-inbound.ts` so a *marketing* STOP doesn't revoke *transactional* consent across orgs. | Per-venue numbers make STOP naturally tenant-scoped; liability dissolves. |
| **WhatsApp** | Deferred. Per-venue WABA columns already correct; concierge-provision when turned on. | Same per-venue model, done-for-them. Never self-serve Meta verification. |
| **Provider accounts** | Tavli owns all (Resend/Twilio/Meta/Stripe). Restaurants touch zero plumbing. | Unchanged. Optional "Connected" enterprise SKU only. |
| **Credential custody** | All secrets in server env; zero credential columns in `restaurant_marketing_settings`. Keep it that way. | Encrypted vault only if a BYO enterprise lane is ever built. |
| **Merchant of record** | Tavli (forced — usage runs on Tavli's own accounts). No Stripe Connect. | Unchanged; only the entity swap below. |
| **Legal entity** | Isolate a dedicated Tavli-namespaced Stripe account under the software SRL now (zero customers = cheapest). Brand = Tavli, honest footnote "operated by <Software SRL>, CUI…". Novation clause in ToS. | Incorporate Tavli SRL, its own Stripe account, migrate payment methods + re-create subs at a clean cut-over, novate contracts, re-home the RO bundle. |
| **Consent posture** | Restaurant = controller; Tavli = Art 28 processor **and** controller for the cross-tenant suppression list. Ship behind a per-restaurant DPA + import-time consent attestation + per-tenant kill switch. | Per-tenant numbers/subdomains shrink Tavli's joint-controller exposure. |

## Phase 0 — launch blockers (before first live campaign or charge)

1. **Resolve `automatic_tax` vs off-Stripe accountant.** `start-subscription.ts:120`
   sets `automatic_tax:{enabled:true}`, but `customers.create` (line 88) passes **no
   address** → invoices can't finalize. Decide VAT-registration of the software SRL:
   if not registered → flip to `enabled:false`, no-TVA invoices; if registered →
   enable Stripe Tax + RO registration **and** start capturing customer address.
   **This gates the Pro paywall, which gates the entire marketing module.** (verified)
2. **Set `tax_behavior:'exclusive'` on the overage invoice item** in
   `overage-reporter.ts:42` (currently omitted → Tavli eats TVA on marked-up usage).
   (verified)
3. **Per-restaurant Art 28 DPA** naming Resend/Twilio/Meta as subprocessors and
   disclosing the global suppression list.
4. **Signed "own-your-list" consent attestation** per launch restaurant.

## Phase 1 — ship centralized-managed (near-zero build)
Concierge onboarding = short call + intake form (brand name, reply-to, logo, legal
entity/CUI, address, phone/domain to represent). Build only the self-serve settings
screen bound to existing `restaurant_marketing_settings` columns + campaign
authoring. Email first (works today), SMS second (shared `+40`), WhatsApp off. Point
`MARKETING_FROM_EMAIL` at `mkt.tavli.ro`. Add an **admin per-tenant kill switch**.
Track a concierge-provisioning SLA so no Pro-paying venue sits unable to send.

## Phase 2 — cheap hardening while small
Import-time consent attestation gate (write real `marketing_consents` rows with
`source=csv_import` before any uploaded list is marketable — **verify the diner-import
path**). Narrow the STOP handler (marketing STOP ≠ transactional revoke cross-org).
Per-sending-identity bounce/complaint monitoring. Isolate the dedicated Tavli Stripe
account + add the ToS novation clause.

## Phase 3 — hybrid/connected, triggered not scheduled
Email first: build the Resend-create-domain + Cloudflare-DNS-write + verify-poll
pipeline + `email_sending_domain` column; migrate a tenant the moment you onboard a
list you don't fully trust. SMS next: Twilio subaccounts + per-venue RO numbers when
carrier filtering / STOP pooling bites — also makes STOP tenant-scoped. Every step
done-for-them via a "request my own sending identity" button that kicks off a
Tavli-run job — never a credential-paste flow.

## Phase 4 — entity graduation (post-traction)
Incorporate Tavli SRL, its own Stripe account, migrate payment methods + re-create
subs at a clean cut-over, novate contracts, re-point keys/webhooks, re-home the RO
regulatory bundle. Dedicated Resend IP once volume sustains warmup.

## What restaurants input vs. what Tavli owns

**Restaurants input:** display name + reply-to; brand assets; SMS sender label +
STOP shortcode copy (chosen from what Tavli provisioned); quiet hours +
confirmation-promo toggle; campaign content + consent-collection copy; their diner
list **with a per-import lawful-basis attestation**; business facts handed over once
(legal name/CUI, address, phone/domain to represent) as *inputs to Tavli's
provisioning*; a signed DPA + sending-policy acceptance. **Never:** API keys, DNS,
account creation, Twilio bundle, Meta verification.

**Tavli owns:** Resend Pro + the `tavli.ro` Cloudflare zone (+ subdomain automation
at scale); the shared `+40` number, its bundle, and the STOP webhook; the WhatsApp
BSP relationship + templates (per-venue WABAs by design); all provider secrets in
server env + rotation; Stripe MoR + the TVA decision; the global suppression list +
deliverability observability; the per-venue provisioning act itself; the migration
path to a future Tavli SRL account.

## Genuine forks for the founder (not settled)
- **Is the software SRL VAT-registered (plătitor de TVA)?** Decides the
  `automatic_tax` fork. Launch blocker.
- **Does `acct_1TbKdn…` also run the consultancy's billing?** If so, stand up a
  dedicated Tavli account under the same SRL before any live charge.
- **Charge live money before Tavli SRL exists, or run the first cohort free/off-Stripe?**
  Free avoids the entire entity-migration cleanup; card-on-file is a retention
  signal. Real strategic fork.
- **Appetite to build Twilio subaccount plumbing now?** Per-tenant numbers from
  tenant #1 give per-tenant STOP from day one and skip the global-suppression
  liability — at the cost of a regulatory bundle per number. (GDPR lens argues yes;
  product/infra lenses say wait.)
- **SMS margin:** has RO A2P wholesale + carrier surcharges been modeled against the
  6c retail overage? As MoR, Tavli absorbs provider price changes.

## Decisions locked — 2026-07-17

- **Software SRL is VAT-registered (plătitor de TVA).** → Keep
  `automatic_tax:{enabled:true}`; enable Stripe Tax + RO registration **and** add
  customer `address` capture in `start-subscription.ts` `customers.create`. Also set
  `tax_behavior:'exclusive'` on the overage invoice item (`overage-reporter.ts:42`).
- **First cohort runs FREE / off-Stripe** until Tavli SRL exists. → Because nobody
  is charged, the tax work above is **NOT a launch blocker** — it moves to
  *before the first live charge* (post entity graduation).

### Free-cohort entitlement — the comp path
The marketing gate (`marketing/actions.ts:43`) calls `loadActiveSubscription` and
requires a local `subscriptions` mirror row (`tier=pro`, status active/trialing,
non-null `stripe_customer_id`). There was **no comp path wired**. The only comp flag
that exists is `restaurants.pro_plan_active` (schema.ts:285 — **on `restaurants`, not
`organizations`**; previously orphaned, zero readers). **IMPLEMENTED 2026-07-17:**
added `orgHasProComp(orgId)` in `load-subscription.ts` and OR'd it into the 8 Pro
FEATURE gates (marketing ×3, dashboard + org analytics, photos, run-export,
weekly-summary), preserving each site's existing status-semantics and leaving
billing-mutation flows (change-plan, sync-extra-location, billing page) untouched
(they correctly still see "no subscription" for a comped org). Full Pro (all
features), per decision. Interim scope: entitlement is org-level but the flag is
per-restaurant, so "org comped" = ANY venue flagged — exactly org-level for the
single-venue cohort. Follow-up (Task #6): migrate to a clean org-level flag
(`organizations.pro_plan_active` or `comp_pro_until` for auto-expiry) via a
hand-authored migration. tsc + eslint clean; 5/5 marketing-gate tests green
(incl. comp-grants and comp-absent-blocks). Rejected alternative: a Stripe trial
(creates entity-migration baggage).

**To comp a cohort org:** `UPDATE restaurants SET pro_plan_active = true WHERE
organization_id = '<org>'` (or per venue). No Stripe involved.

Revised **Phase 0 launch blockers** (free cohort): (1) wire + verify the
`pro_plan_active` comp gate; (2) per-restaurant Art 28 DPA; (3) consent attestation
at list import. Tax/Stripe-Tax/address = *before first live charge*, not launch.

**Comp-flag implementation note (verified callers):** `loadActiveSubscription` feeds
BOTH entitlement gates AND billing-mutation flows (`change-plan.ts`,
`sync-extra-location.ts`, billing page). Do NOT inject a synthetic comp sub at the
load level — `sync-extra-location` would try to mutate a non-existent Stripe sub and
throw. Correct design: a separate `isProEntitled(orgId)` helper (`pro_plan_active`
OR active Pro sub) wired only into the ~8 gating sites (marketing ×3, dashboard +
org analytics, photos, run-export, weekly-summary), leaving billing-mutation on real
Stripe state. Scope call: comp orgs stay single-venue for now (multi-location gate is
billing-coupled; first cohort is single-venue).

## Transactional reminders/confirmations (added 2026-07-17)

Booking confirmations/reminders are CORE UX, a SEPARATE path from marketing, and NOT
Pro-gated:
- **Email:** `lib/email/send-transactional.ts` → Resend (already configured ✅).
  Works with the same account; no new infra.
- **SMS:** `lib/sms/send-transactional.ts` → Twilio `TWILIO_FROM_NUMBER`, gated
  per-restaurant by `transactional_sms_enabled` (TV201). Needs the Twilio account —
  the SAME one being created for marketing. This makes standing up Twilio CORE, not
  just a marketing nicety.

**Decision: ONE shared `+40` number for both transactional + marketing at launch**,
plus a STOP-handler fix. Rationale: today `handle-inbound.ts` revokes BOTH
`sms_marketing` AND `sms_transactional` consent on STOP — so on a shared number a
marketing STOP would also kill a guest's booking confirmations. Fix: a marketing STOP
must not revoke transactional consent. Then one number is safe + cheap (one
regulatory bundle). A dedicated transactional number is a later split.

New code follow-up: narrow `handle-inbound.ts` STOP scope (marketing ≠ transactional).

## Unresolved provenance note
The shared `+40` is registered to the software SRL, which is neither the data
controller (the restaurant) nor the future Tavli SRL — carrier-registered sender,
in-message brand, and data controller are three different entities. Contained at
concierge scale; close at entity graduation.
