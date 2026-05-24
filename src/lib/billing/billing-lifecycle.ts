import "server-only";
import type Stripe from "stripe";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions, organizations } from "@/lib/db/schema";
import { mapStripeStatus } from "@/lib/billing/stripe-status";

const DAY_MS = 86_400_000;

// ─── expireOrphanIncomplete (§6.1, hourly) ──────────────────────────────────
export interface ExpireOrphanDeps {
  db: Pick<typeof dbAdmin, "delete">;
  now?: () => Date;
}
export function makeExpireOrphanIncomplete(deps: ExpireOrphanDeps) {
  const now = deps.now ?? (() => new Date());
  return async function expireOrphanIncomplete(): Promise<void> {
    const cutoff = new Date(now().getTime() - DAY_MS);
    await deps.db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "incomplete"),
          lt(subscriptions.createdAt, cutoff),
          isNull(subscriptions.defaultPaymentMethodStripeId),
        ),
      );
  };
}

// ─── archiveCancelledOrgs (§10.3, nightly) ──────────────────────────────────
export interface ArchiveCancelledDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  now?: () => Date;
}
export function makeArchiveCancelledOrgs(deps: ArchiveCancelledDeps) {
  const now = deps.now ?? (() => new Date());
  return async function archiveCancelledOrgs(): Promise<void> {
    const cutoff = new Date(now().getTime() - 30 * DAY_MS);
    const rows = await deps.db
      .select({ organizationId: subscriptions.organizationId })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, "cancelled"), lt(subscriptions.cancelledAt, cutoff)));
    for (const row of rows) {
      await deps.db
        .update(organizations)
        .set({ status: "suspended" })
        .where(eq(organizations.id, row.organizationId));
    }
  };
}

// ─── syncStripeSubscription (§13, nightly reconcile) ─────────────────────────
export interface SyncStripeDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  stripe: Pick<Stripe, "subscriptions">;
}
export function makeSyncStripeSubscription(deps: SyncStripeDeps) {
  return async function syncStripeSubscription(): Promise<void> {
    const rows = await deps.db
      .select({ id: subscriptions.id, stripeSubscriptionId: subscriptions.stripeSubscriptionId, status: subscriptions.status })
      .from(subscriptions)
      .where(
        sql`${subscriptions.status} in ('trialing','active','past_due','unpaid')`,
      );
    for (const row of rows) {
      const live = await deps.stripe.subscriptions.retrieve(row.stripeSubscriptionId);
      const mapped = mapStripeStatus(live.status);
      if (mapped !== row.status) {
        await deps.db
          .update(subscriptions)
          .set({ status: mapped, statusSyncedAt: sql`now()` })
          .where(eq(subscriptions.id, row.id));
      }
    }
  };
}

// ─── production singletons (lazy Stripe) ────────────────────────────────────
import { getStripe } from "@/lib/stripe/client";

export const expireOrphanIncomplete = makeExpireOrphanIncomplete({ db: dbAdmin });
export const archiveCancelledOrgs = makeArchiveCancelledOrgs({ db: dbAdmin });
export const syncStripeSubscription = makeSyncStripeSubscription({
  db: dbAdmin,
  stripe: {
    subscriptions: {
      retrieve: ((...a: Parameters<Stripe["subscriptions"]["retrieve"]>) =>
        getStripe().subscriptions.retrieve(...a)) as Stripe["subscriptions"]["retrieve"],
    } as Stripe["subscriptions"],
  },
});
