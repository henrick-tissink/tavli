import { dbAdmin } from "@/lib/db/admin";
import { restaurantPrivateSpaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

type Space = typeof restaurantPrivateSpaces.$inferSelect;

export interface CreateSpaceInput {
  restaurantId: string;
  name: string;
  description?: string | null;
  capacityMin: number;
  capacityMax: number;
  photoStoragePath?: string | null;
  sortOrder?: number;
}

export async function createPrivateSpace(input: CreateSpaceInput): Promise<Space> {
  const [row] = await dbAdmin.insert(restaurantPrivateSpaces).values({
    restaurantId: input.restaurantId,
    name: input.name,
    description: input.description ?? null,
    capacityMin: input.capacityMin,
    capacityMax: input.capacityMax,
    photoStoragePath: input.photoStoragePath ?? null,
    sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function listActiveSpacesForVenue(restaurantId: string): Promise<Space[]> {
  return dbAdmin
    .select()
    .from(restaurantPrivateSpaces)
    .where(and(
      eq(restaurantPrivateSpaces.restaurantId, restaurantId),
      eq(restaurantPrivateSpaces.isActive, true),
    ))
    .orderBy(asc(restaurantPrivateSpaces.sortOrder), asc(restaurantPrivateSpaces.capacityMin));
}

export async function updatePrivateSpace(
  id: string,
  patch: Partial<Pick<Space, "name" | "description" | "capacityMin" | "capacityMax" | "photoStoragePath" | "sortOrder">>,
): Promise<Space> {
  const [row] = await dbAdmin
    .update(restaurantPrivateSpaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(restaurantPrivateSpaces.id, id))
    .returning();
  return row;
}

export async function deactivatePrivateSpace(id: string): Promise<void> {
  await dbAdmin
    .update(restaurantPrivateSpaces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(restaurantPrivateSpaces.id, id));
}
