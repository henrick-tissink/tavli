"use server";

import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getPartnerRestaurant } from "@/lib/auth/partner";

type Cap = "events" | "corporateMeals" | "standing" | "meetingNooks";
const COL: Record<
  Cap,
  "eventsIntakeEnabled" | "acceptsCorporateMeals" | "acceptsStanding" | null
> = {
  events: "eventsIntakeEnabled",
  corporateMeals: "acceptsCorporateMeals",
  standing: "acceptsStanding",
  meetingNooks: null,
};

export async function toggleCapability(
  restaurantId: string,
  cap: Cap,
  next: boolean,
): Promise<void> {
  const r = await getPartnerRestaurant();
  if (r.id !== restaurantId) throw new Error("forbidden");
  const col = COL[cap];
  if (!col) throw new Error("capability not yet available");
  await dbAdmin
    .update(restaurants)
    .set({ [col]: next })
    .where(eq(restaurants.id, restaurantId));
  revalidatePath("/partner/corporate");
}
