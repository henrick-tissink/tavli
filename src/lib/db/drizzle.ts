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
  const client = postgres(url, { prepare: false, max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
