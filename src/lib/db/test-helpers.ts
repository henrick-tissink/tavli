/**
 * Test-only Supabase client factory that impersonates a user (or anon) for
 * RLS-policy integration tests.
 *
 * Strategy: mint a short-lived HS256 JWT using `SUPABASE_JWT_SECRET` (or
 * the local-stack default if the env var is not set) carrying `sub` and
 * `role`, then attach it to a Supabase JS client as an Authorization
 * header. The local PostgREST validates the JWT and applies RLS as if the
 * user signed in via the normal auth flow.
 *
 * Not exported from production code — only invoked by `*-rls.test.ts`
 * suites that need to verify policy boundaries directly.
 */

import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function mintJwt(userId: string | null): string {
  const secret = process.env.SUPABASE_JWT_SECRET ?? LOCAL_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify(
      userId
        ? {
            aud: "authenticated",
            role: "authenticated",
            sub: userId,
            iat: now,
            exp: now + 3600,
          }
        : {
            aud: "authenticated",
            role: "anon",
            iat: now,
            exp: now + 3600,
          },
    ),
  );
  const signed = `${header}.${payload}`;
  const sig = base64Url(createHmac("sha256", secret).update(signed).digest());
  return `${signed}.${sig}`;
}

/**
 * Build a Supabase client that talks to the local PostgREST as `userId`
 * (or anonymously when `userId === null`). RLS applies as it would for a
 * real signed-in user.
 */
export function createClientForUser(userId: string | null): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "createClientForUser: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }
  const jwt = mintJwt(userId);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
