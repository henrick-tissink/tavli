/**
 * §01 §5a.3 — Tavli-admin support impersonation (phase 1).
 *
 * This file ships the AUDIT primitives only. The session-switching
 * mechanism (cookie write on start, read in proxy/middleware, clear on
 * stop) + the persistent red partner-side banner + the AAL2 gate on
 * the admin's own MFA factor before impersonation can begin are all
 * part of phase 2, a frontend-design follow-up that pairs with the
 * MFA phase 2 UI.
 *
 * What's here:
 *   - recordImpersonationStart — writes AUDIT.user.impersonation_started
 *   - recordImpersonationEnd   — writes AUDIT.user.impersonation_ended
 *
 * Both helpers stamp the audit row with the SUBJECT being the impersonated
 * user (the "target") and the ACTOR being the admin. `impersonatorUserId`
 * on the audit row matches the actor — recordAudit's existing column is
 * the right home. Once phase 2 ships the session mechanism, every other
 * audit-writing path that fires during an impersonation must additionally
 * thread `impersonatorUserId` from session context so the audit trail
 * reflects who was acting-as during the operation.
 */

import "server-only";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface ImpersonationEvent {
  adminUserId: string;
  targetUserId: string;
  reason?: string;
}

export async function recordImpersonationStart(
  event: ImpersonationEvent,
): Promise<void> {
  await recordAudit({
    action: AUDIT.user.impersonation_started,
    subjectType: "user",
    subjectId: event.targetUserId,
    actorUserId: event.adminUserId,
    actorRole: "tavli_admin",
    impersonatorUserId: event.adminUserId,
    context: event.reason ? { reason: event.reason } : {},
  });
}

export async function recordImpersonationEnd(
  event: ImpersonationEvent,
): Promise<void> {
  await recordAudit({
    action: AUDIT.user.impersonation_ended,
    subjectType: "user",
    subjectId: event.targetUserId,
    actorUserId: event.adminUserId,
    actorRole: "tavli_admin",
    impersonatorUserId: event.adminUserId,
    context: event.reason ? { reason: event.reason } : {},
  });
}
