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

// ─── profiles (extends auth.users 1:1) ───────────────────────────────────
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: userRole("role").notNull().default("consumer"),
  fullName: text("full_name"),
  email: text("email"),
  locale: varchar("locale", { length: 5 }).notNull().default("ro"),
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
  ownerUserId: uuid("owner_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  voteCount: integer("vote_count").notNull().default(0),
  photoCount: integer("photo_count").notNull().default(0),
  schedule: jsonb("schedule").$type<ScheduleEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("restaurants_city_slug_unique").on(t.cityId, t.slug),
  index("restaurants_status_idx").on(t.status),
  index("restaurants_owner_idx").on(t.ownerUserId),
  index("restaurants_city_status_idx").on(t.cityId, t.status),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
