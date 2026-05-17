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
  if (input.capacityMin > input.capacityMax) {
    throw new Error("capacityMin must be <= capacityMax");
  }
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
  if (
    patch.capacityMin !== undefined &&
    patch.capacityMax !== undefined &&
    patch.capacityMin > patch.capacityMax
  ) {
    throw new Error("capacityMin must be <= capacityMax");
  }
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.description !== undefined) allowed.description = patch.description;
  if (patch.capacityMin !== undefined) allowed.capacityMin = patch.capacityMin;
  if (patch.capacityMax !== undefined) allowed.capacityMax = patch.capacityMax;
  if (patch.photoStoragePath !== undefined) allowed.photoStoragePath = patch.photoStoragePath;
  if (patch.sortOrder !== undefined) allowed.sortOrder = patch.sortOrder;
  const [row] = await dbAdmin
    .update(restaurantPrivateSpaces)
    .set(allowed)
    .where(eq(restaurantPrivateSpaces.id, id))
    .returning();
  if (!row) throw new Error(`private_space ${id} not found`);
  return row;
}

export async function deactivatePrivateSpace(id: string): Promise<void> {
  const rows = await dbAdmin
    .update(restaurantPrivateSpaces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(restaurantPrivateSpaces.id, id))
    .returning({ id: restaurantPrivateSpaces.id });
  if (rows.length === 0) throw new Error(`private_space ${id} not found`);
}
