import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { listStandingForRestaurant } from "@/lib/repos/standing-repo";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { StandingEditor } from "./StandingEditor";

export const dynamic = "force-dynamic";

export default async function StandingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) redirect("/partner");
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const series = await listStandingForRestaurant(restaurantId);
  const tables = await dbAdmin
    .select({ id: restaurantTables.id, label: restaurantTables.label })
    .from(restaurantTables)
    .where(and(eq(restaurantTables.restaurantId, restaurantId), isNull(restaurantTables.archivedAt)))
    .orderBy(restaurantTables.label);

  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">{m.standingMgmt.title}</h1>
        <p className="text-sm text-text-secondary mt-1">{m.standingMgmt.subtitle}</p>
      </header>
      <StandingEditor restaurantId={restaurantId} initialSeries={series} tables={tables} weekdays={m.standingMgmt.weekdays} />
    </div>
  );
}
