import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ModifyReservationForm } from "@/components/modify-reservation-form";

export const dynamic = "force-dynamic";

const MODIFY_CUTOFF_MS = 24 * 60 * 60 * 1000;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">Modifică rezervarea</h1>
      <div className="rounded-card border border-border bg-surface-white p-6">{children}</div>
    </main>
  );
}

export default async function ModifyReservationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return <Shell><p className="text-text-secondary">Platforma nu este configurată.</p></Shell>;
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("reservations")
    .select("id, reservation_date, reservation_time, party_size, status, version, restaurants(name, phone, email)")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) {
    return <Shell><p className="text-text-secondary">Rezervarea nu a fost găsită.</p></Shell>;
  }
  const rest = (Array.isArray(data.restaurants) ? data.restaurants[0] : data.restaurants) as
    | { name: string; phone: string | null; email: string | null }
    | null;
  const restaurantName = rest?.name ?? "restaurant";

  // UX gate (the action re-checks authoritatively in the venue timezone): only a
  // confirmed booking more than 24h out can be modified online.
  const slotMs = new Date(`${data.reservation_date}T${data.reservation_time}`).getTime();
  // force-dynamic server page; the clock read is intentional and the action re-checks authoritatively.
  // eslint-disable-next-line react-hooks/purity
  const canModify = data.status === "confirmed" && slotMs - Date.now() > MODIFY_CUTOFF_MS;

  if (!canModify) {
    return (
      <Shell>
        <p className="text-text-secondary mb-4">
          Această rezervare nu mai poate fi modificată online (cu mai puțin de 24h înainte sau deja finalizată). Contactează direct restaurantul.
        </p>
        <div className="flex flex-col gap-2">
          {rest?.phone && <a className="text-brand-primary font-semibold" href={`tel:${rest.phone}`}>Sună {restaurantName}</a>}
          {rest?.email && <a className="text-brand-primary font-semibold" href={`mailto:${rest.email}`}>Scrie {restaurantName}</a>}
          <Link className="text-text-muted text-sm mt-2" href={`/reservations/${token}`}>Înapoi la rezervare</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ModifyReservationForm
        token={token}
        restaurantName={restaurantName}
        initial={{
          date: data.reservation_date,
          time: String(data.reservation_time).slice(0, 5),
          partySize: data.party_size,
          version: data.version ?? 0,
        }}
      />
    </Shell>
  );
}
