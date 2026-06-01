"use server";

/**
 * §09 §6.2 — persist the partner's chosen active venue in a cookie that
 * currentUserPrimaryRestaurant honours on subsequent requests. Validated:
 * a user can only pin a venue they actually have access to.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { userHasVenueAccess, ACTIVE_VENUE_COOKIE } from "@/lib/restaurants/current-user";

export async function setActiveVenueAction(restaurantId: string): Promise<{ ok: boolean }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false };
  if (!(await userHasVenueAccess(session.userId, restaurantId))) return { ok: false };
  (await cookies()).set(ACTIVE_VENUE_COOKIE, restaurantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/partner");
  return { ok: true };
}
