# 00 — Foundations

> Cross-cutting infrastructure every other domain depends on. Read first.

## Contents

- [1. Scope](#1-scope)
- [2. Stack snapshot](#2-stack-snapshot-confirmed-against-packagejson-2026-05-20)
- [3. Application architecture patterns](#3-application-architecture-patterns) — server actions, `ActionResult<T>`, Zod, `can()`/`requireCan()`, server components, caching
- [4. Database conventions](#4-database-conventions) — schema, migrations, `id`/`created_at`/`updated_at`, RLS, denormalisation, soft delete, **foundation tables (§4.7)**
- [5. Auth & sessions](#5-auth--sessions) — Supabase Auth, password policy, MFA + passkeys, impersonation
- [6. Email infrastructure](#6-email-infrastructure) — Resend, React Email, deliverability, RFC 8058, **webhook_events (§6.6)**
- [7. SMS infrastructure](#7-sms-infrastructure-new) — Twilio EU, wrapper contract, STOP handling
- [8. WhatsApp infrastructure](#8-whatsapp-infrastructure-new) — Twilio WhatsApp Business, template approval
- [9. File storage](#9-file-storage) — Supabase Storage, lifecycle, PII in uploads
- [10. Background jobs](#10-background-jobs) — pg-boss, DLQ, traceparent propagation
- [11. i18n](#11-i18n-new) — next-intl, canonical/hreflang, timezone canonical pattern + DST
- [12. Observability](#12-observability-new) — Sentry, pino, OpenTelemetry
- [13. Testing patterns](#13-testing-patterns)
- [14. Deployment & CI](#14-deployment--ci)
- [15. Secrets management](#15-secrets-management)
- [15a. Compliance baseline (EU + RO, 2026 standards)](#15a-compliance-baseline-eu--ro-2026-standards) — GDPR, PSD2, NIS2, EU AI Act, DSA, ANPC/ANSPDCP, WCAG 2.2, data residency
- [16. Three cross-cutting registries](#16-three-cross-cutting-registries) — `ERROR_CODES`, `AUDIT`, `JOBS`
- [17. Cross-cutting open questions](#17-cross-cutting-open-questions)
- [18. Build sequence](#18-build-sequence--new-infrastructure-before-launch)
- [19. Cross-references](#19-cross-references)

> **Numbering note:** §15a sits between §15 (Secrets) and §16 (Registries) by intent — the compliance baseline was inserted after the original 18-section structure was set. Cross-references throughout the project use the `§15a.X` notation; this is stable and intentional, not a typo.

## 1. Scope

This doc owns the stack choices, the cross-cutting patterns, and the new infrastructure that has to be in place before most domain docs can be built.

**Domain-level checkboxes this directly covers** (cross-referenced to `launch-feature-commitments.md` — `LFC §N` refers to its sections; bare `§NN` refers to architecture docs):

- LFC §1 GDPR + ANPC compliance baseline (the infra side; domain-specific compliance lives in §13)
- LFC §1 Trilingual confirmation/reminder copy (the i18n framework; domain-specific copy lives in §04)
- LFC §2 marketing suite — every channel's infrastructure (Resend, Twilio SMS, Twilio WhatsApp) and the job-queue substrate the campaigns run on
- LFC §4 Card-on-file day-91 auto-charge (the Stripe wiring; domain-specific subscription logic lives in §12)
- LFC §4 Audit log substrate (the table + write pattern; domain-specific audit events live in §13)
- LFC §4 Reminder emails at day 60/75/85 (the job substrate; copy lives in §12)

The principle: **infrastructure here, domain logic in domain docs.**

## 2. Stack snapshot (confirmed against `package.json` 2026-05-20)

| Concern | Choice | Version | Status |
|---|---|---|---|
| Framework | Next.js (app router, server actions) | 16.2.4 | in use |
| Database | Supabase Postgres (managed) | — | in use; prod cluster `postgres.yldmpbecmlkjugljxgww.supabase.com` |
| ORM | Drizzle | drizzle-orm 0.45.2 + drizzle-kit 0.31.10 | in use; 11 migrations under `drizzle/migrations/` |
| Auth | Supabase Auth | `@supabase/supabase-js` 2.103.3 + `@supabase/ssr` 0.10.2 | in use |
| UI | Tailwind v4 + custom components | tailwindcss 4 + @tailwindcss/postcss 4 | in use; **no** shadcn/Radix |
| Forms | React Hook Form + Zod | rhf 7.72.1, zod 4.3.6, @hookform/resolvers 5.2.2 | in use |
| Email transport | Resend | resend 6.12.0 | in use |
| Email templates | React Email | @react-email/render 2.0.7 + components 1.0.12 | in use; templates in `src/emails/` |
| File storage | Supabase Storage | (Supabase-bundled) | in use |
| Background jobs | Next.js cron endpoints + `CRON_SECRET` | — | in use; pg-boss migration pending |
| Testing — unit | Jest | jest 30.3.0 + ts-jest 29.4.9 | in use |
| Testing — e2e | Playwright + axe-core | @playwright/test 1.60.0 | in use |
| Container | Docker (standalone output) | Node 20 Alpine | in use |
| Hosting | Coolify on Hetzner | — | in use |
| **SMS** | **LOCKED: Twilio EU** | — | not yet wired |
| **WhatsApp** | **LOCKED: Twilio WhatsApp Business** | — | not yet wired |
| **Payments — subscriptions** | **LOCKED: Stripe Subscriptions** | — | not yet wired |
| **Payments — restaurant deposits** | **DEFERRED to v1.5: Stripe Connect** | — | not in v1 scope per `launch-feature-commitments.md` §5 |
| **Job queue** | **LOCKED: pg-boss** | — | not yet wired |
| **i18n** | **LOCKED: next-intl** | — | not yet wired |
| **Observability** | **LOCKED: Sentry + pino + OpenTelemetry** | — | not yet wired |
| **Bot / scraper protection** | **LOCKED: Cloudflare Turnstile** | — | not yet wired (cost ~0.5 day to ship) |
| **Feature flags** | **DEFERRED to v1.5: flags table** | — | not in v1 |
| **Video transcoding (Pro)** | **DEFERRED to v1.5: Cloudflare Stream** | — | only needed once §05 video-hero ships, also deferred |

All v1 stack decisions are locked. Pre-release status (no production customers) gives us the freedom to be decisive.

## 3. Application architecture patterns

### 3.1 Server actions are the mutation path

Every mutation goes through a server action co-located with its route (`actions.ts` next to `page.tsx`). Existing pattern: `src/app/api/reservations/actions.ts`, `src/app/partner/(dashboard)/reservations/actions.ts`.

**When a server action is needed from multiple routes**, move it to `src/lib/<domain>/actions/<name>.ts` and import. Route-specific actions (a form submit on a single page) stay co-located. Shared actions still carry `'use server'` and the same `ActionResult<T>` contract.

Do NOT add REST endpoints for internal mutations. REST endpoints exist only for:
- The embeddable booking widget (cross-origin posts from restaurant sites — see §02 when the widget ships in v1.5)
- Webhooks (Stripe, Twilio status callbacks, Resend bounces — see §6.6 above)
- Cron endpoints (`/api/cron/<name>`)
- Public read APIs the consumer app + widget share (e.g., the existing `/api/restaurants/[id]/slots`)

**Next.js 16 server action hardening:**
- Action IDs are not stable across deploys (the framework rotates them per build); never persist action IDs anywhere.
- Origin validation: Next 16 validates `Origin` against `serverActions.allowedOrigins` (config in `next.config.ts`); set this to Tavli's domains only.
- Encrypted closures: Next 16 encrypts captured values (e.g., a `revealOnClick` bound to a row id). Don't bind PII to client-side closures — fetch fresh in the action.
- CSRF: server actions are protected by Next's same-origin check; we additionally rely on Supabase Auth's session cookie being `SameSite=Lax`.

### 3.2 Server action contract

Every server action is shaped:

```ts
'use server'

export async function actionName(
  input: ActionNameInput
): Promise<ActionResult<ActionNameSuccess>> {
  const parsed = ActionNameSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const session = await getCurrentSession()
  if (!session) return unauthenticated()

  // … work …

  return ok({ /* success payload */ })
}
```

`ActionResult<T>` lives in `src/lib/server-action.ts` (to be created — currently the pattern is informal). Standard discriminated union:

```ts
// src/lib/server-action.ts
import type { ActionErrorCode } from './errors/codes'

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message?: string; fields?: Record<string, string> }

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })

export const fail = (
  code: ActionErrorCode,
  message?: string,
  fields?: Record<string, string>,
): ActionResult<never> => ({ ok: false, code, message, fields })

export const invalid = (err: import('zod').ZodError): ActionResult<never> =>
  fail('invalid_input', undefined, Object.fromEntries(
    err.issues.map(i => [i.path.join('.'), i.message]),
  ))

export const unauthenticated = () => fail('unauthenticated')
export const forbidden = () => fail('forbidden')
export const notFound = () => fail('not_found')
export const conflict = (msg?: string) => fail('conflict', msg)
export const rateLimited = () => fail('rate_limited')
```

**Conventions:**
- `data: T` — never `T | null`. A "no result" outcome is `notFound()` or domain-specific empty value, not a null inside `ok`.
- `fields` — per-field validation errors keyed by RHF field name (so the client can `setError` directly).
- `message` — human-readable English fallback when no i18n key is available. Clients prefer the `code` for i18n lookup; `message` is logging-only.
- Never throw across the server-action boundary — uncaught throws are caught by the `withSentry` wrapper (§12.1) and converted to `fail('internal')`. Domain code uses `fail()`/`invalid()`/`conflict()` explicitly.

**Error codes** live in `src/lib/errors/codes.ts` (defined in §16.1 below). The type `ActionErrorCode` is the union of cross-cutting codes + every `TV<NNN>` domain code.

### 3.3 Input validation with Zod, at the boundary

Schemas are the source of truth; TS types derive from them via `z.infer`. Never duplicate the shape in a separate `interface`. Validation runs synchronously at the start of every server action — never deferred into the work.

### 3.4 Authorisation lives in a centralised guard

The existing pattern checks ownership inline (e.g., `owner_user_id === session.user.id` in `partner/(dashboard)/reservations/actions.ts`). As we add staff roles, organisations, and per-location scoping, this scatters. Plan: introduce an **async** `can(session, action, subject)` helper in `src/lib/authz/`. Full action catalogue and role-mapping live in §01; the contract here:

```ts
// src/lib/authz/can.ts
export type AuthzAction =
  // see §01 for the full enumeration (one string per row of the permission matrix)
  | 'reservation.create' | 'reservation.modify' | 'reservation.modify.override_capacity'
  | 'reservation.cancel' | 'reservation.read'
  | 'staff.invite' | 'staff.role.change'
  | 'venue.read' | 'venue.edit' | 'venue.publish'
  // …+ one row per ~80 actions across all 16 domains

export type AuthzSubject =
  | { type: 'reservation'; id: string }
  | { type: 'restaurant'; id: string }
  | { type: 'organization'; id: string }
  | { type: 'diner'; id: string; restaurantId: string }
  | { type: 'campaign'; id: string }
  | { type: 'review'; id: string }
  // …+ one row per addressable subject. Carry enough id context that the helper
  // can resolve org + restaurant without a second lookup.

/**
 * Returns true if `session.user` may perform `action` on `subject`.
 * Async because it queries `organization_members` + `restaurant_staff`.
 * Per-request memoized via React's `cache()` — repeated calls in one request
 * hit the DB at most once per (userId, orgId, restaurantId) tuple.
 * Returns false on missing membership; throws only on DB errors (caught by withSentry).
 */
export const can: (
  session: CurrentSession,
  action: AuthzAction,
  subject: AuthzSubject,
) => Promise<boolean>

/**
 * Throws AuthzDenied (caught by the server-action wrapper → forbidden()).
 * Use this when the denial path is just `return forbidden()`.
 */
export const requireCan: (
  session: CurrentSession,
  action: AuthzAction,
  subject: AuthzSubject,
) => Promise<void>
```

**Failure semantics:** `can()` returns `false` (never throws) for "user lacks permission." It throws only on infrastructural failure (DB unreachable) — the wrapper converts these to `fail('internal')`. Tests assert `can() === false` for unauthorised paths; never catch a thrown denial.

**Memoization scope:** per request, via React's `cache()` wrapper. Multiple `can()` calls in one action hit DB once per distinct `(userId, orgId, restaurantId)`. Cache is dropped at request end.

Every server action calls `requireCan()` as the second step after schema validation. The skeleton at §3.2 becomes:

```ts
const parsed = Schema.safeParse(input)
if (!parsed.success) return invalid(parsed.error)

const session = await getCurrentSession()
if (!session) return unauthenticated()

await requireCan(session, 'reservation.modify', { type: 'reservation', id: parsed.data.id })
//   ↑ throws AuthzDenied if no permission; the wrapper catches → fail('forbidden')

// … work …
```

### 3.5 Server components for read, server actions for write

Default rendering: server components. Client components only when:
- We need stateful interactivity (forms, drag-drop floor plan, real-time table status)
- We need browser APIs (geolocation, clipboard, file picker)
- We're hosting third-party SDKs that require the browser (Stripe.js)

The existing codebase already follows this. Don't drift.

### 3.6 Caching, streaming, and revalidation

- **Default rendering mode** is dynamic per request (Next.js 16 default with `dynamicIO`). Pages that should cache must opt in.
- **Per-route caching**: use `'use cache'` (Next 16's `cacheTag`/`cacheLife`) at the route or function level. Caches are tagged so server actions can call `revalidateTag('restaurant:'+id)` after mutations.
- **Streaming + Suspense**: every server-rendered page that does parallel data fetches wraps independent chunks in `<Suspense>` with a domain-appropriate skeleton. Booking widget hero loads first; menu + photos stream after.
- **Partial Prerendering (PPR)**: enabled per route via `export const experimental_ppr = true` only on stable surfaces (venue page, pricing page). Do not enable on the partner portal — staff data is per-request and PPR overhead is wasted.
- **`unstable_cache`** is deprecated in Next 16; do not introduce new usage. Migrate any inherited calls to `'use cache'`.
- **`after()`** (Next 16 stable) is used for fire-and-forget audit-log writes and cache invalidations that don't need to block the response — wrap inside `withSentry` so exceptions still surface.
- **Taint API**: critical PII (diner email, phone) is tainted at the repo layer via `experimental_taintUniqueValue` so it can never accidentally serialise to a client component.

## 4. Database conventions

### 4.1 Schema definition

Single source: `src/lib/db/schema.ts`. All tables, enums, and relations declared with Drizzle's `pgTable` / `pgEnum`. Existing 21 tables already match this.

### 4.2 Migrations

- Drizzle generates migrations into `drizzle/migrations/NNNN_<slug>.sql`.
- Migration ordering is monotonic; the last applied migration on prod is `0010_private_spaces_and_quote_lines.sql`.
- `db:migrate` script applies them. Never edit a migration after merge — always add a new one.
- The current migration convention also has the 3-step prod bookkeeping documented in memory (`deploy_setup.md`).

### 4.3 Every new table gets

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- **App-managed `updated_at`** — pattern-of-record, not Drizzle middleware (`onUpdate` is not a stable Drizzle 0.45 API for the supabase-js + Postgres driver combo). Two options per table:
  1. **Manual** — every server action that mutates a row sets `.set({ ...updates, updated_at: sql\`now()\` })`. A wrapper `withUpdatedAt(updates)` in `src/lib/db/helpers.ts` is a one-liner that adds the timestamp. Standard convention.
  2. **Trigger** — allowed only for data-consistency-critical rows where forgetting to bump `updated_at` would break a downstream query (e.g., `restaurants` for the venue-page cache key). Add the trigger in the migration and document the exception in the schema comment.
  
  No new triggers ship for *business logic*. The one existing trigger we inherit (`recompute_restaurant_rating` on `reviews`) stays. Rationale: triggers add hidden behaviour, complicate testing + audit, and fragment the mutation story across SQL + TS.
- An `RLS enabled` policy block — see §4.4. **RLS is non-negotiable on every new table.**

Exception: pure join tables can omit `id` and use a composite PK (existing pattern: `company_members.(company_id, user_id)`).

### 4.4 RLS is mandatory on every new table

The default policy template for an organisation-scoped table:

```sql
alter table <table> enable row level security;

create policy "<table>_org_members_can_select" on <table>
  for select using (
    org_id in (
      select organization_id
      from organization_members
      where user_id = auth.uid()
    )
  );

create policy "<table>_org_admins_can_mutate" on <table>
  for all using (
    org_id in (
      select organization_id
      from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
```

Per-table variations are specified in the owning domain doc. Service-role bypass (used by cron + webhooks) is intentional and documented per call site.

### 4.5 Don't denormalise without writing it down

The existing schema denormalises in two places (`menu_items.restaurant_id` for RLS, `reviews.party_size` + `reviews.reservation_date` for historical snapshots). Both are justified. Future denormalisation requires a comment in the schema explaining the constraint that forces it.

### 4.6 Soft delete vs hard delete

Default: hard delete. Soft delete (`deleted_at timestamptz`) only when:
- The row needs to remain visible to audit (e.g., past reservations)
- A foreign-key cascade would lose history we contractually owe (e.g., booking history we promise to export on cancellation)

Reservations are already hard-deleted via cascade today; that's fine because the audit trail lives in `reviews` + (future) audit logs. Specify per table in domain docs.

### 4.7 Foundation tables (cross-cutting)

Four tables are referenced by multiple domain docs but belong here because their schema is foundational. They ship in the build sequence (§18) before any domain-specific work consumes them.

**`rate_limits`** — per-scope leaky-bucket counters used by §02 booking widget, §13 GDPR-OTP verify, and any future endpoint that needs throttling.

```sql
create table rate_limits (
  scope             text not null,             -- e.g., 'widget.booking_create', 'gdpr_otp_verify'
  bucket_key        text not null,             -- typically the IP (for IP-scoped) or user_id (for user-scoped)
  window_started_at timestamptz not null,      -- start of the current counting window
  request_count     integer not null default 0,
  primary key (scope, bucket_key, window_started_at)
);

create index rate_limits_lookup
  on rate_limits (scope, bucket_key, window_started_at desc);
```

Per-scope limits live in code (`src/lib/rate-limit/scopes.ts`), e.g. `{ scope: 'widget.booking_create', limit: 30, windowSeconds: 300 }`. The helper `checkRateLimit(scope, bucketKey)` returns `{ allowed: boolean, retryAfter?: number }`. Expired window rows purged nightly by `compliance.retention-purge`.

**`idempotency_keys`** — opt-in per-action deduplication for client-retry-prone server actions (booking widget submits, Stripe outbound calls).

```sql
create table idempotency_keys (
  action         text not null,                -- e.g., 'reservation.create'
  key            text not null,                -- client-supplied opaque key (typically UUIDv7)
  request_hash   text not null,                -- hash of canonical request body; protects against same-key/different-body
  result_payload jsonb,                        -- cached ActionResult for replay
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours',
  primary key (action, key)
);

create index idempotency_keys_expiry on idempotency_keys (expires_at);
```

The helper `withIdempotency(action, key, hash, fn)` returns the cached result if the key + hash matches a non-expired row; otherwise executes `fn` and caches its `ActionResult`. Mismatched hash with same key returns `fail('conflict')`. Expired rows purged nightly.

**`marketing_suppressions`** — org-scoped per-channel opt-out registry. Referenced by §6.4, §6.5, §7.1, §11, §13.

```sql
create table marketing_suppressions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  diner_id               uuid references diners(id) on delete set null,
  channel                text not null,        -- 'email' | 'sms' | 'whatsapp'
  recipient_identifier   text not null,        -- normalised lower(email) or E.164 phone
  source                 text not null,        -- 'one_click' | 'sms_stop_keyword' | 'bounce' | 'complaint' | 'manual'
  recorded_at            timestamptz not null default now(),
  redacted_at            timestamptz,          -- §15a.1 erasure marker (identifier nulled but row preserved for legal-basis history)
  created_at             timestamptz not null default now()
);

create unique index marketing_suppressions_active
  on marketing_suppressions (organization_id, channel, recipient_identifier)
  where redacted_at is null;

create index marketing_suppressions_diner
  on marketing_suppressions (diner_id)
  where redacted_at is null;
```

Suppression is **org-scoped** — a diner who unsubscribes from venue A's emails cannot receive emails from venue B in the same org. Per-venue suppression is deferred (v1.5+ if multi-venue operators surface a real need).

**`marketing_consents`** — per-diner per-channel opt-in record. Referenced by §7.1 ANPC check and §11.

```sql
create table marketing_consents (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  diner_id                 uuid not null references diners(id) on delete cascade,
  channel                  text not null,                            -- 'email' | 'sms' | 'whatsapp'
  consent_given            boolean not null,
  anpc_disclosure_version  text,                                     -- version tag of the ANPC opt-in copy the diner saw at consent time
  consent_source           text not null,                            -- 'booking_form' | 'venue_page_signup' | 'corporate_inquiry' | 'manual_import'
  ip_address               inet,                                     -- evidence at consent time
  user_agent               text,
  consented_at             timestamptz not null default now(),
  revoked_at               timestamptz,
  redacted_at              timestamptz,
  created_at               timestamptz not null default now()
);

create unique index marketing_consents_active
  on marketing_consents (organization_id, diner_id, channel)
  where revoked_at is null and redacted_at is null;
```

A diner may have at most one active consent per `(org, diner, channel)`. Revocation sets `revoked_at` and inserts an audit log; the row is retained for legal-basis history per §13 retention policy (730 days post-revocation, then erased per §15a.1).

All four tables get `redacted_at` markers (where they carry PII identifiers) and standard RLS — see §13 for the per-table RLS policies.

## 5. Auth & sessions

Supabase Auth handles credentials, OAuth, magic links, OTP. Tavli wraps it in `src/lib/auth/session.ts` → `getCurrentSession()` which returns `{ user, profile }`. The 1:1 join with `profiles` adds Tavli-specific fields (role, locale, full_name).

Three roles exist today (`admin`, `restaurant_owner`, `consumer`) on the `profiles.role` enum. §01 extends `profiles.role` and introduces a separate `restaurant_staff` table with its own role enum (`owner`, `manager`, `host`). Per-request the session loads both and constructs a permission set; see §01 for the exact construction algorithm and the full permission matrix.

The auth surfaces today are `/auth/callback`, `/partner/sign-in`, `/admin/sign-in`. No client-side Supabase session for end users (intentional — public booking is token-based, see `reservations.confirmation_token`).

### 5.1 Password policy (NIST 800-63B-compliant)

Following NIST 800-63B (2024 revision), Supabase Auth defaults are kept:
- Minimum 8 characters, no maximum below 64.
- No forced rotation (rotation is a known anti-pattern that drives reuse).
- No composition rules (mixed case, symbols) — length wins, complexity loses.
- Breach check via HIBP/Pwned Passwords on signup + password change. Supabase Auth supports this as a built-in toggle; enable it.
- Account lockout after 10 failed sign-ins in 15 minutes (Supabase default; verify).
- Email-enumeration defense: sign-in and password-reset return identical messages regardless of whether the email exists.

### 5.2 MFA & passkeys (v1 + v1.5)

- **v1**: TOTP MFA available to staff accounts on the partner portal via Supabase Auth's built-in support. Optional but encouraged; admin-tier accounts (`profiles.role = 'admin'`) have MFA mandatory.
- **v1.5**: passkeys (WebAuthn) for staff accounts. Supabase Auth supports WebAuthn in 2026; integration is one server-action + one passkey-registration screen on the security settings page. Approximate effort: 2 days.
- **Consumer-side**: no MFA (booking is token-based; no diner session except for opt-in account creation flow).

### 5.3 Support impersonation

A Tavli admin may impersonate a partner user to debug a support ticket. Mechanism:
- Admin clicks "Impersonate" on a user record in `/admin/users/[id]`.
- Server action checks `can(adminSession, 'user.impersonate', { type: 'user', id })`; only `tavli_admin` role passes.
- Issues a short-lived (15-minute) impersonation cookie alongside the admin's session cookie.
- Every server action checks for the impersonation cookie and records both the actor + impersonator in audit logs.
- The partner UI displays a persistent red banner: "Tavli support is currently viewing your account."
- All audit log entries during the session carry `impersonator_user_id` set; queries can filter to "real user actions only" when needed.

## 6. Email infrastructure

### 6.1 Transport: Resend

- Configured via `RESEND_API_KEY` + `EMAIL_FROM` env vars.
- Sending wrapper: `src/lib/email/resend.ts` — every email goes through this, never call Resend directly elsewhere.
- Dev fallback: when `RESEND_API_KEY` is unset, the wrapper logs to console. Useful for local dev without burning quota.

### 6.2 Templates: React Email

- Templates live in `src/emails/<Name>Email.tsx`.
- Currently shipped: `ReservationConfirmationEmail`, `PostVisitReviewEmail`, `EventRequestAcceptedEmail`, `InvitationEmail`, `PartnerBookingAlertEmail`.
- Rendering: `@react-email/render` produces HTML + plain-text. Both are sent (Resend supports both bodies).
- Layouts: extract a shared `<EmailShell>` once a second template needs the same header/footer chrome. Today they duplicate.

### 6.3 i18n in email

Templates today are RO-only. The spec requires RO/EN/DE. Plan (specified in §04): every email template takes a `locale: 'ro' | 'en' | 'de'` prop; subject + body strings come from the same i18n message catalogue as the rest of the app (see §11 below). Locale falls back to the diner's `profiles.locale` for authenticated diners, or RO for guests. Per-email locale override in the future if a restaurant pins a campaign to a specific language.

### 6.4 Deliverability

For each restaurant's sending domain (post-launch — for now we're sending from `tavli.ro`):
- SPF, DKIM, DMARC records — provisioning playbook in §04
- Resend handles signing once DNS is configured
- Bounce + complaint handling via Resend webhooks → routes to `src/app/api/webhooks/resend/route.ts` using the shared `ingestWebhook` skeleton (§6.6 below). Per-event handler updates `marketing_suppressions` (§4.7) with `source='bounce'` or `'complaint'`. Foundations §6.6 owns signature verification + idempotency; this route only implements the per-event-type handler logic.

### 6.5 The List-Unsubscribe header (RFC 8058 one-click)

Every **marketing** email (not transactional) MUST include both headers:

```
List-Unsubscribe: <mailto:unsubscribe@tavli.ro?subject=unsubscribe-<token>>,
                  <https://tavli.ro/u/<signed-token>>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The signed-token endpoint `GET /u/[token]` (idempotent — also accepts POST per RFC 8058) lives in `src/app/u/[token]/route.ts`:

1. Verify HMAC signature of `token = base64url(diner_id | campaign_id | channel | issued_at)` against `UNSUBSCRIBE_SECRET`.
2. Reject if `issued_at > 90 days ago` (link aged out — show a manual unsubscribe form instead).
3. Insert into `marketing_suppressions(organization_id, diner_id, channel, source='one_click', recorded_at=now())`.
4. Show a confirmation page with a "resubscribe" link (immediate undo within 30 seconds — same signature).
5. Audit-log the event (§13).

Resend supports custom headers via `headers: { 'List-Unsubscribe': ..., 'List-Unsubscribe-Post': ... }`. The marketing sender wrapper (`src/lib/marketing/send-email.ts`, in §11) sets these unconditionally for `kind: 'marketing'` sends and never for `kind: 'transactional'`.

**Transactional emails** (reservations, billing, password reset) include neither header — they are sent under GDPR Art 6(1)(b) contract necessity, not consent. Adding an unsubscribe link to a reservation confirmation would create a misleading expectation.

### 6.6 The shared `webhook_events` table (cross-cutting)

Three providers fire webhooks at us: Resend (bounces, complaints), Twilio (status callbacks, inbound STOP), Stripe (subscription events). All three need:
1. **Signature verification** — reject unsigned/forged calls.
2. **Idempotency** — providers retry on 5xx; we must not double-apply.
3. **Auditable persistence** — keep the raw payload for support + reconciliation.

One shared table, one shared handler skeleton:

```sql
create table webhook_events (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null,                 -- 'resend' | 'twilio' | 'stripe' | 'meta_whatsapp'
  provider_event_id    text not null,                 -- the provider's own id (`evt_xxx` for Stripe, `MessageSid` for Twilio, etc.)
  event_type           text not null,                 -- 'email.bounced' / 'message.status.delivered' / 'customer.subscription.updated' / ...
  signature_verified   boolean not null,
  received_at          timestamptz not null default now(),
  processed_at         timestamptz,                   -- null until handler succeeds; lets us retry stuck rows
  process_error        text,                          -- last error message if processing failed
  process_attempts     integer not null default 0,
  raw_payload          jsonb not null,
  context              jsonb not null default '{}',   -- denormalised lookups: restaurant_id, diner_id, campaign_id, subscription_id
  created_at           timestamptz not null default now()
);

create unique index webhook_events_idem on webhook_events (provider, provider_event_id);
create index webhook_events_unprocessed on webhook_events (provider, received_at) where processed_at is null;
```

**Handler skeleton** (every webhook route follows this):

```ts
// src/lib/webhooks/handle.ts
export async function ingestWebhook(opts: {
  provider: string
  request: Request
  verifySignature: (req: Request) => Promise<{ ok: true; eventId: string; eventType: string; payload: any } | { ok: false }>
  handle: (event: { id: string; type: string; payload: any }) => Promise<void>
}): Promise<Response> {
  const verified = await opts.verifySignature(opts.request)
  if (!verified.ok) return new Response('signature_invalid', { status: 400 })

  // Insert with unique-violation = "already seen" → 200 OK to stop provider retries
  const inserted = await db.insert(webhookEvents).values({
    provider: opts.provider,
    providerEventId: verified.eventId,
    eventType: verified.eventType,
    signatureVerified: true,
    rawPayload: verified.payload,
  }).onConflictDoNothing().returning()

  if (inserted.length === 0) return new Response('duplicate', { status: 200 }) // already processed

  try {
    await opts.handle({ id: verified.eventId, type: verified.eventType, payload: verified.payload })
    await db.update(webhookEvents).set({ processedAt: sql`now()` }).where(eq(webhookEvents.id, inserted[0].id))
  } catch (err) {
    await db.update(webhookEvents)
      .set({ processError: String(err), processAttempts: sql`process_attempts + 1` })
      .where(eq(webhookEvents.id, inserted[0].id))
    // Return 500 so the provider retries; we'll dedupe on the unique index next time.
    return new Response('handler_failed', { status: 500 })
  }
  return new Response('ok', { status: 200 })
}
```

**Replay defense**: signatures include a timestamp; reject if `|now - timestamp| > 5 minutes` (per provider spec). Stripe's `Stripe-Signature` includes this; Twilio's `X-Twilio-Signature` doesn't, so we additionally check `provider_event_id` was issued recently. Meta WhatsApp uses HMAC-SHA256.

**Unprocessed sweeper**: a recurring job `webhook.reingest-unprocessed` re-invokes handlers for rows where `processed_at IS NULL AND process_attempts < 5 AND received_at < now() - 10 min`. After 5 attempts the row is parked for manual review (admin dashboard surface).

## 7. SMS infrastructure (new)

**Recommendation: Twilio Programmable Messaging, EU region (Ireland).**

- Why Twilio: WhatsApp Business goes through the same vendor, so a single account, single billing, single SDK.
- Why EU region: data residency for ANPC + GDPR.
- Alternative considered: Vonage (cheaper per-message in some EU regions but no WhatsApp parity). Twilio wins on bundle.

### 7.1 Wrapper

A new `src/lib/sms/twilio.ts` wraps the Twilio SDK. Same shape as the Resend wrapper: one call site, dev fallback (`SMS_PROVIDER_DISABLED=true` → log to console).

```ts
type SendSmsArgs = {
  to: string                  // E.164 format mandatory; wrapper normalises + validates
  body: string                // template-resolved final text; max 1600 chars (Twilio limit)
  restaurantId: string
  dinerId?: string            // required for marketing kind; null only allowed for transactional walk-in
  campaignId?: string         // required for marketing kind
  kind: 'transactional' | 'marketing'
  locale: 'ro' | 'en' | 'de'  // determines STOP-suffix wording for marketing
  idempotencyKey?: string     // optional; defaults to hash(restaurantId+dinerId+campaignId+body+date)
}

type SendSmsResult =
  | { ok: true; messageId: string; status: 'queued' | 'sent' }
  | { ok: false; code: 'invalid_e164' | 'opt_out' | 'quiet_hours' | 'rate_limited' | 'provider_error'; message?: string }

sendSms(args: SendSmsArgs): Promise<SendSmsResult>
```

The wrapper enforces, in order:

1. **E.164 validation** — `to` must match `^\+[1-9]\d{1,14}$`. Use `libphonenumber-js` to normalise inputs like `0712345678` (Romanian without country code) into `+40712345678`. Reject if normalisation fails.
2. **Suppression check** — if `marketing_suppressions` has a row for `(orgId, channel='sms', recipient_identifier=normalised_to)`, return `{ ok: false, code: 'opt_out' }`. Logged but not an error.
3. **Marketing consent present** — query `marketing_consents` (§4.7) for an active row matching `(organization_id, diner_id, channel='sms')` with `consent_given = true AND revoked_at IS NULL AND anpc_disclosure_version IS NOT NULL`. The `anpc_disclosure_version` records which ANPC opt-in copy version the diner saw at consent time, satisfying ANPC's audit-trail requirement. Missing or revoked → return `'opt_out'`.
4. **Quiet hours** — for `kind: 'marketing'` only. Compute current time in the diner's `profiles.locale` timezone (per-locale defaults in §11; legal override per country: DE 8:00–20:00 Mon–Sat, no Sun marketing; RO + AT 10:00–21:00; the wrapper consults `src/lib/marketing/quiet-hours.ts` which encodes per-country rules). If outside window, **reschedule** via pg-boss for next eligible time; do not error. Transactional kind always sends.
5. **STOP-suffix** — for `kind: 'marketing'`, validate the body ends with the per-locale STOP suffix. Wrapper appends if missing:
   - `'ro'`: `' STOP la {shortcode} pentru dezabonare'` — `{shortcode}` is the carrier-provisioned shortcode per restaurant (typically a 4–5-digit short number), stored in `marketing_settings.sms_stop_shortcode`. Provisioned during Twilio sender-ID setup (§7.2).
   - `'en'`: `' Reply STOP to unsubscribe'`
   - `'de'`: `' Antworten Sie mit STOP zum Abmelden'`
6. **Idempotency** — insert into `marketing_sends` with `(restaurant_id, diner_id, campaign_id, idempotency_key)` unique; if conflict, return the prior `messageId`.
7. **Frequency-cap check** (marketing kind only; see §11 §10) — return `'rate_limited'` if exceeded.

After successful send, store the Twilio `MessageSid` as `provider_message_id` for status-callback reconciliation.

**Inbound `STOP` keyword** — webhook at `/api/webhooks/twilio-sms-inbound` runs `ingestWebhook` (§6.6), and on `STOP`/`STOP ALL`/`UNSUBSCRIBE` body:
1. Identify the org/diner via the sender phone + receiver number (Twilio includes both).
2. Insert into `marketing_suppressions` for `(org, channel='sms', diner.phone)`.
3. Audit-log `marketing.suppression.added` with `source='sms_stop_keyword'`.
4. Twilio auto-responds with an opt-out confirmation; Tavli does not send a second confirmation (would be a violation).

### 7.2 Sender ID

- Alphanumeric sender (`Tavli` or `<RestaurantName>` where the carrier supports it) — per-restaurant in `marketing_settings.sms_sender_id`.
- Falls back to a long code if alphanumeric fails approval.

### 7.3 Per-restaurant carrier setup is operational

We register a single Tavli messaging service in Twilio. Per-restaurant sender IDs are sub-attributes (Twilio supports brand registration; the operational playbook is in §11). Don't go per-restaurant subaccount unless a regulator forces it.

## 8. WhatsApp infrastructure (new)

**Recommendation: Twilio WhatsApp Business API.** Same vendor as SMS — one account, one billing, one SDK.

### 8.1 Wrapper

`src/lib/whatsapp/twilio.ts` mirrors §7.1's pattern with WhatsApp-specific rules:

```ts
type SendWhatsappArgs = {
  to: string                  // E.164 mandatory (same validation as §7.1)
  templateId: string          // Meta-approved template id (per-locale; see §11.4)
  templateVars: Record<string, string>
  restaurantId: string
  dinerId: string             // always required — WhatsApp has no walk-in equivalent
  campaignId?: string         // required for marketing kind
  kind: 'transactional' | 'marketing'
  locale: 'ro' | 'en' | 'de'
  idempotencyKey?: string
}

type SendWhatsappResult =
  | { ok: true; messageId: string; status: 'queued' | 'sent' }
  | { ok: false; code: 'invalid_e164' | 'opt_out' | 'template_not_approved' | 'session_window_closed' | 'quiet_hours' | 'rate_limited' | 'provider_error'; message?: string }

sendWhatsapp(args: SendWhatsappArgs): Promise<SendWhatsappResult>
```

The wrapper enforces, in order:
1. **E.164 validation** — same as SMS.
2. **Suppression check** — `marketing_suppressions` for `(orgId, channel='whatsapp', recipient_identifier=normalised_to)`.
3. **WhatsApp consent present** — `marketing_consents` row for `(org_id, diner_id, channel='whatsapp')` with `consent_given=true AND revoked_at IS NULL`. **Separate from SMS consent** — a diner may grant SMS but withhold WhatsApp on the same phone number. Missing → `'opt_out'`.
4. **Template approval** — resolve `(template_id, locale)` against `marketing_templates`; require `approved_at IS NOT NULL` (Meta approves per-locale individually, see §11.4). Missing locale or unapproved → `'template_not_approved'`.
5. **24-hour session window** — Meta forbids free-text outbound outside the 24-hour customer-care window. For marketing kind, only approved templates are allowed (which Meta permits outside the window). For transactional kind in response to a diner-initiated inbound (within 24h), free-text is allowed; the wrapper checks the last inbound timestamp from `whatsapp_session_state` (a thin table tracking the last diner→Tavli message per (restaurant, diner)) — outside the window, fall back to template-only.
6. **Quiet hours** — same per-locale rules as SMS (§7.1 step 4).
7. **Idempotency** — same as SMS step 6.
8. **Frequency-cap** — same as SMS step 7.

### 8.2 Per-restaurant onboarding

Each restaurant must complete Meta Business verification before WhatsApp is enabled. The operational playbook lives in §11. The verification is async and can take days — `restaurant_marketing_settings.whatsapp_enabled` stays `false` until verified.

### 8.3 Webhooks

- Status callbacks (sent/delivered/read/failed) route through `/api/webhooks/twilio-whatsapp-status` via the shared `ingestWebhook` skeleton (§6.6).
- Inbound messages (diner-initiated) route through `/api/webhooks/twilio-whatsapp-inbound`, updating `whatsapp_session_state.last_inbound_at` to open the 24-hour reply window.

### 8.4 Templates

Per-locale storage in `marketing_templates` with `whatsapp_template_id` (Meta-issued after approval). See §11.4.

## 9. File storage

Supabase Storage for everything. Buckets:
- `restaurant-photos` — venue + dish photography (existing, in use)
- `menu-pdfs` — uploaded menu PDFs (existing, in use)
- `private-space-photos` — event-space inventory (added by migration 0010)
- `campaign-assets` — marketing campaign images (new, §11)
- `qr-tents` — generated QR-code PDFs for table tents (new, §11 + §05)

Conventions:
- Always store storage paths (not signed URLs) in the DB. Generate signed URLs at read time via `src/lib/storage/signed-url.ts` (wrapper to create). Signed URLs are short-lived (1h default; configurable per call site).
- Public buckets: `restaurant-photos` (read-public, write-owner-only). Private buckets: everything else.
- Image transforms: pre-generate sizes on upload using `sharp` (small 400w, medium 1200w, large 2400w; AVIF + WebP variants). Storing pre-rendered variants avoids per-request CPU on the server. Next.js `<Image>` references the matching variant via `srcSet`. See §05 for the upload-time worker job.
- Max upload size: 12MB (existing `serverActions.bodySizeLimit` setting); larger uploads (e.g., video hero for Pro) chunk-upload directly to Storage from the client with a signed upload URL.
- **Upload safety**: every uploaded file passes through (a) MIME sniffing (`file-type` package) — reject if declared type ≠ sniffed type, (b) EXIF stripping for images (privacy: location data) via `sharp({ stripMetadata: true })`, (c) optional ClamAV scan for v1.5 (PDFs only — Romanian regulator may require this for menu PDF uploads; defer until pressure).
- **Lifecycle**: each bucket has a documented retention policy enforced via the nightly `storage.lifecycle-sweep` pg-boss job:
  - `restaurant-photos`: keep while restaurant active; soft-delete cascade purges 90 days after restaurant hard-delete.
  - `menu-pdfs`: same as above.
  - `private-space-photos`: same.
  - `campaign-assets`: purge 180 days after the campaign's `archived_at`. Re-uploadable for active campaigns.
  - `qr-tents`: regenerated on demand; purge unreferenced files at 30 days.
  - `event-attachments` (§10): retain 7 years (RO fiscal); cross-check with §13 retention policy table.

### 9.1 PII in uploaded files

User-uploaded files may contain personal data. Policy:

- **`restaurant-photos`** (public bucket): restaurants are responsible for obtaining model releases for any identifiable individuals in photos. Tavli's terms of service make this an operator obligation. We do NOT automatically scan or blur faces in v1 (no face-detection in scope).
- **`menu-pdfs`**: not expected to contain personal data. If a restaurant uploads a PDF with employee photos or other PII, it's their responsibility under their privacy policy.
- **`private-space-photos`**: same model-release expectation as `restaurant-photos`; this bucket is private so exposure is limited to authenticated B2B buyers viewing event-space inventory.
- **`campaign-assets`**: marketing imagery; restaurants own consent for any people pictured.
- **Diner-uploaded photos (review attachments — v1.5)**: when added, require terms acceptance and a "no faces other than your own" guideline. Out of v1 scope.
- **Erasure cascade**: when a diner requests erasure (§15a.1), photos featuring them remain in `restaurant-photos` (no face recognition to find them). The privacy policy explicitly discloses this limitation. If the diner provides a specific photo URL, Tavli admin manually removes via the admin dashboard and logs to `erasure_log`.

## 10. Background jobs

### 10.1 Current state: bare cron

`/src/app/api/cron/<job>/route.ts` handlers with a `Bearer ${CRON_SECRET}` check. Triggered externally — currently by Coolify scheduled tasks. Single existing job: `post-visit-emails` at `/api/cron/post-visit-emails`.

This works for low-volume polling jobs. It does **not** scale to the marketing suite (which needs delayed sends, retries, dedup, throttling, fan-out from triggers to recipients).

### 10.2 Recommendation: `pg-boss`

A Postgres-backed job queue. Single dependency, no new infra (Postgres is already there). Supports:
- Scheduled jobs (`schedule.sendCron`)
- Delayed jobs (start-after with seconds-level precision)
- Retries with backoff
- Dead-letter queue
- Cron-like recurring schedules
- Singleton jobs (prevent duplicate runs across worker replicas)
- Throttling + rate limiting at the queue level

Alternative considered: Inngest (great DX but cloud-dependent, adds a vendor and a cost line); Trigger.dev (similar tradeoff); BullMQ (requires Redis, which we don't have). pg-boss wins for "stay on what we already run."

**Connection pool — required, not optional.** pg-boss uses `LISTEN/NOTIFY`, which holds long-lived Postgres connections per worker. Supabase's pgbouncer (transaction mode) drops `LISTEN` channels between transactions; pg-boss must bypass it.

- `PGBOSS_DATABASE_URL` env var (separate from `DATABASE_URL`) points to Postgres directly (Supabase exposes a "Direct connection" string on the project's database settings).
- Pool size capped at 4 (single worker process; raise only after splitting workers per §17.1).
- The web app's `DATABASE_URL` continues to use pgbouncer (transaction mode); only the worker bypasses.
- If `PGBOSS_DATABASE_URL` is missing, the worker entrypoint exits 1 with a clear error.

**Idempotency, retry, and dead-letter — explicit per job:** every domain job registration sets:
- `expireInMinutes` (job-execution timeout) — default 10, raise per heavy job.
- `retryLimit` (default 3) + `retryBackoff: true` + `retryDelay: 60` (exponential up to ~1 hr).
- `singletonKey` for jobs that must dedupe across recipients (e.g., `marketing.fan-out:campaign_id`).
- `deadLetter: <queue_name>` — every queue has a paired `<queue_name>__dlq` queue; failures land there with full payload for manual inspection. The Tavli admin dashboard reads `pgboss.job_dlq` views (created during pg-boss bootstrap).
- Job handlers are **idempotent by contract**: re-running with the same payload must be safe. Domain handlers either (a) use an upsert pattern, or (b) check a sentinel column before mutating (e.g., `reminder_sent_at IS NULL`). Tests cover the double-fire case.

### 10.3 Worker process

A second deploy target alongside the web app: `next start` for the web, `node dist/jobs/worker.js` for the worker. Both run in the same Docker image; Coolify deploys them as two services pointing at the same image. Env var `WORKER_MODE=true` flips the entrypoint.

### 10.4 Job kinds in scope before launch

The full registry of pg-boss job names lives in `src/lib/jobs/keys.ts` — see §16.3 below for the canonical TypeScript export. Maintaining a second prose list here would inevitably drift; instead, each domain doc points at §16.3 for the names and documents its own jobs' schedules, payloads, and idempotency contracts in §6 of that domain doc.

Quick summary of categories at launch (full listing in §16.3):
- **reservation.\*** — owned by §02/§04 — reminder + post-visit review + auto-no-show.
- **marketing.\*** — owned by §11 — scheduled-campaign-send, triggered-campaign-fan-out, message-send (leaf), suppression-purge.
- **billing.\*** — owned by §12 — trial-conversion + day 60/75/85 reminders.
- **corporate.\*** — owned by §10 — lead-routing-nudge, event-expiry.
- **analytics.\*** — owned by §07 — weekly-summary, refresh-cohorts.
- **storage.\*** — image-process (on upload), lifecycle-sweep (nightly), video-encode (v1.5).
- **webhook.\*** — reingest-unprocessed (sweeper for stuck `webhook_events` rows; §6.6).
- **compliance.\*** — owned by §13 — erasure-execute, erasure-verify, retention-purge, dsar-export.
- **identity.\*** — owned by §01 — `expire-stale-invitations`, `purge-stale-unverified-orgs`. (Note: profile-role-hint refresh is NOT a job — it's a synchronous repo helper; see §16.3 comment.)

### 10.5 Heavy compute (video transcoding) — externalised, not on the worker

The §05 Pro video-hero feature needs H.264 + WebM transcoding at multiple bitrates. Running FFmpeg inside the pg-boss worker would block the marketing-send queue + balloon worker memory. Recommendation: **Cloudflare Stream**. Cost: ~$1 per 1,000 minutes encoded; HLS playback CDN-fronted at no per-restaurant fee. Alternative considered (FFmpeg in worker) rejected for queue contention reasons. The Cloudflare Stream API call is small (just submit + poll); the actual encoding happens off-platform.

This is the only externalised heavy-compute service in scope before launch. If similar needs emerge (audio processing, image AI, etc.) we revisit the pattern.

### 10.6 Cron endpoints stay where they are for now

Existing cron endpoints under `/api/cron/*` keep working through the migration; we move them to pg-boss one at a time and delete the route once each is on the queue. Trying to migrate all at once risks dropping reminders during the cutover.

## 11. i18n (new)

**Recommendation: `next-intl`.**

- App router native, server component support, message catalogue per locale.
- Catalogues live in `src/messages/<locale>.json` — `ro.json`, `en.json`, `de.json`.
- Domain-scoped namespaces: `messages/<locale>/marketing.json`, `messages/<locale>/booking.json` etc., merged at build time.
- ICU MessageFormat for plurals + gender; never string-concat translations.

### 11.1 Locale resolution

Resolution order, evaluated in `src/middleware.ts`:

1. **Authenticated diner**: `profiles.locale` (set on signup; user-editable in account settings).
2. **Guest with `tavli_locale` cookie**: cookie value (set by previous visit's locale picker or middleware step 3).
3. **`Accept-Language` header** negotiation: match RO/EN/DE only; `'ro-RO'` → `'ro'`, `'de-AT'` → `'de'`, anything else → fallback.
4. **RO fallback**.

On step 3, the middleware writes the resolved locale to the `tavli_locale` cookie (1-year expiry, `SameSite=Lax`, no `HttpOnly` because the client locale-picker reads it). Subsequent requests skip the negotiation.

### 11.2 Canonical URLs + hreflang (SEO-critical)

- Canonical URL for every venue page is `/[city]/[slug]` (no locale prefix — RO is canonical for SEO).
- Locale variants are `/en/[city]/[slug]`, `/de/[city]/[slug]`.
- Every locale variant carries `<link rel="canonical" href="/[city]/[slug]" />` (always RO) plus `<link rel="alternate" hreflang="ro" />`, `<link rel="alternate" hreflang="en" />`, `<link rel="alternate" hreflang="de" />`, `<link rel="alternate" hreflang="x-default" href="/[city]/[slug]" />`.
- Sitemap (`/sitemap.xml`) lists every locale variant of every published venue.
- The pricing page and marketing surfaces follow the same pattern.

### 11.3 Partner-portal scope (locked)

The partner-side UI (`/partner/*`, `/admin/*`) is **RO-only at launch**. Enforcement:
- Middleware: if path matches `/(partner|admin)(/.*)?` and resolved locale ≠ `ro`, rewrite to the RO variant and ignore `tavli_locale` for this request.
- No message-catalogue keys exist for non-RO partner translations until v1.5.

Romanian operators are the v1 audience; the trilingual treatment serves the diner-facing surfaces (venue page, emails, widget, pricing page). EN partner portal lands v1.5 (~3 days); DE later if a German operator requires it.

### 11.4 Email + SMS + WhatsApp templates

- Email: each React Email component takes a `locale` prop and renders subject + body from the catalogue. Locale falls back to RO if a string is missing in EN/DE (with a build-time warning).
- SMS: per-template per-locale rows in `marketing_templates` table (`template_id`, `locale`, `body`, `version`). The send wrapper resolves by `(template_id, locale)`; if the requested locale row doesn't exist, fall back to RO.
- WhatsApp: same storage shape, but each row has a `whatsapp_template_id` issued by Meta after approval (per-locale approval mandatory; one approval per (template_id, locale)). The wrapper rejects a send if the locale-specific row is `approved_at IS NULL`.

### 11.5 Timezones — the canonical pattern

Storage rule: **all timestamps in DB are `timestamptz` (UTC); display + business rules apply restaurant-local timezone at the edge.**

- `restaurants.timezone` column (e.g., `'Europe/Bucharest'`); set on creation, immutable without operational migration (changing it would shift every historical reservation).
- The booking domain uses `date-fns-tz` helpers in `src/lib/time/`:
  ```ts
  toRestaurantLocal(utc: Date, restaurant: { timezone: string }): Date
  fromRestaurantLocal(local: Date, restaurant: { timezone: string }): Date
  isPastForRestaurant(utc: Date, restaurant: { timezone: string }): boolean
  diffHoursRestaurantLocal(a: Date, b: Date, restaurant: { timezone: string }): number
  ```
- **DST boundary worked example** (fall-back, last Sunday of October in `Europe/Bucharest`):
  - At 04:00 EEST UTC+3, clocks turn back to 03:00 EET UTC+2 → the local hour 03:00–04:00 happens twice.
  - A reservation stored as `2026-10-25 01:00:00Z` corresponds to `04:00 local (EEST)` *before* the change OR `03:00 local (EET)` *after*. Postgres `timestamptz` storage resolves this unambiguously; the display layer renders as `04:00` based on the offset at the stored instant.
  - The "24h-before-cutoff" check uses `now() < reservation_at - interval '24 hours'` — both sides are UTC. The diner's view of the cutoff may render as 03:00 *before* the change and 02:00 *after*; we accept this (it's still 24h of wall-clock awareness).
  - We do **not** attempt to schedule reservations in the duplicated local hour (03:00–04:00 on fall-back day). The slot generator skips this window.
  - Spring-forward (last Sunday of March): the local hour 03:00–04:00 does not exist. The slot generator skips this window.

Tests cover both transition days as fixtures (`__tests__/fixtures/dst-2026.ts` — exports `FALL_BACK_2026` and `SPRING_FORWARD_2026` constants with the relevant UTC instants and expected local renderings).

## 12. Observability (new)

### 12.1 Errors: Sentry

- `@sentry/nextjs` integrated via the standard wizard. Source maps uploaded on build.
- Server actions wrap their work in `withSentry(actionName, fn)` so uncaught exceptions report with full context (user, restaurant_id, action name) and the wrapper converts thrown errors into `fail('internal')` without re-throwing across the server-action boundary.
- PII scrubbing rules: never send `guest_phone`, `guest_email`, `diner_email`, payment fields. Allow `restaurant_id`, `reservation_id`, `campaign_id`.
- Breadcrumbs are emitted for every `recordAudit`, `can()` denial, and outbound provider call (Stripe, Resend, Twilio) — these are the highest-value signals on incident pages.

### 12.2 Structured logs

- `pino` for app logging (JSON output to stdout).
- **Mandatory fields on every log line** (enforced by a `withLog(action, fn)` wrapper used by every server action + job handler):
  - `req_id` — UUID set in `middleware.ts` and carried via `AsyncLocalStorage`.
  - `trace_id` + `span_id` — from OpenTelemetry context (§12.3); enables Sentry + log correlation.
  - `action` — fully qualified action name (`reservation.create`, `marketing.send-campaign`).
  - `outcome` — `'ok' | 'invalid' | 'forbidden' | 'conflict' | 'internal' | 'rate_limited'` — matches `ActionResult.code` taxonomy.
  - `duration_ms` — wall time.
  - `user_id?`, `org_id?`, `restaurant_id?` — denormalised lookups when relevant.
  - `error_code?` — domain `TV<NNN>` if present.
- **PII scrubbing** is a pino redact rule list configured once in `src/lib/logging/pino.ts`:
  ```ts
  export const REDACT_PATHS = [
    // Diner / guest PII on inbound requests
    'req.body.phone', 'req.body.email', 'req.body.full_name',
    'req.body.guest_phone', 'req.body.guest_email', 'req.body.guest_name',
    'req.body.allergies', 'req.body.notes',
    // Credentials + tokens (NEVER log)
    '*.password', '*.password_confirmation',
    '*.api_key', '*.refresh_token', '*.access_token', '*.session_token',
    '*.confirmation_token', '*.unsubscribe_token', '*.signed_token',
    // Webhook signature secrets (could leak in error logs)
    '*.stripe_signature', '*.twilio_signature', '*.resend_signature',
    // Payment surface — Stripe SDK handles cards internally; we should never see these
    '*.card', '*.card_number', '*.cvv', '*.cvc', '*.exp_month', '*.exp_year',
  ] as const
  ```
  Pino's redact runs before JSON serialization, so listed paths never reach stdout.
- Stdout is collected by Coolify's log aggregator today; ship to Datadog post-launch. The log format is Datadog-ready out of the box.

### 12.3 OpenTelemetry minimal baseline (launch-required)

Distributed tracing across the web app + pg-boss worker + webhook handlers. Defer-no-longer rationale: greenfield multi-service architecture without correlation makes incident diagnosis a guessing game. ~1 day of setup work pays for itself the first time a marketing-send job goes silent.

- **SDK**: `@vercel/otel` (Next.js-native OpenTelemetry init; works in app router + edge + Node). One-line setup in `instrumentation.ts`.
- **Auto-instrumentation**: HTTP client (`fetch`), Postgres (`pg` driver), pg-boss workers. No manual span creation needed for these.
- **Manual spans** only at semantic boundaries: server actions wrap their body in a `tracer.startActiveSpan(action_name, ...)` via the `withSentry` wrapper. Job handlers do the same in their entrypoint.
- **Trace propagation across pg-boss**: when a server action enqueues a job, attach the current `traceparent` to the job payload as a top-level `_trace` field; the worker reads it back and sets the parent span context before executing the handler. This stitches "user clicks Send Campaign" → "fan-out job" → "per-recipient send" into one trace.
- **Trace propagation across webhooks**: Stripe + Resend + Twilio do not propagate W3C `traceparent`. We treat their callbacks as root spans, linked to the original outbound call via `provider_event_id` (queryable via the `webhook_events` table).
- **Export target**: Sentry's tracing endpoint (already a vendor; no new bill). Sentry's APM is sufficient for v1 scale; Datadog APM v1.5+ if traffic justifies.

### 12.4 What we are NOT adding before launch

- Real-user monitoring (Web Vitals beacon, session replay) — defer to v1.5.
- Custom dashboards in Datadog — defer until Datadog is provisioned.
- Synthetic monitoring (Pingdom, Checkly) — defer; rely on Coolify's healthcheck for liveness.

## 13. Testing patterns

- **Unit**: pure logic only. Validators, formatters, computed slots. Jest, co-located.
- **Integration**: server actions, against a local Supabase via Docker. Jest. Use the `db:seed` script to set up known data.
- **E2E**: critical paths only — book → confirm → cancel; partner login → see today's bookings → mark seated; corporate event request → owner replies → quote accepted. Playwright + axe-core for a11y on the booking flow.
- **No mocks for the DB**. Per memory `feedback_verification`: "code-correct" is not the same as "verified."
- **Visual diffs**: Playwright screenshots for the venue page render in RO/EN/DE. Update baselines deliberately.

### 13.1 Deferred to post-launch

- **API contract testing** — Tavli's public API is internal-only at v1; revisit if/when we expose a partner-integration API (POS, accounting tools).
- **Load testing** — defer until a real bottleneck appears or first chain customer requires an SLA. Plausible tooling: k6 with a recorded booking-flow scenario.
- **Penetration testing** — schedule annually post-launch via an external firm. Pre-launch: rely on standard OWASP review during PR + Sentry alerting in prod + the `axe-core` a11y gate.
- **Mutation testing** (Stryker etc.) — defer; integration tests + the audit-log invariant tests catch the most important behaviour.

## 14. Deployment & CI

### 14.1 Today

- Docker multistage build → image pushed manually → Coolify on Hetzner deploys it.
- Two services planned: `web` (existing) + `worker` (new with pg-boss).
- DB migrations: manual per memory `deploy_setup.md` (3-step bookkeeping). Don't change this casually.

### 14.2 CI (recommended, not present today)

A minimal GitHub Actions workflow on push:
- Install + cache deps.
- `npm run typecheck`.
- `npm run lint`.
- `npm test` (unit + integration).
- `npx playwright test --project=chromium` (e2e — needs a Supabase test DB; can be skipped on draft PRs).
- Build the Docker image; push to a registry; tag with commit SHA.

Don't auto-deploy. Coolify deploys are user-triggered (per memory `deploy_setup.md`).

### 14.3 Environments

| Env | DB | Email | SMS | Stripe |
|---|---|---|---|---|
| local | local Supabase | Resend dev key OR console fallback | console | Stripe test mode |
| staging | Supabase staging project | Resend with sandbox domain | Twilio EU sandbox | Stripe test mode |
| prod | Supabase prod | Resend prod | Twilio EU prod | Stripe live |

Staging doesn't exist today. Add when the build queue allows — not blocking launch.

## 15. Secrets management

Env vars only. `.env.local` for dev, Coolify secrets for prod. Never check secrets into git.

Required env vars (current + new):

```
# Database
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
NEXT_PUBLIC_SITE_URL=

# Email
RESEND_API_KEY=
EMAIL_FROM="Tavli <hello@tavli.ro>"

# SMS / WhatsApp (NEW)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_WHATSAPP_FROM=

# Payments (NEW)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_CLIENT_ID=

# Jobs (NEW)
PGBOSS_DATABASE_URL=     # direct Postgres (bypass pgbouncer) — see §10.2
WORKER_MODE=             # 'true' on the worker service; flips Docker entrypoint — see §10.3

# Cron (existing)
CRON_SECRET=

# Observability (NEW)
SENTRY_DSN=
SENTRY_AUTH_TOKEN=       # source-map upload at build
OTEL_EXPORTER_OTLP_ENDPOINT=  # Sentry's tracing ingest URL — see §12.3

# Unsubscribe signing (NEW)
UNSUBSCRIBE_SECRET=      # HMAC secret for /u/[token] one-click unsubscribe — see §6.5

# Bot protection (NEW — LOCKED in §2)
CLOUDFLARE_TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=

# Video transcoding (DEFERRED to v1.5 — env vars listed for the eventual landing)
CLOUDFLARE_STREAM_API_TOKEN=
CLOUDFLARE_STREAM_ACCOUNT_ID=

# i18n (NEW — no env required; static config)

# Feature flags (NEW — if GrowthBook; deferred to v1.5)
GROWTHBOOK_API_HOST=
GROWTHBOOK_CLIENT_KEY=
```

Document in `.env.local.example` as each lands.

**Secret rotation cadence:** quarterly for symmetric secrets (`CRON_SECRET`, `UNSUBSCRIBE_SECRET`, webhook-signing-fallback secrets). On suspected compromise: rotate immediately + invalidate all sessions via Supabase Auth admin API. Stripe/Twilio/Resend API keys rotate via the provider dashboard (creates a new key, switch env var, deprecate the old one after a 24h overlap).

## 15a. Compliance baseline (EU + RO, 2026 standards)

Cross-cutting commitments referenced from every domain doc. Domain-specific implementation lives in §13 (Compliance & legal ops); the baseline below is the *shared contract*.

### 15a.1 GDPR — lawful basis, erasure, and the canonical "no-PII-regex" rule

**Lawful basis per data point** (per Art 6): every column holding personal data is tagged in `src/lib/compliance/lawful-basis.ts`:
```ts
export const LAWFUL_BASIS = {
  'diners.full_name': { basis: 'contract', purpose: 'reservation_management' },
  'diners.phone':     { basis: 'contract', purpose: 'reservation_management' },
  'diners.email':     { basis: 'contract', purpose: 'reservation_management' },
  'diners.allergies': { basis: 'consent',   purpose: 'allergy_safety', article9: true },
  'marketing_sends.recipient_identifier': { basis: 'consent', purpose: 'marketing' },
  // ...
} as const
```
The DSAR export (§13) joins against this registry to render the legal basis next to each disclosed field.

**Erasure via append-only marker + `erasure_log`** (NOT in-place JSONB regex):

Regex-replacing PII inside `audit_logs.context` or `partner_notifications.payload` is unsafe (false positives on common substrings, unverifiable to a regulator, no rollback on partial failure). The canonical pattern instead:

```sql
-- Every table holding PII has a redaction marker.
alter table diners add column redacted_at timestamptz;
alter table reservations add column redacted_at timestamptz;
alter table reviews add column redacted_at timestamptz;
alter table audit_logs add column redacted_at timestamptz;
-- + all other PII-bearing tables; see §13 for the full registry.

-- A separate append-only log captures every erasure event.
create table erasure_log (
  id                    uuid primary key default gen_random_uuid(),
  data_subject_request_id uuid not null references data_subject_requests(id),
  table_name            text not null,
  row_id                uuid not null,
  fields_erased         text[] not null,             -- which columns were nulled
  reason                text not null,               -- 'gdpr_art_17' | 'retention_expiry' | 'admin_request'
  erased_by             uuid references auth.users(id),
  erased_at             timestamptz not null default now(),
  verified_at           timestamptz,                 -- set when the post-erasure verification job confirms PII is gone
  verification_payload  jsonb                        -- snapshot of "what we checked and found null"
);
```

**Read path filters out redacted rows** at the repo layer (`src/lib/repos/`):
```ts
// Standard repo pattern: every read filters out redacted rows unless explicit override.
const activeReviews = await db.query.reviews.findMany({
  where: and(eq(reviews.restaurantId, id), isNull(reviews.redactedAt)),
})
```

**For deletion that must preserve the row** (audit_logs, billing_audit_log): set `redacted_at = now()`, null the PII columns (`actor_email`, `actor_name`), keep operational columns (`action`, `subject_id`, `created_at`). Insert an `erasure_log` row. A nightly verification job re-reads the redacted rows and confirms PII columns are null, setting `verification_payload + verified_at`. If verification finds residual PII, alert Sentry — this is a bug in the erasure path.

**For deletion that may drop the row entirely** (diners with no fiscal retention obligation): hard-delete after a 30-day soft-delete grace window. The grace window is enforced by `redacted_at`-then-`deleted_at`-then-actual-delete state machine.

**No regex replace inside JSONB.** If `partner_notifications.payload` denormalises a diner's name into a string blob, the data model is wrong — refactor to use FK references on `diner_id`, then erasure simply nulls the FK target. Domain docs that store denormalised PII in JSONB must justify it and document the erasure-time replacement strategy explicitly (typically: replace the entire JSONB with `{ erased: true, erased_at: ... }` rather than partial-string substitution).

**Third-party residual data — explicitly out of immediate control.** Tavli's erasure cascade nulls our data; third-party platforms hold their own copies that we cannot delete synchronously:

| Provider | Data held | Our action on erasure |
|---|---|---|
| Meta WhatsApp Business | Conversation history + message metadata; visible in the diner's own chat | Submit a deletion request through Meta's documented WhatsApp Business data-deletion process. The exact endpoint and request shape change periodically; the operational runbook (`docs/operations/whatsapp-data-deletion.md`) tracks the current path. Response is async (up to 30 days per Meta's published SLA). Diner's chat history on their own device is not deletable by us — disclose this in the privacy policy. |
| Twilio (SMS + WhatsApp) | Message logs (90-day default retention) | Submit data-deletion via Twilio Console / API; carrier-side SMS history outside our control. |
| Resend | Email sends + open/click events (90-day retention) | Webhook + API delete; same async pattern. |
| Stripe | Payment + customer records — **retained under fiscal obligation**, not erased | **Pseudonymise** the Stripe customer's `name` + `email` via the Stripe API (the `customer_id` remains as a reversible identifier — this is pseudonymisation per GDPR Art 4(1), not anonymisation). Transaction records kept for 7-year RO fiscal retention under GDPR Art 17(3)(b) (legal obligation overrides erasure). |
| Sentry | Breadcrumbs may contain PII despite scrubbing | Server-side scrubbing rules (see §12.1) + Sentry's 30-day default retention; manual purge via API on individual issues if a diner-specific issue is surfaced. |

The `erasure_log` row tracks each third-party deletion submission with `provider`, `provider_request_id`, `submitted_at`, `confirmed_at?`. The Tavli admin dashboard surfaces unconfirmed third-party deletions older than 35 days for manual follow-up.

### 15a.2 PSD2 / SCA — payment auth

Strong Customer Authentication is mandatory for EU card charges over €30 (some banks lower) and for all recurring-payment setup. Tavli's implementation:

- **Subscription card-on-file at signup**: use Stripe Checkout in `mode='setup'` (a SetupIntent) — Stripe handles 3DS challenges automatically and the customer sees the bank's confirmation flow.
- **Send the explicit recurring-charge consent email** post-checkout: subject "Card on file at Tavli — recurring charge confirmation". This is the PSD2 recital-15 audit evidence ("explicit consent for the merchant-initiated transaction").
- **Day-91 trial conversion**: the first charge is a merchant-initiated transaction (MIT) flagged with `setup_future_usage: 'off_session'` and `off_session: true`. If the issuer refuses (rare; common during regulatory storms), Stripe returns `authentication_required` → subscription enters `incomplete` state. The dunning flow re-attempts via email to "complete your subscription" with a hosted 3DS challenge.
- **Per-event deposits (§10 corporate events) — v1.5**: Stripe Connect (which restaurant deposits require) is **deferred to v1.5** per §2. When it lands: each deposit is a separate authorisation (not a recurring charge), so 3DS triggers on first authorisation; not eligible for MIT fallback. Pre-v1.5: no card-on-file deposit flow ships, so this concern is dormant.

### 15a.3 NIS2 directive — in-scope assessment

NIS2 (EU 2022/2555) applies to "important" entities including "digital service providers" with >50 employees or >€10M turnover. Tavli at launch: pre-revenue, ~3 employees. **Out of scope at launch.** Revisit when either threshold is crossed; the prep work to comply is meaningful (governance + risk management + 24h/72h incident reporting to ANSPDCP).

What we do anyway, because it's good hygiene and de-risks the eventual transition:
- Document a basic incident response plan (`docs/operations/incident-response.md`) including the regulator-notification path for personal-data breaches (always required under GDPR Art 33, 72-hour clock).
- Maintain a sub-processor list (`docs/operations/sub-processors.md`) — Supabase, Resend, Twilio, Stripe, Sentry, Coolify, Hetzner.
- Run a quarterly tabletop incident drill once we have 3+ staff.

### 15a.4 EU AI Act — applicability

The EU AI Act (2024/1689) imposes obligations on AI-system providers and deployers. Tavli at v1 has **no AI features**:
- No AI-powered concierge (per memory `marketing_strategy`).
- No automated decision-making affecting diners (Art 22 — bookings are deterministic + human-mediated).
- No biometric processing.
- Anti-spam classification (if added to reviews moderation in v1.5) would be a "limited risk" GP-AI deployment requiring transparency notices; defer until built.

If any AI feature is introduced post-launch, a fresh applicability assessment runs in §13.

### 15a.5 DSA — applicability

The Digital Services Act (EU 2022/2065) applies to "intermediary services" hosting third-party content. Tavli hosts diner reviews + restaurant content. **In scope as a "hosting service provider"** but **below the "very large platform" threshold** (>45M monthly EU users).

Minimum obligations we ship from launch:
- Notice-and-action mechanism for illegal content (a "report this review" link on every review; routes to a moderation queue per §06).
- Statement of reasons when removing user content (sent via email to the review author).
- Annual transparency report (light; defer first publication to month 12 post-launch).
- Single point of contact for authorities. Pre-NIS2 (sub-threshold scale, no formal DPO designation required under GDPR Art 37(1)), Tavli publishes a **Privacy Contact** rather than a DPO — typically a founder or executive accountable for data-protection matters. The contact is listed at `/legal/privacy`. When NIS2 or scale triggers a DPO requirement, Tavli will appoint an independent DPO (employee with no conflict-of-interest, or a contracted external DPO) per GDPR Art 38(6) — the founder/CEO cannot also be DPO under those rules.

### 15a.6 ANPC + ANSPDCP — Romanian regulators

- **ANPC** (consumer protection) — display T&Cs + withdrawal-right (14 days) notice on signup; in-app accessible at `/legal/terms`. The pricing-page Year-1 cost display is regulated; see §15.
- **ANSPDCP** (data protection) — DPO contact published on `/legal/privacy`; cookie consent (12-13 months retention per CNIL/ANSPDCP alignment); 72-hour breach notification rehearsed via the incident drill.
- **e-Factura** (mandatory B2B e-invoicing in RO from 2024) — Stripe invoices satisfy ANPC for B2C SaaS; B2B customers may require post-processing into RO SPV. See §12.

### 15a.7 Accessibility — WCAG 2.2 AA

All diner-facing surfaces (venue page, booking widget, pricing page, marketing emails, partner-portal staff-facing UI) target **WCAG 2.2 AA**. Specific 2.2 additions relevant to Tavli:

- **2.4.11 Focus Not Obscured (Minimum)** — focus indicator never fully behind a sticky header or fixed element. Build a focus-indicator design token (`outline: 2px solid var(--focus-ring)`) used everywhere.
- **2.5.8 Target Size (Minimum)** — interactive targets ≥24×24 CSS px (with the standard exceptions: inline text links, browser-defaults). Touch surfaces target 44×44: the mobile venue page booking flow, the partner-portal viewed on tablet (most common partner field-use case), and any v1.5 surfaces (booking widget) when they ship.
- **3.3.7 Redundant Entry** — don't ask diners to re-enter info already captured (e.g., guest checkout form pre-fills from a reservation token).
- **3.3.8 Accessible Authentication** — never block sign-in on a cognitive function test (no "rearrange these pictures" challenges). Magic links + passwords + (v1.5) passkeys are all accessible by default.

CI: every PR runs `axe-core` on the public booking flow + pricing page via Playwright. Failures block merge. The full a11y audit playbook lives in `docs/operations/accessibility.md`.

### 15a.8 Data residency

All processing is EU-only:
- Supabase project region: `eu-central-1` (Frankfurt) or `eu-west-3` (Paris) — confirm at provisioning.
- Resend EU: `eu-west-1` cluster (`*.eu.resend.com`).
- Twilio EU: Ireland.
- Stripe: EU entity (Stripe Payments Europe Ltd).
- Sentry: EU region (`*.de.sentry.io`) — both the issues endpoint and the tracing/APM ingest endpoint run on Sentry's EU tenancy, so OpenTelemetry exports stay in-region.
- Cloudflare (Turnstile + Stream when added): EU data processing addendum + EU PoP routing (Cloudflare's standard EU configuration; no cross-border transfer of request bodies).
- Coolify on Hetzner: Falkenstein (DE) or Nuremberg.

DPAs (Data Processing Agreements) signed with all sub-processors at procurement; documented in `docs/operations/sub-processors.md`.

## 16. Three cross-cutting registries

To prevent collisions + drift across 16 domain docs, three vocabularies live in single source-of-truth files.

### 16.1 Error codes — `src/lib/errors/codes.ts`

Per-domain `TV<NNN>` ranges. Adding a new error code requires updating the registry.

```ts
// src/lib/errors/codes.ts — single source of truth; never duplicate.
// `slug` is the machine-readable code suffix used for i18n key lookup;
// it is intentionally distinct from `ActionResult.message` (which is a
// human-readable English fallback string, not a key).
export const ERROR_CODES = {
  // §02 Bookings (TV001–TV099)
  TV001: { domain: '02', slug: 'no_availability' },
  TV002: { domain: '02', slug: 'slot_full' },
  TV003: { domain: '02', slug: 'modification_window_closed' },
  TV004: { domain: '02', slug: 'capacity_override_denied' },
  // §03 Diners (TV100–TV199)
  TV101: { domain: '03', slug: 'phone_or_email_required' },
  TV102: { domain: '03', slug: 'identity_field_not_editable_by_venue_staff' },
  TV103: { domain: '03', slug: 'diner_pseudonymised' },
  // ... full list per domain doc; ~80 codes total at launch
} as const

export type DomainErrorCode = keyof typeof ERROR_CODES
export type ActionErrorCode =
  | DomainErrorCode
  | 'unauthenticated' | 'forbidden' | 'invalid_input' | 'not_found'
  | 'conflict' | 'rate_limited' | 'internal'
```

The partition table below is a human-readable index of which domain owns which range — the TypeScript export above is canonical for the codes themselves.

| Range | Domain | Notes |
|---|---|---|
| TV001–TV099 | §02 Bookings | TV001 = no availability, TV002 = slot full (existing in production); TV003 = modification window closed, TV004 = capacity override denied, TV005 = restaurant not found / not published, TV006 = outside booking window, TV007 = already terminal, TV008 = token invalid, TV009 = identity field change blocked. |
| TV100–TV199 | §03 Diners | TV101 = phone-or-email-required, TV102 = identity-field-not-editable-by-venue-staff, etc. |
| TV200–TV299 | §04 Comms | TV201 = no transactional channel opted in, etc. |
| TV300–TV399 | §05 Venue page | TV301 = tier-limit-reached for photos, TV302 = same for menus. |
| TV400–TV499 | §06 Reviews | TV401 = `already_reviewed`, TV402 = `review_window_expired`, TV403 = `edit_window_closed`, TV404 = `review_hidden` (no edits after moderation), TV405 = `comment_too_short` (low-rating comment-length rule). |
| TV500–TV599 | §07 Analytics | TV501 = export too large, TV502 = no data in window. |
| TV600–TV699 | §08 Tables | TV601 = invalid transition, TV602 = combination would exceed capacity. |
| TV700–TV799 | §09 Multi-loc | TV701 = upgrade required for multi-venue. |
| TV800–TV899 | §10 Corp events | TV801 = no matching venues, TV802 = quote expired, TV803 = deposit_requires_stripe_connect (v1 deposit guard until Connect ships v1.5). |
| TV900–TV999 | §11 Marketing | TV901 = quota exceeded, TV902 = template rejected by Meta, TV903 = consent required, TV904 = whatsapp_not_enabled (Pro-tier + Meta-verification gate). |
| TV1000–TV1099 | §12 Billing | TV1001 = `trial_already_used`, TV1002 = `tax_id_already_claimed`, TV1003 = `card_declined`, TV1004 = `vies_validation_failed`, TV1005 = `downgrade_blocked_venue_count`, TV1006 = `subscription_authentication_required` (issuer step-up SCA needed). |
| TV1100–TV1199 | §13 Compliance | TV1101 = `identity_not_verified`, TV1102 = `rate_limit_exceeded`, TV1103 = `gdpr_deadline_extension_capped` (>14 days requested), TV1104 = `processing_restricted` (Art 18 restriction active on the subject diner). |
| TV1200–TV1299 | §14 Setup | TV1201 = `migration_source_unsupported`, TV1202 = `migration_row_invalid` (per-row CSV failure), TV1203 = `migration_file_too_large` (>5 MB), TV1204 = `setup_step_unknown`, TV1205 = `setup_step_transition_invalid`. |
| TV1300–TV1399 | §15 Pricing | TV1301 = `waitlist_email_already_pending`, TV1302 = `bnr_rate_stale_critical` (>14d staleness alert; doesn't block page render). |
| TV1400–TV1499 | §01 Identity | TV1401 = `trial_already_used`, TV1402 = `org_not_verified`, TV1403 = `tax_id_already_claimed`, TV1404 = `invitation_expired`, TV1405 = `invitation_already_claimed`. |

Standard cross-cutting codes (no `TV` prefix): `'unauthenticated'`, `'forbidden'`, `'invalid_input'`, `'not_found'`, `'conflict'`, `'rate_limited'`, `'internal'`.

### 16.2 Audit-log actions — `src/lib/audit/actions.ts`

Canonical list of every `audit_logs.action` string. New action requires a registry entry + a typed const export. The §13 `recordAudit` helper accepts only registered actions.

Naming convention: `<domain>.<entity>.<verb>`. Lower-snake-case. Never renamed (would break historical queries).

```ts
// src/lib/audit/actions.ts — single source of truth.
export const AUDIT = {
  auth: {
    signin_succeeded: 'auth.signin_succeeded',
    signin_failed: 'auth.signin_failed',           // brute-force signal; rate-limited path
    signout: 'auth.signout',
    password_reset_requested: 'auth.password_reset_requested',
    password_reset_completed: 'auth.password_reset_completed',
    mfa_enrolled: 'auth.mfa_enrolled',
    mfa_disabled: 'auth.mfa_disabled',
  },
  user: {
    created: 'user.created',
    erased: 'user.erased',                         // account-deletion / right-to-erasure
    role_changed: 'user.role_changed',
    impersonation_started: 'user.impersonation_started',
    impersonation_ended: 'user.impersonation_ended',
  },
  organization: {
    created: 'organization.created',
    updated: 'organization.updated',
    merged: 'organization.merged',                 // Tavli-admin merge of two orgs (§01)
    member_invited: 'organization.member_invited',
    member_joined: 'organization.member_joined',
    member_removed: 'organization.member_removed',
  },
  restaurant: {
    created: 'restaurant.created',
    updated: 'restaurant.updated',
    published: 'restaurant.published',
    archived: 'restaurant.archived',
    staff_invited: 'restaurant.staff_invited',     // §01 venue-level invite issued
    staff_added: 'restaurant.staff_added',         // §01 venue-level invite claimed
    staff_removed: 'restaurant.staff_removed',
  },
  reservation: {
    created: 'reservation.created',
    modified: 'reservation.modified',
    cancelled: 'reservation.cancelled',
    capacity_overridden: 'reservation.capacity_overridden',
    table_auto_cleared: 'reservation.table_auto_cleared',
  },
  diner: {
    merged: 'diner.merged',
    split: 'diner.split',
    pii_accessed: 'diner.pii_accessed',
    pseudonymised: 'diner.pseudonymised',
    deleted: 'diner.deleted',
  },
  review: {
    submitted: 'review.submitted',
    edited: 'review.edited',
    responded: 'review.responded',                 // first owner response on a review
    response_edited: 'review.response_edited',     // subsequent edits to an existing response
    hidden: 'review.hidden',
    reported: 'review.reported',                   // DSA notice-and-action
  },
  table: {
    created: 'table.created',
    updated: 'table.updated',
    archived: 'table.archived',
    status_changed: 'table.status_changed',
    combination_created: 'table.combination_created',
    combination_dissolved: 'table.combination_dissolved',
  },
  walkin: {
    added: 'walkin.added',
    called: 'walkin.called',
    seated: 'walkin.seated',
    left: 'walkin.left',
  },
  analytics: {
    export_run: 'analytics.export_run',                          // §07: every CSV export (regular + bypass)
    cohort_manually_overridden: 'analytics.cohort_manually_overridden', // §07 §5.1b admin-backfill override
    weekly_summary_sent: 'analytics.weekly_summary_sent',        // §07 §9: weekly digest delivered
  },
  marketing: {
    campaign_created: 'marketing.campaign_created',
    campaign_edited: 'marketing.campaign_edited',
    campaign_paused: 'marketing.campaign_paused',                // covers pause + unpause; context.paused
    campaign_archived: 'marketing.campaign_archived',
    campaign_sent: 'marketing.campaign_sent',                    // fan-out begins
    segment_created: 'marketing.segment_created',
    segment_edited: 'marketing.segment_edited',
    suppression_added: 'marketing.suppression_added',
    consent_captured: 'marketing.consent_captured',
    consent_revoked: 'marketing.consent_revoked',
  },
  billing: {
    subscription_created: 'billing.subscription_created',
    subscription_updated: 'billing.subscription_updated',
    subscription_upgraded: 'billing.subscription_upgraded',           // §12 §8.2 tier swap
    subscription_cancelled: 'billing.subscription_cancelled',         // §12 §10.1
    frequency_change_requested: 'billing.frequency_change_requested', // §12 §8.3 queued
    frequency_changed: 'billing.frequency_changed',                   // §12 §8.3 cron applied
    payment_succeeded: 'billing.payment_succeeded',
    payment_failed: 'billing.payment_failed',
    refund_issued: 'billing.refund_issued',                            // §12 §10.2 pro-rata
    setup_intent_succeeded: 'billing.setup_intent_succeeded',         // §12 §7.2
    psd2_consent_captured: 'billing.psd2_consent_captured',
    dispute_opened: 'billing.dispute_opened',                          // Stripe charge.dispute.created
  },
  webhook: {
    received: 'webhook.received',                  // every signature-verified inbound
    handler_failed: 'webhook.handler_failed',
    reingested: 'webhook.reingested',              // sweeper picked up stuck row (§6.6)
  },
  setup: {
    step_transitioned: 'setup.step_transitioned',                      // §14 §5.3 — any setup_progress status change; admin overrides distinguished by actor_role
    migration_started: 'setup.migration_started',                      // §14 §6.2 step 6
    migration_completed: 'setup.migration_completed',                  // §14 §6.3 step 5
    migration_rolled_back: 'setup.migration_rolled_back',              // §14 §6.4
    parallel_run_consolidated: 'setup.parallel_run_consolidated',      // §14 §7.3
  },
  pricing: {
    waitlist_email_added: 'pricing.waitlist_email_added',              // §15 §18 OQ8 — prospect submitted email
    waitlist_email_invited: 'pricing.waitlist_email_invited',          // §15 §18 OQ8 — Tavli admin issued invitation from waitlist
    rate_override_set: 'pricing.rate_override_set',                    // §15 §5.1 — admin manual BNR rate override
    rate_stale_critical: 'pricing.rate_stale_critical',                // §15 §5.1 — >14 day staleness alert
  },
  compliance: {
    gdpr_request_received: 'compliance.gdpr_request_received',
    gdpr_deadline_extended: 'compliance.gdpr_deadline_extended',     // §13 §6.2 step 4: Tavli-admin 14-day extension
    gdpr_request_auto_rejected: 'compliance.gdpr_request_auto_rejected', // §13 §6.2 step 2: day-25 auto-reject when identity not verified
    gdpr_otp_verify: 'compliance.gdpr_otp_verify',                    // §13 §9.2 OTP attempts (success or failure via outcome)
    erasure_executed: 'compliance.erasure_executed',
    retention_purge_run: 'compliance.retention_purge_run',
    dsar_exported: 'compliance.dsar_exported',
    cookie_consent_granted: 'compliance.cookie_consent_granted',       // §13 §10: visitor consent capture
    cookie_consent_revoked: 'compliance.cookie_consent_revoked',
    processing_restricted: 'compliance.processing_restricted',         // §13 §6.6 Art 18 restriction applied to a diner
  },
  // Add to this registry whenever a new domain action is introduced.
} as const
```

Concrete usage:

```ts
import { AUDIT } from '@/lib/audit/actions'
import { recordAudit } from '@/lib/audit/record'

await recordAudit({
  action: AUDIT.reservation.created,             // typed; no free strings allowed
  subjectType: 'reservation',
  subjectId: reservation.id,
  actorUserId: session.userId,
  actorRole: session.actorRole,                  // see ActorRole below
  impersonatorUserId: session.impersonatorUserId,// nullable; set when admin is impersonating
  organizationId: reservation.organizationId,
  restaurantId: reservation.restaurantId,
  context: {                                     // jsonb; no PII denormalisation, no secret tokens
    party_size: reservation.partySize,
    slot_id: reservation.slotId,
    reservation_id: reservation.id,              // FK ids only
  },
})

// ActorRole — granular per §01 permission matrix
type ActorRole =
  | 'tavli_admin'
  | 'org_owner' | 'org_manager'
  | 'restaurant_owner' | 'restaurant_manager' | 'restaurant_host'
  | 'diner'
  | 'system'                                     // pg-boss jobs, webhooks, cron
```

**Constraints on `context`:**
- Max payload size 4KB (enforced by `recordAudit`). Larger payloads → store a reference + persist the blob in `audit_log_attachments`.
- No PII strings (`diner.full_name`, `phone`, `email`) — use FK ids only. PII bound to context is unredacted on erasure unless the context is replaced wholesale per §15a.1.
- `recordAudit` is `await`-ed in the same transaction as the mutation when possible (atomicity); otherwise `after()` fires it post-response with retry-on-failure.

### 16.3 Job keys — `src/lib/jobs/keys.ts`

Canonical list of every pg-boss job name. Same pattern: registry export + typed constants.

Examples (full list lives in the file, not duplicated here):

```ts
export const JOBS = {
  reservation: {
    sendReminder24h: 'reservation.send-24h-reminder',
    sendPostVisitReview: 'reservation.send-post-visit-review-request',
    autoMarkNoShow: 'reservation.auto-mark-no-show',
  },
  marketing: {
    scheduledCampaignSend: 'marketing.scheduled-campaign-send', // builder-scheduled one-off
    fanOut: 'marketing.triggered-campaign-fan-out',             // enqueued on diner event (post-visit, birthday, etc.)
    sendMessage: 'marketing.send-message',                      // per-recipient leaf job
    suppressionPurge: 'marketing.suppression-purge',            // 90 days post opt-out
  },
  billing: {
    trialConversion: 'billing.trial-conversion',
    sendReminderDay60: 'billing.send-reminder-day-60',
    sendReminderDay75: 'billing.send-reminder-day-75',
    sendReminderDay85: 'billing.send-reminder-day-85',
    syncStripeSubscription: 'billing.sync-stripe-subscription',          // §12 §13: nightly reconciliation
    reportMarketingOverage: 'billing.report-marketing-overage',          // §12 §9.1 / §13: first-of-month
    expireOrphanIncomplete: 'billing.expire-orphan-incomplete',          // §12 §13: hourly cleanup
    archiveCancelledOrgs: 'billing.archive-cancelled-orgs',              // §12 §10.3 / §13
    applyPendingFrequencyChanges: 'billing.apply-pending-frequency-changes', // §12 §8.3 / §13: every 30 min
    enforceDunningTier: 'billing.enforce-dunning-tier',                  // §12 §11.5: day-7 soft-lock, day-21 read-only
  },
  corporate: {
    leadRoutingNudge: 'corporate.lead-routing-nudge',
    eventExpiry: 'corporate.event-expiry',
  },
  analytics: {
    weeklySummary: 'analytics.weekly-summary',
    refreshCohorts: 'analytics.refresh-cohorts',
  },
  storage: {
    imageProcess: 'storage.image-process',         // sharp pre-gen + EXIF strip + MIME sniff on upload
    lifecycleSweep: 'storage.lifecycle-sweep',     // bucket retention policies (§9)
    videoEncode: 'storage.video-encode',           // Cloudflare Stream submit + poll (v1.5)
  },
  webhook: {
    reingestUnprocessed: 'webhook.reingest-unprocessed', // §6.6 sweeper for stuck rows
  },
  setup: {
    runMigrationImport: 'setup.run-migration-import',           // §14 §6.3
    flagAtRiskOrgs: 'setup.flag-at-risk-orgs',                  // §14 §9 daily 09:00 UTC
    sendDay7Checkin: 'setup.send-day-7-checkin',                // §14 §9 per-restaurant scheduled
    sendDay30Checkin: 'setup.send-day-30-checkin',
    sendDay60Checkin: 'setup.send-day-60-checkin',
  },
  pricing: {
    refreshCurrencyRates: 'pricing.refresh-currency-rates',     // §15 §5.1 daily 14:30 EEST post-BNR publish
  },
  compliance: {
    erasureExecute: 'compliance.erasure-execute',  // GDPR Art 17 cascade
    erasureVerify: 'compliance.erasure-verify',    // residual-PII check post-erasure
    retentionPurge: 'compliance.retention-purge',  // §13 policy-driven purge
    dsarExport: 'compliance.dsar-export',          // §13 DSAR ZIP generation (access + portability)
    fullOrgExport: 'compliance.full-org-export',   // §13 §7: subscription-cancellation full bundle
    autoRejectUnverified: 'compliance.auto-reject-unverified', // §13 §6.2 day-25 auto-reject
    flagOverdueRequests: 'compliance.flag-overdue-requests',   // §13 daily T-5 alert
    purgeRateLimits: 'compliance.purge-rate-limits',           // §13 §9.3
    purgeCookieConsents: 'compliance.purge-cookie-consents',   // §13 §10.0
    gdprOtpVerify: 'compliance.gdpr-otp-verify',               // §13 §9.2 / §17 OQ3 resolved
    retryAuthDeletion: 'compliance.retry-auth-deletion',       // §01 Stage-2 retry when Supabase Auth Admin API fails after Tavli-side redaction succeeded
  },
  identity: {
    expireStaleInvitations: 'identity.expire-stale-invitations',
    purgeStaleUnverifiedOrgs: 'identity.purge-stale-unverified-orgs', // §01 30-day expiry of orgs in pending_verification
    // NOTE: profile-role-hint refresh is NOT a pg-boss job — it's a synchronous helper call
    // invoked by `withUpdatedAt` on membership mutations (see §01 §10). Do not enqueue.
  },
} as const
```

## 17. Cross-cutting open questions

1. **Worker process count**: single worker for all queues, or per-domain workers (marketing-sender, billing-jobs, analytics)? Recommendation: start with one; split if any one queue's depth > 1000 backed up for >5 min (SLA: transactional sends must complete within 5 min of scheduling).
2. **Multi-tenancy isolation**: shared schema with RLS (current pattern, recommended) vs schema-per-org. Recommendation: keep shared. Schema-per-org is operational nightmare at 100+ restaurants.
3. **Idempotency-key UX in client errors**: when a duplicate request hits a different-hash row (same key, mutated payload), do we surface a friendly "request already in flight" message or a generic conflict? Recommendation: friendly message with the original `result_payload` shown read-only. Decide when building the booking widget.

(Turnstile, previously open question 4, is now locked — see §2 stack snapshot.)

## 18. Build sequence — new infrastructure before launch

Ordered by dependency, smallest blocking unit first. Cross-reference build PRs to this list as they merge. **Steps 1–3 are the foundational types that everything else imports** — they ship together in the same PR if practical.

1. **Error-code registry** (`src/lib/errors/codes.ts`) — typed `ERROR_CODES` + `ActionErrorCode` union. No logic, just types + seed entries per domain. ~0.25 days. **Blocks everything else.**
2. **Server-action helper** (`src/lib/server-action.ts`) — `ActionResult<T>` + helpers (`ok`, `fail`, `invalid`, `unauthenticated`, etc.). ~0.5 days. **Blocks every server action.**
3. **Authorisation helper** (`src/lib/authz/`) — `can()` + `requireCan()` skeleton with permission matrix per §01. ~2 days (extended to include test fixtures covering every matrix cell). **Blocks every server action.**
4. **Logging + observability** — pino + `withLog(action, fn)` wrapper; `@vercel/otel` instrumentation; Sentry wizard; `withSentry` wrapper that combines all three. ~2 days. **Blocks production rollout.**
5. **i18n via `next-intl`** — install, middleware, message catalogues (RO seeded; EN/DE empty), partner-portal RO-only enforcement, hreflang + canonical helper for the venue page. ~3 days for setup + ongoing for content. **Blocks every diner-comms feature with RO/EN/DE.**
6. **`webhook_events` table + `ingestWebhook` skeleton** — the shared idempotency surface for Resend + Twilio + Stripe. ~1 day. **Blocks every webhook handler.**
7. **pg-boss substrate** — install, separate `PGBOSS_DATABASE_URL`, worker entrypoint, single test job, deploy worker service to Coolify. Per-queue DLQ. Traceparent propagation in job payload. ~2.5 days. **Blocks marketing sends, reminder emails, billing reminders.**
8. **Twilio SMS wrapper** — `src/lib/sms/twilio.ts` + E.164 validation + per-locale quiet hours + STOP-keyword inbound handler. ~1.5 days. **Blocks SMS channel.**
9. **Twilio WhatsApp wrapper** — `src/lib/whatsapp/twilio.ts`. ~2 days (Meta verification operational lift not counted). **Blocks WhatsApp channel.**
10. **Stripe SDK + Checkout setup-mode flow** — `src/lib/stripe/`. SetupIntent + PSD2/SCA explicit-consent email. Subscription logic lives in §12. ~1.5 days. **Blocks billing flow.**
11. **Resend webhooks** — `/api/webhooks/resend/route.ts` for bounces + complaints → suppressions table. ~1 day. **Blocks deliverability hygiene.**
12. **Twilio webhooks** — inbound (`STOP` keyword), status callbacks. ~1 day. **Blocks SMS/WhatsApp compliance.**
13. **Foundation tables migration** (§4.7) — `rate_limits`, `idempotency_keys`, `marketing_suppressions`, `marketing_consents` tables + RLS + helpers (`checkRateLimit`, `withIdempotency`). Includes the RFC 8058 `/u/[token]` endpoint that writes to `marketing_suppressions`. ~1.5 days. **Blocks §11 marketing + §02 widget rate-limiting + §13 GDPR-OTP throttling.**
14. **`audit_logs` + `erasure_log` tables + `recordAudit()` helper + `redacted_at` markers on PII-bearing tables** — substrate for GDPR erasure pattern. ~1.5 days. **Blocks GDPR audit obligations.**
15. **Storage upload pipeline** — sharp pre-generation + EXIF strip + MIME sniff + signed-URL wrapper. ~1 day. **Blocks photo upload flows.**
16. **CI** — GitHub Actions: install, typecheck, lint, test, axe-core a11y, Playwright e2e on chromium, Docker build + push. ~1 day.

**Total foundations work to clear before launch: ~22 working days.** The trim from 17 → 16 steps reflects consolidating idempotency-keys into the foundation-tables migration; total effort unchanged. Sequencing-aware, two engineers could compress this to ~14 calendar days; solo ~4.5 calendar weeks. Reflect this in the W8 launch scope decision in `launch-feature-commitments.md`.

## 19. Cross-references

- §01 — extends auth/session with staff roles, organisations; consumes `can()` from step 3, `audit_logs` from step 14.
- §02 — consumes timezone helpers (§11.5), `audit_logs` (step 14), `idempotency_keys` + `rate_limits` foundation tables (§4.7).
- §03 — consumes the GDPR erasure pattern (§15a.1) for diner pseudonymisation; PII-access logging via `audit_logs` (step 14); `marketing_consents` + `marketing_suppressions` foundation tables (§4.7).
- §04 — consumes the email/SMS wrappers (steps 8, 11, 12) + i18n (step 5) + `webhook_events` (step 6).
- §05 — consumes the storage upload pipeline (step 15); hreflang + canonical from i18n (step 5).
- §06 — consumes `audit_logs` (step 14); DSA notice-and-action wiring per §15a.5.
- §07 — consumes pg-boss (step 7) for aggregation jobs; analytics-export rate limit via `audit_logs`.
- §08 — consumes Supabase Realtime; emits to `audit_logs` (step 14) on every status transition.
- §09 — consumes `can()` for cross-venue permission boundaries.
- §10 — consumes pg-boss (step 7) for lead-routing + expiry jobs; corporate VAT via Stripe Tax (step 10).
- §11 — heavy consumer of pg-boss (step 7), Twilio SMS/WhatsApp (8, 9), Resend (step 11), `marketing_suppressions` + `marketing_consents` foundation tables (§4.7), RFC 8058 endpoint (step 13), i18n (step 5), `webhook_events` (step 6).
- §12 — depends on Stripe SDK (step 10) + pg-boss (step 7) for trial-conversion + reminder jobs + `webhook_events` (step 6) for Stripe events.
- §13 — depends on `audit_logs` + `erasure_log` (step 14) + `rate_limits` (§4.7) for the GDPR-OTP-verify scope; operationalises §15a baselines (GDPR, NIS2 prep, EU AI Act, DSA, ANPC, ANSPDCP).
- §14 — depends on `can()` (step 3) for self-serve onboarding gating.
- §15 — depends on i18n + hreflang (step 5); BNR rate-fetch via pg-boss cron (step 7).

---

*Last updated: 2026-05-20. Update as decisions lock or as new patterns emerge from implementation. Stack snapshot date (§2) tracks the most-recent `package.json` confirmation.*
