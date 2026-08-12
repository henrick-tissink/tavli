/**
 * Email-link confirmation via `token_hash` — the server-side counterpart to
 * `/auth/callback`.
 *
 * Why this exists: `admin.generateLink` mints IMPLICIT-flow tokens. There is no
 * PKCE verifier on a server-side admin call, so Supabase's own /auth/v1/verify
 * endpoint redirects to `…#access_token=…` — a URL fragment, which never
 * reaches the server. A diner clicking their verification email therefore hit
 * /auth/callback with no `code` and no cookie, and was bounced to the
 * storefront: confirmed in Supabase, but not signed in and never shown the
 * confirmation screen.
 *
 * So the emails link HERE instead, carrying the `hashed_token` that
 * generateLink returns alongside the action_link. `verifyOtp` consumes it
 * server-side and writes the session cookies through the SSR client.
 *
 * /auth/callback stays for the PKCE paths — the corporate event-request OTP
 * and the partner resend both go through `@supabase/ssr`, which does produce a
 * `code`.
 */
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/db/server";
import { appOrigin } from "@/lib/app-origin";
import { resolvePostAuthPath } from "@/lib/auth/post-auth-redirect";

/** Only the email link types we actually mint. */
const ALLOWED_TYPES: readonly EmailOtpType[] = [
  "signup",
  "magiclink",
  "email",
  "invite",
  "recovery",
  "email_change",
];

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  // Never build redirects from req.url — behind the proxy it carries the
  // container's internal address. See auth/callback for the full story.
  const publicOrigin = appOrigin();

  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const type = ALLOWED_TYPES.find((t) => t === rawType);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/auth/error", publicOrigin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    // Expired, already consumed, or tampered with — all indistinguishable to
    // the user, and all recoverable by requesting a new link.
    return NextResponse.redirect(new URL("/auth/error", publicOrigin));
  }

  const path = await resolvePostAuthPath(supabase);
  return NextResponse.redirect(new URL(path, publicOrigin));
}
