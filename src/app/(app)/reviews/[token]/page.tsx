import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ReviewSubmitForm } from "@/components/review-submit-form";

export const dynamic = "force-dynamic";

type Loaded =
  | {
      kind: "ready";
      restaurantName: string;
      guestName: string;
      reservationDate: string;
    }
  | { kind: "already_reviewed" }
  | { kind: "ineligible" }
  | { kind: "not_found" }
  | { kind: "config_missing" };

async function loadContext(token: string): Promise<Loaded> {
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
      "id, status, guest_name, reservation_date, restaurants(name), reviews(id)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) return { kind: "not_found" };
  if (data.status === "cancelled" || data.status === "no_show")
    return { kind: "ineligible" };

  const review = Array.isArray(data.reviews) ? data.reviews[0] : data.reviews;
  if (review?.id) return { kind: "already_reviewed" };

  const restaurantField = data.restaurants as
    | { name: string }
    | { name: string }[]
    | null;
  const restaurantName = Array.isArray(restaurantField)
    ? restaurantField[0]?.name ?? "restaurantul"
    : restaurantField?.name ?? "restaurantul";

  return {
    kind: "ready",
    restaurantName,
    guestName: data.guest_name,
    reservationDate: data.reservation_date,
  };
}

function parseRating(v: string | string[] | undefined): number {
  if (typeof v !== "string") return 0;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

export default async function ReviewSubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadContext(token);
  const initialRating = parseRating(sp.rating);

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
          Recenzie
        </p>

        {ctx.kind === "ready" && (
          <>
            <h1 className="font-display text-[28px] font-bold text-text-primary leading-tight mt-6">
              Cum a fost la {ctx.restaurantName}?
            </h1>
            <p className="text-sm text-text-secondary mt-2">
              Ai vizitat pe{" "}
              {new Date(`${ctx.reservationDate}T12:00:00`).toLocaleDateString(
                "ro-RO",
                { weekday: "long", day: "numeric", month: "long" },
              )}
              . Recenzia ta este anonimă — se afișează doar prenumele.
            </p>
            <div className="mt-6">
              <ReviewSubmitForm token={token} initialRating={initialRating} />
            </div>
          </>
        )}
        {ctx.kind === "already_reviewed" && (
          <Blank
            title="Recenzie deja lăsată"
            body="Ai lăsat deja o recenzie pentru această rezervare. Mulțumim încă o dată!"
          />
        )}
        {ctx.kind === "ineligible" && (
          <Blank
            title="Nu poți recenza această rezervare"
            body="Această rezervare a fost anulată sau marcată ca neonorată, deci nu este eligibilă pentru o recenzie."
          />
        )}
        {ctx.kind === "not_found" && (
          <Blank
            title="Link nerecunoscut"
            body="Acest link de recenzie nu a fost recunoscut. Poate fi scris greșit — încearcă să-l copiezi din nou din email."
          />
        )}
        {ctx.kind === "config_missing" && (
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
