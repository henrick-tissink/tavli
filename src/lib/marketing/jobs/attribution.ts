/**
 * §11 §12.2 — `marketing.compute-attribution` (every 5 min). Reservations created
 * recently by a diner who clicked a marketing link within the attribution window
 * (14 days) attribute to that campaign: set reservations.campaign_id +
 * marketing_sends.attributed_reservation_id from the most recent click.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

interface Deps {
  db: typeof dbAdmin;
}

export function makeComputeAttribution(deps: Deps) {
  return async function computeAttribution(): Promise<void> {
    // For each just-created, unattributed reservation, find the diner's most
    // recent clicked send still inside its 14-day attribution window, then
    // attribute BOTH directions to that ONE send. Single statement with
    // modifying CTEs so the send attribution targets exactly the chosen
    // recent.send_id — the old second UPDATE matched EVERY send sharing the
    // campaign_id, stamping one reservation onto all of a diner's campaign
    // sends and inflating conversion counts.
    await deps.db.execute(sql`
      WITH recent AS (
        SELECT r.id AS reservation_id, r.diner_id,
          (SELECT ms.id FROM marketing_sends ms
             WHERE ms.diner_id = r.diner_id
               AND ms.first_clicked_at IS NOT NULL
               AND ms.first_clicked_at > now() - interval '14 days'
             ORDER BY ms.first_clicked_at DESC LIMIT 1) AS send_id
        FROM reservations r
        WHERE r.campaign_id IS NULL
          AND r.diner_id IS NOT NULL
          AND r.created_at > now() - interval '10 minutes'
      ),
      attributed AS (
        SELECT recent.reservation_id, recent.send_id, ms.campaign_id
        FROM recent JOIN marketing_sends ms ON ms.id = recent.send_id
      ),
      upd_res AS (
        UPDATE reservations res
        SET campaign_id = a.campaign_id
        FROM attributed a
        WHERE res.id = a.reservation_id
        RETURNING res.id
      )
      UPDATE marketing_sends ms
      SET attributed_reservation_id = a.reservation_id
      FROM attributed a
      WHERE ms.id = a.send_id AND ms.attributed_reservation_id IS NULL
    `);
  };
}

export const computeAttribution = makeComputeAttribution({ db: dbAdmin });
