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
    "id, guest_name, guest_phone, guest_email, party_size, reservation_date, reservation_time, zone, notes, status, created_at, table_id, combination_id, corporate_client_id";

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

  // Resolve table assignments to human labels: a single table shows its label
  // (e.g. "5"); a combination shows its member labels joined (e.g. "3+5").
  const rawRows = [...(futureRaw ?? []), ...(pastRaw ?? [])];
  const comboIds = [
    ...new Set(rawRows.map((r) => r.combination_id).filter(Boolean) as string[]),
  ];
  const [{ data: tableRows }, { data: comboRows }] = await Promise.all([
    supabase.from("restaurant_tables").select("id, label").eq("restaurant_id", restaurantId),
    comboIds.length
      ? supabase.from("table_combinations").select("id, table_ids").in("id", comboIds)
      : Promise.resolve({ data: [] as { id: string; table_ids: string[] }[] }),
  ]);
  const tableLabel = new Map((tableRows ?? []).map((t) => [t.id as string, t.label as string]));
  const comboLabel = new Map<string, string>();
  for (const c of comboRows ?? []) {
    const labels = ((c.table_ids as string[]) ?? [])
      .map((id) => tableLabel.get(id) ?? "?")
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    comboLabel.set(c.id as string, labels.join("+"));
  }
  const resolveTable = (r: { table_id: string | null; combination_id: string | null }): string | null =>
    r.combination_id
      ? comboLabel.get(r.combination_id) ?? null
      : r.table_id
        ? tableLabel.get(r.table_id) ?? null
        : null;

  const companyIds = [
    ...new Set(rawRows.map((r) => r.corporate_client_id).filter(Boolean) as string[]),
  ];
  const { data: companyRows } = companyIds.length
    ? await supabase.from("corporate_clients").select("id, name").in("id", companyIds)
    : { data: [] as { id: string; name: string }[] };
  const companyName = new Map((companyRows ?? []).map((c) => [c.id as string, c.name as string]));

  const mapRow = (r: NonNullable<typeof futureRaw>[number]): ReservationRow => ({
    id: r.id,
    guestName: r.guest_name,
    guestPhone: r.guest_phone,
    guestEmail: r.guest_email,
    partySize: r.party_size,
    reservationDate: r.reservation_date,
    reservationTime: r.reservation_time,
    zone: r.zone,
    table: resolveTable(r),
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    corporateClientName: r.corporate_client_id ? companyName.get(r.corporate_client_id) ?? null : null,
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
