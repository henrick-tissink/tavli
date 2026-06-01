import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GdprRequestsListPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">GDPR data-subject requests</h1>
        <p className="mt-2 text-sm text-stone-600">
          Sorted by legal deadline. Red rows are due in 7 days or less. Tavli-admin intake only in v1 —
          record requests received via email, postal, or verbal channels here.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
          Open requests ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600">
            No open requests. New requests typically arrive via email (legal@tavli.ro), postal mail,
            or verbal report; the 30-day GDPR response clock starts at receipt.
          </p>
        ) : (
          <RequestsTable rows={open} highlightDeadline nowMs={nowMs} />
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
            Closed requests ({closed.length})
          </h2>
          <RequestsTable rows={closed} highlightDeadline={false} nowMs={nowMs} />
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

function RequestsTable({ rows, highlightDeadline, nowMs }: { rows: Row[]; highlightDeadline: boolean; nowMs: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            <Th>ID</Th>
            <Th>Kind</Th>
            <Th>Source</Th>
            <Th>Identifier</Th>
            <Th>Diner</Th>
            <Th>Status</Th>
            <Th>Deadline</Th>
            <Th>Created</Th>
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
                <Td>{r.identifierPhone ?? r.identifierEmail ?? "—"}</Td>
                <Td>
                  {r.dinerId ? (
                    <span className="font-mono text-xs">{r.dinerId.slice(0, 8)}</span>
                  ) : (
                    <span className="text-stone-400">unresolved</span>
                  )}
                </Td>
                <Td>{r.status}</Td>
                <Td className={isUrgent ? "text-red-700 font-medium" : undefined}>
                  {daysToDeadline}d
                </Td>
                <Td>{r.createdAt.toLocaleDateString()}</Td>
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
