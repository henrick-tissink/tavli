/**
 * Production bootstrap — the minimum rows a live Tavli needs to function.
 *
 * This is deliberately NOT `db:seed`. That script inserts the mock catalogue
 * (restaurants, photos, menus, reviews) which is right for local and demo and
 * wrong for production: it would publish invented venues on the live
 * storefront. Real venues arrive through partner onboarding.
 *
 * What this creates, and why each is load-bearing:
 *
 *   1. cities — /partner/sign-up requires cityId and the storefront routes on
 *      the city slug. With an empty cities table, self-serve signup is
 *      impossible: the select renders only its placeholder.
 *
 *   2. A platform organization — transactional email needs an org to attribute
 *      to. src/lib/email/send-transactional.ts refuses to send when there is
 *      neither an organization_id in context nor a PLATFORM_ORG_ID env var,
 *      and platform mail (verification, welcome) has no tenant org. Without
 *      it those emails are dropped before Resend is ever called.
 *
 * Idempotent: cities upsert on slug, the org is looked up by its contact
 * address before insert. Safe to re-run.
 *
 * Usage:
 *   DATABASE_URL='postgres://…prod…' npx tsx scripts/bootstrap-prod.ts
 *
 * It prints the platform org UUID at the end. Set that as PLATFORM_ORG_ID in
 * the deployment environment and redeploy, or email stays broken.
 *
 * Add --activate-cluj (etc.) to flip additional cities live; by default only
 * București is active, matching the launch plan.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { cities, organizations } from "../src/lib/db/schema";

const PLATFORM_ORG_EMAIL = "hello@tavli.ro";
const PLATFORM_ORG_NAME = "Tavli Platform";

/**
 * Only București is active. The rest exist so a partner in another city can be
 * onboarded without a migration, but they stay hidden from the storefront
 * until you choose to launch them.
 */
const CITY_ROWS = [
  { slug: "bucuresti", name: "București", countryCode: "RO", isActive: true, defaultLat: "44.4268", defaultLng: "26.1025" },
  { slug: "cluj", name: "Cluj", countryCode: "RO", isActive: false, defaultLat: "46.7712", defaultLng: "23.6236" },
  { slug: "timisoara", name: "Timișoara", countryCode: "RO", isActive: false, defaultLat: "45.7489", defaultLng: "21.2087" },
  { slug: "brasov", name: "Brașov", countryCode: "RO", isActive: false, defaultLat: "45.6427", defaultLng: "25.5887" },
  { slug: "iasi", name: "Iași", countryCode: "RO", isActive: false, defaultLat: "47.1585", defaultLng: "27.6014" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");

  const host = new URL(url).hostname;
  console.log(`⟳ bootstrapping against ${host}`);

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  try {
    // ── cities ────────────────────────────────────────────────────────────
    for (const c of CITY_ROWS) {
      await db
        .insert(cities)
        .values(c)
        .onConflictDoUpdate({
          target: cities.slug,
          // Deliberately does NOT overwrite is_active: if you have already
          // launched a city, re-running must not silently take it offline.
          set: { name: c.name, countryCode: c.countryCode },
        });
    }
    const active = await db
      .select({ slug: cities.slug, name: cities.name, isActive: cities.isActive })
      .from(cities);
    console.log(`  ✓ cities: ${active.length} rows (active: ${active.filter((c) => c.isActive).map((c) => c.slug).join(", ") || "none"})`);

    // ── platform organization ─────────────────────────────────────────────
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.primaryContactEmail, PLATFORM_ORG_EMAIL))
      .limit(1);

    let orgId = existing[0]?.id;
    if (orgId) {
      console.log("  ✓ platform org already present");
    } else {
      const [created] = await db
        .insert(organizations)
        .values({
          name: PLATFORM_ORG_NAME,
          countryCode: "RO",
          primaryContactEmail: PLATFORM_ORG_EMAIL,
          locale: "ro",
          status: "active",
        })
        .returning({ id: organizations.id });
      orgId = created.id;
      console.log("  ✓ platform org created");
    }

    console.log("\n── next step ──────────────────────────────────────────────");
    console.log("Set this in the deployment environment, then redeploy:\n");
    console.log(`  PLATFORM_ORG_ID=${orgId}\n`);
    console.log("Until it is set, verification and welcome emails are dropped");
    console.log("before Resend is called (see send-transactional.ts).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
