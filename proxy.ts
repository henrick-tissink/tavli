import { NextResponse, type NextRequest } from "next/server";
import { decideLocaleAction } from "@/lib/i18n/routing";

const COOKIE = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(COOKIE);
  const accept = request.headers.get("accept-language");

  const action = decideLocaleAction({ pathname, hasCookie, accept });

  let response: NextResponse;
  if (action.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = action.to;
    response = NextResponse.redirect(url);
  } else if (action.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = action.to;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next();
  }

  if (action.setCookie) {
    response.cookies.set(COOKIE, action.setCookie, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  // PHASE 0 SCOPE: only the routes that have a `[lang]` counterpart today —
  // pricing and the explicit /en, /de prefixes. The storefront, token flows, and
  // home still live (interim) under (app) at their old unprefixed paths, so the
  // proxy must NOT rewrite them (a rewrite of /bucuresti → /ro/bucuresti would
  // 404 until Phase 1). EXPAND this matcher in Phase 1 as each surface moves
  // under (public)/[lang].
  matcher: ["/pricing", "/en/:path*", "/de/:path*"],
};
