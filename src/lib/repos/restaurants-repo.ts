/**
 * Consumer data access — async, gated by NEXT_PUBLIC_USE_DB.
 *
 * USE_DB=false (default): delegates to the static mock data so the demo
 * works without Supabase.
 * USE_DB=true: queries Supabase via the anonymous client. RLS restricts
 * visibility to status='live' restaurants + their children.
 *
 * Callers are server components in consumer routes; they await these
 * functions and pass the result to client sub-components as props.
 */

import type {
  Restaurant,
  RestaurantDetail,
  Menu,
  MenuItem,
  MenuSection,
  Review,
  ReviewIntelligence,
} from "@/lib/types";
import * as mock from "@/lib/mock-data";
import * as menuMock from "@/lib/menu-data";
import { supabaseAnon } from "@/lib/db/anon";
import { resolvePhotoUrl } from "@/lib/storage";
import type { AvailabilitySlot } from "@/lib/seo/restaurant-jsonld";

const USE_DB = process.env.NEXT_PUBLIC_USE_DB === "true";

function dbActive(): boolean {
  return USE_DB && supabaseAnon() !== null;
}

// ── live DB helpers ─────────────────────────────────────────────────────

async function fetchHeroPhoto(restaurantId: string): Promise<string | null> {
  const sb = supabaseAnon()!;
  const { data } = await sb
    .from("restaurant_photos")
    .select("storage_path")
    .eq("restaurant_id", restaurantId)
    .eq("kind", "hero")
    .maybeSingle();
  return resolvePhotoUrl(data?.storage_path ?? null);
}

async function fetchAllPhotos(restaurantId: string): Promise<string[]> {
  const sb = supabaseAnon()!;
  const { data } = await sb
    .from("restaurant_photos")
    .select("storage_path, sort_order, kind")
    .eq("restaurant_id", restaurantId)
    .order("sort_order");
  return (data ?? [])
    .map((p) => resolvePhotoUrl(p.storage_path))
    .filter((u): u is string => !!u);
}

async function restaurantFromRow(row: Record<string, unknown>): Promise<Restaurant> {
  const id = row.id as string;
  const heroUrl = await fetchHeroPhoto(id);
  return {
    id,
    slug: row.slug as string,
    name: row.name as string,
    cuisine: row.cuisine as string,
    priceLevel: Math.max(1, Math.min(4, Number(row.price_level ?? 2))) as 1 | 2 | 3 | 4,
    zone: (row.zone as string) ?? "",
    city: "București",
    rating: Number(row.rating ?? 0),
    voteCount: Number(row.vote_count ?? 0),
    photoUrl: heroUrl,
    photoCount: Number(row.photo_count ?? 0),
    status: row.status === "live" ? "open" : "closed",
    availableSlots: [],
    distance: undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
  };
}

async function dbGetRestaurants(): Promise<Restaurant[]> {
  const sb = supabaseAnon()!;
  const { data } = await sb
    .from("restaurants")
    .select(
      "id, slug, name, cuisine, zone, price_level, rating, vote_count, photo_count, status, lat, lng",
    )
    .eq("status", "live")
    .order("rating", { ascending: false });
  return Promise.all((data ?? []).map((r) => restaurantFromRow(r)));
}

async function dbGetRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const sb = supabaseAnon()!;
  const { data } = await sb
    .from("restaurants")
    .select(
      "id, slug, name, cuisine, zone, price_level, rating, vote_count, photo_count, status, lat, lng",
    )
    .eq("slug", slug)
    .eq("status", "live")
    .maybeSingle();
  if (!data) return null;
  return restaurantFromRow(data);
}

async function dbGetRestaurantDetail(slug: string): Promise<RestaurantDetail | null> {
  const sb = supabaseAnon()!;
  const { data } = await sb
    .from("restaurants")
    .select(
      "id, slug, name, cuisine, zone, price_level, rating, vote_count, photo_count, status, lat, lng, description, hero_note, address, tags, website_url, schedule",
    )
    .eq("slug", slug)
    .eq("status", "live")
    .maybeSingle();
  if (!data) return null;

  const [base, photos, nearby] = await Promise.all([
    restaurantFromRow(data),
    fetchAllPhotos(data.id),
    sb
      .from("restaurants")
      .select(
        "id, slug, name, cuisine, zone, price_level, rating, vote_count, photo_count, status, lat, lng",
      )
      .eq("status", "live")
      .neq("id", data.id)
      .limit(4)
      .then(({ data }) => Promise.all((data ?? []).map((r) => restaurantFromRow(r)))),
  ]);

  const emptyIntelligence: ReviewIntelligence | null = null;
  const reviews: Review[] = [];

  return {
    ...base,
    lat: Number(data.lat ?? 0),
    lng: Number(data.lng ?? 0),
    description: (data.description as string) ?? "",
    photos,
    schedule: (data.schedule as { days: string; hours: string }[]) ?? [],
    address: (data.address as string) ?? "",
    tags: (data.tags as string[]) ?? [],
    reviewIntelligence: emptyIntelligence,
    reviews,
    nearby,
    websiteUrl: (data.website_url as string) ?? undefined,
    menuPdfUrl: undefined,
  };
}

async function dbGetMenu(slug: string): Promise<Menu | null> {
  const sb = supabaseAnon()!;
  const { data: r } = await sb
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "live")
    .maybeSingle();
  if (!r) return null;

  const [{ data: menuRow }, { data: sectionsRaw }, { data: itemsRaw }] =
    await Promise.all([
      sb
        .from("menus")
        .select("currency, hero_note")
        .eq("restaurant_id", r.id)
        .maybeSingle(),
      sb
        .from("menu_sections")
        .select("id, name, intro, sort_order")
        .eq("restaurant_id", r.id)
        .order("sort_order"),
      sb
        .from("menu_items")
        .select(
          "id, section_id, name, description, price_cents, dietary_tags, is_chef_pick, photo_storage_path, sort_order, is_available",
        )
        .eq("restaurant_id", r.id)
        .eq("is_available", true)
        .order("sort_order"),
    ]);

  if (!menuRow || !sectionsRaw || sectionsRaw.length === 0) return null;

  const sections: MenuSection[] = sectionsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    intro: s.intro ?? undefined,
  }));

  const items: MenuItem[] = (itemsRaw ?? []).map((i) => ({
    id: i.id,
    sectionId: i.section_id,
    name: i.name,
    description: i.description ?? "",
    price: Math.round(i.price_cents / 100),
    photoUrl: resolvePhotoUrl(i.photo_storage_path) ?? undefined,
    tags: toTagsPublic(i.dietary_tags ?? [], i.is_chef_pick),
  }));

  return {
    restaurantId: r.id,
    currency: (menuRow.currency as Menu["currency"]) ?? "lei",
    sections,
    items,
    heroNote: (menuRow.hero_note as string) ?? undefined,
  };
}

function toTagsPublic(
  tags: string[],
  isChefPick: boolean,
): import("@/lib/types").MenuDietaryTag[] {
  const mapped = tags.map((t) =>
    t === "gluten_free" ? "gluten-free" : t === "chef_pick" ? "chef-pick" : t,
  ) as import("@/lib/types").MenuDietaryTag[];
  if (isChefPick && !mapped.includes("chef-pick")) mapped.push("chef-pick");
  return mapped;
}

// ── public API ──────────────────────────────────────────────────────────

export async function getRestaurants(): Promise<Restaurant[]> {
  if (dbActive()) return dbGetRestaurants();
  return Promise.resolve(mock.getRestaurants());
}

export async function getTrendingRestaurants(): Promise<Restaurant[]> {
  if (dbActive()) {
    const all = await dbGetRestaurants();
    return all
      .slice()
      .sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0))
      .slice(0, 8);
  }
  return Promise.resolve(mock.getTrendingRestaurants());
}

export async function getNewRestaurants(): Promise<Restaurant[]> {
  if (dbActive()) {
    const all = await dbGetRestaurants();
    return all.slice(-4);
  }
  return Promise.resolve(mock.getNewRestaurants());
}

export async function getOpenNowRestaurants(): Promise<Restaurant[]> {
  if (dbActive()) {
    // Simplified for Phase 2 — availability is checked per-booking, not live.
    return dbGetRestaurants();
  }
  return Promise.resolve(mock.getOpenNowRestaurants());
}

export async function getRestaurantBySlug(
  slug: string,
): Promise<Restaurant | null> {
  if (dbActive()) return dbGetRestaurantBySlug(slug);
  return Promise.resolve(mock.getRestaurantBySlug(slug));
}

export async function getRestaurantDetail(
  slug: string,
): Promise<RestaurantDetail | null> {
  if (dbActive()) return dbGetRestaurantDetail(slug);
  return Promise.resolve(mock.getRestaurantDetail(slug));
}

export async function getCardReviewData(slug: string) {
  if (dbActive()) {
    return {
      reviewSnippet: undefined,
      topDimensionLabel: undefined,
      topDimensionPercent: undefined,
    };
  }
  return Promise.resolve(mock.getCardReviewData(slug));
}

export async function getMenu(slug: string): Promise<Menu | null> {
  if (dbActive()) return dbGetMenu(slug);
  return Promise.resolve(menuMock.getMenu(slug));
}

export async function hasMenu(slug: string): Promise<boolean> {
  if (dbActive()) {
    const m = await dbGetMenu(slug);
    return m !== null;
  }
  return Promise.resolve(menuMock.hasMenu(slug));
}

export interface RestaurantSeoData {
  phone: string | null;
  countryCode: string;
  availability: AvailabilitySlot[];
  hasMenu: boolean;
}

/**
 * Fields needed to build SEO metadata + JSON-LD that aren't in
 * `RestaurantDetail`: phone (from `restaurants.phone`), country code
 * (from `cities.country_code`), structured opening hours (from
 * `restaurant_availability`), and whether a menu exists.
 *
 * In mock mode, returns sensible Romanian defaults so dev pages still
 * render valid (if sparse) structured data.
 */
export async function getRestaurantSeoData(
  slug: string,
): Promise<RestaurantSeoData> {
  if (dbActive()) {
    const sb = supabaseAnon()!;
    const { data: r } = await sb
      .from("restaurants")
      .select("id, phone, cities!inner(country_code)")
      .eq("slug", slug)
      .eq("status", "live")
      .maybeSingle();

    if (!r) {
      return {
        phone: null,
        countryCode: "RO",
        availability: [],
        hasMenu: false,
      };
    }

    const restaurantId = (r as { id: string }).id;
    const [{ data: avail }, hasMenuResult] = await Promise.all([
      sb
        .from("restaurant_availability")
        .select("day_of_week, slot_start, slot_end")
        .eq("restaurant_id", restaurantId)
        .order("day_of_week")
        .order("slot_start"),
      hasMenu(slug),
    ]);

    // Supabase types `!inner` joins as array-or-object depending on cardinality;
    // accept either shape and pick the first city.
    const citiesField = (r as unknown as { cities: { country_code: string } | { country_code: string }[] }).cities;
    const city = Array.isArray(citiesField) ? citiesField[0] : citiesField;
    return {
      phone: (r as unknown as { phone: string | null }).phone,
      countryCode: city?.country_code ?? "RO",
      availability: (avail ?? []).map((row: Record<string, unknown>) => ({
        dayOfWeek: Number(row.day_of_week),
        slotStart: row.slot_start as string,
        slotEnd: row.slot_end as string,
      })),
      hasMenu: hasMenuResult,
    };
  }

  return {
    phone: null,
    countryCode: "RO",
    availability: [],
    hasMenu: menuMock.hasMenu(slug),
  };
}

export interface SitemapEntry {
  citySlug: string;
  slug: string;
  updatedAt: Date;
}

/**
 * All live restaurants paired with their URL city slug and last-modified
 * timestamp — the shape `app/sitemap.ts` needs to enumerate detail pages.
 */
export async function getSitemapRestaurants(): Promise<SitemapEntry[]> {
  if (dbActive()) {
    const sb = supabaseAnon()!;
    const { data } = await sb
      .from("restaurants")
      .select("slug, updated_at, cities!inner(slug)")
      .eq("status", "live");
    return (data ?? []).map((r: Record<string, unknown>) => {
      const citiesField = r.cities as { slug: string } | { slug: string }[];
      const city = Array.isArray(citiesField) ? citiesField[0] : citiesField;
      return {
        citySlug: city.slug,
        slug: r.slug as string,
        updatedAt: new Date((r.updated_at as string) ?? Date.now()),
      };
    });
  }
  // Mock mode: every demo restaurant lives under /bucuresti.
  const now = new Date();
  return mock.getRestaurants().map((r) => ({
    citySlug: "bucuresti",
    slug: r.slug,
    updatedAt: now,
  }));
}
