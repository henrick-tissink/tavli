import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ReservationConfirmed } from "@/components/reservation-confirmed";
import { resolvePhotoUrl } from "@/lib/storage";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locale";
import { MessagesProvider } from "@/lib/i18n/messages-provider";

export const dynamic = "force-dynamic";

type Result =
  | {
      kind: "confirmed";
      restaurantName: string;
      restaurantSlug: string;
      date: string;
      time: string;
      partySize: number;
      guestName: string;
      zone: string | null;
      status: string;
      photoUrl: string | null;
      heroNote: string | null;
      address: string;
      phone: string | null;
      lat: number | null;
      lng: number | null;
    }
  | { kind: "not_found" }
  | { kind: "already_cancelled" }
  | { kind: "completed" }
  | { kind: "config_missing" };

async function loadReservation(token: string): Promise<Result> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { kind: "config_missing" };
  }
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("reservations")
    .select(
      "id, restaurant_id, reservation_date, reservation_time, party_size, guest_name, zone, status, restaurants(name, slug, address, phone, lat, lng, hero_note)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) return { kind: "not_found" };
  if (data.status === "cancelled") return { kind: "already_cancelled" };
  if (data.status === "completed" || data.status === "no_show")
    return { kind: "completed" };

  const rest = Array.isArray(data.restaurants)
    ? (data.restaurants[0] as Record<string, unknown> | null)
    : (data.restaurants as Record<string, unknown> | null);

  const restaurantName = (rest?.name as string | undefined) ?? "restaurantul";
  const restaurantSlug = (rest?.slug as string | undefined) ?? "";
  const address = (rest?.address as string | undefined) ?? "";
  const phone = (rest?.phone as string | undefined) ?? null;
  const lat = rest?.lat != null ? Number(rest.lat) : null;
  const lng = rest?.lng != null ? Number(rest.lng) : null;
  const heroNote = (rest?.hero_note as string | undefined) ?? null;

  // Fetch hero photo via restaurant_photos table
  let photoUrl: string | null = null;
  if (data.restaurant_id) {
    const { data: photoRow } = await admin
      .from("restaurant_photos")
      .select("storage_path")
      .eq("restaurant_id", data.restaurant_id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    photoUrl = resolvePhotoUrl(photoRow?.storage_path ?? null);
  }

  return {
    kind: "confirmed",
    restaurantName,
    restaurantSlug,
    date: data.reservation_date,
    time: data.reservation_time,
    partySize: data.party_size,
    guestName: data.guest_name,
    zone: data.zone,
    status: data.status,
    photoUrl,
    heroNote,
    address,
    phone,
    lat,
    lng,
  };
}

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang: rawLang, token } = await params;
  const locale = isLocale(rawLang) ? rawLang : "ro";
  const m = getMessages(locale, "booking");
  const bundle = buildBundle(locale, ["ui", "common", "booking"]);
  const result = await loadReservation(token);

  if (result.kind === "confirmed") {
    return (
      <MessagesProvider locale={locale} bundle={bundle}>
        <ReservationConfirmed
          token={token}
          restaurantName={result.restaurantName}
          restaurantSlug={result.restaurantSlug}
          photoUrl={result.photoUrl ?? undefined}
          heroNote={result.heroNote ?? undefined}
          date={result.date}
          time={result.time}
          partySize={result.partySize}
          zone={result.zone}
          guestName={result.guestName}
          address={result.address}
          phone={result.phone ?? undefined}
          lat={result.lat}
          lng={result.lng}
        />
      </MessagesProvider>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 shadow-card">
        <Link
          href="/"
          className="font-display text-2xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          {m.tokenPage.reservationLabel}
        </p>

        {result.kind === "already_cancelled" && (
          <Blank
            title={m.tokenPage.alreadyCancelledTitle}
            body={m.tokenPage.alreadyCancelledBody}
            contactLabel={m.tokenPage.contactLabel}
          />
        )}
        {result.kind === "completed" && (
          <Blank
            title={m.tokenPage.completedTitle}
            body={m.tokenPage.completedBody}
            contactLabel={m.tokenPage.contactLabel}
          />
        )}
        {result.kind === "not_found" && (
          <Blank
            title={m.tokenPage.notFoundTitle}
            body={m.tokenPage.notFoundBody}
            contactLabel={m.tokenPage.contactLabel}
          />
        )}
        {result.kind === "config_missing" && (
          <Blank
            title={m.tokenPage.configMissingTitle}
            body={m.tokenPage.configMissingBody}
            contactLabel={m.tokenPage.contactLabel}
          />
        )}
      </div>
    </div>
  );
}

function Blank({ title, body, contactLabel }: { title: string; body: string; contactLabel: string }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-bold text-text-primary leading-tight mt-6">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        {contactLabel}{" "}
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
