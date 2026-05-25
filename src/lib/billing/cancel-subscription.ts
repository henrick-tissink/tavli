import "server-only";
import type Stripe from "stripe";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions } from "@/lib/db/schema";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";

const CANCELLABLE = ["active", "trialing", "past_due", "unpaid"] as const;

export interface ProRataInput {
  annualPaidThrough: Date;
  currentPeriodStart: Date;
  amountPaidCents: number;
  now: Date;
}

/** §10.2 — unused-fraction refund for an annual prepay cancelled mid-term. */
export function computeProRataRefundCents(input: ProRataInput): number {
  const total = input.annualPaidThrough.getTime() - input.currentPeriodStart.getTime();
  const remaining = input.annualPaidThrough.getTime() - input.now.getTime();
  if (total <= 0 || remaining <= 0) return 0;
  const fraction = Math.min(1, remaining / total);
  return Math.round(input.amountPaidCents * fraction);
}

export interface CancelSubscriptionInput {
  organizationId: string;
  mode: "period_end" | "immediate";
  reason?: string;
  feedback?: string;
  actorUserId?: string | null;
}

export interface CancelSubscriptionDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  stripe: Pick<Stripe, "subscriptions" | "refunds" | "invoices">;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  now?: () => Date;
  // §07 §8.3 / §13 — final data-export-on-cancel. Defaults to the real
  // bypass-export enqueuer; injected as a spy in tests. Fires only for
  // customer-initiated cancels (an actor present) — system/dunning auto-cancels
  // route their export through §13 retention instead.
  triggerDataExport?: (organizationId: string, requestedByUserId: string) => Promise<void>;
}

export function makeCancelSubscription(deps: CancelSubscriptionDeps) {
  const now = deps.now ?? (() => new Date());
  return async function cancelSubscription(input: CancelSubscriptionInput): Promise<{ refundCents: number }> {
    const rows = await deps.db
      .select({
        id: subscriptions.id,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        status: subscriptions.status,
        frequency: subscriptions.frequency,
        annualPaidThrough: subscriptions.annualPaidThrough,
        currentPeriodStart: subscriptions.currentPeriodStart,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, input.organizationId),
          inArray(subscriptions.status, [...CANCELLABLE]),
        ),
      );
    const sub = rows[0];
    if (!sub) throw new Error(`not_found: no cancellable subscription for ${input.organizationId}`);

    let refundCents = 0;

    if (input.mode === "period_end") {
      await deps.stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      await deps.db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, cancellationReason: input.reason ?? null })
        .where(eq(subscriptions.id, sub.id));
    } else {
      await deps.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      await deps.db
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: sql`now()`, cancellationReason: input.reason ?? null })
        .where(eq(subscriptions.id, sub.id));

      // §10.2 — pro-rata refund on an annual prepay cancelled mid-term.
      if (sub.frequency === "annual" && sub.annualPaidThrough && sub.currentPeriodStart) {
        const paid = await deps.stripe.invoices.list({
          subscription: sub.stripeSubscriptionId,
          status: "paid",
          limit: 1,
          // NEW-1c: stripe@22 moved the PaymentIntent off the top-level Invoice
          // onto invoice.payments[].payment; expand it so we can find the
          // refund target. The old top-level field is kept as a fallback.
          expand: ["data.payments"],
        });
        const invoice = paid.data[0] as
          | {
              payment_intent?: string | { id: string };
              payments?: {
                data?: Array<{ payment?: { payment_intent?: string | { id: string } } }>;
              };
              amount_paid?: number;
            }
          | undefined;
        const piRaw =
          invoice?.payment_intent ??
          invoice?.payments?.data?.[0]?.payment?.payment_intent;
        const paymentIntent = typeof piRaw === "string" ? piRaw : piRaw?.id;
        const amountPaid = invoice?.amount_paid ?? 0;
        refundCents = computeProRataRefundCents({
          annualPaidThrough: sub.annualPaidThrough,
          currentPeriodStart: sub.currentPeriodStart,
          amountPaidCents: amountPaid,
          now: now(),
        });
        if (refundCents > 0 && typeof paymentIntent === "string") {
          const refund = await deps.stripe.refunds.create({
            payment_intent: paymentIntent,
            amount: refundCents,
            reason: "requested_by_customer",
          });
          await deps.recordBillingAudit({
            organizationId: input.organizationId,
            eventType: "billing.refund_issued",
            actorUserId: input.actorUserId,
            context: { stripe_refund_id: refund.id, amount_cents: refundCents },
          });
        }
      }
    }

    await deps.recordBillingAudit({
      organizationId: input.organizationId,
      eventType: "billing.subscription_cancelled",
      actorUserId: input.actorUserId,
      // MED-3: keep the categorical cancellation `reason` (also persisted on
      // subscriptions.cancellationReason) but NOT the free-text `feedback` —
      // billing_audit_log is a 7-year fiscal record outside the diner GDPR
      // cascade, and operator/diner free-text can carry PII (names, phones).
      context: { reason: input.reason ?? null, mode: input.mode, pro_rata_refund_cents: refundCents },
    });

    // §07 §8.3 — final data-export-on-cancel (contractual portability). Only
    // for customer-initiated cancels; a null actor is a system auto-cancel
    // whose export is owned by §13 retention.
    if (input.actorUserId) {
      const trigger =
        deps.triggerDataExport ??
        (async (orgId, userId) => {
          const { enqueueBypassExport } = await import("@/lib/analytics/run-export");
          await enqueueBypassExport({
            organizationId: orgId,
            requestedByUserId: userId,
            reason: "subscription_cancellation",
          });
        });
      await trigger(input.organizationId, input.actorUserId);
    }
    return { refundCents };
  };
}

// Production-bound singleton (lazy Stripe — getStripe() throws without a key,
// so resolution is deferred to call-time, mirroring change-plan.ts).
import { getStripe } from "@/lib/stripe/client";

const lazyStripe: Pick<Stripe, "subscriptions" | "refunds" | "invoices"> = {
  subscriptions: {
    update: ((...a: Parameters<Stripe["subscriptions"]["update"]>) =>
      getStripe().subscriptions.update(...a)) as Stripe["subscriptions"]["update"],
    cancel: ((...a: Parameters<Stripe["subscriptions"]["cancel"]>) =>
      getStripe().subscriptions.cancel(...a)) as Stripe["subscriptions"]["cancel"],
  } as Stripe["subscriptions"],
  refunds: {
    create: ((...a: Parameters<Stripe["refunds"]["create"]>) =>
      getStripe().refunds.create(...a)) as Stripe["refunds"]["create"],
  } as Stripe["refunds"],
  invoices: {
    list: ((...a: Parameters<Stripe["invoices"]["list"]>) =>
      getStripe().invoices.list(...a)) as Stripe["invoices"]["list"],
  } as Stripe["invoices"],
};

export const cancelSubscription = makeCancelSubscription({
  db: dbAdmin,
  stripe: lazyStripe,
  recordBillingAudit: defaultRecordBillingAudit,
});
