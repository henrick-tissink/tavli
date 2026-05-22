import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { PostVisitReviewEmail } from "@/emails/PostVisitReviewEmail";
import { appOrigin } from "@/lib/app-origin";

export const dynamic = "force-dynamic";

const POST_VISIT_DELAY_MS = 4 * 3600_000; // 4 hours
const MAX_AGE_DAYS = 14;

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "config_missing" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const maxAgeStr = new Date(now - MAX_AGE_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const { data: candidates, error } = await admin
    .from("reservations")
    .select(
      "id, confirmation_token, restaurant_id, guest_name, guest_email, reservation_date, reservation_time, diner_id, restaurants(name, organization_id)",
    )
    .eq("status", "confirmed")
    .is("post_visit_email_sent_at", null)
    .not("guest_email", "is", null)
    .lte("reservation_date", todayStr)
    .gte("reservation_date", maxAgeStr);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter rows whose slot moment was at least POST_VISIT_DELAY_MS ago.
  // Slots are interpreted as Europe/Bucharest local time (+02:00) for MVP;
  // ~1h DST drift is acceptable since the threshold is 4h.
  const cutoff = now - POST_VISIT_DELAY_MS;
  const eligible = (candidates ?? []).filter((r) => {
    const slotMs = new Date(
      `${r.reservation_date}T${r.reservation_time}+02:00`,
    ).getTime();
    return slotMs <= cutoff;
  });

  let sent = 0;
  for (const r of eligible) {
    const restaurantField = r.restaurants as
      | { name: string; organization_id: string | null }
      | { name: string; organization_id: string | null }[]
      | null;
    const restaurant = Array.isArray(restaurantField)
      ? restaurantField[0]
      : restaurantField;
    const restaurantName = restaurant?.name ?? "the restaurant";
    const organizationId = restaurant?.organization_id ?? undefined;

    const reviewBaseUrl = `${appOrigin()}/reviews/${r.confirmation_token}`;

    const subject = `Cum a fost la ${restaurantName}?`;
    const node = PostVisitReviewEmail({
      restaurantName,
      guestName: r.guest_name,
      reviewBaseUrl,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });

    const result = await sendTransactionalEmail({
      to: r.guest_email!,
      locale: "ro",
      templateKey: "review_request",
      subject,
      html,
      text,
      context: {
        reservation_id: r.id,
        restaurant_id: r.restaurant_id,
        organization_id: organizationId,
        diner_id: r.diner_id ?? undefined,
      },
    });

    if (result.ok) {
      await admin
        .from("reservations")
        .update({ post_visit_email_sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent += 1;
    } else {
      console.error("[post-visit-cron] send failed", {
        id: r.id,
        error: result.error,
      });
    }
  }

  return NextResponse.json({ ok: true, considered: eligible.length, sent });
}
