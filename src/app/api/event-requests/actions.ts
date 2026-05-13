"use server";

import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurants } from "@/lib/db/schema";
import {
  createEventRequestDraft,
  markViewing,
  reply,
  sendQuote,
  decline,
} from "@/lib/repos/event-requests-repo";
import { sendOtp } from "@/lib/auth/otp";
import { normalizeCui, isValidCuiFormat } from "@/lib/integrations/anaf";
import { getCurrentSession } from "@/lib/auth/session";

const submitSchema = z.object({
  restaurantId: z.string().uuid(),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(255),
  guestPhone: z.string().max(32).optional(),
  occasion: z.enum(["wedding", "birthday", "corporate_dinner", "product_launch", "other"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventTimePreference: z.string().max(60).optional(),
  partySize: z.number().int().positive().max(1000),
  spacePreference: z.string().max(240).optional(),
  budgetPerHeadCents: z.number().int().nonnegative().optional(),
  menuPreference: z.string().max(500).optional(),
  dietaryNotes: z.string().max(500).optional(),
  additionalNotes: z.string().max(1000).optional(),
  claimedCompanyCui: z.string().optional(),
  claimedCompanyName: z.string().max(240).optional(),
});

export type SubmitEventRequestInput = z.infer<typeof submitSchema>;

/**
 * Entry point from `EventRequestSheet`. Validates input, dedupes within 5 min
 * to absorb double-submits, persists a `draft` row, and sends an OTP whose
 * redirect carries the row's tracking token. The auth callback (Task 10)
 * promotes the matching draft to `new` once the user verifies.
 */
export async function submitEventRequestDraft(
  input: SubmitEventRequestInput,
): Promise<{ ok: true; trackingToken: string }> {
  const data = submitSchema.parse(input);

  const [restaurant] = await dbAdmin
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, data.restaurantId))
    .limit(1);
  if (!restaurant) throw new Error("restaurant not found");
  if (restaurant.status !== "live") {
    throw new Error("this venue is not accepting event requests");
  }
  if (!restaurant.eventsIntakeEnabled) {
    throw new Error("this venue is not accepting event requests");
  }

  const claimedCui = data.claimedCompanyCui
    ? isValidCuiFormat(data.claimedCompanyCui)
      ? normalizeCui(data.claimedCompanyCui)
      : undefined
    : undefined;

  // 5-min dedupe: absorb accidental double-submits and let the user resume
  // their pending OTP rather than fragmenting the partner inbox.
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const [existing] = await dbAdmin
    .select()
    .from(eventRequests)
    .where(
      and(
        eq(eventRequests.restaurantId, data.restaurantId),
        eq(eventRequests.guestEmail, data.guestEmail),
        eq(eventRequests.eventDate, data.eventDate),
        eq(eventRequests.partySize, data.partySize),
        gte(eventRequests.createdAt, cutoff),
      ),
    )
    .limit(1);
  if (existing) {
    await sendOtp({ email: data.guestEmail, redirectToToken: existing.trackingToken });
    return { ok: true, trackingToken: existing.trackingToken };
  }

  const draft = await createEventRequestDraft({
    restaurantId: data.restaurantId,
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestPhone: data.guestPhone,
    occasion: data.occasion,
    eventDate: data.eventDate,
    eventTimePreference: data.eventTimePreference,
    partySize: data.partySize,
    spacePreference: data.spacePreference,
    budgetPerHeadCents: data.budgetPerHeadCents,
    menuPreference: data.menuPreference,
    dietaryNotes: data.dietaryNotes,
    additionalNotes: data.additionalNotes,
    claimedCompanyCui: claimedCui,
    claimedCompanyName: data.claimedCompanyName,
  });

  await sendOtp({ email: data.guestEmail, redirectToToken: draft.trackingToken });
  return { ok: true, trackingToken: draft.trackingToken };
}

// ─── Partner transitions (Task 11) ───────────────────────────────────────
// Each action verifies the calling user owns the restaurant tied to the
// event_request via `assertPartnerOwns` before delegating to the repo.

async function assertPartnerOwns(
  eventRequestId: string,
): Promise<{ userId: string; restaurantId: string }> {
  const session = await getCurrentSession();
  if (!session) throw new Error("forbidden: not signed in");
  const [er] = await dbAdmin
    .select({
      id: eventRequests.id,
      restaurantId: eventRequests.restaurantId,
    })
    .from(eventRequests)
    .where(eq(eventRequests.id, eventRequestId))
    .limit(1);
  if (!er) throw new Error("not found");
  const [r] = await dbAdmin
    .select({ ownerUserId: restaurants.ownerUserId })
    .from(restaurants)
    .where(eq(restaurants.id, er.restaurantId))
    .limit(1);
  if (r?.ownerUserId !== session.userId) {
    throw new Error("forbidden: not the owner");
  }
  return { userId: session.userId, restaurantId: er.restaurantId };
}

export async function markEventRequestViewing({ id }: { id: string }) {
  await assertPartnerOwns(id);
  return markViewing(id);
}

export async function replyToEventRequest({
  id,
  message,
}: {
  id: string;
  message: string;
}) {
  await assertPartnerOwns(id);
  if (message.length < 1 || message.length > 4000) {
    throw new Error("message length");
  }
  return reply(id, message);
}

const quoteSchema = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  partnerResponse: z.string().max(4000).optional(),
});

export async function quoteEventRequest(input: z.infer<typeof quoteSchema>) {
  const data = quoteSchema.parse(input);
  await assertPartnerOwns(data.id);
  return sendQuote(data.id, {
    amountCents: data.amountCents,
    expiresAt: new Date(data.expiresAt),
    partnerResponse: data.partnerResponse,
  });
}

export async function declineEventRequest({
  id,
  reason,
}: {
  id: string;
  reason: string;
}) {
  await assertPartnerOwns(id);
  if (!reason || reason.length > 1000) {
    throw new Error("reason required");
  }
  return decline(id, reason);
}
