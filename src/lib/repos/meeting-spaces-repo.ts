import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

type MeetingSpace = typeof meetingSpaces.$inferSelect;

export interface CreateMeetingSpaceInput {
  restaurantId: string;
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities?: string[];
  openTime: string; // "HH:MM"
  closeTime: string; // "HH:MM"
  minBookingMinutes?: number;
  photoStoragePath?: string | null;
  sortOrder?: number;
}

export async function createMeetingSpace(input: CreateMeetingSpaceInput): Promise<MeetingSpace> {
  const [row] = await dbAdmin
    .insert(meetingSpaces)
    .values({
      restaurantId: input.restaurantId,
      name: input.name,
      description: input.description ?? null,
      capacity: input.capacity,
      hourlyRateCents: input.hourlyRateCents,
      amenities: input.amenities ?? [],
      openTime: input.openTime,
      closeTime: input.closeTime,
      minBookingMinutes: input.minBookingMinutes ?? 60,
      photoStoragePath: input.photoStoragePath ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function listActiveMeetingSpaces(restaurantId: string): Promise<MeetingSpace[]> {
  return dbAdmin
    .select()
    .from(meetingSpaces)
    .where(and(eq(meetingSpaces.restaurantId, restaurantId), eq(meetingSpaces.isActive, true)))
    .orderBy(asc(meetingSpaces.sortOrder), asc(meetingSpaces.name));
}

export async function updateMeetingSpace(
  id: string,
  patch: Partial<
    Pick<
      MeetingSpace,
      | "name"
      | "description"
      | "capacity"
      | "hourlyRateCents"
      | "amenities"
      | "openTime"
      | "closeTime"
      | "minBookingMinutes"
      | "photoStoragePath"
      | "sortOrder"
    >
  >,
): Promise<MeetingSpace> {
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.description !== undefined) allowed.description = patch.description;
  if (patch.capacity !== undefined) allowed.capacity = patch.capacity;
  if (patch.hourlyRateCents !== undefined) allowed.hourlyRateCents = patch.hourlyRateCents;
  if (patch.amenities !== undefined) allowed.amenities = patch.amenities;
  if (patch.openTime !== undefined) allowed.openTime = patch.openTime;
  if (patch.closeTime !== undefined) allowed.closeTime = patch.closeTime;
  if (patch.minBookingMinutes !== undefined) allowed.minBookingMinutes = patch.minBookingMinutes;
  if (patch.photoStoragePath !== undefined) allowed.photoStoragePath = patch.photoStoragePath;
  if (patch.sortOrder !== undefined) allowed.sortOrder = patch.sortOrder;
  const [row] = await dbAdmin
    .update(meetingSpaces)
    .set(allowed)
    .where(eq(meetingSpaces.id, id))
    .returning();
  if (!row) throw new Error(`meeting_space ${id} not found`);
  return row;
}

export async function deactivateMeetingSpace(id: string): Promise<void> {
  const rows = await dbAdmin
    .update(meetingSpaces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(meetingSpaces.id, id))
    .returning({ id: meetingSpaces.id });
  if (rows.length === 0) throw new Error(`meeting_space ${id} not found`);
}
