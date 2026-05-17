import { NextResponse } from "next/server";
import { dbAdmin } from "@/lib/db/admin";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = (await dbAdmin.execute(
    sql`DELETE FROM event_requests WHERE status = 'draft' AND created_at < NOW() - INTERVAL '30 minutes' RETURNING id`,
  )) as unknown as Array<{ id: string }>;
  return NextResponse.json({ ok: true, deleted: result.length });
}
