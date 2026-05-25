/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  marketingCampaigns: {
    id: "c.id",
    organizationId: "c.org",
    kind: "c.kind",
    triggeredCampaignKey: "c.key",
  },
  marketingCampaignVersions: { campaignId: "v.cid" },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...xs) => ({ and: xs })),
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
}));

import {
  seedTriggeredCampaigns,
  TRIGGERED_CAMPAIGN_DEFAULTS,
} from "../triggered-defaults";

function makeDb(existingKeys: (string | null)[]) {
  const campaignInserts: Record<string, unknown>[] = [];
  const versionInserts: Record<string, unknown>[] = [];
  let target: "campaign" | "version" = "campaign";
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(existingKeys.map((key) => ({ key }))),
      }),
    }),
    insert: (table: { id?: string; campaignId?: string }) => {
      target = table.id === "c.id" ? "campaign" : "version";
      return {
        values: (v: Record<string, unknown>) => {
          if (target === "campaign") {
            campaignInserts.push(v);
            return { returning: () => Promise.resolve([{ id: `cid-${campaignInserts.length}` }]) };
          }
          versionInserts.push(v);
          return Promise.resolve(undefined);
        },
      };
    },
  };
  return { db, campaignInserts, versionInserts };
}

describe("seedTriggeredCampaigns", () => {
  it("seeds all defaults for a fresh org (campaign + v1 version each)", async () => {
    const { db, campaignInserts, versionInserts } = makeDb([]);
    const n = await seedTriggeredCampaigns("org-1", db as never);

    expect(n).toBe(TRIGGERED_CAMPAIGN_DEFAULTS.length);
    expect(campaignInserts).toHaveLength(TRIGGERED_CAMPAIGN_DEFAULTS.length);
    expect(versionInserts).toHaveLength(TRIGGERED_CAMPAIGN_DEFAULTS.length);
    // org-level rows, kind triggered
    for (const c of campaignInserts) {
      expect(c.organizationId).toBe("org-1");
      expect(c.restaurantId).toBeNull();
      expect(c.kind).toBe("triggered");
      expect(c.tokensUsed).toEqual([]);
    }
    // event-driven trio active; birthday + lapsed paused
    const byKey = Object.fromEntries(campaignInserts.map((c) => [c.triggeredCampaignKey, c]));
    expect(byKey.post_visit_review.status).toBe("active");
    expect(byKey.no_show_followup.status).toBe("active");
    expect(byKey.welcome_series.status).toBe("active");
    expect(byKey.lapsed_60.status).toBe("active");
    expect(byKey.birthday_anniversary.status).toBe("paused");
    // versions carry version 1 + the same content
    expect(versionInserts.every((v) => v.versionNumber === 1)).toBe(true);
  });

  it("is idempotent — skips keys already present", async () => {
    const { db, campaignInserts } = makeDb(["post_visit_review", "no_show_followup"]);
    const n = await seedTriggeredCampaigns("org-1", db as never);
    expect(n).toBe(TRIGGERED_CAMPAIGN_DEFAULTS.length - 2);
    const keys = campaignInserts.map((c) => c.triggeredCampaignKey);
    expect(keys).not.toContain("post_visit_review");
    expect(keys).toContain("welcome_series");
  });

  it("no-ops when every default already exists", async () => {
    const { db, campaignInserts } = makeDb(TRIGGERED_CAMPAIGN_DEFAULTS.map((d) => d.key));
    const n = await seedTriggeredCampaigns("org-1", db as never);
    expect(n).toBe(0);
    expect(campaignInserts).toHaveLength(0);
  });

  it("default copy is token-free (v1 leaf does not substitute tokens)", () => {
    for (const d of TRIGGERED_CAMPAIGN_DEFAULTS) {
      for (const loc of ["ro", "en", "de"] as const) {
        expect(d.subject[loc]).not.toMatch(/\{\{|\}\}/);
        expect(d.body[loc]).not.toMatch(/\{\{|\}\}/);
      }
    }
  });
});
