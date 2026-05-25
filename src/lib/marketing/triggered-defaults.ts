import "server-only";

/**
 * §11 §6 — seed the default triggered campaigns for an organisation. The PURE
 * default definitions live in ./triggered-campaign-defaults (importable by the
 * backfill script, which can't pull a server-only module); this file owns the
 * db write side.
 */
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { marketingCampaigns, marketingCampaignVersions } from "@/lib/db/schema";
import { TRIGGERED_CAMPAIGN_DEFAULTS } from "./triggered-campaign-defaults";

export { TRIGGERED_CAMPAIGN_DEFAULTS } from "./triggered-campaign-defaults";
export type { TriggeredCampaignDefault } from "./triggered-campaign-defaults";

type SeedDb = Pick<typeof dbAdmin, "select" | "insert">;

/**
 * Idempotently seed the default triggered campaigns for an organisation. Only
 * inserts keys not already present (org + kind='triggered'), so it's safe to
 * call on signup AND re-run as a backfill. Returns the number of keys inserted.
 * Accepts a tx executor so it can run inside the signup transaction.
 */
export async function seedTriggeredCampaigns(organizationId: string, db: SeedDb): Promise<number> {
  const existing = (await db
    .select({ key: marketingCampaigns.triggeredCampaignKey })
    .from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.organizationId, organizationId), eq(marketingCampaigns.kind, "triggered")))) as Array<{
    key: string | null;
  }>;
  const have = new Set(existing.map((r) => r.key));

  let inserted = 0;
  for (const def of TRIGGERED_CAMPAIGN_DEFAULTS) {
    if (have.has(def.key)) continue;
    const [row] = await db
      .insert(marketingCampaigns)
      .values({
        organizationId,
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
    inserted++;
  }
  return inserted;
}
