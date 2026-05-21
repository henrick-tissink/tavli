import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

export default async function PartnerGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    redirect("/partner/sign-in");
  }

  const supabase = await createSupabaseServerClient();
  const restaurantId = await currentUserPrimaryRestaurant(session);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("id, name")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  let openEventRequestsCount = 0;
  if (restaurant?.id) {
    const openRows = await dbAdmin
      .select({ id: eventRequests.id })
      .from(eventRequests)
      .where(
        and(
          eq(eventRequests.restaurantId, restaurant.id),
          inArray(eventRequests.status, ["new", "viewing", "replied", "quoted"]),
        ),
      );
    openEventRequestsCount = openRows.length;
  }

  return (
    <PartnerShell
      restaurantName={restaurant?.name ?? null}
      userEmail={session.userEmail}
      openEventRequestsCount={openEventRequestsCount}
    >
      {children}
    </PartnerShell>
  );
}
