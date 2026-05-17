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
import { eventRequests, profiles, restaurants } from "@/lib/db/schema";
import { promoteDraftToNew } from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";
import { sendEventRequestNew } from "@/lib/email/event-requests";
import { appOrigin } from "@/lib/app-origin";

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

      // Only promote when the authenticated user matches the draft's guest
      // email. Without this, anyone holding the trackingToken (e.g. via a
      // leaked URL) could claim the draft under their own auth.uid and gain
      // RLS access to the request via the `requested_by_user_id = auth.uid()`
      // policy.
      const emailsMatch =
        !!er &&
        !!user.email &&
        er.guestEmail.toLowerCase() === user.email.toLowerCase();

      if (er && er.status === "draft" && emailsMatch) {
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

        // Notify the partner. Failures are swallowed so the redirect still
        // completes — the state transition has already committed and the
        // partner can also see the in-app notification.
        try {
          const [r] = await dbAdmin
            .select({ name: restaurants.name, email: restaurants.email })
            .from(restaurants)
            .where(eq(restaurants.id, promoted.restaurantId))
            .limit(1);
          if (r?.email) {
            await sendEventRequestNew({
              partnerEmail: r.email,
              locale: "ro",
              restaurantName: r.name,
              guestName: promoted.guestName,
              occasion: promoted.occasion,
              eventDate: promoted.eventDate,
              partySize: promoted.partySize,
              partnerInboxUrl: `${appOrigin()}/partner/corporate/events`,
            });
          }
        } catch (err) {
          console.error("[email] sendEventRequestNew failed:", err);
        }
      }

      return NextResponse.redirect(new URL(`/event-requests/${token}`, url));
    }
  }

  return NextResponse.redirect(new URL("/", url));
}
