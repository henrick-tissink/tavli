"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPrivateSpaces } from "@/lib/db/schema";
import {
  createPrivateSpace,
  updatePrivateSpace,
  deactivatePrivateSpace,
} from "@/lib/repos/private-spaces-repo";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getMessages, type PartnerCorporateMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Map a Zod parse failure to a localized message: the capacity-order refine gets
 * its own specific message; everything else falls back to a generic one. (The
 * client validates these inline too, so this is a backstop.)
 */
function parseErrorMessage(
  m: PartnerCorporateMessages,
  error: z.ZodError,
): string {
  return error.issues.some((i) => i.message === "capacityMin must be <= capacityMax")
    ? m.spaces.errors.capacityOrder
    : m.spaces.errors.invalidInput;
}

async function assertOwns(
  restaurantId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: m.spaces.errors.unauthorised };
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  // Admins pass through (legacy behaviour from owner_user_id era was an
  // exact ownership match, so this branch keeps the same surface). The
  // restaurant_owner branch must hit the helper to confirm the venue
  // belongs to them per §3.6 sub-unit B.
  if (session.profile.role === "admin") return { ok: true, userId: session.userId };
  const primary = await currentUserPrimaryRestaurant(session);
  if (!primary || primary !== restaurantId) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
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
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: parseErrorMessage(m, parsed.error) };
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
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: parseErrorMessage(m, parsed.error) };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces)
    .where(eq(restaurantPrivateSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
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
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.invalidInput };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces)
    .where(eq(restaurantPrivateSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  await deactivatePrivateSpace(data.id);
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}
