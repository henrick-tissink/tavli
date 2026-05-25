/**
 * Drizzle schema for Tavli Phase 2.
 *
 * DESCRIPTIVE-ONLY (audit #16): this file documents the live schema for
 * type-safe queries; it is NOT the migration source of truth. `drizzle-kit
 * generate` is BANNED (meta snapshots frozen at 0028) — hand-author SQL in
 * drizzle/migrations/ and keep this file in sync. See AGENTS.md > Migrations.
 *
 * Conventions:
 * - All tables live in the `public` schema.
 * - `auth.users` is managed by Supabase; we reference it via a declared
 *   foreign schema so FKs type-check.
 * - `profiles.id` is 1:1 with `auth.users.id`; everything user-owned
 *   hangs off `profiles`.
 * - `menu_items.restaurant_id` is denormalised so RLS policies stay
 *   single-subquery (see plan — cross-tenant trigger enforces integrity).
 */

import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgSchema,
  pgTable,
  boolean,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
  date,
  time,
  uniqueIndex,
  index,
  primaryKey,
  char,
  check,
  inet,
} from "drizzle-orm/pg-core";

// ─── Supabase-managed auth.users reference ──────────────────────────────
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ─── Enums ──────────────────────────────────────────────────────────────
export const userRole = pgEnum("user_role", [
  "admin",
  "restaurant_owner",
  "consumer",
]);

export const restaurantStatus = pgEnum("restaurant_status", [
  "draft",
  "pending_review",
  "live",
  "suspended",
]);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "claimed",
  "expired",
  "revoked",
]);

export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
  "seated",
  "completed",
  "no_show",
]);

export const photoKind = pgEnum("photo_kind", [
  "hero",
  "gallery",
  "dish",
  "venue",
]);

export const dietaryTag = pgEnum("dietary_tag", [
  "vegetarian",
  "vegan",
  "gluten_free",
  "spicy",
  "chef_pick",
  "popular",
]);

export const currencyCode = pgEnum("currency_code", ["lei", "TRY", "EUR"]);

export const corporateClientStatus = pgEnum("corporate_client_status", [
  "pending_verification",
  "active",
  "suspended",
]);

export const corporateClientMemberRole = pgEnum("corporate_client_member_role", [
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

export const orgRole = pgEnum("org_role", ["owner", "admin", "manager"]);

export const venueStaffRole = pgEnum("venue_staff_role", [
  "owner",
  "manager",
  "host",
]);

export const orgCustomerType = pgEnum("org_customer_type", [
  "business",
  "personal",
]);

// §12 Billing enums (Wave 5 sub-unit B).
export const subscriptionTier = pgEnum("subscription_tier", ["base", "pro"]);
export const billingFrequency = pgEnum("billing_frequency", ["monthly", "annual"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "unpaid",
  "incomplete",
]);
export const subscriptionItemKind = pgEnum("subscription_item_kind", [
  "base_tier",
  "extra_location",
  "sms_overage",
  "whatsapp_overage",
]);

export const staffInvitationKind = pgEnum("staff_invitation_kind", [
  "org",
  "restaurant",
]);

export const staffInvitationStatus = pgEnum("staff_invitation_status", [
  "pending",
  "claimed",
  "expired",
  "revoked",
]);

export const orgStatus = pgEnum("org_status", [
  "pending_verification",
  "active",
  "suspended",
]);

// §08 Table management enums
export const tableStatus = pgEnum("table_status", [
  "free",
  "booked",
  "seated",
  "paying",
  "dirty",
  "combined",
  "blocked",
]);

export const tableShape = pgEnum("table_shape", [
  "round",
  "square",
  "rect_2x4",
  "rect_2x6",
  "rect_2x8",
  "banquette",
  "bar_stool",
  "high_top",
  "patio",
]);

export const walkinQueueStatus = pgEnum("walkin_queue_status", [
  "waiting",
  "called",
  "seated",
  "left",
  "no_show",
]);

// ─── profiles (extends auth.users 1:1) ───────────────────────────────────
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: userRole("role").notNull().default("consumer"),
  fullName: text("full_name"),
  email: text("email"),
  locale: varchar("locale", { length: 5 }).notNull().default("ro"),
  defaultOrganizationId: uuid("default_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("profiles_role_idx").on(t.role),
]);

// ─── cities ─────────────────────────────────────────────────────────────
export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  defaultLat: numeric("default_lat", { precision: 9, scale: 6 }),
  defaultLng: numeric("default_lng", { precision: 9, scale: 6 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── restaurants ────────────────────────────────────────────────────────
// Flattens the demo's Restaurant + RestaurantDetail into a single row.
// `schedule` is JSONB for Phase 2 simplicity; Phase 3 can promote to a table.
export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 120 }).notNull(),
  name: text("name").notNull(),
  cuisines: text("cuisines").array().notNull().default([]).$type<string[]>(),
  cityId: uuid("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "restrict" }),
  zone: varchar("zone", { length: 80 }),
  priceLevel: smallint("price_level").notNull().default(2),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  description: text("description"),
  heroNote: text("hero_note"),
  address: text("address"),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 255 }),
  websiteUrl: text("website_url"),
  tags: text("tags").array().notNull().default([]).$type<string[]>(),
  status: restaurantStatus("status").notNull().default("draft"),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  voteCount: integer("vote_count").notNull().default(0),
  photoCount: integer("photo_count").notNull().default(0),
  schedule: jsonb("schedule").$type<ScheduleEntry[]>().notNull().default([]),
  eventsIntakeEnabled: boolean("events_intake_enabled").notNull().default(false),
  acceptsCorporateMeals: boolean("accepts_corporate_meals").notNull().default(false),
  acceptsStanding: boolean("accepts_standing").notNull().default(false),
  proPlanActive: boolean("pro_plan_active").notNull().default(false),
  transactionalSmsEnabled: boolean("transactional_sms_enabled").notNull().default(false),
  // §02 §6 — opt-in auto-mark-no-show (migration 0056).
  autoNoShow: boolean("auto_no_show").notNull().default(false),
  // §07 — IANA timezone for venue-local analytics date math (business_date,
  // retention windows, nightly-job scheduling). All v1 venues are Bucharest;
  // forward-compatible for expansion. Added Wave 6 (migration 0042).
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Bucharest"),
  // audit #8 — turn-time occupancy (minutes). A reservation occupies
  // [start, start+turn); the capacity trigger sums party_size over overlapping
  // windows. Added migration 0049. Default 90.
  turnTimeMinutes: smallint("turn_time_minutes").notNull().default(90),
  // §09 §4.1a — soft-delete marker. archived_at IS NULL = live venue. This is
  // the canonical "is this venue active" check across all domains.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("restaurants_city_slug_unique").on(t.cityId, t.slug),
  index("restaurants_status_idx").on(t.status),
  index("restaurants_city_status_idx").on(t.cityId, t.status),
  index("restaurants_organization_idx").on(t.organizationId),
]);

export interface ScheduleEntry {
  days: string; // "Mon–Fri", "Sat–Sun"
  hours: string; // "12:00 – 23:00"
}

// ─── restaurant_photos ──────────────────────────────────────────────────
export const restaurantPhotos = pgTable("restaurant_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  kind: photoKind("kind").notNull().default("gallery"),
  sortOrder: integer("sort_order").notNull().default(0),
  altText: text("alt_text"),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("restaurant_photos_restaurant_sort_idx").on(t.restaurantId, t.sortOrder),
]);

// ─── menus ──────────────────────────────────────────────────────────────
// 1:1 with restaurants — PK is restaurantId.
export const menus = pgTable("menus", {
  restaurantId: uuid("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  currency: currencyCode("currency").notNull().default("lei"),
  heroNote: text("hero_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── menu_sections ──────────────────────────────────────────────────────
export const menuSections = pgTable("menu_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  intro: text("intro"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("menu_sections_restaurant_sort_idx").on(t.restaurantId, t.sortOrder),
]);

// ─── menu_items ─────────────────────────────────────────────────────────
export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => menuSections.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id") // denormalized for RLS single-subquery
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  currency: currencyCode("currency").notNull().default("lei"),
  photoStoragePath: text("photo_storage_path"),
  dietaryTags: dietaryTag("dietary_tags").array().notNull().default([]).$type<Array<"vegetarian" | "vegan" | "gluten_free" | "spicy" | "chef_pick" | "popular">>(),
  isChefPick: boolean("is_chef_pick").notNull().default(false),
  isAvailable: boolean("is_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("menu_items_restaurant_idx").on(t.restaurantId),
  index("menu_items_section_sort_idx").on(t.sectionId, t.sortOrder),
]);

// ─── invitations ────────────────────────────────────────────────────────
// `token_hash` = sha256 of the opaque token sent in email; raw token is
// never stored.
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, {
    onDelete: "set null",
  }),
  cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
  proposedName: text("proposed_name"),
  status: invitationStatus("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  invitedByUserId: uuid("invited_by_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invitations_email_status_idx").on(t.email, t.status),
  index("invitations_restaurant_idx").on(t.restaurantId),
]);

// ─── restaurant_availability ────────────────────────────────────────────
// Per-weekday capacity rules. Simpler than real table inventory; enough
// for Phase 2 beta.
export const restaurantAvailability = pgTable("restaurant_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(), // 0=Sun..6=Sat
  slotStart: time("slot_start").notNull(),
  slotEnd: time("slot_end").notNull(),
  capacity: integer("capacity").notNull(), // total covers per slot
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("availability_restaurant_day_idx").on(t.restaurantId, t.dayOfWeek),
]);

// ─── reservations ───────────────────────────────────────────────────────
// Guest-based (no consumer auth required for Phase 2). `confirmation_token`
// lets the consumer cancel via email link.
export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  guestName: text("guest_name").notNull(),
  guestPhone: varchar("guest_phone", { length: 32 }).notNull(),
  guestEmail: varchar("guest_email", { length: 255 }),
  partySize: smallint("party_size").notNull(),
  reservationDate: date("reservation_date").notNull(),
  reservationTime: time("reservation_time").notNull(),
  zone: varchar("zone", { length: 60 }),
  notes: text("notes"),
  status: reservationStatus("status").notNull().default("confirmed"),
  confirmationToken: varchar("confirmation_token", { length: 64 })
    .notNull()
    .unique(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledReason: text("cancelled_reason"),
  bookingType: bookingType("booking_type").notNull().default("standard"),
  corporateClientId: uuid("corporate_client_id").references(() => corporateClients.id, { onDelete: "set null" }),
  bookedByUserId: uuid("booked_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  eventRequestId: uuid("event_request_id").references(() => eventRequests.id, { onDelete: "set null" }),
  dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  postVisitEmailSentAt: timestamp("post_visit_email_sent_at", {
    withTimezone: true,
  }),
  // §02 §6 — 24h reminder double-fire guard (migration 0055).
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  // §08 Table assignment columns. FK constraints live in the DB (migration
  // 0035); omitting .references() here breaks the circular type-inference
  // cycle between reservations ↔ restaurant_tables ↔ table_combinations.
  tableId: uuid("table_id"),
  combinationId: uuid("combination_id"),
  autoAssigned: boolean("auto_assigned").notNull().default(false),
  // §11 Wave 7 — marketing attribution. Column owned here (§02 never added it);
  // FK → marketing_campaigns added in migration 0043 (no .references() to avoid
  // a circular type-inference cycle with the later marketing tables).
  campaignId: uuid("campaign_id"),
  // §14 Wave 8 — migration-import provenance for rollback. Owned by §02 per doc;
  // added in 0044. FK → migration_imports added in SQL (table defined later).
  migrationImportId: uuid("migration_import_id"),
}, (t) => [
  index("reservations_restaurant_date_idx").on(
    t.restaurantId,
    t.reservationDate,
    t.reservationTime,
  ),
  index("reservations_status_idx").on(t.status),
  index("reservations_diner").on(t.dinerId),
  index("reservations_redacted_at_idx").on(t.redactedAt).where(sql`${t.redactedAt} IS NOT NULL`),
  index("reservations_table").on(t.tableId).where(sql`${t.tableId} IS NOT NULL`),
  index("reservations_combination").on(t.combinationId).where(sql`${t.combinationId} IS NOT NULL`),
]);

// ─── draft_restaurants (onboarding scratchpad) ──────────────────────────
// Autosave target during the onboarding wizard so partial progress doesn't
// pollute the live `restaurants` table.
export const draftRestaurants = pgTable("draft_restaurants", {
  ownerUserId: uuid("owner_user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  invitationId: uuid("invitation_id").references(() => invitations.id, {
    onDelete: "set null",
  }),
  currentStep: varchar("current_step", { length: 32 })
    .notNull()
    .default("profile"),
  payload: jsonb("payload").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── reviews ────────────────────────────────────────────────────────────
// Verified-reservation reviews: each row is anchored to a real reservation
// via a UNIQUE FK, so a reservation can produce at most one review and the
// review carries cryptographic provenance through the confirmation token
// flow. Aggregate rating + vote_count on `restaurants` are kept current by
// a Postgres AFTER-INSERT trigger (see migration 0006).
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id")
    .notNull()
    .unique()
    .references(() => reservations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  comment: text("comment"),
  firstName: text("first_name").notNull(),
  // Booking context snapshotted at review-create time. The reservations row
  // is owner-only by RLS, so the diner-facing review card can't reach it
  // through a join. Snapshotting keeps reviews self-describing and avoids
  // exposing other reservation columns (guest_name, phone, email) to anon.
  partySize: smallint("party_size").notNull(),
  reservationDate: date("reservation_date").notNull(),
  dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  // ── §06 §3 + §3.5 Wave 4 sub-unit J.1 — reviews polish ─────────────────
  // Aggregate consent: diner opts this review into the restaurant's aggregate
  // rating. The trigger filters on include_in_aggregate_rating=true so opt-out
  // is immediate without recomputing historical rows.
  includeInAggregateRating: boolean("include_in_aggregate_rating")
    .notNull()
    .default(false),
  aggregateConsentAt: timestamp("aggregate_consent_at", { withTimezone: true }),
  // Soft-hide for moderation (DSA notice-and-action). is_hidden=true removes
  // the review from public reads and from the aggregate trigger filter.
  isHidden: boolean("is_hidden").notNull().default(false),
  hiddenReason: varchar("hidden_reason", { length: 60 }),
  hiddenByUserId: uuid("hidden_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  // Optimistic-lock counter incremented on every mutation.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revision: smallint("revision").notNull().default(0),
}, (t) => [
  index("reviews_restaurant_created_idx").on(t.restaurantId, t.createdAt.desc()),
  index("reviews_diner").on(t.dinerId),
  index("reviews_redacted_at_idx").on(t.redactedAt).where(sql`${t.redactedAt} IS NOT NULL`),
  check(
    "reviews_gdpr_takedown_attribution",
    sql`${t.hiddenReason} != 'gdpr_takedown' OR ${t.hiddenByUserId} IS NOT NULL`,
  ),
]);

// ─── review_reports ─────────────────────────────────────────────────────
// DSA notice-and-action: any visitor can file a report against a review.
// Tavli admins uphold (→ review.is_hidden=true) or dismiss. Admin-only read
// policy for v1; partner-side read added when partner review UI ships.
// See migration 0039, §06 §3.3 Wave 4 sub-unit K.1.
export const reviewReports = pgTable("review_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  reporterUserId: uuid("reporter_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  reporterIp: inet("reporter_ip"),
  reason: varchar("reason", { length: 60 }).notNull(),
  details: text("details"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("review_reports_review").on(t.reviewId),
  index("review_reports_status").on(t.status).where(sql`${t.status} = 'pending'`),
]);

// ─── corporate_clients ──────────────────────────────────────────────────
// The corporate buyer's legal entity (the customer placing event/private
// dining requests). Renamed from `companies` in migration 0019 to avoid
// cognitive collision with `organizations` (the restaurant SELLER's legal
// entity introduced in 0013/0014).
export const corporateClients = pgTable("corporate_clients", {
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
  status: corporateClientStatus("status").notNull().default("pending_verification"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByUserId: uuid("verified_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("corporate_clients_status_idx").on(t.status),
]);

// ─── corporate_client_members ───────────────────────────────────────────
export const corporateClientMembers = pgTable("corporate_client_members", {
  corporateClientId: uuid("corporate_client_id").notNull().references(() => corporateClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: corporateClientMemberRole("role").notNull().default("booker"),
  budgetMonthlyCents: integer("budget_monthly_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.corporateClientId, t.userId] }),
  index("corporate_client_members_user_idx").on(t.userId),
]);

// ─── corporate_client_invitations ───────────────────────────────────────
// Sibling of existing `invitations` (restaurant-ownership specific). Kept
// separate because the domains are different and a generic table would
// muddy semantics.
export const corporateClientInvitations = pgTable("corporate_client_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  corporateClientId: uuid("corporate_client_id").notNull().references(() => corporateClients.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: corporateClientMemberRole("role").notNull().default("booker"),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: invitationStatus("status").notNull().default("pending"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("corporate_client_invitations_corporate_client_idx").on(t.corporateClientId),
  index("corporate_client_invitations_email_status_idx").on(t.email, t.status),
]);

// ─── event_requests ─────────────────────────────────────────────────────
// Phase 1 negotiation object. Separate from `reservations` because the
// shape of a quote/decline/thread negotiation differs from a confirmed
// booking. On acceptance the partner materializes one or more reservation
// rows referencing back via `event_request_id`.
export const eventRequests = pgTable("event_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  corporateClientId: uuid("corporate_client_id").references(() => corporateClients.id, { onDelete: "set null" }),
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
  privateSpaceId: uuid("private_space_id").references(() => restaurantPrivateSpaces.id, { onDelete: "set null" }),
  // audit #12 — GDPR erasure marker (migration 0047). Set by handleEventRequests.
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("event_requests_restaurant_status_idx").on(t.restaurantId, t.status),
  index("event_requests_status_created_idx").on(t.status, t.createdAt),
  index("event_requests_user_idx").on(t.requestedByUserId),
  index("event_requests_corporate_client_idx").on(t.corporateClientId),
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
  pendingErasureAt: timestamp("pending_erasure_at", { withTimezone: true }),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  pendingErasureRequestId: uuid("pending_erasure_request_id").references(() => dataSubjectRequests.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("partner_notifications_restaurant_unread_idx")
    .on(t.restaurantId, t.createdAt.desc())
    .where(sql`${t.readAt} IS NULL`),
  index("partner_notifications_pending_erasure_request_idx")
    .on(t.pendingErasureRequestId)
    .where(sql`${t.pendingErasureRequestId} IS NOT NULL`),
]);

// ─── restaurant_private_spaces ──────────────────────────────────────────
// Phase 1.5: lightweight rooms catalogue per restaurant. Each row is a
// distinct private space (e.g. "Garden Terrace", "Cellar Room") the
// partner can offer for event requests, with min/max capacity bounds.
export const restaurantPrivateSpaces = pgTable("restaurant_private_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  capacityMin: integer("capacity_min").notNull(),
  capacityMax: integer("capacity_max").notNull(),
  photoStoragePath: text("photo_storage_path"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rps_restaurant_active_idx").on(t.restaurantId).where(sql`${t.isActive} = TRUE`),
]);

// ─── event_request_quote_line_items ─────────────────────────────────────
// Phase 1.5: itemized breakdown of a quote (e.g. food, beverage, room
// rental). Sum should match event_requests.quoted_amount_cents; the app
// layer keeps them in sync.
export const eventRequestQuoteLineItems = pgTable("event_request_quote_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventRequestId: uuid("event_request_id")
    .notNull()
    .references(() => eventRequests.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 160 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("erqli_event_request_idx").on(t.eventRequestId, t.sortOrder),
]);

// ─── webhook_events ─────────────────────────────────────────────────────
// Shared idempotency + audit substrate for inbound webhooks (Resend,
// Twilio, Stripe, Meta WhatsApp). Per foundations §6.6.
//
// `(provider, provider_event_id)` is unique → idempotency via
// onConflictDoNothing.
//
// `processed_at` null = stuck row to retry (sweeper: JOBS.webhook
// .reingestUnprocessed). `process_attempts` capped at 5 by the sweeper
// before manual review.
//
// `signature_verified` is always true today (handler rejects pre-insert
// on signature failure); the column exists for forward-compat with a
// future "log signature failures for forensics" mode.
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  signatureVerified: boolean("signature_verified").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processError: text("process_error"),
  processAttempts: integer("process_attempts").notNull().default(0),
  rawPayload: jsonb("raw_payload").notNull(),
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("webhook_events_idem").on(t.provider, t.providerEventId),
  index("webhook_events_unprocessed")
    .on(t.provider, t.receivedAt)
    .where(sql`${t.processedAt} is null`),
]);

// ─── audit_logs ─────────────────────────────────────────────────────────
// Append-only audit substrate. Per foundations §16.2 + §18 step 14.
//
// `action` is plain text rather than an enum: the typed AUDIT registry in
// src/lib/audit/actions.ts is the runtime contract, and a DB enum would
// force a migration every time a new action is registered.
//
// `actor_role` is plain text for the same reason (the §01 role surface is
// still expanding). `organization_id` has no FK yet — organizations table
// arrives in Wave 2; the FK constraint will be added then.
//
// All writes go through recordAudit() via the service-role client, which
// bypasses RLS. Direct inserts from authenticated/anon are forbidden by
// the RLS policy (no INSERT policy is declared).
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id"),
  actorUserId: uuid("actor_user_id").references(() => profiles.id, { onDelete: "set null" }),
  actorRole: text("actor_role").notNull(),
  impersonatorUserId: uuid("impersonator_user_id").references(() => profiles.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id"),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
}, (t) => [
  index("audit_logs_action_idx").on(t.action, t.createdAt),
  index("audit_logs_subject_idx").on(t.subjectType, t.subjectId),
  index("audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
  index("audit_logs_organization_idx").on(t.organizationId, t.createdAt),
  index("audit_logs_restaurant_idx").on(t.restaurantId, t.createdAt),
  index("audit_logs_created_at_idx").on(t.createdAt),
  index("audit_logs_redacted_at_idx").on(t.redactedAt).where(sql`${t.redactedAt} IS NOT NULL`),
]);

// ─── organizations ──────────────────────────────────────────────────────
// §01 §3.2 — legal entity that owns one or more restaurants. Source of
// truth for billing identity (stripe_customer_id) and one-trial-per-entity
// enforcement (uniqueness on (country_code, tax_id) when tax_id is set).
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  legalName: varchar("legal_name", { length: 300 }),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("RO"),
  taxId: varchar("tax_id", { length: 60 }),
  vatNumber: varchar("vat_number", { length: 60 }),
  registrationNumber: varchar("registration_number", { length: 60 }),
  billingAddress: text("billing_address"),
  billingCity: varchar("billing_city", { length: 100 }),
  billingCountry: varchar("billing_country", { length: 100 }),
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }).notNull(),
  primaryContactPhone: varchar("primary_contact_phone", { length: 60 }),
  locale: varchar("locale", { length: 2 }).notNull().default("ro"),
  status: orgStatus("status").notNull().default("pending_verification"),
  customerType: orgCustomerType("customer_type"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 80 }).unique(),
  // §09 multi-location substrate (Wave 5 sub-unit A).
  maxVenues: integer("max_venues"),
  currentVenueCount: integer("current_venue_count").notNull().default(0),
  brandPrimary: varchar("brand_primary", { length: 7 }),
  brandSecondary: varchar("brand_secondary", { length: 7 }),
  // §12 §4.1a — Tavli-admin grant of a second free trial in good-faith cases.
  reTrialGranted: boolean("re_trial_granted").notNull().default(false),
  // §11 §10.2 — per-org global marketing frequency cap (messages/diner/month).
  marketingFrequencyCapPerMonth: integer("marketing_frequency_cap_per_month").notNull().default(4),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Partial unique index — uniqueness on (country, tax_id) only enforced
  // once tax_id is set, so signup can create orgs in pending_verification
  // before the operator confirms their CUI.
  uniqueIndex("organizations_tax_id_unique")
    .on(t.countryCode, t.taxId)
    .where(sql`${t.taxId} is not null`),
  index("organizations_status_idx").on(t.status),
]);

// ─── organization_members ───────────────────────────────────────────────
// §01 §3.3 — composite PK (organization_id, user_id). Soft-delete via
// is_active flip rather than row DELETE so audit history can still
// resolve actor→org for past mutations.
export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: orgRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  invitedByUserId: uuid("invited_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.userId] }),
  index("organization_members_user_idx")
    .on(t.userId)
    .where(sql`${t.isActive} = true`),
]);

// ─── venue_addition_log ─────────────────────────────────────────────────
// §09 §4.2 — audit-side track of venue add/remove/reactivate for billing
// reconciliation. billing_impact_cents + stripe_subscription_item_id are
// written null in Wave 5 sub-unit A; §12 (sub-unit F) backfills them.
export const venueAdditionLog = pgTable("venue_addition_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(), // 'added' | 'removed' | 'reactivated'
  byUserId: uuid("by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  venueCountAfter: integer("venue_count_after").notNull(),
  billingImpactCents: integer("billing_impact_cents"),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("venue_addition_log_org").on(t.organizationId, t.createdAt.desc()),
]);

// ─── subscriptions (§12 §4.2) ───────────────────────────────────────────
// One row per org; mirrors the Stripe Subscription. Stripe is source of
// truth; this is the read mirror (loadActiveSubscription reads it).
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 80 }).notNull().unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 80 }).notNull(),
  tier: subscriptionTier("tier").notNull(),
  frequency: billingFrequency("frequency").notNull().default("monthly"),
  status: subscriptionStatus("status").notNull(),
  statusSyncedAt: timestamp("status_synced_at", { withTimezone: true }).notNull().defaultNow(),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  trialConversionBlockedAt: timestamp("trial_conversion_blocked_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancellationRequestedByUserId: uuid("cancellation_requested_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  defaultPaymentMethodStripeId: varchar("default_payment_method_stripe_id", { length: 80 }),
  consentEmailSentAt: timestamp("consent_email_sent_at", { withTimezone: true }),
  annualPaidThrough: timestamp("annual_paid_through", { withTimezone: true }),
  pendingFrequencyChange: billingFrequency("pending_frequency_change"),
  pendingFrequencyEffectiveAt: timestamp("pending_frequency_effective_at", { withTimezone: true }),
  pendingFrequencyRequestedAt: timestamp("pending_frequency_requested_at", { withTimezone: true }),
  pendingFrequencyRequestedByUserId: uuid("pending_frequency_requested_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscriptions_org_active").on(t.organizationId)
    .where(sql`status in ('trialing','active','past_due','unpaid')`),
  index("subscriptions_trial_ends").on(t.trialEndsAt).where(sql`status = 'trialing'`),
  index("subscriptions_current_period_end").on(t.currentPeriodEnd).where(sql`status in ('active','past_due')`),
  index("subscriptions_stripe_id").on(t.stripeSubscriptionId),
]);

// ─── subscription_items (§12 §4.3) ──────────────────────────────────────
export const subscriptionItems = pgTable("subscription_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 80 }).notNull().unique(),
  kind: subscriptionItemKind("kind").notNull(),
  stripePriceId: varchar("stripe_price_id", { length: 80 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscription_items_kind_unique").on(t.subscriptionId, t.kind)
    .where(sql`kind in ('base_tier','extra_location')`),
  index("subscription_items_subscription").on(t.subscriptionId),
]);

// ─── invoices (§12 §4.4) ────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 80 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull(),
  amountDueCents: integer("amount_due_cents").notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  taxAmountCents: integer("tax_amount_cents").notNull().default(0),
  currency: char("currency", { length: 3 }).notNull(),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  invoicePdfUrl: text("invoice_pdf_url"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoices_org").on(t.organizationId, t.createdAt.desc()),
  index("invoices_subscription").on(t.subscriptionId, t.createdAt.desc()),
  index("invoices_status").on(t.status),
]);

// ─── payment_methods (§12 §4.5) ─────────────────────────────────────────
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripePaymentMethodId: varchar("stripe_payment_method_id", { length: 80 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull(),
  cardBrand: varchar("card_brand", { length: 20 }),
  cardLast4: varchar("card_last4", { length: 4 }),
  cardExpMonth: smallint("card_exp_month"),
  cardExpYear: smallint("card_exp_year"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
}, (t) => [
  index("payment_methods_org").on(t.organizationId).where(sql`detached_at is null`),
]);

// ─── billing_audit_log (§12 §4.6) ───────────────────────────────────────
// Two-column org id: organization_id (FK, set-null on org delete, survives
// 7-yr fiscal retention) + organization_id_at_event (immutable snapshot for
// ANPC/forensic queries). Service-role inserts; created here, written by W5-C+.
export const billingAuditLog = pgTable("billing_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  organizationIdAtEvent: uuid("organization_id_at_event").notNull(),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  actorUserId: uuid("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  context: jsonb("context").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("billing_audit_log_org").on(t.organizationId, t.occurredAt.desc()),
  index("billing_audit_log_type").on(t.eventType, t.occurredAt.desc()),
]);

// ─── restaurant_staff ───────────────────────────────────────────────────
// §01 §3.4 — composite PK (restaurant_id, user_id). Same soft-delete
// policy as organization_members.
export const restaurantStaff = pgTable("restaurant_staff", {
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: venueStaffRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  invitedByUserId: uuid("invited_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
}, (t) => [
  primaryKey({ columns: [t.restaurantId, t.userId] }),
  index("restaurant_staff_user_idx")
    .on(t.userId)
    .where(sql`${t.isActive} = true`),
  index("restaurant_staff_restaurant_idx")
    .on(t.restaurantId)
    .where(sql`${t.isActive} = true`),
]);

// ─── staff_invitations ──────────────────────────────────────────────────
// §01 §3.5 — org-level or venue-level staff invitations. Check constraint
// ensures exactly one of (organization_id, restaurant_id) is set per
// `kind`. RLS pattern (post-sub-unit-A): narrow SELECT for inviter +
// invitee + Tavli admin; mutations via service-role helpers (no policy).
// token_hash is varchar(64) (hex-encoded sha256) matching the existing
// `invitations` table convention.
export const staffInvitations = pgTable("staff_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: staffInvitationKind("kind").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, {
    onDelete: "cascade",
  }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: staffInvitationStatus("status").notNull().default("pending"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByUserId: uuid("claimed_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("staff_invitations_email_status_idx")
    .on(t.email, t.status)
    .where(sql`${t.status} = 'pending'`),
  index("staff_invitations_org_idx")
    .on(t.organizationId)
    .where(sql`${t.status} = 'pending'`),
  index("staff_invitations_restaurant_idx")
    .on(t.restaurantId)
    .where(sql`${t.status} = 'pending'`),
]);

// ─── mfa_recovery_codes ─────────────────────────────────────────────────
// §01 §5a.2 phase 2 — TOTP recovery codes. One row per code; codes are
// stored as sha-256 hashes (hex-encoded, 64 chars). RLS pattern: narrow
// SELECT for self; writes via service-role.
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    userActive: index("idx_mfa_recovery_codes_user_active").on(
      t.userId,
      t.consumedAt,
    ),
  }),
);

// ─── diners ─────────────────────────────────────────────────────────────
// §03 §4.1 — org-scoped diner record. Identity is (organization_id, phone)
// when phone is set; otherwise (organization_id, lower(email)). Partial
// unique indices include `WHERE redacted_at IS NULL` so pseudonymised rows
// don't block new diners with the same contact info from being created.
export const dinerAcquisitionSource = pgEnum("diner_acquisition_source", [
  "widget",
  "venue_page",
  "editorial",
  "corporate",
  "walk_in",
  "manual",
  "import",
  "email_campaign",
  "api",
]);

export const diners = pgTable(
  "diners",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 20 }),
    phoneRaw: varchar("phone_raw", { length: 40 }),
    email: varchar("email", { length: 255 }),
    fullName: varchar("full_name", { length: 200 }),
    locale: char("locale", { length: 2 }).notNull().default("ro"),
    allergies: text("allergies").array().notNull().default(sql`'{}'::text[]`),
    occasionTags: text("occasion_tags").array().notNull().default(sql`'{}'::text[]`),
    seatingPreferences: jsonb("seating_preferences").notNull().default(sql`'{}'::jsonb`),
    dietaryPreferences: text("dietary_preferences").array().notNull().default(sql`'{}'::text[]`),
    birthdayDate: date("birthday_date"),
    anniversaryDate: date("anniversary_date"),
    internalNotes: text("internal_notes"),
    // §13 §6.6 / Art 18 — GDPR processing restriction (migration 0057). Driven
    // by the restrict_processing DSR cascade; marketing excludes these diners,
    // operator writes fail TV1104, but reservations still process (Art 18(2)).
    processingRestricted: boolean("processing_restricted").notNull().default(false),
    acquisitionSource: dinerAcquisitionSource("acquisition_source"),
    acquisitionRestaurantId: uuid("acquisition_restaurant_id").references(
      () => restaurants.id,
      { onDelete: "set null" },
    ),
    visitCount: integer("visit_count").notNull().default(0),
    coversTotal: integer("covers_total").notNull().default(0),
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
    frequencyBucket: varchar("frequency_bucket", { length: 20 })
      .notNull()
      .default("first_timer"),
    typicalPartySizeMin: integer("typical_party_size_min"),
    typicalPartySizeMax: integer("typical_party_size_max"),
    noShowCount: integer("no_show_count").notNull().default(0),
    cancellationCount: integer("cancellation_count").notNull().default(0),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    phoneUnique: uniqueIndex("diners_org_phone_unique")
      .on(t.organizationId, t.phone)
      .where(sql`${t.phone} IS NOT NULL AND ${t.redactedAt} IS NULL`),
    emailUnique: uniqueIndex("diners_org_email_unique")
      .on(t.organizationId, sql`lower(${t.email})`)
      .where(
        sql`${t.email} IS NOT NULL AND ${t.phone} IS NULL AND ${t.redactedAt} IS NULL`,
      ),
    fullNameIdx: index("diners_org_full_name").on(
      t.organizationId,
      sql`lower(${t.fullName})`,
    ),
    phoneIdx: index("diners_org_phone").on(t.organizationId, t.phone),
    frequencyIdx: index("diners_frequency")
      .on(t.organizationId, t.frequencyBucket)
      .where(sql`${t.redactedAt} IS NULL`),
    lastVisitedIdx: index("diners_last_visited")
      .on(t.organizationId, sql`${t.lastVisitedAt} DESC`)
      .where(sql`${t.redactedAt} IS NULL`),
    // 0051: redacted (pseudonymised) diners are exempt — erasure nulls phone +
    // email, so a live diner needs an identity but an erased one may have none.
    identityRequiredCheck: check(
      "diners_identity_required",
      sql`${t.phone} IS NOT NULL OR ${t.email} IS NOT NULL OR ${t.redactedAt} IS NOT NULL`,
    ),
  }),
);

// ─── diner_pii_access_log ───────────────────────────────────────────────
// §03 §5.5 / §8.1 — One row per unmasked PII read. Written exclusively
// by the `revealPiiBatch` helper (service-role; no INSERT policy).
// Org members can SELECT their own org's rows; admins see all.
export const dinerPiiAccessLog = pgTable(
  "diner_pii_access_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dinerId: uuid("diner_id")
      .notNull()
      .references(() => diners.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accessedByUserId: uuid("accessed_by_user_id")
      .notNull()
      .references(() => authUsers.id),
    accessedField: varchar("accessed_field", { length: 40 }).notNull(),
    accessKind: varchar("access_kind", { length: 20 }).notNull(),
    surface: varchar("surface", { length: 40 }),
    contextReservationId: uuid("context_reservation_id").references(
      () => reservations.id,
      { onDelete: "set null" },
    ),
    accessedAt: timestamp("accessed_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    dinerIdx: index("diner_pii_access_log_diner").on(
      t.dinerId,
      sql`${t.accessedAt} DESC`,
    ),
    actorIdx: index("diner_pii_access_log_actor").on(
      t.accessedByUserId,
      sql`${t.accessedAt} DESC`,
    ),
  }),
);

// ─── erasure_log ────────────────────────────────────────────────────────
// foundations §15a.1 — Append-only GDPR erasure log. One row per
// pseudonymisation / DSAR erasure / auto-purge run. Service-role writes
// only (no INSERT/UPDATE/DELETE policies); admins read all rows, org
// owners read their org's rows.
export const erasureLog = pgTable(
  "erasure_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    subjectType: varchar("subject_type", { length: 40 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    reason: varchar("reason", { length: 80 }).notNull(),
    redactedColumns: text("redacted_columns")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    impersonatorUserId: uuid("impersonator_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" },
    ),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    subjectIdx: index("erasure_log_subject").on(t.subjectType, t.subjectId),
    actorIdx: index("erasure_log_actor").on(
      t.actorUserId,
      sql`${t.createdAt} DESC`,
    ),
    createdIdx: index("erasure_log_created").on(sql`${t.createdAt} DESC`),
  }),
);

// ─── marketing_consents ─────────────────────────────────────────────────
// foundations §4.7 — Per-(diner, channel) marketing/transactional consent
// state. Most recent revoked_at wins. Diner cascade-deletes its consents.
export const marketingConsents = pgTable(
  "marketing_consents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dinerId: uuid("diner_id")
      .notNull()
      .references(() => diners.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 30 }).notNull(),
    consentGiven: boolean("consent_given").notNull(),
    source: varchar("source", { length: 40 }).notNull(),
    givenAt: timestamp("given_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    // §11 Wave 7 — legal-provenance columns (ANPC/GDPR demonstrability). Nullable;
    // populated when marketing consent is captured via recordConsent.
    sourceSurfaceUrl: text("source_surface_url"),
    sourceIp: inet("source_ip"),
    consentCopyShown: text("consent_copy_shown"),
    consentLocale: char("consent_locale", { length: 2 }),
  },
  (t) => ({
    dinerChannelIdx: index("marketing_consents_diner_channel").on(
      t.dinerId,
      t.channel,
      sql`${t.givenAt} DESC`,
    ),
    // 0050: at most one ACTIVE (not-yet-revoked) consent per (org, diner,
    // channel). History rows carry revoked_at and are excluded by the predicate.
    activeUnique: uniqueIndex("marketing_consents_active_unique")
      .on(t.organizationId, t.dinerId, t.channel)
      .where(sql`${t.revokedAt} IS NULL`),
    channelValidCheck: check(
      "marketing_consents_channel_valid",
      sql`${t.channel} IN ('email_marketing', 'sms_marketing', 'whatsapp_marketing', 'sms_transactional', 'email_transactional')`,
    ),
  }),
);

// ─── marketing_suppressions ─────────────────────────────────────────────
// foundations §4.7 — Suppression list. Bounced emails, complained, STOP'd
// SMS, manual unsubscribes. organization_id NULL = global suppression.
// Case-insensitive unique on (channel, lower(identifier)).
export const marketingSuppressions = pgTable(
  "marketing_suppressions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channel: varchar("channel", { length: 20 }).notNull(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    source: varchar("source", { length: 40 }).notNull(),
    reason: text("reason"),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    // §11 Wave 7 — unsuppressed_at set only on diner re-opt-in; source_send_id
    // links the suppression back to the send that triggered it (no .references()
    // here — marketing_sends is defined later; FK added in the migration SQL).
    unsuppressedAt: timestamp("unsuppressed_at", { withTimezone: true }),
    sourceSendId: uuid("source_send_id"),
  },
  (t) => ({
    channelIdUnique: uniqueIndex(
      "marketing_suppressions_channel_id_unique",
    ).on(t.channel, sql`lower(${t.identifier})`),
    channelValidCheck: check(
      "marketing_suppressions_channel_valid",
      sql`${t.channel} IN ('email', 'sms', 'whatsapp')`,
    ),
  }),
);

// ─── transactional_email_log ─────────────────────────────────────────────
// §04 §5.1 — Unified comms log for both email + SMS. `channel` column
// distinguishes; status mutex enforced by CHECK (email rows have
// email_status set + sms_status null; sms rows mirror). organization_id_at_event
// is the immutable owning org at send-time (survives org_id FK nulling).
export const transactionalEmailLog = pgTable(
  "transactional_email_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateKey: varchar("template_key", { length: 60 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    dinerId: uuid("diner_id").references(() => diners.id, {
      onDelete: "set null",
    }),
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    organizationIdAtEvent: uuid("organization_id_at_event").notNull(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 20 }).notNull(),
    locale: char("locale", { length: 2 }).notNull(),
    subject: varchar("subject", { length: 300 }),
    resendMessageId: varchar("resend_message_id", { length: 80 }),
    twilioMessageSid: varchar("twilio_message_sid", { length: 80 }),
    emailStatus: varchar("email_status", { length: 20 }),
    smsStatus: varchar("sms_status", { length: 20 }),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
  },
  (t) => ({
    dinerIdx: index("transactional_email_log_diner").on(
      t.dinerId,
      sql`${t.createdAt} DESC`,
    ),
    reservationIdx: index("transactional_email_log_reservation").on(
      t.reservationId,
      sql`${t.createdAt} DESC`,
    ),
    resendIdx: uniqueIndex("transactional_email_log_resend")
      .on(t.resendMessageId)
      .where(sql`${t.resendMessageId} IS NOT NULL`),
    twilioIdx: uniqueIndex("transactional_email_log_twilio")
      .on(t.twilioMessageSid)
      .where(sql`${t.twilioMessageSid} IS NOT NULL`),
    statusPerChannelCheck: check(
      "transactional_log_status_per_channel",
      sql`
    (${t.channel} = 'email' AND ${t.emailStatus} IS NOT NULL AND ${t.smsStatus} IS NULL)
    OR (${t.channel} = 'sms' AND ${t.smsStatus} IS NOT NULL AND ${t.emailStatus} IS NULL)
  `,
    ),
    channelValidCheck: check(
      "transactional_log_channel_valid",
      sql`${t.channel} IN ('email', 'sms')`,
    ),
    emailStatusValidCheck: check(
      "transactional_log_email_status_valid",
      sql`
    ${t.emailStatus} IS NULL OR ${t.emailStatus} IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')
  `,
    ),
    smsStatusValidCheck: check(
      "transactional_log_sms_status_valid",
      sql`
    ${t.smsStatus} IS NULL OR ${t.smsStatus} IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'optout')
  `,
    ),
  }),
);

// ─── data_subject_requests ──────────────────────────────────────────────
// §13 §4.2 — GDPR DSR tracking. Tavli-admin intake only in v1.
export const dataSubjectRequests = pgTable(
  "data_subject_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
    identifierPhone: varchar("identifier_phone", { length: 20 }),
    identifierEmail: varchar("identifier_email", { length: 255 }),
    requestKind: varchar("request_kind", { length: 40 }).notNull(),
    requestSource: varchar("request_source", { length: 40 }).notNull(),
    requestBody: text("request_body"),
    identityVerified: boolean("identity_verified").notNull().default(false),
    identityVerificationMethod: varchar("identity_verification_method", { length: 60 }),
    identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
    identityVerifiedByUserId: uuid("identity_verified_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    rejectionReason: text("rejection_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    legalDeadlineAt: timestamp("legal_deadline_at", { withTimezone: true }).notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deadlineExtensionDays: smallint("deadline_extension_days").notNull().default(0),
    deadlineExtensionReason: text("deadline_extension_reason"),
    deadlineExtendedByUserId: uuid("deadline_extended_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    deadlineExtendedAt: timestamp("deadline_extended_at", { withTimezone: true }),
    exportStoragePath: text("export_storage_path"),
    exportSignedUrlExpiresAt: timestamp("export_signed_url_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("data_subject_requests_status").on(t.status, t.legalDeadlineAt).where(sql`${t.status} IN ('received', 'in_progress')`),
    dinerIdx: index("data_subject_requests_diner").on(t.dinerId).where(sql`${t.dinerId} IS NOT NULL`),
  }),
);

// ─── retention_policies ─────────────────────────────────────────────────
// §13 §4.3 — declarative retention rules. The nightly purge job iterates
// these rows. Future-wave tables are forward-declared; the job skips them
// via to_regclass until those tables ship.
export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scopeTable: varchar("scope_table", { length: 80 }).notNull().unique(),
    retentionPeriodDays: integer("retention_period_days").notNull(),
    actionOnExpiry: varchar("action_on_expiry", { length: 20 }).notNull(),
    appliesToColumn: varchar("applies_to_column", { length: 60 }).notNull().default("created_at"),
    exceptionPredicate: jsonb("exception_predicate"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
);

// ─── rate_limits ─────────────────────────────────────────────────────────
// §13 §4.4 — fixed-window rate limiting. Service-role only; RLS enabled with
// no policies (blocks anon/authenticated by default). Rows auto-expire via
// the nightly purgeRateLimits job (Wave 4 sub-unit C).
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 200 }).notNull(),
    scope: varchar("scope", { length: 60 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] }),
    expiresIdx: index("rate_limits_expires").on(t.expiresAt),
  }),
);

// ─── cookie_consents ─────────────────────────────────────────────────────
// §13 §4.5 — visitor cookie consent records. Service-role only; RLS enabled
// with no policies. 13-month retention via expires_at; nightly purge job
// (Wave 4 sub-unit D) deletes expired rows.
export const cookieConsents = pgTable(
  "cookie_consents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    visitorSessionId: uuid("visitor_session_id").notNull(),
    dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    essential: boolean("essential").notNull().default(true),
    analytics: boolean("analytics").notNull().default(false),
    marketingTracking: boolean("marketing_tracking").notNull().default(false),
    grantedIp: inet("granted_ip"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    sessionIdx: index("cookie_consents_session").on(t.visitorSessionId, sql`${t.grantedAt} DESC`),
  }),
);

// ─── §08 Table management ────────────────────────────────────────────────

// ─── restaurant_table_sections ──────────────────────────────────────────
// §08 §3.1 — Named floor sections (e.g. "Terrace", "Main Room"). Optional
// grouping layer above individual tables. Sort order controls the UI
// display sequence.
export const restaurantTableSections = pgTable(
  "restaurant_table_sections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    color: varchar("color", { length: 7 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    restaurantIdx: index("restaurant_table_sections_restaurant").on(t.restaurantId, t.sortOrder),
  }),
);

// ─── restaurant_tables ──────────────────────────────────────────────────
// §08 §3.2 — Individual table records. `current_status` is denorm-synced
// from `table_status_log` via the trg_table_status_log_sync_denorm trigger.
// `current_combination_id` FK constraint added in migration after
// table_combinations is created.
export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => restaurantTableSections.id, { onDelete: "set null" }),
    label: varchar("label", { length: 20 }).notNull(),
    description: text("description"),
    capacityMin: smallint("capacity_min").notNull(),
    capacityMax: smallint("capacity_max").notNull(),
    capacityTypical: smallint("capacity_typical"),
    shape: tableShape("shape").notNull(),
    positionX: integer("position_x").notNull(),
    positionY: integer("position_y").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    rotationDegrees: smallint("rotation_degrees").notNull().default(0),
    currentStatus: tableStatus("current_status").notNull().default("free"),
    currentStatusSince: timestamp("current_status_since", { withTimezone: true }).notNull().default(sql`now()`),
    currentReservationId: uuid("current_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    // FK to table_combinations added via ALTER TABLE in migration 0035 (post-hoc, avoids circular type-inference).
    currentCombinationId: uuid("current_combination_id"),
    currentServerUserId: uuid("current_server_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    isBookableOnline: boolean("is_bookable_online").notNull().default(true),
    isProOnly: boolean("is_pro_only").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    labelActiveUniq: uniqueIndex("restaurant_tables_label_active").on(t.restaurantId, t.label).where(sql`${t.archivedAt} IS NULL`),
    restaurantIdx: index("restaurant_tables_restaurant").on(t.restaurantId).where(sql`${t.archivedAt} IS NULL`),
    sectionIdx: index("restaurant_tables_section").on(t.sectionId).where(sql`${t.archivedAt} IS NULL`),
    currentReservationIdx: index("restaurant_tables_current_reservation").on(t.currentReservationId).where(sql`${t.currentReservationId} IS NOT NULL`),
    capacityCheck: check("table_capacity_check", sql`${t.capacityMax} >= ${t.capacityMin} AND ${t.capacityMin} >= 1`),
  }),
);

// ─── table_status_log ──────────────────────────────────────────────────
// §08 §4.4 — Append-only log of every table status transition. The
// trg_table_status_log_sync_denorm trigger keeps restaurant_tables
// current_status in sync on each INSERT here.
export const tableStatusLog = pgTable(
  "table_status_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid("table_id")
      .notNull()
      .references(() => restaurantTables.id, { onDelete: "cascade" }),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    fromStatus: tableStatus("from_status"),
    toStatus: tableStatus("to_status").notNull(),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    // FK to table_combinations added via ALTER TABLE in migration 0035 (post-hoc, avoids circular type-inference).
    combinationId: uuid("combination_id"),
    changedByUserId: uuid("changed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().default(sql`now()`),
    notes: text("notes"),
    durationSecondsInFromStatus: integer("duration_seconds_in_from_status"),
  },
  (t) => ({
    tableIdx: index("table_status_log_table").on(t.tableId, t.changedAt),
    restaurantSeatedIdx: index("table_status_log_restaurant_seated").on(t.restaurantId, t.changedAt).where(sql`${t.toStatus} = 'seated'`),
  }),
);

// ─── table_combinations ────────────────────────────────────────────────
// §08 §3.3 — Ephemeral merge of 2+ tables for a single seating. `table_ids`
// is a denorm array of all member table UUIDs. Lifecycle ends when dissolved_at
// is set.
export const tableCombinations = pgTable(
  "table_combinations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableIds: uuid("table_ids").array().notNull().$type<string[]>(),
    primaryTableId: uuid("primary_table_id")
      .notNull()
      .references(() => restaurantTables.id, { onDelete: "cascade" }),
    status: tableStatus("status").notNull().default("booked"),
    statusSince: timestamp("status_since", { withTimezone: true }).notNull().default(sql`now()`),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    combinedCapacity: smallint("combined_capacity").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
  },
  (t) => ({
    restaurantActiveIdx: index("table_combinations_restaurant_active").on(t.restaurantId).where(sql`${t.dissolvedAt} IS NULL`),
    minimumSizeCheck: check("table_combinations_minimum_size", sql`array_length(${t.tableIds}, 1) >= 2`),
  }),
);

// ─── walkin_queue ──────────────────────────────────────────────────────
// §08 §3.4 — Walk-in waiting queue for a restaurant. `position` is the
// display queue position (1-indexed); managed by app layer. Resolved entries
// (seated/left/no_show) are excluded from the active partial index.
export const walkinQueue = pgTable(
  "walkin_queue",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    guestName: varchar("guest_name", { length: 120 }).notNull(),
    guestPhone: varchar("guest_phone", { length: 20 }),
    partySize: smallint("party_size").notNull(),
    notes: text("notes"),
    status: walkinQueueStatus("status").notNull().default("waiting"),
    position: smallint("position").notNull(),
    estimatedWaitMinutes: smallint("estimated_wait_minutes"),
    addedByUserId: uuid("added_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    calledAt: timestamp("called_at", { withTimezone: true }),
    seatedAt: timestamp("seated_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    seatedTableId: uuid("seated_table_id").references(() => restaurantTables.id, { onDelete: "set null" }),
    seatedReservationId: uuid("seated_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    // 0052 — GDPR erasure marker (Phase B1). Set when the DSR cascade
    // pseudonymises a walk-in guest's name/phone.
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    activeIdx: index("walkin_queue_active").on(t.restaurantId, t.position).where(sql`${t.status} IN ('waiting', 'called')`),
  }),
);

// ─── §05 Translation tables ──────────────────────────────────────────────

// ─── restaurant_translations ─────────────────────────────────────────────
// §05 §3.1 — Per-locale textual fields for restaurant pages. Composite PK
// (restaurant_id, locale). Falls back to 'ro' per §4.3 if required fields
// are missing in the requested locale.
export const restaurantTranslations = pgTable(
  "restaurant_translations",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    locale: char("locale", { length: 2 }).notNull(),
    name: varchar("name", { length: 200 }),
    tagline: varchar("tagline", { length: 300 }),
    descriptionShort: text("description_short"),
    descriptionLong: text("description_long"),
    heroSubtitle: varchar("hero_subtitle", { length: 200 }),
    chefBio: text("chef_bio"),
    ambience: text("ambience"),
    dressCode: text("dress_code"),
    parkingNote: text("parking_note"),
    metaTitle: varchar("meta_title", { length: 200 }),
    metaDescription: varchar("meta_description", { length: 300 }),
    ogTitle: varchar("og_title", { length: 200 }),
    ogDescription: varchar("og_description", { length: 300 }),
    authoredByUserId: uuid("authored_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.restaurantId, t.locale] }),
    index("restaurant_translations_reviewed").on(t.restaurantId, t.locale).where(sql`${t.reviewedAt} IS NOT NULL`),
  ],
);

// ─── menu_translations ───────────────────────────────────────────────────
// §05 §3.1 — Per-locale menu-level text (e.g. hero_note). Composite PK
// (restaurant_id, locale).
export const menuTranslations = pgTable(
  "menu_translations",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    locale: char("locale", { length: 2 }).notNull(),
    heroNote: text("hero_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.restaurantId, t.locale] }),
  ],
);

// ─── menu_section_translations ───────────────────────────────────────────
// §05 §3.2 — Per-locale section name + intro. Composite PK (section_id, locale).
export const menuSectionTranslations = pgTable(
  "menu_section_translations",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => menuSections.id, { onDelete: "cascade" }),
    locale: char("locale", { length: 2 }).notNull(),
    name: varchar("name", { length: 200 }),
    intro: text("intro"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.locale] }),
  ],
);

// ─── menu_item_translations ──────────────────────────────────────────────
// §05 §3.2 — Per-locale item name, description, and photo alt-text.
// Composite PK (item_id, locale).
export const menuItemTranslations = pgTable(
  "menu_item_translations",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    locale: char("locale", { length: 2 }).notNull(),
    name: varchar("name", { length: 200 }),
    description: text("description"),
    altText: varchar("alt_text", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locale] }),
  ],
);

// ─── restaurant_photo_translations ──────────────────────────────────────
// §05 §3.3 — Per-locale alt-text for restaurant photos. Composite PK
// (photo_id, locale). alt_text NOT NULL — every inserted row must carry copy.
export const restaurantPhotoTranslations = pgTable(
  "restaurant_photo_translations",
  {
    photoId: uuid("photo_id")
      .notNull()
      .references(() => restaurantPhotos.id, { onDelete: "cascade" }),
    locale: char("locale", { length: 2 }).notNull(),
    altText: varchar("alt_text", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.photoId, t.locale] }),
  ],
);

// ─── §07 Analytics aggregates (Wave 6, migration 0042) ──────────────────
// Pre-computed daily aggregates powering Base + Pro dashboards. PK
// (restaurant_id, business_date, service_label). business_date is the
// restaurant-LOCAL date (computed from restaurants.timezone). Refreshed
// nightly by analytics.refresh-aggregates; idempotent ON CONFLICT.
export const reservationDailyAggregates = pgTable("reservation_daily_aggregates", {
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  businessDate: date("business_date").notNull(),
  serviceLabel: varchar("service_label", { length: 40 }).notNull().default("all_day"),
  // Counts
  bookingsCreated: integer("bookings_created").notNull().default(0),
  bookingsForDate: integer("bookings_for_date").notNull().default(0),
  confirmedCount: integer("confirmed_count").notNull().default(0),
  seatedCount: integer("seated_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
  cancelledCount: integer("cancelled_count").notNull().default(0),
  // Covers (sum of party_size)
  coversForDate: integer("covers_for_date").notNull().default(0),
  coversCompleted: integer("covers_completed").notNull().default(0),
  coversNoShow: integer("covers_no_show").notNull().default(0),
  // Party-size buckets
  partySize_1_2: integer("party_size_1_2").notNull().default(0),
  partySize_3_4: integer("party_size_3_4").notNull().default(0),
  partySize_5_6: integer("party_size_5_6").notNull().default(0),
  partySize_7Plus: integer("party_size_7_plus").notNull().default(0),
  // Cancellation reasons
  cancelReasonRestaurantClosed: integer("cancel_reason_restaurant_closed").notNull().default(0),
  cancelReasonOverbooked: integer("cancel_reason_overbooked").notNull().default(0),
  cancelReasonKitchenIssue: integer("cancel_reason_kitchen_issue").notNull().default(0),
  cancelReasonPrivateEvent: integer("cancel_reason_private_event").notNull().default(0),
  cancelReasonOther: integer("cancel_reason_other").notNull().default(0),
  cancelReasonDiner: integer("cancel_reason_diner").notNull().default(0),
  // Booking-type buckets
  bookingTypeStandard: integer("booking_type_standard").notNull().default(0),
  bookingTypePrivateEvent: integer("booking_type_private_event").notNull().default(0),
  bookingTypeStanding: integer("booking_type_standing").notNull().default(0),
  // Lead time (minutes)
  leadTimeP50Min: integer("lead_time_p50_min"),
  leadTimeP90Min: integer("lead_time_p90_min"),
  leadTimeAvgMin: integer("lead_time_avg_min"),
  // Channel attribution (9→7 fold; see src/lib/analytics/source-fold.ts)
  sourceWidget: integer("source_widget").notNull().default(0),
  sourceVenuePage: integer("source_venue_page").notNull().default(0),
  sourceEditorial: integer("source_editorial").notNull().default(0),
  sourceCorporate: integer("source_corporate").notNull().default(0),
  sourceWalkIn: integer("source_walk_in").notNull().default(0),
  sourceManual: integer("source_manual").notNull().default(0),
  sourceUnknown: integer("source_unknown").notNull().default(0),
  // New vs returning (Pro)
  newDiners: integer("new_diners").notNull().default(0),
  returningDiners: integer("returning_diners").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.restaurantId, t.businessDate, t.serviceLabel] }),
  index("reservation_daily_aggregates_date").on(t.businessDate.desc()),
  index("reservation_daily_aggregates_restaurant").on(t.restaurantId, t.businessDate.desc()),
]);

// Pro no-show heat map: day-of-week × hour-of-day over a 90-day rolling
// window. A new row per refresh (window_end_date changes daily); old
// windows purged after 90d by analytics.purge-stale-hourly-windows.
export const reservationHourlyAggregates = pgTable("reservation_hourly_aggregates", {
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),
  hourOfDay: smallint("hour_of_day").notNull(),
  windowStartDate: date("window_start_date").notNull(),
  windowEndDate: date("window_end_date").notNull(),
  totalBookings: integer("total_bookings").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
  noShowRate: numeric("no_show_rate", { precision: 5, scale: 4 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.restaurantId, t.dayOfWeek, t.hourOfDay, t.windowEndDate] }),
  check("reservation_hourly_dow_chk", sql`${t.dayOfWeek} between 0 and 6`),
  check("reservation_hourly_hour_chk", sql`${t.hourOfDay} between 0 and 23`),
]);

// Pro cohort retention — ORG-scoped (a Pro chain wants org-level retention,
// not per-venue). Current cohort_month recomputed nightly; past months
// immutable (see analytics.refresh-cohorts ON CONFLICT guard).
export const dinerCohortAggregates = pgTable("diner_cohort_aggregates", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  cohortMonth: date("cohort_month").notNull(),
  monthOffset: smallint("month_offset").notNull(),
  cohortSize: integer("cohort_size").notNull(),
  retainedCount: integer("retained_count").notNull(),
  retentionRate: numeric("retention_rate", { precision: 5, scale: 4 }),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.cohortMonth, t.monthOffset] }),
  check("diner_cohort_offset_chk", sql`${t.monthOffset} between 0 and 24`),
]);

// Pro 4-week rolling cover forecast (trimmed-mean over last 12 same-weekday
// observations; see src/lib/analytics/forecast.ts). One row per future date.
export const restaurantForecasts = pgTable("restaurant_forecasts", {
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  forecastDate: date("forecast_date").notNull(),
  coversPredicted: integer("covers_predicted").notNull(),
  coversLow: integer("covers_low").notNull(),
  coversHigh: integer("covers_high").notNull(),
  bookingsAlreadyConfirmed: integer("bookings_already_confirmed").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.restaurantId, t.forecastDate] }),
]);

// Async CSV/ZIP export jobs. The create-action gates permissions; the
// analytics.run-export job trusts this row. Files land in the private
// `exports` bucket with a 24h signed URL.
export const restaurantExportJobs = pgTable("restaurant_export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  requestedRestaurants: uuid("requested_restaurants").array().notNull().default(sql`'{}'::uuid[]`),
  format: varchar("format", { length: 20 }).notNull().default("csv"),
  dateFrom: date("date_from"),
  dateTo: date("date_to"),
  tables: text("tables").array().notNull().default(sql`array['reservations','diners','reviews']::text[]`),
  // Internal-only bypass of the Base 12-month tier limit (§8.3). Never set
  // from user input; only by cancel-subscription / GDPR DSAR / admin callers.
  bypassTierLimitReason: varchar("bypass_tier_limit_reason", { length: 40 }),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  storagePath: text("storage_path"),
  signedUrlExpiresAt: timestamp("signed_url_expires_at", { withTimezone: true }),
  rowCount: integer("row_count"),
  sizeBytes: integer("size_bytes"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
}, (t) => [
  index("restaurant_export_jobs_org").on(t.organizationId, t.createdAt.desc()),
  index("restaurant_export_jobs_status").on(t.status).where(sql`status in ('queued','running')`),
]);

// ═══ §11 Marketing suite (Wave 7, migration 0043) ═══════════════════════
export const marketingChannel = pgEnum("marketing_channel", ["email", "sms", "whatsapp", "in_confirmation"]);
export const marketingCampaignKind = pgEnum("marketing_campaign_kind", ["triggered", "one_off"]);
export const marketingCampaignStatus = pgEnum("marketing_campaign_status", [
  "draft", "active", "paused", "archived", "scheduled", "sending", "sent", "cancelled",
]);
export const marketingSendStatus = pgEnum("marketing_send_status", [
  "queued", "sent", "delivered", "bounced", "complained", "failed",
  "skipped_cap", "skipped_suppressed", "skipped_quiet_hours", "skipped_quota",
  "unsubscribed", "opened", "clicked",
]);
export const consentSource = pgEnum("consent_source", [
  "booking_flow", "qr_tent", "venue_page", "walk_in_manual", "csv_import", "review_flow", "admin",
]);
export const segmentCombinator = pgEnum("segment_combinator", ["and", "or"]);

// Per-venue marketing config (§11 §4.2).
export const restaurantMarketingSettings = pgTable("restaurant_marketing_settings", {
  restaurantId: uuid("restaurant_id").primaryKey().references(() => restaurants.id, { onDelete: "cascade" }),
  emailSenderName: varchar("email_sender_name", { length: 120 }),
  emailReplyTo: varchar("email_reply_to", { length: 255 }),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  smsSenderId: varchar("sms_sender_id", { length: 20 }),
  smsStopShortcode: varchar("sms_stop_shortcode", { length: 20 }),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  whatsappBusinessAccountId: varchar("whatsapp_business_account_id", { length: 80 }),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 80 }),
  confirmationPromoEnabled: boolean("confirmation_promo_enabled").notNull().default(true),
  quietHoursStartLocal: time("quiet_hours_start_local").notNull().default("21:00"),
  quietHoursEndLocal: time("quiet_hours_end_local").notNull().default("10:00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Campaign definition (§11 §4.3). segment_id FK added in SQL (segments defined after).
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  kind: marketingCampaignKind("kind").notNull(),
  triggeredCampaignKey: varchar("triggered_campaign_key", { length: 40 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: marketingCampaignStatus("status").notNull().default("draft"),
  channel: marketingChannel("channel").notNull(),
  subjectTemplate: jsonb("subject_template").notNull(),
  bodyTemplate: jsonb("body_template").notNull(),
  previewText: jsonb("preview_text"),
  whatsappTemplateNamespace: varchar("whatsapp_template_namespace", { length: 80 }),
  whatsappTemplateName: varchar("whatsapp_template_name", { length: 80 }),
  triggerOffsetSeconds: integer("trigger_offset_seconds"),
  triggerEvent: varchar("trigger_event", { length: 40 }),
  scheduledSendAt: timestamp("scheduled_send_at", { withTimezone: true }),
  sendInRestaurantTz: boolean("send_in_restaurant_tz").notNull().default(true),
  segmentId: uuid("segment_id"),
  recipientCountEstimate: integer("recipient_count_estimate"),
  tokensUsed: text("tokens_used").array().notNull().default(sql`'{}'::text[]`),
  createdByUserId: uuid("created_by_user_id").references(() => authUsers.id),
  lastEditedByUserId: uuid("last_edited_by_user_id").references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("marketing_campaigns_org_status").on(t.organizationId, t.status),
  index("marketing_campaigns_scheduled").on(t.scheduledSendAt).where(sql`status = 'scheduled'`),
]);

// Snapshot of campaign content per edit (§11 §4.4).
export const marketingCampaignVersions = pgTable("marketing_campaign_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  subjectTemplate: jsonb("subject_template").notNull(),
  bodyTemplate: jsonb("body_template").notNull(),
  previewText: jsonb("preview_text"),
  editedByUserId: uuid("edited_by_user_id").references(() => authUsers.id),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("marketing_campaign_versions_unique").on(t.campaignId, t.versionNumber),
]);

// Saved segment (§11 §4.5).
export const marketingSegments = pgTable("marketing_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  filterDsl: jsonb("filter_dsl").notNull(),
  combinator: segmentCombinator("combinator").notNull().default("and"),
  isSnapshot: boolean("is_snapshot").notNull().default(false),
  snapshotDinerIds: uuid("snapshot_diner_ids").array(),
  estimatedSize: integer("estimated_size"),
  lastEstimatedAt: timestamp("last_estimated_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("marketing_segments_org").on(t.organizationId),
]);

// Per-recipient send record (§11 §4.6).
export const marketingSends = pgTable("marketing_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  campaignVersionId: uuid("campaign_version_id").references(() => marketingCampaignVersions.id, { onDelete: "set null" }),
  dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  channel: marketingChannel("channel").notNull(),
  locale: char("locale", { length: 2 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  status: marketingSendStatus("status").notNull().default("queued"),
  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
  scheduledSendAt: timestamp("scheduled_send_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
  clickCount: integer("click_count").notNull().default(0),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  complainedAt: timestamp("complained_at", { withTimezone: true }),
  resendMessageId: varchar("resend_message_id", { length: 80 }),
  twilioMessageSid: varchar("twilio_message_sid", { length: 80 }),
  failureCode: varchar("failure_code", { length: 60 }),
  failureMessage: text("failure_message"),
  attributedReservationId: uuid("attributed_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  attributionWindowExpiresAt: timestamp("attribution_window_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("marketing_sends_campaign").on(t.campaignId, t.status),
  index("marketing_sends_diner").on(t.dinerId, t.sentAt.desc()),
  index("marketing_sends_resend").on(t.resendMessageId).where(sql`resend_message_id is not null`),
  index("marketing_sends_twilio").on(t.twilioMessageSid).where(sql`twilio_message_sid is not null`),
]);

// Per-org per-month per-channel usage (§11 §4.9).
export const marketingQuotaUsage = pgTable("marketing_quota_usage", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  yearMonth: date("year_month").notNull(),
  channel: marketingChannel("channel").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  bouncedCount: integer("bounced_count").notNull().default(0),
  complainedCount: integer("complained_count").notNull().default(0),
  includedAllowance: integer("included_allowance").notNull(),
  overageCount: integer("overage_count").notNull().default(0),
  overageBilledCents: integer("overage_billed_cents").notNull().default(0),
  lastAlertThreshold: smallint("last_alert_threshold").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.yearMonth, t.channel] }),
]);

// Click tracking (§11 §4.10).
export const marketingLinkClicks = pgTable("marketing_link_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sendId: uuid("send_id").notNull().references(() => marketingSends.id, { onDelete: "cascade" }),
  linkToken: varchar("link_token", { length: 20 }).notNull(),
  destinationUrl: text("destination_url").notNull(),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  ip: inet("ip"),
  userAgent: varchar("user_agent", { length: 500 }),
}, (t) => [
  index("marketing_link_clicks_send").on(t.sendId, t.clickedAt.desc()),
]);

// Append-only consent legal trail (§11 §4.11). Two-column diner/org id (stable
// snapshot survives anonymisation) like billing_audit_log.
export const marketingConsentAudit = pgTable("marketing_consent_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  dinerIdAtEvent: uuid("diner_id_at_event").notNull(),
  organizationIdAtEvent: uuid("organization_id_at_event").notNull(),
  channel: marketingChannel("channel").notNull(),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  reason: varchar("reason", { length: 60 }),
  actorUserId: uuid("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  context: jsonb("context"),
}, (t) => [
  index("marketing_consent_audit_diner").on(t.dinerId, t.occurredAt.desc()),
  index("marketing_consent_audit_org").on(t.organizationId, t.occurredAt.desc()),
]);

// ═══ §14 Setup tooling (Wave 8, migration 0044) ═════════════════════════
export const setupStepKey = pgEnum("setup_step_key", [
  "migration", "page_and_photos", "staff_training", "parallel_run", "first_campaigns",
]);
export const setupStepStatus = pgEnum("setup_step_status", [
  "not_started", "scheduled", "in_progress", "completed", "skipped",
]);
export const migrationSource = pgEnum("migration_source", [
  "tavli_csv_template", "opentable", "sevenrooms", "resy", "ialoc", "manual", "none",
]);

// §14 §4.2 — one row per (org, restaurant, step). Seeded by a trigger on
// restaurant insert (4 base steps; first_campaigns is Pro, added app-side).
export const setupProgress = pgTable("setup_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  stepKey: setupStepKey("step_key").notNull(),
  status: setupStepStatus("status").notNull().default("not_started"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedReason: varchar("skipped_reason", { length: 120 }),
  notes: text("notes"),
  context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
  assignedFounderUserId: uuid("assigned_founder_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // 0050: this index is NULLS NOT DISTINCT in the live DB so org-level steps
  // (restaurant_id IS NULL) dedup via the trigger's ON CONFLICT. Drizzle 0.45.2
  // can't express NULLS NOT DISTINCT — descriptive only; SQL is the source.
  uniqueIndex("setup_progress_org_restaurant_step").on(t.organizationId, t.restaurantId, t.stepKey),
  index("setup_progress_org").on(t.organizationId),
  index("setup_progress_status").on(t.status, t.scheduledAt).where(sql`status in ('not_started','scheduled')`),
]);

// §14 §4.3 — each CSV migration run (re-runnable; dedup'd).
export const migrationImports = pgTable("migration_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  source: migrationSource("source").notNull(),
  sourceFileStoragePath: text("source_file_storage_path"),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  reservationsImported: integer("reservations_imported").notNull().default(0),
  reservationsSkipped: integer("reservations_skipped").notNull().default(0),
  reservationsFailed: integer("reservations_failed").notNull().default(0),
  dinersImported: integer("diners_imported").notNull().default(0),
  dinersMerged: integer("diners_merged").notNull().default(0),
  errorLog: jsonb("error_log"),
  importedByUserId: uuid("imported_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("migration_imports_restaurant").on(t.restaurantId, t.createdAt.desc()),
]);

// ═══ §15 Pricing (Wave 8, migration 0045) ═══════════════════════════════
// §15 §4.1 — BNR daily EUR/RON reference rate (+ admin manual override).
export const currencyReferenceRates = pgTable("currency_reference_rates", {
  source: varchar("source", { length: 20 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  rate: numeric("rate", { precision: 10, scale: 6 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  fetchedByUserId: uuid("fetched_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  overrideExpiresAt: timestamp("override_expires_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.source, t.effectiveDate] }),
  // audit #6 — owner clause dropped: fetched_by_user_id FK is ON DELETE SET
  // NULL, so requiring it non-null made admins who set an override undeletable.
  check("chk_admin_manual_has_owner", sql`${t.source} <> 'admin_manual' OR ${t.overrideExpiresAt} IS NOT NULL`),
]);

// §15 §18 OQ8 — pre-launch wait-list when PARTNER_SIGNUP_ENABLED=false.
export const prospectWaitlist = pgTable("prospect_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  organizationNameHint: varchar("organization_name_hint", { length: 200 }),
  cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
  notes: text("notes"),
  source: varchar("source", { length: 40 }).notNull().default("pricing_page"),
  sourceLocale: char("source_locale", { length: 2 }).notNull(),
  sourceIp: inet("source_ip"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  invitedByUserId: uuid("invited_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "set null" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("prospect_waitlist_email_unique").on(sql`lower(${t.email})`).where(sql`invited_at is null and redacted_at is null`),
]);
