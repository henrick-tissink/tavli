import { dbAdmin } from "@/lib/db/admin";
import { availabilityExceptions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

type Exception = typeof availabilityExceptions.$inferSelect;

export async function listExceptionsForDate(restaurantId: string, date: string): Promise<Exception[]> {
  return dbAdmin.select().from(availabilityExceptions).where(and(
    eq(availabilityExceptions.restaurantId, restaurantId),
    eq(availabilityExceptions.exceptionDate, date),
  ));
}

export async function insertWholeVenueBlock(input: {
  restaurantId: string;
  exceptionDate: string;
  slotStart?: string;
  slotEnd?: string;
  reason?: string;
  sourceEventRequestId?: string;
}): Promise<Exception> {
  const [row] = await dbAdmin.insert(availabilityExceptions).values({
    restaurantId: input.restaurantId,
    exceptionDate: input.exceptionDate,
    slotStart: input.slotStart ?? null,
    slotEnd: input.slotEnd ?? null,
    overrideCapacity: 0,
    reason: input.reason ?? null,
    sourceEventRequestId: input.sourceEventRequestId ?? null,
  }).returning();
  return row;
}
