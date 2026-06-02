import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { searchDiners, listRecentDiners } from "@/lib/diners/search";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { BCP47 } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

function EmptyShell({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <div className="rounded-card border border-border bg-surface-white p-10 text-center">
        <p className="font-semibold text-text-primary">{message}</p>
      </div>
    </div>
  );
}

export default async function DinersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.diners");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return <EmptyShell message={m.list.noRestaurant} />;

  const [venue] = await dbAdmin
    .select({ organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const orgId = venue?.organizationId ?? "";

  if (!orgId || !(await can(session, "diner.read", { kind: "organization", id: orgId }))) {
    return <EmptyShell message={m.list.noAccess} />;
  }

  const q = ((await searchParams)?.q ?? "").trim();
  const rows = q
    ? await searchDiners({ orgId, query: q })
    : await listRecentDiners({ orgId });

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-text-primary">{m.list.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {m.list.subtitle}
        </p>
      </header>

      <form method="get" className="mb-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={m.list.searchPlaceholder}
          className="w-full max-w-sm rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark"
        >
          {m.list.searchSubmit}
        </button>
        {q && (
          <Link href="/partner/diners" className="self-center text-sm text-text-secondary hover:text-text-primary">
            {m.list.reset}
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-card border border-border bg-surface-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th scope="col" className="px-4 py-3 font-medium">{m.list.table.guest}</th>
              <th scope="col" className="px-4 py-3 font-medium">{m.list.table.contact}</th>
              <th scope="col" className="px-4 py-3 font-medium">{m.list.table.visits}</th>
              <th scope="col" className="px-4 py-3 font-medium">{m.list.table.lastVisit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                  {q ? m.list.emptySearch : m.list.empty}
                </td>
              </tr>
            ) : (
              rows.map((diner) => (
                <tr key={diner.id} className="border-b border-border last:border-0 hover:bg-surface-bg">
                  <td className="px-4 py-3">
                    <Link href={`/partner/diners/${diner.id}`} className="font-medium text-text-primary hover:text-brand-primary">
                      {diner.fullName ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{diner.phoneMasked}</div>
                    <div className="text-xs">{diner.emailMasked}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{diner.visitCount}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {diner.lastVisitedAt ? new Date(diner.lastVisitedAt).toLocaleDateString(BCP47[locale]) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        {m.list.maskedHint}
      </p>
    </div>
  );
}
