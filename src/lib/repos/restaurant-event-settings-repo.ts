import { dbAdmin } from "@/lib/db/admin";
import { restaurantEventSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Settings = typeof restaurantEventSettings.$inferSelect;

export async function getEventSettings(restaurantId: string): Promise<Settings | null> {
  const rows = await dbAdmin.select().from(restaurantEventSettings)
    .where(eq(restaurantEventSettings.restaurantId, restaurantId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertEventSettings(restaurantId: string, patch: Partial<Omit<Settings, "restaurantId" | "createdAt" | "updatedAt">>): Promise<Settings> {
  const [row] = await dbAdmin.insert(restaurantEventSettings)
    .values({ restaurantId, ...patch })
    .onConflictDoUpdate({
      target: restaurantEventSettings.restaurantId,
      set: patch,
    })
    .returning();
  return row;
}
