import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getDinerProfile } from "@/lib/diners/profile";
import { DinerEditForm } from "./DinerEditForm";

export const dynamic = "force-dynamic";

const BUCKET_RO: Record<string, string> = {
  first_timer: "Nou",
  occasional: "Ocazional",
  regular: "Fidel",
  vip: "VIP",
  lapsed: "Inactiv",
};

const STATUS_RO: Record<string, string> = {
  confirmed: "Confirmată",
  completed: "Finalizată",
  cancelled: "Anulată",
  no_show: "Neprezentare",
  seated: "Așezat",
};

export default async function DinerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) redirect("/partner");
  const [venue] = await dbAdmin
    .select({ organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const orgId = venue?.organizationId ?? "";
  if (!orgId || !(await can(session, "diner.read", { kind: "organization", id: orgId }))) {
    redirect("/partner/diners");
  }

  // Audited PII reveal (§03 §5.5 — getDinerProfile self-logs via revealPiiBatch).
  const profile = await getDinerProfile({
    dinerId: id,
    actorUserId: session.userId,
    organizationId: orgId,
    surface: "partner_diner_detail",
  });
  if (!profile) redirect("/partner/diners");

  const d = profile.diner;
  // org-scoping guard: getDinerProfile loads by id; ensure it belongs to this org.
  if (d.organizationId !== orgId) redirect("/partner/diners");

  const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <Link
        href="/partner/diners"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} aria-hidden /> Înapoi la oaspeți
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="font-display text-3xl text-text-primary">{d.fullName ?? "Oaspete"}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          <span>{d.phone ?? "—"}</span>
          <span>{d.email ?? "—"}</span>
          <span>
            {BUCKET_RO[d.frequencyBucket] ?? d.frequencyBucket} · {d.visitCount} vizite
          </span>
          {d.lastVisitedAt && (
            <span>Ultima vizită: {new Date(d.lastVisitedAt).toLocaleDateString("ro-RO")}</span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-xl text-text-primary">Detalii & preferințe</h2>
          <div className="rounded-card border border-border bg-surface-white p-5">
            <DinerEditForm
              dinerId={d.id}
              initial={{
                birthdayDate: asStr(d.birthdayDate),
                anniversaryDate: asStr(d.anniversaryDate),
                occasionTags: (d.occasionTags ?? []).join(", "),
                allergies: (d.allergies ?? []).join(", "),
                dietaryPreferences: (d.dietaryPreferences ?? []).join(", "),
                internalNotes: d.internalNotes ?? "",
              }}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl text-text-primary">Istoric vizite</h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
                  <th scope="col" className="px-4 py-3 font-medium">Local</th>
                  <th scope="col" className="px-4 py-3 font-medium">Pers.</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {profile.visits.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-muted">
                      Nicio vizită înregistrată.
                    </td>
                  </tr>
                ) : (
                  profile.visits.map((v) => (
                    <tr key={v.reservationId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-secondary">{v.occurredAt.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-text-muted">{v.restaurantName}</td>
                      <td className="px-4 py-3 text-text-muted">{v.partySize}</td>
                      <td className="px-4 py-3 text-text-muted">{STATUS_RO[v.status] ?? v.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
