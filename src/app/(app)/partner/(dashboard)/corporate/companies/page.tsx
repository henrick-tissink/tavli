import { getPartnerRestaurant } from "@/lib/auth/partner";
import { listCorporateClientsForRestaurant } from "@/lib/repos/corporate-clients-repo";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function CorporateCompaniesPage() {
  const restaurant = await getPartnerRestaurant();
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const companies = await listCorporateClientsForRestaurant(restaurant.id);

  return (
    <main className="max-w-4xl px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold leading-tight text-text-primary">
          {m.companies.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{m.companies.subtitle}</p>
      </header>

      {companies.length === 0 ? (
        <div className="rounded-card border border-border bg-surface-white p-10 text-center">
          <p className="font-semibold text-text-primary">{m.companies.empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-bg text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colName}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colCui}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colStatus}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary text-right">{m.companies.colReservations}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-semibold text-text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-text-secondary tabular-nums">{c.cui}</td>
                  <td className="px-4 py-3 text-text-secondary">{m.companies.status[c.status]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{c.reservationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
