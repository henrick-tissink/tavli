import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  matchLocale,
  type Locale,
} from "./locale";
import { getSessionLocale } from "./session-locale";

/**
 * Resolve the active locale for the `(app)` route group (partner + admin).
 *
 * Unlike the consumer `(public)/[lang]` tree, `(app)` pages have no URL locale
 * segment — the locale comes from the signed-in user's preference, falling back
 * to the cookie, then the request's Accept-Language, then the default. This
 * order covers both post-auth pages (profile locale wins) and pre-auth pages
 * (sign-in, onboarding) where there is no session yet.
 *
 * Used by the `(app)` root layout (for `<html lang>`) and by the partner shell
 * to build the client message bundle, so both agree on one resolved locale.
 */
export async function resolveAppLocale(): Promise<Locale> {
  const sessionLocale = await getSessionLocale();
  if (sessionLocale) return sessionLocale;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  return matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}
