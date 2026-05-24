/**
 * POST /api/webhooks/stripe
 *
 * Verifies the Stripe signature (STRIPE_WEBHOOK_SECRET) then routes through the
 * foundations `ingestWebhook` substrate (§6.6) for layer-1 idempotency
 * (unique provider + event id) + retry. The per-event dispatcher
 * (stripe-webhook-router) mirrors Stripe → local billing tables with layer-2
 * idempotency (billing_audit_log event-id dedup, §6.3.1).
 *
 * Without STRIPE_WEBHOOK_SECRET, verifySignature returns {ok:false} → 400; the
 * route never reaches the handlers. getStripe() is deferred to actual use
 * (setup_intent.succeeded → subscriptions.update) so the route doesn't throw at
 * dispatch time when no key is configured.
 */
import "server-only";
import type Stripe from "stripe";
import { ingestWebhook, type VerifyResult } from "@/lib/webhooks/handle";
import { verifyStripeSignature, getStripe } from "@/lib/stripe/client";
import { makeStripeWebhookRouter } from "@/lib/billing/stripe-webhook-router";
import { dbAdmin } from "@/lib/db/admin";
import { recordBillingAudit } from "@/lib/billing/billing-audit";
import { wasEventApplied } from "@/lib/billing/webhook-idempotency";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { render } from "@react-email/render";

// Defer getStripe() until subscriptions.update is actually called (only in the
// setup_intent.succeeded handler), so building the router never throws when no
// key is configured.
const lazyStripe = {
  subscriptions: {
    update: ((...args: Parameters<Stripe["subscriptions"]["update"]>) =>
      getStripe().subscriptions.update(...args)) as Stripe["subscriptions"]["update"],
  },
} as Pick<Stripe, "subscriptions">;

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  const verifySignature = async (): Promise<VerifyResult> => {
    try {
      const event = verifyStripeSignature(body, signature);
      return { ok: true, eventId: event.id, eventType: event.type, payload: event };
    } catch {
      return { ok: false };
    }
  };

  const router = makeStripeWebhookRouter({
    db: dbAdmin,
    recordBillingAudit,
    wasEventApplied,
    sendEmail: sendTransactionalEmail,
    render,
    stripe: lazyStripe,
  });

  return ingestWebhook({
    provider: "stripe",
    request,
    verifySignature,
    handle: (e) => router.handle(e.payload as Stripe.Event),
  });
}
