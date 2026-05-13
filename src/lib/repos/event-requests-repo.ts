import { dbAdmin } from "@/lib/db/admin";
import { dbAnon } from "@/lib/db/anon";
import { eventRequests, reservations } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
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
  const [row] = await dbAdmin.update(eventRequests)
    .set({ ...patch, status: to })
    .where(eq(eventRequests.id, id))
    .returning();
  return row;
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
  return transitionTo(id, "cancelled", { cancelledAt: new Date() });
}

export async function getByTrackingToken(token: string): Promise<EventRequest | null> {
  // Uses the SECURITY DEFINER RPC; anon client is enough.
  // postgres-js `execute` returns an iterable RowList (rows are array-like
  // on the result itself), not a `{ rows: [...] }` wrapper. Cast through
  // unknown because Drizzle's typed return is opinionated about shape.
  const result = (await dbAnon.execute(sql`SELECT * FROM get_event_request_by_token(${token})`)) as unknown as EventRequest[];
  return result[0] ?? null;
}

export async function findOverlappingReservations(restaurantId: string, eventDate: string): Promise<typeof reservations.$inferSelect[]> {
  return dbAdmin.select().from(reservations).where(and(
    eq(reservations.restaurantId, restaurantId),
    eq(reservations.reservationDate, eventDate),
  ));
}
