import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { MeetingSpacesEditor } from "./MeetingSpacesEditor";
import { listActiveMeetingSpaces } from "@/lib/repos/meeting-spaces-repo";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function MeetingSpacesPage() {
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
  const spaces = await listActiveMeetingSpaces(venue.id);
  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">{m.meetingSpaces.title}</h1>
        <p className="text-sm text-text-secondary mt-1">{m.meetingSpaces.subtitle}</p>
      </header>
      <MeetingSpacesEditor restaurantId={venue.id} initialSpaces={spaces} />
    </div>
  );
}
