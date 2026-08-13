/**
 * City lookup for the public storefront.
 *
 * `[city]` is a catch-all dynamic segment, so before this existed every slug
 * rendered a full, crawlable city page — `/never-was-a-city-xyz` returned 200
 * with a branded hero and an empty venue list. That is an unbounded set of
 * doorway pages, and it survived deleting the rows that created them (the
 * route never consulted the table at all).
 *
 * "Served" means what the database already means by public visibility: the
 * `cities_public_read` RLS policy is `using (is_active = true or is_admin())`,
 * so an anonymous read returns exactly the launched cities. Inactive seeds
 * (cluj, timisoara, brasov, iasi, istanbul at time of writing) are therefore
 * not served — which is the same answer the storefront gives everywhere else.
 */

import { cache } from "react";
import { supabaseAnon } from "@/lib/db/anon";
import { getMessages } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

const USE_DB = process.env.NEXT_PUBLIC_USE_DB === "true";

/**
 * Mock-mode source of truth: the `common.cities` i18n catalogue. Local dev runs
 * with NEXT_PUBLIC_USE_DB=false and no Supabase, and must not 404 every page.
 */
function catalogueSlugs(): string[] {
  return Object.keys(getMessages(DEFAULT_LOCALE, "common").cities as Record<string, string>);
}

/**
 * Whether the storefront serves this city slug.
 *
 * Fails OPEN: if the lookup errors, we return true and render the page. A
 * transient database problem must never turn the whole storefront into 404s —
 * that failure mode already cost nine days of downtime once, when a bad
 * revalidate call left the prerendered [lang] routes permanently missing.
 * Serving a stale-but-real city page is strictly better than a blank site.
 */
export const isServedCity = cache(async (slug: string): Promise<boolean> => {
  if (!slug) return false;

  const sb = USE_DB ? supabaseAnon() : null;
  if (!sb) return catalogueSlugs().includes(slug);

  try {
    const { data, error } = await sb.from("cities").select("slug").eq("slug", slug).limit(1);
    if (error) {
      console.error("[cities] lookup failed, serving anyway:", error.message);
      return true;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error("[cities] lookup threw, serving anyway:", err);
    return true;
  }
});
