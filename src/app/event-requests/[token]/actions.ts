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
import {
  getByTrackingToken,
  acceptQuote,
  declineQuote,
  cancel,
} from "@/lib/repos/event-requests-repo";
import { insertNotification } from "@/lib/repos/partner-notifications-repo";

async function loadByToken(token: string) {
  const er = await getByTrackingToken(token);
  if (!er) throw new Error("not found");
  return er;
}

export async function consumerAcceptQuote(token: string) {
  const er = await loadByToken(token);
  const out = await acceptQuote(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "quote_accepted",
    payload: { eventRequestId: er.id },
  });
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
  return out;
}

export async function consumerCancelEventRequest(token: string) {
  const er = await loadByToken(token);
  const out = await cancel(er.id);
  await insertNotification({
    restaurantId: er.restaurantId,
    kind: "event_request_cancelled",
    payload: { eventRequestId: er.id },
  });
  return out;
}
