/**
 * Public read-only endpoint: bookable slot times for a venue on a given date.
 *
 * GET /api/restaurants/[id]/slots?date=YYYY-MM-DD
 *  → { slots: ["12:00", "12:30", ...] }
 *
 * Date semantics: dayOfWeek (0=Sun..6=Sat) is derived from the requested date.
 * Returns ALL slots for that day-of-week — past-slot filtering is the CLIENT's
 * job (it knows the user's wall clock; the server may be in a different
 * timezone and filter the wrong slots). Capacity is NOT subtracted in this v1.
 *
 * Powers `ReservationSheetV2` — when the user picks a date in step 1, step 3
 * fetches the slot list that actually corresponds to that date instead of
 * showing the static "today" list regardless of selection.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { computeSlots } from "@/lib/availability";
import { feasibleSlots } from "@/lib/reservations/assign-table";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: restaurantId } = await params;
  const dateParam = req.nextUrl.searchParams.get("date");

  if (!dateParam || !ISO_DATE.test(dateParam)) {
    return NextResponse.json({ slots: [] });
  }
  // YYYY-MM-DD → local-midnight Date so getDay() is timezone-stable.
  const [y, m, d] = dateParam.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dayOfWeek = date.getDay();

  let sb;
  try {
    sb = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ slots: [] });
  }

  const { data } = await sb
    .from("restaurant_availability")
    .select("slot_start, slot_end")
    .eq("restaurant_id", restaurantId)
    .eq("day_of_week", dayOfWeek);

  const allSlots = computeSlots(
    (data ?? []).map((r) => ({
      slotStart: r.slot_start as string,
      slotEnd: r.slot_end as string,
    })),
  );

  // Floor-plan honesty: if a party size is supplied, only return times that can
  // actually seat that party (no reject-at-submit). No floor plan → all slots.
  const partyParam = Number(req.nextUrl.searchParams.get("party"));
  if (Number.isFinite(partyParam) && partyParam >= 1) {
    const slots = await feasibleSlots(sb, {
      restaurantId,
      date: dateParam,
      party: partyParam,
      candidates: allSlots,
    });
    return NextResponse.json({ slots });
  }

  return NextResponse.json({ slots: allSlots });
}
