import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ReservationCancelForm } from "@/components/reservation-cancel-form";

export const dynamic = "force-dynamic";

type Result =
  | {
      kind: "valid";
      restaurantName: string;
      date: string;
      time: string;
      partySize: number;
      guestName: string;
      zone: string | null;
      status: string;
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
      "reservation_date, reservation_time, party_size, guest_name, zone, status, restaurants(name)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) return { kind: "not_found" };
  if (data.status === "cancelled") return { kind: "already_cancelled" };
  if (data.status === "completed" || data.status === "no_show")
    return { kind: "completed" };

  const restaurantName = Array.isArray(data.restaurants)
    ? data.restaurants[0]?.name
    : (data.restaurants as unknown as { name: string } | null)?.name;

  return {
    kind: "valid",
    restaurantName: restaurantName ?? "restaurantul",
    date: data.reservation_date,
    time: data.reservation_time,
    partySize: data.party_size,
    guestName: data.guest_name,
    zone: data.zone,
    status: data.status,
  };
}

export default async function ReservationCancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadReservation(token);

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
          Rezervare
        </p>

        {result.kind === "valid" && (
          <>
            <h1 className="font-display text-[28px] font-bold text-text-primary leading-tight mt-6">
              Anulezi rezervarea?
            </h1>
            <div className="mt-5 rounded-lg bg-surface-bg p-4 text-sm">
              <p className="font-semibold text-text-primary">
                {result.restaurantName}
              </p>
              <p className="text-text-secondary mt-1">
                {new Date(`${result.date}T12:00:00`).toLocaleDateString(
                  "ro-RO",
                  { weekday: "long", day: "numeric", month: "long" },
                )}{" "}
                · {result.time.slice(0, 5)} · {result.partySize}{" "}
                {result.partySize === 1 ? "persoană" : "persoane"}
              </p>
              <p className="text-text-secondary">{result.guestName}</p>
              {result.zone && (
                <p className="text-text-muted text-xs mt-1">Loc: {result.zone}</p>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-4 leading-relaxed">
              Anularea eliberează masa pentru altcineva. Vei primi un email de
              confirmare.
            </p>
            <div className="mt-5">
              <ReservationCancelForm
                token={token}
                restaurantName={result.restaurantName}
              />
            </div>
          </>
        )}

        {result.kind === "already_cancelled" && (
          <Blank
            title="Deja anulată"
            body="Această rezervare a fost deja anulată. Nu mai e nimic de făcut aici."
          />
        )}
        {result.kind === "completed" && (
          <Blank
            title="Nu mai poate fi anulată"
            body="Această rezervare a trecut deja. Sperăm că a fost o seară frumoasă."
          />
        )}
        {result.kind === "not_found" && (
          <Blank
            title="Rezervarea nu a fost găsită"
            body="Linkul de anulare nu a fost recunoscut. Poate fi scris greșit — încearcă să-l copiezi din nou din email."
          />
        )}
        {result.kind === "config_missing" && (
          <Blank
            title="Platformă neconfigurată"
            body="Tavli încă se configurează. Te rugăm să încerci mai târziu sau să contactezi suportul."
          />
        )}
      </div>
    </div>
  );
}

function Blank({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-bold text-text-primary leading-tight mt-6">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        Contact:{" "}
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
