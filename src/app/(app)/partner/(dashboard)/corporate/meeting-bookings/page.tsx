import { notFound } from "next/navigation";
import Link from "next/link";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import {
  listBookingsForRestaurant,
} from "@/lib/repos/meeting-space-bookings-repo";
import type { MeetingBookingStatus } from "@/lib/meeting-spaces/status";
import { MeetingBookingsList } from "./MeetingBookingsList";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

const STATUS_GROUPS: Record<string, MeetingBookingStatus[]> = {
  pending: ["requested"],
  confirmed: ["confirmed"],
  history: ["declined", "cancelled", "completed"],
  all: [],
};

export default async function MeetingBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const r = await getPartnerRestaurant();
  const sp = await searchParams;
  const activeKey = sp.status && sp.status in STATUS_GROUPS ? sp.status : "pending";
  const m = getMessages(await resolveAppLocale(), "partner.corporate");

  const all = await listBookingsForRestaurant(r.id, []);
  if (!r.acceptsMeetingSpaces && all.length === 0) notFound();

  const group = STATUS_GROUPS[activeKey] ?? STATUS_GROUPS.pending;
  const rows =
    group.length === 0 ? all : all.filter((b) => group.includes(b.status));

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{m.meetingBookings.title}</h1>
      <p className="text-sm text-text-secondary mt-1 mb-4">{m.meetingBookings.subtitle}</p>
      <nav className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(STATUS_GROUPS) as Array<keyof typeof STATUS_GROUPS>).map((key) => (
          <Link
            key={key}
            href={`/partner/corporate/meeting-bookings?status=${key}`}
            className={`rounded-pill border px-3 py-1 text-sm font-semibold ${
              key === activeKey
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
            }`}
          >
            {m.meetingBookings.filters[key as keyof typeof m.meetingBookings.filters]}
          </Link>
        ))}
      </nav>
      <MeetingBookingsList rows={rows} />
    </main>
  );
}
