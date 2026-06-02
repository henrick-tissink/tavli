import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { formatDate } from "@/lib/i18n/format";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function GdprRequestsListPage() {
  const localeRaw = await resolveAppLocale();
  const locale: Locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const m = getMessages(locale, "admin.gdpr");

  const rows = await dbAdmin
    .select()
    .from(dataSubjectRequests)
    .orderBy(asc(dataSubjectRequests.legalDeadlineAt));

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const open = rows.filter((r) => r.status === "received" || r.status === "in_progress");
  const closed = rows.filter((r) => r.status === "completed" || r.status === "rejected");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{m.list.title}</h1>
        <p className="mt-2 text-sm text-stone-600">{m.list.subtitle}</p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
          {interpolate(m.list.openHeading, { count: open.length })}
        </h2>
        {open.length === 0 ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600">
            {m.list.openEmpty}
          </p>
        ) : (
          <RequestsTable rows={open} highlightDeadline nowMs={nowMs} locale={locale} m={m} />
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
            {interpolate(m.list.closedHeading, { count: closed.length })}
          </h2>
          <RequestsTable rows={closed} highlightDeadline={false} nowMs={nowMs} locale={locale} m={m} />
        </section>
      )}
    </main>
  );
}

interface Row {
  id: string;
  requestKind: string;
  requestSource: string;
  identifierPhone: string | null;
  identifierEmail: string | null;
  dinerId: string | null;
  status: string;
  legalDeadlineAt: Date;
  createdAt: Date;
}

type GdprMessages = ReturnType<typeof getMessages<"admin.gdpr">>;

function RequestsTable({
  rows,
  highlightDeadline,
  nowMs,
  locale,
  m,
}: {
  rows: Row[];
  highlightDeadline: boolean;
  nowMs: number;
  locale: Locale;
  m: GdprMessages;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            <Th>{m.list.table.id}</Th>
            <Th>{m.list.table.kind}</Th>
            <Th>{m.list.table.source}</Th>
            <Th>{m.list.table.identifier}</Th>
            <Th>{m.list.table.diner}</Th>
            <Th>{m.list.table.status}</Th>
            <Th>{m.list.table.deadline}</Th>
            <Th>{m.list.table.created}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.map((r) => {
            const daysToDeadline = Math.round((r.legalDeadlineAt.getTime() - nowMs) / 86_400_000);
            const isUrgent = highlightDeadline && daysToDeadline <= 7;
            return (
              <tr key={r.id} className={isUrgent ? "bg-red-50" : undefined}>
                <Td>
                  <Link
                    href={`/admin/gdpr-requests/${r.id}`}
                    className="font-mono text-xs text-stone-700 hover:underline"
                  >
                    {r.id.slice(0, 8)}
                  </Link>
                </Td>
                <Td>{r.requestKind}</Td>
                <Td>{r.requestSource}</Td>
                <Td>{r.identifierPhone ?? r.identifierEmail ?? m.list.empty}</Td>
                <Td>
                  {r.dinerId ? (
                    <span className="font-mono text-xs">{r.dinerId.slice(0, 8)}</span>
                  ) : (
                    <span className="text-stone-400">{m.list.unresolved}</span>
                  )}
                </Td>
                <Td>{r.status}</Td>
                <Td className={isUrgent ? "text-red-700 font-medium" : undefined}>
                  {interpolate(m.list.deadlineDays, { days: daysToDeadline })}
                </Td>
                <Td>{formatDate(r.createdAt, locale)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 text-stone-800 ${className ?? ""}`}>{children}</td>;
}
