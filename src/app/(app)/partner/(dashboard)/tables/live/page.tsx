import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTables, restaurantTableSections, reservations, tableCombinations } from "@/lib/db/schema";
import { reservationsByTable } from "@/lib/tables/upcoming";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { walkinQueueOps } from "@/lib/tables/walkin";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { translate, interpolate } from "@/lib/i18n/t";
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

  const locale = await resolveAppLocale();
  const t = getMessages(locale, "partner.tables");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return <EmptyShell message={t.page.noRestaurant} />;

  const [venue] = await dbAdmin
    .select({ id: restaurants.id, name: restaurants.name, organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!venue) redirect("/partner");
  const orgId = venue.organizationId ?? "";

  if (!(await can(session, "floor_plan.edit", { kind: "restaurant", id: venue.id, organization_id: orgId }))) {
    return <EmptyShell message={t.live.noAccess} />;
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

  // §08 §6.2 — today's bookings. One query feeds both the "to seat" panel
  // (unassigned) and the per-table badges (assigned, incl. auto-assigned online
  // bookings and combinations), so the floor reflects reservations as they land.
  const today = new Date().toISOString().slice(0, 10);
  const todaysRows = await dbAdmin
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      partySize: reservations.partySize,
      time: reservations.reservationTime,
      status: reservations.status,
      tableId: reservations.tableId,
      combinationId: reservations.combinationId,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, venue.id),
        inArray(reservations.status, ["confirmed", "seated"]),
        eq(reservations.reservationDate, today),
        isNull(reservations.eventRequestId),
      ),
    )
    .orderBy(asc(reservations.reservationTime));

  // Member tables for any combination bookings today (so a joined booking badges
  // on each of its tables).
  const comboIds = [...new Set(todaysRows.map((r) => r.combinationId).filter(Boolean) as string[])];
  const comboMembers = new Map<string, string[]>();
  if (comboIds.length) {
    const combos = await dbAdmin
      .select({ id: tableCombinations.id, tableIds: tableCombinations.tableIds })
      .from(tableCombinations)
      .where(inArray(tableCombinations.id, comboIds));
    for (const c of combos) comboMembers.set(c.id, c.tableIds ?? []);
  }

  const byTable = reservationsByTable(
    todaysRows.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      partySize: r.partySize,
      time: String(r.time).slice(0, 5),
      tableId: r.tableId,
      combinationId: r.combinationId,
    })),
    comboMembers,
  );
  const reservationsByTableObj = Object.fromEntries(byTable);

  // The "to seat" panel: confirmed bookings with no table/combination yet.
  const unassigned = todaysRows.filter(
    (r) => r.status === "confirmed" && !r.tableId && !r.combinationId,
  );

  const freeCount = tables.filter((t) => t.currentStatus === "free").length;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-text-primary">{t.live.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {translate(locale, t.live.freeNow, { count: freeCount })} {t.live.now} · {interpolate(t.live.totalSuffix, { count: tables.length })}
          </p>
        </div>
        <Link href="/partner/tables" className="text-sm font-semibold text-brand-primary hover:underline">
          {t.live.editPlan}
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
        reservationsByTable={reservationsByTableObj}
      />
    </div>
  );
}
