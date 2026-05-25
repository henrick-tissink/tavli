import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import type { TableStatus } from "./state-machine";

/**
 * §08 §4.4 — append one row to `table_status_log` (the AFTER-INSERT trigger
 * `trg_table_status_log_sync_denorm` syncs restaurant_tables current_status /
 * current_status_since / current_reservation_id / current_combination_id).
 *
 * Computes `duration_seconds_in_from_status` from the prior log row via CTE
 * (NULL for the first-ever transition). Shared by transitionTableStatus (single
 * table) and the combine/dissolve flows (multiple tables in one tx) so the log
 * shape + denorm sync stay identical across both.
 *
 * Caller is responsible for the FOR UPDATE lock + state-machine validation.
 */
export interface AppendStatusLogParams {
  tableId: string;
  restaurantId: string;
  fromStatus: TableStatus;
  toStatus: TableStatus;
  reservationId?: string | null;
  combinationId?: string | null;
  changedByUserId: string;
  notes?: string | null;
}

type Executor = Pick<typeof dbAdmin, "execute">;

export async function appendStatusLog(tx: Executor, input: AppendStatusLogParams): Promise<void> {
  await tx.execute(sql`
    WITH prior AS (
      SELECT changed_at AS prior_changed_at
        FROM table_status_log
       WHERE table_id = ${input.tableId}::uuid
       ORDER BY changed_at DESC
       LIMIT 1
    )
    INSERT INTO table_status_log (
      table_id, restaurant_id, from_status, to_status,
      reservation_id, combination_id, changed_by_user_id, changed_at, notes,
      duration_seconds_in_from_status
    )
    SELECT
      ${input.tableId}::uuid, ${input.restaurantId}::uuid, ${input.fromStatus}::table_status, ${input.toStatus}::table_status,
      ${input.reservationId ?? null}::uuid, ${input.combinationId ?? null}::uuid,
      ${input.changedByUserId}::uuid, now(), ${input.notes ?? null},
      COALESCE(EXTRACT(EPOCH FROM (now() - prior.prior_changed_at))::int, NULL)
      FROM prior
    UNION ALL
    SELECT
      ${input.tableId}::uuid, ${input.restaurantId}::uuid, ${input.fromStatus}::table_status, ${input.toStatus}::table_status,
      ${input.reservationId ?? null}::uuid, ${input.combinationId ?? null}::uuid,
      ${input.changedByUserId}::uuid, now(), ${input.notes ?? null},
      NULL
    WHERE NOT EXISTS (SELECT 1 FROM prior);
  `);
}
