# 04 — Diner Communication (Transactional)

> Every email, SMS, and (rarely) WhatsApp message we send to a *diner* as a direct consequence of their booking — confirmations, reminders, modifications, cancellations, post-visit review requests, self-serve link emails. **Strictly transactional.** Marketing campaigns triggered by diner events (welcome series, no-show follow-up, etc.) live in §11 — they're conceptually similar but live under different consent rules, frequency caps, and analytics.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §6.5 RFC 8058 (transactional emails omit `List-Unsubscribe`), §6.6 `webhook_events` (shared idempotency surface for Resend + Twilio webhooks), §7.1 SMS wrapper (E.164 + per-locale quiet hours + STOP-keyword inbound), §11 (locale resolution + ICU MessageFormat), §15a.1 GDPR erasure (`redacted_at` null-the-columns pattern, NOT in-place regex), §16.1 ERROR_CODES (TV200–TV299 owned here).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars) — i18n-driven templates, send entry point, SMS scope, locale resolution, multi-channel send strategy
- [4. Templates — full catalogue](#4-templates--full-catalogue)
- [5. Audit + monitoring](#5-audit--monitoring) — `transactional_email_log`, Resend webhook, Twilio webhook
- [6. APIs / interfaces](#6-apis--interfaces) — `sendTransactionalEmail`, `sendTransactionalSms`, locale resolver, iCal
- [7. Background jobs](#7-background-jobs)
- [8. Compliance & audit hooks](#8-compliance--audit-hooks)
- [9. Build sequence](#9-build-sequence)
- [10. Open questions](#10-open-questions)
- [11. Cross-references](#11-cross-references)

## 1. Scope

This domain owns: the templates, the locale resolution, the send orchestration, the per-channel transport, and the per-message audit trail for transactional diner communications.

It does **not** own: marketing campaigns (→ §11), staff-facing emails (handled inline by §01 invitation flow, §10 corporate-events flow, etc.), or partner alerts (e.g., `PartnerBookingAlertEmail` already exists and is owned by §02 lifecycle).

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped. Inline notes flag partial state.

From LFC §1 Tavli (Base) — Diner communication:
- [ ] Automated confirmation emails (RO / EN / DE) *(RO template exists at `ReservationConfirmationEmail`; EN/DE land via the i18n catalogue in step 3 of the build sequence)*
- [ ] Automated 24h reminder emails (RO / EN / DE) *(no reminder template exists; arrives in build step 6)*
- [ ] Self-serve modify / cancel links *(cancel link exists in `cancel_reservation_by_token` RPC and emits the `reservation_cancelled_by_diner` email per §4 templates table; modify link arrives in §02 build step 8)*
- [ ] Allergy / occasion / seating-preference capture at booking and visible the moment a diner walks in *(capture is §02 form work; this domain ensures the confirmation email reflects what was captured via the typed `ReservationConfirmationProps` in §4.2)*

Indirect:
- [ ] Post-visit thank-you / review request *(template exists at `PostVisitReviewEmail`; this doc covers transactional usage. §11 covers it as a marketing campaign — same template, different orchestrators)*

## 2. Current state

Confirmed against the codebase 2026-05-20:

**Exists:**
- `src/lib/email/resend.ts` — Resend wrapper. Console fallback when `RESEND_API_KEY` unset.
- `src/emails/ReservationConfirmationEmail.tsx` — RO only.
- `src/emails/PostVisitReviewEmail.tsx` — RO only.
- `src/emails/EventRequestAcceptedEmail.tsx` — RO only.
- `src/emails/InvitationEmail.tsx` — RO only.
- `src/emails/PartnerBookingAlertEmail.tsx` — RO only.
- Subject lines hardcoded in the action that sends the email (search for the string literals in `src/app/api/reservations/actions.ts`; line numbers drift, the pattern is `subject: '...'`).
- `@react-email/render@2.0.7` + `@react-email/components@1.0.12` — produces HTML + plain-text from React components.
- `EMAIL_FROM` env var: `"Tavli <hello@tavli.ro>"`.
- Cron `/api/cron/post-visit-emails/route.ts` sends the review request 4h after the slot end time, RO only.

**Missing:**
- No `ReservationReminderEmail` template (the 24h pre-arrival).
- No `ReservationModifiedEmail` template.
- No `ReservationCancelledEmail` template. The `cancel_reservation_by_token` RPC currently writes the status change but does NOT call the email wrapper (confirmed in `src/app/reservations/[token]/actions.ts` — the action just returns after the DB call). Build step 8 wires the `reservation_cancelled_by_diner` email send via `sendTransactionalEmail` post-cancel.
- No EN or DE versions of any template.
- No locale resolution helper — every template hardcodes RO copy.
- No shared `<EmailShell>` layout component — each template re-implements its own chrome.
- No SMS sends.
- No deliverability monitoring (Resend webhook handler to record bounces/complaints is missing).
- No per-diner email send audit. §11 covers marketing-send audit via its own `marketing_sends` table; this doc adds the transactional equivalent (`transactional_email_log`, §5.1).

## 3. Architectural pillars

### 3.1 Templates are i18n-driven, not duplicated

We do **not** create `ReservationConfirmationEmailRO`, `…EN`, `…DE`. We have one `ReservationConfirmationEmail` component that takes a `locale` prop. All strings come from the `next-intl` message catalogue (per `00-foundations.md` §11). Templates are layout + composition; copy lives in `src/messages/<locale>/emails.json`.

### 3.2 Send is one entry point

Every transactional email goes through `sendTransactionalEmail({ to, locale, template, props })`. This wrapper:
1. Resolves the template component.
2. Renders to HTML + plain-text via `@react-email/render`.
3. Computes the subject from the message catalogue (`emails.<template>.subject` key).
4. Sets the right headers. **Transactional emails do not include `List-Unsubscribe`** (per foundations §6.5 — RFC 8058 one-click applies to marketing only). Marketing emails (sent by §11) include both `mailto:` and HTTPS one-click variants. **Classification.** Transactional: pre-arrival reminders, reservation confirmations, modify/cancel notifications, data-export-ready, deletion-confirmed, billing notices, password resets. **Also transactional:** post-visit review requests (sent as part of fulfilling the booking contract — contract necessity under GDPR Art 6(1)(b), not the marketing lawful basis).
5. Calls Resend with proper from/reply-to.
6. Writes an audit row to `transactional_email_log` (§5).
7. Returns success or surfaces a Resend error to the caller.

The caller (server action, job, cron) calls this wrapper; never instantiates a React Email component directly.

**Environment variables consumed by this domain:**

| Env var | Purpose | Default |
|---|---|---|
| `RESEND_API_KEY` | Resend transport credential. When unset, the wrapper console-logs the rendered HTML instead of sending. | unset in dev |
| `RESEND_WEBHOOK_SECRET` | HMAC-SHA256 secret for verifying inbound Resend webhooks (§5.2). | required in prod |
| `EMAIL_FROM` | From-line, e.g. `"Tavli <hello@tavli.ro>"`. | required |
| `EMAIL_REPLY_TO_DEFAULT` | Fallback Reply-To when a restaurant has no email on file. | `support@tavli.ro` |
| `EMAIL_DEV_FORCED_RECIPIENT` | When set, all transactional emails route to this address instead of the real recipient; original recipient surfaced in an `X-Tavli-Original-Recipient` header. Avoids accidentally emailing real diners during local dev. | unset (must be unset in prod) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` | Twilio transactional SMS credentials (per foundations §7). | required when any restaurant flips `transactional_sms_enabled` on |
| `TWILIO_WEBHOOK_SIGNING_SECRET` | Twilio signature verification for §5.3 webhook + STOP-keyword inbound. | required in prod |

### 3.3 Transactional SMS — built in v1, off by default; enabled in v1.5

**Refined position (replaces "deferred to v1.5").** The earlier pre-release note ("drop transactional SMS for v1") was too broad — it would contradict the locked spec line "Automated 24h reminder emails RO/EN/DE" by silently sliding SMS reminders out of scope.

Concrete scope:

| Capability | v1 | v1.5 |
|---|---|---|
| Email reminders (transactional + Base tier — the locked spec line) | **shipped** | — |
| Email confirmation / modified / cancelled | **shipped** | — |
| SMS templates (the React/text components + locale catalogues) | **built** | — |
| `sendTransactionalSms` wrapper + Twilio call path | **built + integration-tested** | — |
| Per-restaurant `transactional_sms_enabled` toggle (DB + UI) | **built** | — |
| Default value of `transactional_sms_enabled` | **`false` everywhere** (no diner receives SMS at launch) | flipped to `true` default for new restaurants; existing opt-in flow surfaces in the partner portal settings |
| Diner-side `consent_transactional_sms` checkbox on booking form | **built**, defaults unchecked | unchanged |
| WhatsApp transactional sends | out of scope (Meta template approval too heavyweight) | re-evaluate |

This aligns v1 with the locked spec: email reminders are live, SMS is wired up but dormant until v1.5 — and any pilot restaurant who explicitly asks can be flipped on individually via a tavli-admin toggle. The cost vs. "fully deferred" is small (~0.5 day for the gating logic) and the benefit is large (no per-restaurant emergency rebuild when v1.5 lands, no contradiction with the spec line).

### 3.4 Locale resolution order

For a transactional message to a specific diner:

1. If the diner has a persistent record (`diners` table from §03) → use `diners.locale`.
2. Otherwise, use `reservations.locale` (captured at booking time per §02).
3. Otherwise, use the restaurant's default locale (`restaurants.locale`; default `'ro'`). This column is owned by §05 (added in §05 build step 2).
4. Otherwise, fall back to `'ro'`.

Implementation in `src/lib/email/resolve-locale.ts`.

### 3.5 Send strategy — multi-channel semantics

For a single transactional event (e.g., reservation confirmation), multiple channels may fire. The rules:

**Transactional sends:**
1. **Always send email if `diner.email` is present.** Email is the primary channel; transactional email ignores the marketing suppression list.
2. **Also send SMS — in parallel** — if all of:
   - `diner.consent_transactional_sms = true` (explicit opt-in at booking, default off), AND
   - `restaurants.transactional_sms_enabled = true` (per-restaurant gate, default off at v1 per §3.3).
3. **SMS is parallel, never a fallback for email.** An email bounce does NOT auto-trigger SMS recovery. The two channels carry independent consent: a diner who opted into transactional SMS chose SMS, not "SMS only if email fails." Conversely, a diner whose email bounces but who did not opt into SMS gets no recovery — staff sees the bounce in the partner portal and can phone them directly.
4. WhatsApp transactional — out of scope (Meta template approval cost; see §3.3).

**Marketing sends (§11):**
- One channel per send, chosen by the campaign builder. A "welcome series" email campaign and a "welcome series" SMS campaign are two distinct campaigns with their own consents and analytics.

Rationale: blending channels mid-campaign collapses attribution analysis and makes consent revocation incoherent. The transactional case is the only place parallel multi-channel makes sense, because the *event* is the unit, not the *channel*.

## 4. Templates — full catalogue

Each template is one React component + entries in the message catalogue under `emails.<template_key>`.

| Template key | Trigger | Channel(s) | Recipient | Variant per locale |
|---|---|---|---|---|
| `reservation_confirmation` | reservation created | email (always), SMS (if opt-in + restaurant enabled) | diner | RO / EN / DE |
| `reservation_reminder_24h` | pg-boss job 24h before slot | email (always), SMS (if opt-in) | diner | RO / EN / DE |
| `reservation_modified` | reservation modified (by diner or staff) | email | diner | RO / EN / DE |
| `reservation_cancelled_by_diner` | diner cancels via token | email | diner | RO / EN / DE |
| `reservation_cancelled_by_restaurant` | staff cancels with reason | email | diner | RO / EN / DE; subject + body include the structured reason's guest-facing message |
| `reservation_post_visit_review_request` | pg-boss job 4h after completed visit | email | diner | RO / EN / DE |
| `reservation_no_show_followup` | n/a in this doc — §11 marketing campaign | — | — | — |
| `reservation_modify_link` | diner clicks "edit my booking" in any email | n/a — link in body, not separate email | — | — |
| `data_export_ready` | diner requests data export via §13 flow | email | diner | RO / EN / DE |
| `data_deletion_confirmed` | diner anonymisation completed | email | diner | RO / EN / DE |
| `trial_ending_30d` | pg-boss `billing.send-reminder-day-60` (day-60 of 90 = 30d before billing) | email | partner | RO / EN / DE |
| `trial_ending_15d` | pg-boss `billing.send-reminder-day-75` | email | partner | RO / EN / DE |
| `trial_ending_5d` | pg-boss `billing.send-reminder-day-85` | email | partner | RO / EN / DE |
| `payment_failed` | webhook `invoice.payment_failed` | email | partner | RO / EN / DE |
| `refund_issued` | webhook `charge.refunded` | email | partner | RO / EN / DE |
| `subscription_cancelled` | server action `cancelSubscription` (§12) | email | partner | RO / EN / DE |
| `photo_export_ready` | §05 §9.1.1 Pro bulk-photo-export job | email | partner | RO / EN / DE |
| `analytics_export_ready` | §07 §8 CSV-export job completion (`ExportReadyEmail`) | email | partner | RO / EN / DE |
| `analytics_weekly_summary` | §07 §9 weekly digest, Sundays 20:00 restaurant-local (`WeeklySummaryEmail`) | email | partner | RO / EN / DE |

The three `trial_ending_*` templates have **different urgency, different recommended actions**:
- **30d (day-60)**: "Coming up — your trial converts in 30 days. Here's what you've used so far." Friendly recap.
- **15d (day-75)**: "Halfway reminder — 15 days until €X/month begins." Mid-urgency; recap + "update payment method if needed" CTA.
- **5d (day-85)**: "Final reminder — billing begins in 5 days. We'll charge €X on DD MMM." High urgency; verify-card-on-file CTA prominent.

Three distinct templates, not one date-aware variant — the copy lift is small and the urgency signals matter.

### 4.1 Template anatomy: `<EmailShell>`

Shared layout component at `src/emails/_shell/EmailShell.tsx`:

```tsx
type Props = {
  locale: 'ro' | 'en' | 'de'
  preheader: string                      // visible preview text in inbox
  restaurant: { name: string; logo_url?: string; brand_primary?: string }
  children: React.ReactNode
}
```

Renders: branded header (restaurant logo + name, or Tavli wordmark if absent), the body slot, a footer with:
- Restaurant contact info (phone, address).
- "Manage your booking" deep link to `/reservations/[token]`.
- Unsubscribe link **only for marketing** — transactional emails omit `List-Unsubscribe` headers AND any inline unsubscribe link, per foundations §6.5. The shell component checks the `template` key passed to `sendTransactionalEmail` against the known-transactional set and refuses to render an unsubscribe link.
- Tavli wordmark + small "powered by".
- **Locale-appropriate legal disclosure** (the legal-entity line at the bottom of every commercial email per RO/EU consumer law). The mapping:
  - **RO**: `SC <restaurant.legal_name> S.R.L. · CUI <restaurant.tax_id> · Reg. Com. <restaurant.registration_number> · <restaurant.billing_address>`
  - **DE / AT**: `<restaurant.legal_name> · Geschäftsführer: <contact_name> · HRB <restaurant.registration_number> · <restaurant.billing_address>` (German Telemediengesetz §5 + Austrian E-Commerce-Gesetz §5)
  - **EN locale** (rendered for non-RO/DE/AT diners): same data as the restaurant's home jurisdiction (a UK or IE diner getting an email from a RO restaurant sees the RO legal line in English-language framing). We do not invent jurisdictions; restaurant is the legal entity.
- Image hosting: restaurant logos render via Supabase Storage **public URLs** (not signed; signed URLs expire) under the public `restaurant-photos` bucket. Email clients cache the URL aggressively; that's acceptable for logos (rarely change).

### 4.2 Confirmation email (`reservation_confirmation`)

**Props contract** (typed; the render fails closed if a required field is missing):

```ts
type ReservationConfirmationProps = {
  reservation: {
    id: string
    booking_date: string                       // ISO date, render in diner's locale
    booking_time: string                       // HH:mm in venue timezone
    party_size: number
    allergies: string[]                        // captured at booking; surfaced in body
    occasion_tags: string[]                    // captured at booking; surfaced in body
    seating_preferences: string                // free-text from booking form
    confirmation_token: string                 // for the manage-booking link
  }
  diner: {
    full_name: string
    phone: string                              // E.164, for the SMS variant
    email: string
  }
  restaurant: {
    name: string
    address: string
    contact_phone: string                      // surfaced in the email body so the diner can call
    parking_note?: string                      // per-locale; read from `restaurant_translations.parking_note` (§05 §3.1) for the resolved locale
    lat?: number
    lng?: number
    brand_primary?: string                     // hex; falls back to Tavli ink-on-cream
  }
  locale: 'ro' | 'en' | 'de'
  manageBookingUrl: string                     // pre-signed; embeds confirmation_token
}
```

Source of the diner-captured fields (`allergies`, `occasion_tags`, `seating_preferences`): §02 booking form (the locked checkbox list "Allergy / occasion / seating-preference capture at booking"). The confirmation email is the diner's verification surface — what we show here is exactly what staff will see when the diner arrives.

Body sections:
1. Greeting with diner first name (derived from `diner.full_name`).
2. Confirmation summary: date, time, party size, venue, address.
3. **Diner-captured fields surfaced visibly**: `reservation.allergies`, `reservation.occasion_tags`, `reservation.seating_preferences` — so the diner sees what they communicated to the restaurant and can correct if wrong via the modify link.
4. "Modify" + "Cancel" CTAs deep-linking with the confirmation token.
5. Parking + transit note (`restaurant.parking_note`).
6. Map link (Google Maps URL based on `restaurant.lat / lng`; falls back to a `q=<address>` link if coordinates missing).
7. Restaurant `contact_phone` rendered as a `tel:` link in the footer (operational necessity — diner needs to reach the restaurant directly on the day).
8. Add to calendar (iCal attachment — see §6.4).

### 4.3 Reminder email (`reservation_reminder_24h`)

Same skeleton as confirmation, with:
- Subject: "See you tomorrow at {restaurant} • {time}"
- Body emphasises practical: address, parking, what to wear (if `restaurant_translations.dress_code` is set for the resolved locale — per-locale free text, owned by §05 §3.1), menu preview link (deep link to PDF or structured menu on the venue page).
- "Need to make a change?" — modify/cancel CTAs.

### 4.4 Cancelled-by-restaurant (`reservation_cancelled_by_restaurant`)

Special: the structured `cancelled_reason` enum (from `src/lib/cancel-reasons.ts`) maps to a per-locale guest-facing message — see `messages/<locale>/cancel-reasons.json`. Body acknowledges the diner's plan, explains the reason in plain language, and offers a "Find another date" CTA back to the venue page.

If `cancelled_reason = 'private_event'`, body offers to be added to a waitlist for the venue's next public availability (waitlist as a feature is v1.5 per `launch-feature-commitments.md` §7).

## 5. Audit + monitoring

### 5.1 New table: `transactional_email_log`

```sql
create table transactional_email_log (
  id uuid primary key default gen_random_uuid(),
  template_key varchar(60) not null,
  email varchar(255),                                         -- recipient email; nullable for SMS-only sends
  phone varchar(20),                                           -- recipient phone (E.164)
  diner_id uuid references diners(id) on delete set null,
  reservation_id uuid references reservations(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,    -- on delete set null: audit survives org deletion
  organization_id_at_event uuid not null,                                    -- stable snapshot
  restaurant_id uuid references restaurants(id) on delete set null,
  channel varchar(20) not null,                              -- 'email' | 'sms'
  locale char(2) not null,
  subject varchar(300),                                       -- email-only
  resend_message_id varchar(80),                              -- Resend API response id
  twilio_message_sid varchar(80),                             -- Twilio API response id

  -- Channel-specific status enums (split for type safety; one is always null per row).
  -- A unified `status` column was rejected: it forced consumers to disambiguate by channel
  -- before interpreting the value, and risked impossible combinations (e.g., SMS with status
  -- 'complained' which doesn't exist in Twilio).
  email_status varchar(20),     -- 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
  sms_status varchar(20),       -- 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'optout'

  -- Constraint: exactly one of (email_status, sms_status) is non-null and matches `channel`.
  constraint transactional_log_status_per_channel check (
    (channel = 'email' and email_status is not null and sms_status is null) or
    (channel = 'sms'   and sms_status   is not null and email_status is null)
  ),

  status_updated_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);
```

**Provider → enum mapping.**

| Provider | Event | Column updated | Value |
|---|---|---|---|
| Resend | `email.queued` (synthetic; written on send) | `email_status` | `'queued'` |
| Resend | `email.sent` | `email_status` | `'sent'` |
| Resend | `email.delivered` | `email_status` | `'delivered'` |
| Resend | `email.bounced` | `email_status` | `'bounced'` |
| Resend | `email.complained` | `email_status` | `'complained'` (spam-flag) |
| Resend | `email.failed` | `email_status` | `'failed'` |
| Twilio | API ACK (synthetic) | `sms_status` | `'queued'` |
| Twilio | `MessageStatus=sent` | `sms_status` | `'sent'` |
| Twilio | `MessageStatus=delivered` | `sms_status` | `'delivered'` |
| Twilio | `MessageStatus=undelivered` | `sms_status` | `'undelivered'` (carrier reject; distinct from `failed`) |
| Twilio | `MessageStatus=failed` | `sms_status` | `'failed'` |
| Twilio | inbound STOP keyword (per foundations §7.1) | `sms_status` | `'optout'` + writes to `marketing_suppressions` |

```sql

create index transactional_email_log_diner on transactional_email_log (diner_id, created_at desc);
create index transactional_email_log_reservation on transactional_email_log (reservation_id, created_at desc);
create index transactional_email_log_resend_id on transactional_email_log (resend_message_id) where resend_message_id is not null;

-- RLS: org members can read their own org's log; service role writes.
alter table transactional_email_log enable row level security;

create policy "transactional_email_log_org_member_select" on transactional_email_log
  for select using (
    organization_id_at_event in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true
    )
  );

-- Inserts + updates are service-role only (the email-send wrapper + webhook handlers).
```

Retention: 24 months. Older rows purged by a §13 cleanup job.

### 5.2 Resend webhooks: `/api/webhooks/resend/route.ts`

Receives Resend's status events (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`):
1. Verify the Resend signature header (HMAC-SHA256 with `RESEND_WEBHOOK_SECRET`).
2. **Idempotency**: route through the shared `ingestWebhook` skeleton (foundations §6.6) which inserts into `webhook_events` keyed by `(provider='resend', provider_event_id)`. If already processed, return 200 + skip.
3. Look up the `transactional_email_log` row by `resend_message_id`.
4. Update `email_status` + `status_updated_at` per the provider → enum mapping above (§5.1). For `failed` events, also persist `failure_reason` from the Resend payload.
5. On `bounced` or `complained`: add the recipient's email to `marketing_suppressions` (foundations §4.7) with `channel = 'email'` and `source = 'bounce' | 'complaint'`. **Transactional sends ignore the suppression list** (we still need to tell a diner their booking was cancelled even if their inbox bounces). Marketing sends respect it.

### 5.3 Twilio webhooks: `/api/webhooks/twilio-sms-status/route.ts`

Same pattern for SMS — receives delivery receipts and inbound message bodies, all routed through the shared `ingestWebhook` skeleton (foundations §6.6). **STOP keyword handling is owned by foundations §7.1** ("Inbound STOP keyword"); this webhook handler routes the inbound to that shared logic rather than re-implementing the STOP-detection regex per locale. The shared handler writes to `marketing_suppressions` (foundations §4.7) with `channel = 'sms'` and `source = 'sms_stop_keyword'`, and sets `sms_status = 'optout'` on any in-flight `transactional_email_log` rows for that recipient.

## 6. APIs / interfaces

### 6.1 The send wrapper

```ts
// src/lib/email/send-transactional.ts

export async function sendTransactionalEmail(input: {
  to: string                                       // email address
  locale: 'ro' | 'en' | 'de'
  template: TransactionalTemplateKey
  props: TemplateProps[typeof template]            // typed per template
  context: {                                       // for audit log
    reservation_id?: string
    diner_id?: string
    restaurant_id?: string
    organization_id?: string
  }
}): Promise<ActionResult<{ messageId: string }>>
```

Used by:
- `createReservation` (§02) → confirmation email
- `cancelReservationByToken` (§02) → diner cancellation confirmation
- `modifyReservation` (§02) → modified email
- `pg-boss reservation.send-24h-reminder` (§02) → reminder
- `pg-boss reservation.send-post-visit-review-request` (§02) → review request
- `anonymiseDiner` (§03) → deletion confirmation
- `exportDinerData` (§03) → data-export-ready

### 6.2 SMS variant

```ts
// src/lib/sms/send-transactional.ts

export async function sendTransactionalSms(input: {
  to: string                                       // E.164
  locale: 'ro' | 'en' | 'de'
  template: TransactionalSmsTemplateKey            // narrower set than email
  props: SmsTemplateProps[typeof template]
  context: { ... }
}): Promise<ActionResult<{ messageSid: string }>>
```

Pre-send checks (in order):
1. **E.164 validation** — `to` must match `^\+[1-9]\d{1,14}$`. Normalised via `libphonenumber-js` with the restaurant's country as default (foundations §7.1). Reject if normalisation fails.
2. **Diner consent**: query `marketing_consents` (foundations §4.7) for an active row matching `(organization_id, diner_id, channel='sms_transactional')` with `consent_given=true AND revoked_at IS NULL`. Note: this is a distinct consent from marketing-SMS consent — a diner can opt into transactional reminders without opting into marketing. Missing → skip silently (the email already went; transactional SMS is opt-in).
3. **Restaurant gating**: `restaurants.transactional_sms_enabled` (column added by build step 12 — schema: `boolean not null default false`). If false, skip silently. Default off per §3.3 in v1; flipped to true default in v1.5.
4. **Quiet hours — SKIPPED for transactional**. Per foundations §7.1, quiet-hour rules (RO+AT 10:00–21:00, DE 8:00–20:00 Mon–Sat + no Sun) apply to marketing kind only. **Transactional sends always go** — a 23:30 cancellation must reach the diner immediately (contract necessity under GDPR Art 6(1)(b)).
5. **Idempotency**: write to `transactional_email_log` with `(channel='sms', diner_id, reservation_id, template_key)` checked for prior `sent`/`delivered` row in the last 24h; if present, skip (a job retry double-fire).

### 6.3 Locale resolver

```ts
// src/lib/email/resolve-locale.ts

export function resolveDinerLocale(input: {
  diner?: { locale: string | null }
  reservation?: { locale: string | null }
  restaurant: { locale: string }
}): 'ro' | 'en' | 'de'
```

Implements the order in §3.4.

### 6.4 iCal attachment

`generateIcalAttachment(reservation, restaurant)` in `src/lib/calendar/ical.ts`:
- Returns a `.ics` file as a Buffer.
- Includes: title (booking at {restaurant}), location (full address), start + end (2h default), description with confirmation token + cancellation note.
- Attached to confirmation + reminder emails.

Library: `ical-generator@8.x` (per `02-bookings.md` §7).

## 7. Background jobs

Owned by §02 (the booking lifecycle); this doc supplies the templates.

| Job | Calls this domain's API | Locale resolution |
|---|---|---|
| `reservation.send-24h-reminder` | `sendTransactionalEmail({ template: 'reservation_reminder_24h', ... })` + optionally `sendTransactionalSms` | At job time, re-resolve locale from current `diners.locale` (may have changed since booking) |
| `reservation.send-post-visit-review-request` | `sendTransactionalEmail({ template: 'reservation_post_visit_review_request', ... })` | Same |

## 8. Compliance & audit hooks

- Every send writes a `transactional_email_log` row (§5.1).
- Resend + Twilio webhooks update status (§5.2 + §5.3).
- Bounces and STOP-keyword unsubscribes propagate to `marketing_suppressions` (foundations §4.7) — they don't block transactional sends but do block marketing sends.
- GDPR data export (§13) includes the diner's full `transactional_email_log` history (filtered to that diner).
- **GDPR pseudonymisation cascade** (per foundations §15a.1 + §03 §8.2): when a diner is pseudonymised, the cascade sets `transactional_email_log.redacted_at = now()` for every row matching `diner_id`, then **nulls** the `email` + `phone` columns. The audit shell (`template_key`, `created_at`, `email_status`/`sms_status`, `organization_id_at_event`) is preserved for compliance reporting; only the PII columns are cleared. **No in-place regex / no string-replace with `'redacted'`** — the foundations §15a.1 pattern is column-targeted nulling, full stop. An `erasure_log` row is written for each redacted batch.
- **`audit_logs` writes from this domain — explicitly NOT made.** Transactional sends are high-volume (tens of thousands per month at modest scale) and would drown the cross-domain audit signal. The `transactional_email_log` IS the audit trail for this domain. Cross-domain `audit_logs` entries are written only for state-change events that cause emails (e.g., `AUDIT.reservation.cancelled` from §02), not for the email send itself.

## 9. Build sequence

1. **Migrate to one `<EmailShell>` layout component**, refactor existing 5 templates onto it. *(1 day)*
2. **Install `next-intl` per §00 step 3** (cross-domain prerequisite — shared with every other diner-facing surface). *(included in §00 estimate)*
3. **Add locale catalogues**: `src/messages/ro/emails.json`, `…/en/emails.json`, `…/de/emails.json` with copy for all 10 templates × 3 locales (30 sets). Drafted via the trilingual copy workflow per `marketing_strategy` memory ("each a parallel original, not a translation"). *(3 days — copy lift is real)*
4. **`sendTransactionalEmail` wrapper** + `resolveDinerLocale` helper. *(0.5 day)*
5. **Refactor existing email calls** in `/src/app/api/reservations/actions.ts` and post-visit cron to use the new wrapper. *(0.5 day)*
6. **`ReservationReminderEmail` template** + `reservation.send-24h-reminder` job (job impl in §02; template here). *(1 day)*
7. **`ReservationModifiedEmail` template** + wire into modify flows (§02). *(0.5 day)*
8. **`ReservationCancelledEmail` (diner + restaurant variants)** + wire into cancel flows. *(0.5 day)*
9. **Add `restaurants.transactional_sms_enabled boolean not null default false`** — the SMS gate from §3.3 + §6.2. Note: `restaurants.locale` is owned by §05 (added in §05 build step 2); `parking_note` + `dress_code` are per-locale columns on `restaurant_translations` (§05 §3.1), not bare columns on `restaurants`. *(0.1 day — single column add)*
10. **`transactional_email_log` table + writes from the wrapper.** *(0.5 day)*
11. **Resend webhook handler** (`/api/webhooks/resend/route.ts`) + signature verification + status updates + suppression propagation. *(1 day)*
12. **`sendTransactionalSms` wrapper** + opt-in checks + per-restaurant gating. *(1 day; depends on §00 SMS infra at step 6)*
13. **SMS templates** (confirmation, reminder only — shorter than emails; one-line + booking-token URL). *(0.5 day)*
14. **Twilio status webhook handler** (`/api/webhooks/twilio-sms-status/route.ts`). *(0.5 day)*
15. **iCal attachment generator** + wire into confirmation + reminder emails. *(0.5 day)*
16. **`data_export_ready` + `data_deletion_confirmed` templates** for §03 / §13 hooks. *(0.5 day)*
17. **Visual regression tests for each template × locale** via Playwright screenshot diffs. *(1 day)*

**Total: ~12 working days.** Step 3 (writing trilingual copy for 10 templates) is the longest and benefits from the founder doing it personally per the `marketing_strategy` memory's editorial standard.

## 10. Open questions

1. **Should the email shell carry the restaurant's brand colour (when set) or stay Tavli-branded?** Recommendation: restaurant-branded once `restaurants.brand_primary` is set. Default to Tavli ink-on-cream until then. Increases trust ("this is from the restaurant"), aligns with the editorial-quality bar from memory `feedback_aesthetic_bar`.

2. **Plain-text body — auto-derived or curated?** Recommendation: React Email's `render` produces a plain-text fallback automatically. Verify visually on every template; override if it's ugly. Don't write plain-text manually — drift risk.

3. **Should the confirmation email include the restaurant's menu inline?** Pro: editorial moment, primes the diner. Con: makes the email heavy + image-loading-flaky. Recommendation: include 2–3 chef picks as text + photos, not the full menu. Link out to the menu page for the rest.

4. **What about a single test recipient hook in dev?** Recommendation: env var `EMAIL_DEV_FORCED_RECIPIENT` — when set, all transactional emails route there instead of the actual recipient, with the original recipient in a debug header. Avoids accidentally emailing real diners during local dev.

5. **Should we have a "preview" surface for partners?** I.e., a restaurant owner clicks a button and sees what their next confirmation email will look like, with their branding and chosen locale. Recommendation: yes for v1.5 — useful for the founder-led setup walkthrough but not blocking launch. For launch, a Playwright screenshot artefact is good enough.

6. **Reply-to handling**: should diners hit reply and reach the restaurant or Tavli? Recommendation: per-restaurant. Default reply-to is the restaurant's primary email (`restaurants.email`). Falls back to `support@tavli.ro` if not set. Diners writing back about a booking should reach the restaurant directly.

7. **Multi-recipient bookings (e.g., business dinner with shared inbox)?** Recommendation: not v1. The reservation has one `guest_email`. Address in v1.5 with a "CC additional recipient" field on the booking form.

8. **What about WhatsApp transactional sends?** Recommendation: not in v1. Meta's policy distinguishes transactional from marketing templates and each requires separate approval. The lift isn't worth it for what's mostly an email job. Marketing-only on WhatsApp for now (per §11).

## 11. Cross-references

- **§00 Foundations** — Resend wrapper (§6.1), Twilio SMS wrapper (§7), `webhook_events` + `ingestWebhook` shared idempotency surface (§6.6), RFC 8058 transactional-vs-marketing boundary (§6.5), i18n catalogues + ICU MessageFormat (§11), `marketing_consents` + `marketing_suppressions` foundation tables (§4.7), GDPR erasure pattern (§15a.1).
- **§01 Identity & accounts** — `restaurants.organization_id` scoping; `restaurants.locale` default.
- **§02 Bookings** — owns the orchestration (when each email fires, which pg-boss job triggers it); this doc owns the templates + delivery.
- **§03 Diner database** — `diners.locale` is the first locale source; `diners.email` / `diners.phone` are the recipients; `marketing_consents` row with `channel='sms_transactional'` gates transactional SMS (foundations §4.7).
- **§06 Reviews** — `reservation_post_visit_review_request` template links to the review-submit page owned by §06.
- **§11 Marketing suite** — shares the Resend + Twilio wrappers + the `marketing_suppressions` table. Transactional sends ignore email suppression but respect SMS STOP-keyword opt-out. Marketing copy lives in a separate i18n namespace (`messages/<locale>/marketing.json` vs `emails.json`).
- **§12 Billing & subscriptions** — partner-facing billing emails (`trial_ending_*`, `payment_failed`, `refund_issued`, `subscription_cancelled`) are templated here but the events that fire them live in §12 (Stripe webhooks via the shared `webhook_events` surface).
- **§13 Compliance & legal** — `transactional_email_log` rolls into the GDPR data export; PII pseudonymisation cascades into this table per the §8 column-null pattern.

---

*Last updated: 2026-05-20.*
