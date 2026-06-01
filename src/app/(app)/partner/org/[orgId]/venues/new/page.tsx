import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { cities, restaurants } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { AddVenueForm } from "./_components/AddVenueForm";

export const dynamic = "force-dynamic";

export default async function AddVenuePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (!(await can(session, "org.add_venue", { kind: "organization", id: orgId }))) {
    redirect(`/partner/org/${orgId}/venues`);
  }

  const [cityRows, sub, activeVenues] = await Promise.all([
    dbAdmin.select({ id: cities.id, name: cities.name }).from(cities).orderBy(asc(cities.name)),
    loadActiveSubscription(orgId),
    dbAdmin
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(and(eq(restaurants.organizationId, orgId), isNull(restaurants.archivedAt))),
  ]);

  const showBillingNote = sub?.tier === "pro" && activeVenues.length >= 3;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl text-text-primary">Adaugă o locație</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Creezi o locație nouă în organizație. După creare, o configurezi (program, fotografii, meniu).
        </p>
      </div>
      <AddVenueForm organizationId={orgId} cities={cityRows} showBillingNote={!!showBillingNote} />
    </div>
  );
}
