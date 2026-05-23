import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests, erasureLog, auditLogs } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ResolveDinerModal } from "./_components/ResolveDinerModal";
import { VerifyIdentityModal } from "./_components/VerifyIdentityModal";
import { ApproveErasureButton } from "./_components/ApproveErasureButton";
import { RejectModal } from "./_components/RejectModal";
import { ExtendDeadlineModal } from "./_components/ExtendDeadlineModal";
import { FailureBanner } from "./_components/FailureBanner";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GdprRequestDetailPage({ params }: PageProps) {
  const { id } = await params;

  const rows = await dbAdmin
    .select()
    .from(dataSubjectRequests)
    .where(eq(dataSubjectRequests.id, id))
    .limit(1);
  const dsr = rows[0];
  if (!dsr) notFound();

  const cascadeRows = await dbAdmin
    .select()
    .from(erasureLog)
    .where(sql`${erasureLog.context}->>'dsrId' = ${id}`)
    .orderBy(desc(erasureLog.createdAt))
    .limit(200);

  const lastFailure = await dbAdmin
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.subjectId, id),
        eq(auditLogs.action, "compliance.dsr_cascade_failed"),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/admin/gdpr-requests" className="mb-6 inline-block text-sm text-stone-500 hover:text-stone-800">
        ← All requests
      </Link>

      <header className="mb-8">
        <h1 className="font-mono text-xs text-stone-500">{dsr.id}</h1>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">GDPR {dsr.requestKind} request</h2>
        <p className="mt-2 text-sm text-stone-600">
          Status: <span className="font-medium">{dsr.status}</span>
          {" · "}
          Legal deadline: <span className="font-medium">{dsr.legalDeadlineAt.toLocaleString()}</span>
          {dsr.deadlineExtensionDays > 0 && (
            <span className="text-amber-700"> (extended by {dsr.deadlineExtensionDays}d)</span>
          )}
        </p>
      </header>

      {lastFailure.length > 0 && (
        <FailureBanner dsrId={dsr.id} recordedAt={lastFailure[0].createdAt} />
      )}

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Subject</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Dt label="Phone">{dsr.identifierPhone ?? "—"}</Dt>
          <Dt label="Email">{dsr.identifierEmail ?? "—"}</Dt>
          <Dt label="Resolved diner">
            {dsr.dinerId ? (
              <span className="font-mono text-xs">{dsr.dinerId}</span>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-stone-400">unresolved</span>
                <ResolveDinerModal dsrId={dsr.id} />
              </div>
            )}
          </Dt>
          <Dt label="Source">{dsr.requestSource}</Dt>
        </dl>
        {dsr.requestBody && (
          <div className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">Request body</h4>
            <p className="mt-2 whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
              {dsr.requestBody}
            </p>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Identity verification</h3>
        {dsr.identityVerified ? (
          <p className="text-sm text-emerald-700">
            ✓ Verified {dsr.identityVerifiedAt?.toLocaleString()} via {dsr.identityVerificationMethod}
          </p>
        ) : (
          <VerifyIdentityModal dsrId={dsr.id} />
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <ApproveErasureButton
            dsrId={dsr.id}
            enabled={dsr.identityVerified && dsr.status === "received" && dsr.requestKind === "erasure"}
          />
          <RejectModal dsrId={dsr.id} />
          <ExtendDeadlineModal dsrId={dsr.id} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
          Cascade audit trail ({cascadeRows.length})
        </h3>
        {cascadeRows.length === 0 ? (
          <p className="text-sm text-stone-500">No cascade activity yet. Entries appear once the orchestrator runs.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <Th>Time</Th>
                  <Th>Subject</Th>
                  <Th>Reason</Th>
                  <Th>Columns</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {cascadeRows.map((row) => (
                  <tr key={row.id}>
                    <Td className="text-stone-600">{row.createdAt.toLocaleString()}</Td>
                    <Td>
                      <span className="font-mono text-xs">{row.subjectType}:{row.subjectId.slice(0, 8)}</span>
                    </Td>
                    <Td>{row.reason}</Td>
                    <Td className="text-xs text-stone-600">
                      {Array.isArray(row.redactedColumns) ? row.redactedColumns.join(", ") : ""}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Dt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-800">{children}</dd>
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
