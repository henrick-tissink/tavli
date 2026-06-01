import "server-only";
import { type Locale, isLocale } from "./locale";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * The signed-in user's profile locale, or null if not signed in / not a supported
 * value. `getCurrentSession` returns null gracefully when unauthenticated or when
 * Supabase env is absent, so pre-auth (app) pages (sign-in, onboarding) fall
 * through to cookie/Accept-Language.
 */
export async function getSessionLocale(): Promise<Locale | null> {
  const session = await getCurrentSession();
  const locale = session?.profile.locale;
  return locale && isLocale(locale) ? locale : null;
}
