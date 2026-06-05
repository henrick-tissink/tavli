import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  ReservationsList,
  type ReservationRow,
} from "@/components/partner/ReservationsList";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PartnerReservationsPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.reservations");

  const restaurantId = await currentUserPrimaryRestaurant(session!);
  if (!restaurantId) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            {m.page.noRestaurant}
          </p>
        </div>
      </div>
    );
  }

  const ymd = todayYmd();

  const cols =
    "id, guest_name, guest_phone, guest_email, party_size, reservation_date, reservation_time, zone, notes, status, created_at";

  // Fetch today/upcoming and recent past as separate bounded queries. A single
  // ordered+limited query starves the operationally-important upcoming rows:
  // with a long booking history the limit fills entirely with past dates and
  // the future never loads (the screen looks empty even though bookings exist).
  const [{ data: futureRaw }, { data: pastRaw }] = await Promise.all([
    supabase
      .from("reservations")
      .select(cols)
      .eq("restaurant_id", restaurantId)
      .gte("reservation_date", ymd)
      .order("reservation_date")
      .order("reservation_time")
      .limit(500),
    supabase
      .from("reservations")
      .select(cols)
      .eq("restaurant_id", restaurantId)
      .lt("reservation_date", ymd)
      .order("reservation_date", { ascending: false })
      .order("reservation_time", { ascending: false })
      .limit(200),
  ]);

  const mapRow = (r: NonNullable<typeof futureRaw>[number]): ReservationRow => ({
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
  });

  const future = (futureRaw ?? []).map(mapRow);
  const today = future.filter((r) => r.reservationDate === ymd);
  const upcoming = future.filter((r) => r.reservationDate > ymd);
  const past = (pastRaw ?? []).map(mapRow);

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          {m.page.title}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {m.page.subtitle}
        </p>
      </header>

      <ReservationsList today={today} upcoming={upcoming} past={past} />
    </div>
  );
}
