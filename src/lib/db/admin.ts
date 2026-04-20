/**
 * Service-role Supabase client. Bypasses RLS.
 * ONLY use from server-only code — NEVER ship to the browser.
 * Used by: claim_invitation RPC call, signed upload URL issuance, seed scripts.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";

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
