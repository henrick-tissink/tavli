# Marketing — production setup checklist

Everything required for the marketing send path (email + SMS + WhatsApp +
Stripe overage billing) to work **exactly as designed** in production.

Env var names are exactly as the code reads them. Webhook paths are relative to
your production origin. See also `official-launch-runbook.md` (demo → prod
cutover) and `AGENTS.md > Migrations`.

> **Deploy-blockers** (marketing is broken without these): the background
> **worker process**, `PGBOSS_DATABASE_URL` (direct connection), the
> `LINK_TRACKING_SECRET`, `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET`, Stripe keys
> + a Pro subscription per org, and a correct `NEXT_PUBLIC_APP_URL`. SMS adds
> Twilio + the inbound webhook; WhatsApp adds the full Meta/WABA + template path.

---

## 0. Already done

- Prod DB migrations applied through **0070** (`marketing_send_status` enum value
  `sending`; `marketing_sends.dedup_key` + partial unique index;
  `restaurant_marketing_settings.whatsapp_sender_e164`;
  `marketing_campaigns.whatsapp_content_sid`).
- Marketing-hardening code on `main`.

---

## 1. Supabase (database) — required

| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only |
| `DATABASE_URL` | pooled connection (app queries / Drizzle) |
| `PGBOSS_DATABASE_URL` | **direct/session connection on `:5432`, NOT the transaction pooler `:6543`** |

⚠️ pg-boss needs `LISTEN/NOTIFY`; the transaction-mode pooler drops it and the
worker silently stops processing jobs. This is the #1 silent failure.

---

## 2. Background worker — required (most-missed)

A **separate, long-running process**:

```
WORKER_MODE=true tsx scripts/worker.ts      # = npm run worker:start
```

Needs `PGBOSS_DATABASE_URL` (direct). Without the worker, campaigns queue but
**nothing ever sends, attributes, bills, or runs the crons**:

- `marketing.computeAttribution` — every 5 min
- `marketing.monthlyOverageBilling` — 1st of month 02:00 UTC
- `marketing.usageAlert` — hourly
- `marketing.purgeOldLinkClicks` — nightly

The web app only *enqueues*; the worker does the work.

---

## 3. App secrets / origins — required

| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SITE_URL` | canonical prod origin |
| `NEXT_PUBLIC_APP_URL` | origin used to build `/u` (unsubscribe) and `/c` (click) links in emails — wrong value = broken links |
| `LINK_TRACKING_SECRET` | `openssl rand -base64 32`; HMAC-signs `/u` and `/c` tokens. **Required in prod — the code throws without it.** |
| `CRON_SECRET` | Vercel/Coolify cron auth |
| `IMPERSONATION_COOKIE_SECRET` | AES-256-GCM key (32B base64) |

---

## 4. Resend (email) — required

| Var | Notes |
|-----|-------|
| `RESEND_API_KEY` | |
| `MARKETING_FROM_EMAIL` | marketing sender; falls back to `EMAIL_FROM`, then platform default |
| `EMAIL_FROM` | transactional sender |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret from the webhook config |

Steps:

1. **Verify the sending domain** (SPF + DKIM + DMARC) for the From address.
2. Add a webhook → **`POST /api/webhooks/resend`**, copy its signing secret into
   `RESEND_WEBHOOK_SECRET`. Without it: no delivery/bounce/open tracking and no
   auto-suppression on bounce/complaint.
3. Subscribe events: `email.sent`, `email.delivered`, `email.bounced`,
   `email.complained`, `email.failed`, **`email.opened`** (enable open-tracking
   on the domain for the open-rate metric to populate).

---

## 5. Twilio SMS — required for SMS

| Var | Notes |
|-----|-------|
| `TWILIO_ACCOUNT_SID` | EU-provisioned project (ANPC/GDPR) |
| `TWILIO_AUTH_TOKEN` | server-only |
| `TWILIO_SMS_FROM` | **bare E.164, inbound-capable** (must receive `STOP`/`START` — an alphanumeric sender ID can't, which breaks legal opt-out) |
| `TWILIO_FROM_NUMBER` | separate sender for the transactional-SMS path |

Steps:

1. Status callback on the number → **`POST /api/webhooks/twilio-sms-status`**.
2. Inbound message webhook → **`POST /api/webhooks/twilio-inbound`** (honors
   STOP/START opt-outs — legally required once SMS is enabled).

---

## 6. Twilio WhatsApp — required for WhatsApp (longest lead time — start first)

External Meta/Twilio approvals **plus** per-venue data.

- **Meta Business verification** + a **WhatsApp Business Account (WABA)** + a
  registered WhatsApp **sender phone number**.
- **Meta-approved message templates**, created as **Twilio Content templates** →
  each yields a **Content SID (`HX…`)**.
  **v1 supports variable-free templates only** (no `{{1}}` placeholders yet —
  `contentVariables` is not wired).

| Var | Notes |
|-----|-------|
| `TWILIO_WHATSAPP_FROM` | **bare E.164** platform fallback. Do **not** prefix with `whatsapp:` — the code adds it. |

- Per **campaign**: set the **Content SID** in the new campaign form's "Approved
  WhatsApp template" field. Campaigns without one are blocked from sending (by
  design — freeform body is never sent).
- Per **venue** (see §8): `whatsapp_enabled=true`, `whatsapp_business_account_id`,
  `whatsapp_phone_number_id`, and `whatsapp_sender_e164` (venue's WABA number,
  E.164). All four required or WhatsApp hard-fails (`TV904`).

---

## 7. Stripe — required (marketing is **Pro-tier-gated**; no Stripe = no marketing)

| Var | Notes |
|-----|-------|
| `STRIPE_SECRET_KEY` | server-only |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | |
| `STRIPE_WEBHOOK_SECRET` | per-environment |
| `STRIPE_PRICE_BASE_MONTHLY` / `STRIPE_PRICE_BASE_ANNUAL` | seeded |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL` | seeded |
| `STRIPE_PRICE_EXTRA_LOCATION_MONTHLY` / `_ANNUAL` | seeded |
| `STRIPE_PRICE_SMS_OVERAGE` / `STRIPE_PRICE_WHATSAPP_OVERAGE` | seeded |

Steps:

1. `npm run seed:stripe-prices` (live key) → populates the price IDs; verify with
   `npm run verify:stripe-prices`.
2. Webhook → **`POST /api/webhooks/stripe`** (`setup_intent.succeeded`,
   `subscription.updated`, `invoice.payment_failed`).
3. **Register Stripe Tax for Romania** — TVA is applied on overage invoice items
   at finalization.
4. Each org needs an **active Pro subscription** and a **Stripe customer**
   (`subscriptions.stripe_customer_id`) for overage to bill; orgs without a
   customer are skipped cleanly. Marketing actions reject non-Pro orgs.

Overage allowances: email / in-confirmation 1000/mo, SMS / WhatsApp 250/mo per
org; hard cap = allowance × 5. Overage is billed as a one-off invoice item
(SMS €0.06, WhatsApp €0.03 per message).

---

## 8. Per-venue config — `restaurant_marketing_settings`

These columns are wired into sending but **have no partner-facing UI yet** —
populate via DB/admin until that UI ships.

| Column | Purpose |
|--------|---------|
| `email_sender_name`, `email_reply_to` | per-venue email identity |
| `sms_enabled`, `sms_sender_id`, `sms_stop_shortcode` | per-venue SMS sender + STOP keyword |
| `whatsapp_enabled`, `whatsapp_business_account_id`, `whatsapp_phone_number_id`, `whatsapp_sender_e164` | per-venue WhatsApp (all required for WA) |
| `quiet_hours_start_local`, `quiet_hours_end_local` | default 21:00–10:00 venue-local |

Org-level: `organizations.marketing_frequency_cap_per_month` (default 4).

---

## 9. Sentry — strongly recommended

`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`,
`SENTRY_TRACES_SAMPLE_RATE`, and build-time `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN`. Wire it into the worker too (`OTEL_SERVICE_NAME=tavli-worker`).

---

## 10. Post-deploy smoke test

1. Worker is running — jobs drain, cron schedules registered.
2. One-off **email** campaign → send row goes `queued → sending → sent`, then the
   Resend webhook flips it to `delivered` / `opened`.
3. **SMS** test → arrives with the STOP suffix; reply `STOP` → suppression
   recorded (inbound webhook).
4. **WhatsApp** test with an approved Content SID → delivered from the venue WABA
   number.
5. Overage scenario (or wait for the 1st-of-month cron) → exactly one invoice
   item; a retry does not double it.
6. Click a tracked link → 302 redirect + click recorded; a forged `/c` link → 404.

---

## Webhook endpoints (summary)

| Provider | Endpoint | Secret |
|----------|----------|--------|
| Resend | `POST /api/webhooks/resend` | `RESEND_WEBHOOK_SECRET` |
| Twilio SMS status | `POST /api/webhooks/twilio-sms-status` | `X-Twilio-Signature` (auth token) |
| Twilio inbound (STOP/START) | `POST /api/webhooks/twilio-inbound` | `X-Twilio-Signature` |
| Stripe | `POST /api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
