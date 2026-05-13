/**
 * OTP/magic-link auth callback. Supabase redirects here after the user clicks
 * the link. We exchange the `code` for a session, then — if a `token` query
 * param is present — promote the matching `draft` event_request to `new`
 * and fan out a partner notification.
 *
 * Used by the corporate-bookings Phase 1 flow (Task 10): the consumer
 * submits an event-request, receives an OTP, and clicking the link both
 * authenticates them and finalizes the request in one trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, profiles } from "@/lib/db/schema";
import { promoteDraftToNew } from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token");

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/auth/error", url));
    }
  }

  if (token) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Ensure profile row exists in case this is a brand-new signup.
      // ON CONFLICT DO NOTHING keeps this idempotent for repeat visits.
      await dbAdmin
        .insert(profiles)
        .values({
          id: user.id,
          role: "consumer",
          email: user.email ?? null,
        })
        .onConflictDoNothing();

      const [er] = await dbAdmin
        .select()
        .from(eventRequests)
        .where(eq(eventRequests.trackingToken, token))
        .limit(1);

      if (er && er.status === "draft") {
        const promoted = await promoteDraftToNew(er.id, user.id);
        await insertNotification({
          restaurantId: promoted.restaurantId,
          kind: "new_event_request",
          payload: {
            eventRequestId: promoted.id,
            occasion: promoted.occasion,
            eventDate: promoted.eventDate,
            partySize: promoted.partySize,
          },
        });
      }

      return NextResponse.redirect(new URL(`/event-requests/${token}`, url));
    }
  }

  return NextResponse.redirect(new URL("/", url));
}
