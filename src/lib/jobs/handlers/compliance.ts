/**
 * compliance job handlers — orchestrator + phase-2 wrapper + verify sweep entrypoint.
 *
 * - handleErasureExecute: §13 §6.3 orchestrator. Loads DSR, resolves diners,
 *   iterates pii-table-registry, schedules phase 2 + diner purge, completes DSR,
 *   records audit, sends confirmation email. Idempotent per-handler (registry
 *   entries are individually idempotent).
 *
 * - handleErasurePartnerNotificationsPhase2: thin wrapper that delegates to
 *   the imported phase-2 handler with system-actor context.
 *
 * Verification sweep entrypoint lives at src/lib/compliance/verify.ts and is
 * called from src/lib/jobs/bootstrap.ts as a scheduled job (T15 wires this).
 */

import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests, diners } from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import {
  PII_TABLE_REGISTRY,
  type PiiTableEntry,
  type HandlerResult,
} from "@/lib/compliance/pii-table-registry";
import {
  sendTransactionalEmail as defaultSendEmail,
  type SendTransactionalEmailInput,
} from "@/lib/email/send-transactional";
import {
  resolveDinerLocale as defaultResolveLocale,
  type Locale,
} from "@/lib/email/resolve-locale";
import {
  DataDeletionConfirmedEmail,
  getSubject as getDataDeletionSubject,
} from "@/emails/DataDeletionConfirmedEmail";
import { render } from "@react-email/render";
import { enqueue as defaultEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import {
  handlePartnerNotificationsPhase2,
} from "@/lib/compliance/handlers/partner-notifications-phase2";
import type { HandlerDeps as Phase2HandlerDeps } from "@/lib/compliance/pii-table-registry";

export interface ErasureExecutePayload {
  requestId: string;
}

interface DsrRow {
  id: string;
  status: string;
  identityVerified: boolean;
  approvedByUserId: string | null;
  dinerId: string | null;
  identifierEmail: string | null;
  identifierPhone: string | null;
}

interface ResolveDinersResult {
  dinerIds: string[];
  capturedIdentifiers: Array<{ dinerId: string; phone: string | null; email: string | null }>;
}

interface OrchestratorDeps {
  loadDsr: (id: string) => Promise<DsrRow | null>;
  resolveDiners: (dsr: DsrRow) => Promise<ResolveDinersResult>;
  registry: readonly PiiTableEntry[];
  updateDsrCompleted: (id: string, summary: Array<{ tableName: string; rowsRedacted: number }>) => Promise<void>;
  enqueuePhase2: (payload: { requestId: string }) => Promise<void>;
  enqueuePurge: (payload: { dinerId: string }) => Promise<void>;
  recordAudit: typeof defaultRecordAudit;
  sendEmail: (input: SendTransactionalEmailInput) => Promise<unknown>;
  resolveDinerLocale: (dinerId: string) => Promise<Locale>;
}

export function makeHandleErasureExecute(deps: OrchestratorDeps) {
  return async function handleErasureExecute(payload: ErasureExecutePayload): Promise<void> {
    const dsr = await deps.loadDsr(payload.requestId);
    if (!dsr) throw new Error(`TV1100 dsr_not_found: ${payload.requestId}`);
    if (dsr.status !== "in_progress") throw new Error(`TV1105 dsr_wrong_status: ${dsr.status}`);
    if (!dsr.identityVerified) throw new Error("TV1101 dsr_not_verified");
    if (!dsr.approvedByUserId) throw new Error("TV1101 dsr_not_verified: missing approver");

    const actorUserId = dsr.approvedByUserId;
    const { dinerIds, capturedIdentifiers } = await deps.resolveDiners(dsr);

    const summary: Array<{ tableName: string; rowsRedacted: number }> = [];
    for (const entry of deps.registry) {
      if (!entry.shipped || !entry.handler) continue;
      const result: HandlerResult | undefined = await entry.handler({
        db: dbAdmin as any,
        dsrId: dsr.id,
        dinerIds,
        capturedIdentifiers,
        actorUserId,
        impersonatorUserId: undefined,
        actorRole: "tavli_admin",
      });
      if (result) {
        summary.push({ tableName: result.tableName, rowsRedacted: result.rowsRedacted });
      }
    }

    await deps.updateDsrCompleted(dsr.id, summary);
    await deps.enqueuePhase2({ requestId: dsr.id });

    await deps.recordAudit({
      action: AUDIT.compliance.dsr_cascade_executed,
      subjectType: "data_subject_request",
      subjectId: dsr.id,
      actorUserId,
      actorRole: "tavli_admin",
      context: { dinerIds: dinerIds.join(","), summary: JSON.stringify(summary), capturedIdentifierCount: capturedIdentifiers.length },
    });

    for (const dinerId of dinerIds) {
      await deps.enqueuePurge({ dinerId });
    }

    const seenEmails = new Set<string>();
    for (const ci of capturedIdentifiers) {
      if (ci.email && !seenEmails.has(ci.email)) {
        seenEmails.add(ci.email);
        const locale = await deps.resolveDinerLocale(ci.dinerId);
        const now = new Date();
        const props = { dsrId: dsr.id, completedAt: now, createdAt: now, locale };
        const html = await render(DataDeletionConfirmedEmail(props));
        const text = await render(DataDeletionConfirmedEmail(props), { plainText: true });
        const subject = getDataDeletionSubject(locale, { dsrId: dsr.id });
        try {
          await deps.sendEmail({
            to: ci.email,
            locale,
            templateKey: "data_deletion_confirmed",
            subject,
            html,
            text,
            context: { diner_id: ci.dinerId },
          });
        } catch {
          // Send failure does NOT roll back the cascade. transactional_email_log
          // captures the failure; manual re-send is a follow-up admin action.
        }
      }
    }
  };
}

// ─── Production wiring ────────────────────────────────────────────────────

async function loadDsrProd(id: string): Promise<DsrRow | null> {
  const rows = await dbAdmin
    .select({
      id: dataSubjectRequests.id,
      status: dataSubjectRequests.status,
      identityVerified: dataSubjectRequests.identityVerified,
      approvedByUserId: dataSubjectRequests.approvedByUserId,
      dinerId: dataSubjectRequests.dinerId,
      identifierEmail: dataSubjectRequests.identifierEmail,
      identifierPhone: dataSubjectRequests.identifierPhone,
    })
    .from(dataSubjectRequests)
    .where(eq(dataSubjectRequests.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function resolveDinersProd(dsr: DsrRow): Promise<ResolveDinersResult> {
  const idSet = new Set<string>();
  if (dsr.dinerId) idSet.add(dsr.dinerId);

  const orClauses = [
    dsr.identifierPhone ? eq(diners.phone, dsr.identifierPhone) : undefined,
    dsr.identifierEmail ? eq(diners.email, dsr.identifierEmail) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  if (orClauses.length > 0) {
    const matches = await dbAdmin
      .select({ id: diners.id })
      .from(diners)
      .where(or(...orClauses));
    for (const m of matches) idSet.add(m.id);
  }

  const dinerIds = [...idSet];
  if (dinerIds.length === 0) return { dinerIds: [], capturedIdentifiers: [] };

  const rows = await dbAdmin
    .select({ id: diners.id, phone: diners.phone, email: diners.email })
    .from(diners)
    .where(inArray(diners.id, dinerIds));

  return {
    dinerIds,
    capturedIdentifiers: rows.map((r) => ({ dinerId: r.id, phone: r.phone, email: r.email })),
  };
}

async function resolveDinerLocaleProd(dinerId: string): Promise<Locale> {
  // resolveDinerLocale(input: { diner?, reservation?, restaurant }) — we have
  // no diner.locale column available without a join, so fall back to the
  // restaurant-level resolver with a neutral restaurant locale so that the
  // diner-locale priority path wins if the diner has a locale set.
  // In practice diners table lacks a `locale` column in v1; 'ro' is correct
  // default per §04 §6.3.
  void dinerId; // dinerId reserved for future diner.locale lookup
  return defaultResolveLocale({ restaurant: { locale: "ro" } });
}

export const handleErasureExecute = makeHandleErasureExecute({
  loadDsr: loadDsrProd,
  resolveDiners: resolveDinersProd,
  registry: PII_TABLE_REGISTRY,
  updateDsrCompleted: async (id, _summary) => {
    await dbAdmin
      .update(dataSubjectRequests)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, id));
  },
  enqueuePhase2: async (payload) => {
    await defaultEnqueue(JOBS.compliance.erasurePartnerNotificationsPhase2, payload, { startAfter: 5 * 60 });
  },
  enqueuePurge: async (payload) => {
    await defaultEnqueue(JOBS.diner.purgePseudonymised, payload, { startAfter: 30 * 24 * 60 * 60 });
  },
  recordAudit: defaultRecordAudit,
  sendEmail: defaultSendEmail as unknown as OrchestratorDeps["sendEmail"],
  resolveDinerLocale: resolveDinerLocaleProd,
});

// ─── Phase 2 wrapper ──────────────────────────────────────────────────────

export interface ErasurePhase2Payload {
  requestId: string;
}

export async function handleErasurePartnerNotificationsPhase2(payload: ErasurePhase2Payload): Promise<void> {
  await handlePartnerNotificationsPhase2({
    db: dbAdmin as Phase2HandlerDeps["db"],
    dsrId: payload.requestId,
    dinerIds: [],
    capturedIdentifiers: [],
    actorUserId: "00000000-0000-0000-0000-000000000000", // system actor for the scheduled phase-2 job
    impersonatorUserId: undefined,
    // Phase-2 is system-driven; HandlerDeps.actorRole is narrowed to "tavli_admin"
    // because all registry handlers (incl. diners) require it, but partner-notifications-phase2
    // does not read actorRole — cast is safe here.
    actorRole: "system" as unknown as "tavli_admin",
  });
}
