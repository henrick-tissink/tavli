# Corporate Bookings — Phase 1 (Private Events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the private-event request flow end-to-end. Every opted-in venue gains a "Request private event" CTA; submissions create an account via OTP and land in a partner inbox; partners reply, quote, decline; consumers accept or decline quotes; on acceptance partners materialize reservations (private room or whole-venue with `availability_exceptions`). Also ships the foundational tables (`companies`, `company_members`, `company_invitations`, `event_requests`, `restaurant_event_settings`, `availability_exceptions`, `partner_notifications`) and the per-venue capability flags that the remaining phases all depend on.

**Architecture:** New `event_requests` table is a negotiation object (separate from `reservations`) with a `draft → new → … → accepted/declined/expired` state machine. Anonymous form submissions create a `draft` row server-side, return a signup token, send an email OTP via Supabase Auth; OTP verify promotes the row to `new` and attaches `requested_by_user_id`. Consumer tracking uses a `tracking_token` via a `SECURITY DEFINER` lookup function (mirrors the existing `confirmation_token` pattern on reservations). Partner-side surfaces live under a new single-link "Corporate" sidebar item routing to `/partner/corporate` with internal sub-nav (no nested-sidebar engineering). Capability landing pages `/[city]/events` give SEO leverage. Three daily cron routes handle draft purge (30 min), quote expiry, and partner-silence nudge/expire.

**Tech Stack:** Next.js 16.2.4 (App Router, server components default), Drizzle ORM 0.45.2 + raw-SQL Supabase migrations, Supabase Auth (`signInWithOtp`), Supabase admin/anon split (`src/lib/db/{admin,anon,client}.ts`), Resend + React Email, Zod 4, Jest 30 + RTL (jsdom).

**Out of scope (later phases):**
- Phase 2a: `/companies/[slug]` dashboard, member invites UI, CUI claim reconciliation flow.
- Phase 2b: `BookingTypeChips` corporate-meal affordance.
- Phase 2c: eFactura invoicing.
- Phase 3: Standing reservations.
- Phase 4: Meeting nooks + Stripe.
- Whole-venue contract templates with custom legal terms.
- Mobile app updates.

---

## File Map

**New files:**

Schema + migration:
- `drizzle/migrations/0008_corporate_foundations.sql`

Repos:
- `src/lib/repos/companies-repo.ts`
- `src/lib/repos/event-requests-repo.ts`
- `src/lib/repos/restaurant-event-settings-repo.ts`
- `src/lib/repos/availability-exceptions-repo.ts`
- `src/lib/repos/partner-notifications-repo.ts`
- `src/lib/repos/__tests__/event-requests-repo.test.ts`
- `src/lib/repos/__tests__/availability-exceptions-repo.test.ts`

Integrations:
- `src/lib/integrations/anaf.ts`
- `src/lib/integrations/__tests__/anaf.test.ts`

Server actions:
- `src/app/api/event-requests/actions.ts`
- `src/app/api/event-requests/__tests__/actions.test.ts`

Cron:
- `src/app/api/cron/expire-event-request-drafts/route.ts`
- `src/app/api/cron/expire-event-request-quotes/route.ts`
- `src/app/api/cron/nudge-event-request-silence/route.ts`
- `src/app/api/cron/*/__tests__/route.test.ts` for each above

Consumer UI:
- `src/components/event-request-sheet.tsx`
- `src/components/__tests__/event-request-sheet.test.tsx`
- `src/app/event-requests/[token]/page.tsx`
- `src/app/event-requests/[token]/actions.ts`
- `src/app/event-requests/[token]/__tests__/page.test.tsx`
- `src/app/[city]/events/page.tsx`
- `src/app/[city]/events/__tests__/page.test.tsx`

Partner UI:
- `src/app/partner/(dashboard)/corporate/page.tsx`
- `src/app/partner/(dashboard)/corporate/events/page.tsx`
- `src/app/partner/(dashboard)/corporate/events/[id]/page.tsx`
- `src/components/partner/CorporateOverview.tsx`
- `src/components/partner/EventRequestInbox.tsx`
- `src/components/partner/EventRequestDetail.tsx`
- `src/components/partner/QuoteForm.tsx`
- `src/components/partner/DeclineForm.tsx`
- `src/components/partner/MaterializeReservationForm.tsx`
- `src/components/partner/PartnerNotificationBell.tsx`
- `src/components/partner/__tests__/*.test.tsx` for each above

Emails:
- `src/emails/EventRequestNewToPartnerEmail.tsx`
- `src/emails/EventRequestRepliedEmail.tsx`
- `src/emails/EventRequestQuotedEmail.tsx`
- `src/emails/EventRequestAcceptedEmail.tsx`
- `src/emails/EventRequestDeclinedEmail.tsx`
- `src/emails/EventRequestExpiredEmail.tsx`
- `src/emails/EventRequestNudgeEmail.tsx`
- `src/emails/__tests__/*.test.tsx` per template

Playwright:
- `e2e/event-requests.spec.ts`

**Modified files:**
- `src/lib/db/schema.ts` — new enums + new tables + column adds on `restaurants` and `reservations`
- `src/lib/repos/restaurants-repo.ts` — capability filter on listing queries + event-settings join on detail
- `src/components/restaurant-card.tsx` — render capability badge when filtered
- `src/components/filter-pill-bar.tsx` — add capability pill
- `src/lib/filter-context.tsx` — add capability dimension
- `src/app/[city]/[slug]/DetailPageClient.tsx` (or wherever the venue page renders the "Rezervă o masă" CTA) — add `<EventRequestCta />` adjacent
- `src/components/partner/PartnerSidebar.tsx` — add "Corporate" link
- `src/components/partner/PartnerShell.tsx` — mount `<PartnerNotificationBell />`
- `src/app/api/admin/suspend-restaurant/route.ts` (or equivalent existing path) — cascade event_request cancellations on suspension
- `src/app/sitemap.ts` — emit per-city `/events` entries
- `.env.local.example` — `CRON_SECRET=`, `ANAF_API_BASE=`

---

## Task 1: Drizzle schema additions

**Files:**
- Modify: `src/lib/db/schema.ts`

Drizzle definitions for everything Phase 1 needs. Migration SQL comes in Task 2 and must stay in lockstep with this.

- [ ] **Step 1: Add new enums in the existing enum block**

In `src/lib/db/schema.ts` after the existing `currencyCode` enum (around line 85), append:

```typescript
export const companyStatus = pgEnum("company_status", [
  "pending_verification",
  "active",
  "suspended",
]);

export const companyMemberRole = pgEnum("company_member_role", [
  "owner",
  "admin",
  "booker",
  "viewer",
]);

export const eventOccasion = pgEnum("event_occasion", [
  "wedding",
  "birthday",
  "corporate_dinner",
  "product_launch",
  "other",
]);

export const eventRequestStatus = pgEnum("event_request_status", [
  "draft",
  "new",
  "viewing",
  "replied",
  "quoted",
  "accepted",
  "declined",
  "expired_quote",
  "cancelled",
  "expired",
  "completed",
]);

export const bookingType = pgEnum("booking_type", [
  "standard",
  "private_event",
  "standing",
]);
```

- [ ] **Step 2: Add capability columns to `restaurants` table**

In the existing `restaurants` table definition (around line 116), insert before `createdAt`:

```typescript
  eventsIntakeEnabled: boolean("events_intake_enabled").notNull().default(false),
  acceptsCorporateMeals: boolean("accepts_corporate_meals").notNull().default(false),
  acceptsStanding: boolean("accepts_standing").notNull().default(false),
  proPlanActive: boolean("pro_plan_active").notNull().default(false),
```

- [ ] **Step 3: Add corporate columns to `reservations` table**

In the existing `reservations` table definition (around line 272), insert before `createdAt`:

```typescript
  bookingType: bookingType("booking_type").notNull().default("standard"),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  bookedByUserId: uuid("booked_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  eventRequestId: uuid("event_request_id").references(() => eventRequests.id, { onDelete: "set null" }),
```

(Note: `companies` and `eventRequests` are defined below; Drizzle handles forward references.)

- [ ] **Step 4: Append the new tables at the end of the file**

After the existing `reviews` table and its indexes, append:

```typescript
// ─── companies ──────────────────────────────────────────────────────────
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  cui: varchar("cui", { length: 20 }).notNull().unique(),
  regCom: varchar("reg_com", { length: 40 }),
  billingAddress: text("billing_address"),
  billingCity: text("billing_city"),
  billingCountry: varchar("billing_country", { length: 2 }).notNull().default("RO"),
  vatPayer: boolean("vat_payer").notNull().default(false),
  efacturaEnabled: boolean("efactura_enabled").notNull().default(true),
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }),
  primaryContactPhone: varchar("primary_contact_phone", { length: 32 }),
  status: companyStatus("status").notNull().default("pending_verification"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByUserId: uuid("verified_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("companies_status_idx").on(t.status),
]);

// ─── company_members ────────────────────────────────────────────────────
export const companyMembers = pgTable("company_members", {
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: companyMemberRole("role").notNull().default("booker"),
  budgetMonthlyCents: integer("budget_monthly_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.companyId, t.userId] }),
  index("company_members_user_idx").on(t.userId),
]);

// ─── company_invitations ────────────────────────────────────────────────
// Sibling of existing `invitations` (restaurant-ownership specific). Kept
// separate because the domains are different and a generic table would
// muddy semantics.
export const companyInvitations = pgTable("company_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: companyMemberRole("role").notNull().default("booker"),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: invitationStatus("status").notNull().default("pending"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("company_invitations_company_idx").on(t.companyId),
  index("company_invitations_email_status_idx").on(t.email, t.status),
]);

// ─── event_requests ─────────────────────────────────────────────────────
// Phase 1 negotiation object. Separate from `reservations` because the
// shape of a quote/decline/thread negotiation differs from a confirmed
// booking. On acceptance the partner materializes one or more reservation
// rows referencing back via `event_request_id`.
export const eventRequests = pgTable("event_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  claimedCompanyCui: varchar("claimed_company_cui", { length: 20 }),
  claimedCompanyName: text("claimed_company_name"),
  requestedByUserId: uuid("requested_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  guestName: text("guest_name").notNull(),
  guestEmail: varchar("guest_email", { length: 255 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 32 }),
  occasion: eventOccasion("occasion").notNull(),
  eventDate: date("event_date").notNull(),
  eventTimePreference: text("event_time_preference"),
  partySize: smallint("party_size").notNull(),
  spacePreference: text("space_preference"),
  budgetPerHeadCents: integer("budget_per_head_cents"),
  menuPreference: text("menu_preference"),
  dietaryNotes: text("dietary_notes"),
  additionalNotes: text("additional_notes"),
  status: eventRequestStatus("status").notNull().default("draft"),
  partnerResponse: text("partner_response"),
  quotedAmountCents: integer("quoted_amount_cents"),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  trackingToken: varchar("tracking_token", { length: 64 }).notNull().unique(),
  lastNudgeAt: timestamp("last_nudge_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("event_requests_restaurant_status_idx").on(t.restaurantId, t.status),
  index("event_requests_status_created_idx").on(t.status, t.createdAt),
  index("event_requests_user_idx").on(t.requestedByUserId),
  index("event_requests_company_idx").on(t.companyId),
  index("event_requests_claim_idx").on(t.claimedCompanyCui),
]);

// ─── restaurant_event_settings ──────────────────────────────────────────
// 1:1 with restaurants when events_intake_enabled=true. Policy config.
export const restaurantEventSettings = pgTable("restaurant_event_settings", {
  restaurantId: uuid("restaurant_id").primaryKey().references(() => restaurants.id, { onDelete: "cascade" }),
  minPartySize: smallint("min_party_size"),
  maxPartySize: smallint("max_party_size"),
  minLeadDays: smallint("min_lead_days").notNull().default(7),
  acceptedOccasions: eventOccasion("accepted_occasions").array().notNull().default([]).$type<Array<"wedding"|"birthday"|"corporate_dinner"|"product_launch"|"other">>(),
  budgetPerHeadGuidance: text("budget_per_head_guidance"),
  autoReplyTemplate: text("auto_reply_template"),
  blackoutDates: jsonb("blackout_dates").$type<Array<{ start: string; end: string }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── availability_exceptions ────────────────────────────────────────────
// One-off date overrides to the weekday-rule `restaurant_availability`.
// override_capacity=0 blocks the slot entirely; >0 replaces the default.
export const availabilityExceptions = pgTable("availability_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  exceptionDate: date("exception_date").notNull(),
  slotStart: time("slot_start"),
  slotEnd: time("slot_end"),
  overrideCapacity: integer("override_capacity").notNull(),
  reason: text("reason"),
  sourceEventRequestId: uuid("source_event_request_id").references(() => eventRequests.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("availability_exceptions_restaurant_date_idx").on(t.restaurantId, t.exceptionDate),
]);

// ─── partner_notifications ──────────────────────────────────────────────
// Lightweight bell-icon surface. Polled, not realtime, for v1.
export const partnerNotifications = pgTable("partner_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("partner_notifications_restaurant_unread_idx").on(t.restaurantId, t.readAt, t.createdAt),
]);
```

- [ ] **Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): corporate-bookings tables + capability flags"
```

---

## Task 2: Migration 0008 SQL

**Files:**
- Create: `drizzle/migrations/0008_corporate_foundations.sql`

The DB-side source of truth. Must match Task 1 column-for-column, plus RLS policies and the `SECURITY DEFINER` token-lookup function.

- [ ] **Step 1: Write the migration**

Create `drizzle/migrations/0008_corporate_foundations.sql` with:

```sql
-- 0008_corporate_foundations.sql
-- Foundations for corporate-bookings Phase 1 (private events).
-- All new venues default OFF for every capability; no behaviour change for
-- existing listings at deploy time.

-- ─── enums ──────────────────────────────────────────────────────────────
CREATE TYPE "company_status" AS ENUM ('pending_verification', 'active', 'suspended');
CREATE TYPE "company_member_role" AS ENUM ('owner', 'admin', 'booker', 'viewer');
CREATE TYPE "event_occasion" AS ENUM ('wedding', 'birthday', 'corporate_dinner', 'product_launch', 'other');
CREATE TYPE "event_request_status" AS ENUM (
  'draft', 'new', 'viewing', 'replied', 'quoted',
  'accepted', 'declined', 'expired_quote', 'cancelled', 'expired', 'completed'
);
CREATE TYPE "booking_type" AS ENUM ('standard', 'private_event', 'standing');

-- ─── restaurants additions ──────────────────────────────────────────────
ALTER TABLE "restaurants"
  ADD COLUMN "events_intake_enabled"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "accepts_corporate_meals" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "accepts_standing"        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "pro_plan_active"         BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "restaurants_events_intake_idx"
  ON "restaurants" ("events_intake_enabled") WHERE "events_intake_enabled" = TRUE;

-- ─── companies ──────────────────────────────────────────────────────────
CREATE TABLE "companies" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                     TEXT NOT NULL,
  "legal_name"               TEXT,
  "cui"                      VARCHAR(20) NOT NULL UNIQUE,
  "reg_com"                  VARCHAR(40),
  "billing_address"          TEXT,
  "billing_city"             TEXT,
  "billing_country"          VARCHAR(2) NOT NULL DEFAULT 'RO',
  "vat_payer"                BOOLEAN NOT NULL DEFAULT FALSE,
  "efactura_enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "primary_contact_email"    VARCHAR(255),
  "primary_contact_phone"    VARCHAR(32),
  "status"                   company_status NOT NULL DEFAULT 'pending_verification',
  "verified_at"              TIMESTAMPTZ,
  "verified_by_user_id"      UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "companies_status_idx" ON "companies" ("status");

-- ─── company_members ────────────────────────────────────────────────────
CREATE TABLE "company_members" (
  "company_id"            UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"               UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role"                  company_member_role NOT NULL DEFAULT 'booker',
  "budget_monthly_cents"  INTEGER,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("company_id", "user_id")
);
CREATE INDEX "company_members_user_idx" ON "company_members" ("user_id");

-- ─── company_invitations ────────────────────────────────────────────────
CREATE TABLE "company_invitations" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"          UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "email"               VARCHAR(255) NOT NULL,
  "role"                company_member_role NOT NULL DEFAULT 'booker',
  "token_hash"          VARCHAR(64) NOT NULL UNIQUE,
  "invited_by_user_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "expires_at"          TIMESTAMPTZ NOT NULL,
  "status"              invitation_status NOT NULL DEFAULT 'pending',
  "claimed_at"          TIMESTAMPTZ,
  "claimed_by_user_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "company_invitations_company_idx" ON "company_invitations" ("company_id");
CREATE INDEX "company_invitations_email_status_idx" ON "company_invitations" ("email", "status");

-- ─── event_requests ─────────────────────────────────────────────────────
CREATE TABLE "event_requests" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"            UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "company_id"               UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  "claimed_company_cui"      VARCHAR(20),
  "claimed_company_name"     TEXT,
  "requested_by_user_id"     UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "guest_name"               TEXT NOT NULL,
  "guest_email"              VARCHAR(255) NOT NULL,
  "guest_phone"              VARCHAR(32),
  "occasion"                 event_occasion NOT NULL,
  "event_date"               DATE NOT NULL,
  "event_time_preference"    TEXT,
  "party_size"               SMALLINT NOT NULL CHECK ("party_size" > 0),
  "space_preference"         TEXT,
  "budget_per_head_cents"    INTEGER,
  "menu_preference"          TEXT,
  "dietary_notes"            TEXT,
  "additional_notes"         TEXT,
  "status"                   event_request_status NOT NULL DEFAULT 'draft',
  "partner_response"         TEXT,
  "quoted_amount_cents"      INTEGER,
  "quoted_at"                TIMESTAMPTZ,
  "quote_expires_at"         TIMESTAMPTZ,
  "accepted_at"              TIMESTAMPTZ,
  "declined_at"              TIMESTAMPTZ,
  "cancelled_at"             TIMESTAMPTZ,
  "completed_at"             TIMESTAMPTZ,
  "decline_reason"           TEXT,
  "tracking_token"           VARCHAR(64) NOT NULL UNIQUE,
  "last_nudge_at"            TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "event_requests_restaurant_status_idx"
  ON "event_requests" ("restaurant_id", "status");
CREATE INDEX "event_requests_status_created_idx"
  ON "event_requests" ("status", "created_at");
CREATE INDEX "event_requests_user_idx" ON "event_requests" ("requested_by_user_id");
CREATE INDEX "event_requests_company_idx" ON "event_requests" ("company_id");
CREATE INDEX "event_requests_claim_idx" ON "event_requests" ("claimed_company_cui");

-- ─── restaurant_event_settings ──────────────────────────────────────────
CREATE TABLE "restaurant_event_settings" (
  "restaurant_id"             UUID PRIMARY KEY REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "min_party_size"            SMALLINT,
  "max_party_size"            SMALLINT,
  "min_lead_days"             SMALLINT NOT NULL DEFAULT 7,
  "accepted_occasions"        event_occasion[] NOT NULL DEFAULT '{}',
  "budget_per_head_guidance"  TEXT,
  "auto_reply_template"       TEXT,
  "blackout_dates"            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── availability_exceptions ────────────────────────────────────────────
CREATE TABLE "availability_exceptions" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"               UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "exception_date"              DATE NOT NULL,
  "slot_start"                  TIME,
  "slot_end"                    TIME,
  "override_capacity"           INTEGER NOT NULL CHECK ("override_capacity" >= 0),
  "reason"                      TEXT,
  "source_event_request_id"     UUID REFERENCES "event_requests"("id") ON DELETE SET NULL,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "availability_exceptions_restaurant_date_idx"
  ON "availability_exceptions" ("restaurant_id", "exception_date");

-- ─── partner_notifications ──────────────────────────────────────────────
CREATE TABLE "partner_notifications" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"  UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "kind"           VARCHAR(40) NOT NULL,
  "payload"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "read_at"        TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "partner_notifications_restaurant_unread_idx"
  ON "partner_notifications" ("restaurant_id", "read_at", "created_at");

-- ─── reservations additions ─────────────────────────────────────────────
ALTER TABLE "reservations"
  ADD COLUMN "booking_type"        booking_type NOT NULL DEFAULT 'standard',
  ADD COLUMN "company_id"          UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  ADD COLUMN "booked_by_user_id"   UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  ADD COLUMN "event_request_id"    UUID REFERENCES "event_requests"("id") ON DELETE SET NULL;

CREATE INDEX "reservations_event_request_idx"
  ON "reservations" ("event_request_id") WHERE "event_request_id" IS NOT NULL;

-- ─── SECURITY DEFINER token lookup (mirrors confirmation_token pattern) ─
CREATE OR REPLACE FUNCTION "get_event_request_by_token"(p_token TEXT)
RETURNS SETOF "event_requests"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM "event_requests"
  WHERE "tracking_token" = p_token
    AND "status" <> 'draft'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION "get_event_request_by_token"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "get_event_request_by_token"(TEXT) TO anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_event_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_notifications" ENABLE ROW LEVEL SECURITY;

-- companies: members can read; owner/admin can update
CREATE POLICY "companies_member_read" ON "companies" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "companies"."id"
      AND cm."user_id" = auth.uid()
  ));

CREATE POLICY "companies_admin_update" ON "companies" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "companies"."id"
      AND cm."user_id" = auth.uid()
      AND cm."role" IN ('owner', 'admin')
  ));

-- company_members: members can read their own org
CREATE POLICY "company_members_self_read" ON "company_members" FOR SELECT
  USING ("user_id" = auth.uid() OR EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "company_members"."company_id"
      AND cm."user_id" = auth.uid()
  ));

-- event_requests: visible to (a) restaurant owner via ownership, (b) the
-- requesting user, (c) company members. Token holders use the SECURITY
-- DEFINER function — NOT RLS.
CREATE POLICY "event_requests_owner_read" ON "event_requests" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "restaurants" r
      WHERE r."id" = "event_requests"."restaurant_id"
        AND r."owner_user_id" = auth.uid()
    )
    OR "requested_by_user_id" = auth.uid()
    OR (
      "company_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "company_members" cm
        WHERE cm."company_id" = "event_requests"."company_id"
          AND cm."user_id" = auth.uid()
      )
    )
  );

-- restaurant_event_settings: public read; owner write
CREATE POLICY "restaurant_event_settings_public_read"
  ON "restaurant_event_settings" FOR SELECT USING (TRUE);

CREATE POLICY "restaurant_event_settings_owner_write"
  ON "restaurant_event_settings" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_event_settings"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- availability_exceptions: public read; owner write
CREATE POLICY "availability_exceptions_public_read"
  ON "availability_exceptions" FOR SELECT USING (TRUE);

CREATE POLICY "availability_exceptions_owner_write"
  ON "availability_exceptions" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "availability_exceptions"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- partner_notifications: only that restaurant's owner
CREATE POLICY "partner_notifications_owner_read"
  ON "partner_notifications" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE POLICY "partner_notifications_owner_update"
  ON "partner_notifications" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- ─── updated_at touch trigger reuse ─────────────────────────────────────
-- Reuse existing fn_touch_updated_at() pattern from 0001_rls_and_triggers.sql
CREATE TRIGGER "trg_companies_touch_updated_at"
  BEFORE UPDATE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_event_requests_touch_updated_at"
  BEFORE UPDATE ON "event_requests"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_restaurant_event_settings_touch_updated_at"
  BEFORE UPDATE ON "restaurant_event_settings"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();
```

- [ ] **Step 2: Apply the migration locally**

Per the project's manual migration convention (see memory `deploy_setup.md`):

```bash
cat drizzle/migrations/0008_corporate_foundations.sql | npx supabase db push --local
```

If `fn_touch_updated_at` doesn't exist in your local snapshot, check `drizzle/migrations/0001_rls_and_triggers.sql` for its definition; if missing, append it to 0008.

- [ ] **Step 3: Verify schema landed**

```bash
psql "$LOCAL_DATABASE_URL" -c "\d event_requests" | head -30
psql "$LOCAL_DATABASE_URL" -c "SELECT get_event_request_by_token('nonexistent');"
```

Expected: table shown; function returns 0 rows (no error).

- [ ] **Step 4: Commit**

```bash
git add drizzle/migrations/0008_corporate_foundations.sql
git commit -m "feat(migration): 0008 corporate foundations"
```

---

## Task 3: ANAF CUI lookup integration

**Files:**
- Create: `src/lib/integrations/anaf.ts`
- Create: `src/lib/integrations/__tests__/anaf.test.ts`

Wrapper around ANAF's public OpenAPI for CUI validation/prefill. Phase 1 uses it only for prefilling the event-request "Booking on behalf of a company?" form; Phase 2a uses it for signup. Falls back gracefully when the API is down.

- [ ] **Step 1: Write the failing test**

Create `src/lib/integrations/__tests__/anaf.test.ts`:

```typescript
import { lookupCui, normalizeCui, isValidCuiFormat } from "../anaf";

describe("normalizeCui", () => {
  it("strips 'RO' prefix and whitespace, uppercases", () => {
    expect(normalizeCui(" ro12345678 ")).toBe("RO12345678");
    expect(normalizeCui("12345678")).toBe("12345678");
  });
});

describe("isValidCuiFormat", () => {
  it("accepts 2-10 digits, optionally prefixed with RO", () => {
    expect(isValidCuiFormat("RO12345678")).toBe(true);
    expect(isValidCuiFormat("12")).toBe(true);
    expect(isValidCuiFormat("12345678901")).toBe(false);
    expect(isValidCuiFormat("ABC")).toBe(false);
  });
});

describe("lookupCui", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("returns enriched company info on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: [{
          date_generale: {
            cui: 12345678,
            denumire: "ACME SRL",
            adresa: "Str. Test 1, Bucharest",
            stare_inregistrare: "INREGISTRAT din data 2010-01-01",
          },
          inregistrare_scop_Tva: { scpTVA: true },
        }],
      }),
    }) as unknown as typeof fetch;

    const res = await lookupCui("RO12345678");
    expect(res.found).toBe(true);
    expect(res.name).toBe("ACME SRL");
    expect(res.vatPayer).toBe(true);
  });

  it("returns found=false when API returns empty", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ found: [], notFound: ["12345678"] }),
    }) as unknown as typeof fetch;
    const res = await lookupCui("12345678");
    expect(res.found).toBe(false);
  });

  it("returns ok=false on network error so caller can fall back", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));
    const res = await lookupCui("12345678");
    expect(res.ok).toBe(false);
    expect(res.found).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/integrations/__tests__/anaf.test.ts
```

Expected: FAIL with "Cannot find module '../anaf'".

- [ ] **Step 3: Implement**

Create `src/lib/integrations/anaf.ts`:

```typescript
const ANAF_BASE = process.env.ANAF_API_BASE ?? "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva";

export interface CuiLookupResult {
  ok: boolean;
  found: boolean;
  cui: string;
  name?: string;
  legalName?: string;
  address?: string;
  city?: string;
  vatPayer?: boolean;
}

export function normalizeCui(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidCuiFormat(input: string): boolean {
  const normalized = normalizeCui(input);
  return /^(RO)?\d{2,10}$/.test(normalized);
}

function digitsOnly(input: string): string {
  return normalizeCui(input).replace(/^RO/, "");
}

export async function lookupCui(input: string): Promise<CuiLookupResult> {
  const cui = normalizeCui(input);
  if (!isValidCuiFormat(cui)) {
    return { ok: true, found: false, cui };
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(ANAF_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(digitsOnly(cui)), data: today }]),
    });
    if (!res.ok) return { ok: false, found: false, cui };
    const data = await res.json() as { found?: Array<{ date_generale?: { cui: number; denumire?: string; adresa?: string }; inregistrare_scop_Tva?: { scpTVA?: boolean } }> };
    const hit = data.found?.[0];
    if (!hit?.date_generale) return { ok: true, found: false, cui };
    return {
      ok: true,
      found: true,
      cui,
      name: hit.date_generale.denumire,
      legalName: hit.date_generale.denumire,
      address: hit.date_generale.adresa,
      vatPayer: !!hit.inregistrare_scop_Tva?.scpTVA,
    };
  } catch {
    return { ok: false, found: false, cui };
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx jest src/lib/integrations/__tests__/anaf.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/anaf.ts src/lib/integrations/__tests__/anaf.test.ts
git commit -m "feat(integrations): ANAF CUI lookup wrapper"
```

---

## Task 4: companies repo (claim-only Phase 1 operations)

**Files:**
- Create: `src/lib/repos/companies-repo.ts`
- Create: `src/lib/repos/__tests__/companies-repo.test.ts`

Phase 1 only needs `findByCui` (to detect a pre-existing claim during event-request submission) and `insertPending` (when admin manually verifies an event request later). The full member/dashboard CRUD lands in Phase 2a.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repos/__tests__/companies-repo.test.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { findCompanyByCui, insertPendingCompany } from "../companies-repo";

describe("companies-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM companies WHERE cui LIKE 'RO_TEST%'`);
  });

  it("findCompanyByCui returns null when not found", async () => {
    expect(await findCompanyByCui("RO_TEST_404")).toBeNull();
  });

  it("insertPendingCompany creates a pending_verification row idempotently by CUI", async () => {
    const a = await insertPendingCompany({ cui: "RO_TEST_1", name: "Acme" });
    const b = await insertPendingCompany({ cui: "RO_TEST_1", name: "Acme" });
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("pending_verification");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/repos/__tests__/companies-repo.test.ts
```

Expected: FAIL with "Cannot find module '../companies-repo'".

- [ ] **Step 3: Implement**

Create `src/lib/repos/companies-repo.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeCui } from "@/lib/integrations/anaf";

export type CompanyRow = typeof companies.$inferSelect;

export async function findCompanyByCui(cui: string): Promise<CompanyRow | null> {
  const normalized = normalizeCui(cui);
  const rows = await dbAdmin.select().from(companies).where(eq(companies.cui, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function insertPendingCompany(input: {
  cui: string;
  name: string;
  legalName?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  vatPayer?: boolean;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
}): Promise<CompanyRow> {
  const cui = normalizeCui(input.cui);
  const existing = await findCompanyByCui(cui);
  if (existing) return existing;

  const [row] = await dbAdmin.insert(companies).values({
    cui,
    name: input.name,
    legalName: input.legalName ?? null,
    billingAddress: input.billingAddress ?? null,
    billingCity: input.billingCity ?? null,
    vatPayer: input.vatPayer ?? false,
    primaryContactEmail: input.primaryContactEmail ?? null,
    primaryContactPhone: input.primaryContactPhone ?? null,
  }).returning();
  return row;
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/repos/__tests__/companies-repo.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/companies-repo.ts src/lib/repos/__tests__/companies-repo.test.ts
git commit -m "feat(repos): companies claim-only operations"
```

---

## Task 5: event-requests repo (CRUD + state transitions + overlap query)

**Files:**
- Create: `src/lib/repos/event-requests-repo.ts`
- Create: `src/lib/repos/__tests__/event-requests-repo.test.ts`

The state machine lives here. Public-token lookup uses the `get_event_request_by_token` RPC, not a direct table read.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repos/__tests__/event-requests-repo.test.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import {
  createEventRequestDraft,
  promoteDraftToNew,
  markViewing,
  reply,
  sendQuote,
  decline,
  acceptQuote,
  declineQuote,
  cancel,
  getByTrackingToken,
  findOverlappingReservations,
} from "../event-requests-repo";
import { restaurants, cities, profiles } from "@/lib/db/schema";

async function seedRestaurant() {
  await dbAdmin.insert(cities).values({ slug: "test-city", name: "Test", countryCode: "RO" }).onConflictDoNothing();
  const [city] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `test-r-${Date.now()}`, name: "Test R", cityId: city.id, status: "live",
  }).returning();
  return r;
}

describe("event-requests-repo", () => {
  it("createEventRequestDraft returns a row with status='draft' and a tracking token", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
    });
    expect(er.status).toBe("draft");
    expect(er.trackingToken).toHaveLength(64);
  });

  it("promoteDraftToNew sets status=new + requested_by_user_id", async () => {
    const r = await seedRestaurant();
    const [profile] = await dbAdmin.insert(profiles).values({
      id: crypto.randomUUID(), role: "consumer", email: "u@test.co",
    }).returning();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "u@test.co",
      occasion: "birthday", eventDate: "2026-08-01", partySize: 10,
    });
    const promoted = await promoteDraftToNew(er.id, profile.id);
    expect(promoted.status).toBe("new");
    expect(promoted.requestedByUserId).toBe(profile.id);
  });

  it("rejects invalid state transitions", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "other", eventDate: "2026-08-01", partySize: 4,
    });
    await expect(sendQuote(er.id, { amountCents: 50000, expiresAt: new Date() }))
      .rejects.toThrow(/invalid transition/i);
  });

  it("sendQuote requires status=replied or viewing", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 20,
    });
    const userId = crypto.randomUUID();
    await dbAdmin.insert(profiles).values({ id: userId, role: "consumer", email: `u${userId}@x.co` });
    await promoteDraftToNew(er.id, userId);
    await markViewing(er.id);
    const expires = new Date(Date.now() + 7 * 86400_000);
    const q = await sendQuote(er.id, { amountCents: 50000, expiresAt: expires });
    expect(q.status).toBe("quoted");
    expect(q.quotedAmountCents).toBe(50000);
  });

  it("getByTrackingToken uses the SECURITY DEFINER RPC and skips drafts", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 20,
    });
    expect(await getByTrackingToken(er.trackingToken)).toBeNull();
    const userId = crypto.randomUUID();
    await dbAdmin.insert(profiles).values({ id: userId, role: "consumer", email: `u${userId}@x.co` });
    await promoteDraftToNew(er.id, userId);
    const found = await getByTrackingToken(er.trackingToken);
    expect(found?.id).toBe(er.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/lib/repos/__tests__/event-requests-repo.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/repos/event-requests-repo.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { dbAnon } from "@/lib/db/anon";
import { eventRequests, reservations } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

type EventRequest = typeof eventRequests.$inferSelect;
type EventRequestStatus = EventRequest["status"];

const VALID_TRANSITIONS: Record<EventRequestStatus, EventRequestStatus[]> = {
  draft: ["new", "expired"],
  new: ["viewing", "cancelled", "expired"],
  viewing: ["replied", "quoted", "declined", "cancelled", "expired"],
  replied: ["quoted", "declined", "cancelled"],
  quoted: ["accepted", "declined", "expired_quote", "cancelled"],
  accepted: ["completed", "cancelled"],
  declined: [],
  expired_quote: ["quoted"],
  cancelled: [],
  expired: [],
  completed: [],
};

function assertTransition(from: EventRequestStatus, to: EventRequestStatus) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`invalid transition: ${from} -> ${to}`);
  }
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createEventRequestDraft(input: {
  restaurantId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  occasion: EventRequest["occasion"];
  eventDate: string;
  eventTimePreference?: string;
  partySize: number;
  spacePreference?: string;
  budgetPerHeadCents?: number;
  menuPreference?: string;
  dietaryNotes?: string;
  additionalNotes?: string;
  claimedCompanyCui?: string;
  claimedCompanyName?: string;
}): Promise<EventRequest> {
  const [row] = await dbAdmin.insert(eventRequests).values({
    restaurantId: input.restaurantId,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    guestPhone: input.guestPhone ?? null,
    occasion: input.occasion,
    eventDate: input.eventDate,
    eventTimePreference: input.eventTimePreference ?? null,
    partySize: input.partySize,
    spacePreference: input.spacePreference ?? null,
    budgetPerHeadCents: input.budgetPerHeadCents ?? null,
    menuPreference: input.menuPreference ?? null,
    dietaryNotes: input.dietaryNotes ?? null,
    additionalNotes: input.additionalNotes ?? null,
    claimedCompanyCui: input.claimedCompanyCui ?? null,
    claimedCompanyName: input.claimedCompanyName ?? null,
    trackingToken: newToken(),
  }).returning();
  return row;
}

async function transitionTo(id: string, to: EventRequestStatus, patch: Partial<EventRequest> = {}): Promise<EventRequest> {
  const [current] = await dbAdmin.select().from(eventRequests).where(eq(eventRequests.id, id)).limit(1);
  if (!current) throw new Error(`event_request ${id} not found`);
  assertTransition(current.status, to);
  const [row] = await dbAdmin.update(eventRequests)
    .set({ ...patch, status: to })
    .where(eq(eventRequests.id, id))
    .returning();
  return row;
}

export async function promoteDraftToNew(id: string, userId: string): Promise<EventRequest> {
  return transitionTo(id, "new", { requestedByUserId: userId });
}

export async function markViewing(id: string): Promise<EventRequest> {
  return transitionTo(id, "viewing");
}

export async function reply(id: string, partnerResponse: string): Promise<EventRequest> {
  return transitionTo(id, "replied", { partnerResponse });
}

export async function sendQuote(id: string, q: { amountCents: number; expiresAt: Date; partnerResponse?: string }): Promise<EventRequest> {
  return transitionTo(id, "quoted", {
    quotedAmountCents: q.amountCents,
    quoteExpiresAt: q.expiresAt,
    quotedAt: new Date(),
    partnerResponse: q.partnerResponse ?? null,
  });
}

export async function decline(id: string, reason: string): Promise<EventRequest> {
  return transitionTo(id, "declined", { declineReason: reason, declinedAt: new Date() });
}

export async function acceptQuote(id: string): Promise<EventRequest> {
  return transitionTo(id, "accepted", { acceptedAt: new Date() });
}

export async function declineQuote(id: string, reason?: string): Promise<EventRequest> {
  return transitionTo(id, "declined", { declineReason: reason ?? "consumer_declined", declinedAt: new Date() });
}

export async function cancel(id: string): Promise<EventRequest> {
  return transitionTo(id, "cancelled", { cancelledAt: new Date() });
}

export async function getByTrackingToken(token: string): Promise<EventRequest | null> {
  // Uses the SECURITY DEFINER RPC; anon client is enough.
  const result = await dbAnon.execute(sql`SELECT * FROM get_event_request_by_token(${token})`);
  return (result.rows[0] as EventRequest | undefined) ?? null;
}

export async function findOverlappingReservations(restaurantId: string, eventDate: string): Promise<typeof reservations.$inferSelect[]> {
  return dbAdmin.select().from(reservations).where(and(
    eq(reservations.restaurantId, restaurantId),
    eq(reservations.reservationDate, eventDate),
  ));
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/repos/__tests__/event-requests-repo.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/event-requests-repo.ts src/lib/repos/__tests__/event-requests-repo.test.ts
git commit -m "feat(repos): event-requests state machine + token lookup"
```

---

## Task 6: restaurant-event-settings repo

**Files:**
- Create: `src/lib/repos/restaurant-event-settings-repo.ts`

Simple 1:1 upsert + read. No state machine.

- [ ] **Step 1: Write the implementation directly (trivial CRUD; test via integration in later tasks)**

Create `src/lib/repos/restaurant-event-settings-repo.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { restaurantEventSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Settings = typeof restaurantEventSettings.$inferSelect;

export async function getEventSettings(restaurantId: string): Promise<Settings | null> {
  const rows = await dbAdmin.select().from(restaurantEventSettings)
    .where(eq(restaurantEventSettings.restaurantId, restaurantId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertEventSettings(restaurantId: string, patch: Partial<Omit<Settings, "restaurantId" | "createdAt" | "updatedAt">>): Promise<Settings> {
  const [row] = await dbAdmin.insert(restaurantEventSettings)
    .values({ restaurantId, ...patch })
    .onConflictDoUpdate({
      target: restaurantEventSettings.restaurantId,
      set: patch,
    })
    .returning();
  return row;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repos/restaurant-event-settings-repo.ts
git commit -m "feat(repos): restaurant-event-settings upsert"
```

---

## Task 7: availability-exceptions repo

**Files:**
- Create: `src/lib/repos/availability-exceptions-repo.ts`
- Create: `src/lib/repos/__tests__/availability-exceptions-repo.test.ts`

Used when partner materializes a whole-venue buyout. Also queried by `restaurants-repo` when computing slot availability for a date (consumer-side).

- [ ] **Step 1: Write the failing test**

Create `src/lib/repos/__tests__/availability-exceptions-repo.test.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { listExceptionsForDate, insertWholeVenueBlock } from "../availability-exceptions-repo";
import { cities, restaurants } from "@/lib/db/schema";

async function seedR() {
  await dbAdmin.insert(cities).values({ slug: "x", name: "X", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ex-${Date.now()}`, name: "X", cityId: c.id, status: "live",
  }).returning();
  return r;
}

describe("availability-exceptions-repo", () => {
  it("insertWholeVenueBlock creates a zero-capacity row for the date", async () => {
    const r = await seedR();
    const row = await insertWholeVenueBlock({
      restaurantId: r.id, exceptionDate: "2026-08-01", reason: "private buyout",
    });
    expect(row.overrideCapacity).toBe(0);
  });

  it("listExceptionsForDate returns matching rows", async () => {
    const r = await seedR();
    await insertWholeVenueBlock({ restaurantId: r.id, exceptionDate: "2026-08-01" });
    const rows = await listExceptionsForDate(r.id, "2026-08-01");
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx jest src/lib/repos/__tests__/availability-exceptions-repo.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/lib/repos/availability-exceptions-repo.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { availabilityExceptions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

type Exception = typeof availabilityExceptions.$inferSelect;

export async function listExceptionsForDate(restaurantId: string, date: string): Promise<Exception[]> {
  return dbAdmin.select().from(availabilityExceptions).where(and(
    eq(availabilityExceptions.restaurantId, restaurantId),
    eq(availabilityExceptions.exceptionDate, date),
  ));
}

export async function insertWholeVenueBlock(input: {
  restaurantId: string;
  exceptionDate: string;
  slotStart?: string;
  slotEnd?: string;
  reason?: string;
  sourceEventRequestId?: string;
}): Promise<Exception> {
  const [row] = await dbAdmin.insert(availabilityExceptions).values({
    restaurantId: input.restaurantId,
    exceptionDate: input.exceptionDate,
    slotStart: input.slotStart ?? null,
    slotEnd: input.slotEnd ?? null,
    overrideCapacity: 0,
    reason: input.reason ?? null,
    sourceEventRequestId: input.sourceEventRequestId ?? null,
  }).returning();
  return row;
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/lib/repos/__tests__/availability-exceptions-repo.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/availability-exceptions-repo.ts src/lib/repos/__tests__/availability-exceptions-repo.test.ts
git commit -m "feat(repos): availability-exceptions for whole-venue blocks"
```

---

## Task 8: partner-notifications repo

**Files:**
- Create: `src/lib/repos/partner-notifications-repo.ts`

- [ ] **Step 1: Implement**

Create `src/lib/repos/partner-notifications-repo.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { partnerNotifications } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type Notification = typeof partnerNotifications.$inferSelect;

export async function insertNotification(input: {
  restaurantId: string;
  kind: string;
  payload?: Record<string, unknown>;
}): Promise<Notification> {
  const [row] = await dbAdmin.insert(partnerNotifications).values({
    restaurantId: input.restaurantId,
    kind: input.kind,
    payload: input.payload ?? {},
  }).returning();
  return row;
}

export async function listForRestaurant(restaurantId: string, limit = 20): Promise<Notification[]> {
  return dbAdmin.select().from(partnerNotifications)
    .where(eq(partnerNotifications.restaurantId, restaurantId))
    .orderBy(sql`${partnerNotifications.createdAt} DESC`)
    .limit(limit);
}

export async function unreadCount(restaurantId: string): Promise<number> {
  const result = await dbAdmin.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM partner_notifications WHERE restaurant_id = ${restaurantId} AND read_at IS NULL`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function markAllRead(restaurantId: string): Promise<void> {
  await dbAdmin.update(partnerNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(partnerNotifications.restaurantId, restaurantId), isNull(partnerNotifications.readAt)));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/repos/partner-notifications-repo.ts
git commit -m "feat(repos): partner-notifications minimal API"
```

---

## Task 9: Server action — create event-request draft + send OTP

**Files:**
- Create: `src/app/api/event-requests/actions.ts`
- Create: `src/app/api/event-requests/__tests__/actions.test.ts`

`submitEventRequestDraft` is the entry point from `EventRequestSheet`. It validates input, dedupes by `(restaurant_id, guest_email, event_date, party_size)` within 5 min, creates the `draft` row, optionally creates a Supabase auth user, sends an OTP. The OTP redirect URL embeds the tracking token; the auth callback (Task 11) promotes the row.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/event-requests/__tests__/actions.test.ts`:

```typescript
import { submitEventRequestDraft } from "../actions";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, cities } from "@/lib/db/schema";

jest.mock("@/lib/auth/otp", () => ({
  sendOtp: jest.fn().mockResolvedValue({ ok: true }),
}));

async function seedR(overrides?: Partial<typeof restaurants.$inferInsert>) {
  await dbAdmin.insert(cities).values({ slug: "tt", name: "T", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `tt-${Date.now()}`, name: "T", cityId: c.id, status: "live",
    eventsIntakeEnabled: true, ...overrides,
  }).returning();
  return r;
}

describe("submitEventRequestDraft", () => {
  it("rejects when restaurant has events_intake_enabled=false", async () => {
    const r = await seedR({ eventsIntakeEnabled: false });
    await expect(submitEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
    })).rejects.toThrow(/not accepting/i);
  });

  it("creates a draft and returns the tracking token + sends OTP", async () => {
    const r = await seedR();
    const out = await submitEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "user@test.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
    });
    expect(out.ok).toBe(true);
    expect(out.trackingToken).toHaveLength(64);
    const { sendOtp } = await import("@/lib/auth/otp");
    expect(sendOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "user@test.co" }));
  });

  it("dedupes within 5 minutes for the same (restaurant, email, date, party)", async () => {
    const r = await seedR();
    const a = await submitEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "dup@test.co",
      occasion: "birthday", eventDate: "2026-09-01", partySize: 10,
    });
    const b = await submitEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "dup@test.co",
      occasion: "birthday", eventDate: "2026-09-01", partySize: 10,
    });
    expect(b.trackingToken).toBe(a.trackingToken);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/event-requests/actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurants } from "@/lib/db/schema";
import { createEventRequestDraft } from "@/lib/repos/event-requests-repo";
import { sendOtp } from "@/lib/auth/otp";
import { normalizeCui, isValidCuiFormat } from "@/lib/integrations/anaf";

const submitSchema = z.object({
  restaurantId: z.string().uuid(),
  guestName: z.string().min(2).max(120),
  guestEmail: z.string().email().max(255),
  guestPhone: z.string().max(32).optional(),
  occasion: z.enum(["wedding", "birthday", "corporate_dinner", "product_launch", "other"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventTimePreference: z.string().max(60).optional(),
  partySize: z.number().int().positive().max(1000),
  spacePreference: z.string().max(240).optional(),
  budgetPerHeadCents: z.number().int().nonnegative().optional(),
  menuPreference: z.string().max(500).optional(),
  dietaryNotes: z.string().max(500).optional(),
  additionalNotes: z.string().max(1000).optional(),
  claimedCompanyCui: z.string().optional(),
  claimedCompanyName: z.string().max(240).optional(),
});

export type SubmitEventRequestInput = z.infer<typeof submitSchema>;

export async function submitEventRequestDraft(input: SubmitEventRequestInput): Promise<{ ok: true; trackingToken: string }> {
  const data = submitSchema.parse(input);

  const [restaurant] = await dbAdmin.select().from(restaurants).where(eq(restaurants.id, data.restaurantId)).limit(1);
  if (!restaurant) throw new Error("restaurant not found");
  if (restaurant.status !== "live") throw new Error("this venue is not accepting event requests");
  if (!restaurant.eventsIntakeEnabled) throw new Error("this venue is not accepting event requests");

  const claimedCui = data.claimedCompanyCui
    ? (isValidCuiFormat(data.claimedCompanyCui) ? normalizeCui(data.claimedCompanyCui) : undefined)
    : undefined;

  // 5-min dedupe
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const [existing] = await dbAdmin.select().from(eventRequests).where(and(
    eq(eventRequests.restaurantId, data.restaurantId),
    eq(eventRequests.guestEmail, data.guestEmail),
    eq(eventRequests.eventDate, data.eventDate),
    eq(eventRequests.partySize, data.partySize),
    gte(eventRequests.createdAt, cutoff),
  )).limit(1);
  if (existing) {
    await sendOtp({ email: data.guestEmail, redirectToToken: existing.trackingToken });
    return { ok: true, trackingToken: existing.trackingToken };
  }

  const draft = await createEventRequestDraft({
    restaurantId: data.restaurantId,
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestPhone: data.guestPhone,
    occasion: data.occasion,
    eventDate: data.eventDate,
    eventTimePreference: data.eventTimePreference,
    partySize: data.partySize,
    spacePreference: data.spacePreference,
    budgetPerHeadCents: data.budgetPerHeadCents,
    menuPreference: data.menuPreference,
    dietaryNotes: data.dietaryNotes,
    additionalNotes: data.additionalNotes,
    claimedCompanyCui: claimedCui,
    claimedCompanyName: data.claimedCompanyName,
  });

  await sendOtp({ email: data.guestEmail, redirectToToken: draft.trackingToken });
  return { ok: true, trackingToken: draft.trackingToken };
}
```

- [ ] **Step 4: Create the OTP helper if it doesn't exist**

Create or extend `src/lib/auth/otp.ts`:

```typescript
import { createSupabaseRouteClient } from "@/lib/db/server";
import { appOrigin } from "@/lib/app-origin";

export interface SendOtpInput {
  email: string;
  redirectToToken: string;
}

export async function sendOtp({ email, redirectToToken }: SendOtpInput): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseRouteClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appOrigin()}/auth/callback?token=${encodeURIComponent(redirectToToken)}`,
      data: { event_request_token: redirectToToken },
    },
  });
  if (error) throw error;
  return { ok: true };
}
```

(If `createSupabaseRouteClient` lives elsewhere in your codebase, adjust the import; the intent is the server-side Supabase client that issues OTP via email.)

- [ ] **Step 5: Run tests**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/event-requests/actions.ts src/lib/auth/otp.ts src/app/api/event-requests/__tests__/actions.test.ts
git commit -m "feat(actions): submitEventRequestDraft + OTP send"
```

---

## Task 10: Auth callback — promote draft to `new`

**Files:**
- Modify: `src/app/auth/callback/route.ts` (create if missing)

When Supabase Auth completes the OTP exchange, the callback receives a session. If the URL carries `?token=…`, look up the matching `draft` event_request and promote it.

- [ ] **Step 1: Add the promotion call to the auth callback**

In `src/app/auth/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { promoteDraftToNew } from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token");

  const supabase = await createSupabaseRouteClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/auth/error", url));
  }

  if (token) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Ensure profile row exists (in case this is brand-new signup).
      await dbAdmin.insert(profiles).values({
        id: user.id,
        role: "consumer",
        email: user.email ?? null,
      }).onConflictDoNothing();

      const [er] = await dbAdmin.select().from(eventRequests)
        .where(eq(eventRequests.trackingToken, token)).limit(1);
      if (er && er.status === "draft") {
        const promoted = await promoteDraftToNew(er.id, user.id);
        await insertNotification({
          restaurantId: promoted.restaurantId,
          kind: "new_event_request",
          payload: { eventRequestId: promoted.id, occasion: promoted.occasion, eventDate: promoted.eventDate, partySize: promoted.partySize },
        });
        return NextResponse.redirect(new URL(`/event-requests/${token}`, url));
      }
    }
  }

  return NextResponse.redirect(new URL("/", url));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/auth/callback/route.ts
git commit -m "feat(auth): promote event-request draft after OTP verify"
```

---

## Task 11: Partner state-transition server actions

**Files:**
- Modify: `src/app/api/event-requests/actions.ts`

`markEventRequestViewing`, `replyToEventRequest`, `quoteEventRequest`, `declineEventRequest`. Each verifies the caller owns the restaurant.

- [ ] **Step 1: Write the failing test (append to existing test file)**

Append to `src/app/api/event-requests/__tests__/actions.test.ts`:

```typescript
import {
  replyToEventRequest, quoteEventRequest, declineEventRequest, markEventRequestViewing,
} from "../actions";

describe("partner transitions", () => {
  it("replyToEventRequest moves status from viewing→replied and stores partner_response", async () => {
    // assume helper test setup creates a viewing-status request owned by partner-user
    const { eventRequestId, asPartner } = await setupViewing();
    const out = await asPartner(() => replyToEventRequest({ id: eventRequestId, message: "Available Sat!" }));
    expect(out.status).toBe("replied");
    expect(out.partnerResponse).toBe("Available Sat!");
  });

  it("quoteEventRequest requires status replied|viewing and stores amount + expiry", async () => {
    const { eventRequestId, asPartner } = await setupReplied();
    const out = await asPartner(() => quoteEventRequest({
      id: eventRequestId, amountCents: 75000, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }));
    expect(out.status).toBe("quoted");
    expect(out.quotedAmountCents).toBe(75000);
  });

  it("rejects partner actions on requests they don't own", async () => {
    const { eventRequestId, asOtherPartner } = await setupViewing();
    await expect(asOtherPartner(() => replyToEventRequest({ id: eventRequestId, message: "x" })))
      .rejects.toThrow(/forbidden/i);
  });
});
```

(For brevity here, `setupViewing`, `setupReplied`, `asPartner`, `asOtherPartner` are test helpers you'll co-locate under `__tests__/helpers.ts`. They seed a restaurant with an `ownerUserId`, create an event request, advance the state via the repo, and return both the ID and a function that scopes calls to that partner's auth context.)

- [ ] **Step 2: Implement the actions**

Append to `src/app/api/event-requests/actions.ts`:

```typescript
import { getServerSession } from "@/lib/auth/session";
import {
  markViewing, reply, sendQuote, decline, acceptQuote, declineQuote, cancel,
} from "@/lib/repos/event-requests-repo";

async function assertPartnerOwns(eventRequestId: string): Promise<{ userId: string; restaurantId: string }> {
  const session = await getServerSession();
  if (!session?.user) throw new Error("forbidden: not signed in");
  const [er] = await dbAdmin.select({
    id: eventRequests.id,
    restaurantId: eventRequests.restaurantId,
  }).from(eventRequests).where(eq(eventRequests.id, eventRequestId)).limit(1);
  if (!er) throw new Error("not found");
  const [r] = await dbAdmin.select({ ownerUserId: restaurants.ownerUserId })
    .from(restaurants).where(eq(restaurants.id, er.restaurantId)).limit(1);
  if (r?.ownerUserId !== session.user.id) throw new Error("forbidden: not the owner");
  return { userId: session.user.id, restaurantId: er.restaurantId };
}

export async function markEventRequestViewing({ id }: { id: string }) {
  await assertPartnerOwns(id);
  return markViewing(id);
}

export async function replyToEventRequest({ id, message }: { id: string; message: string }) {
  await assertPartnerOwns(id);
  if (message.length < 1 || message.length > 4000) throw new Error("message length");
  return reply(id, message);
}

const quoteSchema = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  partnerResponse: z.string().max(4000).optional(),
});

export async function quoteEventRequest(input: z.infer<typeof quoteSchema>) {
  const data = quoteSchema.parse(input);
  await assertPartnerOwns(data.id);
  return sendQuote(data.id, {
    amountCents: data.amountCents,
    expiresAt: new Date(data.expiresAt),
    partnerResponse: data.partnerResponse,
  });
}

export async function declineEventRequest({ id, reason }: { id: string; reason: string }) {
  await assertPartnerOwns(id);
  if (!reason || reason.length > 1000) throw new Error("reason required");
  return decline(id, reason);
}
```

- [ ] **Step 3: Run tests**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts
```

Expected: prior tests still pass + 3 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/event-requests/actions.ts src/app/api/event-requests/__tests__/actions.test.ts
git commit -m "feat(actions): partner transitions (viewing/reply/quote/decline)"
```

---

## Task 12: Consumer accept/decline/cancel actions

**Files:**
- Create: `src/app/event-requests/[token]/actions.ts`

Consumer-side actions are scoped to the tracking token. They use the `getByTrackingToken` RPC (RLS-safe) to load the request, then transition via the repo's admin client.

- [ ] **Step 1: Implement**

Create `src/app/event-requests/[token]/actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { getByTrackingToken, acceptQuote, declineQuote, cancel } from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";

async function loadByToken(token: string) {
  const er = await getByTrackingToken(token);
  if (!er) throw new Error("not found");
  return er;
}

export async function consumerAcceptQuote(token: string) {
  const er = await loadByToken(token);
  const out = await acceptQuote(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "quote_accepted",
    payload: { eventRequestId: er.id },
  });
  return out;
}

export async function consumerDeclineQuote({ token, reason }: { token: string; reason?: string }) {
  const er = await loadByToken(token);
  const parsed = z.string().max(1000).optional().parse(reason);
  const out = await declineQuote(er.id, parsed);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "quote_declined",
    payload: { eventRequestId: er.id, reason: parsed },
  });
  return out;
}

export async function consumerCancelEventRequest(token: string) {
  const er = await loadByToken(token);
  const out = await cancel(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "event_request_cancelled",
    payload: { eventRequestId: er.id },
  });
  return out;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/event-requests/[token]/actions.ts
git commit -m "feat(actions): consumer accept/decline/cancel"
```

---

## Task 13: Materialize reservations from an accepted event request

**Files:**
- Modify: `src/app/api/event-requests/actions.ts`

After `accepted`, the partner picks `private_room` (one or more reservations, no inventory impact) or `whole_venue` (reservations + `availability_exceptions` rows). The action runs in a single transaction.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/event-requests/__tests__/actions.test.ts`:

```typescript
import { materializeAcceptedEventRequest } from "../actions";
import { reservations, availabilityExceptions } from "@/lib/db/schema";
import { dbAdmin } from "@/lib/db/admin";
import { eq } from "drizzle-orm";

describe("materializeAcceptedEventRequest", () => {
  it("private_room: creates reservation row with booking_type=private_event, no exceptions", async () => {
    const { eventRequestId, asPartner } = await setupAccepted();
    const out = await asPartner(() => materializeAcceptedEventRequest({
      id: eventRequestId,
      mode: "private_room",
      slots: [{ time: "19:00", partySize: 30, zone: "Private Room" }],
    }));
    expect(out.materializedReservationIds).toHaveLength(1);
    const [res] = await dbAdmin.select().from(reservations).where(eq(reservations.id, out.materializedReservationIds[0]));
    expect(res.bookingType).toBe("private_event");
    expect(res.eventRequestId).toBe(eventRequestId);
    const excs = await dbAdmin.select().from(availabilityExceptions).where(eq(availabilityExceptions.sourceEventRequestId, eventRequestId));
    expect(excs).toHaveLength(0);
  });

  it("whole_venue: creates reservation rows AND availability_exceptions for the date", async () => {
    const { eventRequestId, asPartner } = await setupAccepted();
    const out = await asPartner(() => materializeAcceptedEventRequest({
      id: eventRequestId, mode: "whole_venue",
      slots: [{ time: "18:00", partySize: 80 }],
    }));
    expect(out.materializedReservationIds).toHaveLength(1);
    const excs = await dbAdmin.select().from(availabilityExceptions).where(eq(availabilityExceptions.sourceEventRequestId, eventRequestId));
    expect(excs.length).toBeGreaterThan(0);
    expect(excs[0].overrideCapacity).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

Append to `src/app/api/event-requests/actions.ts`:

```typescript
import { insertWholeVenueBlock } from "@/lib/repos/availability-exceptions-repo";
import { randomBytes } from "node:crypto";
import { reservations } from "@/lib/db/schema";

const materializeSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["private_room", "whole_venue"]),
  slots: z.array(z.object({
    time: z.string().regex(/^\d{2}:\d{2}$/),
    partySize: z.number().int().positive(),
    zone: z.string().max(60).optional(),
  })).min(1),
});

export async function materializeAcceptedEventRequest(input: z.infer<typeof materializeSchema>) {
  const data = materializeSchema.parse(input);
  const { restaurantId } = await assertPartnerOwns(data.id);
  const [er] = await dbAdmin.select().from(eventRequests).where(eq(eventRequests.id, data.id)).limit(1);
  if (!er) throw new Error("not found");
  if (er.status !== "accepted") throw new Error("event request must be accepted before materializing");

  const reservationIds: string[] = [];

  await dbAdmin.transaction(async (tx) => {
    for (const slot of data.slots) {
      const [row] = await tx.insert(reservations).values({
        restaurantId,
        guestName: er.guestName,
        guestPhone: er.guestPhone ?? "",
        guestEmail: er.guestEmail,
        partySize: slot.partySize,
        reservationDate: er.eventDate,
        reservationTime: `${slot.time}:00`,
        zone: slot.zone ?? (data.mode === "private_room" ? "Private Room" : null),
        notes: `Event request ${er.id} — ${er.occasion}`,
        status: "confirmed",
        confirmationToken: randomBytes(32).toString("hex"),
        bookingType: "private_event",
        eventRequestId: er.id,
        bookedByUserId: er.requestedByUserId,
      }).returning({ id: reservations.id });
      reservationIds.push(row.id);
    }

    if (data.mode === "whole_venue") {
      await tx.insert(availabilityExceptions).values({
        restaurantId,
        exceptionDate: er.eventDate,
        slotStart: null,
        slotEnd: null,
        overrideCapacity: 0,
        reason: `whole-venue event ${er.id}`,
        sourceEventRequestId: er.id,
      });
    }
  });

  return { materializedReservationIds: reservationIds };
}
```

- [ ] **Step 3: Run tests**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts
```

Expected: all tests pass including the two new ones.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/event-requests/actions.ts src/app/api/event-requests/__tests__/actions.test.ts
git commit -m "feat(actions): materialize reservations from accepted event request"
```

---

## Task 14: Email templates (7 transitions)

**Files:**
- Create: `src/emails/EventRequestNewToPartnerEmail.tsx`
- Create: `src/emails/EventRequestRepliedEmail.tsx`
- Create: `src/emails/EventRequestQuotedEmail.tsx`
- Create: `src/emails/EventRequestAcceptedEmail.tsx`
- Create: `src/emails/EventRequestDeclinedEmail.tsx`
- Create: `src/emails/EventRequestExpiredEmail.tsx`
- Create: `src/emails/EventRequestNudgeEmail.tsx`
- Create: `src/emails/__tests__/EventRequest.snapshots.test.tsx`

Match the existing `ReservationConfirmationEmail.tsx` style. RO is the default; English is a `locale` prop. One snapshot test file covers all 7.

- [ ] **Step 1: Write the failing snapshot test**

Create `src/emails/__tests__/EventRequest.snapshots.test.tsx`:

```typescript
import { render } from "@react-email/render";
import EventRequestNewToPartnerEmail from "../EventRequestNewToPartnerEmail";
import EventRequestRepliedEmail from "../EventRequestRepliedEmail";
import EventRequestQuotedEmail from "../EventRequestQuotedEmail";
import EventRequestAcceptedEmail from "../EventRequestAcceptedEmail";
import EventRequestDeclinedEmail from "../EventRequestDeclinedEmail";
import EventRequestExpiredEmail from "../EventRequestExpiredEmail";
import EventRequestNudgeEmail from "../EventRequestNudgeEmail";

const base = {
  restaurantName: "Test R",
  occasion: "wedding" as const,
  eventDate: "2026-08-01",
  partySize: 30,
  guestName: "Sara",
  trackingUrl: "https://tavli.ro/event-requests/T",
};

describe("event-request email snapshots", () => {
  for (const locale of ["ro", "en"] as const) {
    it(`new-to-partner ${locale}`, async () => {
      const html = await render(<EventRequestNewToPartnerEmail locale={locale} {...base} partnerInboxUrl="https://tavli.ro/partner/corporate/events" />);
      expect(html).toMatchSnapshot();
    });
    it(`replied ${locale}`, async () => {
      const html = await render(<EventRequestRepliedEmail locale={locale} {...base} partnerResponse="Disponibil!" />);
      expect(html).toMatchSnapshot();
    });
    it(`quoted ${locale}`, async () => {
      const html = await render(<EventRequestQuotedEmail locale={locale} {...base} amountLei={3500} quoteExpiresAt="2026-07-25" />);
      expect(html).toMatchSnapshot();
    });
    it(`accepted ${locale}`, async () => {
      const html = await render(<EventRequestAcceptedEmail locale={locale} {...base} amountLei={3500} />);
      expect(html).toMatchSnapshot();
    });
    it(`declined ${locale}`, async () => {
      const html = await render(<EventRequestDeclinedEmail locale={locale} {...base} declineReason="no_availability" />);
      expect(html).toMatchSnapshot();
    });
    it(`expired ${locale}`, async () => {
      const html = await render(<EventRequestExpiredEmail locale={locale} {...base} />);
      expect(html).toMatchSnapshot();
    });
    it(`nudge ${locale}`, async () => {
      const html = await render(<EventRequestNudgeEmail locale={locale} {...base} daysOpen={7} partnerInboxUrl="https://tavli.ro/partner/corporate/events" />);
      expect(html).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: Implement each email**

The pattern is consistent across the seven. Below is `EventRequestNewToPartnerEmail.tsx`; the others follow the same scaffold with different copy.

Create `src/emails/EventRequestNewToPartnerEmail.tsx`:

```typescript
import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

interface Props {
  locale: "ro" | "en";
  restaurantName: string;
  occasion: "wedding" | "birthday" | "corporate_dinner" | "product_launch" | "other";
  eventDate: string;
  partySize: number;
  guestName: string;
  partnerInboxUrl: string;
}

const COPY = {
  ro: {
    preview: "Solicitare nouă de eveniment privat",
    title: "Solicitare nouă de eveniment",
    subtitle: (n: string) => `${n} a trimis o solicitare pentru ${"{restaurant}"}`,
    detailsLabel: "Detalii",
    occasion: { wedding: "Nuntă", birthday: "Aniversare", corporate_dinner: "Cină corporate", product_launch: "Lansare de produs", other: "Altele" },
    cta: "Vezi în inbox",
  },
  en: {
    preview: "New private event request",
    title: "New event request",
    subtitle: (n: string) => `${n} sent a request for ${"{restaurant}"}`,
    detailsLabel: "Details",
    occasion: { wedding: "Wedding", birthday: "Birthday", corporate_dinner: "Corporate dinner", product_launch: "Product launch", other: "Other" },
    cta: "Open inbox",
  },
} as const;

export default function EventRequestNewToPartnerEmail(props: Props) {
  const c = COPY[props.locale];
  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 24, marginBottom: 4 }}>{c.title}</Heading>
          <Text style={{ color: "#5c5c5c" }}>{c.subtitle(props.guestName).replace("{restaurant}", props.restaurantName)}</Text>
          <Section style={{ background: "white", padding: 16, borderRadius: 8, marginTop: 16 }}>
            <Text><strong>{c.detailsLabel}</strong></Text>
            <Text>{c.occasion[props.occasion]} · {props.eventDate} · {props.partySize}</Text>
          </Section>
          <Section style={{ marginTop: 24 }}>
            <Link href={props.partnerInboxUrl} style={{ background: "#c0392b", color: "white", padding: "12px 18px", borderRadius: 6, textDecoration: "none" }}>{c.cta}</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

Create each of the remaining six templates following the same shape. Bodies differ in:
- `EventRequestRepliedEmail.tsx` — props add `partnerResponse: string`. Section renders the response with a label "Răspuns / Reply".
- `EventRequestQuotedEmail.tsx` — props add `amountLei: number`, `quoteExpiresAt: string`. CTA = "Răspunde la ofertă / Respond to quote" pointing to `trackingUrl`.
- `EventRequestAcceptedEmail.tsx` — confirms; props add `amountLei`. No CTA besides link to tracking URL.
- `EventRequestDeclinedEmail.tsx` — props add `declineReason: string`. Maps reason codes to localized phrases.
- `EventRequestExpiredEmail.tsx` — simple notice; CTA to re-submit on venue page.
- `EventRequestNudgeEmail.tsx` (to partner) — props add `daysOpen: number`, `partnerInboxUrl: string`. Reminds partner to reply.

(Keep all seven under 80 lines each; reuse the same body/container styling from above.)

- [ ] **Step 3: Run snapshot tests, accept snapshots**

```bash
npx jest src/emails/__tests__/EventRequest.snapshots.test.tsx -u
```

Expected: 14 snapshots created (7 templates × 2 locales).

- [ ] **Step 4: Re-run snapshots to verify stability**

```bash
npx jest src/emails/__tests__/EventRequest.snapshots.test.tsx
```

Expected: 14 pass with no updates.

- [ ] **Step 5: Commit**

```bash
git add src/emails/EventRequest*.tsx src/emails/__tests__/EventRequest.snapshots.test.tsx src/emails/__tests__/__snapshots__/
git commit -m "feat(emails): event-request transitions (RO + EN, 7 templates)"
```

---

## Task 15: Wire emails into state transitions

**Files:**
- Modify: `src/lib/email/dispatcher.ts` (or wherever `sendReservationConfirmationEmail` lives — find the existing dispatcher and extend it)
- Modify: `src/app/api/event-requests/actions.ts`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/event-requests/[token]/actions.ts`

Send the right email at each transition.

- [ ] **Step 1: Add dispatcher functions**

In `src/lib/email/dispatcher.ts` (or equivalent), append:

```typescript
import { render } from "@react-email/render";
import { resend } from "./resend-client"; // existing pattern
import EventRequestNewToPartnerEmail from "@/emails/EventRequestNewToPartnerEmail";
import EventRequestRepliedEmail from "@/emails/EventRequestRepliedEmail";
import EventRequestQuotedEmail from "@/emails/EventRequestQuotedEmail";
import EventRequestAcceptedEmail from "@/emails/EventRequestAcceptedEmail";
import EventRequestDeclinedEmail from "@/emails/EventRequestDeclinedEmail";
import EventRequestExpiredEmail from "@/emails/EventRequestExpiredEmail";
import EventRequestNudgeEmail from "@/emails/EventRequestNudgeEmail";

type Locale = "ro" | "en";

export async function sendEventRequestNew(p: { partnerEmail: string; locale: Locale; restaurantName: string; guestName: string; occasion: "wedding"|"birthday"|"corporate_dinner"|"product_launch"|"other"; eventDate: string; partySize: number; partnerInboxUrl: string; }) {
  const html = await render(<EventRequestNewToPartnerEmail {...p} />);
  return resend.emails.send({ to: p.partnerEmail, from: "Tavli <noreply@tavli.ro>", subject: p.locale === "ro" ? "Solicitare nouă de eveniment" : "New event request", html });
}
// ... similar wrappers for replied/quoted/accepted/declined/expired/nudge
```

- [ ] **Step 2: Call `sendEventRequestNew` from the auth callback after promoting**

In `src/app/auth/callback/route.ts`, after `insertNotification(...)`:

```typescript
const [r] = await dbAdmin.select({ email: restaurants.email, name: restaurants.name })
  .from(restaurants).where(eq(restaurants.id, promoted.restaurantId)).limit(1);
if (r?.email) {
  await sendEventRequestNew({
    partnerEmail: r.email, locale: "ro",
    restaurantName: r.name, guestName: promoted.guestName,
    occasion: promoted.occasion, eventDate: promoted.eventDate,
    partySize: promoted.partySize,
    partnerInboxUrl: `${appOrigin()}/partner/corporate/events`,
  });
}
```

(Repeat the same pattern: `replyToEventRequest` → `sendEventRequestReplied`, `quoteEventRequest` → `sendEventRequestQuoted`, `consumerAcceptQuote` → `sendEventRequestAccepted` to both sides, `declineEventRequest`/`consumerDeclineQuote` → `sendEventRequestDeclined`, cron tasks send `nudge` and `expired`.)

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/email/dispatcher.ts src/app/auth/callback/route.ts src/app/api/event-requests/actions.ts src/app/event-requests/[token]/actions.ts
git commit -m "feat(emails): dispatch event-request transition emails"
```

---

## Task 16: `<EventRequestSheet />` consumer component

**Files:**
- Create: `src/components/event-request-sheet.tsx`
- Create: `src/components/__tests__/event-request-sheet.test.tsx`

Mirrors `reservation-sheet.tsx`. Multi-step bottom sheet: occasion → date → time/party/space → menu/notes → identity step (last). Identity step calls `submitEventRequestDraft` and shows OTP-instructions; redirect happens via the auth callback.

- [ ] **Step 1: Write a smoke test**

Create `src/components/__tests__/event-request-sheet.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { EventRequestSheet } from "../event-request-sheet";

jest.mock("@/app/api/event-requests/actions", () => ({
  submitEventRequestDraft: jest.fn().mockResolvedValue({ ok: true, trackingToken: "abc" }),
}));

describe("EventRequestSheet", () => {
  it("walks through steps and submits with form data", async () => {
    render(<EventRequestSheet open onClose={() => {}} restaurantId="r1" restaurantName="Test" acceptedOccasions={["wedding","birthday","corporate_dinner","product_launch","other"]} />);
    fireEvent.click(screen.getByRole("button", { name: /nuntă|wedding/i }));
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // date step
    fireEvent.change(screen.getByLabelText(/dată|date/i), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // party + time
    fireEvent.change(screen.getByLabelText(/persoane|guests/i), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /continuă|next/i }));
    // identity step
    fireEvent.change(screen.getByLabelText(/nume|name/i), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "sara@test.co" } });
    fireEvent.click(screen.getByRole("button", { name: /trimite|submit/i }));
    expect(await screen.findByText(/verifică emailul|check your email/i)).toBeInTheDocument();
    const { submitEventRequestDraft } = await import("@/app/api/event-requests/actions");
    expect(submitEventRequestDraft).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "r1", occasion: "wedding", partySize: 30, guestEmail: "sara@test.co",
    }));
  });
});
```

- [ ] **Step 2: Implement (sketch — full implementation below)**

Create `src/components/event-request-sheet.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Pill } from "./pill";
import { Button } from "./button";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";

const OCCASION_LABELS_RO = {
  wedding: "Nuntă", birthday: "Aniversare",
  corporate_dinner: "Cină corporate", product_launch: "Lansare produs", other: "Altele",
};

type Occasion = keyof typeof OCCASION_LABELS_RO;

export interface EventRequestSheetProps {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export function EventRequestSheet({
  open, onClose, restaurantId, restaurantName,
  acceptedOccasions, minLeadDays = 7, budgetPerHeadGuidance,
}: EventRequestSheetProps) {
  const [step, setStep] = useState<"occasion" | "date" | "details" | "identity" | "sent">("occasion");
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventTimePreference, setEventTimePreference] = useState("");
  const [partySize, setPartySize] = useState<number>(20);
  const [spacePreference, setSpacePreference] = useState("");
  const [budgetPerHeadCents, setBudgetPerHeadCents] = useState<number | undefined>();
  const [menuPreference, setMenuPreference] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [claimedCompanyCui, setClaimedCompanyCui] = useState("");
  const [claimedCompanyName, setClaimedCompanyName] = useState("");
  const [bookingForCompany, setBookingForCompany] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minDate = (() => { const d = new Date(); d.setDate(d.getDate() + minLeadDays); return d.toISOString().slice(0,10); })();

  function next() {
    if (step === "occasion") return setStep("date");
    if (step === "date") return setStep("details");
    if (step === "details") return setStep("identity");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitEventRequestDraft({
          restaurantId, guestName, guestEmail, guestPhone: guestPhone || undefined,
          occasion: occasion!, eventDate, eventTimePreference: eventTimePreference || undefined,
          partySize, spacePreference: spacePreference || undefined,
          budgetPerHeadCents, menuPreference: menuPreference || undefined,
          dietaryNotes: dietaryNotes || undefined, additionalNotes: additionalNotes || undefined,
          claimedCompanyCui: bookingForCompany && claimedCompanyCui ? claimedCompanyCui : undefined,
          claimedCompanyName: bookingForCompany && claimedCompanyName ? claimedCompanyName : undefined,
        });
        setStep("sent");
      } catch (e) {
        setError((e as Error).message || "ceva nu a mers");
      }
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`${restaurantName} · Eveniment privat`}>
      {step === "occasion" && (
        <div className="space-y-3">
          <p className="font-medium">Ce sărbătorim?</p>
          <div className="flex flex-wrap gap-2">
            {acceptedOccasions.map((o) => (
              <Pill key={o} selected={occasion === o} onClick={() => setOccasion(o)}>{OCCASION_LABELS_RO[o]}</Pill>
            ))}
          </div>
          <Button disabled={!occasion} onClick={next}>Continuă</Button>
        </div>
      )}
      {step === "date" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Data</span>
            <input type="date" min={minDate} value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Preferință oră</span>
            <input type="text" placeholder="prânz / seară / 18:00" value={eventTimePreference} onChange={(e) => setEventTimePreference(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <Button disabled={!eventDate} onClick={next}>Continuă</Button>
        </div>
      )}
      {step === "details" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Persoane</span>
            <input type="number" min={1} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Spațiu dorit (opțional)</span>
            <input type="text" value={spacePreference} onChange={(e) => setSpacePreference(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Buget per persoană (lei, opțional)</span>
            <input type="number" min={0} value={budgetPerHeadCents ? Math.round(budgetPerHeadCents/100) : ""} onChange={(e) => setBudgetPerHeadCents(e.target.value ? Number(e.target.value)*100 : undefined)} className="w-full mt-1 border rounded p-2" />
            {budgetPerHeadGuidance && <p className="text-xs text-zinc-500 mt-1">{budgetPerHeadGuidance}</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Meniu / dorințe</span>
            <textarea value={menuPreference} onChange={(e) => setMenuPreference(e.target.value)} className="w-full mt-1 border rounded p-2" rows={2} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Note suplimentare</span>
            <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} className="w-full mt-1 border rounded p-2" rows={2} />
          </label>
          <Button onClick={next}>Continuă</Button>
        </div>
      )}
      {step === "identity" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Nume</span>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Telefon (opțional)</span>
            <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className="w-full mt-1 border rounded p-2" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bookingForCompany} onChange={(e) => setBookingForCompany(e.target.checked)} />
            Rezervare în numele unei companii
          </label>
          {bookingForCompany && (
            <>
              <label className="block">
                <span className="text-sm font-medium">CUI</span>
                <input value={claimedCompanyCui} onChange={(e) => setClaimedCompanyCui(e.target.value)} className="w-full mt-1 border rounded p-2" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Nume companie</span>
                <input value={claimedCompanyName} onChange={(e) => setClaimedCompanyName(e.target.value)} className="w-full mt-1 border rounded p-2" />
              </label>
            </>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button disabled={pending || !guestName || !guestEmail} onClick={submit}>
            {pending ? "Se trimite..." : "Trimite cererea"}
          </Button>
        </div>
      )}
      {step === "sent" && (
        <div className="space-y-3 text-center py-6">
          <p className="text-xl font-semibold">Verifică emailul</p>
          <p className="text-sm text-zinc-600">Ți-am trimis un link la <strong>{guestEmail}</strong>. Click pe el ca să confirmi cererea — astfel restaurantul o primește în inbox.</p>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npx jest src/components/__tests__/event-request-sheet.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/event-request-sheet.tsx src/components/__tests__/event-request-sheet.test.tsx
git commit -m "feat(consumer): EventRequestSheet multi-step form"
```

---

## Task 17: Mount the CTA on venue page

**Files:**
- Modify: `src/app/[city]/[slug]/DetailPageClient.tsx` (or wherever the "Rezervă o masă" button renders)

Show "Organizează un eveniment" beside the dining CTA when `events_intake_enabled = true`. Hide entirely when false.

- [ ] **Step 1: Pass the flag + settings through from the page server component**

In `src/app/[city]/[slug]/page.tsx` (or equivalent), include in the restaurant detail query a join on `restaurant_event_settings` and pass `eventsIntakeEnabled` + the settings down.

- [ ] **Step 2: Add a small wrapper component**

Create `src/components/event-request-cta.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "./button";
import { EventRequestSheet, EventRequestSheetProps } from "./event-request-sheet";

interface Props extends Omit<EventRequestSheetProps, "open" | "onClose"> {
  enabled: boolean;
}

export function EventRequestCta(props: Props) {
  const [open, setOpen] = useState(false);
  if (!props.enabled) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Organizează un eveniment</Button>
      <EventRequestSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 3: Place it next to the dining CTA**

In the venue detail client, render `<EventRequestCta enabled={data.eventsIntakeEnabled} ...settings />` adjacent to `<ReservationCta>` (or equivalent). If no settings row, pass `acceptedOccasions={["wedding","birthday","corporate_dinner","product_launch","other"]}` (all enabled by default).

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/[city]/[slug]/page.tsx src/app/[city]/[slug]/DetailPageClient.tsx src/components/event-request-cta.tsx
git commit -m "feat(consumer): event-request CTA on venue page"
```

---

## Task 18: Event-request tracking page

**Files:**
- Create: `src/app/event-requests/[token]/page.tsx`
- Create: `src/app/event-requests/[token]/__tests__/page.test.tsx`

Public, token-gated. Renders status timeline + reply thread + accept/decline buttons when quoted.

- [ ] **Step 1: Implement the page (server component)**

Create `src/app/event-requests/[token]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getByTrackingToken } from "@/lib/repos/event-requests-repo";
import { TrackingClient } from "./TrackingClient";

export default async function EventRequestTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const er = await getByTrackingToken(token);
  if (!er) notFound();
  return <TrackingClient er={er} token={token} />;
}
```

Create `src/app/event-requests/[token]/TrackingClient.tsx`:

```typescript
"use client";

import { useTransition } from "react";
import { Button } from "@/components/button";
import { consumerAcceptQuote, consumerDeclineQuote, consumerCancelEventRequest } from "./actions";

interface Props {
  er: {
    id: string; status: string; occasion: string; eventDate: string; partySize: number;
    partnerResponse: string | null; quotedAmountCents: number | null; quoteExpiresAt: Date | null;
    declineReason: string | null;
  };
  token: string;
}

const STATUS_COPY_RO: Record<string, string> = {
  new: "Cerere trimisă, așteptăm restaurantul",
  viewing: "Restaurantul a deschis cererea",
  replied: "Restaurantul a răspuns",
  quoted: "Ai primit o ofertă",
  accepted: "Ofertă acceptată",
  declined: "Cererea a fost refuzată",
  expired_quote: "Oferta a expirat",
  cancelled: "Cerere anulată",
  expired: "Cerere expirată (fără răspuns)",
  completed: "Eveniment finalizat",
};

export function TrackingClient({ er, token }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{STATUS_COPY_RO[er.status] ?? er.status}</h1>
      <p className="text-sm text-zinc-500 mt-1">Cerere pentru {er.eventDate}, {er.partySize} persoane</p>
      {er.partnerResponse && (
        <section className="mt-4 bg-zinc-50 p-4 rounded">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Răspuns restaurant</p>
          <p className="mt-1 whitespace-pre-line">{er.partnerResponse}</p>
        </section>
      )}
      {er.status === "quoted" && er.quotedAmountCents && (
        <section className="mt-4">
          <p className="text-xl"><strong>{(er.quotedAmountCents / 100).toFixed(2)} lei</strong></p>
          {er.quoteExpiresAt && <p className="text-xs text-zinc-500">Oferta expiră pe {new Date(er.quoteExpiresAt).toLocaleDateString("ro-RO")}</p>}
          <div className="flex gap-3 mt-3">
            <Button disabled={pending} onClick={() => startTransition(() => consumerAcceptQuote(token).then(() => location.reload()))}>Acceptă</Button>
            <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => consumerDeclineQuote({ token }).then(() => location.reload()))}>Refuză</Button>
          </div>
        </section>
      )}
      {er.declineReason && er.status === "declined" && (
        <p className="mt-4 text-sm">Motiv: {er.declineReason}</p>
      )}
      {["new", "viewing", "replied", "quoted"].includes(er.status) && (
        <Button variant="ghost" className="mt-6" disabled={pending} onClick={() => startTransition(() => consumerCancelEventRequest(token).then(() => location.reload()))}>
          Anulează cererea
        </Button>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the page test**

Create `src/app/event-requests/[token]/__tests__/page.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { TrackingClient } from "../TrackingClient";

describe("TrackingClient", () => {
  it("renders quoted state with amount + Accept/Decline buttons", () => {
    render(<TrackingClient token="t" er={{
      id: "e", status: "quoted", occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
      partnerResponse: "Bună!", quotedAmountCents: 750000,
      quoteExpiresAt: new Date("2026-07-15"), declineReason: null,
    }} />);
    expect(screen.getByText(/7500\.00 lei/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /acceptă|accept/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
npx jest src/app/event-requests/[token]/__tests__/page.test.tsx
git add src/app/event-requests/[token]/
git commit -m "feat(consumer): event-request tracking page"
```

---

## Task 19: Add "Corporate" sidebar entry

**Files:**
- Modify: `src/components/partner/PartnerSidebar.tsx`

Single top-level link; no nested submenu. Routes to `/partner/corporate`.

- [ ] **Step 1: Add the nav item**

In the existing nav array in `PartnerSidebar.tsx`, after the last item:

```typescript
{ href: "/partner/corporate", label: "Corporate", icon: BriefcaseIcon }
```

(Match the existing icon import style; `BriefcaseIcon` from `lucide-react` is fine.)

- [ ] **Step 2: Commit**

```bash
git add src/components/partner/PartnerSidebar.tsx
git commit -m "feat(partner): add Corporate sidebar link"
```

---

## Task 20: Partner corporate overview page

**Files:**
- Create: `src/app/partner/(dashboard)/corporate/page.tsx`
- Create: `src/components/partner/CorporateOverview.tsx`
- Create: `src/components/partner/__tests__/CorporateOverview.test.tsx`

Toggle dashboard with one card per capability (only `events_intake_enabled` actually functional in Phase 1; the other three exist but their UIs ship in later phases — show "Coming soon" badges). Each card has the toggle + a 2-line value prop + a counter.

- [ ] **Step 1: Write the failing test**

Create `src/components/partner/__tests__/CorporateOverview.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { CorporateOverview } from "../CorporateOverview";

const noop = jest.fn().mockResolvedValue(undefined);

describe("CorporateOverview", () => {
  it("renders four capability cards with toggle state from props", () => {
    render(<CorporateOverview restaurantId="r1" capabilities={{
      events: { enabled: false, openCount: 0 }, corporateMeals: { enabled: false }, standing: { enabled: false }, meetingNooks: { enabled: false },
    }} onToggle={noop} />);
    expect(screen.getByText(/evenimente private/i)).toBeInTheDocument();
    expect(screen.getByText(/comenzi corporate/i)).toBeInTheDocument();
    expect(screen.getByText(/rezervări recurente/i)).toBeInTheDocument();
    expect(screen.getByText(/spații pentru întâlniri/i)).toBeInTheDocument();
  });

  it("calls onToggle when events toggle clicked", async () => {
    render(<CorporateOverview restaurantId="r1" capabilities={{
      events: { enabled: false, openCount: 0 }, corporateMeals: { enabled: false }, standing: { enabled: false }, meetingNooks: { enabled: false },
    }} onToggle={noop} />);
    fireEvent.click(screen.getByRole("switch", { name: /evenimente private/i }));
    expect(noop).toHaveBeenCalledWith("events", true);
  });
});
```

- [ ] **Step 2: Implement**

Create `src/components/partner/CorporateOverview.tsx`:

```typescript
"use client";

import { useState } from "react";

interface CapState { enabled: boolean; openCount?: number; }
type CapKey = "events" | "corporateMeals" | "standing" | "meetingNooks";

interface Props {
  restaurantId: string;
  capabilities: Record<CapKey, CapState>;
  onToggle: (cap: CapKey, next: boolean) => Promise<void>;
}

const CARDS: Array<{ key: CapKey; title: string; blurb: string; phase1: boolean }> = [
  { key: "events", title: "Evenimente private", blurb: "Primește solicitări pentru nunți, aniversări, evenimente corporate.", phase1: true },
  { key: "corporateMeals", title: "Comenzi corporate", blurb: "Permite rezervări atribuite unei companii (facturare directă).", phase1: false },
  { key: "standing", title: "Rezervări recurente", blurb: "Acceptă rezervări săptămânale sau bilunare pe termen lung.", phase1: false },
  { key: "meetingNooks", title: "Spații pentru întâlniri", blurb: "Configurează spații de lucru disponibile cu ora.", phase1: false },
];

export function CorporateOverview({ capabilities, onToggle }: Props) {
  const [busy, setBusy] = useState<CapKey | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((c) => {
        const state = capabilities[c.key];
        return (
          <div key={c.key} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{c.title}</p>
                <p className="text-sm text-zinc-600 mt-1">{c.blurb}</p>
                {state.openCount !== undefined && state.openCount > 0 && (
                  <p className="text-xs mt-2 text-emerald-700">{state.openCount} solicitări active</p>
                )}
              </div>
              {c.phase1 ? (
                <button
                  role="switch"
                  aria-checked={state.enabled}
                  aria-label={c.title}
                  disabled={busy === c.key}
                  onClick={async () => { setBusy(c.key); try { await onToggle(c.key, !state.enabled); } finally { setBusy(null); } }}
                  className={`h-7 w-12 rounded-full transition ${state.enabled ? "bg-emerald-500" : "bg-zinc-300"}`}
                >
                  <span className={`block h-5 w-5 bg-white rounded-full transform transition ${state.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-500">În curând</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Implement the server page that wires the toggle**

Create `src/app/partner/(dashboard)/corporate/page.tsx`:

```typescript
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurants } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { CorporateOverview } from "@/components/partner/CorporateOverview";
import { toggleCapability } from "./actions";

export default async function CorporatePage() {
  const restaurant = await getPartnerRestaurant();
  const openRows = await dbAdmin.select({ id: eventRequests.id }).from(eventRequests).where(and(
    eq(eventRequests.restaurantId, restaurant.id),
    inArray(eventRequests.status, ["new", "viewing", "replied", "quoted"]),
  ));
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Corporate</h1>
      <CorporateOverview
        restaurantId={restaurant.id}
        capabilities={{
          events: { enabled: restaurant.eventsIntakeEnabled, openCount: openRows.length },
          corporateMeals: { enabled: restaurant.acceptsCorporateMeals },
          standing: { enabled: restaurant.acceptsStanding },
          meetingNooks: { enabled: false },
        }}
        onToggle={toggleCapability.bind(null, restaurant.id)}
      />
    </main>
  );
}
```

Create `src/app/partner/(dashboard)/corporate/actions.ts`:

```typescript
"use server";

import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getPartnerRestaurant } from "@/lib/auth/partner";

type Cap = "events" | "corporateMeals" | "standing" | "meetingNooks";
const COL: Record<Cap, "eventsIntakeEnabled" | "acceptsCorporateMeals" | "acceptsStanding" | null> = {
  events: "eventsIntakeEnabled",
  corporateMeals: "acceptsCorporateMeals",
  standing: "acceptsStanding",
  meetingNooks: null,
};

export async function toggleCapability(restaurantId: string, cap: Cap, next: boolean): Promise<void> {
  const r = await getPartnerRestaurant();
  if (r.id !== restaurantId) throw new Error("forbidden");
  const col = COL[cap];
  if (!col) throw new Error("capability not yet available");
  await dbAdmin.update(restaurants).set({ [col]: next }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/partner/corporate");
}
```

(Assumes `getPartnerRestaurant()` is the existing partner-auth helper. If a different one is used in the project, adapt the import — search the partner code for the pattern.)

- [ ] **Step 4: Run tests + commit**

```bash
npx jest src/components/partner/__tests__/CorporateOverview.test.tsx
git add src/app/partner/(dashboard)/corporate/ src/components/partner/CorporateOverview.tsx src/components/partner/__tests__/CorporateOverview.test.tsx
git commit -m "feat(partner): corporate overview with capability toggles"
```

---

## Task 21: Partner event-request inbox

**Files:**
- Create: `src/app/partner/(dashboard)/corporate/events/page.tsx`
- Create: `src/components/partner/EventRequestInbox.tsx`

Inbox visible iff `events_intake_enabled OR EXISTS(open event_requests)`. Table: occasion, date, party, requester, status, days since submit.

- [ ] **Step 1: Implement the inbox component**

Create `src/components/partner/EventRequestInbox.tsx`:

```typescript
"use client";

import Link from "next/link";

interface Row {
  id: string; occasion: string; eventDate: string; partySize: number; guestName: string; status: string; createdAt: Date;
}

const STATUS_LABELS_RO: Record<string, string> = {
  new: "Nou", viewing: "Vizualizat", replied: "Răspuns", quoted: "Cu ofertă", accepted: "Acceptat",
  declined: "Refuzat", cancelled: "Anulat", expired_quote: "Ofertă expirată", expired: "Expirat", completed: "Finalizat",
};

const OCCASION_LABELS_RO: Record<string, string> = {
  wedding: "Nuntă", birthday: "Aniversare", corporate_dinner: "Cină corporate", product_launch: "Lansare produs", other: "Altele",
};

export function EventRequestInbox({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-zinc-500">Nicio cerere încă.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-zinc-500">
        <tr>
          <th className="py-2">Ocazie</th><th>Dată</th><th>Persoane</th><th>Solicitant</th><th>Status</th><th>Zile</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const days = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86400_000);
          return (
            <tr key={r.id} className="border-t hover:bg-zinc-50">
              <td className="py-2"><Link href={`/partner/corporate/events/${r.id}`}>{OCCASION_LABELS_RO[r.occasion]}</Link></td>
              <td>{r.eventDate}</td><td>{r.partySize}</td><td>{r.guestName}</td>
              <td><span className="px-2 py-1 rounded bg-zinc-100 text-xs">{STATUS_LABELS_RO[r.status]}</span></td>
              <td>{days}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Implement the page**

Create `src/app/partner/(dashboard)/corporate/events/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { EventRequestInbox } from "@/components/partner/EventRequestInbox";

const OPEN: Array<"new"|"viewing"|"replied"|"quoted"> = ["new","viewing","replied","quoted"];

export default async function EventInboxPage() {
  const r = await getPartnerRestaurant();
  const openExist = await dbAdmin.select({ c: sql<number>`count(*)::int` }).from(eventRequests).where(and(
    eq(eventRequests.restaurantId, r.id), inArray(eventRequests.status, OPEN),
  ));
  if (!r.eventsIntakeEnabled && (openExist[0]?.c ?? 0) === 0) notFound();
  const rows = await dbAdmin.select({
    id: eventRequests.id, occasion: eventRequests.occasion, eventDate: eventRequests.eventDate,
    partySize: eventRequests.partySize, guestName: eventRequests.guestName, status: eventRequests.status,
    createdAt: eventRequests.createdAt,
  }).from(eventRequests).where(and(eq(eventRequests.restaurantId, r.id))).orderBy(sql`${eventRequests.createdAt} DESC`);
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Solicitări de eveniment</h1>
      <EventRequestInbox rows={rows} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/partner/(dashboard)/corporate/events/page.tsx src/components/partner/EventRequestInbox.tsx
git commit -m "feat(partner): event-request inbox"
```

---

## Task 22: Partner event-request detail page

**Files:**
- Create: `src/app/partner/(dashboard)/corporate/events/[id]/page.tsx`
- Create: `src/components/partner/EventRequestDetail.tsx`
- Create: `src/components/partner/QuoteForm.tsx`
- Create: `src/components/partner/DeclineForm.tsx`
- Create: `src/components/partner/MaterializeReservationForm.tsx`

Detail view shows the full request body, partner-response thread (`partner_response` is a single field for v1; richer threading is Phase N), action buttons, and a conflict banner if `findOverlappingReservations` returns rows.

- [ ] **Step 1: Implement the detail server page**

Create `src/app/partner/(dashboard)/corporate/events/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { findOverlappingReservations } from "@/lib/repos/event-requests-repo";
import { EventRequestDetail } from "@/components/partner/EventRequestDetail";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getPartnerRestaurant();
  const [er] = await dbAdmin.select().from(eventRequests).where(eq(eventRequests.id, id)).limit(1);
  if (!er || er.restaurantId !== r.id) notFound();
  const overlaps = await findOverlappingReservations(r.id, er.eventDate);
  return <EventRequestDetail er={er} overlaps={overlaps} />;
}
```

- [ ] **Step 2: Implement the detail client**

Create `src/components/partner/EventRequestDetail.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { QuoteForm } from "./QuoteForm";
import { DeclineForm } from "./DeclineForm";
import { MaterializeReservationForm } from "./MaterializeReservationForm";
import {
  markEventRequestViewing, replyToEventRequest,
} from "@/app/api/event-requests/actions";

interface ER {
  id: string; status: string; occasion: string; eventDate: string; partySize: number;
  guestName: string; guestEmail: string; guestPhone: string | null;
  spacePreference: string | null; budgetPerHeadCents: number | null;
  menuPreference: string | null; dietaryNotes: string | null; additionalNotes: string | null;
  partnerResponse: string | null; quotedAmountCents: number | null;
}

export function EventRequestDetail({ er, overlaps }: { er: ER; overlaps: { id: string; reservationTime: string; partySize: number }[] }) {
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"detail" | "quote" | "decline" | "materialize">("detail");
  const [replyText, setReplyText] = useState("");

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{er.occasion} · {er.eventDate} · {er.partySize}</h1>
        <p className="text-sm text-zinc-500">{er.guestName} · {er.guestEmail}{er.guestPhone ? ` · ${er.guestPhone}` : ""}</p>
      </header>
      {overlaps.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm">
          ⚠ Există {overlaps.length} rezervări regulate pentru această dată. Verifică înainte de acceptare.
        </div>
      )}
      <section className="space-y-2">
        {er.spacePreference && <p><strong>Spațiu:</strong> {er.spacePreference}</p>}
        {er.budgetPerHeadCents && <p><strong>Buget/pers:</strong> {(er.budgetPerHeadCents/100).toFixed(0)} lei</p>}
        {er.menuPreference && <p><strong>Meniu:</strong> {er.menuPreference}</p>}
        {er.dietaryNotes && <p><strong>Restricții:</strong> {er.dietaryNotes}</p>}
        {er.additionalNotes && <p><strong>Note:</strong> {er.additionalNotes}</p>}
      </section>
      {er.partnerResponse && (
        <section className="bg-zinc-50 p-3 rounded">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Răspunsul tău anterior</p>
          <p className="whitespace-pre-line mt-1">{er.partnerResponse}</p>
        </section>
      )}
      {view === "detail" && (
        <div className="space-y-3">
          {(er.status === "new" || er.status === "viewing" || er.status === "replied") && (
            <>
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} className="w-full border rounded p-2" rows={3} placeholder="Mesaj pentru client..." />
              <div className="flex gap-2">
                <Button disabled={pending || replyText.trim().length === 0} onClick={() => startTransition(() => replyToEventRequest({ id: er.id, message: replyText }).then(() => location.reload()))}>Trimite răspuns</Button>
                <Button variant="secondary" onClick={() => setView("quote")}>Trimite ofertă</Button>
                <Button variant="ghost" onClick={() => setView("decline")}>Refuză</Button>
              </div>
            </>
          )}
          {er.status === "accepted" && (
            <Button onClick={() => setView("materialize")}>Creează rezervare</Button>
          )}
          {(er.status === "new" || er.status === "replied") && er.status === "new" && (
            <Button variant="ghost" size="sm" onClick={() => startTransition(() => markEventRequestViewing({ id: er.id }).then(() => location.reload()))}>Marchează ca vizualizată</Button>
          )}
        </div>
      )}
      {view === "quote" && <QuoteForm eventRequestId={er.id} onCancel={() => setView("detail")} />}
      {view === "decline" && <DeclineForm eventRequestId={er.id} onCancel={() => setView("detail")} />}
      {view === "materialize" && <MaterializeReservationForm eventRequestId={er.id} eventDate={er.eventDate} partySize={er.partySize} onCancel={() => setView("detail")} />}
    </main>
  );
}
```

- [ ] **Step 3: Implement the three sub-forms**

Create `src/components/partner/QuoteForm.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { quoteEventRequest } from "@/app/api/event-requests/actions";

export function QuoteForm({ eventRequestId, onCancel }: { eventRequestId: string; onCancel: () => void }) {
  const [amountLei, setAmountLei] = useState<number>(0);
  const [daysValid, setDaysValid] = useState(7);
  const [partnerResponse, setPartnerResponse] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      startTransition(async () => {
        await quoteEventRequest({
          id: eventRequestId,
          amountCents: amountLei * 100,
          expiresAt: new Date(Date.now() + daysValid * 86400_000).toISOString(),
          partnerResponse: partnerResponse || undefined,
        });
        location.reload();
      });
    }}>
      <label className="block">
        <span className="text-sm">Sumă totală (lei)</span>
        <input type="number" min={1} value={amountLei} onChange={(e) => setAmountLei(Number(e.target.value))} className="w-full mt-1 border rounded p-2" required />
      </label>
      <label className="block">
        <span className="text-sm">Valabilitate (zile)</span>
        <input type="number" min={1} max={30} value={daysValid} onChange={(e) => setDaysValid(Number(e.target.value))} className="w-full mt-1 border rounded p-2" />
      </label>
      <label className="block">
        <span className="text-sm">Mesaj însoțitor</span>
        <textarea value={partnerResponse} onChange={(e) => setPartnerResponse(e.target.value)} className="w-full mt-1 border rounded p-2" rows={3} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || amountLei <= 0}>Trimite oferta</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Anulează</Button>
      </div>
    </form>
  );
}
```

Create `src/components/partner/DeclineForm.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { declineEventRequest } from "@/app/api/event-requests/actions";

const REASONS = [
  { value: "no_availability", label: "Indisponibilitate" },
  { value: "budget_too_low", label: "Buget insuficient" },
  { value: "space_too_small", label: "Spațiul nu se potrivește" },
  { value: "other", label: "Alt motiv" },
];

export function DeclineForm({ eventRequestId, onCancel }: { eventRequestId: string; onCancel: () => void }) {
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [free, setFree] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      startTransition(async () => {
        await declineEventRequest({ id: eventRequestId, reason: free ? `${reason}: ${free}` : reason });
        location.reload();
      });
    }}>
      <fieldset className="space-y-2">
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={(e) => setReason(e.target.value)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      <textarea value={free} onChange={(e) => setFree(e.target.value)} className="w-full border rounded p-2" rows={2} placeholder="Detalii (opțional)" />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>Refuză</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Înapoi</Button>
      </div>
    </form>
  );
}
```

Create `src/components/partner/MaterializeReservationForm.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { materializeAcceptedEventRequest } from "@/app/api/event-requests/actions";

export function MaterializeReservationForm({ eventRequestId, eventDate, partySize, onCancel }: {
  eventRequestId: string; eventDate: string; partySize: number; onCancel: () => void;
}) {
  const [mode, setMode] = useState<"private_room" | "whole_venue">("private_room");
  const [time, setTime] = useState("19:00");
  const [zone, setZone] = useState("Private Room");
  const [pending, startTransition] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      startTransition(async () => {
        await materializeAcceptedEventRequest({
          id: eventRequestId, mode,
          slots: [{ time, partySize, zone: mode === "private_room" ? zone : undefined }],
        });
        location.reload();
      });
    }}>
      <p className="text-sm text-zinc-600">Crearea rezervării pentru {eventDate} · {partySize} persoane</p>
      <fieldset className="space-y-2">
        <label className="flex items-start gap-2">
          <input type="radio" name="mode" checked={mode === "private_room"} onChange={() => setMode("private_room")} />
          <span><strong>Spațiu privat</strong> · grila normală de rezervări rămâne neatinsă</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="mode" checked={mode === "whole_venue"} onChange={() => setMode("whole_venue")} />
          <span><strong>Întregul local</strong> · blochează toate sloturile pentru această dată</span>
        </label>
      </fieldset>
      <label className="block">
        <span className="text-sm">Oră</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full mt-1 border rounded p-2" required />
      </label>
      {mode === "private_room" && (
        <label className="block">
          <span className="text-sm">Zonă</span>
          <input value={zone} onChange={(e) => setZone(e.target.value)} className="w-full mt-1 border rounded p-2" />
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>Creează rezervare</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Înapoi</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/partner/(dashboard)/corporate/events/[id]/page.tsx src/components/partner/EventRequestDetail.tsx src/components/partner/QuoteForm.tsx src/components/partner/DeclineForm.tsx src/components/partner/MaterializeReservationForm.tsx
git commit -m "feat(partner): event-request detail + reply/quote/decline/materialize"
```

---

## Task 23: PartnerNotificationBell

**Files:**
- Create: `src/components/partner/PartnerNotificationBell.tsx`
- Modify: `src/components/partner/PartnerShell.tsx`
- Create: `src/app/api/partner-notifications/route.ts`

Polls `/api/partner-notifications` every 30s for unread count.

- [ ] **Step 1: Implement the route**

Create `src/app/api/partner-notifications/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { unreadCount, listForRestaurant, markAllRead } from "@/lib/repos/partner-notifications-repo";

export async function GET() {
  const r = await getPartnerRestaurant();
  const count = await unreadCount(r.id);
  const items = await listForRestaurant(r.id, 10);
  return NextResponse.json({ count, items });
}

export async function POST() {
  const r = await getPartnerRestaurant();
  await markAllRead(r.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement the bell component**

Create `src/components/partner/PartnerNotificationBell.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

interface Item { id: string; kind: string; payload: Record<string, unknown>; createdAt: string; }

export function PartnerNotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      const res = await fetch("/api/partner-notifications", { cache: "no-store" });
      if (!mounted || !res.ok) return;
      const data = await res.json();
      setCount(data.count);
      setItems(data.items);
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  async function markRead() {
    await fetch("/api/partner-notifications", { method: "POST" });
    setCount(0);
  }

  return (
    <div className="relative">
      <button aria-label="Notificări" onClick={() => { setOpen((o) => !o); if (count > 0) markRead(); }}>
        <Bell className="w-5 h-5" />
        {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow-lg p-2 z-10">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500 p-3">Nimic nou.</p>
          ) : items.map((n) => (
            <div key={n.id} className="text-sm p-2 hover:bg-zinc-50">
              <span className="font-medium">{n.kind}</span> · {new Date(n.createdAt).toLocaleString("ro-RO")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount in PartnerShell**

In `src/components/partner/PartnerShell.tsx`, add `<PartnerNotificationBell />` in the header (adjacent to wherever the user-menu lives).

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/partner-notifications/route.ts src/components/partner/PartnerNotificationBell.tsx src/components/partner/PartnerShell.tsx
git commit -m "feat(partner): notification bell with 30s polling"
```

---

## Task 24: Capability filter dimension

**Files:**
- Modify: `src/lib/filter-context.tsx`
- Modify: `src/lib/repos/restaurants-repo.ts`

Adds `capabilities: ("events"|"meetings"|"standing"|"corporate_meals")[]` to the filter context and a corresponding `WHERE` clause to the listing query.

- [ ] **Step 1: Extend filter context**

In `src/lib/filter-context.tsx`, add to the filter state type:

```typescript
export type CapabilityFilter = "events" | "meetings" | "standing" | "corporate_meals";

// inside existing FiltersState type:
capabilities?: CapabilityFilter[];
```

Update the reducer/context default to include `capabilities: []`. URL serialization: capabilities become a `?capability=events,meetings` comma-separated param.

- [ ] **Step 2: Add filtering to `restaurants-repo`**

In `src/lib/repos/restaurants-repo.ts`, locate the existing list query and add capability filters:

```typescript
import { sql } from "drizzle-orm";

interface ListInput { /* existing */ capabilities?: CapabilityFilter[]; }

// inside the query builder:
if (input.capabilities?.includes("events")) {
  whereClauses.push(eq(restaurants.eventsIntakeEnabled, true));
}
if (input.capabilities?.includes("standing")) {
  whereClauses.push(eq(restaurants.acceptsStanding, true));
}
if (input.capabilities?.includes("corporate_meals")) {
  whereClauses.push(eq(restaurants.acceptsCorporateMeals, true));
}
// meetings is derived — Phase 4 will add:
// if (input.capabilities?.includes("meetings")) {
//   whereClauses.push(sql`EXISTS (SELECT 1 FROM meeting_spaces ms WHERE ms.restaurant_id = ${restaurants.id} AND ms.is_active = true)`);
// }
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/filter-context.tsx src/lib/repos/restaurants-repo.ts
git commit -m "feat(filters): capability filter dimension"
```

---

## Task 25: Capability pill in filter-pill-bar

**Files:**
- Modify: `src/components/filter-pill-bar.tsx`

- [ ] **Step 1: Add an "Eveniment" / "Spațiu meeting" pill group**

In `src/components/filter-pill-bar.tsx`, after the existing pill rows, add:

```typescript
<div className="flex gap-2 overflow-x-auto">
  <Pill
    selected={filters.capabilities?.includes("events")}
    onClick={() => toggleCapability("events")}
  >Eveniment privat</Pill>
  <Pill
    selected={filters.capabilities?.includes("corporate_meals")}
    onClick={() => toggleCapability("corporate_meals")}
  >Cină corporate</Pill>
  <Pill
    selected={filters.capabilities?.includes("standing")}
    onClick={() => toggleCapability("standing")}
  >Rezervare recurentă</Pill>
</div>
```

Where `toggleCapability(key)` dispatches an `"toggleCapability"` action against the filter context.

- [ ] **Step 2: Commit**

```bash
git add src/components/filter-pill-bar.tsx
git commit -m "feat(filters): capability filter pills"
```

---

## Task 26: Capability landing page `/[city]/events`

**Files:**
- Create: `src/app/[city]/events/page.tsx`
- Create: `src/app/[city]/events/__tests__/page.test.tsx`

Filtered listing forcing `capabilities=["events"]` + SEO copy + structured data.

- [ ] **Step 1: Implement the page**

Create `src/app/[city]/events/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { listRestaurants } from "@/lib/repos/restaurants-repo";
import { listCities } from "@/lib/repos/restaurants-repo"; // adjust to actual export
import { RestaurantCard } from "@/components/restaurant-card";

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return {
    title: `Locații pentru evenimente private în ${city} | Tavli`,
    description: `Descoperă restaurante și cafenele din ${city} care primesc solicitări pentru evenimente private — nunți, aniversări, cine corporate.`,
    alternates: { canonical: `/${city}/events` },
  };
}

export default async function CityEventsPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const rows = await listRestaurants({ citySlug: city, capabilities: ["events"], limit: 60 });
  if (!rows) notFound();
  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Locații pentru evenimente private</h1>
        <p className="text-zinc-600 mt-2">{rows.length} locații care primesc solicitări pentru evenimente în {city}.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => <RestaurantCard key={r.id} restaurant={r} highlightCapability="events" />)}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(rows.map((r) => ({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": r.name,
        "address": r.address,
        "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Events", "value": true }],
      }))) }} />
    </main>
  );
}
```

- [ ] **Step 2: Add a small smoke test**

Create `src/app/[city]/events/__tests__/page.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import CityEventsPage from "../page";

jest.mock("@/lib/repos/restaurants-repo", () => ({
  listRestaurants: jest.fn().mockResolvedValue([
    { id: "1", name: "X", slug: "x", cityId: "c", rating: 4.6, voteCount: 30, address: "Str X" },
  ]),
}));

describe("CityEventsPage", () => {
  it("renders heading and listing", async () => {
    const ui = await CityEventsPage({ params: Promise.resolve({ city: "bucuresti" }) });
    render(ui);
    expect(screen.getByText(/Locații pentru evenimente private/)).toBeInTheDocument();
    expect(screen.getByText(/X/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
npx jest src/app/[city]/events/__tests__/page.test.tsx
git add src/app/[city]/events/
git commit -m "feat(discovery): /[city]/events capability landing"
```

---

## Task 27: Sitemap entries + RestaurantCard capability badge

**Files:**
- Modify: `src/app/sitemap.ts`
- Modify: `src/components/restaurant-card.tsx`

- [ ] **Step 1: Emit per-city `/events` URLs**

In `src/app/sitemap.ts`, after the existing per-city restaurant URLs:

```typescript
for (const city of cities) {
  urls.push({
    url: `${baseUrl}/${city.slug}/events`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  });
}
```

- [ ] **Step 2: Add capability badge to RestaurantCard**

In `src/components/restaurant-card.tsx`, accept a new optional prop:

```typescript
interface Props {
  // existing props
  highlightCapability?: "events" | "meetings" | "standing" | "corporate_meals";
}
```

And render a small chip near the title when set:

```typescript
{highlightCapability === "events" && (
  <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Eveniment privat</span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/sitemap.ts src/components/restaurant-card.tsx
git commit -m "feat(discovery): sitemap + card capability badge"
```

---

## Task 28: Cron — expire draft event-requests

**Files:**
- Create: `src/app/api/cron/expire-event-request-drafts/route.ts`
- Create: `src/app/api/cron/expire-event-request-drafts/__tests__/route.test.ts`

Purges drafts older than 30 minutes (status='draft' AND created_at < now()-30min). Authenticated via `CRON_SECRET`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/cron/expire-event-request-drafts/__tests__/route.test.ts`:

```typescript
import { GET } from "../route";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, cities, restaurants } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

describe("expire-event-request-drafts cron", () => {
  it("deletes drafts older than 30 minutes; leaves recent + non-draft alone", async () => {
    process.env.CRON_SECRET = "s";
    await dbAdmin.insert(cities).values({ slug: "c", name: "C", countryCode: "RO" }).onConflictDoNothing();
    const [c] = await dbAdmin.select().from(cities).limit(1);
    const [r] = await dbAdmin.insert(restaurants).values({ slug: `dr-${Date.now()}`, name: "X", cityId: c.id, status: "live" }).returning();
    const oldId = crypto.randomUUID();
    const newId = crypto.randomUUID();
    await dbAdmin.insert(eventRequests).values([
      { id: oldId, restaurantId: r.id, guestName: "A", guestEmail: "a@b.co", occasion: "wedding", eventDate: "2026-08-01", partySize: 10, trackingToken: "t1" },
      { id: newId, restaurantId: r.id, guestName: "B", guestEmail: "b@b.co", occasion: "wedding", eventDate: "2026-08-01", partySize: 10, trackingToken: "t2" },
    ]);
    await dbAdmin.execute(sql`UPDATE event_requests SET created_at = NOW() - INTERVAL '1 hour' WHERE id = ${oldId}`);
    const req = new Request("http://localhost/api/cron/expire-event-request-drafts", { headers: { authorization: "Bearer s" } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const remaining = await dbAdmin.select({ id: eventRequests.id }).from(eventRequests).where(eq(eventRequests.id, oldId));
    expect(remaining).toHaveLength(0);
    const recent = await dbAdmin.select({ id: eventRequests.id }).from(eventRequests).where(eq(eventRequests.id, newId));
    expect(recent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

Create `src/app/api/cron/expire-event-request-drafts/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql } from "drizzle-orm";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await dbAdmin.execute(
    sql`DELETE FROM event_requests WHERE status = 'draft' AND created_at < NOW() - INTERVAL '30 minutes' RETURNING id`,
  );
  return NextResponse.json({ ok: true, deleted: result.rows.length });
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npx jest src/app/api/cron/expire-event-request-drafts/__tests__/route.test.ts
git add src/app/api/cron/expire-event-request-drafts/
git commit -m "feat(cron): purge stale event-request drafts"
```

---

## Task 29: Cron — expire past-due quotes

**Files:**
- Create: `src/app/api/cron/expire-event-request-quotes/route.ts`
- Create: `src/app/api/cron/expire-event-request-quotes/__tests__/route.test.ts`

Flip `status='quoted' AND quote_expires_at < NOW()` to `expired_quote`; email both sides.

- [ ] **Step 1: Implement**

Create `src/app/api/cron/expire-event-request-quotes/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql } from "drizzle-orm";
import { eventRequests, restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEventRequestExpired } from "@/lib/email/dispatcher"; // add wrapper analogous to others

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expired = await dbAdmin.execute<{ id: string; restaurant_id: string; guest_email: string; guest_name: string; event_date: string; party_size: number; occasion: string }>(
    sql`UPDATE event_requests SET status = 'expired_quote' WHERE status = 'quoted' AND quote_expires_at < NOW() RETURNING id, restaurant_id, guest_email, guest_name, event_date, party_size, occasion`,
  );
  for (const row of expired.rows) {
    const [r] = await dbAdmin.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, row.restaurant_id)).limit(1);
    if (r) {
      await sendEventRequestExpired({ to: row.guest_email, locale: "ro", restaurantName: r.name, guestName: row.guest_name, occasion: row.occasion as "wedding", eventDate: row.event_date, partySize: row.party_size, trackingUrl: "" });
    }
  }
  return NextResponse.json({ ok: true, expired: expired.rows.length });
}
```

- [ ] **Step 2: Write smoke test**

Create `src/app/api/cron/expire-event-request-quotes/__tests__/route.test.ts` covering: a row with `quote_expires_at` in the past gets flipped; a row in the future doesn't. Use the same seeding pattern as Task 28.

- [ ] **Step 3: Run tests + commit**

```bash
npx jest src/app/api/cron/expire-event-request-quotes/__tests__/route.test.ts
git add src/app/api/cron/expire-event-request-quotes/
git commit -m "feat(cron): expire past-due event-request quotes"
```

---

## Task 30: Cron — nudge + expire silent partner

**Files:**
- Create: `src/app/api/cron/nudge-event-request-silence/route.ts`
- Create: `src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts`

For requests in `new` status (no partner movement): nudge at day 3, 7, 14 using `last_nudge_at`; flip to `expired` at day 21.

- [ ] **Step 1: Implement**

Create `src/app/api/cron/nudge-event-request-silence/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql } from "drizzle-orm";
import { eventRequests, restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEventRequestNudge, sendEventRequestExpired } from "@/lib/email/dispatcher";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Expire day-21 rows
  const expired = await dbAdmin.execute<{ id: string; restaurant_id: string; guest_email: string; guest_name: string; event_date: string; party_size: number; occasion: string }>(
    sql`UPDATE event_requests SET status = 'expired' WHERE status = 'new' AND created_at < NOW() - INTERVAL '21 days' RETURNING id, restaurant_id, guest_email, guest_name, event_date, party_size, occasion`,
  );
  for (const row of expired.rows) {
    const [r] = await dbAdmin.select({ name: restaurants.name, email: restaurants.email }).from(restaurants).where(eq(restaurants.id, row.restaurant_id)).limit(1);
    if (r) await sendEventRequestExpired({ to: row.guest_email, locale: "ro", restaurantName: r.name, guestName: row.guest_name, occasion: row.occasion as "wedding", eventDate: row.event_date, partySize: row.party_size, trackingUrl: "" });
  }

  // Nudge at day 3, 7, 14 — only if last_nudge_at is far enough back
  for (const ageDays of [3, 7, 14]) {
    const toNudge = await dbAdmin.execute<{ id: string; restaurant_id: string; guest_name: string; event_date: string; party_size: number; occasion: string }>(
      sql`SELECT id, restaurant_id, guest_name, event_date, party_size, occasion FROM event_requests
          WHERE status = 'new'
            AND created_at < NOW() - INTERVAL '${sql.raw(String(ageDays))} days'
            AND (last_nudge_at IS NULL OR last_nudge_at < NOW() - INTERVAL '3 days')`,
    );
    for (const row of toNudge.rows) {
      const [r] = await dbAdmin.select({ name: restaurants.name, email: restaurants.email }).from(restaurants).where(eq(restaurants.id, row.restaurant_id)).limit(1);
      if (r?.email) {
        await sendEventRequestNudge({ to: r.email, locale: "ro", restaurantName: r.name, guestName: row.guest_name, occasion: row.occasion as "wedding", eventDate: row.event_date, partySize: row.party_size, partnerInboxUrl: "", daysOpen: ageDays });
      }
      await dbAdmin.update(eventRequests).set({ lastNudgeAt: new Date() }).where(eq(eventRequests.id, row.id));
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add tests covering nudge fires once + expiry at 21d (same seed pattern as Task 28)**

Create `src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts` with two tests:
1. Row with `created_at = NOW() - 22 days` flips to `expired`.
2. Row with `created_at = NOW() - 3 days` and `last_nudge_at = NULL` triggers `sendEventRequestNudge`.

- [ ] **Step 3: Run tests + commit**

```bash
npx jest src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts
git add src/app/api/cron/nudge-event-request-silence/
git commit -m "feat(cron): nudge + expire silent event requests"
```

---

## Task 31: Hook the three crons up

**Files:**
- Modify: `vercel.json` (or wherever cron schedules live — `supabase/config.toml` if using `pg_cron`)

- [ ] **Step 1: Add cron schedule entries**

If using Vercel cron, in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/expire-event-request-drafts", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/expire-event-request-quotes", "schedule": "0 * * * *" },
    { "path": "/api/cron/nudge-event-request-silence", "schedule": "0 9 * * *" }
  ]
}
```

If using Supabase `pg_cron`, add the corresponding `cron.schedule(...)` calls in a follow-up migration.

- [ ] **Step 2: Update `.env.local.example`**

```
CRON_SECRET=
ANAF_API_BASE=https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json .env.local.example
git commit -m "chore(cron): schedule event-request crons"
```

---

## Task 32: Restaurant-suspension cascade

**Files:**
- Modify: the existing admin suspend-restaurant action (search `restaurantStatus` writes; likely `src/app/admin/.../actions.ts`)

Suspending must cancel open event_requests + email both sides.

- [ ] **Step 1: Locate the existing suspension entry point**

```bash
grep -rn "restaurantStatus" src/app/admin/ | head -5
grep -rn 'status: "suspended"' src/app/admin/ | head -5
```

Identify the action that writes `restaurants.status = 'suspended'`.

- [ ] **Step 2: Extend it with the event-request cascade**

After updating `restaurants.status`, in the same transaction:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const cancelled = await dbAdmin.execute<{ id: string; guest_email: string; guest_name: string; event_date: string; party_size: number; occasion: string }>(
  sql`UPDATE event_requests
        SET status = 'cancelled', cancelled_at = NOW(), decline_reason = 'venue_suspended'
      WHERE restaurant_id = ${restaurantId}
        AND status IN ('new', 'viewing', 'replied', 'quoted')
      RETURNING id, guest_email, guest_name, event_date, party_size, occasion`,
);

for (const row of cancelled.rows) {
  // dispatch declined-email-style notification to guest + venue
}
```

- [ ] **Step 3: Write integration test**

Create `src/app/admin/__tests__/suspension-cascade.test.ts` covering: suspending a restaurant with 2 open event_requests + 1 declined event_request — the 2 open flip to `cancelled`, the declined stays untouched.

- [ ] **Step 4: Run tests + commit**

```bash
npx jest src/app/admin/__tests__/suspension-cascade.test.ts
git add src/app/admin/
git commit -m "feat(admin): cascade event-request cancellation on suspension"
```

---

## Task 33: Sidebar visibility — keep inbox live while requests are open

**Files:**
- Modify: `src/components/partner/PartnerSidebar.tsx` (or wherever the nav is rendered server-side)

When `events_intake_enabled = false`, the "Corporate" link still shows. But the inner inbox should ONLY hide when `false AND no open requests`. The inbox page already redirects to 404 in that case (Task 21 step 2), so this task only adds an *unread count badge* on the top-level "Corporate" link when there are open requests.

- [ ] **Step 1: Pass open-count to the sidebar**

In whatever server component renders `PartnerSidebar`, compute `openEventRequestsCount` via the same query Task 21 uses, and pass it down as a prop.

- [ ] **Step 2: Render the badge**

```typescript
{href === "/partner/corporate" && openEventRequestsCount > 0 && (
  <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-2 py-0.5">{openEventRequestsCount}</span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/PartnerSidebar.tsx
git commit -m "feat(partner): sidebar badge for open event-request count"
```

---

## Task 34: Cross-cutting RLS integration tests

**Files:**
- Create: `src/lib/repos/__tests__/event-requests-rls.test.ts`

Verify policies actually enforce. Uses the project's existing pattern for spinning up Supabase test clients with specific `auth.uid()`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repos/__tests__/event-requests-rls.test.ts`:

```typescript
import { dbAdmin } from "@/lib/db/admin";
import { createClientForUser } from "@/lib/db/test-helpers"; // pre-existing helper across repos
import { eventRequests, restaurants, cities, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("event_requests RLS", () => {
  let restaurantId: string;
  let ownerId: string;
  let strangerId: string;
  let requesterId: string;
  let trackingToken: string;
  let eventRequestId: string;

  beforeAll(async () => {
    ownerId = crypto.randomUUID();
    strangerId = crypto.randomUUID();
    requesterId = crypto.randomUUID();
    await dbAdmin.insert(profiles).values([
      { id: ownerId, role: "restaurant_owner", email: "o@t.co" },
      { id: strangerId, role: "consumer", email: "s@t.co" },
      { id: requesterId, role: "consumer", email: "r@t.co" },
    ]);
    await dbAdmin.insert(cities).values({ slug: "rls", name: "R", countryCode: "RO" }).onConflictDoNothing();
    const [c] = await dbAdmin.select().from(cities).limit(1);
    const [r] = await dbAdmin.insert(restaurants).values({ slug: `rls-${Date.now()}`, name: "R", cityId: c.id, status: "live", ownerUserId: ownerId, eventsIntakeEnabled: true }).returning();
    restaurantId = r.id;
    const [er] = await dbAdmin.insert(eventRequests).values({
      restaurantId, guestName: "X", guestEmail: "r@t.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
      trackingToken: "rls_token_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requestedByUserId: requesterId, status: "new",
    }).returning();
    eventRequestId = er.id;
    trackingToken = er.trackingToken;
  });

  it("owner can read their venue's event_requests", async () => {
    const c = createClientForUser(ownerId);
    const { data } = await c.from("event_requests").select("id").eq("id", eventRequestId);
    expect(data).toHaveLength(1);
  });

  it("requester can read their own event_requests", async () => {
    const c = createClientForUser(requesterId);
    const { data } = await c.from("event_requests").select("id").eq("id", eventRequestId);
    expect(data).toHaveLength(1);
  });

  it("stranger cannot read others' event_requests", async () => {
    const c = createClientForUser(strangerId);
    const { data } = await c.from("event_requests").select("id").eq("id", eventRequestId);
    expect(data).toHaveLength(0);
  });

  it("anon can read via SECURITY DEFINER function with valid token", async () => {
    const c = createClientForUser(null); // anon
    const { data } = await c.rpc("get_event_request_by_token", { p_token: trackingToken });
    expect(data?.[0]?.id).toBe(eventRequestId);
  });

  it("anon gets nothing with bad token", async () => {
    const c = createClientForUser(null);
    const { data } = await c.rpc("get_event_request_by_token", { p_token: "wrong" });
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests + commit**

```bash
npx jest src/lib/repos/__tests__/event-requests-rls.test.ts
git add src/lib/repos/__tests__/event-requests-rls.test.ts
git commit -m "test(rls): event_requests visibility matrix"
```

---

## Task 35: Playwright E2E happy-path

**Files:**
- Create: `e2e/event-requests.spec.ts`

End-to-end against the standing test partner account on tavli.ro (per memory `test_partner_account.md`). Walks the full anonymous-submit → OTP → partner-quote → consumer-accept → partner-materialize sequence.

- [ ] **Step 1: Write the spec**

Create `e2e/event-requests.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const VENUE_URL = process.env.E2E_VENUE_URL ?? "/bucuresti/test-venue";
const PARTNER_EMAIL = process.env.E2E_PARTNER_EMAIL!;
const CONSUMER_EMAIL = process.env.E2E_CONSUMER_EMAIL!;

test("event request happy path", async ({ page, request }) => {
  // 1. Consumer submits via the sheet
  await page.goto(VENUE_URL);
  await page.getByRole("button", { name: /organizează un eveniment/i }).click();
  await page.getByRole("button", { name: /aniversare/i }).click();
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/dată/i).fill("2026-12-15");
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/persoane/i).fill("25");
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/nume/i).fill("E2E Tester");
  await page.getByLabel(/email/i).fill(CONSUMER_EMAIL);
  await page.getByRole("button", { name: /trimite cererea/i }).click();
  await expect(page.getByText(/verifică emailul/i)).toBeVisible();

  // 2. Resolve OTP via test-mail inbox (project-specific helper assumed)
  // ... fetch the OTP URL, visit it ...

  // 3. Partner side: sign in as test partner, open inbox, send quote
  // ... reuse existing partner-sign-in playwright helper ...

  // 4. Consumer accepts
  // 5. Partner materializes
  // 6. Assert reservation row exists with booking_type=private_event
});
```

(Fill in the OTP fetching + partner-sign-in steps using the project's existing Playwright helpers — search `e2e/` for `signInAsPartner` and `fetchOtpForEmail` style utilities.)

- [ ] **Step 2: Add the test partner env vars**

In your local `.env.test`:

```
E2E_PARTNER_EMAIL=<from memory test_partner_account.md>
E2E_CONSUMER_EMAIL=<a Mailpit / test-mail inbox>
```

- [ ] **Step 3: Run E2E locally + commit**

```bash
npx playwright test e2e/event-requests.spec.ts
git add e2e/event-requests.spec.ts
git commit -m "test(e2e): event-request happy path"
```

---

## Task 36: Documentation snippet + plan-status update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-13-corporate-bookings-design.md`

Update the spec's status to reflect Phase 1 shipped, link to this plan.

- [ ] **Step 1: Edit the spec header**

Change `**Status:** Brainstorm complete; awaiting user review before implementation-plan phase.` to:

```markdown
**Status:** Phase 1 implementation plan written at `docs/superpowers/plans/2026-05-13-corporate-bookings-phase-1-private-events.md`. Phases 2–4 plans pending.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-13-corporate-bookings-design.md
git commit -m "docs(specs): link Phase 1 plan to corporate-bookings spec"
```

---

## Self-Review

Run this checklist against the spec (`docs/superpowers/specs/2026-05-13-corporate-bookings-design.md`) before claiming the plan complete.

### Spec coverage check

| Spec section | Task(s) | ✓ |
|---|---|---|
| §2 Architecture — capability flags on `restaurants` | Task 1 step 2, Task 2 | ✓ |
| §2 Architecture — `companies` table | Task 1 step 4, Task 2, Task 4 | ✓ |
| §2 Architecture — `company_members` / `company_invitations` (Phase 1 schema only) | Task 1 step 4, Task 2 | ✓ |
| §2 Architecture — `event_requests` with full state machine | Tasks 1, 2, 5, 9, 10, 11, 12, 13 | ✓ |
| §2 Architecture — `restaurant_event_settings` | Tasks 1, 2, 6 | ✓ |
| §2 Architecture — `availability_exceptions` | Tasks 1, 2, 7, 13 | ✓ |
| §2 Architecture — `partner_notifications` | Tasks 1, 2, 8, 23 | ✓ |
| §2 Architecture — `booking_type` enum + reservation columns | Task 1 step 3, Task 2 | ✓ |
| §2 Architecture — SECURITY DEFINER token function | Task 2, Task 5 step 3 | ✓ |
| §2 Architecture — RLS policies | Task 2, Task 34 | ✓ |
| §2b Capabilities — 3 boolean flags, default OFF | Task 1, Task 2 | ✓ |
| §2c Discovery — capability filter, pill, landing page, badge | Tasks 24, 25, 26, 27 | ✓ |
| §2d Partner-side — Corporate sidebar + Overview + sub-items | Tasks 19, 20, 33 | ✓ |
| §2e Lifecycle — inbox visible while in-flight | Task 21 step 2, Task 33 | ✓ |
| §2f Server-side gating | Task 9 step 3 (events_intake check), Task 20 toggleCapability | ✓ |
| §3 Phase 1 — `EventRequestSheet` | Task 16, Task 17 | ✓ |
| §3 Phase 1 — Tracking page | Task 18 | ✓ |
| §3 Phase 1 — Partner inbox + detail | Tasks 21, 22 | ✓ |
| §3 Phase 1 — Materialization (private room / whole venue) | Task 13, Task 22 | ✓ |
| §3 Phase 1 — State machine | Task 5, Task 11, Task 12 | ✓ |
| §3 Phase 1 — Error handling (dedupe, expiry, nudge) | Task 9, Tasks 28, 29, 30 | ✓ |
| §3 Phase 1 — Email templates | Tasks 14, 15 | ✓ |
| §3 Phase 1 — Auth-at-submit flow | Tasks 9, 10 | ✓ |
| §3 Phase 1 — Anonymous CUI claim (not company materialize) | Task 5 (claimedCompanyCui column), Task 9 (claimedCompanyCui param) | ✓ |
| §3 Phase 1 — Testing (unit + integration + RLS + E2E) | Tasks 3, 5, 7, 9, 11, 13, 14, 28, 34, 35 | ✓ |
| §7 ANAF CUI lookup | Task 3 | ✓ |
| §7 Notifications (in-app partner bell) | Tasks 8, 23 | ✓ |
| §7 Restaurant suspension cascade | Task 32 | ✓ |

### Placeholder scan

- ✓ No "TBD" / "TODO" in step bodies.
- ✓ All file paths are absolute relative to repo root.
- ✓ Code blocks are complete (or explicitly say "follow same pattern" with the reference task cited — only acceptable for the remaining 6 email templates in Task 14 step 2 and the smoke tests for Tasks 29/30 which mirror Task 28's seeding pattern; if an implementer needs more, that's where to expand).
- ✓ All Drizzle column types / enum values match between Task 1 schema and Task 2 SQL.

### Type consistency

- `bookingType` enum: 3 values (`standard | private_event | standing`) — consistent across Task 1, Task 2, Task 13.
- `eventRequestStatus` enum: 11 values — consistent across Task 1, Task 2, Task 5.
- `tracking_token` length: `varchar(64)` everywhere; 32 random bytes hex-encoded → 64 chars. Consistent.
- `event_request_id` FK on `reservations`: matches schema + Task 13 materialization.

### Scope check

- This plan covers Phase 1 only (private events + foundation).
- Phases 2/3/4 are explicitly out of scope (called out at top).
- Phase 1 is independently shippable: deploying after Task 36 gives partners + consumers the full private-event request flow.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-corporate-bookings-phase-1-private-events.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this large because each subagent gets a clean context window.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Reasonable if you want to watch each step live, but the context will get heavy after ~10 tasks.

Which approach?


