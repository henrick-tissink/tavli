/**
 * §14 §7.3 — "make Tavli authoritative" consolidation. Marks the parallel_run
 * setup step completed + audits. (Parallel run is operational-only; no data
 * mirror to dismantle.)
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT, type ActorRole } from "@/lib/audit/actions";

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof realRecordAudit;
}

export function makeConsolidateParallelRun(deps: Deps) {
  return async function consolidateParallelRun(input: {
    restaurantId: string;
    organizationId: string;
    actorUserId: string;
    actorRole?: ActorRole;
  }): Promise<{ ok: boolean }> {
    const updated = (await deps.db.execute(sql`
      UPDATE setup_progress SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE restaurant_id = ${input.restaurantId} AND step_key = 'parallel_run' AND status <> 'completed'
      RETURNING id, started_at
    `)) as unknown as Array<{ id: string; started_at: string | null }>;
    if (updated.length === 0) return { ok: true }; // already consolidated — idempotent

    await deps.recordAudit({
      action: AUDIT.setup.parallel_run_consolidated,
      subjectType: "setup_progress",
      subjectId: updated[0].id,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole ?? "org_owner",
      organizationId: input.organizationId,
      restaurantId: input.restaurantId,
      context: { restaurant_id: input.restaurantId },
    });
    return { ok: true };
  };
}

export const consolidateParallelRunCore = makeConsolidateParallelRun({ db: dbAdmin, recordAudit: realRecordAudit });
