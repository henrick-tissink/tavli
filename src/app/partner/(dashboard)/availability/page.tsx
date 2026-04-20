import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  AvailabilityEditor,
  type AvailabilitySlot,
} from "@/components/partner/AvailabilityEditor";

export const dynamic = "force-dynamic";

export default async function PartnerAvailabilityPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-8 py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">No restaurant linked.</p>
        </div>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("restaurant_availability")
    .select("id, day_of_week, slot_start, slot_end, capacity")
    .eq("restaurant_id", restaurant.id)
    .order("day_of_week")
    .order("slot_start");

  const slots: AvailabilitySlot[] = (rows ?? []).map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    slotStart: r.slot_start,
    slotEnd: r.slot_end,
    capacity: r.capacity,
  }));

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Availability
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-xl">
          Define how many covers you can take per time slot per day. Diners
          can only book times you&apos;ve configured here — unconfigured
          slots return &ldquo;fully booked&rdquo;.
        </p>
      </header>

      <AvailabilityEditor slots={slots} />
    </div>
  );
}
