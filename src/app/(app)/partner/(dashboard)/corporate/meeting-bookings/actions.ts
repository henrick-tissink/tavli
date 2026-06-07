"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaceBookings } from "@/lib/db/schema";
import { transitionMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { assertOwns } from "../assert-owns";
import { getMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

type Result = { ok: true } | { ok: false; error: string };

const transitionSchema = z.object({
  id: z.string().uuid(),
  // requested → confirmed | declined; confirmed → cancelled | completed.
  // The repo enforces the actual table; this enum just bounds the surface.
  to: z.enum(["confirmed", "declined", "cancelled", "completed"]),
});

export async function transitionMeetingBookingAction(
  input: z.infer<typeof transitionSchema>,
): Promise<Result> {
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: m.spaces.errors.invalidInput };
  const data = parsed.data;

  const [booking] = await dbAdmin
    .select({ restaurantId: meetingSpaceBookings.restaurantId })
    .from(meetingSpaceBookings)
    .where(eq(meetingSpaceBookings.id, data.id))
    .limit(1);
  if (!booking) return { ok: false, error: m.meetingBookings.errors.notFound };

  const auth = await assertOwns(booking.restaurantId);
  if (!auth.ok) return auth;

  try {
    await transitionMeetingBooking(data.id, data.to);
  } catch (e) {
    const code =
      (e as { code?: string })?.code ??
      ((e as { cause?: { code?: string } })?.cause?.code);
    if (code === "TV004" || code === "TV005") {
      return { ok: false, error: m.meetingBookings.errors.slotConflict };
    }
    if (e instanceof Error && /invalid transition|not found/.test(e.message)) {
      return { ok: false, error: m.meetingBookings.errors.invalidTransition };
    }
    throw e;
  }
  revalidatePath("/partner/corporate/meeting-bookings");
  revalidatePath("/partner/corporate");
  return { ok: true };
}
