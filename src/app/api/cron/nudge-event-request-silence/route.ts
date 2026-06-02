import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql, eq } from "drizzle-orm";
import { eventRequests, restaurants } from "@/lib/db/schema";
import {
  sendEventRequestExpired,
  sendEventRequestNudge,
  type EventRequestLocale,
} from "@/lib/email/event-requests";
import { isLocale } from "@/lib/i18n/locale";
import { appOrigin } from "@/lib/app-origin";

export const dynamic = "force-dynamic";

type Occasion =
  | "wedding"
  | "birthday"
  | "corporate_dinner"
  | "product_launch"
  | "other";

interface ExpiredRow {
  id: string;
  restaurant_id: string;
  guest_email: string;
  guest_name: string;
  event_date: string;
  party_size: number;
  occasion: Occasion;
  tracking_token: string;
  locale: string;
}

interface NudgeRow {
  id: string;
  restaurant_id: string;
  guest_name: string;
  event_date: string;
  party_size: number;
  occasion: Occasion;
  tracking_token: string;
  locale: string;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. Expire day-21 rows in 'new' status (partner never moved).
  const expired = (await dbAdmin.execute(
    sql`UPDATE event_requests
        SET status = 'expired'
        WHERE status = 'new' AND created_at < NOW() - INTERVAL '21 days'
        RETURNING id, restaurant_id, guest_email, guest_name, event_date, party_size, occasion, tracking_token, locale`,
  )) as unknown as ExpiredRow[];

  for (const row of expired) {
    const [r] = await dbAdmin
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, row.restaurant_id))
      .limit(1);
    if (!r) continue;
    const locale: EventRequestLocale = isLocale(row.locale)
      ? (row.locale as EventRequestLocale)
      : "ro";
    try {
      await sendEventRequestExpired({
        locale,
        restaurantName: r.name,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        occasion: row.occasion,
        eventDate: row.event_date,
        partySize: row.party_size,
        trackingUrl: `${appOrigin()}/event-requests/${row.tracking_token}`,
      });
    } catch (err) {
      console.error("[nudge-event-request-silence] expired email failed", {
        id: row.id,
        err,
      });
    }
  }

  // 2. Nudge at day 3, 7, 14 — interpolate ageDays as raw SQL (not bound)
  // so Postgres doesn't try to cast a parameter inside an INTERVAL literal.
  let nudgesSent = 0;
  for (const ageDays of [3, 7, 14] as const) {
    const toNudge = (await dbAdmin.execute(
      sql`SELECT id, restaurant_id, guest_name, event_date, party_size, occasion, tracking_token, locale
          FROM event_requests
          WHERE status = 'new'
            AND created_at < NOW() - INTERVAL '${sql.raw(String(ageDays))} days'
            AND (last_nudge_at IS NULL OR last_nudge_at < NOW() - INTERVAL '3 days')`,
    )) as unknown as NudgeRow[];

    for (const row of toNudge) {
      const [r] = await dbAdmin
        .select({ name: restaurants.name, email: restaurants.email })
        .from(restaurants)
        .where(eq(restaurants.id, row.restaurant_id))
        .limit(1);
      if (r?.email) {
        const nudgeLocale: EventRequestLocale = isLocale(row.locale)
          ? (row.locale as EventRequestLocale)
          : "ro";
        try {
          await sendEventRequestNudge({
            locale: nudgeLocale,
            restaurantName: r.name,
            guestName: row.guest_name,
            occasion: row.occasion,
            eventDate: row.event_date,
            partySize: row.party_size,
            partnerEmail: r.email,
            trackingUrl: `${appOrigin()}/event-requests/${row.tracking_token}`,
            partnerInboxUrl: `${appOrigin()}/partner/corporate/events`,
            daysOpen: ageDays,
          });
          nudgesSent += 1;
        } catch (err) {
          console.error("[nudge-event-request-silence] nudge email failed", {
            id: row.id,
            err,
          });
        }
      }
      await dbAdmin
        .update(eventRequests)
        .set({ lastNudgeAt: new Date() })
        .where(eq(eventRequests.id, row.id));
    }
  }

  return NextResponse.json({
    ok: true,
    expired: expired.length,
    nudged: nudgesSent,
  });
}
