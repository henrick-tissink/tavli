"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  availabilityExceptions,
  eventRequests,
  reservations,
  restaurants,
} from "@/lib/db/schema";
import {
  createEventRequestDraft,
  markViewing,
  reply,
  sendQuote,
  decline,
} from "@/lib/repos/event-requests-repo";
import { replaceLineItems } from "@/lib/repos/quote-line-items-repo";
import { sendOtp } from "@/lib/auth/otp";
import { normalizeCui, isValidCuiFormat } from "@/lib/integrations/anaf";
import { normalizePhone } from "@/lib/phone/normalize";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";
import {
  sendEventRequestReplied,
  sendEventRequestQuoted,
  sendEventRequestDeclined,
  sendEventRequestAccepted,
} from "@/lib/email/event-requests";
import { appOrigin } from "@/lib/app-origin";

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
  privateSpaceId: z.string().uuid().optional(),
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

  // §02 §4.7: normalise guest phone to E.164. Field is optional, so empty
  // input is fine ("empty" reason → undefined); a non-empty unparseable
  // value rejects the submission.
  let guestPhoneE164: string | undefined;
  if (data.guestPhone !== undefined) {
    const phoneResult = normalizePhone(data.guestPhone);
    if (phoneResult.ok) {
      guestPhoneE164 = phoneResult.e164;
    } else if (phoneResult.reason === "invalid") {
      throw new Error("invalid phone: please enter a valid number with country code");
    }
    // reason === "empty" → leave guestPhoneE164 undefined
  }

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
    guestPhone: guestPhoneE164,
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
    privateSpaceId: data.privateSpaceId,
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
    .select({
      status: restaurants.status,
      organizationId: restaurants.organizationId,
    })
    .from(restaurants)
    .where(eq(restaurants.id, er.restaurantId))
    .limit(1);
  if (!r) throw new Error("not found: restaurant");
  // Subject is typed `kind: "reservation"` rather than "event_request" — the
  // Subject union has no `event_request` kind today, and `reservation` resolves
  // to the same venue scope in `scopeForSubject()`. A future Subject extension
  // (`{ kind: "event_request"; restaurant_id; organization_id? }`) is the right
  // long-term shape; for now this proxy is correct and type-safe.
  if (
    !(await can(session, "event_request.respond", {
      kind: "reservation",
      restaurant_id: er.restaurantId,
      organization_id: r.organizationId,
    }))
  ) {
    throw new Error("forbidden: cannot act on this venue's event requests");
  }
  if (r.status === "suspended") {
    // Refuse all partner transitions while suspended. The proper cascade
    // (auto-decline outstanding requests on suspend) will land with the
    // admin suspend mutation; this guard prevents a suspended venue from
    // continuing to transact in the meantime.
    throw new Error("forbidden: restaurant suspended");
  }
  return { userId: session.userId, restaurantId: er.restaurantId };
}

// Used by transition actions to compose consumer-facing emails. We fetch
// the restaurant name once and build a tracking URL from the canonical
// `tracking_token`. Phase 1 defaults to RO locale; per-user locale comes
// later.
async function loadEmailContext(eventRequestId: string): Promise<{
  restaurantName: string;
  restaurantEmail: string | null;
  guestEmail: string;
  guestName: string;
  occasion: typeof eventRequests.$inferSelect.occasion;
  eventDate: string;
  partySize: number;
  trackingUrl: string;
}> {
  const [er] = await dbAdmin
    .select()
    .from(eventRequests)
    .where(eq(eventRequests.id, eventRequestId))
    .limit(1);
  if (!er) throw new Error("not found");
  const [r] = await dbAdmin
    .select({ name: restaurants.name, email: restaurants.email })
    .from(restaurants)
    .where(eq(restaurants.id, er.restaurantId))
    .limit(1);
  return {
    restaurantName: r?.name ?? "Tavli",
    restaurantEmail: r?.email ?? null,
    guestEmail: er.guestEmail,
    guestName: er.guestName,
    occasion: er.occasion,
    eventDate: er.eventDate,
    partySize: er.partySize,
    trackingUrl: `${appOrigin()}/event-requests/${er.trackingToken}`,
  };
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
  const out = await reply(id, message);
  try {
    const ctx = await loadEmailContext(id);
    await sendEventRequestReplied({
      guestEmail: ctx.guestEmail,
      locale: "ro",
      restaurantName: ctx.restaurantName,
      guestName: ctx.guestName,
      occasion: ctx.occasion,
      eventDate: ctx.eventDate,
      partySize: ctx.partySize,
      trackingUrl: ctx.trackingUrl,
      partnerResponse: message,
    });
  } catch (err) {
    console.error("[email] sendEventRequestReplied failed:", err);
  }
  return out;
}

const sendQuoteSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string().datetime(),
  lineItems: z
    .array(
      z.object({
        label: z.string().min(1).max(160),
        amountCents: z.number().int().min(0).max(100_000_00),
      }),
    )
    .min(1)
    .max(20),
  partnerResponse: z.string().max(2000).optional(),
});

export async function sendQuoteForEventRequest(
  input: z.infer<typeof sendQuoteSchema>,
) {
  const data = sendQuoteSchema.parse(input);
  await assertPartnerOwns(data.id);
  const total = data.lineItems.reduce((acc, l) => acc + l.amountCents, 0);

  // Phase 1.5: we persist the line items first, then flip the row to `quoted`
  // with the computed total. We deliberately do NOT wrap these in an outer
  // transaction — `replaceLineItems` is itself transactional, and `sendQuote`
  // is a single UPDATE. The window between "lines persisted" and "status
  // flipped" is tiny. If `sendQuote` throws (e.g. invalid transition), the
  // lines stay attached to the row but a subsequent retry overwrites them via
  // the next `replaceLineItems` call, so no permanent drift accumulates.
  await replaceLineItems(data.id, data.lineItems);
  const out = await sendQuote(data.id, {
    amountCents: total,
    expiresAt: new Date(data.expiresAt),
    partnerResponse: data.partnerResponse,
  });

  try {
    const ctx = await loadEmailContext(data.id);
    await sendEventRequestQuoted({
      guestEmail: ctx.guestEmail,
      locale: "ro",
      restaurantName: ctx.restaurantName,
      guestName: ctx.guestName,
      occasion: ctx.occasion,
      eventDate: ctx.eventDate,
      partySize: ctx.partySize,
      trackingUrl: ctx.trackingUrl,
      amountLei: Math.round(total / 100),
      quoteExpiresAt: data.expiresAt,
    });
  } catch (err) {
    console.error("[email] sendEventRequestQuoted failed:", err);
  }
  return out;
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
  const out = await decline(id, reason);
  try {
    const ctx = await loadEmailContext(id);
    await sendEventRequestDeclined({
      to: ctx.guestEmail,
      locale: "ro",
      restaurantName: ctx.restaurantName,
      guestName: ctx.guestName,
      occasion: ctx.occasion,
      eventDate: ctx.eventDate,
      partySize: ctx.partySize,
      trackingUrl: ctx.trackingUrl,
      declineReason: reason,
    });
  } catch (err) {
    console.error("[email] sendEventRequestDeclined failed:", err);
  }
  return out;
}

// ─── Materialization (Task 13) ───────────────────────────────────────────
// Once the partner has accepted an event request they choose how to realize
// it: `private_room` produces N reservation rows that ride alongside normal
// inventory, while `whole_venue` adds an `availability_exceptions` row that
// zeroes the venue's capacity for the date so the public availability code
// stops offering it. Both modes run in a single transaction so a partial
// failure leaves nothing behind. We intentionally do NOT flip the event
// request to `completed` here — that's a separate post-event step.

const materializeSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["private_room", "whole_venue"]),
  slots: z
    .array(
      z.object({
        time: z.string().regex(/^\d{2}:\d{2}$/),
        partySize: z.number().int().positive(),
        zone: z.string().max(60).optional(),
      }),
    )
    .min(1),
});

export async function materializeAcceptedEventRequest(
  input: z.infer<typeof materializeSchema>,
): Promise<{ materializedReservationIds: string[] }> {
  const data = materializeSchema.parse(input);
  const { restaurantId } = await assertPartnerOwns(data.id);
  const [er] = await dbAdmin
    .select()
    .from(eventRequests)
    .where(eq(eventRequests.id, data.id))
    .limit(1);
  if (!er) throw new Error("not found");
  if (er.status !== "accepted") {
    throw new Error("event request must be accepted before materializing");
  }

  // §02 audit: resolve actor + org once outside the loop so each
  // recordAudit() call inside the transaction is a single INSERT.
  const auditSession = await getCurrentSession();
  const actorRole = await getActorRole(auditSession, restaurantId);
  const [orgRow] = await dbAdmin
    .select({ organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const organizationId = orgRow?.organizationId ?? null;

  const reservationIds: string[] = [];

  await dbAdmin.transaction(async (tx) => {
    // Idempotency: reject if reservations have already been materialized for
    // this event request. The whole_venue path is also guarded by the unique
    // availability-exception, but private_room has no such guard — without
    // this check, a double-click would insert duplicate reservations.
    const existing = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.eventRequestId, data.id))
      .limit(1);
    if (existing.length > 0) {
      throw new Error("reservations already materialized");
    }

    for (const slot of data.slots) {
      const [row] = await tx
        .insert(reservations)
        .values({
          restaurantId,
          guestName: er.guestName,
          guestPhone: er.guestPhone ?? "",
          guestEmail: er.guestEmail,
          partySize: slot.partySize,
          reservationDate: er.eventDate,
          reservationTime: `${slot.time}:00`,
          zone: slot.zone ?? (data.mode === "private_room" ? "Private Room" : null),
          notes: `Event request ${er.id} — ${er.occasion}`,
          status: "confirmed",
          confirmationToken: randomBytes(32).toString("hex"),
          bookingType: "private_event",
          eventRequestId: er.id,
          bookedByUserId: er.requestedByUserId,
        })
        .returning({ id: reservations.id });
      reservationIds.push(row.id);

      // Atomic with the reservation INSERT — pass `tx` so a failure here
      // rolls back the matching reservation row.
      await recordAudit(
        {
          action: AUDIT.reservation.created,
          subjectType: "reservation",
          subjectId: row.id,
          actorUserId: auditSession?.userId ?? null,
          actorRole,
          restaurantId,
          organizationId,
          context: {
            event_request_id: er.id,
            source: "corporate",
          },
        },
        tx,
      );
    }

    if (data.mode === "whole_venue") {
      await tx.insert(availabilityExceptions).values({
        restaurantId,
        exceptionDate: er.eventDate,
        slotStart: null,
        slotEnd: null,
        overrideCapacity: 0,
        reason: `whole-venue event ${er.id}`,
        sourceEventRequestId: er.id,
      });
    }
  });

  // Confirmation email to both consumer and venue. Best-effort: if the email
  // backend chokes, the reservations have already committed and the partner
  // can fall back to the in-app inbox.
  try {
    const ctx = await loadEmailContext(data.id);
    const amountLei = er.quotedAmountCents
      ? Math.round(er.quotedAmountCents / 100)
      : 0;
    const baseProps = {
      locale: "ro" as const,
      restaurantName: ctx.restaurantName,
      guestName: ctx.guestName,
      occasion: ctx.occasion,
      eventDate: ctx.eventDate,
      partySize: ctx.partySize,
      trackingUrl: ctx.trackingUrl,
      amountLei,
    };
    await sendEventRequestAccepted({ ...baseProps, to: ctx.guestEmail });
    if (ctx.restaurantEmail) {
      await sendEventRequestAccepted({ ...baseProps, to: ctx.restaurantEmail });
    }
  } catch (err) {
    console.error("[email] sendEventRequestAccepted failed:", err);
  }

  return { materializedReservationIds: reservationIds };
}
