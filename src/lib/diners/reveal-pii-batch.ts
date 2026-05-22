/**
 * revealPiiBatch — Wave 3 §03 §5.5 sub-unit B.
 *
 * Wraps every bulk-read of unmasked diner PII so the access is recorded in
 * `diner_pii_access_log` before any data is returned. Log rows are
 * inserted BEFORE the loader runs: if the loader throws (or the caller
 * forgets to await), the audit row still lands — there is no silent
 * leak path.
 *
 * Always call this from server-only code. The helper uses the service-role
 * Drizzle client (`dbAdmin`) because the log table has no INSERT policy
 * (§03 §5.5 / spec sub-unit B).
 */

import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { dinerPiiAccessLog } from "@/lib/db/schema";

export interface RevealPiiBatchInput<T> {
  dinerIds: string[];
  organizationId: string;
  actorUserId: string;
  accessKind: "reveal" | "export" | "edit" | "merge";
  surface: string;
  accessedField: string;
  contextReservationId?: string;
  loader: (ids: string[]) => Promise<T[]>;
}

interface Deps {
  db: typeof dbAdmin;
}

export function makeRevealPiiBatch(deps: Deps) {
  return async function revealPiiBatch<T>(
    input: RevealPiiBatchInput<T>,
  ): Promise<T[]> {
    // Insert log rows FIRST (so a failed load can't silently leak access).
    if (input.dinerIds.length > 0) {
      await deps.db.insert(dinerPiiAccessLog).values(
        input.dinerIds.map((id) => ({
          dinerId: id,
          organizationId: input.organizationId,
          accessedByUserId: input.actorUserId,
          accessedField: input.accessedField,
          accessKind: input.accessKind,
          surface: input.surface,
          contextReservationId: input.contextReservationId,
        })),
      );
    }
    return input.loader(input.dinerIds);
  };
}

export const revealPiiBatch = makeRevealPiiBatch({ db: dbAdmin });
