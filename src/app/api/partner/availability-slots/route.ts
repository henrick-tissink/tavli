import { NextRequest, NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantAvailability } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ slots: [] });
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ slots: [] });
  // Find the partner's restaurant
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return NextResponse.json({ slots: [] });
  const dow = new Date(date).getDay();
  const rows = await dbAdmin
    .select({
      slotStart: restaurantAvailability.slotStart,
      capacity: restaurantAvailability.capacity,
    })
    .from(restaurantAvailability)
    .where(
      and(
        eq(restaurantAvailability.restaurantId, restaurantId),
        eq(restaurantAvailability.dayOfWeek, dow),
      ),
    );
  // Return slotStart anchors. Hour-level granularity is fine for event
  // materialization; partners can fine-tune later via the regular reservation
  // flow if needed.
  return NextResponse.json({
    slots: rows.map((row) => ({ start: row.slotStart, capacity: row.capacity })),
  });
}
