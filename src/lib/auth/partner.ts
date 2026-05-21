/**
 * Server-side helper to load the current partner's restaurant record.
 * Throws if the user is not signed in, lacks an authorised role, or has
 * no restaurant associated with their account.
 *
 * Use from server components, server actions, and route handlers.
 */

import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getCurrentSession,
  NotAuthenticatedError,
  ForbiddenError,
} from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export type PartnerRestaurant = typeof restaurants.$inferSelect;

export async function getPartnerRestaurant(): Promise<PartnerRestaurant> {
  const session = await getCurrentSession();
  if (!session) throw new NotAuthenticatedError();
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    throw new ForbiddenError("Requires partner role");
  }

  const restaurantId = await currentUserPrimaryRestaurant(session);
  const [restaurant] = restaurantId
    ? await dbAdmin
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1)
    : [];

  if (!restaurant) {
    throw new ForbiddenError("No restaurant associated with this account");
  }
  return restaurant;
}
