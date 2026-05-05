import { config } from "dotenv";
config({ path: ".env.prod" });

import { createClient } from "@supabase/supabase-js";

const EMAIL = process.env.TEST_PARTNER_EMAIL ?? "";
const PASSWORD = process.env.TEST_PARTNER_PASSWORD ?? "";
const FULL_NAME = process.env.TEST_PARTNER_NAME ?? "Claude QA";
const RESTAURANT_NAME = process.env.TEST_RESTAURANT_NAME ?? "Tavli Test Kitchen (internal)";
const RESTAURANT_SLUG = process.env.TEST_RESTAURANT_SLUG ?? "tavli-claude-qa";
const RESTAURANT_CITY = process.env.TEST_RESTAURANT_CITY ?? "bucuresti";
const RESTAURANT_STATUS =
  (process.env.TEST_RESTAURANT_STATUS as "draft" | "live") ?? "live";

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("TEST_PARTNER_EMAIL and TEST_PARTNER_PASSWORD env vars are required.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. auth user (idempotent)
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === EMAIL);

  let userId: string;
  if (found) {
    userId = found.id;
    console.log(`✓ auth user already exists: ${EMAIL} (${userId.slice(0, 8)}…)`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    userId = data.user.id;
    console.log(`✓ created auth user: ${EMAIL}`);
  }

  // 2. profile (the on_auth_user_created trigger seeds id+email; we update role + full_name)
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: EMAIL,
        full_name: FULL_NAME,
        role: "restaurant_owner",
      },
      { onConflict: "id" },
    );
  if (profileErr) throw profileErr;
  console.log(`✓ profile set: role=restaurant_owner`);

  // 3. city
  const { data: city, error: cityErr } = await admin
    .from("cities")
    .select("id")
    .eq("slug", RESTAURANT_CITY)
    .maybeSingle();
  if (cityErr || !city) throw cityErr ?? new Error(`city not found: ${RESTAURANT_CITY}`);

  // 4. restaurant (idempotent on slug+city_id)
  const { data: existingRestaurant } = await admin
    .from("restaurants")
    .select("id, status")
    .eq("slug", RESTAURANT_SLUG)
    .eq("city_id", city.id)
    .maybeSingle();

  let restaurantId: string;
  if (existingRestaurant) {
    restaurantId = existingRestaurant.id;
    const { error: updErr } = await admin
      .from("restaurants")
      .update({
        owner_user_id: userId,
        status: RESTAURANT_STATUS,
      })
      .eq("id", restaurantId);
    if (updErr) throw updErr;
    console.log(
      `✓ restaurant already exists: ${RESTAURANT_SLUG} (${restaurantId.slice(0, 8)}…) — refreshed owner+status`,
    );
  } else {
    const { data: newRestaurant, error: insErr } = await admin
      .from("restaurants")
      .insert({
        slug: RESTAURANT_SLUG,
        name: RESTAURANT_NAME,
        cuisines: ["Test"],
        city_id: city.id,
        owner_user_id: userId,
        status: RESTAURANT_STATUS,
        description: "Internal test restaurant — Claude QA partner. Not a real venue.",
        email: EMAIL,
        price_level: 2,
      })
      .select("id")
      .single();
    if (insErr || !newRestaurant) throw insErr ?? new Error("insert returned no restaurant");
    restaurantId = newRestaurant.id;
    console.log(`✓ created restaurant: ${RESTAURANT_SLUG} (${restaurantId.slice(0, 8)}…)`);
  }

  console.log("\n— Test partner credentials —");
  console.log(`  email:        ${EMAIL}`);
  console.log(`  password:     ${PASSWORD}`);
  console.log(`  restaurant:   ${RESTAURANT_NAME}`);
  console.log(`  slug:         ${RESTAURANT_CITY}/${RESTAURANT_SLUG}`);
  console.log(`  status:       ${RESTAURANT_STATUS}`);
  console.log(`  partner UI:   https://tavli.ro/partner/sign-in`);
  console.log(`  diner menu:   https://tavli.ro/${RESTAURANT_CITY}/${RESTAURANT_SLUG}/menu\n`);
}

main().catch((err) => {
  console.error("create-test-partner failed:", err);
  process.exit(1);
});
