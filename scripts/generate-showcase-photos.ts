/**
 * Generates the showcase restaurant's photography (hero + gallery + every
 * menu item) via Replicate's FLUX 1.1 Pro, uploads results to Supabase
 * Storage, and writes the paths into restaurant_photos / menu_items.
 *
 * Idempotent — re-running drops the existing restaurant_photos rows and
 * re-uploads everything from this file's prompt list. Items are matched
 * by exact name against menu_items.
 *
 * Required env (in .env.prod): REPLICATE_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Cost: 19 images × ~$0.04/image ≈ $0.76 per full run.
 */
import { config } from "dotenv";
config({ path: ".env.prod" });
import { createClient } from "@supabase/supabase-js";

const SLUG = "atelier-floreasca";
const CITY_SLUG = "bucuresti";
const BUCKET = "restaurant-photos";
const MODEL = "black-forest-labs/flux-1.1-pro";

const STYLE_FOOD =
  "warm tungsten lighting with subtle window light, dark walnut wood table surface, shallow depth of field, three-quarter angle, editorial food photography, autumnal palette of amber rust and forest green, professional restaurant plating, 35mm full frame, magazine quality, no text no watermarks";

const STYLE_INTERIOR =
  "warm tungsten lighting and candlelight, dark walnut and reclaimed timber surfaces, copper and brass accents, exposed beams, intimate 38-seat Romanian restaurant in Bucharest's Floreasca district, autumnal palette, editorial photography, 35mm full frame, magazine quality, no text no watermarks";

type AspectRatio = "1:1" | "3:2" | "16:9" | "4:3";

interface RestaurantPhotoSpec {
  filename: string;
  kind: "hero" | "gallery" | "venue";
  altText: string;
  aspectRatio: AspectRatio;
  prompt: string;
}

const RESTAURANT_PHOTOS: RestaurantPhotoSpec[] = [
  {
    filename: "hero.webp",
    kind: "hero",
    altText: "Cinematic interior of Atelier Floreasca at dusk",
    aspectRatio: "16:9",
    prompt: `Wide cinematic interior of an intimate Romanian restaurant at dusk, candlelit dark walnut tables set for service, exposed reclaimed wood beams overhead, copper pendant lights glowing warm, open oak shelving displaying natural wine bottles, soft amber atmosphere, no people, ${STYLE_INTERIOR}`,
  },
  {
    filename: "venue-pass.webp",
    kind: "venue",
    altText: "Hands of the chef plating a dish at the copper-topped pass",
    aspectRatio: "3:2",
    prompt: `Hands of a chef plating a dish at a copper-topped kitchen pass, dark walnut surfaces, herbs being placed with tweezers, behind-the-scenes editorial photography, ${STYLE_INTERIOR}`,
  },
  {
    filename: "gallery-table.webp",
    kind: "gallery",
    altText: "A romantic two-person table set with candles and wine",
    aspectRatio: "3:2",
    prompt: `Romantic two-person dining table at dusk, lit candle in copper holder, dark walnut surface with two ceramic plates, hand-blown wine glasses with red wine catching the light, soft focus on cutlery, no people, ${STYLE_INTERIOR}`,
  },
  {
    filename: "gallery-wine.webp",
    kind: "gallery",
    altText: "Open oak shelving of natural Romanian wines",
    aspectRatio: "3:2",
    prompt: `Open oak shelving displaying a curated selection of natural Romanian wine bottles in low warm tungsten light, dark walnut bar surface in foreground with a single decanter, copper accents, ${STYLE_INTERIOR}`,
  },
];

// Keyed by exact menu_items.name as inserted by create-showcase-restaurant.ts
const MENU_ITEM_PROMPTS: Record<string, { aspectRatio: AspectRatio; description: string }> = {
  "Pâine de casă cu unt afumat și sare de Praid": {
    aspectRatio: "3:2",
    description:
      "rustic Romanian sourdough bread with a deeply golden crust, sliced in half showing an airy crumb, alongside a small ceramic ramekin of pale cultured smoked butter swirled with a butter knife, scattered grey salt crystals, fresh thyme sprig",
  },
  "Burrată de Andria, sfeclă coaptă și pesto de leuștean": {
    aspectRatio: "3:2",
    description:
      "creamy whole burrata cheese with a torn opening revealing soft cream center, alongside roasted dark beetroot wedges glazed black with balsamic, vivid green lovage pesto swirled around the plate, scattered toasted hazelnuts",
  },
  "Tartar de vită cu gălbenuș confit și pâine prăjită": {
    aspectRatio: "3:2",
    description:
      "hand-cut beef tartar formed into a neat round mound topped with a glossy orange confit egg yolk, crisp fried capers and tiny diced pickles around it, two slices of brown-buttered toasted bread fanning out on the side",
  },
  "Ciuperci sălbatice pe mămăligă moale": {
    aspectRatio: "3:2",
    description:
      "soft yellow Romanian polenta in a shallow ceramic bowl topped with sautéed wild mushrooms (porcini, chanterelles, morels) glistening with butter, crumbled sheep's milk burduf cheese, fresh chopped dill",
  },
  "Tochitură de porc Mangalița, mămăligă și ou ochi": {
    aspectRatio: "3:2",
    description:
      "slow-braised Mangalitsa pork stew in a small enamel pot with deep mahogany sauce, alongside a mound of yellow polenta with sheep cheese, sunny-side-up egg with bright orange yolk on top, small dish of pickled vegetables",
  },
  "Sarmale aristocratice cu mămăligă și smântână": {
    aspectRatio: "3:2",
    description:
      "three Romanian sarmale rolls wrapped in vine leaves glistening with rich tomato sauce, on a hand-thrown ceramic plate alongside a quenelle of sour cream and a mound of yellow polenta, fresh dill garnish",
  },
  "File de biban-de-mare cu legume de sezon": {
    aspectRatio: "3:2",
    description:
      "pan-seared sea bass fillet with crispy golden skin glazed with brown butter and toasted almonds, beside vivid green peas and three fresh asparagus spears, drizzle of bright green parsley oil",
  },
  "Risotto cu hribi și parmigiano 36 luni": {
    aspectRatio: "3:2",
    description:
      "creamy carnaroli risotto in a shallow ceramic bowl studded with sautéed porcini mushrooms, generous translucent shavings of aged parmigiano on top, drizzle of golden white truffle oil, fresh parsley",
  },
  "Coastă de vită afumată 14 ore": {
    aspectRatio: "3:2",
    description:
      "single smoked beef short rib glazed dark mahogany with red-wine and honey reduction, fork-tender meat pulling away from the bone, alongside golden duck-fat confit potatoes, sprig of rosemary",
  },
  "Papanași cu dulceață de afine și smântână": {
    aspectRatio: "3:2",
    description:
      "two golden fried Romanian papanași donuts stacked, generously topped with thick white sour cream and a glistening dark blueberry compote dripping down the sides, fresh mint leaf garnish",
  },
  "Tartă de mere cu crustă de migdale și înghețată de scorțișoară": {
    aspectRatio: "3:2",
    description:
      "rustic apple tart with golden almond crust, one wedge sliced showing layered caramelized apples, scoop of cinnamon ice cream beginning to melt against the warm crust, dusting of icing sugar",
  },
  "Crème brûlée cu lavandă": {
    aspectRatio: "3:2",
    description:
      "crème brûlée in a small white ramekin with a crisp caramelized brown-sugar crust just cracked open, faint purple lavender hue in the cream beneath, fresh lavender sprig garnish",
  },
  "Fetească Neagră 2021 — Crama Bauer (sticlă)": {
    aspectRatio: "3:2",
    description:
      "an unlabeled bottle of Romanian Fetească Neagră red wine alongside a poured glass on a dark walnut table, soft tungsten lighting catching the deep ruby color, intimate restaurant ambiance behind blurred",
  },
  "Limonadă de soc cu mentă și pepene": {
    aspectRatio: "3:2",
    description:
      "tall glass of cloudy pale-yellow elderflower lemonade with a perfectly clear sphere of ice, fresh mint sprig and a small wedge of bright red watermelon on the rim, condensation on the glass",
  },
  "Espresso de specialitate — Origo": {
    aspectRatio: "3:2",
    description:
      "single espresso shot in a small white ceramic cup with a perfect crema swirling on top, ceramic saucer with a single dark chocolate square, soft window light, intimate restaurant scene behind blurred",
  },
};

// ───── helpers ─────────────────────────────────────────────────────────────

async function generateImage(prompt: string, aspectRatio: AspectRatio): Promise<Uint8Array> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN missing");

  // Kick off prediction (Prefer: wait keeps it synchronous up to 60s).
  // Free-tier accounts are throttled to 1 burst / 6 per minute, so 429 is
  // expected — retry with the server-supplied retry_after.
  let startRes: Response;
  let attempt = 0;
  while (true) {
    startRes = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          output_format: "webp",
          output_quality: 90,
          safety_tolerance: 2,
        },
      }),
    });
    if (startRes.status !== 429 || attempt >= 8) break;
    const body = (await startRes.json().catch(() => ({}))) as { retry_after?: number };
    const waitS = (body.retry_after ?? 12) + 1;
    process.stdout.write(`(429, retry in ${waitS}s) `);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    attempt++;
  }

  if (!startRes.ok) {
    throw new Error(`Replicate ${startRes.status}: ${await startRes.text()}`);
  }

  let prediction = (await startRes.json()) as {
    id: string;
    status: string;
    output: string | string[] | null;
    error: string | null;
    urls: { get: string };
  };

  // Poll if not yet succeeded
  while (prediction.status === "starting" || prediction.status === "processing") {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "no output"}`);
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`fetching image failed: ${imgRes.status}`);
  return new Uint8Array(await imgRes.arrayBuffer());
}

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function uploadToStorage(path: string, bytes: Uint8Array): Promise<void> {
  const supabase = makeSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: "image/webp",
      upsert: true,
    });
  if (error) throw new Error(`storage upload (${path}): ${error.message}`);
}

// ───── main ────────────────────────────────────────────────────────────────

async function main() {
  const supabase = makeSupabase();

  // Resolve restaurant
  const { data: city } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", CITY_SLUG)
    .maybeSingle();
  if (!city) throw new Error(`city not found: ${CITY_SLUG}`);

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", SLUG)
    .eq("city_id", city.id)
    .maybeSingle();
  if (!restaurant) throw new Error(`restaurant not found: ${CITY_SLUG}/${SLUG}`);

  const force = process.argv.includes("--force");

  // ── restaurant photos ──
  // Skip ones already in DB (gap-fill mode); --force regenerates all.
  const { data: existingPhotos } = await supabase
    .from("restaurant_photos")
    .select("storage_path, sort_order")
    .eq("restaurant_id", restaurant.id);
  const existingPaths = new Set((existingPhotos ?? []).map((p) => p.storage_path));
  const maxSortOrder = (existingPhotos ?? []).reduce(
    (acc, p) => Math.max(acc, p.sort_order),
    -1,
  );

  const restaurantToDo = force
    ? RESTAURANT_PHOTOS
    : RESTAURANT_PHOTOS.filter((s) => !existingPaths.has(`${SLUG}/${s.filename}`));

  if (force) {
    await supabase.from("restaurant_photos").delete().eq("restaurant_id", restaurant.id);
  }

  console.log(
    `restaurant photos: ${restaurantToDo.length} to generate, ${
      RESTAURANT_PHOTOS.length - restaurantToDo.length
    } already present${force ? " (--force)" : ""}`,
  );

  let sortOrder = force ? 0 : maxSortOrder + 1;
  for (const spec of restaurantToDo) {
    const path = `${SLUG}/${spec.filename}`;
    process.stdout.write(`  · ${spec.filename} (${spec.kind})… `);
    const bytes = await generateImage(spec.prompt, spec.aspectRatio);
    await uploadToStorage(path, bytes);
    const { error } = await supabase.from("restaurant_photos").insert({
      restaurant_id: restaurant.id,
      storage_path: path,
      kind: spec.kind,
      sort_order: sortOrder++,
      alt_text: spec.altText,
      bytes: bytes.length,
    });
    if (error) throw error;
    console.log(`✓ (${(bytes.length / 1024).toFixed(0)}kb)`);
  }

  // ── menu items ──
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, photo_storage_path")
    .eq("restaurant_id", restaurant.id);
  if (!items) throw new Error("no menu items found");

  const itemsToDo = force ? items : items.filter((i) => !i.photo_storage_path);
  console.log(
    `\nmenu item photos: ${itemsToDo.length} to generate, ${
      items.length - itemsToDo.length
    } already present${force ? " (--force)" : ""}`,
  );
  for (const item of itemsToDo) {
    const spec = MENU_ITEM_PROMPTS[item.name];
    if (!spec) {
      console.log(`  · ${item.name} — SKIPPED (no prompt mapped)`);
      continue;
    }
    const filename = item.id + ".webp";
    const path = `${SLUG}/items/${filename}`;
    process.stdout.write(`  · ${item.name.slice(0, 50)}… `);
    const fullPrompt = `${spec.description}, plated on a hand-thrown ceramic plate with natural texture, ${STYLE_FOOD}`;
    const bytes = await generateImage(fullPrompt, spec.aspectRatio);
    await uploadToStorage(path, bytes);
    await supabase
      .from("menu_items")
      .update({ photo_storage_path: path })
      .eq("id", item.id);
    console.log(`✓ (${(bytes.length / 1024).toFixed(0)}kb)`);
  }

  // Refresh denormalized photo_count
  await supabase
    .from("restaurants")
    .update({ photo_count: RESTAURANT_PHOTOS.length })
    .eq("id", restaurant.id);

  console.log(`\n— done —`);
  console.log(`  detail: https://tavli.ro/${CITY_SLUG}/${SLUG}`);
  console.log(`  menu:   https://tavli.ro/${CITY_SLUG}/${SLUG}/menu`);
}

main().catch((err) => {
  console.error("\ngenerate-showcase-photos failed:", err);
  process.exit(1);
});
