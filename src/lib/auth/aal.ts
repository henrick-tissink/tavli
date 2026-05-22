/**
 * requireAAL2 — local JWT inspection for AAL state.
 *
 * Used by impersonation start (admin must be AAL2 before starting) and by
 * the proxy AAL2 gate. No network call; reads claims from the cached session.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireAAL2(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal2";
}
