"use server";

/**
 * Admin-only server actions for a single restaurant. Today: suspend and
 * unsuspend. Suspension cascades to outstanding event_requests so a
 * suspended venue doesn't keep transacting in the partner inbox.
 */

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurants } from "@/lib/db/schema";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

type Result = { ok: true } | { ok: false; error: string };

async function assertAdmin(): Promise<Result | { ok: true; userId: string }> {
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    const m = getMessages(await resolveAppLocale(), "admin.restaurants");
    return { ok: false, error: m.errors.unauthorised };
  }
  return { ok: true, userId: session.userId };
}

/**
 * Mark a venue as suspended. In the same transaction, decline any open
 * event_requests against it (new/viewing/replied/quoted) so the partner
 * inbox doesn't keep displaying actionable rows for a paused venue.
 * Consumer-side cancellation by the requester is still possible (the
 * tracking-token flow goes through `consumerCancelEventRequest`).
 */
export async function suspendRestaurant(id: string): Promise<Result> {
  const auth = await assertAdmin();
  if (!("userId" in auth)) return auth;

  await dbAdmin.transaction(async (tx) => {
    await tx
      .update(restaurants)
      .set({ status: "suspended" })
      .where(eq(restaurants.id, id));

    // Auto-decline outstanding requests. Terminal states (declined,
    // expired, cancelled, completed, accepted) stay as-is. Accepted is
    // explicitly preserved — the cascade for that path is handled by the
    // event-request's own cancel cascade if/when a consumer cancels.
    await tx
      .update(eventRequests)
      .set({
        status: "declined",
        declineReason: "venue_suspended",
        declinedAt: sql`now()`,
      })
      .where(
        and(
          eq(eventRequests.restaurantId, id),
          inArray(eventRequests.status, ["new", "viewing", "replied", "quoted"]),
        ),
      );
  });

  revalidatePath(`/admin/restaurants/${id}`);
  revalidatePath("/admin/restaurants");
  return { ok: true };
}

/**
 * Reverse the status change. Does NOT un-decline previously cascaded
 * event_requests — those are terminal once declined. A consumer or
 * partner who wants to re-engage must submit a new request.
 */
export async function unsuspendRestaurant(id: string): Promise<Result> {
  const auth = await assertAdmin();
  if (!("userId" in auth)) return auth;

  await dbAdmin
    .update(restaurants)
    .set({ status: "live" })
    .where(eq(restaurants.id, id));

  revalidatePath(`/admin/restaurants/${id}`);
  revalidatePath("/admin/restaurants");
  return { ok: true };
}
