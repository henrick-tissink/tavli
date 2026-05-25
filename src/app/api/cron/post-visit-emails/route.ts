import { NextResponse } from "next/server";
import { sendPostVisitReviews } from "@/lib/reservations/jobs/send-post-visit-reviews";

export const dynamic = "force-dynamic";

/**
 * §06 / build-order §9 step 6 — the post-visit review sweep now lives in the
 * pg-boss worker (`reservation.send-post-visit-review-request`, venue-tz-correct).
 * This route is a thin, CRON_SECRET-guarded delegate so any external scheduler
 * still configured against it keeps working; both paths run the same handler.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "config_missing" }, { status: 500 });
  }
  const { sent } = await sendPostVisitReviews();
  return NextResponse.json({ ok: true, sent });
}
