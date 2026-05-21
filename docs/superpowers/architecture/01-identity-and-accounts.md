# 01 — Identity & Accounts

> Auth, profiles, organisations (legal entities), per-venue staff, role-based authorisation, invitation flows, one-trial-per-legal-entity enforcement.

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Data model](#3-data-model) — `organizations`, `organization_members`, `restaurant_staff`, `staff_invitations`, RLS
- [4. The authorisation helper](#4-the-authorisation-helper) — `can()`, permission matrix, server-action pattern
- [5. Sign-up flow](#5-sign-up-flow-the-missing-piece) — atomic `signupPartner` + email verification + onboarding handoff
- [5a. Authentication policies](#5a-authentication-policies-cross-references-to-foundations-5) — password, MFA, impersonation, session revocation (foundations §5)
- [6. Invitation flows](#6-invitation-flows)
- [7. Multi-org context](#7-multi-org-context)
- [8. One-trial-per-legal-entity enforcement](#8-one-trial-per-legal-entity-enforcement)
- [9. UI surfaces](#9-ui-surfaces-new)
- [10. Background jobs](#10-background-jobs)
- [11. Tools & libraries](#11-tools--libraries)
- [12. Compliance & audit hooks](#12-compliance--audit-hooks)
- [13. Build sequence](#13-build-sequence)
- [14. Open questions](#14-open-questions)
- [15. Cross-references](#15-cross-references)

## 1. Scope

This domain owns: WHO logs in, WHAT they are, WHICH legal entities they belong to, WHICH venues they can act on, and WHAT they can do.

It does **not** own:
- Subscription billing (→ §12).
- Diner-side identity (→ §03) — guest-token booking + opt-in diner profile creation live there.
- Tavli employee tooling beyond the `admin` role (→ §13 and operational runbooks).

### Checkboxes covered (mirrored from `launch-feature-commitments.md`)

Standard markers per README: `[ ]` = unshipped, `[x]` = shipped against this doc. All items below are unshipped (this doc designs the substrate; nothing has been built against it yet).

From LFC §1 Tavli (Base):
- [ ] Up to 5 staff accounts (owner / manager / hosts)
- [ ] Single-location scoping

From LFC §2 Tavli Pro:
- [ ] Up to 3 locations per account included
- [ ] Location-aware staff permissions

From LFC §4 Contractual promises:
- [ ] One free trial per legal entity (CUI / VAT enforcement)
- [ ] Cancellation is one-click in product

From LFC §3 The setup:
- [ ] 30-min staff training session (partner portal walkthrough) — depends on the staff role UI shipping

This doc designs the substrate; the §02–§15 docs reuse the authorisation helper specified here.

## 2. Current state

Confirmed against the codebase 2026-05-20 (see `00-foundations.md` §2 for stack):

**Exists:**
- Supabase Auth wraps email/password + OAuth + magic-link + OTP.
- `profiles` table — 1:1 with `auth.users`. Columns: `id`, `role` (enum: `admin | restaurant_owner | consumer`), `full_name`, `email`, `locale`. Wrapper at `src/lib/auth/session.ts` → `getCurrentSession()` returns `{ user, profile }`.
- `restaurants.owner_user_id` is a single FK to `auth.users` — one owner per restaurant.
- `invitations` table — restaurant-ownership claim flow (email + token + restaurant_id).
- `draft_restaurants` — onboarding scratchpad (per-user, captures in-progress signup data).
- `companies` + `company_members` + `company_invitations` — corporate-diner identity (NOT restaurant-owner identity). `companies.cui` already has unique index. **These three tables are renamed to `corporate_clients` / `corporate_client_members` / `corporate_client_invitations` in the migration that introduces `organizations` (see §14 open question 8 + cross-ref in §10).**
- Sign-in flows at `/partner/sign-in` and `/admin/sign-in`.
- OAuth + OTP helpers under `src/lib/auth/`.

**Missing:**
- No `organizations` table — the legal-entity-that-owns-restaurants concept doesn't exist.
- No multi-staff: only `owner_user_id`. No host, manager, or extra-owner role per venue.
- No per-venue role hierarchy (host / manager / owner).
- No org-level membership (a regional manager across N venues).
- No staff invitation system distinct from restaurant-ownership claim.
- No central authorisation helper — every existing server action checks `owner_user_id === session.user.id` inline (see `src/app/partner/(dashboard)/reservations/actions.ts` — search for the ownership check; line numbers drift, the check pattern is the marker).
- No one-trial-per-legal-entity enforcement at signup.
- No sign-up flow for partners — current `/partner/sign-in` assumes existing ownership claim via invitation.

## 3. Data model

### 3.1 New enums

```sql
create type org_role as enum ('owner', 'admin', 'manager');
create type venue_staff_role as enum ('owner', 'manager', 'host');
create type org_status as enum ('pending_verification', 'active', 'suspended');
create type staff_invitation_kind as enum ('org', 'restaurant');
create type staff_invitation_status as enum ('pending', 'claimed', 'expired', 'revoked');
```

**`org_role` hierarchy** (highest → lowest privilege; full matrix in §4.3):
- **`owner`** — single source of authority for the legal entity. Billing access, role-change rights, can dissolve org. Exactly one per org (transferable per §14 open question 2).
- **`admin`** — operational lead: can update org settings, invite/remove staff at any venue, run campaigns, but **no billing access** and **cannot change roles**. Intended for a Director of Operations or General Manager.
- **`manager`** — read-mostly cross-venue role: sees all venues' reservations + analytics, can act on reservations + tables, but cannot manage staff, billing, or campaigns. Intended for a regional manager who needs visibility but not authority.

**`venue_staff_role`** mirrors `org_role` at the venue scope:
- **`owner`** — venue-level owner (typically the same person as the org owner, but can differ for franchised operations). Can invite/remove venue staff but **not change roles** (org-owner-only per §4.3).
- **`manager`** — venue-level operational lead; reservations + tables + analytics; no staff management.
- **`host`** — front-of-house: reservations + tables only; no analytics, no campaigns.

The existing `userRole` enum (`admin | restaurant_owner | consumer`) **stays** on `profiles` as a global classification:
- `admin` = Tavli employee
- `restaurant_owner` = anyone in any `organization_members` or `restaurant_staff` row (denormalised hint, refreshed via the `withUpdatedAt` repo helper invoked on every membership-row mutation — NOT a DB trigger; aligned with foundations §4.3)
- `consumer` = diners only

### 3.2 New table: `organizations`

The legal entity that owns one or more restaurants. Source of truth for billing, trial state, and one-trial-per-entity enforcement.

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,                              -- display name ("Tom Yum Group")
  legal_name varchar(300),                                  -- legal entity name from registration
  country_code char(2) not null default 'RO',
  tax_id varchar(60),                                       -- CUI for RO orgs
  vat_number varchar(60),
  registration_number varchar(60),                          -- reg_com for RO
  billing_address text,
  billing_city varchar(100),
  billing_country varchar(100),
  primary_contact_email varchar(255) not null,
  primary_contact_phone varchar(60),
  locale char(2) not null default 'ro',
  status org_status not null default 'pending_verification',
  stripe_customer_id varchar(80) unique,                    -- set during signup
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTE: trial state lives on `subscriptions` (§12), not here. Single source of truth.
-- One-trial-per-tax-id enforcement is a JOIN against subscriptions — see §8.

create unique index organizations_tax_id_unique
  on organizations (country_code, tax_id)
  where tax_id is not null;

create index organizations_status on organizations (status);
```

**Why `(country_code, tax_id)` is the uniqueness key, not just `tax_id`:** future expansion to DE/FR. A `12345678` CUI in RO is distinct from a `12345678` Steuernummer in DE. The combo is what's legally unique.

**Why `tax_id` is nullable:** signup flow allows org creation before tax_id is verified. Status starts at `pending_verification` until the operator confirms. The partial-index `WHERE tax_id IS NOT NULL` in the SQL above is the single source of truth — uniqueness is enforced only once a tax_id is set.

### 3.3 New table: `organization_members`

```sql
create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  primary key (organization_id, user_id)
);

create index organization_members_user on organization_members (user_id) where is_active = true;
```

A user can be a member of multiple orgs (a consultant managing two chains, an owner of two unrelated brands). UI surfaces one "active context" at a time.

### 3.4 New table: `restaurant_staff`

```sql
create table restaurant_staff (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role venue_staff_role not null,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  primary key (restaurant_id, user_id)
);

create index restaurant_staff_user on restaurant_staff (user_id) where is_active = true;
create index restaurant_staff_restaurant on restaurant_staff (restaurant_id) where is_active = true;
```

A user can be in both `organization_members` (for one venue's parent org) and `restaurant_staff` (for an unrelated venue). Authz checks both tables.

**Soft-delete-vs-hard-delete policy** (both membership tables): when staff are removed, the row's `is_active` flips to `false` (soft delete) rather than DELETE. Rationale: historical audit reads (`audit_logs.actor_user_id`) need to resolve who-was-who, and the FK chain stays intact. Reactivation = flip `is_active` back to `true`. Hard delete only happens via the GDPR erasure cascade (§12) — the redaction nulls PII columns and sets `is_active = false`, but the row itself remains for audit consistency. Active-only queries always filter `where is_active = true`.

### 3.5 New table: `staff_invitations`

```sql
create table staff_invitations (
  id uuid primary key default gen_random_uuid(),
  kind staff_invitation_kind not null,
  organization_id uuid references organizations(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,
  email varchar(255) not null,
  role varchar(32) not null,                                -- validated by app against the relevant role enum
  token_hash bytea not null unique,                          -- sha256 of the issued token
  expires_at timestamptz not null,
  status staff_invitation_status not null default 'pending',
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_invitations_target_check check (
    (kind = 'org' and organization_id is not null and restaurant_id is null)
    or
    (kind = 'restaurant' and restaurant_id is not null and organization_id is null)
  )
);

create index staff_invitations_email_status on staff_invitations (email, status) where status = 'pending';
create index staff_invitations_org on staff_invitations (organization_id) where status = 'pending';
create index staff_invitations_restaurant on staff_invitations (restaurant_id) where status = 'pending';
```

Separate from the existing `invitations` table (which is specifically for restaurant-ownership claim during onboarding). Staff invitations cover both org-level and venue-level role grants.

### 3.6 Modifications to existing tables

```sql
-- restaurants gets an organization owner. Every venue belongs to exactly one org.
alter table restaurants
  add column organization_id uuid references organizations(id) on delete restrict not null;

create index restaurants_organization on restaurants (organization_id);

-- restaurants.owner_user_id is DROPPED in the same migration.
-- Source of truth for "who owns this restaurant" is `organization_members where role = 'owner'`.
alter table restaurants drop column owner_user_id;

-- profiles gets a UX hint for which org context the user last operated in.
alter table profiles
  add column default_organization_id uuid references organizations(id) on delete set null;
```

**Pre-release simplification.** Since there are no production rows yet (only dev environments, which are reseeded), the migration runs as a single atomic step:
1. Add `organizations` table + indexes.
2. Add `organization_id NOT NULL` to `restaurants` (dev environments are truncated first; no backfill required).
3. Drop `restaurants.owner_user_id`.
4. Add `default_organization_id` to `profiles`.

If we were post-launch this would be a 5-phase backfill (add nullable col → seed orgs → backfill FK → seed memberships → set NOT NULL + drop owner_user_id). We're not, so we don't.

### 3.7 RLS policies (new tables)

**`organizations`:**

```sql
alter table organizations enable row level security;

create policy "organizations_member_select" on organizations
  for select using (
    id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "organizations_admin_update" on organizations
  for update using (
    id in (
      select organization_id from organization_members
      where user_id = auth.uid()
        and is_active = true
        and role in ('owner', 'admin')
    )
  );

-- Insert + delete: service role only (signup flow + admin tooling).
```

**`organization_members`:**

```sql
alter table organization_members enable row level security;

-- A user can see their own membership row. Cross-member visibility
-- (the team-roster UI) is deferred to a SECURITY DEFINER helper per
-- the 0009 precedent — a self-referencing `select … from
-- organization_members` subquery here triggers Postgres 42P17 recursion.
create policy "organization_members_member_select" on organization_members
  for select using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies. Mutation policies are intentionally
-- absent: writes come from service-role helpers in `src/lib/identity/*`
-- (§5/§6 future units), which bypass RLS. Matches the `audit_logs` +
-- `webhook_events` pattern — keeps the mutation surface off the
-- authenticated role and avoids the privilege-escalation footgun of a
-- `FOR ALL` policy without `WITH CHECK`.
```

**`restaurant_staff`:**

```sql
alter table restaurant_staff enable row level security;

-- A user can see their own staff row. The cross-scope path (sibling
-- staff visibility + org-member visibility via the future
-- `restaurants.organization_id` column) is deferred along with §3.6
-- and will route through a SECURITY DEFINER helper to avoid the
-- Postgres 42P17 recursion that a self-referencing subquery would
-- trigger here (per the 0009 precedent).
create policy "restaurant_staff_select" on restaurant_staff
  for select using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies. Mutation policies are intentionally
-- absent: writes come from service-role helpers in `src/lib/identity/*`
-- (§5/§6 future units), which bypass RLS. Same rationale as
-- `organization_members` above.
```

**`staff_invitations`:**

```sql
alter table staff_invitations enable row level security;

-- Inviters can see invitations they sent; invitees can see invitations
-- for their email.
create policy "staff_invitations_inviter_select" on staff_invitations
  for select using (invited_by_user_id = auth.uid());

create policy "staff_invitations_invitee_select" on staff_invitations
  for select using (
    email = (select email from profiles where id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies. Mutation policies are intentionally
-- absent: writes come from service-role helpers in `src/lib/identity/*`
-- (§5/§6 future units), which bypass RLS. The original `admin_mutate`
-- design self-referenced `organization_members` + `restaurant_staff`,
-- which would re-introduce the 42P17 recursion the 0009 precedent
-- forbids; routing mutations through the service role sidesteps the
-- problem and matches the `audit_logs` + `webhook_events` pattern.
```

## 4. The authorisation helper

Centralised in `src/lib/authz/`. Every domain doc references this; nothing else implements its own access checks.

### 4.1 API

```ts
// src/lib/authz/can.ts

export type Action =
  // restaurants
  | 'restaurant.read' | 'restaurant.update' | 'restaurant.delete'
  // staff management
  | 'staff.invite.org' | 'staff.invite.venue' | 'staff.remove' | 'staff.role.change'
  // reservations
  | 'reservation.create' | 'reservation.read' | 'reservation.modify' | 'reservation.modify.override_capacity' | 'reservation.cancel' | 'reservation.mark_no_show'
  // marketing
  | 'campaign.create' | 'campaign.send' | 'campaign.read' | 'campaign.delete'
  // billing
  | 'billing.read' | 'billing.update' | 'subscription.cancel'
  // org
  | 'org.read' | 'org.update' | 'org.delete' | 'org.add_venue'
  // table mgmt
  | 'table.read' | 'table.update' | 'floor_plan.edit'
  // events
  | 'event_request.read' | 'event_request.respond' | 'event_request.quote'
  // analytics
  | 'analytics.read' | 'analytics.export'

export type Subject =
  | { kind: 'restaurant'; id: string; organization_id: string }
  | { kind: 'organization'; id: string }
  | { kind: 'reservation'; restaurant_id: string }
  | { kind: 'campaign'; restaurant_id: string }
  | { kind: 'staff_invitation'; organization_id?: string; restaurant_id?: string }
  | { kind: 'global' }                                       // for Tavli-admin-only actions

export async function can(
  session: Session,
  action: Action,
  subject: Subject
): Promise<boolean>
```

### 4.2 Implementation strategy

The helper resolves in this order:

1. **Tavli admin shortcut**: if `session.profile.role === 'admin'`, return `true`.
2. **Subject ownership**: load the subject's owning organization_id (and restaurant_id where applicable).
3. **Org membership check**: query `organization_members` for `(organization_id, user_id, is_active=true)`. Get role.
4. **Venue staff check**: if subject is a venue, query `restaurant_staff` for `(restaurant_id, user_id, is_active=true)`. Get role.
5. **Match against the static permission matrix** (§4.3).
6. **Cache the membership row in the session context** for the duration of the request (avoid re-fetch on multiple `can()` calls in one request).

Per-request cache: a `Map<orgId | restaurantId, MembershipRow>` attached to the session object, populated lazily.

### 4.3 Permission matrix (static, in code)

| Action | tavli_admin | org_owner | org_admin | org_manager | venue_owner | venue_manager | venue_host |
|---|---|---|---|---|---|---|---|
| `restaurant.read` | ✓ | ✓ (org's) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `restaurant.update` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `restaurant.delete` | ✓ | ✓ | — | — | — | — | — |
| `staff.invite.org` | ✓ | ✓ | ✓ | — | — | — | — |
| `staff.invite.venue` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `staff.remove` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `staff.role.change` | ✓ | ✓ | — | — | — | — | — |
| `reservation.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reservation.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reservation.modify` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reservation.modify.override_capacity` | ✓ | ✓ | ✓ | — | ✓ | ✓ | — |
| `reservation.cancel` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reservation.mark_no_show` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `campaign.create` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `campaign.send` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `campaign.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `campaign.delete` | ✓ | ✓ | — | — | — | — | — |
| `billing.read` | ✓ | ✓ | ✓ | — | — | — | — |
| `billing.update` | ✓ | ✓ | — | — | — | — | — |
| `subscription.cancel` | ✓ | ✓ | — | — | — | — | — |
| `org.read` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `org.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `org.add_venue` | ✓ | ✓ | ✓ | — | — | — | — |
| `table.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `table.update` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `floor_plan.edit` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `event_request.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `event_request.respond` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `event_request.quote` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `analytics.export` | ✓ | ✓ | ✓ | — | ✓ | — | — |

The matrix lives in `src/lib/authz/permissions.ts` as a typed const. Unit tests assert every (role, action) pair.

**Policy clarification — role-change scope (resolves the `venue_owner` vs `staff.role.change` ambiguity):** Only `org_owner` can change staff member roles within an org (org-level role changes AND venue-level role changes within that org's venues). `venue_owner` can invite and remove venue staff at their venue but **cannot change roles** of existing venue staff — they must remove and re-invite. This keeps the role-change capability anchored to the legal-entity owner and avoids privilege-escalation paths where a venue owner promotes a venue host to venue owner outside org leadership's visibility.

### 4.4 Server-action usage pattern

```ts
'use server'

export async function modifyReservation(input: ModifyReservationInput) {
  const parsed = ModifyReservationSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const session = await getCurrentSession()
  if (!session) return unauthenticated()

  const reservation = await loadReservation(parsed.data.reservation_id)
  if (!reservation) return notFound()

  if (!(await can(session, 'reservation.modify', {
    kind: 'reservation',
    restaurant_id: reservation.restaurant_id,
  }))) {
    return forbidden()
  }

  // … perform the modification …
}
```

## 5. Sign-up flow (the missing piece)

Today there's no public partner sign-up — onboarding happens via admin-issued `invitations`. Spec requires every signup to start a 3-month trial, which means we need a self-serve sign-up route.

### 5.1 Surface

Route: `/partner/sign-up`. Multi-step form:

1. **Email + password** — Supabase Auth signup. Email verification required.
2. **Personal name + role** — populates `profiles.full_name`.
3. **Restaurant + organisation basics** — restaurant name, city, organisation name (defaults to restaurant name for single-venue signups), country (defaults to RO).
4. **Legal entity** — CUI (RO) or tax ID + country (other). Optional at first; can be supplied later before billing kicks in. Validate format only at submit (no live ANAF check on this step — too slow).
5. **Plan choice** — Tavli (€30) vs Tavli Pro (€60). Card-on-file via Stripe Checkout (handed off to §12).
6. **Terms acceptance** — explicit checkbox + timestamp captured.

### 5.2 Atomic server action: `signupPartner`

```ts
async function signupPartner(input: SignupInput): Promise<ActionResult<SignupSuccess>>
```

**Signup is a `can()` exception.** Foundations §3.4 requires every server action to call `requireCan()` after schema validation, but signup has no prior session — the user is creating their identity in this action. `signupPartner` therefore skips the `requireCan()` step and runs unauthenticated by design. The other defences (rate-limiting via `rate_limits` foundation table, Cloudflare Turnstile per §00 §2, Supabase Auth's built-in rate limits on signup) compensate.

The action coordinates a Drizzle transaction with two external systems (Supabase Auth Admin API + Stripe). Steps 3 and 9 are NOT inside the Drizzle transaction; failure handling below covers the compensation:

1. Validate Zod schema.
2. Check one-trial-per-tax-id: query `organizations o join subscriptions s on s.organization_id = o.id where o.country_code = $1 and o.tax_id = $2 and s.trial_started_at is not null`. If any row, refuse with `code: TV1401` (`trial_already_used`) and a help link.
3. **(Outside Drizzle tx)** Create the Supabase Auth user (sends verification email). Set `email_confirm: false`; user must verify before any further action works.
4. **(Begin Drizzle tx)** Insert `profiles` row with `default_organization_id = null` (set in step 7).
5. Insert `organizations` row with `status = 'pending_verification'`. (No trial timestamps — those live on the `subscriptions` row created in step 9.)
6. Insert `restaurants` row with `organization_id = new org id`, `status = 'draft'`. (No `owner_user_id` — column dropped per §3.6; org membership is the source of truth.)
7. Insert `organization_members(organization_id, user_id, role='owner', is_active=true)` AND update `profiles.default_organization_id = new org id`.
8. Insert `restaurant_staff(restaurant_id, user_id, role='owner', is_active=true)`. **(Commit Drizzle tx)**
9. **(Outside Drizzle tx)** Hand off to §12 `startSubscription` → creates Stripe customer, creates Stripe Subscription with `trial_end = now() + 90 days`, inserts the `subscriptions` row (this is where `trial_started_at` / `trial_ends_at` live), returns a Stripe Checkout URL for card-on-file capture.
10. Enqueue `billing.reminder-day-60 / -75 / -85` jobs. (No custom day-91 conversion job — Stripe's own billing cycle handles trial-end charging per §12 §6.3.)
11. Send the welcome email via Resend (template: `PartnerWelcomeEmail`, in `src/emails/` — new).
12. Return success with redirect to `/partner/onboarding`.

**Failure handling:**
- If steps 4–8 (the Drizzle tx) fail: tx rolls back automatically. The auth.users row created in step 3 is hard-deleted via `supabaseAdmin.auth.admin.deleteUser(userId)` in a `try/finally` wrapper. A dangling auth.users row with no profile would block re-signup with the same email.
- If step 9 (Stripe handoff) fails: the org exists, the user can sign in, but billing isn't set up. The org stays in `pending_verification` until they complete checkout via a "Complete setup" CTA on the onboarding page. The `billing.trial-conversion` job is NOT enqueued until step 9 succeeds.

**TOCTOU race on `(country_code, tax_id)`:** step 2 reads existing orgs; step 5 inserts a new one. Two concurrent signups with the same tax_id can both pass step 2. The unique index `organizations_tax_id_unique` catches the race at step 5 — the second insert raises `23505` which maps to `code: TV1002` (`tax_id_already_claimed`). The user is shown the claim-existing-org recovery flow (§8 enforcement point 2).

### 5.3 Email verification gate

Until the user clicks the verification email, all `/partner/*` routes redirect to a "verify your email" page. Standard Supabase pattern — `getCurrentSession()` returns the user but a wrapper helper checks `auth.users.email_confirmed_at`.

**Verification link expiry handling.** Supabase Auth's confirmation tokens default to 1 hour. If the user signs up, doesn't verify, and returns days later:
- The session cookie may still be present but the confirmation token is expired.
- The verify-email page exposes a "Resend verification email" CTA that calls `supabaseAdmin.auth.admin.generateLink({ type: 'signup', email })` and re-sends. Rate-limited via `rate_limits` (foundations §4.7) at `scope: 'auth.resend_verification', limit: 3, windowSeconds: 600`.
- If the org row created in signup step 5 has been waiting unverified for >30 days, a daily job (`identity.purge-stale-unverified-orgs`) hard-deletes the org + cascades to `organization_members` + `restaurants` (status='draft' only). The auth.users row stays — the user can re-signup later. Audit-logged via `compliance.retention_purge_run`.

### 5.4 Onboarding wizard (`/partner/onboarding`)

Continues from sign-up. Steps: upload photos, draft menu, set availability, schedule the founder-led setup call. Maps onto `draft_restaurants` for state persistence. The setup itself is owned by §14 — this domain stops at "account exists, restaurant is in draft."

### 5.5 `pending_verification → active` transition

An org is created with `status = 'pending_verification'`. Transition to `status = 'active'` happens **automatically** when either of these is true:

(a) **First restaurant is published** — when any `restaurants` row owned by the org transitions to `status = 'published'`, a server-side hook flips the org to `'active'` in the same transaction.
(b) **Tavli admin approves** — manual override from the admin tooling (`/admin/organizations/[id]`). Audit-logged as `org.verified` with the approving admin's user_id.

**Limitations while `status = 'pending_verification'`** — enforced both in `can()` and at the action surface:
- No marketing sends (§11 actions return `code: 'org_not_verified'`).
- No diner database writes (§03 actions return `code: 'org_not_verified'`).
- Partner-portal shows a persistent "Complete verification to unlock marketing and diner data" banner with a link to `/partner/support`.

Bookings, reservation mutations, billing, and staff invitations all remain available — verification only gates the diner-PII surfaces. Cross-references: foundations §3.2 `ActionResult<T>` (the `org_not_verified` code is registered in §16.1).

## 5a. Authentication policies (cross-references to foundations §5)

This domain defines *who* the identities are; foundations §5 defines *how* they authenticate. The contracts below are referenced rather than duplicated — keep §5 of foundations as the single source of truth.

### 5a.1 Password policy

Per foundations §5.1 (NIST 800-63B-compliant):
- No forced periodic rotation.
- 8-character minimum; no upper-bound restrictions on length or character class.
- HIBP breach check on signup and password change — block known-pwned passwords with a friendly "this password has appeared in a breach" message.
- Identical error messages for "unknown email" vs "wrong password" on sign-in (email-enumeration defense). The sign-in surface at `/partner/sign-in` and `/admin/sign-in` must NOT distinguish these cases in the rendered error or the response timing.

### 5a.2 MFA & passkeys

Per foundations §5.2:
- **TOTP MFA** available from v1 for all staff accounts. **Mandatory for `tavli_admin`** — enforced at the `/admin/sign-in` flow (admin sign-in refuses to complete without an enrolled TOTP factor).
- **Passkeys (WebAuthn)** deferred to v1.5 — schema substrate (Supabase Auth's WebAuthn tables) is in place but the partner-portal UI is not built in v1.
- Self-service MFA management at `/partner/security` (enrol authenticator app, view recovery codes, regenerate recovery codes, deregister factor). Mirrored at `/admin/security` for Tavli admins.

### 5a.3 Support impersonation

Per foundations §5.3:
- Tavli admins (`profiles.role = 'admin'`) can impersonate any partner account from the admin tooling for support purposes. Impersonation session writes `AUDIT.user.impersonation_started` and `AUDIT.user.impersonation_ended` (foundations §16.2) with the target user_id.
- **Partner-side UX**: while a session is impersonated, the partner portal renders a persistent **red banner** at the top of every page reading "Tavli support is viewing your account as <admin email>." The banner cannot be dismissed and is rendered server-side from the session context so it cannot be hidden by client-side tampering.
- Impersonation cannot bypass MFA on accounts that have it enrolled — the admin enters their own MFA factor at impersonation start.

### 5a.4 Session revocation

When a user's authority changes, existing sessions must be invalidated:
- **Password change** (self-service via `/partner/security`): Supabase Auth's `updateUser({ password })` rotates the JWT signing material for that user, invalidating all existing sessions across all devices. The user is re-prompted to sign in. Audit-logged via `AUDIT.auth.password_reset_completed`.
- **Logout** (`/partner/sign-out`): invalidates the current session cookie only. Other devices remain signed in (this is the standard expectation; a "sign out everywhere" CTA on the security page is the explicit kill-all-sessions path).
- **Account deletion** (§12 worked sequence): the Supabase Auth user is hard-deleted in Stage 2 — all sessions die implicitly because the underlying user no longer exists.
- **Role demotion / removal from org**: existing session JWTs are unaffected at the JWT layer (the role isn't in the JWT), but the next `requireCan()` call in any server action re-reads `organization_members` and denies access. UI surfaces will show a stale state until the next navigation; this is acceptable for v1 (forcing a hard session invalidation on every membership change would be heavy-handed).
- **MFA enrolment change** (enrol/disable): writes a fresh `AUDIT.auth.mfa_enrolled` / `mfa_disabled`. Existing sessions remain valid (MFA gates new sign-ins, not in-flight sessions).

## 6. Invitation flows

Two distinct flows on shared infrastructure (`staff_invitations` table):

### 6.1 Org-level invite

Inviter: any user with `org_role in ('owner', 'admin')`.

Server action: `inviteOrgMember(orgId, email, role)`.

1. `can(session, 'staff.invite.org', { kind: 'organization', id: orgId })`.
2. Validate email format. Validate role is in the `org_role` enum.
3. Generate 32-byte random token. Hash with SHA-256. Store hash; email the raw token.
4. Insert `staff_invitations` row with `kind = 'org'`, `expires_at = now() + interval '14 days'`.
5. Send the invite email (template: `StaffInvitationEmail`, in `src/emails/`).

Magic-link claim flow at `/invitations/[token]/accept-staff`:

1. Look up `staff_invitations` by `token_hash = sha256(token)`. Verify status='pending' and not expired.
2. If the email matches an existing Supabase Auth user, prompt them to sign in. After sign-in, claim.
3. If not, prompt them to set a password (or send a magic link), create the Supabase user, then claim.
4. Claim = insert `organization_members(organization_id, user_id, role)`, set invitation status='claimed', record `claimed_at` + `claimed_by_user_id`.

### 6.2 Venue-level invite

Same shape, scoped to a venue. Server action `inviteVenueStaff(restaurantId, email, role)`. Inserts `restaurant_staff` on claim instead of `organization_members`.

### 6.3 Lifecycle: expire, revoke, resend

- `revokeStaffInvitation(invitationId)` → status='revoked'.
- `resendStaffInvitation(invitationId)` → only if status='pending' and not yet expired. Generates a fresh token (invalidates old), re-emails.
- Daily cron `identity.expire-stale-invitations` → marks status='expired' for rows where `expires_at < now() and status = 'pending'`.

## 7. Multi-org context

A user belonging to multiple orgs has one "active context" at a time. Implementation:

- `profiles.default_organization_id` stores the last-used context.
- Partner portal nav shows a switcher when `count(organization_members where user_id = me and is_active = true) > 1`.
- Switching updates `default_organization_id` + sets a cookie (`tavli_active_org`) that server components read.
- Every server action that's org-scoped reads `org_id` from this cookie unless the action explicitly takes an `organization_id` parameter.

**Stale-context cleanup (org soft-delete or membership revocation):**
- When an organization is soft-deleted (`status = 'suspended'` or hard-deleted by admin tooling): any user with `default_organization_id` pointing to that org gets reset to their first active org membership on next login. If none exists, `default_organization_id` is set to NULL and the user is routed to the empty-state onboarding.
- The `tavli_active_org` cookie is validated on every server request: if it points to an org the user is no longer an active member of, or to a soft-deleted org, the cookie is cleared in the response and the request falls back to `default_organization_id` (then to the first active membership).

## 8. One-trial-per-legal-entity enforcement

The contract: "One free trial per legal entity (CUI / VAT number)."

Enforcement points:
1. **At signup — consumed-trial check**: `signupPartner` step 2 — JOIN `organizations o ↔ subscriptions s` on `(o.country_code, o.tax_id)` to find any prior org that has *ever consumed a trial* (i.e., `s.trial_started_at is not null`). If a row exists, reject with `code: 'trial_already_used'`. A consumed trial is what's unique-per-entity.
2. **At signup — pending-org conflict recovery (claim-existing-org flow)**: separately, check for any org with the same `(country_code, tax_id)` still in `status = 'pending_verification'` (no subscription yet). Do **not** silently block: surface a "We found an existing pending account for this CUI — claim it instead?" recovery flow. The recovery action sends an email to that org's `primary_contact_email` containing a one-time link inviting the new user as `org_role = 'owner'` (the original signer authorises the takeover via that link). If the recipient never responds within 14 days, the pending org auto-expires (`compliance.expire-stale-pending-orgs` job) and the new signup can proceed.
3. **At tax-id update** (if user signs up without tax_id, fills it later): server action `updateOrgTaxId(orgId, taxId)` runs the same consumed-trial JOIN check. If a conflict exists, reject and ask the user to log in to the existing org instead.
4. **DB-level safety net**: the unique index `organizations_tax_id_unique` blocks two simultaneous orgs from claiming the same `(country_code, tax_id)`. Surfaces as a `23505` constraint violation → mapped to `code: 'tax_id_already_claimed'` (separate from `'trial_already_used'`).

**Edge cases:**
- A new business with no CUI yet (truly new LLC). Allow sign-up with no tax_id. Status `pending_verification`. We allow billing to start only after tax_id is provided.
- An LLC dissolved and re-formed under the same CUI. Allow Tavli admin override via admin tooling. Audit log captures the override.
- LLC name change but same CUI: covered by `(country_code, tax_id)` uniqueness, not `name` matching.

## 9. UI surfaces (new)

| Surface | Route | Notes |
|---|---|---|
| Sign-up landing | `/partner/sign-up` | Multi-step form (§5.1) |
| Email verification gate | `/partner/verify-email` | Until `email_confirmed_at` is set |
| Onboarding wizard | `/partner/onboarding` | State in `draft_restaurants`; handoff to §14 |
| Org dashboard | `/partner/org/[orgId]` | List of venues, members, billing summary (Pro) |
| Org settings → general | `/partner/org/[orgId]/settings` | Legal entity, billing address, locale defaults |
| Org settings → members | `/partner/org/[orgId]/settings/members` | List + invite + role change + remove |
| Venue staff | `/partner/restaurants/[id]/staff` | List + invite + role change + remove (venue-scoped) |
| Invitations inbox | `/partner/invitations` | Pending invitations addressed to the logged-in user's email |
| Accept staff invite | `/invitations/[token]/accept-staff` | Magic-link claim flow |
| Org switcher | nav dropdown | Visible when user has > 1 active org membership |

Existing `/partner/sign-in` and `/admin/sign-in` continue to work; sign-up is additive.

## 10. Background jobs

| Job | Schedule / trigger | Purpose |
|---|---|---|
| `identity.expire-stale-invitations` (foundations §16.3 `JOBS.identity.expireStaleInvitations`) | daily 03:00 UTC | Mark `staff_invitations` past `expires_at` as expired. |
| `identity.purge-stale-unverified-orgs` | daily 04:00 UTC | Hard-delete orgs in `pending_verification` with no verified user after 30 days (§5.3 expiry handling). |
| `compliance.retry-auth-deletion` (foundations §16.3 `JOBS.compliance.retryAuthDeletion`) | every 1 hour | Retry Supabase Auth user deletion when §12 Stage 2 failed after Tavli-side redaction succeeded. |

**`profiles.role` refresh is NOT a job.** It's a synchronous helper call (`withUpdatedAt` wrapping `organization_members` / `restaurant_staff` mutations recomputes `profiles.role` in the same transaction). Foundations §16.3 previously listed `identity.profileRoleHintRefresh` in the JOBS registry — that entry is removed, since the recompute is in-process and not enqueued.

No high-throughput jobs in this domain. The heavy lifters are in §11 + §12.

## 11. Tools & libraries

No new dependencies for this domain. Uses what's already in `00-foundations`:
- Supabase Auth + `@supabase/ssr` for auth.
- Drizzle for tables + queries.
- React Hook Form + Zod for forms.
- React Email + Resend for invitation/welcome emails.
- pg-boss for the daily expire-stale-invitations job (once §00 step 5 lands).

## 12. Compliance & audit hooks

Every server action in this domain writes an `audit_logs` row via `recordAudit()` (foundations §16.2). Action names map to the canonical `AUDIT` registry — no free strings:

| Server action | `AUDIT.*` key | Subject |
|---|---|---|
| `signupPartner` | `AUDIT.user.created` + `AUDIT.organization.created` + `AUDIT.restaurant.created` (one row each) | new user, new org, new restaurant |
| `inviteOrgMember` | `AUDIT.organization.member_invited` | invitation row |
| `inviteVenueStaff` | `AUDIT.restaurant.staff_invited` (added to registry — see §00 §16.2) | invitation row |
| `acceptStaffInvitation` (org-kind) | `AUDIT.organization.member_joined` | org membership |
| `acceptStaffInvitation` (restaurant-kind) | `AUDIT.restaurant.staff_added` | restaurant_staff row |
| `removeOrgMember` | `AUDIT.organization.member_removed` | removed user |
| `removeVenueStaff` | `AUDIT.restaurant.staff_removed` | removed user |
| `updateOrgTaxId` | `AUDIT.organization.updated` (context: `{ field: 'tax_id', before: null, after: <value> }`) | org |
| `updateMemberRole` | `AUDIT.user.role_changed` (context: `{ before_role, after_role, scope: 'org' \| 'restaurant' }`) | target user |
| `transferRestaurantOwnership` | `AUDIT.restaurant.updated` (context: `{ field: 'owner_user_id', before, after }`) | restaurant |
| Tavli-admin merge of two orgs | `AUDIT.organization.merged` (added to registry — see §00 §16.2) with `context: { source_org_id, target_org_id, reason }` | target org |
| `updateOrgVerificationStatus` (admin manual approval) | `AUDIT.organization.updated` (context: `{ field: 'status', before: 'pending_verification', after: 'active', source: 'admin_override' }`) | org |
| `requestAccountDeletion` | `AUDIT.user.erased` + per-table `AUDIT.compliance.erasure_executed` | target user |

Two new registry entries required in foundations §16.2: `AUDIT.restaurant.staff_invited` and `AUDIT.organization.merged`. Added in the same PR as this doc's audit-log step.

GDPR right-to-be-forgotten cascades from §13 but is orchestrated by a single server action in this domain: `requestAccountDeletion(userId)`. The action must coordinate two distinct deletion scopes, because `auth.users` is owned by Supabase (outside our Drizzle transaction) while Tavli-owned tables follow the foundations §15a.1 redaction pattern.

**Worked sequence (single server action, all-or-nothing semantics):**

1. **Stage 1 — Tavli-side redaction (one Drizzle transaction).** For each Tavli-owned table holding user PII (`profiles`, `organization_members`, `restaurant_staff`, `staff_invitations.email`, plus reservation guest fields owned by §02), set `redacted_at = now()` and null the PII columns per foundations §15a.1 (**never** in-place regex over free-text — column-by-column null-out, with the typed redaction helper in `src/lib/compliance/redact.ts`). Set `organization_members.is_active = false` and `restaurant_staff.is_active = false` on every row owned by this user. Write one `erasure_log` row per affected table inside the same transaction.
2. **Stage 2 — Supabase Auth Admin API call.** Call `supabaseAdmin.auth.admin.deleteUser(userId)` to hard-delete the `auth.users` row. This cascades nothing in Tavli tables (we use `on delete set null` everywhere referencing `auth.users(id)`), so Stage 1's redaction stands.
3. **Stage 3 — final `erasure_log` row** recording the Auth deletion as a separate audit entry (since it isn't transactional with Stage 1).
4. **Failure handling.** If Stage 2 fails after Stage 1 commits, the user record is redacted on our side but the auth row remains; the `compliance.retry-auth-deletion` pg-boss job (foundations §16.3 `JOBS.compliance.retryAuthDeletion`, every 1h) retries the Admin API call until it succeeds. After 7 days of failure, escalate to Tavli admin via an `AUDIT.compliance.erasure_executed` entry flagged `partial = true` and a Sentry alert. Stage 1 is **never** rolled back — redaction is one-way and we don't restore PII even on retry failure.

Audit-log row references the deleted user via the stable `user_id` but carries no PII (per foundations §16.2 `AUDIT.user.erased`).

## 13. Build sequence

Ordered, each item PR-sized.

_Note: an earlier "backfill restaurants.organization_id" step was dropped pre-release (no production rows; dev-env reseeded). The numbering below is consecutive from 1._

1. `organizations` table + enum + migration + RLS. *(0.5 day)*
2. `organization_members` table + RLS. *(0.5 day)*
3. `restaurant_staff` table + RLS. *(0.5 day)*
4. `staff_invitations` table + check constraint + RLS. *(0.5 day)*
5. Authz helper `can()` + permission matrix + unit tests for every (role, action) pair (~210 cells). *(1.5 days)*
6. Migrate existing inline ownership checks to `can()`. Start with `partner/(dashboard)/reservations/actions.ts`, then `admin/(gated)/restaurants/[id]/actions.ts`, then event-request actions. *(1 day)*
7. Sign-up flow (`/partner/sign-up`) + atomic `signupPartner` server action. *(2 days — heavy form + transaction + Stripe handoff stub)*
8. Email verification gate middleware. *(0.5 day)*
9. Org settings UI + `updateOrganization` + `updateOrgTaxId` actions. *(1 day)*
10. Staff invitation flow: invite + claim + revoke + resend + email template. *(2 days)*
11. Member management UI (list, role change, remove). *(1 day)*
12. Venue staff management UI. *(0.5 day)*
13. Multi-org switcher in partner nav + `default_organization_id` persistence + `tavli_active_org` cookie. *(1 day)*
14. Daily `identity.expire-stale-invitations` job (pg-boss). *(0.2 day)*
15. Profile-role-hint refresh via the `withUpdatedAt` repo helper (NOT a DB trigger — per foundations §4.3). *(0.3 day)*
16. Admin tooling: merge orgs (with audit override). *(1 day)*
17. Trial enforcement: at signup, JOIN `organizations ↔ subscriptions` to find any prior consumed trial for `(country_code, tax_id)`. Block with friendly error + "log in to existing org" recovery path. *(0.5 day)*

**Total: ~13–15 working days** for one focused engineer.

This entire sequence can be parallelised with §00 cross-cutting work (authz helper substrate, pg-boss substrate, `audit_logs` table) — they're dependencies for steps 5, 10, 14, 16 specifically.

## 14. Open questions

1. **Should `tavli_admin` be a separate role table or stay on `profiles.role`?** Recommendation: stay on `profiles.role`. There are ~5 Tavli admins ever. Adding an `admins` table is overkill.

2. **Should the org-owner role be transferable (vs single immutable owner)?** Recommendation: transferable via admin tooling only (not self-serve). Audit-logged. Edge case: founder leaves the business and the new GM needs to take over.

3. **Should `profiles.role` be derived or stored?** Recommendation: **stored, refreshed app-side via the `withUpdatedAt` repo helper invoked on `organization_members` mutations** — aligned with foundations §4.3, which forbids new triggers for derived fields. Stored avoids a join on every page load; the repo wrapper ensures every membership write recomputes the hint in the same transaction. No new DB triggers.

4. **Allow consumers (diners) to log in via the partner side?** Recommendation: no — keep partner and consumer auth surfaces separate. Diners use guest-token flow for booking management (`/reservations/[token]`); they don't have a "log in" experience.

5. **Phone-based auth for hosts?** Useful for busy restaurants where hosts share a kiosk. Recommendation: defer to v1.5. Magic-link only at launch.

6. **Should venue-level roles cascade up to org-level read?** I.e., can a `venue_host` see other venues' bookings within the same org? Recommendation: no. Venue-level roles are venue-scoped reads only. Org-level roles see across all venues. This matches privacy expectations and keeps the matrix simple.

7. **What about a "service account" role for integrations (POS, accounting)?** Future need. Recommendation: defer; design after first integration partner asks.

8. **Should the existing `companies` table be renamed to `corporate_clients` to avoid confusion with `organizations`?** Pre-release-decisive: **yes, rename to `corporate_clients`** in the same migration that adds `organizations`. No production data; rename cost is zero. Same for `company_members` → `corporate_client_members` and `company_invitations` → `corporate_client_invitations`. Eliminates the conceptual collision every engineer would otherwise have to learn to navigate. Cross-doc references in §10 are updated to match.

   **Migration ordering — use `ALTER TABLE … RENAME TO`, not drop+recreate**, to preserve constraints, indexes, FKs, and RLS policies in one atomic step. Sequence:
   (i) `alter table companies rename to corporate_clients;`
   (ii) `alter table company_members rename to corporate_client_members;`
   (iii) `alter table company_invitations rename to corporate_client_invitations;`
   (iv) rename FK columns on dependent tables (`company_id → corporate_client_id`) via `alter table … rename column …`.
   (v) update Drizzle schema + regenerate types in the same PR.
   **Backfill: N/A** — pre-release, no production rows exist; dev environments are reseeded.

## 15. Cross-references

- **§00 Foundations** — provides `ActionResult<T>`, the `can()` infrastructure expectation, pg-boss for the expire-stale-invitations job, Resend for invitation emails, `audit_logs` substrate.
- **§02 Bookings** — uses `can(session, 'reservation.*', subject)` on every booking mutation; existing inline owner checks get migrated to `can()` in step 8 of §13 here.
- **§03 Diner database** — cross-venue customer DB scoped to `organization_id` (the org defined in this doc).
- **§09 Multi-location** — depends on this doc's `organization_id` FK on `restaurants`; specifies the per-venue reporting and aggregated rollup APIs.
- **§10 Corporate events** — the prior `companies` table is renamed to `corporate_clients` per open question 8 above (same migration that adds `organizations`). Corporate diners are distinct from `organizations` (restaurant owners). Event-request flow uses `corporate_clients`; §10 schema + code refs updated to match.
- **§11 Marketing suite** — uses `organization_id` as the GDPR boundary for suppression list + cross-venue customer pool.
- **§12 Billing & subscriptions** — subscription is on `organizations`, not `restaurants`. Per-additional-location billing iterates the org's venues. Trial enforcement uses the unique index defined here.
- **§13 Compliance & legal** — right-to-be-forgotten flow cascades through the membership tables defined here; audit log writes for every staff action.

---

## Revisions

- **2026-05-21** — §3.7 RLS policies tightened. The originally-drafted `organization_members`, `restaurant_staff`, and `staff_invitations` policies all self-referenced their own table (or a chain ending in their own table) inside `USING` subqueries, which triggers Postgres 42P17 recursion errors at evaluation time (same bug 0009 fixed for `company_members`). All three `_select` policies are narrowed to `user_id = auth.uid()` (or the equivalent inviter/invitee predicate for `staff_invitations`). All `FOR ALL` mutation policies are intentionally dropped — writes route through service-role helpers in `src/lib/identity/*` (§5/§6 future units), matching the `audit_logs` + `webhook_events` pattern. Cross-member team-roster reads and cross-scope grants (org member → all org venues) land later via SECURITY DEFINER helpers. The `organizations` policies are unchanged: their inner `select organization_id from organization_members` subquery is non-recursive (different table). Shipped in migration 0013 + fix commit 6533370.

---

*Last updated: 2026-05-21. Update as decisions lock or as the codebase diverges from this design.*
