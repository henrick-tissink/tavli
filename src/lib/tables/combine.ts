import "server-only";

/**
 * §08 §3.5 / §6.2 — combine 2+ free tables into a derived `table_combinations`
 * entity (member tables → `combined`), and dissolve it (members → `free`).
 * Both run in a single FOR-UPDATE transaction and route status changes through
 * appendStatusLog so the denorm trigger + status history stay correct.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables, tableCombinations } from "@/lib/db/schema";
import { appendStatusLog } from "./status-log";
import type { TableStatus } from "./state-machine";

export interface CombineTablesInput {
  restaurantId: string;
  tableIds: string[];
  reservationId?: string | null;
  changedByUserId: string;
}

interface Deps {
  db: typeof dbAdmin;
}

export function makeCombineTables(deps: Deps) {
  return async function combineTables(input: CombineTablesInput): Promise<{ combinationId: string }> {
    const ids = Array.from(new Set(input.tableIds));
    if (ids.length < 2) throw new Error("TV620 combine_minimum_two");

    return deps.db.transaction(async (tx) => {
      const rows = (await tx
        .select({
          id: restaurantTables.id,
          currentStatus: restaurantTables.currentStatus,
          capacityMax: restaurantTables.capacityMax,
          restaurantId: restaurantTables.restaurantId,
          archivedAt: restaurantTables.archivedAt,
        })
        .from(restaurantTables)
        .where(inArray(restaurantTables.id, ids))
        .for("update")) as Array<{
        id: string;
        currentStatus: TableStatus;
        capacityMax: number;
        restaurantId: string;
        archivedAt: Date | null;
      }>;

      if (rows.length !== ids.length) throw new Error("TV603 table_not_found");
      for (const r of rows) {
        if (r.restaurantId !== input.restaurantId) throw new Error("TV621 cross_restaurant_combine");
        if (r.archivedAt) throw new Error("TV603 table_not_found");
        // Only free tables can be combined (state machine: free → combined).
        if (r.currentStatus !== "free") throw new Error("TV622 table_not_free");
      }

      const combinedCapacity = rows.reduce((s, r) => s + r.capacityMax, 0);
      const [combo] = await tx
        .insert(tableCombinations)
        .values({
          restaurantId: input.restaurantId,
          tableIds: ids,
          primaryTableId: ids[0],
          combinedCapacity,
          reservationId: input.reservationId ?? null,
          // A reservation-driven combine is 'booked'; a walk-in combine seats now.
          status: input.reservationId ? "booked" : "seated",
          createdByUserId: input.changedByUserId,
        })
        .returning({ id: tableCombinations.id });

      for (const r of rows) {
        await appendStatusLog(tx, {
          tableId: r.id,
          restaurantId: input.restaurantId,
          fromStatus: "free",
          toStatus: "combined",
          combinationId: combo.id,
          reservationId: input.reservationId,
          changedByUserId: input.changedByUserId,
        });
      }

      return { combinationId: combo.id };
    });
  };
}

export const combineTables = makeCombineTables({ db: dbAdmin });

export interface DissolveCombinationInput {
  combinationId: string;
  restaurantId: string;
  changedByUserId: string;
}

export function makeDissolveCombination(deps: Deps) {
  return async function dissolveCombination(input: DissolveCombinationInput): Promise<void> {
    await deps.db.transaction(async (tx) => {
      const combos = (await tx
        .select({
          id: tableCombinations.id,
          restaurantId: tableCombinations.restaurantId,
          tableIds: tableCombinations.tableIds,
        })
        .from(tableCombinations)
        .where(and(eq(tableCombinations.id, input.combinationId), isNull(tableCombinations.dissolvedAt)))
        .for("update")) as Array<{ id: string; restaurantId: string; tableIds: string[] }>;
      const combo = combos[0];
      if (!combo) throw new Error("TV623 combination_not_found");
      if (combo.restaurantId !== input.restaurantId) throw new Error("TV621 cross_restaurant_combine");

      await tx
        .update(tableCombinations)
        .set({ dissolvedAt: sql`now()` })
        .where(eq(tableCombinations.id, input.combinationId));

      const members = (await tx
        .select({ id: restaurantTables.id, currentStatus: restaurantTables.currentStatus })
        .from(restaurantTables)
        .where(inArray(restaurantTables.id, combo.tableIds))
        .for("update")) as Array<{ id: string; currentStatus: TableStatus }>;

      for (const m of members) {
        // Only flip the tables still combined under this combination back to free.
        if (m.currentStatus === "combined") {
          await appendStatusLog(tx, {
            tableId: m.id,
            restaurantId: combo.restaurantId,
            fromStatus: "combined",
            toStatus: "free",
            changedByUserId: input.changedByUserId,
          });
        }
      }
    });
  };
}

export const dissolveCombination = makeDissolveCombination({ db: dbAdmin });
