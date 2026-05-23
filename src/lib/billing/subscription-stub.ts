import "server-only";

/**
 * subscription-stub — temporary v1 helper.
 *
 * Returns 'base' for every organization. Replaced in Wave 5 (§12) by
 * the real loadActiveSubscription that reads from the subscriptions table.
 *
 * Until billing ships, every org is treated as Base tier — they get
 * the Base photo (20) + menu (2) caps. No Pro upgrade path until Wave 5.
 *
 * TODO(Wave 5 §12): bind Deps to dbAdmin + read subscriptions table;
 * add status, current_period_end, etc. to SubscriptionInfo.
 * TODO(Wave 5 §05 §6.3): add menu cap enforcement (Base = 2 menus) to the
 * menu-creation action once multi-menu support is introduced. Currently menus
 * is a 1:1 upsert with restaurants (no distinct create-menu action exists) so
 * the cap is not applicable in v1. Revisit when a dedicated createMenu action
 * is added that allows multiple menus per restaurant.
 */

export type SubscriptionTier = "base" | "pro";

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  // More fields added in Wave 5 (status, current_period_end, etc.)
}

interface Deps {
  // Wave 5 binds this to dbAdmin + reads subscriptions table.
}

export function makeLoadActiveSubscription(_deps: Deps) {
  return async function loadActiveSubscription(
    _orgId: string,
  ): Promise<SubscriptionInfo> {
    return { tier: "base" };
  };
}

export const loadActiveSubscription = makeLoadActiveSubscription({});

export async function isProTier(orgId: string): Promise<boolean> {
  const sub = await loadActiveSubscription(orgId);
  return sub.tier === "pro";
}
