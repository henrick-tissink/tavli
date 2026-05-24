import "server-only";

/**
 * §12 §7.1 forward-declared activation seam (Wave 5 sub-unit C).
 *
 * Called from /onboard completion (publishRestaurant). Starts the 90-day trial
 * ONLY when the org has a customer_type captured and no active subscription
 * yet. Today onboard captures no customer_type, so this no-ops silently; when
 * §15/W5-E adds plan + customer_type capture, the trial starts automatically —
 * no rework here. The caller wraps this in try/catch so a billing hiccup never
 * blocks the restaurant from publishing.
 */
export interface MaybeStartTrialDeps {
  loadCustomerType: (orgId: string) => Promise<string | null>;
  hasActiveSubscription: (orgId: string) => Promise<boolean>;
  startSubscription: (input: {
    organizationId: string;
    tier: "base" | "pro";
    frequency: "monthly" | "annual";
  }) => Promise<{ stripeCheckoutUrl: string }>;
}

export type MaybeStartTrialResult =
  | { started: true; checkoutUrl: string }
  | { started: false; reason: "no_customer_type" | "already_subscribed" };

export async function maybeStartTrial(
  organizationId: string,
  deps: MaybeStartTrialDeps,
): Promise<MaybeStartTrialResult> {
  const customerType = await deps.loadCustomerType(organizationId);
  if (!customerType) return { started: false, reason: "no_customer_type" };

  if (await deps.hasActiveSubscription(organizationId)) {
    return { started: false, reason: "already_subscribed" };
  }

  // Default plan when capture UI lands but no explicit choice: Base/monthly (§3.4).
  const { stripeCheckoutUrl } = await deps.startSubscription({
    organizationId,
    tier: "base",
    frequency: "monthly",
  });
  return { started: true, checkoutUrl: stripeCheckoutUrl };
}
