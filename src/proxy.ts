import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  readImpersonationReturnCookie,
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/auth/impersonation-cookie";
import { isDemoMode } from "@/lib/demo-mode";
import { decideLocaleAction } from "@/lib/i18n/routing";
import { LOCALE_COOKIE } from "@/lib/i18n/cookie";

/**
 * Route-protection + session-refresh middleware.
 *
 * /admin/*   → requires role = 'admin' + AAL2 (after MFA enrolment + verify)
 *               → forced-enrol redirect if no verified factor yet
 * /partner/* → requires role = 'restaurant_owner' OR 'admin' + AAL2 when factor present
 * /onboard/* → public (token validation in the route)
 * /reservations/* → public (token validation in the route)
 * Everything else → public (consumer)
 *
 * Server actions (POST with next-action header) bypass all gates — middleware
 * must never block sign-out / factor enrolment / stop-impersonation POSTs.
 *
 * Impersonation bypass: when the encrypted return cookie is present, the
 * admin established AAL2 before the swap; the target's MFA gate would
 * otherwise block /partner/*. Cookie + audit trail are the security guarantee.
 *
 * Forced enrolment: admin sign-in must refuse to complete without an enrolled
 * factor (§5a.2). Implemented here as a post-signin redirect to /admin/security
 * for any /admin/* route except the sign-in and security paths.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Demo deployment (demo.tavli.ro): emit a site-wide noindex header. Set on the
  // base response at creation so it rides every pass-through path below
  // (consumer pages, server-action POSTs, missing-env early-out). Auth redirects
  // build their own responses but point at sign-in pages, which are non-content.
  if (isDemoMode()) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // Server actions must always pass through — Next.js sets `next-action`
  // on every Server Action POST. Without this bypass, AAL/forced-enrol gates
  // would intercept POSTs to pages the user can't reach as GETs (sign-out,
  // factor enrolment, stop-impersonation).
  if (request.headers.get("next-action") !== null) {
    return response;
  }

  const pathname = request.nextUrl.pathname;

  // i18n: as-needed locale prefixing for the public localized routes only
  // (pricing + explicit /en, /de). Scoped so it can NEVER touch /[city], /partner,
  // etc. — those keep their unprefixed URLs until Phase 1.
  const isLocalePath =
    pathname === "/pricing" || /^\/(en|de)(\/|$)/.test(pathname);
  if (isLocalePath) {
    const localeAction = decideLocaleAction({
      pathname,
      cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
      accept: request.headers.get("accept-language"),
    });
    if (localeAction.type !== "next") {
      const target = request.nextUrl.clone();
      target.pathname = localeAction.to;
      const localeResponse =
        localeAction.type === "redirect"
          ? NextResponse.redirect(target)
          : NextResponse.rewrite(target);
      if (localeAction.setCookie) {
        localeResponse.cookies.set(LOCALE_COOKIE, localeAction.setCookie, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
      if (isDemoMode()) {
        localeResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
      }
      return localeResponse;
    }
    // type === "next" (already-prefixed, e.g. /en/pricing): fall through.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const publicRoutes = [
    "/admin/sign-in",
    "/partner/sign-in",
    "/onboard",
    "/reservations",
  ];
  const isPublic = publicRoutes.some((p) => pathname.startsWith(p));
  const needsAdmin =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");
  const needsPartner =
    pathname.startsWith("/partner") && !pathname.startsWith("/partner/sign-in");

  if (!needsAdmin && !needsPartner && !isPublic) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...options,
            secure: process.env.NODE_ENV === "production",
          });
        }
      },
    },
  });

  // Refresh the session — writes refreshed cookies via the handlers above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read the impersonation return cookie once for both the dangling-cookie
  // cleanup below and the AAL2 bypass further down.
  const impersonationCookie = await readImpersonationReturnCookie();
  const impersonating = impersonationCookie !== null;

  // Dangling-cookie cleanup: if the return cookie is present but there's no
  // Supabase Auth session, the user signed out everywhere or the target session
  // died mid-impersonation. Clear the cookie + redirect to sign-in so the admin
  // re-authenticates.
  if (impersonating && !user && (needsAdmin || needsPartner)) {
    const cleanup = NextResponse.redirect(
      new URL("/admin/sign-in?session_expired=1", request.url),
    );
    cleanup.cookies.delete(IMPERSONATION_COOKIE_NAME);
    return cleanup;
  }

  if (needsAdmin) {
    if (!user) {
      return NextResponse.redirect(new URL("/admin/sign-in", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/admin/sign-in", request.url));
    }
  }

  if (needsPartner) {
    if (!user) {
      return NextResponse.redirect(new URL("/partner/sign-in", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "restaurant_owner" && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/partner/sign-in", request.url));
    }
  }

  // After role check passes: AAL gates with impersonation bypass.
  if (needsAdmin || needsPartner) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    // Forced enrolment for admins only — partner is voluntary.
    // Admin can't be impersonating into /admin/* (target role != admin →
    // redirected by role check above), so no impersonation bypass needed here.
    if (needsAdmin && aalData) {
      const adminEnrolAllow = ["/admin/sign-in", "/admin/security"];
      if (
        aalData.nextLevel === "aal1" &&
        !adminEnrolAllow.some((p) => pathname.startsWith(p))
      ) {
        return NextResponse.redirect(
          new URL("/admin/security?enrol=required", request.url),
        );
      }
    }

    // AAL2 gate — skip during impersonation (admin established AAL2 pre-swap).
    if (
      !impersonating &&
      aalData &&
      aalData.currentLevel === "aal1" &&
      aalData.nextLevel === "aal2"
    ) {
      const scope = needsAdmin ? "admin" : "partner";
      const allow = [`/${scope}/sign-in`];
      if (!allow.some((p) => pathname.startsWith(p))) {
        return NextResponse.redirect(
          new URL(`/${scope}/sign-in?continue_mfa=1`, request.url),
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|mp4|woff2?)$).*)",
  ],
};
