/**
 * Drizzle client for server-only / script contexts where we want typed
 * queries over plain SQL. Connects via Supabase's Postgres URL
 * (DATABASE_URL). Not used from the browser — Supabase RPC/REST covers
 * consumer/partner read paths.
 */

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDrizzle() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL missing. Set it to your Supabase Postgres connection string.",
    );
  }
  // Two pools live in one process (this + dbAdmin); keep their combined size
  // under the Supabase session-pooler cap (15). idle_timeout releases
  // connections promptly so dev HMR churn doesn't leak them (EMAXCONNSESSION).
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
