import { type Locale } from "./locale";

// NOTE: We intentionally do NOT import from ./cookie here — cookie.ts imports
// next/headers at the module level and would break any client bundle that imports
// from it. The literal "NEXT_LOCALE" is the same value as LOCALE_COOKIE.
const COOKIE_NAME = "NEXT_LOCALE";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Write the NEXT_LOCALE cookie client-side so that subsequent navigation to
 * unprefixed URLs (which are routed by the middleware cookie check) lands on
 * the user's chosen locale instead of the default.
 *
 * Mirror the server-side cookie attributes set in cookie.ts.
 */
export function setLocaleCookieClient(locale: Locale): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; secure"
      : "";
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
