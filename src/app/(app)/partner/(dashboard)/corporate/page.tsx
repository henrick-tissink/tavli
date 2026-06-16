import { getPartnerRestaurant } from "@/lib/auth/partner";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, meetingSpaceBookings } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { CorporateOverview } from "@/components/partner/CorporateOverview";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { toggleCapability } from "./actions";
import { listCorporateClientsForRestaurant } from "@/lib/repos/corporate-clients-repo";
import { listActiveStandingSeries } from "@/lib/repos/standing-repo";

export const dynamic = "force-dynamic";

export default async function CorporatePage() {
  const restaurant = await getPartnerRestaurant();
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const openRows = await dbAdmin
    .select({ id: eventRequests.id })
    .from(eventRequests)
    .where(
      and(
        eq(eventRequests.restaurantId, restaurant.id),
        inArray(eventRequests.status, ["new", "viewing", "replied", "quoted"]),
      ),
    );
  const pendingMeetingRows = await dbAdmin
    .select({ id: meetingSpaceBookings.id })
    .from(meetingSpaceBookings)
    .where(
      and(
        eq(meetingSpaceBookings.restaurantId, restaurant.id),
        eq(meetingSpaceBookings.status, "requested"),
      ),
    );
  const corporateClientRows = await listCorporateClientsForRestaurant(restaurant.id);
  const activeStanding = (await listActiveStandingSeries()).filter((s) => s.restaurantId === restaurant.id);
  return (
    <main className="max-w-4xl px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold leading-tight text-text-primary">
          {m.overview.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{m.overview.subtitle}</p>
      </header>
      <CorporateOverview
        restaurantId={restaurant.id}
        capabilities={{
          events: {
            enabled: restaurant.eventsIntakeEnabled,
            openCount: openRows.length,
          },
          corporateMeals: {
            enabled: restaurant.acceptsCorporateMeals,
            openCount: corporateClientRows.length,
          },
          standing: {
            enabled: restaurant.acceptsStanding,
            openCount: activeStanding.length,
          },
          meetingNooks: {
            enabled: restaurant.acceptsMeetingSpaces,
            openCount: pendingMeetingRows.length,
          },
        }}
        onToggle={toggleCapability.bind(null, restaurant.id)}
      />
    </main>
  );
}
