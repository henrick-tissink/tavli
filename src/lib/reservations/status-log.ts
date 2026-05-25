/**
 * §02 §3.3 — append a reservation_status_log row. Called (best-effort) by every
 * action that mutates reservations.status, so the §5.4 detail-sheet timeline +
 * §07 reports have a complete transition history. Separate from audit_logs:
 * this is the operational status trail, audit_logs is the security/compliance
 * trail. Failure here never blocks the status mutation itself.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

interface Deps {
  db: typeof dbAdmin;
}

export interface StatusLogInput {
  reservationId: string;
  restaurantId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId?: string | null;
  reason?: string | null;
}

export function makeLogReservationStatus(deps: Deps) {
  return async function logReservationStatus(input: StatusLogInput): Promise<void> {
    await deps.db.execute(sql`
      INSERT INTO reservation_status_log (reservation_id, restaurant_id, from_status, to_status, changed_by_user_id, reason)
      VALUES (${input.reservationId}, ${input.restaurantId}, ${input.fromStatus}, ${input.toStatus}, ${input.changedByUserId ?? null}, ${input.reason ?? null})
    `);
  };
}

export const logReservationStatus = makeLogReservationStatus({ db: dbAdmin });
