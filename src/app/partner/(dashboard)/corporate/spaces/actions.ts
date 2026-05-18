"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPrivateSpaces, restaurants } from "@/lib/db/schema";
import {
  createPrivateSpace,
  updatePrivateSpace,
  deactivatePrivateSpace,
} from "@/lib/repos/private-spaces-repo";

type Result = { ok: true } | { ok: false; error: string };

async function assertOwns(
  restaurantId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Unauthorised." };
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    return { ok: false, error: "Forbidden." };
  }
  const [r] = await dbAdmin
    .select({ owner: restaurants.ownerUserId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!r || r.owner !== session.userId) return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.userId };
}

const createSchema = z
  .object({
    restaurantId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    capacityMin: z.number().int().min(1).max(2000),
    capacityMax: z.number().int().min(1).max(2000),
    photoStoragePath: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.capacityMin <= d.capacityMax, {
    message: "capacityMin must be <= capacityMax",
    path: ["capacityMax"],
  });

export async function createSpaceAction(
  input: z.infer<typeof createSchema>,
): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;
  const auth = await assertOwns(data.restaurantId);
  if (!auth.ok) return auth;
  await createPrivateSpace({
    restaurantId: data.restaurantId,
    name: data.name,
    description: data.description ?? null,
    capacityMin: data.capacityMin,
    capacityMax: data.capacityMax,
    photoStoragePath: data.photoStoragePath ?? null,
  });
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    capacityMin: z.number().int().min(1).max(2000).optional(),
    capacityMax: z.number().int().min(1).max(2000).optional(),
    photoStoragePath: z.string().max(500).optional().nullable(),
  })
  .refine(
    (d) =>
      d.capacityMin === undefined ||
      d.capacityMax === undefined ||
      d.capacityMin <= d.capacityMax,
    {
      message: "capacityMin must be <= capacityMax",
      path: ["capacityMax"],
    },
  );

export async function updateSpaceAction(
  input: z.infer<typeof updateSchema>,
): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces)
    .where(eq(restaurantPrivateSpaces.id, data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Forbidden." };
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  const { id: _id, ...patch } = data;
  await updatePrivateSpace(data.id, patch);
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deactivateSpaceAction(
  input: z.infer<typeof deleteSchema>,
): Promise<Result> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces)
    .where(eq(restaurantPrivateSpaces.id, data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Forbidden." };
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  await deactivatePrivateSpace(data.id);
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}
