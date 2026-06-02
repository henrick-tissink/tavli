import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantPrivateSpaces } from "@/lib/db/schema";
import { SpacesEditor } from "./SpacesEditor";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function SpacesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) redirect("/partner");
  const [venue] = await dbAdmin
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!venue) redirect("/partner");
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const spaces = await dbAdmin
    .select()
    .from(restaurantPrivateSpaces)
    .where(
      and(
        eq(restaurantPrivateSpaces.restaurantId, venue.id),
        eq(restaurantPrivateSpaces.isActive, true),
      ),
    )
    .orderBy(
      asc(restaurantPrivateSpaces.sortOrder),
      asc(restaurantPrivateSpaces.capacityMin),
    );
  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">{m.spaces.title}</h1>
        <p className="text-sm text-text-secondary mt-1">{m.spaces.subtitle}</p>
      </header>
      <SpacesEditor restaurantId={venue.id} initialSpaces={spaces} />
    </div>
  );
}
