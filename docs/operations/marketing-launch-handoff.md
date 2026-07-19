# Marketing launch — session handoff

**As of:** 2026-07-04 · **Branch:** `main` (all work merged + pushed) · **Owner:** Henrick

Picks up a guided marketing-launch effort. Code hardening is **done and on
`main`**; the prod DB migrations are **already applied**. What remains is
**deploying `main`** and **third-party account setup**, which we're partway
through walking through interactively.

---

## TL;DR

The marketing subsystem was adversarially audited and production-hardened.
All fixes are committed (`main`, commit `9049431`). The two supporting DB
migrations are already applied to the prod Supabase database and verified.
Next up: deploy `main`, then set up Resend → Stripe → Twilio SMS → Twilio
WhatsApp. We paused right before starting **Resend** (on the free tier).

---

## What's DONE

### Code — on `main` (commit `9049431`)
Two adversarial passes: a prod-readiness audit (20 confirmed issues, 9 blockers)
and a review of the fix diff itself (10 follow-ups). All addressed:

- **Send idempotency:** atomic `queued→sending` claim before any provider call;
  `dedup_key` + partial unique index (fan-out keys on diner, triggered on
  occurrence); Resend per-send idempotency key; retry-safe fan-out enqueue.
- **Sender identity/env:** reads `TWILIO_SMS_FROM` (no alphanumeric default),
  distinct `TWILIO_WHATSAPP_FROM`, `MARKETING_FROM_EMAIL ?? EMAIL_FROM`; applies
  per-venue email name / reply-to / SMS sender / STOP shortcode.
- **WhatsApp (full):** per-venue WABA sender + Twilio Content-template sending +
  campaign gating (no approved template ⇒ not sendable; freeform never sent).
- **Webhooks:** Resend + Twilio status webhooks now update `marketing_sends`
  (delivered/opened/bounced/complained/failed), guarded against clobbering
  terminal states.
- **Billing:** overage `singletonKey` + Stripe idempotency key (no double invoice
  items on retry).
- **Compliance:** `/c` redirect gated on a valid token (no open redirect);
  freq-cap off-by-one fixed; re-opt-in lifts only the prior unsubscribe.

Verification: 180+ unit tests pass, `tsc` clean, eslint clean.

### Prod database — Supabase project `yldmpbecmlkjugljxgww`
- Migrations **0069** (`marketing_send_status` enum value `sending`) and **0070**
  (`marketing_sends.dedup_key` + partial unique index,
  `restaurant_marketing_settings.whatsapp_sender_e164`,
  `marketing_campaigns.whatsapp_content_sid`) **applied + verified**. Drizzle
  bookkeeping rows 70/71 inserted; prod schema is at 0070.
- ⚠️ **`.env.local`, `.env.prod`, and `.env.demo` all point at this SAME single
  Supabase project.** There is effectively one DB and it IS prod. Applied via the
  session-mode pooler (`:5432`) so `ALTER TYPE ADD VALUE` ran in autocommit.

---

## Decisions made this session

- **WhatsApp scope:** FULL — per-venue sending identity + Meta-approved Content
  templates (not deferred / not gated-off).
- **Per-venue sender identity:** wire it NOW. Columns exist and are used by the
  send path, but there is **no partner UI** to set them yet → populate
  `restaurant_marketing_settings` via DB/admin for now.
- **Business email:** DEFERRED — not needed for MVP. Use a **personal Gmail** for
  all third-party signups. Campaigns are SENT via **Resend** (which needs the
  `tavli.ro` domain verified in DNS — that is NOT a mailbox). Optional 5-min €0
  nicety: free email forwarding (Cloudflare Email Routing / registrar) for
  `hello@tavli.ro → Gmail` so replies aren't lost. A real mailbox (Zoho — must
  use the **EU data center `zoho.eu`**, one-way choice) is only worth revisiting
  when doing WhatsApp, since Meta business verification prefers a domain email.
- **Resend plan:** **Pro account already in place** (supersedes the earlier
  free-tier plan) — no 3,000/mo cap, and multiple domains can be hosted on the one
  account. `tavli.ro` domain **added + DNS verified via the Cloudflare one-click
  integration** (DKIM + SPF/return-path + verification token all resolving; EU
  region). Remaining Resend work: create the prod API key (`RESEND_API_KEY`) and,
  after deploy, the status webhook (`RESEND_WEBHOOK_SECRET`). DMARC not yet set —
  add `p=none` before the first real campaign.

---

## Where we PAUSED

**Update 2026-07-17:** `tavli.ro` prod app is **not deployed** (only
`demo.tavli.ro` is live, on the shared services). DNS is on **Cloudflare**. No
third-party accounts existed except **Resend (Pro)**.

- ✅ **Resend `tavli.ro` domain fully VERIFIED** — DKIM (TXT), SPF (MX + TXT) all
  green. (Earlier DKIM failure was a stale pre-existing Cloudflare record; fixed
  manually, Resend re-checked OK.) Prod `RESEND_API_KEY` created and stored in
  gitignored `.env.local` (also destined for Coolify). Domain id
  `4a65b7cc-4a5b-4c4b-852c-ace7f164934f`.
- ⏭️ Deferred: `RESEND_WEBHOOK_SECRET` (needs deployed prod origin) and DMARC
  `p=none` (add before first real campaign).

- ✅ **Stripe prices SEEDED + verified (test mode)** — reused existing account
  `acct_1TbKdnPCxIhZi9xN` (country RO, email hltissink@gmail.com; sandbox key
  `sk_test_…` in `.env.local`). Ran `seed-stripe-prices.ts` → 8 EUR prices created
  (were 0 before), all 8 `STRIPE_PRICE_*` IDs written to `.env.local`,
  `verify-stripe-prices.ts` green (all `tax_behavior:'exclusive'`). Account is
  test-only so far: `charges_enabled:false`, `details_submitted:false`, and
  `default_currency:ron` (harmless — prices are explicit EUR).
- ⏭️ Remaining Stripe: enable **Stripe Tax for Romania** (dashboard), webhook
  `STRIPE_WEBHOOK_SECRET` (after deploy), Pro subscription + customer per org
  (with venue data), then swap `sk_test_`→`sk_live_` after completing account
  activation.

**Local-tooling gotchas (hit this session, for future script runs):**
- Working copy had **no `node_modules`** — run `npm ci` first.
- This Next version **vendors `server-only`** (only `next/dist/compiled/server-only`
  exists; not a top-level pkg / not in the lockfile), so `tsx` scripts importing
  `@/lib/stripe/client` fail with `Cannot find module 'server-only'`. Fix: a local
  no-op shim at `node_modules/server-only/` (gitignored). Build/Next runtime is
  unaffected — this is a plain-tsx-only gap.
- `tsx` doesn't auto-load `.env.local`. Run scripts as
  `node --env-file=.env.local node_modules/.bin/tsx scripts/<x>.ts`.

Next action: enable **Stripe Tax (Romania)** in the dashboard, then move to
**Twilio SMS** (Step 4). WhatsApp/Meta (Step 5) is the long pole — start its
business verification early.

---

## Remaining setup (ordered) — full detail in `marketing-launch-checklist.md`

1. **Deploy `main`** — web + **worker** services on Coolify (Hetzner).
2. **Resend** — verify `tavli.ro` (DKIM/SPF/return-path), `RESEND_API_KEY`,
   webhook → `/api/webhooks/resend` + `RESEND_WEBHOOK_SECRET`.
3. **Stripe** — keys, `npm run seed:stripe-prices` (8 price IDs), webhook →
   `/api/webhooks/stripe`, register Stripe Tax for Romania, Pro subscription +
   customer per org.
4. **Twilio SMS** — EU project, buy an inbound-capable number, status webhook →
   `/api/webhooks/twilio-sms-status`, inbound webhook →
   `/api/webhooks/twilio-inbound`.
5. **Twilio WhatsApp (long pole — start early)** — Meta business verification,
   WABA + registered sender, approved Content templates (`HX…` SIDs).
6. **Per-venue data + smoke tests** — populate `restaurant_marketing_settings`,
   then run the §10 smoke test in the checklist.

---

## Known code follow-ups (found during setup)

- **Twilio delivery-status callbacks are not wired into the send path.**
  `senders.ts` calls `twilio.messages.create({ to, from, body|contentSid })` with
  **no `statusCallback`** and **no Messaging Service**, so
  `/api/webhooks/twilio-sms-status` never receives outbound SMS/WhatsApp receipts
  → `marketing_sends` never flips to `delivered`/`failed` for those channels
  (email is fine — Resend webhook covers it). Sending + STOP handling are
  unaffected. Fix: pass `statusCallback: <appOrigin>/api/webhooks/twilio-sms-status`
  on the create calls (or send via a Messaging Service with a service-level status
  callback). Needs the deployed prod origin, so it lands with the webhook wiring
  step. Low risk, observability-only.
- **`automatic_tax: { enabled: true }` in `start-subscription.ts:120`** requires
  Stripe Tax to be active. Decision this launch: taxes handled off-Stripe via the
  SRL's accountant, so Stripe Tax is NOT being enabled → the first live Pro
  subscription will error unless this is flipped to `enabled:false` (or Stripe Tax
  is turned on after all). Resolve before creating the first live subscription.

## Critical gotchas (don't relearn these the hard way)

- **The background worker is mandatory:** `WORKER_MODE=true tsx scripts/worker.ts`
  as a separate Coolify service. Nothing sends/attributes/bills/crons without it.
- **`PGBOSS_DATABASE_URL` must be the DIRECT/session connection (`:5432`)**, never
  the transaction pooler (`:6543`) — pg-boss needs `LISTEN/NOTIFY`.
- **`LINK_TRACKING_SECRET` is required in prod** (`openssl rand -base64 32`) — the
  code throws without it (signs `/u` and `/c` tokens).
- Prod env vars live in **Coolify**, on **both** the web and worker services.
- **Marketing is Pro-tier gated** — an org with no active Stripe Pro subscription
  can't use marketing at all.
- **`TWILIO_WHATSAPP_FROM` is a bare E.164** (the code adds the `whatsapp:` prefix).
- Migrations are **hand-authored** — `drizzle-kit generate` is banned (see
  `AGENTS.md`); hash = `sha256(file)`, `created_at` = journal `when`,
  `id = journal_idx + 1` in `drizzle.__drizzle_migrations`.

---

## Key references
- `docs/operations/marketing-launch-checklist.md` — full third-party setup checklist
- `docs/operations/official-launch-runbook.md` — demo → prod cutover runbook
- `AGENTS.md` — migration policy, "this is not the Next.js you know"
