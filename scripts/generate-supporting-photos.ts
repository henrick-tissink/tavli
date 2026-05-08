/**
 * Generates photography for the 11 supporting demo restaurants — hero, 5
 * gallery shots, 6 dish shots per restaurant — via Replicate's FLUX 1.1 Pro,
 * uploads results to Supabase Storage, and writes paths into restaurant_photos
 * and menu_items.photo_storage_path.
 *
 * Idempotent: gap-fill mode by default (skips paths/items already present).
 * `--force` regenerates everything for a single restaurant or all.
 *
 * Filtering:
 *   --slug=<slug>    only that one supporting restaurant (e.g. --slug=verde)
 *   --force          regenerate already-present photos
 *
 * Cost: ~132 images × ~$0.04 ≈ $5.28 for a full clean run.
 *
 * Required env (in .env.prod): REPLICATE_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
config({ path: ".env.prod" });
import { createClient } from "@supabase/supabase-js";
import { SUPPORTING_RESTAURANTS, type RestaurantSpec } from "./data/supporting-restaurants";

const CITY_SLUG = "bucuresti";
const BUCKET = "restaurant-photos";
const MODEL = "black-forest-labs/flux-1.1-pro";

type AspectRatio = "1:1" | "3:2" | "16:9" | "4:3";

async function generateImage(prompt: string, aspectRatio: AspectRatio): Promise<Uint8Array> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN missing");

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

async function processRestaurant(spec: RestaurantSpec, opts: { force: boolean }) {
  const supabase = makeSupabase();
  const { data: city } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", CITY_SLUG)
    .maybeSingle();
  if (!city) throw new Error(`city not found: ${CITY_SLUG}`);

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", spec.slug)
    .eq("city_id", city.id)
    .maybeSingle();
  if (!restaurant) {
    console.log(`  ⚠ restaurant ${spec.slug} not seeded yet — skipping`);
    return;
  }

  // ── restaurant photos: hero + gallery ──
  type PhotoSpec = {
    filename: string;
    kind: "hero" | "gallery";
    altText: string;
    aspectRatio: AspectRatio;
    prompt: string;
  };
  const photos: PhotoSpec[] = [
    {
      filename: "hero.webp",
      kind: "hero",
      altText: `${spec.name} — interior`,
      aspectRatio: "16:9",
      prompt: spec.photoPrompts.hero,
    },
    ...spec.photoPrompts.gallery.map((prompt, idx) => ({
      filename: `gallery-${idx + 1}.webp`,
      kind: "gallery" as const,
      altText: `${spec.name} — atmosferă ${idx + 1}`,
      aspectRatio: "3:2" as AspectRatio,
      prompt,
    })),
  ];

  if (opts.force) {
    await supabase.from("restaurant_photos").delete().eq("restaurant_id", restaurant.id);
  }

  const { data: existingPhotos } = await supabase
    .from("restaurant_photos")
    .select("storage_path, sort_order")
    .eq("restaurant_id", restaurant.id);
  const existingPaths = new Set((existingPhotos ?? []).map((p) => p.storage_path));
  const maxSortOrder = (existingPhotos ?? []).reduce(
    (acc, p) => Math.max(acc, p.sort_order),
    -1,
  );

  const photosToDo = opts.force
    ? photos
    : photos.filter((s) => !existingPaths.has(`${spec.slug}/${s.filename}`));

  console.log(
    `  restaurant photos: ${photosToDo.length}/${photos.length} to generate${
      opts.force ? " (--force)" : ""
    }`,
  );
  let sortOrder = opts.force ? 0 : maxSortOrder + 1;
  for (const p of photosToDo) {
    const path = `${spec.slug}/${p.filename}`;
    process.stdout.write(`    · ${p.filename} (${p.kind})… `);
    const bytes = await generateImage(p.prompt, p.aspectRatio);
    await uploadToStorage(path, bytes);
    const { error } = await supabase.from("restaurant_photos").insert({
      restaurant_id: restaurant.id,
      storage_path: path,
      kind: p.kind,
      sort_order: sortOrder++,
      alt_text: p.altText,
      bytes: bytes.length,
    });
    if (error) throw error;
    console.log(`✓ (${(bytes.length / 1024).toFixed(0)}kb)`);
  }

  // ── menu item photos ──
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, photo_storage_path")
    .eq("restaurant_id", restaurant.id);
  if (!items) throw new Error(`no menu items for ${spec.slug}`);

  const promptByName = new Map(spec.photoPrompts.dishes.map((d) => [d.itemName, d.prompt]));
  const itemsToDo = opts.force ? items : items.filter((i) => !i.photo_storage_path);
  const itemsWithPrompts = itemsToDo.filter((i) => promptByName.has(i.name));

  console.log(
    `  menu items: ${itemsWithPrompts.length}/${items.length} to generate (${
      itemsToDo.length - itemsWithPrompts.length
    } unmapped)`,
  );
  for (const item of itemsWithPrompts) {
    const prompt = promptByName.get(item.name)!;
    const path = `${spec.slug}/items/${item.id}.webp`;
    process.stdout.write(`    · ${item.name.slice(0, 50)}… `);
    const bytes = await generateImage(prompt, "3:2");
    await uploadToStorage(path, bytes);
    await supabase.from("menu_items").update({ photo_storage_path: path }).eq("id", item.id);
    console.log(`✓ (${(bytes.length / 1024).toFixed(0)}kb)`);
  }

  // Refresh denormalized photo_count.
  await supabase
    .from("restaurants")
    .update({ photo_count: photos.length })
    .eq("id", restaurant.id);
}

async function main() {
  const force = process.argv.includes("--force");
  const slugArg = process.argv.find((a) => a.startsWith("--slug="));
  const onlySlug = slugArg?.split("=")[1];

  const targets = onlySlug
    ? SUPPORTING_RESTAURANTS.filter((s) => s.slug === onlySlug)
    : SUPPORTING_RESTAURANTS;
  if (onlySlug && targets.length === 0) {
    throw new Error(`no supporting restaurant matches --slug=${onlySlug}`);
  }

  console.log(
    `→ generating photos for ${targets.length} restaurant(s)${force ? " (--force)" : ""}`,
  );

  for (const spec of targets) {
    console.log(`\n━ ${spec.name} (${spec.slug}) ━`);
    await processRestaurant(spec, { force });
  }

  console.log(`\n— done —`);
  console.log(`  discovery: https://tavli.ro/${CITY_SLUG}\n`);
}

main().catch((err) => {
  console.error("\ngenerate-supporting-photos failed:", err);
  process.exit(1);
});
