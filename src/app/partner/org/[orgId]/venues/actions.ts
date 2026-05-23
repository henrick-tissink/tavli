"use server";

import { revalidatePath } from "next/cache";
import { venueActions } from "@/lib/multi-location/venue-actions";
import type { AddVenueInput } from "@/lib/multi-location/venue-actions";

async function toResult<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function addVenueToOrgAction(
  input: AddVenueInput,
): Promise<{ ok: true; data: { restaurant_id: string } } | { ok: false; error: string }> {
  const result = await toResult(() => venueActions.addVenueToOrg(input));
  if (result.ok) revalidatePath(`/partner/org/${input.organizationId}/venues`);
  return result;
}

export async function removeVenueFromOrgAction(input: {
  organizationId: string;
  restaurantId: string;
  reason: string;
}): Promise<{ ok: true; data: { restaurant_id: string } } | { ok: false; error: string }> {
  const result = await toResult(() =>
    venueActions.removeVenueFromOrg({ restaurantId: input.restaurantId, reason: input.reason }),
  );
  if (result.ok) revalidatePath(`/partner/org/${input.organizationId}/venues`);
  return result;
}
