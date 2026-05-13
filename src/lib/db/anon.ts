/**
 * Lightweight anonymous Supabase client for consumer server-components.
 * No cookies, no session — just reads gated by RLS (anon role sees
 * status='live' restaurants and their children).
 *
 * Also exports `dbAnon` — a Drizzle client used by typed repos for
 * SECURITY DEFINER RPC calls (e.g. `get_event_request_by_token`) and
 * other anonymous lookups. Lazily initialised on first access.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _client: SupabaseClient | null = null;

export function supabaseAnon(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// ─── Drizzle anon client ────────────────────────────────────────────────
// Used by repos to invoke SECURITY DEFINER RPCs (e.g. token-lookup) where
// the function does its own filtering. We share the same DATABASE_URL pool
// as `dbAdmin`; the distinction is stylistic — code that reads from
// `dbAnon` is explicitly saying "this is a public-token / public-read
// path", not "this can bypass RLS for arbitrary tables".
// Lazily constructed via a JS Proxy so importing this module is free.

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _dbAnon: DrizzleClient | null = null;

function getDbAnon(): DrizzleClient {
  if (_dbAnon) return _dbAnon;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL missing. Set it to your Supabase Postgres connection string.",
    );
  }
  const client = postgres(url, { prepare: false, max: 5 });
  _dbAnon = drizzle(client, { schema });
  return _dbAnon;
}

export const dbAnon = new Proxy({} as DrizzleClient, {
  get(_target, prop) {
    return Reflect.get(getDbAnon(), prop);
  },
});
