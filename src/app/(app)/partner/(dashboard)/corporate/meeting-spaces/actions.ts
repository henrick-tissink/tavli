"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces } from "@/lib/db/schema";
import {
  createMeetingSpace,
  updateMeetingSpace,
  deactivateMeetingSpace,
} from "@/lib/repos/meeting-spaces-repo";
import { assertOwns } from "../assert-owns";
import { getMessages, type PartnerCorporateMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

type Result = { ok: true } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hours-order refine gets a specific message; everything else is generic. */
function parseErrorMessage(m: PartnerCorporateMessages, error: z.ZodError): string {
  return error.issues.some((i) => i.message === "openTime must be before closeTime")
    ? m.meetingSpaces.hoursOrder
    : m.spaces.errors.invalidInput;
}

const fieldsSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  capacity: z.number().int().min(1).max(500),
  hourlyRateCents: z.number().int().min(0).max(100_000_00),
  amenities: z.array(z.string().min(1).max(60)).max(20).optional(),
  openTime: z.string().regex(TIME_RE),
  closeTime: z.string().regex(TIME_RE),
  minBookingMinutes: z.number().int().min(15).max(480),
  photoStoragePath: z.string().max(500).optional().nullable(),
});

const createSchema = fieldsSchema
  .extend({ restaurantId: z.string().uuid() })
  .refine((d) => d.openTime < d.closeTime, {
    message: "openTime must be before closeTime",
    path: ["closeTime"],
  });

export async function createMeetingSpaceAction(
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
  await createMeetingSpace({
    restaurantId: data.restaurantId,
    name: data.name,
    description: data.description ?? null,
    capacity: data.capacity,
    hourlyRateCents: data.hourlyRateCents,
    amenities: data.amenities ?? [],
    openTime: data.openTime,
    closeTime: data.closeTime,
    minBookingMinutes: data.minBookingMinutes,
    photoStoragePath: data.photoStoragePath ?? null,
  });
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}

const updateSchema = fieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (d) =>
      d.openTime === undefined ||
      d.closeTime === undefined ||
      d.openTime < d.closeTime,
    { message: "openTime must be before closeTime", path: ["closeTime"] },
  );

export async function updateMeetingSpaceAction(
  input: z.infer<typeof updateSchema>,
): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: parseErrorMessage(m, parsed.error) };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: meetingSpaces.restaurantId })
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  const { id: _id, ...patch } = data;
  await updateMeetingSpace(data.id, patch);
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deactivateMeetingSpaceAction(
  input: z.infer<typeof deleteSchema>,
): Promise<Result> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.invalidInput };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: meetingSpaces.restaurantId })
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  await deactivateMeetingSpace(data.id);
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}
