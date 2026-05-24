import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Resolves the signed-in partner's organization and redirects to its dashboard. */
export default async function OrgEntryPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  let organizationId = session.profile.defaultOrganizationId;
  if (!organizationId) {
    const restaurantId = await currentUserPrimaryRestaurant(session);
    if (restaurantId) {
      const [r] = await dbAdmin
        .select({ orgId: restaurants.organizationId })
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId));
      organizationId = r?.orgId ?? null;
    }
  }

  redirect(organizationId ? `/partner/org/${organizationId}` : "/partner");
}
