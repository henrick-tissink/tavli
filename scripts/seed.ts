/**
 * Seed the local (or staging) Supabase database from the existing mock data.
 *
 * Prerequisites:
 *   1. Supabase running and DATABASE_URL set.
 *   2. Migrations applied (0000_initial_schema.sql + 0001_rls_and_triggers.sql).
 *
 * Usage:
 *   npm run db:seed
 *
 * Behaviour:
 *   - Idempotent on (city_id, slug) for restaurants; wipes and re-inserts
 *     dependent rows per restaurant to avoid orphans during re-seeds.
 *   - Photos are recorded with their Unsplash URLs in `storage_path` for
 *     simplicity. A later step (M7-era partner photo upload) will migrate
 *     these into Supabase Storage and rewrite paths.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import {
  cities,
  restaurants,
  restaurantPhotos,
  menus,
  menuSections,
  menuItems,
  restaurantAvailability,
  type ScheduleEntry,
} from "../src/lib/db/schema";

// We intentionally import *types* and data from mock-data — those files
// are plain TS modules and don't touch React at read time.
import type {
  Restaurant,
  RestaurantDetail,
  MenuDietaryTag,
} from "../src/lib/types";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  console.log("⟳ seeding Tavli…");

  // ── 1. cities ───────────────────────────────────────────────────────────
  const cityRows = [
    { slug: "bucuresti", name: "București", countryCode: "RO", isActive: true, defaultLat: "44.4268", defaultLng: "26.1025" },
    { slug: "cluj", name: "Cluj", countryCode: "RO", isActive: false },
    { slug: "timisoara", name: "Timișoara", countryCode: "RO", isActive: false },
    { slug: "brasov", name: "Brașov", countryCode: "RO", isActive: false },
    { slug: "iasi", name: "Iași", countryCode: "RO", isActive: false },
    { slug: "istanbul", name: "Istanbul", countryCode: "TR", isActive: false, defaultLat: "41.0082", defaultLng: "28.9784" },
  ];
  for (const c of cityRows) {
    await db
      .insert(cities)
      .values(c)
      .onConflictDoUpdate({
        target: cities.slug,
        set: { name: c.name, countryCode: c.countryCode, isActive: c.isActive },
      });
  }
  const bucurestiId = (
    await db.select({ id: cities.id }).from(cities).where(eq(cities.slug, "bucuresti"))
  )[0]!.id;
  console.log(`  ✓ cities seeded (Bucuresti = ${bucurestiId.slice(0, 8)}…)`);

  // ── 2. mock data import ─────────────────────────────────────────────────
  const { getRestaurants, getRestaurantDetail } = await import(
    "../src/lib/mock-data"
  );
  const { getMenu } = await import("../src/lib/menu-data");
  const mockRestaurants = getRestaurants();

  console.log(`  → ${mockRestaurants.length} restaurants to seed`);

  // ── 3. each restaurant ──────────────────────────────────────────────────
  for (const r of mockRestaurants) {
    const detail = getRestaurantDetail(r.slug) as RestaurantDetail | null;
    const menu = getMenu(r.slug);

    // Upsert restaurant row.
    const scheduleJson: ScheduleEntry[] = detail?.schedule ?? [
      { days: "Mon–Fri", hours: "12:00 – 23:00" },
      { days: "Sat–Sun", hours: "11:00 – 23:30" },
    ];
    const [row] = await db
      .insert(restaurants)
      .values({
        slug: r.slug,
        name: r.name,
        cuisines: r.cuisines,
        cityId: bucurestiId,
        zone: r.zone,
        priceLevel: r.priceLevel,
        lat: r.lat ? String(r.lat) : null,
        lng: r.lng ? String(r.lng) : null,
        description: detail?.description ?? null,
        heroNote: menu?.heroNote ?? null,
        address: detail?.address ?? null,
        phone: null,
        email: null,
        websiteUrl: detail?.websiteUrl ?? null,
        tags: detail?.tags ?? [],
        status: "live",
        rating: String(r.rating),
        voteCount: r.voteCount,
        photoCount: r.photoCount,
        schedule: scheduleJson,
      })
      .onConflictDoUpdate({
        target: [restaurants.cityId, restaurants.slug],
        set: {
          name: sql`excluded.name`,
          cuisines: sql`excluded.cuisines`,
          zone: sql`excluded.zone`,
          priceLevel: sql`excluded.price_level`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          description: sql`excluded.description`,
          heroNote: sql`excluded.hero_note`,
          address: sql`excluded.address`,
          websiteUrl: sql`excluded.website_url`,
          tags: sql`excluded.tags`,
          status: sql`excluded.status`,
          rating: sql`excluded.rating`,
          voteCount: sql`excluded.vote_count`,
          photoCount: sql`excluded.photo_count`,
          schedule: sql`excluded.schedule`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: restaurants.id });
    const restaurantId = row.id;

    // Reset dependent rows for idempotent re-seed.
    await db.delete(restaurantPhotos).where(eq(restaurantPhotos.restaurantId, restaurantId));
    await db.delete(menuItems).where(eq(menuItems.restaurantId, restaurantId));
    await db.delete(menuSections).where(eq(menuSections.restaurantId, restaurantId));
    await db.delete(menus).where(eq(menus.restaurantId, restaurantId));
    await db.delete(restaurantAvailability).where(eq(restaurantAvailability.restaurantId, restaurantId));

    // Photos — store Unsplash URL directly in storage_path for now.
    if (r.photoUrl) {
      await db.insert(restaurantPhotos).values({
        restaurantId,
        storagePath: r.photoUrl,
        kind: "hero",
        sortOrder: 0,
      });
    }
    if (detail?.photos) {
      for (let i = 0; i < detail.photos.length; i++) {
        await db.insert(restaurantPhotos).values({
          restaurantId,
          storagePath: detail.photos[i]!,
          kind: i === 0 && !r.photoUrl ? "hero" : "gallery",
          sortOrder: (r.photoUrl ? 1 : 0) + i,
        });
      }
    }

    // Menu.
    if (menu) {
      await db.insert(menus).values({
        restaurantId,
        currency: menu.currency,
        heroNote: menu.heroNote ?? null,
      });
      const sectionIdByKey = new Map<string, string>();
      for (let s = 0; s < menu.sections.length; s++) {
        const section = menu.sections[s]!;
        const [insertedSection] = await db
          .insert(menuSections)
          .values({
            restaurantId,
            name: section.name,
            intro: section.intro ?? null,
            sortOrder: s,
          })
          .returning({ id: menuSections.id });
        sectionIdByKey.set(section.id, insertedSection.id);
      }
      const sectionItemCount = new Map<string, number>();
      for (const item of menu.items) {
        const sectionId = sectionIdByKey.get(item.sectionId);
        if (!sectionId) continue;
        const order = sectionItemCount.get(sectionId) ?? 0;
        const tags = normaliseTags(item.tags ?? []);
        await db.insert(menuItems).values({
          sectionId,
          restaurantId,
          name: item.name,
          description: item.description ?? null,
          priceCents: item.price * 100,
          currency: menu.currency,
          photoStoragePath: item.photoUrl ?? null,
          dietaryTags: tags,
          isChefPick: tags.includes("chef_pick"),
          sortOrder: order,
        });
        sectionItemCount.set(sectionId, order + 1);
      }
    }

    // Default availability: every weekday 17:00-23:00, capacity 30.
    for (let dow = 0; dow < 7; dow++) {
      await db.insert(restaurantAvailability).values({
        restaurantId,
        dayOfWeek: dow,
        slotStart: "17:00:00",
        slotEnd: "23:00:00",
        capacity: 30,
      });
    }

    console.log(`  ✓ ${r.name.padEnd(24)} (${menu ? `${menu.sections.length}s/${menu.items.length}i` : "no menu"})`);
  }

  await client.end();
  console.log("✓ seed complete");
}

function normaliseTags(
  tags: MenuDietaryTag[],
): Array<"vegetarian" | "vegan" | "gluten_free" | "spicy" | "chef_pick" | "popular"> {
  return tags.map((t) => (t === "gluten-free" ? "gluten_free" : t === "chef-pick" ? "chef_pick" : t));
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
