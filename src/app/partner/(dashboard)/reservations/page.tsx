import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  ReservationsList,
  type ReservationRow,
} from "@/components/partner/ReservationsList";

export const dynamic = "force-dynamic";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PartnerReservationsPage() {
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
          <p className="font-semibold text-text-primary">
            No restaurant linked to this account.
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
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Reservations
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Confirm seated, mark no-shows, or cancel bookings. Consumers get an
          email when you cancel.
        </p>
      </header>

      <ReservationsList today={today} upcoming={upcoming} past={past} />
    </div>
  );
}
