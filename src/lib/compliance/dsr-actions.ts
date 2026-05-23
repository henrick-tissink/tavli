/**
 * dsr-actions — server actions for DSR (data subject request) lifecycle.
 *
 * §13 §7 — Tavli-admin-only intake surface (in-product diner self-service
 * intake is deferred to a future Wave). All actions require a session and
 * the appropriate gdpr.* permission (which only resolves true for
 * profile.role = 'admin' per the can() shortcut).
 *
 * T18 ships: createDsr, resolveDinerForDsr, verifyDsrIdentity.
 * T19 ships: approveDsrErasure, rejectDsr, extendDsrDeadline.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { can as defaultCan } from "@/lib/authz/can";
import { getCurrentSession as defaultGetCurrentSession } from "@/lib/auth/session";
import { currentActor as defaultCurrentActor } from "@/lib/auth/current-actor";
import { enqueue as defaultEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type RequestKind =
  | "access"
  | "rectification"
  | "erasure"
  | "portability"
  | "restrict_processing"
  | "object";

export type RequestSource = "in_product" | "email" | "postal" | "verbal";

export interface CreateDsrInput {
  identifier_phone?: string;
  identifier_email?: string;
  request_kind: RequestKind;
  request_source: RequestSource;
  request_body?: string;
}

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  can: typeof defaultCan;
  getCurrentSession: typeof defaultGetCurrentSession;
  currentActor: typeof defaultCurrentActor;
  enqueue: typeof defaultEnqueue;
}

export function makeDsrActions(deps: Deps) {
  async function loadSessionAndCheck(
    action:
      | "gdpr.create_dsr"
      | "gdpr.resolve_diner"
      | "gdpr.verify_identity"
      | "gdpr.approve_erasure"
      | "gdpr.reject"
      | "gdpr.extend_deadline",
  ) {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    const allowed = await deps.can(session, action, { kind: "global" });
    if (!allowed) throw new Error(`forbidden: ${action}`);
    const { impersonatorUserId } = await deps.currentActor(session.userId);
    return { session, impersonatorUserId };
  }

  async function createDsr(input: CreateDsrInput): Promise<{ id: string }> {
    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.create_dsr");
    const legalDeadlineAt = new Date(Date.now() + THIRTY_DAYS_MS);
    const inserted = await deps.db
      .insert(dataSubjectRequests)
      .values({
        identifierPhone: input.identifier_phone,
        identifierEmail: input.identifier_email,
        requestKind: input.request_kind,
        requestSource: input.request_source,
        requestBody: input.request_body,
        legalDeadlineAt,
      })
      .returning({ id: dataSubjectRequests.id });
    const id = inserted[0].id;
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_created,
      subjectType: "data_subject_request",
      subjectId: id,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: {
        request_kind: input.request_kind,
        request_source: input.request_source,
      },
    });
    return { id };
  }

  async function resolveDinerForDsr(input: {
    dsrId: string;
    diner_ids: string[];
  }): Promise<void> {
    if (input.diner_ids.length === 0) {
      throw new Error("TV1108 dsr_diner_not_resolved: empty diner_ids");
    }
    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.resolve_diner");
    await deps.db
      .update(dataSubjectRequests)
      .set({ dinerId: input.diner_ids[0], updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, input.dsrId));
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_resolved,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { diner_ids: input.diner_ids.join(",") },
    });
  }

  async function verifyDsrIdentity(input: {
    dsrId: string;
    method: "tavli_admin_manual";
    reason: string;
  }): Promise<void> {
    if (!input.reason?.trim()) throw new Error("verification reason is required");
    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.verify_identity");
    await deps.db
      .update(dataSubjectRequests)
      .set({
        identityVerified: true,
        identityVerificationMethod: input.method,
        identityVerifiedAt: new Date(),
        identityVerifiedByUserId: session.userId,
        updatedAt: new Date(),
      })
      .where(eq(dataSubjectRequests.id, input.dsrId));
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_identity_verified,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { method: input.method, reason: input.reason },
    });
  }

  async function approveDsrErasure(input: { dsrId: string }): Promise<void> {
    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.approve_erasure");

    const rows = await deps.db
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, input.dsrId))
      .limit(1);
    const dsr = rows[0];
    if (!dsr) throw new Error(`TV1100 dsr_not_found: ${input.dsrId}`);
    if (dsr.status !== "received") throw new Error(`TV1105 dsr_wrong_status: ${dsr.status}`);
    if (!dsr.identityVerified) throw new Error("TV1101 dsr_not_verified");
    if (dsr.requestKind !== "erasure") throw new Error("approveDsrErasure: only erasure DSRs may be approved");

    await deps.db
      .update(dataSubjectRequests)
      .set({
        status: "in_progress",
        approvedByUserId: session.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataSubjectRequests.id, input.dsrId));

    await deps.enqueue(JOBS.compliance.erasureExecute, { requestId: input.dsrId });

    await deps.recordAudit({
      action: AUDIT.compliance.dsr_approved,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: {},
    });
  }

  async function rejectDsr(input: { dsrId: string; reason: string }): Promise<void> {
    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.reject");
    await deps.db
      .update(dataSubjectRequests)
      .set({ status: "rejected", rejectionReason: input.reason, updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, input.dsrId));
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_rejected,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { reason: input.reason },
    });
  }

  async function extendDsrDeadline(input: { dsrId: string; days: number; reason: string }): Promise<void> {
    if (input.days < 1 || input.days > 14) throw new Error(`TV1103 gdpr_deadline_extension_capped: ${input.days}`);
    if (!input.reason?.trim()) throw new Error("TV1107 deadline_extension_missing_reason");

    const { session, impersonatorUserId } = await loadSessionAndCheck("gdpr.extend_deadline");

    const rows = await deps.db
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, input.dsrId))
      .limit(1);
    const dsr = rows[0];
    if (!dsr) throw new Error(`TV1100 dsr_not_found: ${input.dsrId}`);

    const newDeadline = new Date(dsr.legalDeadlineAt.getTime() + input.days * 24 * 60 * 60 * 1000);

    await deps.db
      .update(dataSubjectRequests)
      .set({
        legalDeadlineAt: newDeadline,
        deadlineExtensionDays: (dsr.deadlineExtensionDays ?? 0) + input.days,
        deadlineExtensionReason: input.reason,
        deadlineExtendedByUserId: session.userId,
        deadlineExtendedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataSubjectRequests.id, input.dsrId));

    await deps.recordAudit({
      action: AUDIT.compliance.dsr_extended,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: session.userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { days: String(input.days), reason: input.reason, new_deadline_at: newDeadline.toISOString() },
    });
  }

  async function retryErasureCascade(input: { dsrId: string }): Promise<void> {
    // Reuses gdpr.approve_erasure permission — retry is conceptually "approve again".
    const { session } = await loadSessionAndCheck("gdpr.approve_erasure");
    void session; // used only for auth check; no audit written here (cascade itself audits)

    const rows = await deps.db
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, input.dsrId))
      .limit(1);
    const dsr = rows[0];
    if (!dsr) throw new Error(`TV1100 dsr_not_found: ${input.dsrId}`);
    if (dsr.status !== "in_progress")
      throw new Error(`TV1105 dsr_wrong_status: ${dsr.status} (retry only allowed when status='in_progress')`);

    await deps.enqueue(JOBS.compliance.erasureExecute, { requestId: input.dsrId });
    // No new audit action — the cascade itself will write either
    // dsr_cascade_executed or dsr_cascade_failed.
  }

  return { createDsr, resolveDinerForDsr, verifyDsrIdentity, approveDsrErasure, rejectDsr, extendDsrDeadline, retryErasureCascade };
}

export const dsrActions = makeDsrActions({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
  can: defaultCan,
  getCurrentSession: defaultGetCurrentSession,
  currentActor: defaultCurrentActor,
  enqueue: defaultEnqueue,
});
