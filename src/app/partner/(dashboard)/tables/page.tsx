import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantTables, restaurantTableSections } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { TablesList } from "./_components/TablesList";
import { SectionsManager } from "./_components/SectionsManager";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            Niciun restaurant asociat acestui cont.
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
            Plan sală
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Configurează mesele și secțiunile pentru{" "}
            <span className="font-medium">{venue.name}</span>. Drag-drop va fi
            disponibil în curând — deocamdată editează pozițiile numeric.
          </p>
        </div>
      </header>

      <div className="max-w-3xl space-y-6">
        <SectionsManager
          restaurantId={restaurantId}
          organizationId={organizationId}
          sections={sectionRows}
        />

        <TablesList
          restaurantId={restaurantId}
          organizationId={organizationId}
          sections={sectionRows}
          tables={tableRows}
        />
      </div>
    </div>
  );
}
