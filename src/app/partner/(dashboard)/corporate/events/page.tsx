import { notFound } from "next/navigation";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { EventRequestInbox } from "@/components/partner/EventRequestInbox";
import { InboxFilters } from "@/components/partner/InboxFilters";

export const dynamic = "force-dynamic";

type EventStatus =
  | "new"
  | "viewing"
  | "replied"
  | "quoted"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired_quote"
  | "expired"
  | "completed";

const OPEN: EventStatus[] = ["new", "viewing", "replied", "quoted"];

const STATUS_GROUPS: Record<string, EventStatus[]> = {
  open: OPEN,
  new: ["new"],
  viewing: ["viewing"],
  quoted: ["quoted"],
  accepted: ["accepted"],
  all: [],
};

export default async function EventInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const r = await getPartnerRestaurant();
  const openExist = await dbAdmin
    .select({ c: sql<number>`count(*)::int` })
    .from(eventRequests)
    .where(
      and(
        eq(eventRequests.restaurantId, r.id),
        inArray(eventRequests.status, OPEN),
      ),
    );
  if (!r.eventsIntakeEnabled && (openExist[0]?.c ?? 0) === 0) notFound();
  const sp = await searchParams;
  const activeKey = sp.status && sp.status in STATUS_GROUPS ? sp.status : "open";
  const group = STATUS_GROUPS[activeKey] ?? OPEN;
  const filters: SQL[] = [eq(eventRequests.restaurantId, r.id)];
  if (group.length > 0) {
    filters.push(inArray(eventRequests.status, group));
  }
  const rows = await dbAdmin
    .select({
      id: eventRequests.id,
      occasion: eventRequests.occasion,
      eventDate: eventRequests.eventDate,
      partySize: eventRequests.partySize,
      guestName: eventRequests.guestName,
      status: eventRequests.status,
      createdAt: eventRequests.createdAt,
      budgetPerHeadCents: eventRequests.budgetPerHeadCents,
    })
    .from(eventRequests)
    .where(and(...filters))
    .orderBy(sql`${eventRequests.createdAt} DESC`);
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Solicitări de eveniment</h1>
      <InboxFilters active={activeKey} />
      <EventRequestInbox rows={rows} />
    </main>
  );
}
