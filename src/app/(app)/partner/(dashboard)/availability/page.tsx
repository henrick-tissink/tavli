import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  AvailabilityEditor,
  type AvailabilitySlot,
} from "@/components/partner/AvailabilityEditor";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

export default async function PartnerAvailabilityPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">Niciun restaurant asociat.</p>
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

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Disponibilitate
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-xl">
          Definește câți clienți poți primi pe interval orar, pentru fiecare
          zi. Clienții pot rezerva doar la orele configurate aici —
          intervalele neconfigurate apar ca &ldquo;complet rezervat&rdquo;.
        </p>
      </header>

      <AvailabilityEditor slots={slots} />
    </div>
  );
}
