import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@tavli.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "tavliadmin123";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check if user already exists
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === ADMIN_EMAIL);

  let userId: string;
  if (found) {
    userId = found.id;
    console.log(`✓ admin user already exists: ${ADMIN_EMAIL} (${userId.slice(0, 8)}…)`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Tavli Admin" },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    userId = data.user.id;
    console.log(`✓ created admin user: ${ADMIN_EMAIL}`);
  }

  // Ensure profile exists + role=admin
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      { id: userId, role: "admin", full_name: "Tavli Admin", email: ADMIN_EMAIL },
      { onConflict: "id" },
    );
  if (upsertErr) throw upsertErr;

  console.log("\n— Admin credentials —");
  console.log(`  email:    ${ADMIN_EMAIL}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log(`  sign in:  http://localhost:3000/admin/sign-in\n`);
}

main().catch((err) => {
  console.error("create-admin failed:", err);
  process.exit(1);
});
