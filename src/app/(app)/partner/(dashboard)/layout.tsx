import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { currentUserPrimaryRestaurant, listAccessibleVenues } from "@/lib/restaurants/current-user";
import { ImpersonationBanner } from "@/components/banners/ImpersonationBanner";
import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { buildBundle } from "@/lib/i18n/messages";

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
  // §01 §5.3 — email-verification gate. An authenticated-but-unconfirmed user
  // cannot use the portal until they verify their email.
  const { data: authData } = await supabase.auth.getUser();
  if (authData?.user && !authData.user.email_confirmed_at) {
    redirect("/partner/verify-email");
  }
  const [restaurantId, venues] = await Promise.all([
    currentUserPrimaryRestaurant(session),
    listAccessibleVenues(session),
  ]);
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

  const impersonationActive =
    (await readImpersonationReturnCookie()) !== null;

  const locale = await resolveAppLocale();
  const bundle = buildBundle(locale, ["partner.common", "partner.reservations", "partner.menu", "partner.tables", "partner.diners", "partner.analytics", "partner.billing", "partner.staffSecurity"]);

  return (
    <>
      <ImpersonationBanner />
      <div className={impersonationActive ? "pt-12" : ""}>
        <PartnerShell
          locale={locale}
          bundle={bundle}
          restaurantName={restaurant?.name ?? null}
          userEmail={session.userEmail}
          openEventRequestsCount={openEventRequestsCount}
          venues={venues}
          activeVenueId={restaurantId}
        >
          {children}
        </PartnerShell>
      </div>
    </>
  );
}
