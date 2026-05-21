import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  ReservationsList,
  type ReservationRow,
} from "@/components/partner/ReservationsList";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

export const dynamic = "force-dynamic";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PartnerReservationsPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  const { data: restaurant } = restaurantId
    ? await supabase
        .from("restaurants")
        .select("id")
        .eq("id", restaurantId)
        .maybeSingle()
    : { data: null };

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            Niciun restaurant asociat acestui cont.
          </p>
        </div>
      </div>
    );
  }

  const ymd = todayYmd();

  const { data: rowsRaw } = await supabase
    .from("reservations")
    .select(
      "id, guest_name, guest_phone, guest_email, party_size, reservation_date, reservation_time, zone, notes, status, created_at",
    )
    .eq("restaurant_id", restaurant.id)
    .order("reservation_date")
    .order("reservation_time")
    .limit(500);

  const rows: ReservationRow[] = (rowsRaw ?? []).map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    guestPhone: r.guest_phone,
    guestEmail: r.guest_email,
    partySize: r.party_size,
    reservationDate: r.reservation_date,
    reservationTime: r.reservation_time,
    zone: r.zone,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
  }));

  const today = rows.filter((r) => r.reservationDate === ymd);
  const upcoming = rows.filter((r) => r.reservationDate > ymd);
  const past = rows.filter((r) => r.reservationDate < ymd);

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Rezervări
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Confirmă clienții așezați la masă, marchează neprezentările sau
          anulează rezervări. Clienții primesc un email când anulezi.
        </p>
      </header>

      <ReservationsList today={today} upcoming={upcoming} past={past} />
    </div>
  );
}
