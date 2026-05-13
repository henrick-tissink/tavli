import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql, eq } from "drizzle-orm";
import { restaurants } from "@/lib/db/schema";
import { sendEventRequestExpired } from "@/lib/email/event-requests";
import { appOrigin } from "@/lib/app-origin";

export const dynamic = "force-dynamic";

interface ExpiredRow {
  id: string;
  restaurant_id: string;
  guest_email: string;
  guest_name: string;
  event_date: string;
  party_size: number;
  occasion:
    | "wedding"
    | "birthday"
    | "corporate_dinner"
    | "product_launch"
    | "other";
  tracking_token: string;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expired = (await dbAdmin.execute(
    sql`UPDATE event_requests
        SET status = 'expired_quote'
        WHERE status = 'quoted' AND quote_expires_at < NOW()
        RETURNING id, restaurant_id, guest_email, guest_name, event_date, party_size, occasion, tracking_token`,
  )) as unknown as ExpiredRow[];

  for (const row of expired) {
    const [r] = await dbAdmin
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, row.restaurant_id))
      .limit(1);
    if (!r) continue;
    try {
      await sendEventRequestExpired({
        locale: "ro",
        restaurantName: r.name,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        occasion: row.occasion,
        eventDate: row.event_date,
        partySize: row.party_size,
        trackingUrl: `${appOrigin()}/event-requests/${row.tracking_token}`,
      });
    } catch (err) {
      console.error("[expire-event-request-quotes] email failed", {
        id: row.id,
        err,
      });
    }
  }

  return NextResponse.json({ ok: true, expired: expired.length });
}
