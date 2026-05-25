/**
 * One-shot backfill: seed the §11 §6 default triggered campaigns for every
 * existing organisation. New orgs get them automatically inside signupPartner;
 * this catches orgs created before that wiring landed.
 *
 * Idempotent: only inserts keys an org doesn't already have. Re-running is safe.
 *
 * The seed loop is reimplemented here (rather than importing
 * `seedTriggeredCampaigns`) because that module is `import "server-only"` and
 * cannot run outside the Next bundler. The campaign COPY is shared via the pure
 * `triggered-campaign-defaults` module, so nothing is duplicated but the loop.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-triggered-campaigns.ts
 *   npx tsx --env-file=.env.prod  scripts/backfill-triggered-campaigns.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import {
  organizations,
  marketingCampaigns,
  marketingCampaignVersions,
} from "../src/lib/db/schema";
import { TRIGGERED_CAMPAIGN_DEFAULTS } from "../src/lib/marketing/triggered-campaign-defaults";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const orgs = await db.select({ id: organizations.id }).from(organizations);
  let total = 0;

  for (const org of orgs) {
    const existing = await db
      .select({ key: marketingCampaigns.triggeredCampaignKey })
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.organizationId, org.id), eq(marketingCampaigns.kind, "triggered")));
    const have = new Set(existing.map((r) => r.key));

    let seeded = 0;
    for (const def of TRIGGERED_CAMPAIGN_DEFAULTS) {
      if (have.has(def.key)) continue;
      const [row] = await db
        .insert(marketingCampaigns)
        .values({
          organizationId: org.id,
          restaurantId: null,
          kind: "triggered",
          triggeredCampaignKey: def.key,
          name: def.name,
          status: def.status,
          channel: def.channel,
          subjectTemplate: def.subject,
          bodyTemplate: def.body,
          previewText: def.preview,
          triggerEvent: def.triggerEvent,
          triggerOffsetSeconds: def.triggerOffsetSeconds,
          tokensUsed: [],
        })
        .returning({ id: marketingCampaigns.id });
      await db.insert(marketingCampaignVersions).values({
        campaignId: row.id,
        versionNumber: 1,
        subjectTemplate: def.subject,
        bodyTemplate: def.body,
        previewText: def.preview,
      });
      seeded++;
      total++;
    }
    if (seeded > 0) console.log(`org ${org.id}: seeded ${seeded}`);
  }

  console.log(`Done. ${total} triggered campaign(s) seeded across ${orgs.length} org(s).`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
