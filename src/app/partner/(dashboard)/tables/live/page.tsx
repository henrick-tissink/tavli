import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTables, restaurantTableSections, reservations } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { walkinQueueOps } from "@/lib/tables/walkin";
import { LiveFloor } from "../_components/LiveFloor";

export const dynamic = "force-dynamic";

function EmptyShell({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <div className="rounded-card border border-border bg-surface-white p-10 text-center">
        <p className="font-semibold text-text-primary">{message}</p>
      </div>
    </div>
  );
}

export default async function LiveFloorPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return <EmptyShell message="Niciun restaurant asociat acestui cont." />;

  const [venue] = await dbAdmin
    .select({ id: restaurants.id, name: restaurants.name, organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!venue) redirect("/partner");
  const orgId = venue.organizationId ?? "";

  if (!(await can(session, "floor_plan.edit", { kind: "restaurant", id: venue.id, organization_id: orgId }))) {
    return <EmptyShell message="Nu ai acces la planul sălii." />;
  }

  const [tables, sections, walkins] = await Promise.all([
    dbAdmin
      .select({
        id: restaurantTables.id,
        label: restaurantTables.label,
        sectionId: restaurantTables.sectionId,
        currentStatus: restaurantTables.currentStatus,
        currentCombinationId: restaurantTables.currentCombinationId,
        capacityMin: restaurantTables.capacityMin,
        capacityMax: restaurantTables.capacityMax,
      })
      .from(restaurantTables)
      .where(and(eq(restaurantTables.restaurantId, venue.id), isNull(restaurantTables.archivedAt)))
      .orderBy(asc(restaurantTables.label)),
    dbAdmin
      .select({ id: restaurantTableSections.id, name: restaurantTableSections.name })
      .from(restaurantTableSections)
      .where(eq(restaurantTableSections.restaurantId, venue.id))
      .orderBy(asc(restaurantTableSections.sortOrder)),
    walkinQueueOps.listActive(venue.id),
  ]);

  // §08 §6.2 — today's confirmed bookings not yet assigned to a table.
  const today = new Date().toISOString().slice(0, 10);
  const unassigned = await dbAdmin
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      partySize: reservations.partySize,
      time: reservations.reservationTime,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, venue.id),
        eq(reservations.status, "confirmed"),
        isNull(reservations.tableId),
        eq(reservations.reservationDate, today),
      ),
    )
    .orderBy(asc(reservations.reservationTime));

  const freeCount = tables.filter((t) => t.currentStatus === "free").length;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-text-primary">Sala — live</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {freeCount} {freeCount === 1 ? "masă liberă" : "mese libere"} acum · {tables.length} mese în total
          </p>
        </div>
        <Link href="/partner/tables" className="text-sm font-semibold text-brand-primary hover:underline">
          Editează planul →
        </Link>
      </header>

      <LiveFloor
        restaurantId={venue.id}
        sections={sections}
        tables={tables.map((t) => ({
          id: t.id,
          label: t.label,
          sectionId: t.sectionId,
          currentStatus: t.currentStatus,
          currentCombinationId: t.currentCombinationId,
          capacityMin: t.capacityMin,
          capacityMax: t.capacityMax,
        }))}
        walkins={walkins.map((w) => ({
          id: w.id,
          guestName: w.guestName,
          partySize: w.partySize,
          status: w.status,
          position: w.position,
          estimatedWaitMinutes: w.estimatedWaitMinutes,
        }))}
        reservations={unassigned.map((r) => ({
          id: r.id,
          guestName: r.guestName,
          partySize: r.partySize,
          time: String(r.time).slice(0, 5),
        }))}
      />
    </div>
  );
}
