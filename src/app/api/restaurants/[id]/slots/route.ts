/**
 * Public read-only endpoint: bookable slot times for a venue on a given date.
 *
 * GET /api/restaurants/[id]/slots?date=YYYY-MM-DD
 *  → { slots: ["12:00", "12:30", ...] }
 *
 * Date semantics: dayOfWeek (0=Sun..6=Sat) is derived from the requested date.
 * Past slots are filtered out when the date is today (local time on the server).
 * Capacity is NOT subtracted in this v1 — full-house at booking time still
 * surfaces as a slot here. Mirrors `fetchTodaySlots` in restaurants-repo.
 *
 * Powers `ReservationSheetV2` — when the user picks a date in step 1, step 3
 * fetches the slot list that actually corresponds to that date instead of
 * showing the static "today" list regardless of selection.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { computeSlots } from "@/lib/availability";

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

  // Filter past slots when the requested date is today (local time).
  const now = new Date();
  const todayIso = isoLocalDate(now);
  if (dateParam === todayIso) {
    const cutoff = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    return NextResponse.json({ slots: allSlots.filter((s) => s > cutoff) });
  }

  return NextResponse.json({ slots: allSlots });
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
