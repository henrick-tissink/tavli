import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTables, restaurantTableSections, reservations } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { SectionsManager } from "./_components/SectionsManager";
import { FloorPlanEditor } from "./_components/FloorPlanEditor";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const locale = await resolveAppLocale();
  const t = getMessages(locale, "partner.tables");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            {t.page.noRestaurant}
          </p>
        </div>
      </div>
    );
  }

  const [venue] = await dbAdmin
    .select({ id: restaurants.id, name: restaurants.name, organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  if (!venue) redirect("/partner");

  // organizationId may be null on dev DBs that haven't run the org-ownership
  // migration yet. Fall back to an empty string so the page renders; server
  // actions will authz against the real value in production.
  const organizationId = venue.organizationId ?? "";

  const [sections, tables] = await Promise.all([
    dbAdmin
      .select()
      .from(restaurantTableSections)
      .where(eq(restaurantTableSections.restaurantId, restaurantId))
      .orderBy(asc(restaurantTableSections.sortOrder), asc(restaurantTableSections.name)),

    dbAdmin
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.restaurantId, restaurantId),
          isNull(restaurantTables.archivedAt),
        ),
      )
      .orderBy(asc(restaurantTables.label)),
  ]);

  // Tonight's reservations (today, still-active) for the Diseară view. Tables
  // carrying an assignment show as booked; the rest are listed in the panel.
  const today = new Date().toISOString().slice(0, 10);
  const tonight =
    tables.length === 0
      ? []
      : await dbAdmin
          .select({
            id: reservations.id,
            guestName: reservations.guestName,
            time: reservations.reservationTime,
            partySize: reservations.partySize,
            tableId: reservations.tableId,
          })
          .from(reservations)
          .where(
            and(
              eq(reservations.restaurantId, restaurantId),
              eq(reservations.reservationDate, today),
              inArray(reservations.status, ["confirmed", "seated"]),
            ),
          )
          .orderBy(asc(reservations.reservationTime));

  const sectionRows = sections.map((s) => ({
    id: s.id,
    restaurantId: s.restaurantId,
    organizationId,
    name: s.name,
    color: s.color,
    sortOrder: s.sortOrder,
  }));

  const tableRows = tables.map((t) => ({
    id: t.id,
    restaurantId: t.restaurantId,
    organizationId,
    sectionId: t.sectionId,
    label: t.label,
    description: t.description,
    capacityMin: t.capacityMin,
    capacityMax: t.capacityMax,
    capacityTypical: t.capacityTypical,
    shape: t.shape,
    positionX: t.positionX,
    positionY: t.positionY,
    width: t.width,
    height: t.height,
    rotationDegrees: t.rotationDegrees,
    isBookableOnline: t.isBookableOnline,
    isProOnly: t.isProOnly,
  }));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            {t.page.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t.page.subtitlePrefix}{" "}
            <span className="font-medium">{venue.name}</span>
            {t.page.subtitleSuffix}
          </p>
        </div>
      </header>

      <div className="mb-8 max-w-[1040px]">
        <FloorPlanEditor
          restaurantId={restaurantId}
          organizationId={organizationId}
          tables={tableRows.map((t) => ({
            id: t.id,
            label: t.label,
            sectionId: t.sectionId,
            capacityTypical: t.capacityTypical ?? t.capacityMin ?? 2,
            shape: t.shape,
            positionX: t.positionX,
            positionY: t.positionY,
            width: t.width,
            height: t.height,
            isBookableOnline: t.isBookableOnline,
          }))}
          sections={sectionRows.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          tonight={tonight.map((r) => ({
            id: r.id,
            guestName: r.guestName,
            time: r.time,
            partySize: r.partySize,
            tableId: r.tableId,
          }))}
        />
      </div>

      <div className="max-w-3xl">
        <SectionsManager
          restaurantId={restaurantId}
          organizationId={organizationId}
          sections={sectionRows}
        />
      </div>
    </div>
  );
}
