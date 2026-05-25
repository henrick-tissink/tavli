/**
 * §02 §6 / §08 §10 — `reservation.auto-mark-no-show`, hourly sweep.
 *
 * Opt-in per venue (restaurants.auto_no_show, default OFF — see §02 OQ1). Marks
 * confirmed reservations whose venue-local slot + 90-minute grace has passed as
 * no_show, and atomically frees the assigned table via the shared
 * validateOrClearTableAssignment helper (§08 merges the old
 * tables.auto-clear-stale-booked job into this one). Claim-guarded so a row is
 * only acted on once.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { validateOrClearTableAssignment as realClear } from "@/lib/tables/validate-or-clear-table-assignment";

interface Deps {
  db: typeof dbAdmin;
  clearTableAssignment: typeof realClear;
  recordAudit: typeof realRecordAudit;
}

interface Row {
  id: string;
  restaurant_id: string;
  organization_id: string | null;
}

export function makeAutoMarkNoShow(deps: Deps) {
  return async function autoMarkNoShow(): Promise<{ marked: number }> {
    const rows = (await deps.db.execute(sql`
      SELECT r.id, r.restaurant_id, rest.organization_id
      FROM reservations r
      JOIN restaurants rest ON rest.id = r.restaurant_id
      WHERE r.status = 'confirmed'
        AND rest.auto_no_show = true
        AND ((r.reservation_date + r.reservation_time) AT TIME ZONE rest.timezone)
            + interval '90 minutes' < now()
    `)) as unknown as Row[];

    let marked = 0;
    for (const r of rows) {
      // Claim: only the UPDATE that flips confirmed→no_show proceeds.
      const claimed = (await deps.db.execute(sql`
        UPDATE reservations SET status = 'no_show'
        WHERE id = ${r.id} AND status = 'confirmed'
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      if (claimed.length === 0) continue;

      // Free the table the booking was holding (idempotent; no-op if unassigned).
      await deps.clearTableAssignment(r.id, "no_show");

      // §02 §3.3 — log the confirmed→no_show transition (system actor).
      await deps.db.execute(sql`
        INSERT INTO reservation_status_log (reservation_id, restaurant_id, from_status, to_status, reason)
        VALUES (${r.id}, ${r.restaurant_id}, 'confirmed', 'no_show', 'auto_no_show')
      `);

      await deps.recordAudit({
        action: AUDIT.reservation.no_show,
        subjectType: "reservation",
        subjectId: r.id,
        actorRole: "system",
        organizationId: r.organization_id ?? undefined,
        restaurantId: r.restaurant_id,
        context: { auto: true, grace_minutes: 90 },
      });
      marked += 1;
    }
    return { marked };
  };
}

export const autoMarkNoShow = makeAutoMarkNoShow({
  db: dbAdmin,
  clearTableAssignment: realClear,
  recordAudit: realRecordAudit,
});
