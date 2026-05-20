# 13 — Compliance & Legal

> Cross-cutting orchestration: the central audit log, GDPR right-to-be-forgotten orchestration across domains, the contractual data-export-on-cancellation flow, retention + purge automation, rate limiting infrastructure, ANPC defensibility, cookie consent. This doc binds the compliance hooks that other domains expose into a single legal posture.

## Contents

1. [Scope](#1-scope)
2. [Current state](#2-current-state)
3. [Architectural pillars](#3-architectural-pillars)
4. [Data model](#4-data-model)
5. [The audit-log write helper](#5-the-audit-log-write-helper)
6. [GDPR request lifecycle](#6-gdpr-request-lifecycle)
7. [Data-export-on-cancellation](#7-data-export-on-cancellation)
8. [Retention + purge automation](#8-retention--purge-automation)
9. [Rate limiting](#9-rate-limiting)
10. [Cookie consent](#10-cookie-consent)
11. [Legal-content surfaces](#11-legal-content-surfaces)
12. [UI surfaces](#12-ui-surfaces)
13. [Background jobs](#13-background-jobs)
14. [Tools & libraries](#14-tools--libraries)
15. [Audit + compliance posture](#15-audit--compliance-posture)
16. [Build sequence](#16-build-sequence)
17. [Open questions](#17-open-questions)
18. [Cross-references](#18-cross-references)

## Dependencies

Reads from foundations:
- **§3.2 `ActionResult<T>`** — every server action in this domain returns `ActionResult<T>`.
- **§3.4 `can()`/`requireCan()`** — `'gdpr.request.create'`, `'gdpr.request.execute'`, `'audit_log.read'`, `'retention_policy.write'` permissions live in the §01 matrix.
- **§4.7 foundation tables** — `rate_limits`, `idempotency_keys` are consumed here; this domain owns `rate_limits`'s policy + middleware.
- **§6.6 `webhook_events`** — referenced by audit reconciliation; not redeclared.
- **§15a.1 GDPR erasure pattern** — canonical `redacted_at` + `erasure_log` model; no JSONB-regex sweeps. This domain owns the cascade orchestration.
- **§15a.6 ANPC + EU VAT** — ANSPDCP cookie-consent guidance; consumer-protection notice surface.
- **§15a.3 NIS2** — out-of-scope reaffirmed in §15.4; quarterly threshold-review checkpoint.
- **§15a.4 EU AI Act** — out-of-scope reaffirmed in §15.5; AI-feature introduction triggers re-assessment.
- **§15a.5 DSA** — minimum-obligation-tier scope; transparency report owned here, notice-and-action UI owned in §06.
- **§15a.8 Data residency** — EU-only sub-processors.
- **§16.1 `ERROR_CODES`** — compliance errors live in TV1100–TV1199.
- **§16.2 `AUDIT`** — all audit actions written through the `AUDIT.compliance.*` registry; `recordAudit` rejects unregistered keys.
- **§16.3 `JOBS`** — pg-boss job keys live under `JOBS.compliance.*`.

Writes back to foundations:
- **§16.1 ERROR_CODES**: TV1101 = `identity_not_verified`, TV1102 = `rate_limit_exceeded`, TV1103 = `gdpr_deadline_extension_capped`, TV1104 = `processing_restricted`.
- **§16.2 AUDIT.compliance**: extended beyond the initial 4 actions to cover the full §13 vocabulary (see §5.2).
- **§16.3 JOBS.compliance**: extended to cover the operational jobs declared in §13.

## 1. Scope

This domain owns: the `audit_logs` table that every other domain writes to, the orchestrator that fulfils GDPR data-subject requests, the retention / purge automation, the rate-limit infrastructure used by §02 widget + §11 list-import + other public surfaces, the cookie-consent banner, and the legal-content surfaces (privacy policy, terms, ANPC-required notices).

It does **not** own: domain-specific data — the auth state lives in §01, diner data in §03, billing data in §12, etc. This doc orchestrates *across* them.

### Checkboxes covered

From §4 Contractual promises (the operational mechanics):
- [ ] "You own your data." Cancel any time and we hand you a full CSV export
- [ ] One-click cancellation in product *(UI in §12; this doc owns the data-export-on-cancel orchestration)*
- [ ] Card-on-file at signup, auto-charge day 91 *(§12; this doc owns the audit trail)*

From §1 Tavli (Base):
- [ ] GDPR + ANPC compliance baseline _(Architectural property, no single deliverable: every domain ships its own hook; this doc orchestrates the cascade and owns the legal-content surface. The baseline is satisfied when every PII-bearing table has a `redacted_at` column registered in `pii-table-registry.ts` AND a row in `retention_policies` AND a per-domain anonymisation handler.)_

From cross-cutting hooks throughout:
- [ ] Right-to-be-forgotten cascade across all domains
- [ ] 24-month minimum retention of `diner_pii_access_log` (§03)
- [ ] 7-year retention of `billing_audit_log` (§12)
- [ ] Indefinite retention of `marketing_consent_audit` (§11)
- [ ] Cookie consent banner
- [ ] Rate limiting for widget + public APIs

## 2. Current state

**Exists** (minimal):
- Email send via Resend leaves no audit trail today.
- Reservation cancellations capture `cancelled_at` + `cancelled_reason` (some audit shape).
- No central audit table.
- No GDPR-request handling tooling.
- No cookie consent surface.
- No rate-limit infrastructure.

**Specified in `00-foundations.md`:** the `audit_logs` table + write helper (§17.12).

This doc takes the §00 substrate and orchestrates it.

## 3. Architectural pillars

### 3.1 Audit is append-only, system-of-record

`audit_logs` is the canonical log of every consequential action across the platform. Every domain writes to it via a shared helper. The table is never updated, only inserted (except for tombstoning on GDPR purges).

Domain-specific audit tables (`reservation_status_log`, `table_status_log`, `marketing_consent_audit`, `billing_audit_log`, `diner_pii_access_log`) coexist with `audit_logs` — they're higher-fidelity per-domain. `audit_logs` is the cross-domain query surface.

### 3.2 GDPR is an orchestrated cascade, not a single delete

A right-to-be-forgotten request triggers a multi-step cascade:
1. Verify the request (identity, jurisdiction).
2. Each domain's anonymisation handler runs in dependency order.
3. Audit the cascade itself.
4. Schedule final hard-delete after the legally required cooling-off period.

No single SQL DELETE statement can fulfil GDPR for a diner — the data is in 15+ tables across 5+ domains with different retention rules.

### 3.3 Retention is a policy table, not a code constant

`retention_policies` is a config table: per audit-bearing table, what's the retention period, what's the purge action (hard delete / anonymise / archive). Nightly job reads + enforces. Changing a retention rule = updating one row, not a code deploy.

### 3.4 Rate limiting lives in shared middleware, not per-endpoint

A single `rate_limits` table + `enforceRateLimit(key, scope, limit, window)` helper. Every public endpoint declares its limits at the top of the handler. Centralised tuning + reporting.

## 4. Data model

### 4.1 New table: `audit_logs`

The central cross-domain audit log. Per `00-foundations.md` §17.12.

```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),

  -- Who
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type varchar(20) not null,                              -- 'user' | 'service' | 'cron' | 'webhook' | 'anonymous_token'
  actor_ip inet,
  actor_user_agent varchar(500),

  -- What
  action varchar(120) not null,                                  -- 'reservation.created' | 'organization.member_invited' | 'marketing.campaign_sent' | etc.; full catalogue in foundations §16.2 AUDIT registry

  -- Subject (the thing acted upon)
  subject_type varchar(40) not null,                             -- 'reservation' | 'organization' | 'campaign' | 'diner' | etc.
  subject_id uuid,
  subject_organization_id uuid references organizations(id) on delete set null,    -- audit rows survive org deletion (retention > org lifetime)
  subject_restaurant_id uuid references restaurants(id) on delete set null,        -- same — audit rows are soft references at time of action

  -- Context (action-specific structured data)
  context jsonb not null default '{}'::jsonb,                    -- before/after, payload snapshots, error codes, reasons
  outcome varchar(20) not null default 'success',                -- 'success' | 'failure' | 'partial'
  failure_code varchar(60),

  -- When
  occurred_at timestamptz not null default now()
);

-- Indices are heavy because this table is read-frequently for audit views.
create index audit_logs_subject on audit_logs (subject_type, subject_id, occurred_at desc);
create index audit_logs_org on audit_logs (subject_organization_id, occurred_at desc);
create index audit_logs_actor on audit_logs (actor_user_id, occurred_at desc) where actor_user_id is not null;
create index audit_logs_action on audit_logs (action, occurred_at desc);
create index audit_logs_failure on audit_logs (occurred_at desc) where outcome = 'failure';

-- RLS: org members read their org's audit log (filtered by subject_organization_id). Tavli admin sees everything.
-- Writes are service-role only (via the recordAudit helper).
alter table audit_logs enable row level security;

create policy "audit_logs_org_member_select" on audit_logs
  for select using (
    subject_organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true
    )
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- RLS bodies for compliance tables (locked, no longer elided):

-- data_subject_requests: org-admins read their own org's rows (via the diner_id → org join); the linked diner reads their own.
-- Tavli admin is the only writer. The body:
alter table data_subject_requests enable row level security;

create policy "dsr_org_admin_select" on data_subject_requests
  for select using (
    -- Org admins see DSRs for diners belonging to their org's restaurants
    exists (
      select 1 from diners d
      join restaurants r on d.restaurant_id = r.id
      join organization_members om on om.organization_id = r.organization_id
      where d.id = data_subject_requests.diner_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('owner', 'admin')
    )
  );

create policy "dsr_subject_diner_select" on data_subject_requests
  for select using (
    -- The diner themselves (if their user account is linked) reads their own
    diner_id in (
      select id from diners where linked_user_id = auth.uid()
    )
  );

create policy "dsr_tavli_admin_all" on data_subject_requests
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- retention_policies: Tavli admin only. No org access. Service-role for the nightly job.
alter table retention_policies enable row level security;

create policy "retention_policies_admin_only" on retention_policies
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- rate_limits: service-role only — never queried via RLS-bound clients. Force-deny all authenticated/anon access.
alter table rate_limits enable row level security;
create policy "rate_limits_deny_all" on rate_limits for all using (false);

-- cookie_consents: visitor-session-scoped via session_id matching a request-scoped cookie.
-- The session_id is a first-party cookie; the RLS check matches the cookie value via a SET LOCAL parameter
-- set by the request pipeline. See `src/lib/cookies/scope.ts` for the SET LOCAL implementation.
alter table cookie_consents enable row level security;
create policy "cookie_consents_session_match" on cookie_consents
  for select using (visitor_session_id::text = current_setting('app.visitor_session_id', true));
create policy "cookie_consents_admin_all" on cookie_consents
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
```

### 4.2 New table: `data_subject_requests`

GDPR Articles 15, 16, 17, 20 (access, rectification, erasure, portability) tracking.

```sql
create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),

  -- Subject (the data subject — usually a diner)
  diner_id uuid references diners(id) on delete set null,        -- nullable: a request may target a specific diner OR a phone/email lookup
  identifier_phone varchar(20),                                   -- E.164; when diner not yet resolved
  identifier_email varchar(255),

  -- Request
  request_kind varchar(40) not null,                              -- 'access' | 'rectification' | 'erasure' | 'portability' | 'restrict_processing' | 'object'
  request_source varchar(40) not null,                            -- 'in_product' | 'email' | 'postal' | 'verbal'
  request_body text,                                              -- diner's own words

  -- Identity verification
  identity_verified boolean not null default false,
  identity_verification_method varchar(60),                       -- 'matched_phone_otp' | 'matched_email_token' | 'tavli_admin_manual'
  identity_verified_at timestamptz,
  identity_verified_by_user_id uuid references auth.users(id) on delete set null,

  -- Status
  status varchar(20) not null default 'received',                 -- 'received' | 'in_progress' | 'completed' | 'rejected'
  rejection_reason text,
  completed_at timestamptz,

  -- Legal deadlines (GDPR: 30 days)
  legal_deadline_at timestamptz not null,                         -- received_at + 30 days + (deadline_extension_days × 1 day); computed in §6.2

  -- Tavli-admin extension (GDPR Art 12(3) allows up to 2 months; Tavli policy caps at 14 days)
  deadline_extension_days smallint not null default 0,
  deadline_extension_reason text,                                  -- mandatory free-text when deadline_extension_days > 0
  deadline_extended_by_user_id uuid references auth.users(id) on delete set null,
  deadline_extended_at timestamptz,

  -- Output (for access + portability)
  export_storage_path text,
  export_signed_url_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cap the extension at 14 days; mandatory reason when extended.
  constraint chk_dsr_deadline_extension_cap check (deadline_extension_days between 0 and 14),
  constraint chk_dsr_deadline_extension_reason check (
    (deadline_extension_days = 0 and deadline_extension_reason is null)
    or (deadline_extension_days > 0 and deadline_extension_reason is not null and deadline_extended_by_user_id is not null)
  )
);

create index data_subject_requests_status on data_subject_requests (status, legal_deadline_at) where status in ('received', 'in_progress');
create index data_subject_requests_diner on data_subject_requests (diner_id) where diner_id is not null;
```

### 4.3 New table: `retention_policies`

```sql
create table retention_policies (
  id uuid primary key default gen_random_uuid(),
  scope_table varchar(80) not null unique,                        -- 'audit_logs', 'transactional_email_log', 'reservation_status_log', etc.
  retention_period_days integer not null,                         -- e.g., 730 = 24 months
  action_on_expiry varchar(20) not null,                          -- 'hard_delete' | 'anonymise' | 'archive_offline'
  applies_to_column varchar(60) not null default 'created_at',    -- which timestamp drives the age check
  exception_predicate text,                                        -- SQL fragment: rows matching are EXCLUDED from purge (e.g., "subject_type = 'subscription'" stays forever)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Seed data (the locked policies):

| scope_table | retention_period_days | action | rationale |
|---|---|---|---|
| `audit_logs` | 2555 (7 years) | hard_delete | RO Codul Fiscal accounting retention (since billing events flow here) |
| `transactional_email_log` | 730 (24 months) | hard_delete | ANPC inspection window |
| `reservation_status_log` | 1825 (5 years) | hard_delete | Industry standard for booking history |
| `table_status_log` | 365 (12 months) | hard_delete | Operational data, not legally retained |
| `diner_pii_access_log` | 730 (24 months) | hard_delete | ANPC PII-access defensibility |
| `marketing_consent_audit` | 9999 (effectively indefinite) | hard_delete | GDPR Art 7(1) — must demonstrate consent indefinitely while consent is live; rows for revoked consents may purge 730 days post-revocation (per §4.3.1 predicate below) |
| `marketing_link_clicks` | 365 (12 months) | hard_delete | Pure analytics; rolled into `marketing_sends.click_count` before purge |
| `marketing_sends` | 1095 (3 years) | anonymise | PII (recipient_email/phone) cleared; analytics shell retained for reporting |
| `webhook_events` | 90 | hard_delete | Idempotency log only, not legally significant |
| `billing_audit_log` | 2555 (7 years) | hard_delete | RO Codul Fiscal |
| `data_subject_requests` | 1825 (5 years) | hard_delete | Demonstrates GDPR compliance history |

#### 4.3.1 The `marketing_consent_audit` exception predicate (locked)

The `retention_policies` row for `marketing_consent_audit` has:

```sql
exception_predicate = jsonb_build_object(
  'table', 'marketing_consents',
  'condition', 'active_consent_exists',
  'predicate_sql', $$
    not exists (
      select 1 from marketing_consents mc
      where mc.diner_id = marketing_consent_audit.diner_id
        and mc.channel = marketing_consent_audit.channel
        and mc.revoked_at is null
    )
  $$
)
```

The predicate's runtime check (executed at each nightly retention pass): a `marketing_consent_audit` row may purge only if **730 days have elapsed since revocation AND there is no active `marketing_consents` row for `(diner_id, channel)`**. If a diner later re-consents on the same channel, the audit trail of the prior consent + revocation is retained — required by GDPR Art 7(1) to demonstrate the historical consent lifecycle.

The retention job (`compliance.enforce-retention`, §8.1) reads the JSONB predicate and inlines its `predicate_sql` fragment into the delete query via parameterised SQL — never via string interpolation, to prevent SQL injection.

### 4.4 New table: `rate_limits`

Per-key + per-scope counters with sliding-window expiry.

```sql
create table rate_limits (
  key varchar(200) not null,                                      -- e.g., 'widget:reservation:<ip>' | 'login:<email>' | 'consent_import:<org_id>'
  scope varchar(60) not null,                                     -- 'widget_booking' | 'login_attempt' | 'consent_import' | 'public_search'
  window_start timestamptz not null,                              -- start of the current window bucket
  window_end timestamptz not null,                                -- start + window_duration
  count integer not null default 1,
  expires_at timestamptz not null,                                -- for automatic cleanup
  primary key (key, window_start)
);

create index rate_limits_expires on rate_limits (expires_at);
```

Eventually replaced by Redis or a similar low-latency store when load demands. For launch, Postgres is sufficient.

### 4.5 New table: `cookie_consents`

```sql
create table cookie_consents (
  id uuid primary key default gen_random_uuid(),
  visitor_session_id uuid not null,                               -- generated client-side, stored in a first-party cookie
  diner_id uuid references diners(id) on delete set null,         -- linked when the visitor becomes known
  organization_id uuid references organizations(id) on delete set null,  -- when on a venue page

  essential boolean not null default true,                        -- always true; non-optional
  analytics boolean not null default false,
  marketing_tracking boolean not null default false,

  granted_ip inet,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,                                -- granted_at + 13 months (CNIL recommendation)
  revoked_at timestamptz
);

create index cookie_consents_session on cookie_consents (visitor_session_id, granted_at desc);
```

## 5. The audit-log write helper

### 5.1 API

```ts
// src/lib/audit/record.ts — canonical form per foundations §16.2.

export async function recordAudit(input: {
  action: AuditActionKey                    // typed; the union of every leaf in foundations AUDIT registry; unregistered strings rejected at compile time
  subjectType: string                       // e.g., 'reservation' | 'organization' | 'diner' | 'subscription'
  subjectId: string | null                  // FK id of the subject; null only for org/restaurant-level actions where the subject IS the org
  actorUserId: string | null                // null when actor_type = 'service' | 'cron' | 'webhook' | 'anonymous_token'
  actorRole: ActorRole                      // 'tavli_admin' | 'org_owner' | 'org_manager' | 'restaurant_owner' | ... | 'system'
  impersonatorUserId?: string               // set when a tavli_admin is impersonating; per §01 §5.3
  organizationId?: string
  restaurantId?: string
  context?: Record<string, unknown>          // jsonb; max 4KB; FK ids only — never denormalised PII strings (§16.2)
  outcome?: 'success' | 'failure' | 'partial' // default 'success'
  failureCode?: string                       // when outcome != 'success'; e.g., 'TV1101'
  ip?: string                                // captured from request when available
  userAgent?: string
}): Promise<void>
```

Called from every server action, every webhook handler, every job. Cheap (single INSERT) but unconditional. The `action` parameter is typed via `keyof typeof AUDIT` flatten — unregistered strings fail at compile time per foundations §16.2.

**Atomicity (locked):** `recordAudit` is `await`-ed in the same transaction as the mutation when possible. When the mutation lives outside a Tavli-controlled transaction (e.g., the Stripe API call already succeeded and we're just mirroring), the audit write fires via Next.js `after()` with retry-on-failure; the same retry-storm avoidance pattern as `loadActiveSubscription` (§12 §3.5).

### 5.2 Action naming convention

`<domain>.<entity>.<verb>`. Examples (full canonical catalogue lives in foundations §16.2 `AUDIT` registry):
- `reservation.created`, `reservation.modified`, `reservation.cancelled`
- `organization.member_invited`, `organization.member_joined`, `organization.member_removed`
- `restaurant.staff_invited`, `restaurant.staff_added`, `restaurant.staff_removed`
- `user.role_changed`
- `marketing.campaign_sent`
- `billing.subscription_updated`
- `diner.pseudonymised`
- `compliance.gdpr_request_received`, `compliance.dsar_exported`

Lower-snake-case; stable over time (never rename — would break historical queries). New actions must be added to the foundations registry before use; the `recordAudit()` helper rejects unregistered action strings at compile time.

### 5.3 Context payload conventions

For mutations: `{ before: {...}, after: {...}, fields_changed: [...] }`.
For deletions: `{ deleted: {...} }`.
For lookups (rare audit cases): `{ query_params: {...}, result_count: N }`.
For GDPR cascade events: `{ data_subject_request_id: ..., stage: 'started' | 'in_progress' | 'completed' }`.

Schema-loose by design — `context` is a JSONB column. Audit queries usually filter on `action` + `subject_id`, not deep into the JSON.

**Failed / rate-limited operations** are also audited (per §1 — "system-of-record"). When a server action returns `fail('rate_limited')` / `fail('forbidden')` / `fail('invalid_input')`, the action writes an `audit_logs` row with `outcome = 'failure'` and `context` containing the attempted-data summary in **PII-redacted form**:

- Phone numbers → last 4 digits only (`+40•••1234`).
- Email addresses → first character + domain (`j•••@example.com`).
- Names → first initial + length (`J·· (5 chars)`).
- Free-text payloads → truncated to 80 chars + character-count.

The redaction is performed by `src/lib/audit/redact-pii.ts` before the audit-log insert, so failed-request audit rows are never themselves a PII liability. The redaction function is unit-tested and covered by the nightly verification job (§6.3 step i).

## 6. GDPR request lifecycle

### 6.1 Surfaces for receiving requests

- **In-product (diner-side)**: `/reservations/[token]/privacy` → buttons for "Export my data," "Delete my data," "Update my data."
- **Email**: `privacy@tavli.ro` (Tavli admin triages, manually creates a `data_subject_requests` row).
- **Postal / verbal**: Tavli admin enters manually with `request_source` accordingly.

### 6.2 Identity verification

Per GDPR Art 12(6) — when in doubt about a requester's identity, demand verification.

- **Token-based** (diner clicks a link from a real confirmation email they received): `identity_verified = true` automatically. Their possession of the token proves access to the email.
- **Phone match**: OTP to the phone number on file. If it matches a diner with that phone, verified.
- **Email match**: signed link to the email on file.
- **Tavli admin manual**: human override (rare; e.g., legal compliance request from a guardian for a minor).

**The 30-day clock and identity-verification interplay (locked):**

Per GDPR Art 12(3), the 30-day clock starts **at request receipt** — not when identity is verified. This creates a tension when the requester is slow to verify. Resolution:

1. **Clock starts at receipt** (`data_subject_requests.created_at`). The `legal_deadline_at` column is computed at insert as `created_at + interval '30 days'`.
2. **Unverified requests after day 25**: a daily job (`compliance.auto-reject-unverified`) auto-rejects requests still in `identity_verified = false` at `created_at + 25 days`, with `rejection_reason = 'identity_unconfirmed'`. The reject email tells the requester they can re-submit; doing so creates a **separate, fresh `data_subject_requests` row** with its own independent 30-day clock from the new `created_at` — this is not a "reset" of the original clock (which GDPR Art 12(3) would not allow), but a brand-new request triggered by the requester's new submission. Art 12(6) explicitly permits refusal when identity cannot be established, which is what justifies the day-25 rejection in the first place.
3. **Tavli admin extension**: when there's good-faith reason to believe identity verification is in progress (e.g., the diner has been emailing back and forth with privacy@tavli.ro), a Tavli admin may extend the verification window by **up to 14 days** via the admin GDPR queue. The extension writes `data_subject_requests.deadline_extension_days` (new column, default 0, max 14) and `deadline_extension_reason` (mandatory free-text). The extended `legal_deadline_at` is `created_at + interval '30 days' + (deadline_extension_days * interval '1 day')`. GDPR Art 12(3) permits a one-time 2-month extension "taking into account the complexity and number of requests"; the 14-day cap is Tavli's internal policy to keep response times tight.
4. **Audit trail**: every extension writes an `audit_logs` row with `action = AUDIT.compliance.gdpr_deadline_extended`, `context = { request_id, extension_days, reason, extended_by_user_id }`. The diner-side privacy page reflects the extended deadline.

Unverified requests within the 25-day grace stay in `status = 'received'` until verified or auto-rejected.

### 6.3 The cascade — erasure (right-to-be-forgotten)

**Per foundations §15a.1, every PII-bearing table has a `redacted_at timestamptz` column.** The erasure job iterates these tables in a defined dependency order (parent → child) and writes an `erasure_log` row per table-row redacted. The full table registry of PII-bearing tables is maintained at `src/lib/compliance/pii-table-registry.ts` (a single source of truth so this domain doesn't drift from foundations); the helper exports both the ordered list (for the erasure cascade) and an exhaustive set (for the §13 §15.2 Record of Processing Activities).

The list below enumerates the v1 PII-bearing tables. Adding any new PII-bearing table to the schema requires (a) adding `redacted_at`, (b) registering it in `pii-table-registry.ts`, (c) implementing the per-domain anonymisation step, and (d) adding a row to `retention_policies` if not already covered.

Once verified + the request is `'in_progress'`:

```
1. Resolve the diner (or diners — same person at multiple orgs).
2. For each org's diner record:
   a. Run §03 `anonymiseDiner(dinerId, reason='gdpr_erasure')`:
      - Clears phone, email, name, notes, preferences.
      - Sets `diners.anonymised_at`.
   b. Cascade to §02: anonymise reservation rows (clear guest_name, guest_phone, guest_email).
   c. Cascade to §06: anonymise reviews (clear first_name; keep `comment` unless personally identifying).
   d. Cascade to §11: revoke all `customer_consents`, add `marketing_suppressions` for the diner's email + phone + WhatsApp identifiers, anonymise `marketing_sends.email`/`phone` (note: columns no longer prefixed with `recipient_`).
   e. Cascade to §08: anonymise `walkin_queue` entries (clear guest_name, guest_phone).
   f. Cascade to §04: anonymise `transactional_email_log.email`/`phone`.
   g. Cascade to §10: anonymise event-request buyer identity fields if applicable; also `corporate_lead_intents` if a row points at the diner.
   h. **Cascade to `partner_notifications`** (canonical two-phase erasure, per foundations §15a.1). The `partner_notifications` table is **owned by §04**; the `pending_erasure boolean default false` + `pending_erasure_request_id uuid references data_subject_requests(id)` columns referenced below are added by §04's schema migration but driven by this domain's cascade. The erasure handler does NOT regex-replace strings in the JSONB. Instead, two phases:
      - **Phase 1**: mark each affected `partner_notifications` row with `pending_erasure = true` and `pending_erasure_request_id = $request_id`. The marker tells read paths to filter out these rows immediately even before the second phase completes. Insert an `erasure_log` row (`table_name = 'partner_notifications'`, `phase = 1`).
      - **Phase 2** (runs after the row-by-row verification confirms phase 1 is consistent — typically a few minutes later): either hard-delete the row (if the notification has no operational value — e.g., already-delivered transactional notifications past their 30-day display window) OR replace `payload` with `{ erased: true, erasure_log_id: <uuid>, original_kind: '<kind>' }` (if the notification's existence still matters for audit but the body is PII-laden). Insert a second `erasure_log` row (`phase = 2`).
      - Both phases write to `erasure_log` per foundations §15a.1.
      - Domain code in §04 that stored denormalised PII in `partner_notifications.payload` should be refactored to use FK references (`{ diner_id, reservation_id }`) so future erasures simply null the FK target. The two-phase pattern above is the legacy-data fallback until that refactor lands.
   i. **Cascade to `audit_logs.context`** (canonical no-regex pattern, per foundations §15a.1): for every row where `subject_type = 'diner' and subject_id = $diner_id` OR `context` payload was inserted by a domain action that touched the diner:
      - Set `audit_logs.redacted_at = now()`.
      - **Replace** the entire `context` JSONB with `{ erased: true, erasure_log_id: <uuid>, original_action: '<action>' }`. **No partial regex substitution; no recursive string walk.** Domain code that inserted diner-identifying PII into `context.before`/`context.after` strings is a **bug** in the domain layer — refactor those audit-writes to use FK ids only (`{ diner_id, reservation_id }`) so future erasures simply null the FK target via the diner-row cascade. The full-`context`-replacement above is the legacy-data fallback until that refactor lands.
      - Insert an `erasure_log` row (foundations §15a.1) per `audit_logs` row redacted: `table_name = 'audit_logs'`, `fields_erased = ['context']`, `reason = 'gdpr_art_17'`.
      - Operational columns (`action`, `subject_type`, `subject_id`, `actor_user_id`, `occurred_at`) survive — they are not PII and the audit trail of the redaction itself must remain queryable.
      - Batched in chunks of 1000 rows; each chunk wrapped in a transaction.
      - **Verification job**: a nightly job re-reads every redacted `audit_logs` row and asserts `context->>'erased' = 'true'`. Any residual PII found triggers a Sentry alert at `level: 'error'` — this would indicate the erasure path missed a row and is a P1 compliance bug.
   j. **Cascade to `billing_audit_log.context`** (same no-regex pattern; required to avoid orphaning PSD2 consent evidence and Stripe-event PII): for every row where the diner-or-operator PII appears in the JSONB context (typically rows with `event_type IN ('billing.psd2_consent_captured', 'billing.payment_succeeded', 'billing.payment_failed', 'billing.subscription_created')` belonging to the diner's org):
      - Set `billing_audit_log.redacted_at = now()`.
      - **Replace** the entire `context` JSONB with `{ erased: true, erasure_log_id: <uuid>, original_event_type: '<event_type>', preserved_fiscal_data: { amount_cents, currency, stripe_invoice_id } }`. Note: `actor_email` / `actor_name` are JSONB **keys inside `context`**, not columns on `billing_audit_log` — wholesale `context` replacement nulls them out by construction.
      - Operational + fiscal columns survive on the row: `event_type`, `organization_id_at_event`, `organization_id` (may be SET NULL via cascade), `actor_user_id`, `occurred_at`. The fiscal amounts that survive Art 17 live in the new `preserved_fiscal_data` sub-object of `context` — required for the 7-year RO Codul Fiscal retention (GDPR Art 17(3)(b) — legitimate interest in legal obligation).
      - Insert an `erasure_log` row: `table_name = 'billing_audit_log'`, `fields_erased = ['context']`, `reason = 'gdpr_art_17_with_fiscal_retention'`.
      - The same verification job (`JOBS.compliance.erasureVerify`) covers `billing_audit_log` alongside `audit_logs`.
3. Schedule §03's `diner.purge-pseudonymised` job to hard-delete the diner row at +30 days (the foundations §15a.1 reversibility window — matches §03 §7 and §03 §8.2).
4. Update `data_subject_requests.status = 'completed'`, `completed_at = now()`.
5. Send confirmation email to the requester (templated, in §04: `DataDeletionConfirmedEmail`).
6. Audit log: `AUDIT.compliance.erasure_executed` with cascade details (`context = { data_subject_request_id, diner_ids: [...], tables_redacted: [...], rows_redacted_total }`).
```

The cascade itself is implemented as a pg-boss job `JOBS.compliance.erasureExecute(requestId)` — runs each step in a transaction, retries the whole thing on failure. The verification sweep is `JOBS.compliance.erasureVerify`, scheduled nightly per foundations §15a.1.

### 6.4 The cascade — access + portability

`exportDinerData(dinerId)` per §03 §8.3 is the worker.

For a portability request the export bundle includes:
- The diner's profile (§03).
- All bookings (§02, including cancelled/anonymised history if not yet purged).
- All reviews (§06).
- All marketing sends + opens + clicks (§11).
- All consent history (§11 `marketing_consent_audit`).
- All `transactional_email_log` rows (§04).
- The audit log entries where `subject_id = diner_id` (§13).

Output: a ZIP per the §07 `analytics.run-export` job format, plus a `diner-profile.json` for non-CSV-shaped data.

### 6.5 Rectification

Simple update through the diner profile UI (§03) by an org admin, plus an audit log entry. The diner's request is closed once the change is verified.

### 6.6 Restrict processing + object

Edge cases. `restrict_processing` flags the diner via **§03's `diners.processing_restricted boolean default false` column** (added by §03's schema migration but driven by this domain's cascade) — the marketing-suite excludes them from all sends, the analytics aggregator suppresses them from cohort reports, but reservations still process (operational necessity per GDPR Art 18(2) — storage permitted for the establishment, exercise, or defence of legal claims). `object` to direct marketing = full unsubscribe with permanent suppression via §11's `marketing_suppressions`. Server actions that touch a `processing_restricted = true` diner fail with `TV1104 processing_restricted` and surface the restriction to operators in the §03 diner profile UI.

## 7. Data-export-on-cancellation

Per the contractual promise: when an org cancels their subscription, they get "a full CSV export of every diner, every booking, every review, every campaign."

### 7.1 Trigger

§12's `cancelSubscription` action fires `compliance.full-org-export(orgId)` job after the cancellation is confirmed.

### 7.2 Job behaviour

The job uses §07's `analytics.run-export` infrastructure with:
- `requested_restaurants = all venues in the org`
- `date_from = null`, `date_to = null` (entire history; bypasses §07 tier limits)
- `include_diners = true`, `include_reviews = true`, `include_campaigns = true`
- Adds: invoices PDF list (links to Stripe-hosted), audit log filtered to the org, marketing consent history.

Output: ZIP delivered via email + downloadable for 90 days (longer than the normal 24h export window because it's a major lifecycle event).

### 7.3 No data hostage

The ZIP is generated automatically — no admin approval, no support ticket, no "we'll process this in 7-10 business days." Per the locked spec language.

## 8. Retention + purge automation

### 8.1 Job: `compliance.enforce-retention`

Nightly at 04:00 UTC.

For each row in `retention_policies`:
1. Compute cutoff: `now() - interval (retention_period_days, 'days')`.
2. Build the SQL: `delete from <scope_table> where <applies_to_column> < $cutoff` (or `update ... set <columns> = null` for `anonymise` action).
3. Apply `exception_predicate` if set: `... and not (<exception_predicate>)`.
4. Batch in chunks of 5000 to avoid long-running locks.
5. Log to Sentry + `audit_logs` with `action = 'retention.purged'`, context = `{ table, row_count }`.

**Atomicity (locked):** each chunk of 5000 rows is wrapped in a single transaction (`begin; delete ... limit 5000; insert into audit_logs ...; commit;`). On chunk failure (constraint violation, lock timeout, exception): the chunk is rolled back atomically; the job logs the failure to Sentry and continues to the **next** chunk. The failed chunk is retried on the next nightly run — no infinite retry loop within a single execution. Rows are purged in deterministic order via `order by <applies_to_column> asc` inside each chunk (oldest first), so a partial-purge state leaves the table in a predictable shape and re-runs converge.

### 8.2 Special cases

- **`audit_logs` self-purge**: the audit log purges its own old rows. Bootstrapping concern: don't audit the audit-purge — would create infinite write loop. The purge job writes a single `retention.purged_<table>` per execution to `audit_logs`, not per-row.
- **`marketing_consent_audit`**: rows are conditionally purgable. Rows where `event_type = 'consent_captured'` and the consent is still live = NEVER purge. Rows for revoked consents may purge 730 days post-revocation. Implemented via the `exception_predicate`.
- **`billing_audit_log`**: 7-year retention. After expiry, anonymise rather than hard-delete (keeps aggregate counts for fraud-pattern analysis).

## 9. Rate limiting

### 9.1 The middleware helper

```ts
// src/lib/rate-limit/enforce.ts

export async function enforceRateLimit(input: {
  key: string                        // e.g., `widget:reservation:${ip}`
  scope: string                      // e.g., 'widget_booking'
  limit: number                      // e.g., 30 events per window
  windowSeconds: number              // e.g., 300 (5 minutes)
}): Promise<{ allowed: boolean; remaining: number; resetsAt: Date }>
```

Algorithm: bucket-by-window-start (5-minute window → key by floor of unix_time / 300). Increment count in the bucket; allowed if count < limit. Atomic via `insert ... on conflict do update set count = count + 1` with a `returning count` clause.

### 9.2 Tunable per-scope

Defined in code (`src/lib/rate-limit/scopes.ts`), not in the DB (avoids the "live tune the limits without a deploy" hazard — usually wrong instinct):

```ts
export const RATE_LIMIT_SCOPES = {
  widget_booking: { limit: 30, windowSeconds: 300 },
  widget_slot_lookup: { limit: 200, windowSeconds: 300 },
  login_attempt_per_email: { limit: 10, windowSeconds: 900 },
  login_attempt_per_ip: { limit: 30, windowSeconds: 900 },
  consent_import: { limit: 5, windowSeconds: 86400 },        // 5 imports per day
  public_search: { limit: 60, windowSeconds: 60 },
  review_report: { limit: 5, windowSeconds: 3600 },
  gdpr_otp_verify: { limit: 5, windowSeconds: 300 },         // 5 OTP attempts per 5 minutes per requester
}
```

**GDPR OTP rate-limit detail.** The `gdpr_otp_verify` scope governs the identity-verification flow (§6.2 phone-match / email-match): 5 attempts per 5-minute window keyed on the data-subject-request id. Every failed attempt writes to `audit_logs` with `action = AUDIT.compliance.gdpr_otp_verify`, `outcome = 'failure'`, `context = { request_id, attempt_count, phone_or_email_hash }`. The OTP email body includes the line:

> If you didn't request this, report it at privacy@tavli.ro — your data is not being touched.

That sentence is the abuse-detection signal; if Tavli receives multiple "I didn't request this" reports against the same OTP scope, the requester is flagged for manual review.

### 9.3 Cleanup

Nightly: `delete from rate_limits where expires_at < now()`.

## 10. Cookie consent

### 10.0 Consent retention (locked)

Cookie consent records (`cookie_consents.expires_at`) are retained for **13 months from `granted_at`**, per CNIL recommendation. This aligns with ANSPDCP's guidance for RO operators (cross-referenced from foundations §15a.6). At 13 months, the consent expires and the banner re-prompts. The expiring rows are kept in the table until `compliance.purge-cookie-consents` clears them (nightly, drops rows where `expires_at < now()`).

### 10.1 Banner UI

First visit to `tavli.ro` (or any venue page on the platform): a slim bottom banner — "We use cookies for essential site features and (with your permission) analytics. [Accept all] [Essentials only] [Customise]."

The customise modal lets the visitor toggle: essential (always on), analytics (Google Analytics, PostHog if/when added), marketing tracking (Pixel-style).

Choice persists in `cookie_consents` row + a first-party cookie with the visitor_session_id.

### 10.2 Granular tracking gates

Every analytics script load checks the consent state:
- `essential` only → no analytics fires.
- `analytics = true` → first-party analytics (PostHog page views).
- `marketing_tracking = true` → ad-network pixels (none today; future-proof for paid acquisition).

### 10.3 Revoke

Footer link "Cookie preferences" reopens the banner. Setting cookies false sets `cookie_consents.revoked_at`; future page loads fall back to essential-only.

## 11. Legal-content surfaces

Static pages, content authored by counsel + founder:

- `/legal/privacy` — privacy policy
- `/legal/terms` — terms of service
- `/legal/cookies` — cookie policy
- `/legal/anpc` — ANPC consumer-rights notice (RO required)
- `/legal/data-processing` — data-processing agreement (template; per-org variant in §01 onboarding)
- `/legal/imprint` — restaurant-facing legal address (DE required when DE expansion happens)

These pages use the existing MDX-rendered content pipeline (`@next/mdx@16.2.6` per `00-foundations.md`). Each available in RO/EN/DE.

## 12. UI surfaces

### 12.1 Tavli admin GDPR queue

`/admin/gdpr/requests`. List of all `data_subject_requests` with status filter. Click → detail page with:
- Subject info + identity verification status + verify button (sends OTP).
- Request body.
- "Approve + execute" CTA → triggers the cascade job.
- "Reject with reason" CTA (if duplicate, abusive, or unverifiable).

### 12.2 Diner privacy page

`/reservations/[token]/privacy`. Three buttons + plain-language explanation of each:
- "Download my data" → starts a portability request (auto-verified by token; immediate processing).
- "Delete my data" → starts an erasure request (auto-verified; processed within 30 days, with a 7-day "are you sure?" cooling-off period during which the diner can cancel).
- "Update my data" → opens a form for rectification.

### 12.3 Org admin audit log viewer

`/partner/org/[orgId]/audit`. Read-only view of `audit_logs` filtered to the org. Search by action, actor, subject, date range. Useful for owner-side "what happened" questions ("who modified this booking yesterday?").

### 12.4 Tavli admin retention dashboard

`/admin/retention`. Shows the next purge run's expected impact per `retention_policies` row: "Tomorrow at 04:00 UTC: ~12,500 `transactional_email_log` rows will be hard-deleted." Helps anticipate sudden row-count drops in monitoring.

## 13. Background jobs

All job keys live in foundations `JOBS.compliance.*` (§16.3). Never hard-code job-name strings.

| `JOBS.compliance.*` key | Schedule | Purpose |
|---|---|---|
| `retentionPurge` | nightly 04:00 UTC | Per-table retention enforcement (§8). |
| `erasureExecute` | per request | Cross-domain erasure cascade (§6.3). |
| `erasureVerify` | nightly 04:30 UTC | Re-reads redacted rows, asserts residual-PII absence (§6.3 step i; foundations §15a.1). |
| `dsarExport` | per request | Access + portability bundle build (§6.4). |
| `fullOrgExport` | on subscription cancellation | Triggered by §12's `cancelSubscription` (§7). |
| `autoRejectUnverified` | daily 02:00 UTC | Rejects DSRs in `identity_verified = false` at created_at + 25 days (§6.2 step 2). |
| `flagOverdueRequests` | daily | Alerts Tavli admin to requests within 5 days of `legal_deadline_at`. |
| `purgeRateLimits` | every 6h | Drop expired `rate_limits` rows (§9.3). |
| `purgeCookieConsents` | nightly | Drop `cookie_consents` rows past `expires_at` (§10.0). |
| `retryAuthDeletion` | every 30 min | §01 Stage-2 retry when Supabase Auth Admin API failed after Tavli-side redaction (foundations §16.3). |

## 14. Tools & libraries

No new dependencies beyond what `00-foundations.md` specs.

## 15. Audit + compliance posture

### 15.1 ANPC defensibility

ANPC (Romanian consumer protection authority) inspections can target restaurant-tech platforms. The defensibility surface includes:
- Marketing consent records per (diner, channel) with timestamp + IP + exact copy shown.
- Right-to-be-forgotten request log + completion timestamps showing <30-day SLA.
- Cookie consent surface with granular controls.
- Privacy policy in Romanian.
- Data-processing agreement available to every org admin.
- Audit log filterable by org for inspectors.

### 15.2 GDPR Article 30 (Records of Processing)

Tavli must maintain a Record of Processing Activities. Lives outside the codebase (legal doc maintained by counsel) but the technical artefacts feeding it are:
- The `retention_policies` table (what's stored, how long).
- The `marketing_consent_audit` table (legal basis for marketing processing).
- The list of sub-processors (Resend, Twilio, Supabase, Stripe, Cloudflare, etc.) — documented in `/legal/data-processing`.

### 15.3 Data residency

EU-hosted everything: Supabase EU region (already), Resend EU, Twilio EU, Stripe EU. Coolify on Hetzner (Germany). No US data residency in the data path. Per foundations §15a.8: Supabase project region pinned to `eu-central-1` (Frankfurt) or `eu-west-3` (Paris) at provisioning; Sentry EU region (`*.de.sentry.io`); DPAs signed with all sub-processors, documented in `docs/operations/sub-processors.md`.

### 15.4 NIS2 — out of scope at v1 (per foundations §15a.3)

Tavli is **below NIS2 thresholds at v1** (<50 employees, <€10M turnover). Per foundations §15a.3, the directive's "important entity" obligations (governance + 24h/72h incident reporting + risk management framework) do not apply.

Operationally, Tavli ships the foundations §15a.3 hygiene set regardless (incident response plan, sub-processors list, quarterly tabletop drill once 3+ staff exist) — these de-risk the eventual transition.

**Quarterly review post-launch**: this section gets re-evaluated whenever staff count or revenue crosses a threshold. The trigger is documented in the cross-cutting open questions list and surfaced via a calendar reminder owned by the founder.

### 15.5 EU AI Act — no AI in v1 (per foundations §15a.4)

Per foundations §15a.4, Tavli v1 has **no AI features**:
- No AI-powered concierge (locked per `marketing_strategy` memory).
- No automated decision-making affecting diners (bookings are deterministic + human-mediated, GDPR Art 22 N/A).
- No biometric processing.

The EU AI Act (2024/1689) accordingly imposes no obligations on Tavli at launch.

**Re-assessment trigger**: if any AI feature is introduced post-launch (e.g., review-moderation classifier, demand-forecasting model, AI-assisted reply drafts), a **fresh applicability assessment** runs in this doc. The PR introducing the AI feature must update this subsection or the PR is blocked at review. The assessment determines the risk tier (prohibited / high-risk / limited-risk / minimal-risk) and the resulting obligations (transparency notices, technical documentation, conformity assessment, etc.).

### 15.6 DSA — in scope as hosting provider (per foundations §15a.5)

Per foundations §15a.5, Tavli hosts diner reviews + restaurant content → in scope as a **hosting service provider** under the Digital Services Act (EU 2022/2065). Below the "very large platform" threshold (>45M monthly EU users); minimum-obligation tier applies.

Implementation pointers:
- **Notice-and-action mechanism** for illegal content — the "report this review" link on every review routes to the moderation queue. **Owned by §06 (review reports)**; the routing + queue UI is built there. This domain (§13) owns the regulator-facing reporting + the annual transparency report.
- **Statement of reasons** when removing user content — `ReviewRemovedStatementEmail` template lives in §04; this domain owns the template policy text.
- **Annual transparency report** — published at `/legal/transparency-report/<year>`. Counts: notices received, content removed, response-time distribution, breakdown by report category. First publication deferred to month 12 post-launch (volume too low before then to be meaningful).
- **Single point of contact for authorities** — the Tavli DPO/founder, listed on `/legal/imprint` and `/legal/privacy`.

## 16. Build sequence

1. **`audit_logs` table + RLS + `recordAudit` helper.** *(0.5 day; per `00-foundations.md` §17.12)*
2. ~~Retrofit existing server actions to write `audit_logs`~~ — DROPPED (pre-release simplification). No legacy server actions to retrofit; every new action ships with `audit_logs` writes from day one. Saves ~2 days.
3. **`data_subject_requests` table + RLS.** *(0.3 day)*
4. **`retention_policies` table + seed data.** *(0.3 day)*
5. **`rate_limits` table + `enforceRateLimit` helper + middleware integration.** *(1 day)*
6. **`cookie_consents` table + banner UI + analytics gating.** *(1.5 days)*
7. **`compliance.enforce-retention` job** with per-table batched purges. *(1.5 days)*
8. **`compliance.execute-erasure` job** with the cross-domain cascade. *(2 days)*
9. **`compliance.full-org-export` job** wired to §12 cancellation. *(0.5 day; reuses §07 export infrastructure)*
10. **Diner privacy page** (`/reservations/[token]/privacy`) with token-auto-verified flows. *(1.5 days)*
11. **Tavli admin GDPR queue** UI. *(1.5 days)*
12. **Org admin audit log viewer.** *(1 day)*
13. **Legal pages** (MDX content authored separately; this scope = layout + i18n routing). *(0.5 day for plumbing)*
14. **`compliance.flag-overdue-requests` daily job.** *(0.3 day)*
15. **`compliance.purge-rate-limits` + `compliance.purge-cookie-consents` cleanup jobs.** *(0.3 day)*
16. **Retention dashboard for Tavli admin.** *(0.5 day)*
17. **Integration tests** for the GDPR cascade (mock cross-domain hooks + assert all anonymisations executed). *(1.5 days)*

**Total: ~16 working days.** Heaviest pieces: erasure cascade implementation (step 8), audit-log retrofit (step 2), cookie consent banner (step 6).

## 17. Open questions

1. **Should `audit_logs` use partitioning?** At launch, no. Postgres handles 100M-row tables fine with the indices above. Partition by month if/when monthly purge causes lock contention.

2. **Should we use a dedicated audit-log service (Snowflake / BigQuery)?** Recommendation: no. Postgres + the indices defined are sufficient for the next 2 years of growth. Externalise when the table exceeds 500M rows.

3. **Should the diner privacy page require additional verification beyond the token?** ~~Token alone = "they got the email; that's possession-based proof."~~ **Resolved (2026-05-20): yes for deletion only.** Phone-OTP via `JOBS.compliance.gdprOtpVerify` is required before executing erasure (deletion is destructive; an intercepted email shouldn't trigger it; covered by the `gdpr_otp_verify` rate-limit scope in §9.2). Access + portability + rectification continue to be token-sufficient.

4. **Rate limits — implement in Postgres now, migrate to Redis later?** Recommendation: yes. Postgres for v1; Redis when 200ms p99 on rate-limit lookups isn't sustainable.

5. **Cookie banner — show on every venue page or just `tavli.ro`?** Recommendation: every Tavli-served page (both `tavli.ro` and `embed.tavli.ro` widget). The widget on a restaurant's own site doesn't show its own banner — the embedding site's banner covers it (their domain, their consent UX).

6. **Should we honour Do-Not-Track / Global Privacy Control browser signals?** Recommendation: yes — `Sec-GPC: 1` header treated as "marketing_tracking = false." Banner still shows for explicit choice on analytics.

7. **Right-to-be-forgotten for a diner whose request crosses orgs**: do we run it for one org at a time or all at once? Recommendation: all at once. The cascade job loops through every org the diner appears in. Audit log per cascade.

8. **What about a diner who's also a Tavli partner (a restaurant owner who books at competitor restaurants)?** Recommendation: erasure of their diner records is separate from their partner account. Partner deletion is a different flow (driven from §01). The diner-side data anonymises; the partner-side data stays unless they ALSO request partner-account deletion.

9. **Should we publish a "transparency report" — counts of GDPR requests handled per quarter?** Recommendation: yes from year 2. Internal-only for v1; publish when volume justifies (>50 requests per quarter).

10. **Should the org admin have access to *Tavli's* GDPR-request log for their data subjects?** Recommendation: yes — read-only. They have a legitimate interest in knowing which of their diners have requested deletion. Shows in `/partner/org/[orgId]/audit` filtered to GDPR events.

## 18. Cross-references

- **§00 Foundations §3.4 / §6.6 / §15a.1 / §15a.3–§15a.6 / §15a.8 / §16.1 / §16.2 / §16.3 / §17.12** — `can()`, shared `webhook_events`, canonical GDPR erasure pattern, ANPC/NIS2/AI-Act/DSA scoping, data residency, `ERROR_CODES` / `AUDIT` / `JOBS` registries, `audit_logs` substrate + helper skeleton.
- **§01 Identity & accounts** — staff invitation events flow to `audit_logs`; staff deletion uses GDPR cascade; `JOBS.compliance.retryAuthDeletion` is the §01 Stage-2 retry shim.
- **§02 Bookings** — every mutation writes `audit_logs`; rate-limit middleware on the widget endpoint (`widget_booking`, `widget_slot_lookup`).
- **§03 Diner database** — `diner_pii_access_log` is the granular companion; right-to-be-forgotten cascade calls into §03's `anonymiseDiner`; `diners.processing_restricted` column owned in §03.
- **§04 Diner communication** — `transactional_email_log` retention defined here; PII anonymisation cascade; `partner_notifications.pending_erasure*` columns owned in §04.
- **§05 Venue page** — review-side content surface is the public face of DSA scope.
- **§06 Reviews** — notice-and-action UI for review reports lives here (§15.6); reviews participate in the erasure cascade.
- **§07 Analytics & reports** — `analytics.run-export` job reused for org cancellation export (§7.2); analytics PII-access audit converges in `audit_logs`.
- **§08 Table management** — `walkin_queue` PII anonymisation cascade step (§6.3 step 2.e); `table_status_log` retention.
- **§09 Multi-location** — venue archival uses §13's archival convention; org-scoped audit-log viewer in §12.3.
- **§10 Corporate events** — `corporate_lead_intents` participates in the erasure cascade (§6.3 step 2.g); invoice numbering relies on the audit chain owned here.
- **§11 Marketing suite** — `marketing_consent_audit` retention; suppressions cascade; consent management; `marketing_sends.email/phone` anonymisation (the columns are unprefixed per the §11 rename).
- **§12 Billing & subscriptions** — `billing_audit_log` retention; cancellation triggers `JOBS.compliance.fullOrgExport`; PSD2 evidence preserved through Art-17 erasure via the `preserved_fiscal_data` pattern in §6.3 step 2.j.
- **§14 The setup** — onboarding tooling shares this domain's rate-limit + audit infrastructure.
- **§15 Public pricing page** — ANPC consumer-protection notice surface (§15.1) is loaded from this domain's legal-content pages.

---

*Last updated: 2026-05-20.*
