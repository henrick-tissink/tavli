/**
 * DB fixtures for Playwright specs. Connects directly to the local Supabase
 * Postgres (port 54322) with admin credentials. Each fixture cleans up its
 * own rows so reruns don't leak state.
 */

import postgres from "postgres";

const DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(DB_URL, { prepare: false, max: 2 });

export interface EventVenue {
  id: string;
  slug: string;
  citySlug: string;
}

/**
 * Insert (or reuse by slug) a live restaurant with events_intake_enabled.
 * Returns the venue identifiers needed to navigate to its detail page.
 */
export async function seedEventVenue(slugHint: string): Promise<EventVenue> {
  const [city] = await sql<{ id: string; slug: string }[]>`
    INSERT INTO cities (slug, name, country_code)
    VALUES ('e2e-city', 'E2E City', 'RO')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name
    RETURNING id, slug
  `;

  const slug = `e2e-${slugHint}-${Date.now()}`;
  const [r] = await sql<{ id: string; slug: string }[]>`
    INSERT INTO restaurants (slug, name, city_id, status, events_intake_enabled)
    VALUES (${slug}, ${"E2E Test Venue"}, ${city.id}, 'live', true)
    RETURNING id, slug
  `;

  return { id: r.id, slug: r.slug, citySlug: city.slug };
}

export async function cleanupVenue(id: string): Promise<void> {
  await sql`DELETE FROM event_requests WHERE restaurant_id = ${id}`;
  await sql`DELETE FROM restaurants WHERE id = ${id}`;
}

export async function disposeFixturesDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
