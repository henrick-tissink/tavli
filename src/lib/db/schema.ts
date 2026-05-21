/**
 * Drizzle schema for Tavli Phase 2.
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
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  bookedByUserId: uuid("booked_by_user_id").references(() => profiles.id, { onDelete: "set null" }),
  eventRequestId: uuid("event_request_id").references(() => eventRequests.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  postVisitEmailSentAt: timestamp("post_visit_email_sent_at", {
    withTimezone: true,
  }),
}, (t) => [
  index("reservations_restaurant_date_idx").on(
    t.restaurantId,
    t.reservationDate,
    t.reservationTime,
  ),
  index("reservations_status_idx").on(t.status),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("reviews_restaurant_created_idx").on(t.restaurantId, t.createdAt.desc()),
]);

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
  privateSpaceId: uuid("private_space_id").references(() => restaurantPrivateSpaces.id, { onDelete: "set null" }),
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
  index("partner_notifications_restaurant_unread_idx")
    .on(t.restaurantId, t.createdAt.desc())
    .where(sql`${t.readAt} IS NULL`),
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
}, (t) => [
  index("audit_logs_action_idx").on(t.action, t.createdAt),
  index("audit_logs_subject_idx").on(t.subjectType, t.subjectId),
  index("audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
  index("audit_logs_organization_idx").on(t.organizationId, t.createdAt),
  index("audit_logs_restaurant_idx").on(t.restaurantId, t.createdAt),
  index("audit_logs_created_at_idx").on(t.createdAt),
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
