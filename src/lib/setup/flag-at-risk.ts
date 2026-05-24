/**
 * §14 §8.4 / §9 — `setup.flag-at-risk-orgs` (daily). Orgs whose trial ends within
 * 21 days AND have an incomplete setup step → founder alert.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

interface Deps {
  db: typeof dbAdmin;
  alert: (input: { organizationId: string; trialEndsAt: string }) => Promise<void>;
}

export function makeFlagAtRiskOrgs(deps: Deps) {
  return async function flagAtRiskOrgs(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT DISTINCT s.organization_id, s.trial_ends_at::text AS trial_ends_at
      FROM subscriptions s
      WHERE s.status = 'trialing'
        AND s.trial_ends_at <= now() + interval '21 days'
        AND EXISTS (
          SELECT 1 FROM setup_progress sp
          WHERE sp.organization_id = s.organization_id AND sp.status <> 'completed' AND sp.status <> 'skipped'
        )
    `)) as unknown as Array<{ organization_id: string; trial_ends_at: string }>;

    for (const r of rows) {
      await deps.alert({ organizationId: r.organization_id, trialEndsAt: r.trial_ends_at });
    }
  };
}

export const flagAtRiskOrgs = makeFlagAtRiskOrgs({
  db: dbAdmin,
  alert: async ({ organizationId, trialEndsAt }) =>
    console.log(`[setup] at-risk org=${organizationId} trial_ends=${trialEndsAt}`),
});
