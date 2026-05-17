import { dbAdmin } from "@/lib/db/admin";
import { partnerNotifications } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type Notification = typeof partnerNotifications.$inferSelect;

export async function insertNotification(input: {
  restaurantId: string;
  kind: string;
  payload?: Record<string, unknown>;
}): Promise<Notification> {
  const [row] = await dbAdmin.insert(partnerNotifications).values({
    restaurantId: input.restaurantId,
    kind: input.kind,
    payload: input.payload ?? {},
  }).returning();
  return row;
}

export async function listForRestaurant(restaurantId: string, limit = 20): Promise<Notification[]> {
  return dbAdmin.select().from(partnerNotifications)
    .where(eq(partnerNotifications.restaurantId, restaurantId))
    .orderBy(sql`${partnerNotifications.createdAt} DESC`)
    .limit(limit);
}

export async function unreadCount(restaurantId: string): Promise<number> {
  const result = await dbAdmin.execute(
    sql`SELECT COUNT(*)::int AS count FROM partner_notifications WHERE restaurant_id = ${restaurantId} AND read_at IS NULL`,
  );
  const row = (result as unknown as Array<{ count: number }>)[0];
  return row?.count ?? 0;
}

export async function markAllRead(restaurantId: string): Promise<void> {
  await dbAdmin.update(partnerNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(partnerNotifications.restaurantId, restaurantId), isNull(partnerNotifications.readAt)));
}
