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
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { translate, interpolate } from "@/lib/i18n/t";
import { BCP47 } from "@/lib/i18n/locale";
import { DinerEditForm } from "./DinerEditForm";

export const dynamic = "force-dynamic";

export default async function DinerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.diners");
  const bucketLabel = (b: string): string =>
    (m.bucket as Record<string, string>)[b] ?? b;
  const statusLabel = (s: string): string =>
    (m.status as Record<string, string>)[s] ?? s;

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
        <ArrowLeft size={15} aria-hidden /> {m.detail.back}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="font-display text-3xl text-text-primary">{d.fullName ?? m.detail.fallbackName}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          <span>{d.phone ?? "—"}</span>
          <span>{d.email ?? "—"}</span>
          <span>
            {bucketLabel(d.frequencyBucket)} · {translate(locale, m.detail.visits, { count: d.visitCount })}
          </span>
          {d.lastVisitedAt && (
            <span>{interpolate(m.detail.lastVisit, { date: new Date(d.lastVisitedAt).toLocaleDateString(BCP47[locale]) })}</span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-xl text-text-primary">{m.detail.preferencesTitle}</h2>
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
          <h2 className="mb-3 font-display text-xl text-text-primary">{m.detail.historyTitle}</h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">{m.detail.history.date}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{m.detail.history.venue}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{m.detail.history.party}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{m.detail.history.status}</th>
                </tr>
              </thead>
              <tbody>
                {profile.visits.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-muted">
                      {m.detail.noVisits}
                    </td>
                  </tr>
                ) : (
                  profile.visits.map((visit) => (
                    <tr key={visit.reservationId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-secondary">{visit.occurredAt.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-text-muted">{visit.restaurantName}</td>
                      <td className="px-4 py-3 text-text-muted">{visit.partySize}</td>
                      <td className="px-4 py-3 text-text-muted">{statusLabel(visit.status)}</td>
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
