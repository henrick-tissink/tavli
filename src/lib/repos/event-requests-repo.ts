import { dbAdmin } from "@/lib/db/admin";
import {
  availabilityExceptions,
  eventRequests,
  reservations,
} from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";

type EventRequest = typeof eventRequests.$inferSelect;
type EventRequestStatus = EventRequest["status"];

const VALID_TRANSITIONS: Record<EventRequestStatus, EventRequestStatus[]> = {
  draft: ["new", "expired"],
  new: ["viewing", "cancelled", "expired"],
  viewing: ["replied", "quoted", "declined", "cancelled", "expired"],
  replied: ["quoted", "declined", "cancelled"],
  quoted: ["accepted", "declined", "expired_quote", "cancelled"],
  accepted: ["completed", "cancelled"],
  declined: [],
  expired_quote: ["quoted"],
  cancelled: [],
  expired: [],
  completed: [],
};

function assertTransition(from: EventRequestStatus, to: EventRequestStatus) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`invalid transition: ${from} -> ${to}`);
  }
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createEventRequestDraft(input: {
  restaurantId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  occasion: EventRequest["occasion"];
  eventDate: string;
  eventTimePreference?: string;
  partySize: number;
  spacePreference?: string;
  budgetPerHeadCents?: number;
  menuPreference?: string;
  dietaryNotes?: string;
  additionalNotes?: string;
  claimedCompanyCui?: string;
  claimedCompanyName?: string;
}): Promise<EventRequest> {
  const [row] = await dbAdmin.insert(eventRequests).values({
    restaurantId: input.restaurantId,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    guestPhone: input.guestPhone ?? null,
    occasion: input.occasion,
    eventDate: input.eventDate,
    eventTimePreference: input.eventTimePreference ?? null,
    partySize: input.partySize,
    spacePreference: input.spacePreference ?? null,
    budgetPerHeadCents: input.budgetPerHeadCents ?? null,
    menuPreference: input.menuPreference ?? null,
    dietaryNotes: input.dietaryNotes ?? null,
    additionalNotes: input.additionalNotes ?? null,
    claimedCompanyCui: input.claimedCompanyCui ?? null,
    claimedCompanyName: input.claimedCompanyName ?? null,
    trackingToken: newToken(),
  }).returning();
  return row;
}

async function transitionTo(id: string, to: EventRequestStatus, patch: Partial<EventRequest> = {}): Promise<EventRequest> {
  const [current] = await dbAdmin.select().from(eventRequests).where(eq(eventRequests.id, id)).limit(1);
  if (!current) throw new Error(`event_request ${id} not found`);
  assertTransition(current.status, to);
  // Atomic: include read status in the WHERE so a concurrent transition fails closed.
  const updated = await dbAdmin.update(eventRequests)
    .set({ ...patch, status: to })
    .where(and(eq(eventRequests.id, id), eq(eventRequests.status, current.status)))
    .returning();
  if (updated.length === 0) {
    throw new Error(`concurrent transition: ${id} status changed during transition to ${to}`);
  }
  return updated[0];
}

export async function promoteDraftToNew(id: string, userId: string): Promise<EventRequest> {
  return transitionTo(id, "new", { requestedByUserId: userId });
}

export async function markViewing(id: string): Promise<EventRequest> {
  return transitionTo(id, "viewing");
}

export async function reply(id: string, partnerResponse: string): Promise<EventRequest> {
  return transitionTo(id, "replied", { partnerResponse });
}

export async function sendQuote(id: string, q: { amountCents: number; expiresAt: Date; partnerResponse?: string }): Promise<EventRequest> {
  return transitionTo(id, "quoted", {
    quotedAmountCents: q.amountCents,
    quoteExpiresAt: q.expiresAt,
    quotedAt: new Date(),
    partnerResponse: q.partnerResponse ?? null,
  });
}

export async function decline(id: string, reason: string): Promise<EventRequest> {
  return transitionTo(id, "declined", { declineReason: reason, declinedAt: new Date() });
}

export async function acceptQuote(id: string): Promise<EventRequest> {
  return transitionTo(id, "accepted", { acceptedAt: new Date() });
}

export async function declineQuote(id: string, reason?: string): Promise<EventRequest> {
  return transitionTo(id, "declined", { declineReason: reason ?? "consumer_declined", declinedAt: new Date() });
}

export async function cancel(id: string): Promise<EventRequest> {
  // If cancelling from `accepted`, reservations may already have been
  // materialized and a whole-venue availability exception may exist. Cancel
  // them in the same transaction so a "cancelled" event-request doesn't keep
  // holding the venue or counting against capacity.
  return dbAdmin.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(eventRequests)
      .where(eq(eventRequests.id, id))
      .limit(1);
    if (!current) throw new Error(`event_request ${id} not found`);
    assertTransition(current.status, "cancelled");
    const updated = await tx
      .update(eventRequests)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(eventRequests.id, id), eq(eventRequests.status, current.status)))
      .returning();
    if (updated.length === 0) {
      throw new Error(`concurrent transition: ${id} status changed during cancel`);
    }
    if (current.status === "accepted") {
      await tx
        .update(reservations)
        .set({ status: "cancelled" })
        .where(and(
          eq(reservations.eventRequestId, id),
          ne(reservations.status, "cancelled"),
        ));
      await tx
        .delete(availabilityExceptions)
        .where(eq(availabilityExceptions.sourceEventRequestId, id));
    }
    return updated[0];
  });
}

export async function getByTrackingToken(token: string): Promise<EventRequest | null> {
  // Server-side typed lookup — Drizzle maps snake_case columns to camelCase
  // for us. A SECURITY DEFINER RPC (`get_event_request_by_token`) still
  // exists in the migration for any future anon/PostgREST path, but here we
  // already hold an admin connection so we filter the same way (token match,
  // skip drafts) inline.
  const [row] = await dbAdmin
    .select()
    .from(eventRequests)
    .where(and(
      eq(eventRequests.trackingToken, token),
      ne(eventRequests.status, "draft"),
    ))
    .limit(1);
  return row ?? null;
}

export async function findOverlappingReservations(restaurantId: string, eventDate: string): Promise<typeof reservations.$inferSelect[]> {
  // Only confirmed/seated/completed reservations count as "overlapping" — a
  // cancelled or no_show row shouldn't inflate the partner-facing conflict
  // count.
  return dbAdmin.select().from(reservations).where(and(
    eq(reservations.restaurantId, restaurantId),
    eq(reservations.reservationDate, eventDate),
    inArray(reservations.status, ["confirmed", "seated", "completed"]),
  ));
}
