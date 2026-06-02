import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ModifyReservationForm } from "@/components/modify-reservation-form";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locale";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

const MODIFY_CUTOFF_MS = 24 * 60 * 60 * 1000;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      {children}
    </main>
  );
}

export default async function ModifyReservationPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang: rawLang, token } = await params;
  const locale = isLocale(rawLang) ? rawLang : "ro";
  const m = getMessages(locale, "booking");
  const bundle = buildBundle(locale, ["common", "booking"]);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-6">{m.modify.pageTitle}</h1>
        <div className="rounded-card border border-border bg-surface-white p-6">
          <p className="text-text-secondary">{m.modify.configMissing}</p>
        </div>
      </Shell>
    );
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("reservations")
    .select("id, reservation_date, reservation_time, party_size, status, version, restaurants(name, phone, email)")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-text-primary mb-6">{m.modify.pageTitle}</h1>
        <div className="rounded-card border border-border bg-surface-white p-6">
          <p className="text-text-secondary">{m.modify.notFound}</p>
        </div>
      </Shell>
    );
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
        <h1 className="font-display text-2xl font-bold text-text-primary mb-6">{m.modify.pageTitle}</h1>
        <div className="rounded-card border border-border bg-surface-white p-6">
          <p className="text-text-secondary mb-4">
            {m.modify.windowClosedBody}
          </p>
          <div className="flex flex-col gap-2">
            {rest?.phone && (
              <a className="text-brand-primary font-semibold" href={`tel:${rest.phone}`}>
                {interpolate(m.modify.callLink, { restaurantName })}
              </a>
            )}
            {rest?.email && (
              <a className="text-brand-primary font-semibold" href={`mailto:${rest.email}`}>
                {interpolate(m.modify.emailLink, { restaurantName })}
              </a>
            )}
            <Link className="text-text-muted text-sm mt-2" href={`/reservations/${token}`}>
              {m.modify.backLink}
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">{m.modify.pageTitle}</h1>
      <div className="rounded-card border border-border bg-surface-white p-6">
        <MessagesProvider locale={locale} bundle={bundle}>
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
        </MessagesProvider>
      </div>
    </Shell>
  );
}
