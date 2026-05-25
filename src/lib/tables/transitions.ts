import "server-only";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables } from "@/lib/db/schema";
import { assertValidTransition, type TableStatus } from "./state-machine";
import { appendStatusLog } from "./status-log";

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

      await appendStatusLog(tx, {
        tableId: input.tableId,
        restaurantId,
        fromStatus,
        toStatus: input.toStatus,
        reservationId: input.reservationId,
        combinationId: input.combinationId,
        changedByUserId: input.changedByUserId,
        notes: input.notes,
      });
      // Trigger trg_table_status_log_sync_denorm fires AFTER INSERT and syncs restaurant_tables.
    });
  };
}

export const transitionTableStatus = makeTransitionTableStatus({ db: dbAdmin });
