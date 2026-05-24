/**
 * §11 §14 — `marketing.purge-old-link-clicks` (nightly). Detail click rows older
 * than 12 months are dropped (the aggregate `marketing_sends.click_count` is kept).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

export function makePurgeOldLinkClicks(deps: { db: typeof dbAdmin }) {
  return async function purgeOldLinkClicks(): Promise<void> {
    await deps.db.execute(sql`
      DELETE FROM marketing_link_clicks WHERE clicked_at < now() - interval '12 months'
    `);
  };
}

export const purgeOldLinkClicks = makePurgeOldLinkClicks({ db: dbAdmin });
