"use server";

/**
 * §12 / §15 W5-E — partner billing management server actions. Thin wrappers over
 * the Wave 5 billing libs: gate by org-scoped permission, call the lib, revalidate.
 * The libs own their audit writes; actions never throw across the boundary.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";
import { requireCan } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { organizations } from "@/lib/db/schema";
import { cancelSubscription as cancelSubscriptionLib } from "@/lib/billing/cancel-subscription";
import { changePlanActions } from "@/lib/billing/change-plan";
import { getStripe } from "@/lib/stripe/client";
import {
  ok,
  fail,
  unauthenticated,
  type ActionResult,
} from "@/lib/server-action";

type CancelMode = "period_end" | "immediate";
type Frequency = "monthly" | "annual";

async function gate(organizationId: string, action: "billing.update" | "subscription.cancel") {
  const session = await getCurrentSession();
  if (!session) return { denied: unauthenticated() as ActionResult<never>, session: null };
  const denied = await requireCan(session, action, { kind: "organization", id: organizationId });
  if (denied) return { denied, session: null };
  return { denied: null, session };
}

export async function cancelSubscriptionAction(
  organizationId: string,
  mode: CancelMode,
  reason?: string,
  feedback?: string,
): Promise<ActionResult<{ refundCents: number }>> {
  const { denied, session } = await gate(organizationId, "subscription.cancel");
  if (denied) return denied;
  try {
    const actor = await currentActor(session!.userId);
    const result = await cancelSubscriptionLib({
      organizationId,
      mode,
      reason,
      feedback,
      actorUserId: actor.actorUserId,
    });
    revalidatePath("/partner/billing");
    return ok(result);
  } catch (err) {
    return fail("internal", String(err));
  }
}

export async function changeTierAction(
  organizationId: string,
  target: "base" | "pro",
): Promise<ActionResult<void>> {
  const { denied } = await gate(organizationId, "billing.update");
  if (denied) return denied;
  try {
    if (target === "pro") {
      await changePlanActions.upgradeSubscriptionTier(organizationId);
    } else {
      await changePlanActions.downgradeSubscriptionTier(organizationId);
    }
    revalidatePath("/partner/billing");
    return ok(undefined);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("TV1005")) {
      return fail("TV1005", msg);
    }
    return fail("internal", msg);
  }
}

export async function requestFrequencyChangeAction(
  organizationId: string,
  newFrequency: Frequency,
): Promise<ActionResult<void>> {
  const { denied } = await gate(organizationId, "billing.update");
  if (denied) return denied;
  try {
    await changePlanActions.requestFrequencyChange(organizationId, newFrequency);
    revalidatePath("/partner/billing");
    return ok(undefined);
  } catch (err) {
    return fail("internal", String(err));
  }
}

export async function cancelPendingFrequencyChangeAction(
  organizationId: string,
): Promise<ActionResult<void>> {
  const { denied } = await gate(organizationId, "billing.update");
  if (denied) return denied;
  try {
    await changePlanActions.cancelPendingFrequencyChange(organizationId);
    revalidatePath("/partner/billing");
    return ok(undefined);
  } catch (err) {
    return fail("internal", String(err));
  }
}

/** Opens a Stripe Billing Portal session for card/payment-method management. */
export async function createBillingPortalSessionAction(
  organizationId: string,
): Promise<ActionResult<{ url: string }>> {
  const { denied } = await gate(organizationId, "billing.update");
  if (denied) return denied;
  try {
    const [org] = await dbAdmin
      .select({ customerId: organizations.stripeCustomerId })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!org?.customerId) return fail("not_found", "No billing customer on file.");
    const session = await getStripe().billingPortal.sessions.create({
      customer: org.customerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tavli.ro"}/partner/billing`,
    });
    return ok({ url: session.url });
  } catch (err) {
    return fail("internal", String(err));
  }
}
