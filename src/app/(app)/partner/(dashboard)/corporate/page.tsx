import { getPartnerRestaurant } from "@/lib/auth/partner";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { CorporateOverview } from "@/components/partner/CorporateOverview";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { toggleCapability } from "./actions";

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
          corporateMeals: { enabled: restaurant.acceptsCorporateMeals },
          standing: { enabled: restaurant.acceptsStanding },
          meetingNooks: { enabled: false },
        }}
        onToggle={toggleCapability.bind(null, restaurant.id)}
      />
    </main>
  );
}
