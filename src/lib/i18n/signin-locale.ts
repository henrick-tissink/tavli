/**
 * Locale reconciliation at sign-in: "what you see at sign-in is what you get
 * after sign-in".
 *
 * Pre-auth pages render in the NEXT_LOCALE cookie's language (settable via the
 * AuthLocaleSwitcher), so the cookie is the user's current visible context.
 * Previously sign-in overwrote that cookie with `profiles.locale` — a column
 * that defaults to 'ro' and may never have been chosen — flipping the UI
 * language mid-flow.
 *
 * Rules:
 * - Valid cookie present → it wins; persist it into the profile if different
 *   (so the choice sticks across devices). Cookie untouched.
 * - No/invalid cookie → set it from the profile (returning user, fresh device).
 *
 * The sidebar LocaleSwitcher (preference mode) remains the explicit override.
 */

import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { isLocale, type Locale } from "./locale";
import { setLocaleCookie, LOCALE_COOKIE } from "./cookie";
import { dbAdmin } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";

interface Deps {
  readCookie: () => Promise<string | undefined>;
  setCookie: (locale: Locale) => Promise<void>;
  updateProfileLocale: (userId: string, locale: Locale) => Promise<void>;
}

export function makeReconcileSignInLocale(deps: Deps) {
  return async function reconcileSignInLocale(
    userId: string,
    profileLocale: string | null | undefined,
  ): Promise<void> {
    // Strictly best-effort: this runs on the sign-in critical path before
    // redirect(), and a locale-preference write must never abort a valid
    // sign-in (e.g. DATABASE_URL absent, transient DB error).
    try {
      const cookieValue = await deps.readCookie();
      if (cookieValue && isLocale(cookieValue)) {
        if (cookieValue !== profileLocale) {
          await deps.updateProfileLocale(userId, cookieValue);
        }
        return;
      }
      if (profileLocale && isLocale(profileLocale)) {
        await deps.setCookie(profileLocale);
      }
    } catch (err) {
      console.error("reconcileSignInLocale: best-effort locale sync failed", err);
    }
  };
}

export const reconcileSignInLocale = makeReconcileSignInLocale({
  readCookie: async () => (await cookies()).get(LOCALE_COOKIE)?.value,
  setCookie: setLocaleCookie,
  updateProfileLocale: async (userId, locale) => {
    // Mirrors the repo layer's mock/db switch (like the translations and
    // telemetry helpers): no service-client writes in mock mode.
    if (process.env.NEXT_PUBLIC_USE_DB !== "true") return;
    await dbAdmin.update(profiles).set({ locale }).where(eq(profiles.id, userId));
  },
});
