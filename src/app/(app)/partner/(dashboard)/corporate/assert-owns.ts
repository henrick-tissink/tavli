import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

/**
 * Shared ownership guard for corporate partner actions (private spaces,
 * meeting spaces, meeting bookings). Extracted unchanged from
 * spaces/actions.ts — admins pass through; owners must match their primary
 * restaurant. Errors are localized from partner.corporate.
 */
export async function assertOwns(
  restaurantId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: m.spaces.errors.unauthorised };
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  if (session.profile.role === "admin") return { ok: true, userId: session.userId };
  const primary = await currentUserPrimaryRestaurant(session);
  if (!primary || primary !== restaurantId) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  return { ok: true, userId: session.userId };
}
