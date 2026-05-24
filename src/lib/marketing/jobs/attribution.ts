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
    // recent clicked send still inside its 14-day attribution window.
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
      )
      UPDATE reservations res
      SET campaign_id = ms.campaign_id
      FROM recent, marketing_sends ms
      WHERE res.id = recent.reservation_id AND recent.send_id = ms.id
    `);
    await deps.db.execute(sql`
      UPDATE marketing_sends ms
      SET attributed_reservation_id = r.id
      FROM reservations r
      WHERE r.campaign_id = ms.campaign_id
        AND r.diner_id = ms.diner_id
        AND ms.attributed_reservation_id IS NULL
        AND r.created_at > now() - interval '10 minutes'
    `);
  };
}

export const computeAttribution = makeComputeAttribution({ db: dbAdmin });
