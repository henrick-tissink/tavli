"use server";

import { eq } from "drizzle-orm";
import { type Locale } from "@/lib/i18n/locale";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";

/**
 * Set the app locale: cookie always; profiles.locale when signed in.
 *
 * Deliberately does NOT revalidate. `revalidatePath("/", "layout")` invalidates
 * the `_N_T_/layout` soft tag carried by every route, including the prerendered
 * `(public)/[lang]` storefront — which then 404s until the next deploy. Callers
 * refresh their own route instead (see LocaleSwitcher / AuthLocaleSwitcher);
 * that is sufficient because every locale-varying public page has its own URL,
 * and the partner/admin pages that don't are dynamic.
 */
export async function setAppLocale(locale: Locale) {
  await setLocaleCookie(locale);
  const session = await getCurrentSession();
  if (session) {
    await dbAdmin.update(profiles).set({ locale }).where(eq(profiles.id, session.userId));
  }
}
