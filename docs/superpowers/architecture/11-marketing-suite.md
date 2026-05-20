# 11 — Marketing Suite

> The largest single domain in the spec. Email + SMS + WhatsApp + in-confirmation channels, five automated triggered campaigns (pre-arrival reminders are §04 transactional, not §11), segmentation across six dimensions, one-off campaign builder, list-building across seven surfaces, quotas + frequency cap + quiet hours, GDPR-clean consent + suppression infrastructure, per-campaign and per-diner analytics. Almost entirely greenfield.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()` (`campaign.*` permissions), §4.7 foundation tables (`marketing_suppressions` + `marketing_consents` definitions; this doc adds `customer_consents` + `marketing_consent_audit` on top), §6.5 RFC 8058 one-click unsubscribe, §6.6 `webhook_events` shared idempotency, §7.1 SMS wrapper (E.164 + per-locale STOP suffix), §11.4 templates per-locale, §15a.1 GDPR erasure, §16.1 ERROR_CODES (TV900–TV999 owned here), §16.2 AUDIT (`AUDIT.marketing.*`), §16.3 JOBS (`marketing.*` family).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars) — marketing-vs-transactional, campaigns-vs-sends, dynamic segments, batched fan-out, global frequency cap, consent + suppression scope
- [4. Data model](#4-data-model) — settings, campaigns, versions, segments, sends, consents, suppressions, quota, link clicks, consent audit
- [5. Channel infrastructure](#5-channel-infrastructure) — email, link shortener, SMS, WhatsApp, in-confirmation upsells
- [6. The six triggered campaigns](#6-the-six-triggered-campaigns) — post-visit, birthday/anniversary, lapsed, no-show, welcome (pre-arrival removed)
- [7. One-off campaigns + builder](#7-one-off-campaigns--builder)
- [8. Segmentation engine](#8-segmentation-engine) — filter DSL, SQL compile, size preview, dedup
- [9. List building](#9-list-building) — seven entry surfaces + CSV import
- [10. Quotas, frequency cap, quiet hours](#10-quotas-frequency-cap-quiet-hours)
- [11. Compliance + audit](#11-compliance--audit)
- [12. Analytics](#12-analytics) — per-campaign, attribution, per-diner history
- [13. UI surfaces](#13-ui-surfaces)
- [14. Background jobs](#14-background-jobs)
- [15. Tools & libraries](#15-tools--libraries)
- [16. Build sequence](#16-build-sequence) — full v1 + phased options
- [17. Open questions](#17-open-questions)
- [18. Cross-references](#18-cross-references)

## 1. Scope

This domain owns: every marketing message that reaches a diner — content, scheduling, segmentation, consent enforcement, suppression, frequency capping, deliverability monitoring, and the analytics that feed back to restaurant operators. Plus the partner-portal UI for managing campaigns, lists, and analytics.

It does **not** own: transactional sends (→ §04 — confirmations, reminders, cancellations, post-visit review *as a one-shot transactional* are §04's; marketing-attributed equivalents live here), the diner record (→ §03), the consent record's user-facing capture form (→ §02 booking form, §03 manual add — this doc owns the consent *table* though), GDPR data export orchestration (→ §13).

### Checkboxes covered (mirrored from `launch-feature-commitments.md` §2)

#### Email channel
- [ ] Transactional email backbone (Resend integration) *(shared with §04 — wrapper in §00)*
- [ ] Per-restaurant **display identity** (from-name + reply-to) — sends from `hello@tavli.ro`, displays restaurant brand
- [ ] Custom sending domains per restaurant (SPF/DKIM/DMARC walkthrough) — **DEFERRED to v1.5** (too operational for v1)
- [ ] Multipart HTML + plain-text bodies
- [ ] Branded email template framework
- [ ] RFC-compliant `List-Unsubscribe` header (one-click)
- [ ] Bounce handling
- [ ] Spam complaint handling

#### SMS channel
- [ ] Twilio EU integration *(§00 wrapper)*
- [ ] ANPC-compliant opt-in copy at consent capture (RO)
- [ ] STOP / STOP ALL keyword handling
- [ ] Per-restaurant sender ID
- [ ] Delivery receipt handling
- [ ] Retry policy on transient failures
- [ ] Carrier-rejection logging + surfacing to restaurant

#### WhatsApp channel
- [ ] Twilio WhatsApp Business API integration *(§00)*
- [ ] Meta Business verification per restaurant
- [ ] Pre-approved template-message workflow
- [ ] Template submission to Meta + approval-status tracking
- [ ] 24-hour customer-care window enforcement
- [ ] Opt-in / opt-out tracked separately from SMS
- [ ] WhatsApp-specific delivery + read-receipt handling

#### In-confirmation upsells
- [ ] Promo-block slot in booking-confirmation email template
- [ ] Per-campaign targeting rules
- [ ] One-promo-per-confirmation cap
- [ ] Click attribution back to campaign

#### Automated triggered campaigns (five — pre-arrival reminders are §04 transactional, not §11)
- [ ] Post-visit thank-you + review request
- [ ] Birthday / anniversary
- [ ] Lapsed-diner reactivation
- [ ] No-show follow-up
- [ ] Welcome series for first-time diners
- *(Pre-arrival reminder — moved to §04 transactional; see §6.2 below)*

#### Campaign mechanics
- [ ] Pause / resume per restaurant
- [ ] Edit trigger timing within bounds
- [ ] Edit copy per language (RO / EN / DE)
- [ ] Language follows diner profile
- [ ] Personalization tokens
- [ ] Test send to staff
- [ ] Preview by channel
- [ ] Per-campaign send log

#### Segmentation (six dimensions)
- [ ] Visit recency
- [ ] Visit frequency
- [ ] Typical party-size range
- [ ] Service preference
- [ ] Occasion tags
- [ ] Acquisition channel

#### Segmentation mechanics
- [ ] Save segments for reuse
- [ ] Segment size preview before send
- [ ] AND / OR boolean
- [ ] Cross-channel deduplication
- [ ] Dynamic segments re-evaluated at send time

#### One-off campaigns + builder
- [ ] Template library (winter menu, new chef, themed night, off-peak fill, holiday menus)
- [ ] Builder flow
- [ ] Schedule for later
- [ ] Send-now option
- [ ] Cancel scheduled campaign
- [ ] Multi-language campaign body
- [ ] Save campaign as draft

#### List building
- [ ] Booking-flow consent capture
- [ ] QR table-tent signup landing
- [ ] Signup form on venue page
- [ ] Staff manual add at walk-in
- [ ] CSV import with bulk consent attestation
- [ ] Auto-add via review-request flow
- [ ] Audit log of every consent event

#### Quotas, throttling, frequency cap
- [ ] Metering: 1,000 emails + 250 SMS + 250 WhatsApp / month
- [ ] Real-time usage dashboard
- [ ] Usage alerts at 80% + 100%
- [ ] Overage billing: €0.06/SMS, €0.03/WhatsApp, email free
- [ ] Monthly overage invoice line
- [ ] Frequency cap: 4 messages/diner/month across ALL channels
- _(Architectural property, no code: frequency cap automatically excludes pre-arrival reminders — pre-arrival is §04 transactional and never inserts into `marketing_sends`)_
- [ ] Quiet hours: no SMS/WhatsApp before 10:00 or after 21:00 diner-local
- _(Architectural property, no code: quiet hours automatically bypassed for pre-arrival reminders — same reason; transactional sends bypass quiet hours by design in §04)_

#### Compliance + audit
- [ ] GDPR consent record per diner per channel
- [ ] ANPC-compliant SMS opt-in copy in RO
- [ ] One-click unsubscribe (email + STOP keyword)
- [ ] Org-wide suppression list
- [ ] Suppression respects organisation boundary
- [ ] Right-to-be-forgotten cascade
- [ ] Data retention for opted-out diners (90 days → purge)
- [ ] Marketing audit log per diner
- [ ] Per-restaurant audit log

#### Analytics + reporting
- [ ] Per-campaign delivery rate
- [ ] Per-campaign opens (email, WhatsApp)
- [ ] Per-campaign clicks
- [ ] Per-campaign bounce / failure rate
- [ ] Per-campaign unsubscribe rate
- [ ] Per-campaign conversion (booking via campaign_id)
- [ ] Per-segment performance breakdown
- [ ] Per-diner campaign history view
- [ ] Monthly send-volume report
- [ ] Allowance-usage trend

## 2. Current state

Greenfield except for what `00-foundations.md` already specs:
- Resend wrapper at `src/lib/email/resend.ts` (exists).
- Twilio SMS wrapper at `src/lib/sms/twilio.ts` (specified in §00 §17.6, not built).
- Twilio WhatsApp wrapper at `src/lib/whatsapp/twilio.ts` (specified in §00 §17.7, not built).
- pg-boss substrate (specified in §00 §17.5, not built).
- i18n via next-intl (specified in §00 §17.3, not built).
- `marketing_suppressions` table (specified in §00 §17.11, not built).
- `audit_logs` substrate (specified in §00 §17.12, not built).
- Webhooks for Resend + Twilio (specified in §00 §17.9 + §17.10, not built).

So §00 has the cross-cutting plumbing; this doc designs the actual product on top.

## 3. Architectural pillars

### 3.1 Marketing ≠ transactional, but they share infrastructure

The same Resend / Twilio wrappers send both. What differs: consent enforcement (marketing requires explicit opt-in), suppression respect (marketing skips suppressed recipients; transactional ignores suppression), frequency cap (marketing-only), quiet hours (marketing-only), `List-Unsubscribe` header (marketing-only), analytics tracking (marketing has rich attribution).

This separation lives in two distinct sending APIs:
- `sendTransactionalEmail` / `sendTransactionalSms` (§04)
- `sendMarketingEmail` / `sendMarketingSms` / `sendMarketingWhatsapp` (this doc)

Same underlying wrappers; different policy layers.

### 3.2 Campaigns are first-class, sends are derived

A `marketing_campaigns` row is the definition (content + targeting + schedule). When a campaign runs, the system fans out into one `marketing_sends` row per recipient. The send rows are the analytics-bearing artefacts; the campaign row is the source of truth for "what was this."

For triggered campaigns: the campaign row is the recipe (e.g., "post-visit review request"), and each fired send is a new sends row.

### 3.3 Segmentation is dynamic by default

Segments are saved queries, re-evaluated at send time. A "lapsed diners" segment selected today might match 47 diners; sent tomorrow, might match 49 (two more lapsed). This avoids stale lists.

Static snapshots are an explicit option ("freeze this segment as of now") via a `snapshot_segment_id` flag — useful for A/B test cohort consistency.

### 3.3.1 Fan-out is batched, with backpressure

A naive fan-out for a 10,000-diner segment would insert 10,000 `marketing_sends` rows and queue 10,000 per-recipient jobs in a single transaction — heavy DB write spike + worker thrash.

Strategy:
- The `marketing.fan-out-campaign` job processes the segment in **chunks of 500 recipients**. For each chunk: insert sends rows in a single multi-row INSERT, then enqueue per-recipient `marketing.send-message` jobs in batch.
- Between chunks, the fan-out job yields (pg-boss `complete()` and re-schedules itself with offset) — keeps each fan-out invocation under 30s, avoids long-held DB transactions.
- The per-recipient `marketing.send-message` jobs have a soft concurrency limit of 50 per worker (configured in pg-boss queue setup). At 50 concurrent sends, throughput is ~200/min sustained for email (Resend rate limits), ~30/min for SMS (Twilio), ~15/min for WhatsApp (template-message throughput).
- A 10,000-diner email campaign therefore takes ~50 min end-to-end. The campaign builder UI shows this estimate before send: "Fan-out + delivery will complete in ~50 minutes."

Hard limits enforced at the campaign level (v1):
- Max 50,000 recipients per single campaign send.
- Max 1 campaign sending per org at a time (queue subsequent ones).

These limits scale up in v1.5 when we have data on real campaign sizes.

### 3.4 Frequency cap is global, not per-campaign

A diner who receives 4 marketing messages in a month — across any combination of triggered + one-off + email/SMS/WhatsApp — hits the cap. The 5th send is skipped (not queued; not retried).

Implementation: when each send is enqueued in `marketing_sends`, the worker checks the diner's cap consumption in the current month (count of `marketing_sends` rows for this diner where `sent_at >= start_of_month`). Over cap → skip with status `'cap_reached'`.

Operational sends are automatically excluded from the cap because they never insert a `marketing_sends` row in the first place (pre-arrival reminders + confirmations are §04 transactional sends — see §6.2).

### 3.5 Consent is per-channel, scoped to organisation

A diner can opt into email from Tom Yum but not SMS from Tom Yum. They can opt into all three at Cluj Brewery (a different org) — separate consent rows, no cross-org leakage.

Consent records carry: which channel, which surface captured it, when, exact copy shown, IP address. This is the audit trail an ANPC inspector wants.

### 3.6 Suppression supersedes consent

If a diner clicks unsubscribe (or texts STOP), they go on the suppression list. Future consent records for the same channel are accepted in the UI but the suppression takes precedence at send time. Unsubscribe is sticky and only reversible by the diner re-opting-in explicitly (with a new consent record dated after the suppression).

## 4. Data model

### 4.1 New enums

```sql
create type marketing_channel as enum ('email', 'sms', 'whatsapp', 'in_confirmation');
create type marketing_campaign_kind as enum ('triggered', 'one_off');
create type marketing_campaign_status as enum ('draft', 'active', 'paused', 'archived', 'scheduled', 'sending', 'sent', 'cancelled');
create type marketing_send_status as enum ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped_cap', 'skipped_suppressed', 'skipped_quiet_hours', 'unsubscribed', 'opened', 'clicked');
create type consent_source as enum ('booking_flow', 'qr_tent', 'venue_page', 'walk_in_manual', 'csv_import', 'review_flow', 'admin');
create type segment_combinator as enum ('and', 'or');
```

### 4.2 New table: `restaurant_marketing_settings`

Per-venue marketing configuration. (Renamed from `marketing_settings_per_restaurant` for naming consistency with `restaurant_event_settings`.)

```sql
create table restaurant_marketing_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,

  -- Email — all sends go from hello@tavli.ro in v1; per-restaurant sending domains DEFERRED to v1.5.
  email_sender_name varchar(120),                            -- display name only; defaults to "Tavli" or restaurant.name
  email_reply_to varchar(255),                                -- defaults to restaurant.email

  -- SMS
  sms_enabled boolean not null default false,                 -- per-restaurant kill switch
  sms_sender_id varchar(20),                                  -- alphanumeric where allowed; defaults to "Tavli"

  -- WhatsApp — Pro-only, and only after Meta Business verification completes.
  -- The toggle is hidden in the partner UI for Base orgs and disabled until
  -- whatsapp_business_account_id + whatsapp_phone_number_id are both set
  -- (which only happens after the Meta verification webhook fires).
  whatsapp_enabled boolean not null default false,
  whatsapp_business_account_id varchar(80),                   -- Meta WABA id
  whatsapp_phone_number_id varchar(80),

  -- Note: transactional SMS gating lives on `restaurants.transactional_sms_enabled` (added by §04 step 9), NOT on this table.
  -- The §04 column ships in v1 (defaults to false); v1.5 flips the default to true for new restaurants.

  -- Confirmation promo opt-in
  confirmation_promo_enabled boolean not null default true,

  -- Quiet hours (overridable per restaurant for orgs in non-EU TZ)
  quiet_hours_start_local time not null default '21:00',
  quiet_hours_end_local time not null default '10:00',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: org admins + venue owners can read/write. Service role for sends.
alter table restaurant_marketing_settings enable row level security;

create policy "restaurant_marketing_settings_admin_all" on restaurant_marketing_settings
  for all using (
    restaurant_id in (
      select id from restaurants
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
      )
    )
  );
```

### 4.3 New table: `marketing_campaigns`

```sql
create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,   -- nullable: null = org-wide

  kind marketing_campaign_kind not null,
  triggered_campaign_key varchar(40),                         -- 'post_visit_review' | 'birthday' | 'lapsed_60' | 'lapsed_120' | 'lapsed_180' | 'no_show_followup' | 'welcome_series' (when kind = 'triggered'). NOTE: pre-arrival reminders are TRANSACTIONAL (owned by §04) — they never appear here and never insert into marketing_sends.

  name varchar(200) not null,
  description text,
  status marketing_campaign_status not null default 'draft',

  -- Channel + content
  channel marketing_channel not null,
  subject_template jsonb not null,                            -- { ro: "...", en: "...", de: "..." }
  body_template jsonb not null,                                -- same structure; MJML for email, plain for SMS, named-template-key for WhatsApp
  preview_text jsonb,                                          -- email preheader
  whatsapp_template_namespace varchar(80),                    -- Meta-approved template namespace
  whatsapp_template_name varchar(80),

  -- Trigger config (kind = 'triggered')
  trigger_offset_seconds integer,                              -- e.g., 7200 = 2h after the event; negative = before
  trigger_event varchar(40),                                   -- 'reservation.completed' | 'reservation.no_show' | 'diner.created' | 'diner.birthday' | 'diner.lapsed_60d'

  -- Schedule (kind = 'one_off')
  scheduled_send_at timestamptz,
  send_in_restaurant_tz boolean not null default true,

  -- Targeting
  segment_id uuid,                                             -- FK added after segments table
  recipient_count_estimate integer,                            -- updated on schedule, frozen at send time

  -- Personalisation tokens used (for validation)
  tokens_used text[] not null default '{}',                    -- validated against the allowlist below. Valid tokens (v1): 'first_name', 'last_name', 'venue_name', 'org_name', 'last_visit_date', 'next_reservation_date', 'visit_count', 'birthday_date', 'anniversary_date', 'unsubscribe_url'. Any token not in this list rejected by the template validator.

  -- Authoring
  created_by_user_id uuid references auth.users(id),
  last_edited_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,                                          -- when one-off finished fan-out
  archived_at timestamptz
);

create index marketing_campaigns_org_status on marketing_campaigns (organization_id, status);
create index marketing_campaigns_scheduled on marketing_campaigns (scheduled_send_at) where status = 'scheduled';
create index marketing_campaigns_triggered on marketing_campaigns (organization_id, triggered_campaign_key, status) where kind = 'triggered';
```

### 4.4 New table: `marketing_campaign_versions`

When a campaign is edited, the previous version is snapshotted so sent emails retain their original content for audit.

```sql
create table marketing_campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  version_number integer not null,
  subject_template jsonb not null,
  body_template jsonb not null,
  preview_text jsonb,
  edited_by_user_id uuid references auth.users(id),
  edited_at timestamptz not null default now(),
  unique (campaign_id, version_number)
);
```

### 4.5 New table: `marketing_segments`

```sql
create table marketing_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,   -- nullable: org-wide segment
  name varchar(200) not null,
  description text,

  -- The query (DSL — see §8.1)
  filter_dsl jsonb not null,
  combinator segment_combinator not null default 'and',

  -- Snapshot mode
  is_snapshot boolean not null default false,
  snapshot_diner_ids uuid[],                                  -- when is_snapshot = true, fixed list

  -- Stats (cached)
  estimated_size integer,
  last_estimated_at timestamptz,

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_segments_org on marketing_segments (organization_id);
```

Add the FK on `marketing_campaigns.segment_id` now that the table exists:
```sql
alter table marketing_campaigns
  add constraint marketing_campaigns_segment_fk
  foreign key (segment_id) references marketing_segments(id) on delete restrict;
```

### 4.6 New table: `marketing_sends`

The granular send record. One row per recipient per campaign per channel.

```sql
create table marketing_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  campaign_version_id uuid references marketing_campaign_versions(id) on delete set null,
  diner_id uuid references diners(id) on delete set null,                      -- nullable + set-null on diner hard-delete: preserves aggregate analytics after the 30-day pseudonymisation+purge window
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,

  channel marketing_channel not null,
  locale char(2) not null,

  email varchar(255),                                          -- snapshot of recipient
  phone varchar(20),

  status marketing_send_status not null default 'queued',
  status_updated_at timestamptz,
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  first_clicked_at timestamptz,
  click_count integer not null default 0,
  unsubscribed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,

  -- Provider correlation
  resend_message_id varchar(80),
  twilio_message_sid varchar(80),

  -- Failure details
  failure_code varchar(60),
  failure_message text,

  -- Conversion attribution
  attributed_reservation_id uuid references reservations(id) on delete set null,
  attribution_window_expires_at timestamptz,                  -- typically sent_at + 14 days

  created_at timestamptz not null default now()
);

create index marketing_sends_campaign on marketing_sends (campaign_id, status);
create index marketing_sends_diner on marketing_sends (diner_id, sent_at desc);
create index marketing_sends_org_month on marketing_sends (organization_id, sent_at) where status in ('sent', 'delivered', 'opened', 'clicked');
create index marketing_sends_resend on marketing_sends (resend_message_id) where resend_message_id is not null;
create index marketing_sends_twilio on marketing_sends (twilio_message_sid) where twilio_message_sid is not null;
create index marketing_sends_attribution on marketing_sends (attributed_reservation_id) where attributed_reservation_id is not null;
```

### 4.7 New table: `customer_consents`

```sql
create table customer_consents (
  id uuid primary key default gen_random_uuid(),
  diner_id uuid not null references diners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  channel marketing_channel not null,

  status varchar(20) not null,                                -- 'opted_in' | 'opted_out' | 'never'
  source consent_source not null,
  source_surface_url text,                                     -- the URL where consent was captured
  source_ip inet,
  consent_copy_shown text not null,                            -- exact text the diner saw
  consent_locale char(2) not null,

  captured_at timestamptz not null default now(),
  revoked_at timestamptz,

  created_by_user_id uuid references auth.users(id) on delete set null
);

create unique index customer_consents_diner_channel_active
  on customer_consents (diner_id, channel)
  where revoked_at is null;

create index customer_consents_org on customer_consents (organization_id);
```

Only one active consent row per (diner, channel) at a time. Revoking sets `revoked_at`; new consent inserts a new row.

### 4.8 New table: `marketing_suppressions`

(Specified in §00 §17.11 — defined here for completeness.)

```sql
create table marketing_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel marketing_channel not null,                          -- which channel suppressed
  recipient_identifier varchar(255) not null,                  -- email lowercased OR E.164 phone

  reason varchar(40) not null,                                  -- 'unsubscribed' | 'bounce' | 'complaint' | 'stop_keyword' | 'admin' | 'gdpr_request'
  source_send_id uuid references marketing_sends(id) on delete set null,
  notes text,

  suppressed_at timestamptz not null default now(),
  unsuppressed_at timestamptz                                   -- only set if the diner re-opts-in
);

create unique index marketing_suppressions_org_channel_recipient_active
  on marketing_suppressions (organization_id, channel, recipient_identifier)
  where unsuppressed_at is null;
```

Org-scoped by design (per the cross-org-isolation principle from §03, and aligned with §09's "Suppression scope" section). A diner who unsubs from venue A's SMS cannot receive SMS from any venue in the same org. The campaign builder must surface this to the operator: when a segment is selected, the size preview displays *"this segment has N diners; M are suppressed (org-wide) for this channel — effective reach K"*. Multi-venue operators see the cross-venue suppression count explicitly so they don't expect an opted-out diner at venue B to receive a campaign from venue A.

### 4.9 New table: `marketing_quota_usage`

Per-org, per-month, per-channel running counts.

```sql
create table marketing_quota_usage (
  organization_id uuid not null references organizations(id) on delete cascade,
  year_month date not null,                                    -- first day of month
  channel marketing_channel not null,

  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  bounced_count integer not null default 0,
  complained_count integer not null default 0,

  -- Quota math
  included_allowance integer not null,                          -- 1000 / 250 / 250 for email/sms/whatsapp at Pro
  overage_count integer not null default 0,                     -- sent_count - included_allowance, when positive
  overage_billed_cents integer not null default 0,

  last_alert_threshold smallint not null default 0,             -- last alert sent: 0 | 80 | 100

  computed_at timestamptz not null default now(),
  primary key (organization_id, year_month, channel)
);

-- RLS: org admins read; service-role writes from send-message job + nightly billing job.
alter table marketing_quota_usage enable row level security;

create policy "marketing_quota_usage_org_admin_select" on marketing_quota_usage
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
    )
  );
```

Updated on every send. Read by the dashboard usage widget + the §12 monthly billing job.

### 4.10 New table: `marketing_link_clicks`

Tracking clicks on links in marketing emails. (SMS/WhatsApp link clicks are tracked via redirect shortener — see §5.2.)

```sql
create table marketing_link_clicks (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references marketing_sends(id) on delete cascade,
  link_token varchar(20) not null,                              -- the short token in the URL
  destination_url text not null,
  clicked_at timestamptz not null default now(),
  ip inet,
  user_agent varchar(500)
);

create index marketing_link_clicks_send on marketing_link_clicks (send_id, clicked_at desc);
```

### 4.11 New table: `marketing_consent_audit`

Append-only audit log for every consent state change.

```sql
create table marketing_consent_audit (
  id uuid primary key default gen_random_uuid(),
  diner_id uuid references diners(id) on delete set null,                  -- consent audit survives diner anonymisation
  organization_id uuid references organizations(id) on delete set null,    -- and org deletion (consent demonstrability retained while consent live)
  diner_id_at_event uuid not null,                                          -- stable copy of diner_id, never null, never updated
  organization_id_at_event uuid not null,                                   -- stable copy of org_id, never null, never updated
  channel marketing_channel not null,
  event_type varchar(40) not null,                              -- 'consent_captured' | 'consent_revoked' | 'auto_suppressed' | 're_consented'
  reason varchar(60),
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  context jsonb
);

create index marketing_consent_audit_diner on marketing_consent_audit (diner_id, occurred_at desc);
create index marketing_consent_audit_org on marketing_consent_audit (organization_id, occurred_at desc);
```

Retention: indefinite. Required for GDPR + ANPC defensibility.

### 4.12 RLS

All marketing tables have RLS. Default policy: org members can read; org admins can write. `marketing_sends` analytics readable by org members; status mutations service-role only (webhook handlers).

## 5. Channel infrastructure

### 5.1 Email

`sendMarketingEmail({ to, locale, campaignId, dinerId, organizationId, restaurantId, content }) → ActionResult`. Wraps `00-foundations.md` §17 Resend wrapper with:
- **Tier gate**: `loadActiveSubscription(organizationId).tier === 'pro'`. Marketing suite is Pro-only. Base orgs cannot send marketing. (Defence in depth — UI gates first, this is the backstop.)
- Suppression check (`marketing_suppressions`).
- Consent check (`customer_consents`).
- Frequency-cap check.
- Quiet-hours check (email is always allowed — no quiet hours on email per spec).
- Sender identity: from-address `hello@tavli.ro`, display-name from `restaurant_marketing_settings.email_sender_name`, reply-to from `email_reply_to`.
- `List-Unsubscribe` header with the unsubscribe URL: `https://tavli.ro/u/<send_id>/<token>`.
- Insert `marketing_sends` row before sending; update on Resend response.
- Wrap clickable links via link-shortener for click attribution.

### 5.2 Link shortener for click attribution

Marketing links are wrapped: every `<a href="...">` in the template body gets rewritten to `https://tavli.ro/c/<send_id>/<link_token>?dst=<base64-encoded-original-url>`.

The `/c/[sendId]/[token]` route:
1. Looks up `marketing_sends` by id.
2. Verifies token — HMAC of `(campaign_id + diner_id + send_id)` with `LINK_TRACKING_SECRET`. The `send_id` is in the HMAC payload to prevent token reuse across sends to the same diner (otherwise an attacker who captured one token could replay it against future sends).
3. Inserts a `marketing_link_clicks` row.
4. Updates `marketing_sends.first_clicked_at` if first.
5. Increments `click_count`.
6. 302 redirects to the destination URL.

**Rate limit (per IP + token):** the same (IP, token) pair within 60s counts once — bots and email-client prefetchers (Gmail's link-preview, Outlook's safe-link scanner) hammer URLs and would otherwise pollute click counts. Implementation: a small in-process LRU keyed by `${ip}:${token}` with 60s TTL; subsequent hits update the redirect but skip the `marketing_link_clicks` insert.

**Token expiry:** tokens expire 90 days after `marketing_sends.sent_at`. Expired tokens still 302-redirect (the email is "real" — diner clicking a 4-month-old email shouldn't 404), but skip the click insert and log a Sentry breadcrumb. Tokens older than 12 months 410 Gone (cleanup pressure on stale archived emails).

Lightweight, no external dependency (Bitly etc.).

### 5.3 SMS

`sendMarketingSms`. Wraps the §00 Twilio wrapper with:
- Suppression check.
- Consent check.
- Frequency-cap check (counted across email + SMS + WhatsApp).
- Quiet-hours check (mandatory for every marketing send — pre-arrival reminders bypass quiet hours but they are §04 transactional, not handled by this wrapper).
- Sender ID from `restaurant_marketing_settings.sms_sender_id`.
- Body must end with the locale-appropriate STOP suffix per foundations §7.1 step 5 — the canonical source:
  - RO: `' STOP la {shortcode} pentru dezabonare'` (where `{shortcode}` is the per-restaurant Twilio shortcode from `marketing_settings.sms_stop_shortcode`)
  - EN: `' Reply STOP to unsubscribe'`
  - DE: `' Antworten Sie mit STOP zum Abmelden'`
  
  The SMS wrapper auto-appends the suffix at send time if missing; the template validator in this domain rejects bodies that contain a malformed STOP suffix (wrong shortcode, missing `pentru`, etc.). Operators do not need to type the suffix manually. The validator confirms total length stays within the 160-char single-segment budget (or warns about multi-segment billing if exceeded).
- Link-shortener variant for SMS links (no email-style wrapping — too long for 160-char limit; uses a 12-char short URL via Twilio's URL shortening if enabled, else a Tavli `t.tavli.ro/<token>` redirect).

### 5.4 WhatsApp

`sendMarketingWhatsapp`. WhatsApp marketing only supports approved **template messages**. Restrictions:
- Cannot include arbitrary copy — only the approved template with parameter substitutions.
- 24-hour customer-care window does NOT apply to template messages (those are exactly *what* you send when outside the window).
- Each template must be approved by Meta separately per locale.

Implementation:
- Campaign's `whatsapp_template_namespace` + `whatsapp_template_name` reference the Meta-approved template.
- The campaign's `body_template.<locale>` holds the parameter values (variable substitutions) — not the template body itself.
- `restaurant_marketing_settings.whatsapp_business_account_id` identifies the sending business.

**Tier + verification gating.** The `restaurant_marketing_settings.whatsapp_enabled` toggle is exposed only to Pro orgs (tier check via `loadActiveSubscription(organizationId).tier === 'pro'`), and only after Meta Business verification completes for the venue (signalled by the `meta.business.verified` webhook landing both `whatsapp_business_account_id` and `whatsapp_phone_number_id`). Until both conditions are met, the toggle is hidden in the partner UI and `sendMarketingWhatsapp` returns `fail('TV904', 'WhatsApp not yet enabled for this venue')` at the wrapper boundary (defence-in-depth). Initial state for every new venue: disabled. (`TV904` is registered in foundations §16.1 ERROR_CODES under §11's TV900–999 range.)

### 5.5 In-confirmation upsells

The fourth channel: a promo block in the booking-confirmation email. Implementation:
- `marketing_campaigns` row with `channel = 'in_confirmation'` defines the promo content.
- When `createReservation` (§02) sends the confirmation email via §04, the wrapper queries: "is there an active in-confirmation campaign matching this diner's segment for this restaurant?" If yes, the promo block renders in the email shell.
- One slot, one promo per email — pick the highest-priority matching campaign.
- Click attribution: links in the promo are wrapped same as marketing email links.

The diner's confirmation arrives in their inbox; the promo piggybacks. Frequency-cap-wise, this counts as a send for cap math.

## 6. The six triggered campaigns

Each is a `marketing_campaigns` row with `kind = 'triggered'` and a specific `triggered_campaign_key`. The org admin can edit copy + timing + enable/disable per restaurant. Defaults below.

### 6.1 `post_visit_review`

Trigger: `reservation.completed` event + 2 hours (configurable 1–24h).
Channel: email (default), optionally SMS.
Audience: verified diners only (`diner.last_visited_at = today AND reservation.status = 'completed'`).
Body: thank-you note + 1-line about how to leave a review + signed-link CTA.

Note: this is the marketing version. §04 also has a transactional version with simpler content. Org admin chooses: transactional-only (default), marketing-version-replaces (more polished), or both (cap-friendly).

### 6.2 ~~`pre_arrival`~~ — owned by §04 (transactional), NOT §11

**Decision (locked):** Pre-arrival reminders are TRANSACTIONAL — they confirm a service the diner already booked, are sent regardless of marketing consent, and are not subject to suppression / frequency cap / quiet hours. They are owned by §04 (diner communication) and never insert a `marketing_sends` row.

Consequences:
- `triggered_campaign_key` no longer includes `'pre_arrival'`.
- The frequency-cap query (§10.2) never sees pre-arrival sends because they do not exist in `marketing_sends` — no special-case filter needed.
- The in-confirmation upsell (§5.5) is a separate mechanism; it piggybacks on the confirmation email (a §04 transactional send) and DOES insert a `marketing_sends` row for cap accounting because its content is marketing in nature. The reminder itself does not.
- If an operator wants to layer a promo onto pre-arrival reminders, that's an in-reminder upsell — design TBD in v1.5, not in v1.

### 6.3 `birthday_anniversary`

Trigger: `diner.birthday` or `diner.anniversary` event + (-7 days).
Channel: email.
Audience: diners with `occasion_tags` containing 'birthday' or 'anniversary' AND a captured date.
Body: birthday well-wish + optional offer ("free dessert on your birthday visit").

**Hard dependency on §03:** the birthday/anniversary triggers require `diners.birthday_date date` + `diners.anniversary_date date` (both nullable). These columns are NOT in §03's default schema today — they must be added to §03 before this campaign can fire. Verify §03's build sequence ships these columns BEFORE step 12 of this doc (which seeds the triggered campaigns). If §03 lags, this triggered campaign stays in `status = 'paused'` until the columns arrive — the rest of step 12 (other triggered campaigns) can ship without them.

### 6.4 `lapsed_60` / `lapsed_120` / `lapsed_180`

Three sub-keys.
Trigger: `diner.frequency_bucket` transitions to 'lapsed' (60d) or stays lapsed (120d, 180d).
Channel: email (default), occasional SMS for the 180-day re-engagement.
Audience: diners in the relevant bucket who haven't been re-engaged in the last 30 days.
Body: "we miss you" + optional offer + book CTA.

### 6.5 `no_show_followup`

Trigger: `reservation.no_show` event + 2h (configurable).
Channel: email.
Audience: the no-show diner.
Body: warm tone — "sorry we missed you, here's a small gesture" + optional offer code + book-again CTA.

### 6.6 `welcome_series`

Trigger sequence: 3 emails at M+1 day, M+7 days, M+30 days after first verified visit.
Channel: email.
Audience: diners with `visit_count = 1` (welcome series can include only those who haven't visited again).
Body: progressive — meet the team / inside the kitchen / "you're due for visit 2".

## 7. One-off campaigns + builder

### 7.1 Template library

Curated starter templates in seed data:
- Winter menu launch
- Themed night (Friday jazz, wine tasting)
- Off-peak fill (Tuesday lunch)
- Holiday menus (Christmas, Easter, Mărțișor for RO)
- New chef introduction

Each: pre-written subject + body in RO/EN/DE, sample personalisation tokens, segment recommendation.

### 7.2 Builder flow

`/partner/restaurants/[id]/campaigns/new` (or org-scoped at `/partner/org/[orgId]/campaigns/new`):
1. **Starting point** — choose: "Start from blank" OR "Start from library template" OR (when at venue-scope inside a multi-venue org) "Clone from org template." Org-level templates are read-only at org-level; cloning into a venue creates a venue-editable copy whose `parent_template_id` points back to the org original. The venue copy may then diverge. If the org original later changes, the venue copy is NOT auto-synced — the operator sees a "parent template updated" badge with a "review changes" CTA in the campaign editor.
2. **Name + describe** the campaign (internal — diners never see this).
3. Pick channel (email default; SMS or WhatsApp if enabled).
4. Edit subject + body per language (RO required; EN/DE optional, fall back). Templates are stored per-locale per foundations §11.4.
5. Insert personalisation tokens via menu (first_name, last_visit_date, etc.).
6. Pick segment (existing saved or create new).
7. Preview by channel + by locale.
8. Test send to staff email/phone.
9. Schedule for later (datetime picker, restaurant TZ) OR send now.
10. Submit.

`saveCampaignDraft` / `submitCampaign` server actions. Draft saves don't enqueue sends; submit + scheduled enqueues the fan-out job at the scheduled time.

### 7.3 Cancellation

A scheduled campaign can be cancelled until its fan-out begins. After fan-out starts, individual queued sends are still cancellable per-recipient until they're handed to Resend/Twilio.

## 8. Segmentation engine

### 8.1 The filter DSL

A segment's filter is a JSON expression:

```jsonc
{
  "combinator": "and",
  "conditions": [
    { "field": "visit_count", "op": ">=", "value": 5 },
    { "field": "last_visited_at", "op": ">=", "value": "30_days_ago" },
    { "field": "occasion_tags", "op": "contains_any", "value": ["birthday", "anniversary"] },
    {
      "combinator": "or",
      "conditions": [
        { "field": "acquisition_source", "op": "=", "value": "venue_page" },
        { "field": "acquisition_source", "op": "=", "value": "editorial" }
      ]
    }
  ]
}
```

Supported fields (the six dimensions + extras): `visit_count`, `last_visited_at`, `first_visited_at`, `frequency_bucket`, `typical_party_size_min`, `typical_party_size_max`, `occasion_tags`, `acquisition_source`, `locale`, `has_email`, `has_phone`, `consented_email`, `consented_sms`, `consented_whatsapp`, `service_preference`.

Ops: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in`, `contains_any`, `contains_all`, `is_null`, `is_not_null`, `between`.

Date values support relative shorthand: `'30_days_ago'`, `'7_days_ahead'`, etc.

### 8.2 Translation to SQL

`compileSegmentFilter(filterDsl) → Drizzle WHERE clause`. The compiler walks the JSON tree, emits Drizzle SQL fragments, validates each field/op pair against an allowlist (defence-in-depth — never let user-supplied JSON become raw SQL).

### 8.3 Size preview

`previewSegmentSize(filterDsl) → number`. Runs `select count(*) from diners where <compiled>`. Performance: sub-second up to ~100k diners; 5–10s at 500k+. For very large orgs the segment-preview UI shows a "calculating…" state while the query runs (debounced — see §8.3.1 below). Cached in `marketing_segments.estimated_size` with `last_estimated_at`.

### 8.3.1 Editor debounce

The visual segment builder re-computes the size preview on every change to a condition row, but with a 500ms trailing debounce — operators editing a numeric threshold or a date offset see a single re-count at rest, not one per keystroke. The current "estimating…" state is rendered while the debounce is pending so the UI feels responsive.

### 8.4 Dedup at send time

When a fan-out runs:
1. Materialize the segment.
2. Filter out diners on the suppression list for the channel.
3. Filter out diners over the frequency cap.
4. Filter out diners outside quiet hours (for SMS/WhatsApp).
5. Filter out diners without consent for the channel.
6. Filter out diners with the same `recipient_email` or `recipient_phone` as another diner in the cohort (cross-channel dedup — one human, one message).
7. Each remaining diner gets a `marketing_sends` row.

## 9. List building

### 9.1 Surfaces

Per the launch-commitments doc, seven entry surfaces — each writes a `customer_consents` row:

| Surface | Where | Consent text | Source enum |
|---|---|---|---|
| Booking flow | `ReservationSheetV2` final step | "Receive occasional updates from {restaurant}?" — separate checkbox per channel | `booking_flow` |
| QR tent | `/qr/<token>` redirected landing | Single-step form: name + phone + consent checkbox | `qr_tent` |
| Venue-page form | Footer / modal on `/[city]/[slug]` | "Stay in the loop — special menus, themed nights" | `venue_page` |
| Walk-in manual add | Staff via partner portal | Verbal attestation — staff confirms diner agreed verbally | `walk_in_manual` |
| CSV import | Org admin upload tool | Uploader attests legal basis per row | `csv_import` |
| Review flow | After review submission | "Want notification when our menu changes?" | `review_flow` |
| Admin / Tavli ops | Tavli admin tool | Manual entry with explicit basis recorded | `admin` |

### 9.2 Consent capture mechanics

Every surface invokes `recordConsent({ dinerId, organizationId, channel, source, sourceSurfaceUrl, copyShown, locale, ip, capturedByUserId? })`. Returns the new `customer_consents` row id.

If a `customer_consents` row with `revoked_at IS NULL` already exists for (diner, channel) and the new consent has same `status`, it's a no-op (idempotent).

If the existing consent is opted-in and the new one is opted-out (revocation): mark the old row's `revoked_at = now()`, insert new row with `status = 'opted_out'`. Cascade: insert `marketing_suppressions` row.

### 9.3 CSV import flow

1. Org admin uploads CSV with columns: `phone`, `email`, `full_name`, `consent_email`, `consent_sms`, `consent_whatsapp`, `consent_source_description`.
2. UI requires a single big attestation checkbox: "I confirm that every diner in this file has given lawful consent to be contacted via the channels indicated, and I can produce the original consent records on request."
3. Import job: per row → `findOrCreateDiner` (§03) → for each channel = true, `recordConsent`.
4. Audit log + bulk consent records.

## 10. Quotas, frequency cap, quiet hours

### 10.1 Quota enforcement

Per-month allowance: 1,000 emails + 250 SMS + 250 WhatsApp.

Before each send: check `marketing_quota_usage` for the current month + org + channel. If `sent_count >= included_allowance + overage_allowed_buffer` (org admin sets a hard cap to prevent surprise bills — default 5x the allowance), skip the send with `status = 'skipped_quota_exceeded'`. Else proceed.

Increment `sent_count` after successful send. Overage rows (sent_count > included_allowance) accumulate `overage_count`.

### 10.2 Frequency cap

Per-diner: 4 messages per calendar month across all channels.

Implementation:
```sql
select count(*)
from marketing_sends ms
where ms.diner_id = $diner_id
  and ms.sent_at >= date_trunc('month', now())
  and ms.status in ('sent', 'delivered', 'opened', 'clicked');
```

Limit: 4/month (configurable per org via `organizations.marketing_frequency_cap_per_month`).

If `count(*) >= cap` → skip with `status = 'skipped_cap'`.

**Why no `marketing_campaigns` JOIN to filter out transactional sends?** Because pre-arrival reminders are §04 transactional and live in `transactional_email_log` / `transactional_sms_log` — they NEVER insert a `marketing_sends` row. The data model enforces exclusion at the source; a JOIN-based filter would only be defence against future refactors. If/when an enum value like `'transactional'` is added to `marketing_campaign_kind` (currently `('triggered', 'one_off')`), reintroduce the filter via the correct enum value — but until then, the JOIN is dead-code defence against an impossible scenario.

### 10.3 Quiet hours

`restaurant_marketing_settings.quiet_hours_start_local` + `quiet_hours_end_local`. Computed against the diner's local timezone (default to restaurant TZ if diner timezone unknown).

If the send would arrive in quiet hours:
- Email: ignore (no quiet hours for email).
- SMS / WhatsApp + non-pre-arrival: defer to next quiet-hours-allowed window. Reschedule the pg-boss job; status stays `'queued'`.

### 10.4 Usage alerts

`marketing.usage-alert` job runs hourly. For each (org, channel, current month), if `sent_count / included_allowance` crosses 0.8 (and `last_alert_threshold < 80`): send "you've used 80% of this month's email quota" email to org admins. Same at 100%.

## 11. Compliance + audit

### 11.1 ANPC + GDPR

- Consent records: full audit chain (who, when, where, what was shown, IP).
- Suppression list: respected on every marketing send.
- Right-to-be-forgotten: cascades from §03 → revokes all consents, adds suppression entries for the diner's email + phone, purges `marketing_sends` recipient PII (keeps the shell for aggregate analytics).
- Data retention: opted-out diners' contact info retained 90 days then anonymised by §03's `diner.purge-anonymised` job.

### 11.2 Audit log

Every campaign lifecycle event writes to `audit_logs` via the canonical `AUDIT.marketing.*` keys (foundations §16.2). Every consent capture / revoke additionally writes to `marketing_consent_audit` (§4.11) — a higher-fidelity append-only domain-specific log, separate from `audit_logs` for the legal-basis-demonstrability obligation.

| Server action | `AUDIT.*` key | Subject | Notable context |
|---|---|---|---|
| `createCampaign` | `AUDIT.marketing.campaign_created` | campaign | `{ kind, channel, locale }` |
| `editCampaign` (incl. content + targeting changes) | `AUDIT.marketing.campaign_edited` | campaign | `{ version_number }` (snapshot in `marketing_campaign_versions`) |
| `pauseCampaign` / `unpauseCampaign` | `AUDIT.marketing.campaign_paused` | campaign | `{ paused: boolean }` |
| `archiveCampaign` | `AUDIT.marketing.campaign_archived` | campaign | `{ archived_at }` |
| campaign fan-out begins | `AUDIT.marketing.campaign_sent` | campaign | `{ recipient_count, scheduled_send_at }` |
| `createSegment` | `AUDIT.marketing.segment_created` | segment | `{ name, estimated_size }` |
| `editSegment` | `AUDIT.marketing.segment_edited` | segment | `{ changed_fields: [...] }` |
| `recordConsent` (capture) | `AUDIT.marketing.consent_captured` + `marketing_consent_audit` row | consent | `{ channel, source, locale }` |
| revoke consent (unsubscribe / STOP / admin) | `AUDIT.marketing.consent_revoked` + `marketing_consent_audit` row | consent | `{ channel, reason }` |
| add to suppression | `AUDIT.marketing.suppression_added` | suppression | `{ channel, reason }` |

The two new `AUDIT.marketing.*` categories used here (`campaign_created`, `campaign_edited`, `campaign_paused`, `campaign_archived`, `segment_created`, `segment_edited`) are added to the foundations §16.2 registry by this domain's migration.

### 11.3 The unsubscribe URL

`https://tavli.ro/u/<send_id>/<token>` — one-click unsubscribe per RFC 8058 (foundations §6.5):

1. **GET** renders a confirmation page with a clear "Unsubscribe" button — does **not** revoke consent. (Email-client link-prefetchers like Gmail's safe-link scanner fire GETs on every URL in the inbox; revoking on GET would mass-unsubscribe diners who haven't actively clicked.)
2. **POST** to the same endpoint processes the unsubscribe. RFC 8058 mandates this split: providers send the header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which tells compliant clients (Gmail, Apple Mail, Outlook) to issue a POST directly when the diner clicks the inbox-native "Unsubscribe" affordance.
3. POST handler revokes the relevant `customer_consents` row (sets `revoked_at = now()`).
4. Inserts `marketing_suppressions` row with `reason = 'unsubscribed'`.
5. Shows "you've been unsubscribed — change your mind?" link.

## 12. Analytics

### 12.1 Per-campaign

Aggregations over `marketing_sends`:
- Sent count (= rows with status in sent/delivered/opened/clicked).
- Delivery rate = (delivered + opened + clicked) / sent.
- Open rate (email only) = opened / delivered.
- Click rate = clicked / delivered.
- Bounce rate = bounced / sent.
- Complaint rate = complained / sent (kept < 0.1% — Gmail/Apple list deliverability red line).
- Unsubscribe rate = unsubscribed / sent.
- Conversion = count(distinct attributed_reservation_id) / sent.

Per-segment breakdown: same numbers, segmented by the segment definition that matched at send time.

### 12.2 Attribution

When a diner clicks a link in a marketing email and subsequently makes a reservation within 14 days, the reservation attributes to the campaign:
1. Click recorded in `marketing_link_clicks`.
2. On `createReservation`: check `marketing_sends` for this diner where `first_clicked_at` within last 14 days; if found, set `reservations.campaign_id = send.campaign_id` and `marketing_sends.attributed_reservation_id = reservation.id`.
3. The `campaign_id` on reservations enables the conversion query.

(`reservations.campaign_id` — the *column* is added by §02 §3.1 in its `reservations` alter. The *FK constraint* targeting `marketing_campaigns(id)` is added by §11's migration once `marketing_campaigns` exists, since §02 ships before §11 in the build sequence.)

### 12.3 Per-diner history

`/partner/diners/[id]` (§03) shows the diner's marketing history: every send received, whether opened/clicked, whether they unsubscribed.

### 12.4 Monthly send-volume report

A weekly summary email piggybacking on §07's weekly digest, plus a real-time usage widget on the campaigns dashboard: "212 / 1,000 emails used this month."

## 13. UI surfaces

### 13.1 Campaign list

`/partner/restaurants/[id]/campaigns` (or org-scoped). Tabs: Active triggered / One-off / Drafts / Archived. Each row: name, status, channel, segment size, last-sent, performance summary.

### 13.2 Campaign editor

Per §7.2.

### 13.3 Segment list + editor

`/partner/restaurants/[id]/segments`. Visual filter builder: stack of condition rows + AND/OR toggle. Live size preview. Save as named segment.

### 13.4 Diner consent panel

Inline on the §03 diner profile page — see "Marketing reachability" section in §03 §6.1. Shows: each channel + current consent state + suppression status + capture history.

### 13.5 Quota dashboard

`/partner/restaurants/[id]/marketing/usage`. Three meters (email / SMS / WhatsApp), filled per current-month usage. Trend chart 6 months back. Overage forecast.

### 13.6 Settings

`/partner/restaurants/[id]/marketing/settings`. Manages `restaurant_marketing_settings`: sender identity, sender ID, opt-ins, quiet hours.

## 14. Background jobs

| Job | Schedule / trigger | Purpose |
|---|---|---|
| `marketing.fan-out-campaign` | on campaign send / on scheduled time | Materialize segment, dedup, create `marketing_sends` rows, enqueue per-recipient `marketing.send-message` jobs. |
| `marketing.send-message` | per-recipient leaf job | Suppression + consent + cap + quiet-hours checks, then call channel-specific sender. |
| `marketing.process-resend-webhook` | webhook | Update `marketing_sends.status` from Resend events. **Idempotency via foundations §6.6 `webhook_events` table** keyed by `(provider='resend', provider_event_id)`. |
| `marketing.process-twilio-webhook` | webhook | Same for Twilio SMS + WhatsApp. **Same idempotency surface** keyed by `(provider='twilio', provider_event_id)`. |
| `marketing.refresh-segment-size` | every 6h | Recompute `marketing_segments.estimated_size`. |
| `marketing.fire-triggered-campaign` | per-trigger-event hook | Enqueued by §02/§03 on `reservation.completed`, `reservation.no_show`, `diner.created`, `diner.birthday`, `diner.lapsed_60d`. |
| `marketing.usage-alert` | hourly | Quota threshold alerts. |
| `marketing.compute-attribution` | every 5 min | Find reservations created in last 5 min from diners with recent campaign clicks; attribute. |
| `marketing.purge-old-link-clicks` | nightly | `marketing_link_clicks` older than 12 months are aggregated into `marketing_sends.click_count` only and detail rows purged. |
| `marketing.purge-opted-out-pii` | nightly (per §11.1) | After 90 days of opt-out, diner's PII anonymised. |
| `marketing.monthly-overage-billing` | first of month | Compute prior-month overages per org, hand off to §12 for invoicing. |

## 15. Tools & libraries

Beyond §00:
- `mjml@4.x` for email template authoring (better cross-client rendering than raw HTML). Or stick with React Email — decision in open question 1.
- `cron-parser@4.x` for schedule strings if we expose cron-style scheduling (defer).
- `iso8601-duration` for trigger offset parsing.

## 16. Build sequence

(Per launch-commitments §5 phasing options note 4 — this is the full v1 scope; phased options are recorded there.)

1. **Schema migration**: all marketing tables + enums + RLS. *(2 days)*
2. **`recordConsent` helper + `marketing_consent_audit` write.** *(0.5 day)*
3. **`marketing_suppressions` + Resend webhook + Twilio webhook handlers** (per §00). *(2 days)*
4. **`sendMarketingEmail` wrapper + link shortener + `/c/[send_id]/[token]` route.** *(1.5 days)*
5. **`sendMarketingSms` wrapper** *(depends on §00 SMS landed)*. *(1 day)*
6. **`sendMarketingWhatsapp` wrapper + template-registry table.** *(1.5 days)*
7. **`compileSegmentFilter` + segment-preview action + size estimation.** *(2 days)*
8. **Segment list + visual builder UI.** *(2.5 days)*
9. **`marketing.fan-out-campaign` + `marketing.send-message` jobs.** *(2 days)*
10. **Campaign builder UI** (template picker, content editor with i18n, schedule, preview, test send). *(4 days)*
11. **Campaign list + edit + pause + archive UI.** *(1.5 days)*
12. **Six triggered campaigns**: seed defaults + trigger hooks from §02/§03. *(2 days)*
13. **In-confirmation upsell integration** with §04's confirmation email path. *(1 day)*
14. **Frequency cap + quiet hours + quota enforcement** in the per-recipient leaf job. *(1 day)*
15. **Quota dashboard UI + alerts job.** *(1 day)*
16. **List-building surfaces**: booking-flow consent UI (§02 form extension), QR tent signup landing, venue-page footer form, walk-in manual add, CSV import tool. *(3 days)*
17. **Diner consent panel** (§03 inline + standalone). *(1 day)*
18. **Analytics dashboards** — per-campaign performance, per-segment breakdown, monthly send-volume report. *(2.5 days)*
19. **Attribution job** + `reservations.campaign_id` column + tie-back UI. *(1 day)*
20. **Unsubscribe flow** + `/u/[send_id]/[token]` route + post-unsub confirmation page. *(0.5 day)*
21. **Right-to-be-forgotten cascade** (per §13). *(0.5 day)*
22. **Trilingual copy** for all six default triggered campaigns + template library starters. *(2 days)*
23. **Visual regression tests** for the campaign editor + builder. *(0.5 day)*

**Total: ~35–37 working days for full v1 scope.** Largest single domain by line count *and* by build time in the spec (heavier than §08 table management, heavier than §10 corporate events). Heaviest pieces: campaign builder UI (step 10), segment builder UI (step 8), list-building surfaces across 5 entry points (step 16).

Phased option per `launch-feature-commitments.md` note 4:
- **Phase 1 (W8)**: steps 1–5, 7–9, parts of 10 (email only), 12 (3 campaigns: post-visit thank-you, in-confirmation upsells as the promo layer per §5.5, **lapsed_60 only** — not lapsed_120 or lapsed_180; pre-arrival reminder ships in §04 transactional and is not a §11 campaign), 14, 16 (booking-flow consent only), 18 (basic delivery + open + click only), 20. *(~18 days)*
- **Phase 2 (W12)**: add SMS (step 5), 11, 12 (remaining campaigns: birthday/anniversary, no-show follow-up, welcome series, **lapsed_120 + lapsed_180**), 15, 16 (QR + venue page + walk-in), 17, 19. *(~10 days)*
- **Phase 3 (W16)**: WhatsApp (step 6), additional in-confirmation upsell content (13), full analytics including per-segment + per-diner history (18 advanced), 21–22. *(~7 days)*

The lapsed-diner sub-campaigns are phased because lapsed_60 is the highest-volume + highest-leverage (40% of marketing engagement at most operators). 120/180 fire less often + their value is mostly redundant with 60 — easy v1.5 add.

## 17. Open questions

1. **MJML or React Email for marketing templates?** React Email is what §04 uses transactionally. MJML has historically been the marketing-email standard with stronger Outlook compatibility. Recommendation: stick with React Email — one toolchain, simpler. Add MJML only if Outlook rendering becomes an issue.

2. **Should `pre_arrival` be one or two emails?** I.e., is the marketing version a separate send or a layer on the transactional? Recommendation: layered. One physical send; marketing-layer adds the promo block when the in-confirmation campaign matches. Avoids the second-send fatigue.

3. **Should triggered campaigns be tweakable per restaurant or only per org?** Recommendation: per restaurant. A flagship venue and a casual venue might want different welcome series copy. Triggered campaigns can be cloned from org-default to per-venue.

4. **Should we allow scheduled SMS at 09:00 if quiet hours are 10:00–21:00?** Recommendation: defer to next quiet-hours-allowed window (i.e., 10:00). Strict enforcement. ANPC defensibility.

5. **Should the segment builder support exclude-list segments (NOT IN this segment)?** Recommendation: yes — top-level `not` combinator wraps an inner filter expression. Useful for "everyone except recent visitors."

6. **Should overage have a hard cap or just bill?** Recommendation: org-admin sets a hard cap per channel (default 5x allowance). Prevents runaway bills. Below cap = bill; at cap = skip with admin alert.

7. **Conversion attribution window — 14 days or longer?** Recommendation: 14 days default, configurable per campaign (3, 7, 14, 30). Shorter for "book tonight" promos, longer for "winter menu launches in 4 weeks" awareness campaigns.

8. **WhatsApp template approval is per-locale per-template** — Meta requires explicit approval for every template, every locale, every time content changes meaningfully. For triggered campaigns: 6 campaigns × 3 locales = 18 approvals. **For one-off campaigns: each one needs its own approvals before send** — an operator who wants to send a custom Friday-jazz promo via WhatsApp submits the template to Meta first (24–72h lead time, sometimes longer). Operational implications:
   - The campaign builder UI must show "Submit template for Meta approval" as a distinct step before "Schedule send." Status indicator: pending / approved / rejected.
   - The pre-approved template library covers ~80% of common use cases (welcome / lapsed / themed night / off-peak fill in all 3 locales — ~36 templates). Operators using these skip the approval step.
   - Rejected templates: surface Meta's rejection reason to the operator. Common rejections: too promotional, missing opt-out language, contains unsupported variables.
   - Approval lead time is the constraint that makes WhatsApp the slowest channel by far. Reflected in the UI ("WhatsApp campaigns require ~48h of lead time before send").

9. **List growth via referrals?** Recommendation: defer to v1.5 — referral campaigns + ambassador rewards add complexity that isn't blocking launch. The spec already lists loyalty/referrals as v1.5.

10. **Should diners be able to update their own consents via a self-serve page?** Recommendation: yes — diner-facing `/diners/preferences/[token]` (token from any marketing email's footer). Shows per-channel toggle. Inserts new consent records.

11. **Should the campaign builder show predicted send time (when fan-out completes)?** Recommendation: yes — for a 5000-diner segment, fan-out takes ~10 min on the worker. Show the estimate so the operator doesn't think it's broken.

12. **A/B testing on subject lines?** Recommendation: deferred to v1.5 per `launch-feature-commitments.md` §7.

## 18. Cross-references

- **§00 Foundations** — Resend / Twilio wrappers, pg-boss, i18n, suppressions + audit log + idempotency-keys tables.
- **§01 Identity & accounts** — `can()` matrix for `campaign.*`.
- **§02 Bookings** — booking-flow consent capture; `reservation.confirmed/completed/no_show` events fire triggered campaigns; `reservations.campaign_id` column added here.
- **§03 Diner database** — `diners.birthday_date` + `anniversary_date` columns; consent + suppression + send rows reference `diner_id`; per-diner marketing-history view rendered here, surfaced on the diner profile.
- **§04 Diner communication** — shares Resend/Twilio infrastructure; in-confirmation upsells integrate with the confirmation email path.
- **§05 Venue page** — QR tent signup writes consents here; venue-page footer form does the same.
- **§06 Reviews** — review-flow consent capture writes consents here.
- **§07 Analytics & reports** — campaign analytics surfaced here; aggregate dashboards consume.
- **§09 Multi-location** — campaigns can be org-wide; suppression is org-scoped.
- **§12 Billing & subscriptions** — monthly overage invoice line; quota allowances tied to Pro subscription state. (The shared `webhook_events` idempotency table is owned by foundations §6.6, not §12 — Stripe + Resend + Twilio webhooks all key into the same table.)
- **§13 Compliance & legal** — GDPR + ANPC defensibility lives across this doc; data export includes marketing history; right-to-be-forgotten cascades into suppression + consent revocation.

---

*Last updated: 2026-05-20. Largest single domain in the spec by line count and build time. Full v1 scope ≈ 35–37 days; phased option ≈ 18 (W8) + 10 (W12) + 7 (W16) = 35 days, same total, delivered in stages.*
