import "server-only";
import type Stripe from "stripe";
import { and, eq, isNotNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, subscriptions, subscriptionItems } from "@/lib/db/schema";
import { enqueue as defaultEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { priceIdForTierFrequency, priceIdForExtraLocation } from "@/lib/billing/price-ids";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";
import { mapStripeStatus } from "@/lib/billing/stripe-status";

const TRIAL_DAYS = 90;
const DAY_MS = 86_400_000;

export interface StartSubscriptionInput {
  organizationId: string;
  tier: "base" | "pro";
  frequency: "monthly" | "annual";
}

export interface StartSubscriptionDeps {
  stripe: Pick<Stripe, "customers" | "subscriptions" | "checkout">;
  db: typeof dbAdmin;
  enqueue: typeof defaultEnqueue;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  now?: () => Date;
  siteUrl?: string;
}

/**
 * §12 §7.1 — trial-start orchestration. Creates the Stripe Customer +
 * Subscription (90-day trial, card-on-file via Checkout setup-mode), mirrors
 * to local tables, enqueues the day-60/75/85 reminders, and writes the
 * subscription_created billing-audit row. Returns the Checkout URL for the
 * caller to redirect the operator to (card capture).
 *
 * Factory-only export: getStripe() throws without STRIPE_SECRET_KEY, so the
 * Stripe client is injected by the caller at call time (never at module load).
 */
export function makeStartSubscription(deps: StartSubscriptionDeps) {
  const now = deps.now ?? (() => new Date());
  const siteUrl = deps.siteUrl ?? process.env.SITE_URL ?? "https://tavli.ro";

  return async function startSubscription(
    input: StartSubscriptionInput,
  ): Promise<{ stripeCheckoutUrl: string }> {
    const orgRows = await deps.db
      .select({
        id: organizations.id,
        name: organizations.name,
        legalName: organizations.legalName,
        countryCode: organizations.countryCode,
        taxId: organizations.taxId,
        customerType: organizations.customerType,
        stripeCustomerId: organizations.stripeCustomerId,
        reTrialGranted: organizations.reTrialGranted,
        primaryContactEmail: organizations.primaryContactEmail,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId));
    const org = orgRows[0];
    if (!org) throw new Error(`not_found: organization ${input.organizationId}`);

    // §7.1 step 1 — one trial per legal entity (unless admin-granted a re-trial).
    const prior = await deps.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.organizationId, input.organizationId), isNotNull(subscriptions.trialStartedAt)),
      );
    if (prior[0] && !org.reTrialGranted) {
      throw new Error(`TV1001 trial_already_used: ${input.organizationId}`);
    }

    // §7.1 step 2 — tax_id uniqueness (TV1002) is already enforced at org
    // creation by the organizations (country_code, tax_id) partial unique index
    // (Wave 2). startSubscription does not mutate tax_id, so no collision can
    // arise here; no redundant pre-check.

    // §7.1 step 3 — customer_type must be captured before billing (internal guardrail).
    if (!org.customerType) {
      throw new Error("invalid_input: organizations.customer_type required before startSubscription");
    }

    // §7.1 step 4 — Stripe Customer (reuse or create).
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await deps.stripe.customers.create({
        email: org.primaryContactEmail,
        name: org.legalName ?? org.name,
        metadata: { organization_id: org.id, customer_type: org.customerType },
        // RO VAT numbers are EU VAT numbers; Stripe has no "ro_vat" type, so
        // EU businesses (incl. RO) use "eu_vat". v1 is EUR/EU-only (§17 OQ5).
        ...(org.customerType === "business" && org.taxId
          ? { tax_id_data: [{ type: "eu_vat" as const, value: org.taxId }] }
          : {}),
      });
      stripeCustomerId = customer.id;
      await deps.db
        .update(organizations)
        .set({ stripeCustomerId })
        .where(eq(organizations.id, org.id));
    }

    const startedAt = now();
    const trialEnd = new Date(startedAt.getTime() + TRIAL_DAYS * DAY_MS);
    const extraLocationPriceId = priceIdForExtraLocation(input.frequency);

    // §7.1 step 5 — Stripe Subscription (trial, card-on-file pending).
    const sub = await deps.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        { price: priceIdForTierFrequency(input.tier, input.frequency) },
        ...(input.tier === "pro" ? [{ price: extraLocationPriceId, quantity: 0 }] : []),
      ],
      trial_end: Math.floor(trialEnd.getTime() / 1000),
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      automatic_tax: { enabled: true },
      metadata: { organization_id: org.id, tier: input.tier, frequency: input.frequency },
    });

    // §7.1 step 6 — mirror rows (one transaction).
    await deps.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(subscriptions)
        .values({
          organizationId: org.id,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: stripeCustomerId as string,
          tier: input.tier,
          frequency: input.frequency,
          status: mapStripeStatus(sub.status),
          trialStartedAt: startedAt,
          trialEndsAt: trialEnd,
        })
        .returning({ id: subscriptions.id });
      const localSubId = inserted[0].id;

      for (const item of sub.items.data) {
        const kind = item.price?.id === extraLocationPriceId ? "extra_location" : "base_tier";
        await tx.insert(subscriptionItems).values({
          subscriptionId: localSubId,
          stripeSubscriptionItemId: item.id,
          kind,
          stripePriceId: item.price?.id ?? "",
          quantity: (item as { quantity?: number }).quantity ?? 1,
          unitAmountCents: (item.price as { unit_amount?: number } | undefined)?.unit_amount ?? 0,
        });
      }
    });

    // §7.1 step 7 — Checkout (setup-mode) for card-on-file.
    const session = await deps.stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      setup_intent_data: { metadata: { subscription_id: sub.id, organization_id: org.id } },
      success_url: `${siteUrl}/partner/onboarding?card=success`,
      cancel_url: `${siteUrl}/partner/onboarding?card=cancel`,
    });

    // §7.1 step 8 — reminder jobs (fire via startAfter, not cron).
    const at = (d: number) => new Date(startedAt.getTime() + d * DAY_MS);
    await deps.enqueue(JOBS.billing.sendReminderDay60, { organizationId: org.id }, { startAfter: at(60) });
    await deps.enqueue(JOBS.billing.sendReminderDay75, { organizationId: org.id }, { startAfter: at(75) });
    await deps.enqueue(JOBS.billing.sendReminderDay85, { organizationId: org.id }, { startAfter: at(85) });

    // §7.1 step 9 — audit.
    await deps.recordBillingAudit({
      organizationId: org.id,
      eventType: "billing.subscription_created",
      context: {
        tier: input.tier,
        frequency: input.frequency,
        stripe_subscription_id: sub.id,
        stripe_customer_id: stripeCustomerId,
      },
    });

    if (!session.url) throw new Error("internal: Stripe Checkout session returned no url");
    return { stripeCheckoutUrl: session.url };
  };
}
