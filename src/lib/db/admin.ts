/**
 * Service-role Supabase client. Bypasses RLS.
 * ONLY use from server-only code — NEVER ship to the browser.
 * Used by: claim_invitation RPC call, signed upload URL issuance, seed scripts.
 *
 * Also exports `dbAdmin` — the Drizzle service-role client used by typed
 * repos under `src/lib/repos/`. Lazily initialised on first access so test
 * suites that mock `@/lib/db/admin` (or never touch repos) don't pay the
 * connection cost.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service-role env vars missing. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server-only).",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ─── Drizzle service-role client ─────────────────────────────────────────
// Used by typed repos (corporate-clients-repo, event-requests-repo, etc.). Bypasses
// RLS because it connects with the Postgres superuser via DATABASE_URL.
// Lazily constructed via a JS Proxy so importing this module is free —
// tests that don't touch the DB pay nothing, and the connection only opens
// the first time someone reads a method off `dbAdmin`.

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _dbAdmin: DrizzleClient | null = null;

function getDbAdmin(): DrizzleClient {
  if (_dbAdmin) return _dbAdmin;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL missing. Set it to your Supabase Postgres connection string.",
    );
  }
  // See drizzle.ts: combined pool size kept under the session-pooler cap (15)
  // with idle_timeout to avoid leaking connections across dev HMR reloads.
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  _dbAdmin = drizzle(client, { schema });
  return _dbAdmin;
}

export const dbAdmin = new Proxy({} as DrizzleClient, {
  get(_target, prop) {
    return Reflect.get(getDbAdmin(), prop);
  },
});
