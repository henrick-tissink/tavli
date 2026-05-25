import "server-only";

/**
 * §12 §11.5 / NEW-5 — dunning write-path guard. A soft-locked (day 7+ past_due)
 * or read-only (day 21+ unpaid, or cancelled) organisation must not be able to
 * mutate its listing / content / data. These helpers return a boolean so each
 * server action can short-circuit in its own ActionResult shape with the
 * `billing_locked` code.
 *
 * Diner-facing bookings are NEVER gated (§12 §11.6) — do not call these from the
 * public booking flow or from partner reservation-management actions.
 */
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { loadBillingAccess } from "@/lib/billing/dunning";

/** True when the org is soft-locked or read-only (dunning). Free-tier / unlinked
 *  orgs (no subscription) read "full" → returns false. Never throws. */
export async function isOrgBillingLocked(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  try {
    return (await loadBillingAccess(organizationId)) !== "full";
  } catch {
    return false; // never block a write on a billing-read failure (§3.5 spirit)
  }
}

/** Convenience for the many partner actions that hold only a restaurantId. */
export async function isRestaurantBillingLocked(restaurantId: string | null | undefined): Promise<boolean> {
  if (!restaurantId) return false;
  try {
    const [r] = await dbAdmin
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    return isOrgBillingLocked((r as { organizationId: string | null } | undefined)?.organizationId);
  } catch {
    return false;
  }
}
