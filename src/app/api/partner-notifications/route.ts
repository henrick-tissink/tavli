import { NextResponse } from "next/server";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import {
  unreadCount,
  listForRestaurant,
  markAllRead,
} from "@/lib/repos/partner-notifications-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await getPartnerRestaurant();
  const count = await unreadCount(r.id);
  const items = await listForRestaurant(r.id, 10);
  return NextResponse.json({ count, items });
}

export async function POST() {
  const r = await getPartnerRestaurant();
  await markAllRead(r.id);
  return NextResponse.json({ ok: true });
}
