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
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { formatDate } from "@/lib/i18n/format";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "numeric",
};

export default async function GdprRequestDetailPage({ params }: PageProps) {
  const { id } = await params;

  const localeRaw = await resolveAppLocale();
  const locale: Locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const m = getMessages(locale, "admin.gdpr");

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
    .where(sql`${erasureLog.context}->>'dsrId' = ${id} OR ${erasureLog.reason} = ${`gdpr_erasure_dsr_${id}`}`)
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
        {m.detail.back}
      </Link>

      <header className="mb-8">
        <h1 className="font-mono text-xs text-stone-500">{dsr.id}</h1>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {interpolate(m.detail.heading, { kind: dsr.requestKind })}
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          {m.detail.statusLabel} <span className="font-medium">{dsr.status}</span>
          {" · "}
          {m.detail.deadlineLabel}{" "}
          <span className="font-medium">{formatDate(dsr.legalDeadlineAt, locale, DATE_TIME_OPTS)}</span>
          {dsr.deadlineExtensionDays > 0 && (
            <span className="text-amber-700">
              {interpolate(m.detail.deadlineExtended, { days: dsr.deadlineExtensionDays })}
            </span>
          )}
        </p>
      </header>

      {lastFailure.length > 0 && (
        <FailureBanner dsrId={dsr.id} recordedAt={lastFailure[0].createdAt} />
      )}

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">{m.detail.subjectHeading}</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Dt label={m.detail.phoneLabel}>{dsr.identifierPhone ?? m.detail.empty}</Dt>
          <Dt label={m.detail.emailLabel}>{dsr.identifierEmail ?? m.detail.empty}</Dt>
          <Dt label={m.detail.resolvedDinerLabel}>
            {dsr.dinerId ? (
              <span className="font-mono text-xs">{dsr.dinerId}</span>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-stone-400">{m.detail.unresolved}</span>
                <ResolveDinerModal dsrId={dsr.id} />
              </div>
            )}
          </Dt>
          <Dt label={m.detail.sourceLabel}>{dsr.requestSource}</Dt>
        </dl>
        {dsr.requestBody && (
          <div className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">{m.detail.requestBodyHeading}</h4>
            <p className="mt-2 whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
              {dsr.requestBody}
            </p>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">{m.detail.identityHeading}</h3>
        {dsr.identityVerified ? (
          <p className="text-sm text-emerald-700">
            {interpolate(m.detail.identityVerified, {
              at: dsr.identityVerifiedAt ? formatDate(dsr.identityVerifiedAt, locale, DATE_TIME_OPTS) : "",
              method: dsr.identityVerificationMethod ?? "",
            })}
          </p>
        ) : (
          <VerifyIdentityModal dsrId={dsr.id} />
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">{m.detail.actionsHeading}</h3>
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
          {interpolate(m.detail.cascadeHeading, { count: cascadeRows.length })}
        </h3>
        {cascadeRows.length === 0 ? (
          <p className="text-sm text-stone-500">{m.detail.cascadeEmpty}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-stone-200">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <Th>{m.detail.cascadeTable.time}</Th>
                  <Th>{m.detail.cascadeTable.subject}</Th>
                  <Th>{m.detail.cascadeTable.reason}</Th>
                  <Th>{m.detail.cascadeTable.columns}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {cascadeRows.map((row) => (
                  <tr key={row.id}>
                    <Td className="text-stone-600">{formatDate(row.createdAt, locale, DATE_TIME_OPTS)}</Td>
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
