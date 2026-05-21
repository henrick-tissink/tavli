"use server";

/**
 * Consumer-side server actions scoped to the event-request tracking token.
 * The token itself is the authorization material: we load via the SECURITY
 * DEFINER `getByTrackingToken` RPC, which means anyone holding the token
 * can act on the request. This matches the reservations confirmation-token
 * pattern used elsewhere in the app.
 *
 * Each action fans out a partner notification so the inbox reflects the
 * outcome.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  getByTrackingToken,
  acceptQuote,
  declineQuote,
  cancel,
} from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";
import { dbAdmin } from "@/lib/db/admin";
import { reservations, restaurants } from "@/lib/db/schema";
import {
  sendEventRequestAccepted,
  sendEventRequestDeclined,
} from "@/lib/email/event-requests";
import { appOrigin } from "@/lib/app-origin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

async function loadByToken(token: string) {
  const er = await getByTrackingToken(token);
  if (!er) throw new Error("not found");
  return er;
}

async function loadRestaurantContact(
  restaurantId: string,
): Promise<{ name: string; email: string | null }> {
  const [r] = await dbAdmin
    .select({ name: restaurants.name, email: restaurants.email })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return { name: r?.name ?? "Tavli", email: r?.email ?? null };
}

export async function consumerAcceptQuote(token: string) {
  const er = await loadByToken(token);
  const out = await acceptQuote(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "quote_accepted",
    payload: { eventRequestId: er.id },
  });
  // Notify the venue that the consumer has accepted. Materialization will
  // also send confirmation emails — this one tells the partner "act now".
  try {
    const contact = await loadRestaurantContact(er.restaurantId);
    if (contact.email) {
      await sendEventRequestAccepted({
        to: contact.email,
        locale: "ro",
        restaurantName: contact.name,
        guestName: er.guestName,
        occasion: er.occasion,
        eventDate: er.eventDate,
        partySize: er.partySize,
        trackingUrl: `${appOrigin()}/event-requests/${er.trackingToken}`,
        amountLei: er.quotedAmountCents
          ? Math.round(er.quotedAmountCents / 100)
          : 0,
      });
    }
  } catch (err) {
    console.error("[email] consumerAcceptQuote email failed:", err);
  }
  return out;
}

export async function consumerDeclineQuote({
  token,
  reason,
}: {
  token: string;
  reason?: string;
}) {
  const er = await loadByToken(token);
  const parsed = z.string().max(1000).optional().parse(reason);
  const out = await declineQuote(er.id, parsed);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "quote_declined",
    payload: { eventRequestId: er.id, reason: parsed },
  });
  try {
    const contact = await loadRestaurantContact(er.restaurantId);
    if (contact.email) {
      await sendEventRequestDeclined({
        to: contact.email,
        locale: "ro",
        restaurantName: contact.name,
        guestName: er.guestName,
        occasion: er.occasion,
        eventDate: er.eventDate,
        partySize: er.partySize,
        trackingUrl: `${appOrigin()}/event-requests/${er.trackingToken}`,
        declineReason: parsed ?? "consumer_declined",
      });
    }
  } catch (err) {
    console.error("[email] consumerDeclineQuote email failed:", err);
  }
  return out;
}

export async function consumerCancelEventRequest(token: string) {
  const er = await loadByToken(token);
  const wasAccepted = er.status === "accepted";
  const out = await cancel(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "event_request_cancelled",
    payload: { eventRequestId: er.id },
  });

  // §02 audit: if the event was already accepted, `cancel()` cascaded
  // materialized reservations to status='cancelled' in the same transaction
  // (see event-requests-repo.cancel). Emit one audit row per cancelled
  // reservation so the trail shows which inventory was released. The
  // consumer is acting via the tracking token — no session — so we stamp
  // actorRole='diner' and actorUserId=null. Context carries FK ids only.
  if (wasAccepted) {
    const [orgRow] = await dbAdmin
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, er.restaurantId))
      .limit(1);
    const organizationId = orgRow?.organizationId ?? null;
    const cancelledRows = await dbAdmin
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.eventRequestId, er.id),
          eq(reservations.status, "cancelled"),
        ),
      );
    for (const row of cancelledRows) {
      await recordAudit({
        action: AUDIT.reservation.modified,
        subjectType: "reservation",
        subjectId: row.id,
        actorUserId: null,
        actorRole: "diner",
        restaurantId: er.restaurantId,
        organizationId,
        context: {
          event_request_id: er.id,
          source: "corporate",
          next_status: "cancelled",
        },
      });
    }
  }

  return out;
}
