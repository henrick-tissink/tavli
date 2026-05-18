import { notFound } from "next/navigation";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { EventRequestInbox } from "@/components/partner/EventRequestInbox";

export const dynamic = "force-dynamic";

const OPEN: Array<"new" | "viewing" | "replied" | "quoted"> = [
  "new",
  "viewing",
  "replied",
  "quoted",
];

export default async function EventInboxPage() {
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
    .where(eq(eventRequests.restaurantId, r.id))
    .orderBy(sql`${eventRequests.createdAt} DESC`);
  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Solicitări de eveniment</h1>
      <EventRequestInbox rows={rows} />
    </main>
  );
}
