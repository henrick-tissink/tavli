import "server-only";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions, invoices, paymentMethods, organizations } from "@/lib/db/schema";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";
import { mapStripeStatus } from "@/lib/billing/stripe-status";
import {
  sendTransactionalEmail as defaultSendEmail,
  type SendTransactionalEmailInput,
} from "@/lib/email/send-transactional";
import { render as defaultRender } from "@react-email/render";
import { RecurringChargeConsentEmail, getSubject as consentSubject } from "@/emails/RecurringChargeConsentEmail";
import { wasEventApplied as defaultWasEventApplied } from "@/lib/billing/webhook-idempotency";

export interface StripeWebhookRouterDeps {
  db: typeof dbAdmin;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  wasEventApplied: typeof defaultWasEventApplied;
  sendEmail: (input: SendTransactionalEmailInput) => Promise<unknown>;
  render: typeof defaultRender;
  stripe: Pick<Stripe, "subscriptions">;
}

type Obj = Record<string, unknown>;

export function makeStripeWebhookRouter(deps: StripeWebhookRouterDeps) {
  async function orgByCustomer(customer: unknown): Promise<string | null> {
    if (typeof customer !== "string") return null;
    const rows = await deps.db
      .select({ organizationId: organizations.id })
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customer));
    return rows[0]?.organizationId ?? null;
  }

  function tsToDate(v: unknown): Date | null {
    return typeof v === "number" ? new Date(v * 1000) : null;
  }

  // NEW-1: stripe@22 (API 2026-04-22.dahlia) removed current_period_start/end
  // from the Subscription object — they now live on each subscription item.
  // Read from the first item. Reading sub.current_period_* (as the code did)
  // returned undefined → null, which silently killed the annual pro-rata
  // refund (#3) and the pending-frequency-change effective date.
  function periodFromSub(sub: Obj): { start: Date | null; end: Date | null } {
    const items = (sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
    const item = items[0];
    return {
      start: tsToDate(item?.current_period_start),
      end: tsToDate(item?.current_period_end),
    };
  }

  // NEW-6: stripe@22 moved Invoice.subscription to
  // invoice.parent.subscription_details.subscription. The old top-level field is
  // kept as a fallback. (The previous code read only inv.subscription, so
  // invoice.payment_failed silently never set past_due in this SDK.)
  function subscriptionIdFromInvoice(inv: Obj): string | null {
    if (typeof inv.subscription === "string") return inv.subscription;
    const parent = inv.parent as { subscription_details?: { subscription?: unknown } } | undefined;
    const s = parent?.subscription_details?.subscription;
    return typeof s === "string" ? s : null;
  }

  async function onSubscriptionUpdated(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return;
    const sub = event.data.object as unknown as Obj;
    const rows = await deps.db
      .select({ organizationId: subscriptions.organizationId, status: subscriptions.status, frequency: subscriptions.frequency })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id as string));
    const row = rows[0];
    if (!row) return; // not mirrored yet; the created handler / W5-C insert owns it
    const after = mapStripeStatus(sub.status as Stripe.Subscription.Status);
    // #10 — Stripe emits subscription.updated for many non-status reasons
    // (quantity sync, card change, cancel-at-period-end). statusSyncedAt is the
    // dunning clock (read as pastDueSince), so only re-stamp it on an actual
    // status transition — otherwise the day-7/day-21 counter never advances.
    const statusChanged = after !== row.status;
    const { start: periodStart, end: periodEnd } = periodFromSub(sub);
    await deps.db
      .update(subscriptions)
      .set({
        status: after,
        // #3 — populate the columns the §10.2 pro-rata refund branch reads.
        // For an annual prepay, current_period_end IS the paid-through date.
        // MED-1 — but ONLY when the event actually carries item period data.
        // Stripe emits many sparse subscription.updated events (cancel flag,
        // metadata, card change) with empty items.data; deriving null from those
        // and writing it would clobber a known-good paid-through and silently
        // refund €0 on a later annual cancel. Never overwrite with null.
        ...(periodEnd
          ? {
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              ...(row.frequency === "annual" ? { annualPaidThrough: periodEnd } : {}),
            }
          : {}),
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        ...(statusChanged ? { statusSyncedAt: sql`now()` } : {}),
      })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id as string));
    await deps.recordBillingAudit({
      organizationId: row.organizationId,
      eventType: "billing.subscription_updated",
      context: { stripe_event_id: event.id, before_status: row.status, after_status: after },
    });
  }

  async function onSubscriptionCreated(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return; // A5 — replay guard (was missing)
    const sub = event.data.object as unknown as Obj;
    const orgId = (sub.metadata as Obj | undefined)?.organization_id as string | undefined;
    const resolvedOrg = orgId ?? (await orgByCustomer(sub.customer));
    if (!resolvedOrg) return;
    const frequency = ((sub.metadata as Obj | undefined)?.frequency as "monthly" | "annual") ?? "monthly";
    const { start: periodStart, end: periodEnd } = periodFromSub(sub);
    // UPSERT — idempotent against the row W5-C startSubscription already inserted.
    await deps.db
      .insert(subscriptions)
      .values({
        organizationId: resolvedOrg,
        stripeSubscriptionId: sub.id as string,
        stripeCustomerId: sub.customer as string,
        tier: ((sub.metadata as Obj | undefined)?.tier as "base" | "pro") ?? "base",
        frequency,
        status: mapStripeStatus(sub.status as Stripe.Subscription.Status),
        trialStartedAt: tsToDate(sub.trial_start) ?? new Date(),
        trialEndsAt: tsToDate(sub.trial_end) ?? new Date(),
        // #3 — seed the period columns the refund branch reads.
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        ...(frequency === "annual" ? { annualPaidThrough: periodEnd } : {}),
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: { status: mapStripeStatus(sub.status as Stripe.Subscription.Status), statusSyncedAt: sql`now()` },
      });
  }

  async function onSubscriptionDeleted(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return;
    const sub = event.data.object as unknown as Obj;
    const rows = await deps.db
      .select({ organizationId: subscriptions.organizationId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id as string));
    const row = rows[0];
    if (!row) return;
    await deps.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: sql`now()`, statusSyncedAt: sql`now()` })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id as string));
    await deps.recordBillingAudit({
      organizationId: row.organizationId,
      eventType: "billing.subscription_updated",
      context: { stripe_event_id: event.id, after_status: "cancelled" },
    });
  }

  async function onInvoice(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return; // #11 layer-2 idempotency
    const inv = event.data.object as unknown as Obj;
    const orgId = await orgByCustomer(inv.customer);
    if (!orgId) return;
    await deps.db
      .insert(invoices)
      .values({
        organizationId: orgId,
        stripeInvoiceId: inv.id as string,
        status: (inv.status as string) ?? "draft",
        amountDueCents: (inv.amount_due as number) ?? 0,
        amountPaidCents: (inv.amount_paid as number) ?? 0,
        // stripe@22 (API 2026-04-22.dahlia) removed the top-level Invoice.tax;
        // tax now lives in total_taxes[].amount. Sum them.
        taxAmountCents: ((inv.total_taxes as Array<{ amount?: number }> | undefined) ?? []).reduce(
          (s, t) => s + (t.amount ?? 0),
          0,
        ),
        currency: ((inv.currency as string) ?? "eur").toUpperCase().slice(0, 3),
        hostedInvoiceUrl: (inv.hosted_invoice_url as string) ?? null,
        invoicePdfUrl: (inv.invoice_pdf as string) ?? null,
        paidAt: event.type === "invoice.paid" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: invoices.stripeInvoiceId,
        set: {
          status: (inv.status as string) ?? "draft",
          amountPaidCents: (inv.amount_paid as number) ?? 0,
          ...(event.type === "invoice.paid" ? { paidAt: sql`now()` } : {}),
        },
      });

    if (event.type === "invoice.paid") {
      await deps.recordBillingAudit({
        organizationId: orgId,
        eventType: "billing.payment_succeeded",
        context: { stripe_event_id: event.id, stripe_invoice_id: inv.id, amount_paid_cents: inv.amount_paid },
      });
    } else if (event.type === "invoice.payment_failed") {
      // Hard decline → past_due. SCA step-up (authentication_required) is a
      // SEPARATE event (invoice.payment_action_required → incomplete, §7.3 step 3,
      // see onInvoicePaymentActionRequired). Dunning emails + lockout are W5-G.
      const subId = subscriptionIdFromInvoice(inv);
      if (subId) {
        await deps.db
          .update(subscriptions)
          .set({ status: "past_due", statusSyncedAt: sql`now()` })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
      }
      await deps.recordBillingAudit({
        organizationId: orgId,
        eventType: "billing.payment_failed",
        context: { stripe_event_id: event.id, stripe_invoice_id: inv.id, failure_reason: inv.last_finalization_error ?? null },
      });
    }
  }

  // NEW-6 / §7.3 step 3 — a subscription invoice that needs customer SCA action
  // (e.g. the day-91 MIT charge requiring 3DS) → 'incomplete', NOT 'past_due'.
  // computeBillingAccess maps incomplete→full, so the operator keeps access
  // while they complete the 3DS hosted-invoice flow.
  async function onInvoicePaymentActionRequired(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return;
    const inv = event.data.object as unknown as Obj;
    const subId = subscriptionIdFromInvoice(inv);
    if (!subId) return;
    const rows = await deps.db
      .select({ organizationId: subscriptions.organizationId, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subId));
    const row = rows[0];
    if (!row) return;
    await deps.db
      .update(subscriptions)
      .set({ status: "incomplete", statusSyncedAt: sql`now()` })
      .where(eq(subscriptions.stripeSubscriptionId, subId));
    await deps.recordBillingAudit({
      organizationId: row.organizationId,
      eventType: "billing.subscription_updated",
      context: { stripe_event_id: event.id, before_status: row.status, after_status: "incomplete", reason: "payment_action_required" },
    });
  }

  async function onPaymentMethodAttached(event: Stripe.Event): Promise<void> {
    const pm = event.data.object as unknown as Obj;
    const orgId = await orgByCustomer(pm.customer);
    if (!orgId) return;
    const card = pm.card as Obj | undefined;
    await deps.db
      .insert(paymentMethods)
      .values({
        organizationId: orgId,
        stripePaymentMethodId: pm.id as string,
        type: (pm.type as string) ?? "card",
        cardBrand: (card?.brand as string) ?? null,
        cardLast4: (card?.last4 as string) ?? null,
        cardExpMonth: (card?.exp_month as number) ?? null,
        cardExpYear: (card?.exp_year as number) ?? null,
      })
      .onConflictDoNothing({ target: paymentMethods.stripePaymentMethodId });
  }

  async function onPaymentMethodDetached(event: Stripe.Event): Promise<void> {
    const pm = event.data.object as unknown as Obj;
    await deps.db
      .update(paymentMethods)
      .set({ detachedAt: sql`now()` })
      .where(eq(paymentMethods.stripePaymentMethodId, pm.id as string));
  }

  async function onSetupIntentSucceeded(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return; // #11 layer-2 idempotency
    const si = event.data.object as unknown as Obj;
    const meta = (si.metadata as Obj | undefined) ?? {};
    const stripeSubId = meta.subscription_id as string | undefined;
    if (!stripeSubId) {
      throw new Error("setup_intent.succeeded missing metadata.subscription_id (Checkout misconfiguration)");
    }
    const rows = await deps.db
      .select({
        id: subscriptions.id,
        organizationId: subscriptions.organizationId,
        consentEmailSentAt: subscriptions.consentEmailSentAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
    const row = rows[0];
    if (!row) throw new Error(`setup_intent.succeeded: subscription ${stripeSubId} not found (race) — retry`);

    const paymentMethod = si.payment_method as string;
    await deps.stripe.subscriptions.update(stripeSubId, { default_payment_method: paymentMethod });
    await deps.db
      .update(subscriptions)
      .set({ defaultPaymentMethodStripeId: paymentMethod })
      .where(eq(subscriptions.id, row.id));

    await deps.recordBillingAudit({
      organizationId: row.organizationId,
      eventType: "billing.setup_intent_succeeded",
      context: { stripe_event_id: event.id, stripe_setup_intent_id: si.id, stripe_payment_method_id: paymentMethod },
    });

    if (!row.consentEmailSentAt) {
      const contact = await deps.db
        .select({ email: organizations.primaryContactEmail, locale: organizations.locale })
        .from(organizations)
        .where(eq(organizations.id, row.organizationId));
      const c = contact[0];
      if (c?.email) {
        const locale = (c.locale === "en" || c.locale === "de" ? c.locale : "ro") as "ro" | "en" | "de";
        const html = await deps.render(RecurringChargeConsentEmail({ locale }));
        const text = await deps.render(RecurringChargeConsentEmail({ locale }), { plainText: true });
        const sent = (await deps.sendEmail({
          to: c.email,
          locale,
          templateKey: "recurring_charge_consent",
          subject: consentSubject(locale),
          html,
          text,
          context: { organization_id: row.organizationId },
        })) as { messageId?: string } | undefined;
        await deps.db
          .update(subscriptions)
          .set({ consentEmailSentAt: sql`now()` })
          .where(eq(subscriptions.id, row.id));
        await deps.recordBillingAudit({
          organizationId: row.organizationId,
          eventType: "billing.psd2_consent_captured",
          context: {
            stripe_event_id: event.id,
            stripe_setup_intent_id: si.id,
            email_message_id: sent?.messageId ?? null,
          },
        });
      }
    }
  }

  async function onDispute(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return; // #11 layer-2 idempotency
    const dispute = event.data.object as unknown as Obj;
    const orgId = await orgByCustomer(dispute.customer);
    if (!orgId) return;
    await deps.recordBillingAudit({
      organizationId: orgId,
      eventType: "billing.dispute_opened",
      context: { stripe_event_id: event.id, stripe_dispute_id: dispute.id, amount_cents: dispute.amount, reason: dispute.reason },
    });
  }

  async function onChargeRefunded(event: Stripe.Event): Promise<void> {
    if (await deps.wasEventApplied(event.id)) return; // #11 layer-2 idempotency
    const charge = event.data.object as unknown as Obj;
    const orgId = await orgByCustomer(charge.customer);
    if (!orgId) return;
    await deps.recordBillingAudit({
      organizationId: orgId,
      eventType: "billing.refund_issued",
      context: { stripe_event_id: event.id, stripe_charge_id: charge.id, amount_refunded_cents: charge.amount_refunded },
    });
  }

  return {
    async handle(event: Stripe.Event): Promise<void> {
      switch (event.type) {
        case "customer.subscription.created":
          return onSubscriptionCreated(event);
        case "customer.subscription.updated":
          return onSubscriptionUpdated(event);
        case "customer.subscription.deleted":
          return onSubscriptionDeleted(event);
        case "invoice.created":
        case "invoice.finalized":
        case "invoice.paid":
        case "invoice.payment_failed":
        case "invoice.voided":
          return onInvoice(event);
        case "invoice.payment_action_required":
          return onInvoicePaymentActionRequired(event);
        case "payment_method.attached":
          return onPaymentMethodAttached(event);
        case "payment_method.detached":
          return onPaymentMethodDetached(event);
        case "setup_intent.succeeded":
          return onSetupIntentSucceeded(event);
        case "charge.dispute.created":
          return onDispute(event);
        case "charge.refunded":
          return onChargeRefunded(event);
        default:
          return; // trial_will_end (covered by day-85 reminder) + everything else: no-op
      }
    },
  };
}
