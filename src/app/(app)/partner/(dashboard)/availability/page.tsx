import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  AvailabilityEditor,
  type AvailabilitySlot,
} from "@/components/partner/AvailabilityEditor";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import Link from "next/link";
import { interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

export default async function PartnerAvailabilityPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const m = getMessages(await resolveAppLocale(), "partner.settings").availability;

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">{m.noRestaurant}</p>
        </div>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("restaurant_availability")
    .select("id, day_of_week, slot_start, slot_end, capacity")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week")
    .order("slot_start");

  const slots: AvailabilitySlot[] = (rows ?? []).map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    slotStart: r.slot_start,
    slotEnd: r.slot_end,
    capacity: r.capacity,
  }));

  // Floor plan is the source of truth for capacity. Surface its seat count so
  // the per-slot covers number reads as a pacing ceiling, not a second source.
  const { data: tableRows } = await supabase
    .from("restaurant_tables")
    .select("capacity_max")
    .eq("restaurant_id", restaurantId)
    .is("archived_at", null)
    .eq("is_bookable_online", true);
  const floorSeats = (tableRows ?? []).reduce(
    (s, t) => s + ((t.capacity_max as number) ?? 0),
    0,
  );

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          {m.title}
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-xl">
          {m.subtitle}
        </p>
        {floorSeats > 0 && (
          <Link
            href="/partner/tables/live"
            className="mt-3 inline-flex items-center gap-1.5 rounded-button bg-surface-bg px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            {interpolate(m.floorCapacityNote, { seats: floorSeats })}
          </Link>
        )}
      </header>

      <AvailabilityEditor slots={slots} />
    </div>
  );
}
