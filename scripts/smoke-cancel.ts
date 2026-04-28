/**
 * Smoke-test the partner cancel-with-reason flow against prod by
 * mirroring `cancelReservation`'s effect via service-role.
 *
 * Args:
 *   --dry-run     — print what would happen, don't write or send
 *   --reason=KEY  — preset reason key (default: overbooked)
 *
 * Usage:
 *   npx tsx --env-file=.env.prod scripts/smoke-cancel.ts --dry-run
 *   npx tsx --env-file=.env.prod scripts/smoke-cancel.ts --reason=overbooked
 *
 * Picks the most recent `status='confirmed'` reservation across all
 * restaurants, cancels it, and sends the same PartnerCancelledEmail the
 * UI flow would.
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { CANCEL_REASONS, isCancelReasonKey } from "../src/lib/cancel-reasons";
import { PartnerCancelledEmail } from "../src/emails/PartnerCancelledEmail";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const reasonArg = process.argv.find((a) => a.startsWith("--reason="));
const reasonKey = reasonArg ? reasonArg.slice("--reason=".length) : "overbooked";

if (!isCancelReasonKey(reasonKey)) {
  console.error(`Unknown reason key '${reasonKey}'. Valid: ${Object.keys(CANCEL_REASONS).join(", ")}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey || !resendKey) {
    console.error(
      "Missing one of NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY.",
    );
    process.exit(1);
  }
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: reservations, error: listError } = await sb
    .from("reservations")
    .select(
      "id, status, guest_name, guest_email, reservation_date, reservation_time, party_size, created_at, restaurants!inner(name, email, slug, cities!inner(slug))",
    )
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (listError) {
    console.error("Failed to list reservations:", listError.message);
    process.exit(1);
  }
  if (!reservations || reservations.length === 0) {
    console.error("No confirmed reservations found on prod. Make a booking first.");
    process.exit(1);
  }

  const r = reservations[0] as unknown as {
    id: string;
    guest_name: string;
    guest_email: string | null;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    restaurants:
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }[];
  };

  const restField = r.restaurants;
  const restaurant = Array.isArray(restField) ? restField[0] : restField;
  const citiesField = restaurant.cities;
  const city = Array.isArray(citiesField) ? citiesField[0] : citiesField;

  console.log("Found most recent confirmed reservation:");
  console.log(`  id:        ${r.id}`);
  console.log(`  guest:     ${r.guest_name} <${r.guest_email ?? "(no email)"}>`);
  console.log(`  when:      ${r.reservation_date} ${r.reservation_time}`);
  console.log(`  party:     ${r.party_size}`);
  console.log(`  restaurant: ${restaurant.name} (${city.slug}/${restaurant.slug})`);
  console.log(`  reason:    ${reasonKey} → "${CANCEL_REASONS[reasonKey as keyof typeof CANCEL_REASONS].guestMessage}"`);

  if (dryRun) {
    console.log("\n[dry-run] No DB write, no email sent.");
    return;
  }

  const { error: updateError } = await sb
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reasonKey,
    })
    .eq("id", r.id);
  if (updateError) {
    console.error("DB update failed:", updateError.message);
    process.exit(1);
  }
  console.log("\n✓ DB updated: status=cancelled, cancelled_reason=" + reasonKey);

  if (!r.guest_email) {
    console.log("Guest has no email on file — skipping email send.");
    return;
  }

  const resend = new Resend(resendKey);
  const from = process.env.EMAIL_FROM ?? "Tavli <hello@tavli.ro>";
  const { error: sendError } = await resend.emails.send({
    from,
    to: r.guest_email,
    replyTo: restaurant.email ?? undefined,
    subject: `Reservation cancelled at ${restaurant.name}`,
    react: PartnerCancelledEmail({
      restaurantName: restaurant.name,
      restaurantCitySlug: city.slug,
      restaurantSlug: restaurant.slug,
      reservationDate: r.reservation_date,
      reservationTime: r.reservation_time.slice(0, 5),
      partySize: r.party_size,
      guestName: r.guest_name,
      guestMessage: CANCEL_REASONS[reasonKey as keyof typeof CANCEL_REASONS].guestMessage,
    }),
  });
  if (sendError) {
    console.error("Email send failed:", sendError.message);
    process.exit(1);
  }
  console.log("✓ Email sent to " + r.guest_email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
