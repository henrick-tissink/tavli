/**
 * §11 §9.1 / §12 — bill computed marketing overage to Stripe.
 *
 * The spec's `subscriptionItems.createUsageRecord` was removed in stripe@22.
 * Rather than require operational meter + metered-price setup (Billing.meterEvents),
 * we add the already-priced overage cents as a one-off invoice item on the org's
 * next invoice — fully functional with just the Stripe customer id. This closes
 * the "recorded but never billed" revenue leak; it's wired into the overage
 * handler only when a live Stripe key is present (dev/pre-launch stays a no-op).
 */
import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";

interface Deps {
  stripe: Pick<Stripe, "invoiceItems">;
  getCustomerId: (organizationId: string) => Promise<string | null>;
}

export function makeStripeOverageReporter(deps: Deps) {
  return async function reportToStripe(input: {
    organizationId: string;
    yearMonth: string;
    totalCents: number;
  }): Promise<void> {
    const customerId = await deps.getCustomerId(input.organizationId);
    if (!customerId) {
      console.warn(
        `[billing] overage ${input.totalCents}c for org ${input.organizationId} (${input.yearMonth}): no Stripe customer; skipped`,
      );
      return;
    }
    // Idempotency key keyed on (org, month): a retried report job (pg-boss
    // retry, or a re-enqueue after the singletonKey window) cannot create a
    // second invoice item — Stripe collapses the duplicate request.
    // VAT: the amount is the net (TVA-exclusive) figure; Romanian TVA is applied
    // at invoice finalisation by Stripe Tax (registered for RO per the launch
    // runbook), matching the spec's tax-on-top behaviour.
    await deps.stripe.invoiceItems.create(
      {
        customer: customerId,
        amount: input.totalCents,
        currency: "eur",
        description: `Tavli — taxe marketing peste plafon (${input.yearMonth})`,
      },
      { idempotencyKey: `overage:${input.organizationId}:${input.yearMonth}` },
    );
  };
}

async function defaultGetCustomerId(organizationId: string): Promise<string | null> {
  const rows = await dbAdmin
    .select({ c: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return (rows[0]?.c as string | null) ?? null;
}

const lazyStripe: Pick<Stripe, "invoiceItems"> = {
  invoiceItems: {
    create: ((...a: Parameters<Stripe["invoiceItems"]["create"]>) =>
      getStripe().invoiceItems.create(...a)) as Stripe["invoiceItems"]["create"],
  } as Stripe["invoiceItems"],
};

export const stripeOverageReporter = makeStripeOverageReporter({
  stripe: lazyStripe,
  getCustomerId: defaultGetCustomerId,
});
