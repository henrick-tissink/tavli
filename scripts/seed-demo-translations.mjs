/**
 * Seed EN + DE translations for the demo restaurants' content
 * (descriptions, hero notes, menu section names/intros, menu item
 * names/descriptions) into the *_translations override tables.
 *
 * The base tables hold the Romanian source; non-RO locales fall back to RO
 * unless an override row exists. This script writes those override rows so the
 * EN/DE storefront renders translated restaurant content.
 *
 * Data: scripts/data/demo-translations.json — keyed by the CURRENT demo DB's
 * restaurant/section/item UUIDs (regenerate if the demo venues are reseeded).
 * Idempotent: ON CONFLICT DO UPDATE, so it can be re-run safely.
 *
 * Run:  node scripts/seed-demo-translations.mjs [path-to-env]   (default .env.demo)
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envFile = process.argv[2] || ".env.demo";
process.loadEnvFile(envFile);
const data = JSON.parse(
  readFileSync(new URL("./data/demo-translations.json", import.meta.url), "utf8"),
);
const LOCALES = ["en", "de"];
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 4 });

let rt = 0,
  mt = 0,
  st = 0,
  it = 0;
try {
  for (const r of data) {
    for (const loc of LOCALES) {
      const dl = r.descriptionLong?.[loc] ?? null;
      const hs = r.heroSubtitle?.[loc] ?? null;
      await sql`
        insert into restaurant_translations (restaurant_id, locale, description_long, hero_subtitle, updated_at)
        values (${r.id}, ${loc}, ${dl}, ${hs}, now())
        on conflict (restaurant_id, locale) do update set
          description_long = excluded.description_long,
          hero_subtitle = excluded.hero_subtitle,
          updated_at = now()`;
      rt++;
      if (hs) {
        await sql`
          insert into menu_translations (restaurant_id, locale, hero_note, updated_at)
          values (${r.id}, ${loc}, ${hs}, now())
          on conflict (restaurant_id, locale) do update set
            hero_note = excluded.hero_note, updated_at = now()`;
        mt++;
      }
    }
    for (const s of r.sections ?? []) {
      for (const loc of LOCALES) {
        await sql`
          insert into menu_section_translations (section_id, locale, name, intro, updated_at)
          values (${s.id}, ${loc}, ${s.name?.[loc] ?? null}, ${s.intro?.[loc] ?? null}, now())
          on conflict (section_id, locale) do update set
            name = excluded.name, intro = excluded.intro, updated_at = now()`;
        st++;
      }
    }
    for (const item of r.items ?? []) {
      for (const loc of LOCALES) {
        await sql`
          insert into menu_item_translations (item_id, locale, name, description, updated_at)
          values (${item.id}, ${loc}, ${item.name?.[loc] ?? null}, ${item.description?.[loc] ?? null}, now())
          on conflict (item_id, locale) do update set
            name = excluded.name, description = excluded.description, updated_at = now()`;
        it++;
      }
    }
  }
  console.log(
    `Upserted: restaurant_translations=${rt} menu_translations=${mt} section_translations=${st} item_translations=${it}`,
  );
} finally {
  await sql.end();
}
