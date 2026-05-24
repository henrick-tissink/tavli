import "server-only";
import { cache } from "react";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions } from "@/lib/db/schema";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";

export type BillingAccess = "full" | "soft_lock" | "read_only";

const DAY_MS = 86_400_000;
const SOFT_LOCK_DAY = 7;
const READ_ONLY_DAY = 21;

export interface ComputeBillingAccessInput {
  status: string;
  pastDueSince: Date | null;
  now: Date;
}

/**
 * §11.5 tiered dunning access (operator portal only — diner booking is never
 * gated, §11.6). past_due: days 0–6 full, ≥7 soft_lock (writes paused except
 * bookings). unpaid: read_only. cancelled: read_only (immediate-cancel grace).
 */
export function computeBillingAccess(input: ComputeBillingAccessInput): BillingAccess {
  switch (input.status) {
    case "active":
    case "trialing":
    case "incomplete":
      return "full";
    case "past_due": {
      if (!input.pastDueSince) return "full";
      const days = (input.now.getTime() - input.pastDueSince.getTime()) / DAY_MS;
      return days >= SOFT_LOCK_DAY ? "soft_lock" : "full";
    }
    case "unpaid":
    case "cancelled":
      return "read_only";
    default:
      return "full";
  }
}

export interface LoadBillingAccessDeps {
  db: Pick<typeof dbAdmin, "select">;
  now?: () => Date;
}

export function makeLoadBillingAccess(deps: LoadBillingAccessDeps) {
  const now = deps.now ?? (() => new Date());
  return async function loadBillingAccess(organizationId: string): Promise<BillingAccess> {
    try {
      const rows = await deps.db
        .select({ status: subscriptions.status, statusSyncedAt: subscriptions.statusSyncedAt })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.organizationId, organizationId),
            inArray(subscriptions.status, ["trialing", "active", "past_due", "unpaid"]),
          ),
        );
      const row = rows[0];
      if (!row) return "full"; // no active subscription → unconstrained (free tier)
      return computeBillingAccess({ status: row.status, pastDueSince: row.statusSyncedAt, now: now() });
    } catch {
      return "full"; // never block a read path on a billing read (§3.5 spirit)
    }
  };
}

export const loadBillingAccess = cache(makeLoadBillingAccess({ db: dbAdmin }));

export interface EnforceDunningTierDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  now?: () => Date;
}

/**
 * §11.5 / §13 — every 6 h, transition past_due subscriptions that have been
 * failing for ≥21 days to `unpaid` (full read-only). Days 7–20 stay past_due;
 * the soft-lock at day 7 is computed at read time by computeBillingAccess.
 */
export function makeEnforceDunningTier(deps: EnforceDunningTierDeps) {
  const now = deps.now ?? (() => new Date());
  return async function enforceDunningTier(): Promise<void> {
    const cutoff = new Date(now().getTime() - READ_ONLY_DAY * DAY_MS);
    const due = await deps.db
      .select({ id: subscriptions.id, organizationId: subscriptions.organizationId })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, "past_due"), lte(subscriptions.statusSyncedAt, cutoff)));

    for (const row of due) {
      await deps.db
        .update(subscriptions)
        .set({ status: "unpaid", statusSyncedAt: sql`now()` })
        .where(eq(subscriptions.id, row.id));
      await deps.recordBillingAudit({
        organizationId: row.organizationId,
        eventType: "billing.subscription_updated",
        context: { event: "dunning_read_only", before_status: "past_due", after_status: "unpaid" },
      });
    }
  };
}

export const enforceDunningTier = makeEnforceDunningTier({
  db: dbAdmin,
  recordBillingAudit: defaultRecordBillingAudit,
});
