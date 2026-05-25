/**
 * §08 §4.7 — the single place the table/reservation invariant is enforced.
 *
 * When a reservation leaves an active state (cancelled / no_show) — or a slot
 * conflict forces it — its physical table assignment must be released in the
 * same logical operation, or the live floor plan shows a table held by a
 * ghost booking. Every reservation-mutating path calls this shared helper.
 *
 * Idempotent: a reservation with no assignment (or already-cleared) is a no-op.
 * Runs in its own transaction so it composes safely after a supabase-client
 * status update (the reservation actions) or inside the auto-no-show job.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof realRecordAudit;
}

export function makeValidateOrClearTableAssignment(deps: Deps) {
  return async function validateOrClearTableAssignment(
    reservationId: string,
    reason: string,
  ): Promise<{ cleared: boolean }> {
    return deps.db.transaction(async (tx) => {
      const resRows = (await tx.execute(sql`
        SELECT id, restaurant_id, table_id, combination_id
        FROM reservations WHERE id = ${reservationId} FOR UPDATE
      `)) as unknown as Array<{ id: string; restaurant_id: string; table_id: string | null; combination_id: string | null }>;
      const res = resRows[0];
      if (!res || (!res.table_id && !res.combination_id)) return { cleared: false };

      // Collect every physical table this reservation holds (direct + via combo).
      const tableIds = new Set<string>();
      if (res.table_id) tableIds.add(res.table_id);
      if (res.combination_id) {
        const comboRows = (await tx.execute(sql`
          SELECT table_ids FROM table_combinations WHERE id = ${res.combination_id}
        `)) as unknown as Array<{ table_ids: string[] }>;
        for (const t of comboRows[0]?.table_ids ?? []) tableIds.add(t);
        // Dissolve the combination.
        await tx.execute(sql`
          UPDATE table_combinations SET status = 'free', dissolved_at = now() WHERE id = ${res.combination_id}
        `);
      }

      // Free each held table + log the system-actor transition.
      for (const tid of tableIds) {
        await tx.execute(sql`
          INSERT INTO table_status_log (table_id, restaurant_id, from_status, to_status, reservation_id, changed_by_user_id, notes)
          SELECT id, restaurant_id, status, 'free', ${reservationId}, NULL, ${`auto-cleared: ${reason}`}
          FROM restaurant_tables WHERE id = ${tid} AND status <> 'free'
        `);
        await tx.execute(sql`
          UPDATE restaurant_tables SET status = 'free', status_since = now() WHERE id = ${tid}
        `);
      }

      // Clear the reservation's assignment.
      await tx.execute(sql`
        UPDATE reservations SET table_id = NULL, combination_id = NULL, auto_assigned = false WHERE id = ${reservationId}
      `);

      await deps.recordAudit({
        action: AUDIT.reservation.table_auto_cleared,
        subjectType: "reservation",
        subjectId: reservationId,
        actorRole: "system",
        restaurantId: res.restaurant_id,
        context: { prior_table_id: res.table_id, prior_combination_id: res.combination_id, reason },
      });
      return { cleared: true };
    });
  };
}

export const validateOrClearTableAssignment = makeValidateOrClearTableAssignment({
  db: dbAdmin,
  recordAudit: realRecordAudit,
});
