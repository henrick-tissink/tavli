"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwns } from "../assert-owns";
import { insertStandingSeries, cancelStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "@/lib/standing/materialize";

type Result = { ok: true } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  restaurantId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_RE),
  partySize: z.number().int().min(1).max(50),
  intervalWeeks: z.union([z.literal(1), z.literal(2)]),
  tableId: z.string().uuid(),
  guestName: z.string().min(1).max(160),
  guestPhone: z.string().min(3).max(32), // reservations.guest_phone is varchar(32)
  guestEmail: z.string().email().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE).optional().nullable(),
}).refine((d) => !d.endDate || d.endDate >= d.startDate, { message: "endBeforeStart", path: ["endDate"] });

export async function createStandingAction(input: z.infer<typeof createSchema>): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid standing reservation." };
  const data = parsed.data;
  const auth = await assertOwns(data.restaurantId);
  if (!auth.ok) return auth;
  const series = await insertStandingSeries({
    restaurantId: data.restaurantId, dayOfWeek: data.dayOfWeek, startTime: data.startTime,
    partySize: data.partySize, intervalWeeks: data.intervalWeeks, tableId: data.tableId,
    guestName: data.guestName.trim(), guestPhone: data.guestPhone.trim(),
    guestEmail: data.guestEmail?.trim() || null, notes: data.notes?.trim() || null,
    startDate: data.startDate, endDate: data.endDate || null,
  });
  // Best-effort first horizon; the nightly job keeps it rolling.
  try {
    await materializeStanding(series.id);
  } catch (e) {
    console.error("[createStandingAction] initial materialize failed", e);
  }
  revalidatePath("/partner/corporate/standing");
  return { ok: true };
}

const cancelSchema = z.object({ id: z.string().uuid(), restaurantId: z.string().uuid() });

export async function cancelStandingAction(input: z.infer<typeof cancelSchema>): Promise<Result> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const auth = await assertOwns(parsed.data.restaurantId);
  if (!auth.ok) return auth;
  const today = new Date().toISOString().slice(0, 10);
  await cancelStandingSeries(parsed.data.id, parsed.data.restaurantId, today);
  revalidatePath("/partner/corporate/standing");
  return { ok: true };
}
