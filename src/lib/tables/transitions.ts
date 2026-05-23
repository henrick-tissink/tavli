import "server-only";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables, tableStatusLog } from "@/lib/db/schema";
import { assertValidTransition, type TableStatus } from "./state-machine";

export interface TransitionInput {
  tableId: string;
  toStatus: TableStatus;
  reservationId?: string;
  combinationId?: string;
  changedByUserId: string;
  notes?: string;
}

interface Deps {
  db: typeof dbAdmin;
}

export function makeTransitionTableStatus(deps: Deps) {
  return async function transitionTableStatus(input: TransitionInput): Promise<void> {
    await deps.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          currentStatus: restaurantTables.currentStatus,
          restaurantId: restaurantTables.restaurantId,
        })
        .from(restaurantTables)
        .where(eq(restaurantTables.id, input.tableId))
        .for("update");

      if (rows.length === 0) {
        throw new Error(`TV603 table_not_found: ${input.tableId}`);
      }

      const fromStatus = rows[0].currentStatus as TableStatus;
      const restaurantId = rows[0].restaurantId;

      assertValidTransition(fromStatus, input.toStatus);

      // Use the spec's canonical recipe: read prior log row's changed_at via
      // CTE, compute duration. Falls back to a NULL-duration row when no prior
      // log entry exists (first-ever transition for this table).
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
          ${input.tableId}::uuid, ${restaurantId}::uuid, ${fromStatus}::table_status, ${input.toStatus}::table_status,
          ${input.reservationId ?? null}::uuid, ${input.combinationId ?? null}::uuid,
          ${input.changedByUserId}::uuid, now(), ${input.notes ?? null},
          COALESCE(EXTRACT(EPOCH FROM (now() - prior.prior_changed_at))::int, NULL)
          FROM prior
        UNION ALL
        SELECT
          ${input.tableId}::uuid, ${restaurantId}::uuid, ${fromStatus}::table_status, ${input.toStatus}::table_status,
          ${input.reservationId ?? null}::uuid, ${input.combinationId ?? null}::uuid,
          ${input.changedByUserId}::uuid, now(), ${input.notes ?? null},
          NULL
        WHERE NOT EXISTS (SELECT 1 FROM prior);
      `);
      // Trigger trg_table_status_log_sync_denorm fires AFTER INSERT and syncs restaurant_tables.
    });
  };
}

export const transitionTableStatus = makeTransitionTableStatus({ db: dbAdmin });
