import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route-protection + session-refresh middleware.
 *
 * /admin/*   → requires role = 'admin' (sign-in + onboarding excluded)
 * /partner/* → requires role = 'restaurant_owner' OR 'admin'
 * /onboard/* → public (token validation happens in the route)
 * /reservations/* → public (token validation happens in the route)
 * Everything else → public (consumer)
 *
 * If Supabase env vars aren't configured yet (early Phase 2 dev), the
 * middleware short-circuits to allow everything through so the consumer
 * app doesn't break while M1 foundations are still being wired.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const pathname = request.nextUrl.pathname;

  // Public routes — no session check needed, but still refresh cookies.
  const publicRoutes = [
    "/admin/sign-in",
    "/partner/sign-in",
    "/onboard",
    "/reservations",
  ];
  const isPublic = publicRoutes.some((p) => pathname.startsWith(p));
  const needsAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");
  const needsPartner = pathname.startsWith("/partner") && !pathname.startsWith("/partner/sign-in");

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
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session — writes refreshed cookies via the handlers above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|mp4|woff2?)$).*)",
  ],
};
