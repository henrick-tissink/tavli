"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables, restaurants, walkinQueue, reservations } from "@/lib/db/schema";
import { transitionTableStatus } from "@/lib/tables/transitions";
import { combineTables, dissolveCombination } from "@/lib/tables/combine";
import { walkinQueueOps } from "@/lib/tables/walkin";
import { validateOrClearTableAssignment } from "@/lib/tables/validate-or-clear-table-assignment";
import type { TableStatus } from "@/lib/tables/state-machine";

async function restaurantIdOfReservation(reservationId: string): Promise<string | null> {
  const [r] = await dbAdmin
    .select({ restaurantId: reservations.restaurantId })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  return (r as { restaurantId: string } | undefined)?.restaurantId ?? null;
}

export type Res = { ok: true } | { ok: false; error: string };

/**
 * Authorize an OPERATIONAL live-view mutation (status / combine / walk-in) on a
 * restaurant, deriving the org server-side so a client can't smuggle a
 * restaurantId it doesn't own. Per §08 §4.9 these gate on `table.update`
 * ("every venue staff including hosts") — NOT `floor_plan.edit`, which the
 * matrix denies to venue_host and which governs only config (restaurant_tables)
 * edits in the editor (actions.ts). Returns the session (with userId for the
 * status-log actor) or null.
 */
async function authzRestaurant(restaurantId: string): Promise<{ userId: string } | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const [r] = await dbAdmin
    .select({ orgId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const orgId = (r as { orgId: string | null } | undefined)?.orgId ?? "";
  const ok = await can(session, "table.update", { kind: "restaurant", id: restaurantId, organization_id: orgId });
  return ok ? { userId: session.userId } : null;
}

async function restaurantIdOfTable(tableId: string): Promise<string | null> {
  const [t] = await dbAdmin
    .select({ restaurantId: restaurantTables.restaurantId })
    .from(restaurantTables)
    .where(eq(restaurantTables.id, tableId))
    .limit(1);
  return (t as { restaurantId: string } | undefined)?.restaurantId ?? null;
}

const REFRESH = "/partner/tables/live";

export async function updateTableStatusAction(input: {
  tableId: string;
  toStatus: TableStatus;
  notes?: string;
}): Promise<Res> {
  // Scope is derived from the table itself (NEW-3 IDOR pattern).
  const restaurantId = await restaurantIdOfTable(input.tableId);
  if (!restaurantId) return { ok: false, error: "not_found" };
  const auth = await authzRestaurant(restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  try {
    await transitionTableStatus({
      tableId: input.tableId,
      toStatus: input.toStatus,
      changedByUserId: auth.userId,
      notes: input.notes?.trim() || undefined,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("invalid_transition")) return { ok: false, error: "invalid_transition" };
    return { ok: false, error: "failed" };
  }
  revalidatePath(REFRESH);
  return { ok: true };
}

/**
 * §08 §6.2 — assign a booking to a physical table from the live view. Scope is
 * derived from the table itself; the reservation must belong to the same
 * restaurant (no cross-tenant assignment). Sets the table 'booked' (state
 * machine + status log) and stamps reservations.table_id.
 */
export async function assignReservationToTableAction(input: {
  reservationId: string;
  tableId: string;
}): Promise<Res> {
  const restaurantId = await restaurantIdOfTable(input.tableId);
  if (!restaurantId) return { ok: false, error: "not_found" };
  const auth = await authzRestaurant(restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  // The reservation must be in the same restaurant as the table.
  if ((await restaurantIdOfReservation(input.reservationId)) !== restaurantId) {
    return { ok: false, error: "forbidden" };
  }
  try {
    await transitionTableStatus({
      tableId: input.tableId,
      toStatus: "booked",
      reservationId: input.reservationId,
      changedByUserId: auth.userId,
    });
    await dbAdmin
      .update(reservations)
      .set({ tableId: input.tableId, autoAssigned: false })
      .where(eq(reservations.id, input.reservationId));
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("invalid_transition")) return { ok: false, error: "invalid_transition" };
    return { ok: false, error: "failed" };
  }
  revalidatePath(REFRESH);
  return { ok: true };
}

/** §08 §6.2 — clear a booking's table assignment (frees the table). */
export async function unassignReservationAction(reservationId: string): Promise<Res> {
  const restaurantId = await restaurantIdOfReservation(reservationId);
  if (!restaurantId) return { ok: false, error: "not_found" };
  const auth = await authzRestaurant(restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  try {
    await validateOrClearTableAssignment(reservationId, "unassigned");
  } catch {
    return { ok: false, error: "failed" };
  }
  revalidatePath(REFRESH);
  return { ok: true };
}

export async function combineTablesAction(input: {
  restaurantId: string;
  tableIds: string[];
  reservationId?: string | null;
}): Promise<Res> {
  const auth = await authzRestaurant(input.restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  try {
    await combineTables({
      restaurantId: input.restaurantId,
      tableIds: input.tableIds,
      reservationId: input.reservationId ?? null,
      changedByUserId: auth.userId,
    });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
  revalidatePath(REFRESH);
  return { ok: true };
}

export async function dissolveCombinationAction(input: {
  restaurantId: string;
  combinationId: string;
}): Promise<Res> {
  const auth = await authzRestaurant(input.restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  try {
    await dissolveCombination({
      combinationId: input.combinationId,
      restaurantId: input.restaurantId,
      changedByUserId: auth.userId,
    });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
  revalidatePath(REFRESH);
  return { ok: true };
}

export async function addWalkinAction(input: {
  restaurantId: string;
  guestName: string;
  guestPhone?: string;
  partySize: number;
  notes?: string;
}): Promise<Res> {
  const auth = await authzRestaurant(input.restaurantId);
  if (!auth) return { ok: false, error: "forbidden" };
  if (!input.guestName.trim() || input.partySize < 1) return { ok: false, error: "invalid_input" };
  await walkinQueueOps.addWalkin({ ...input, addedByUserId: auth.userId });
  revalidatePath(REFRESH);
  return { ok: true };
}

/** Resolve + authorize a walk-in by its own restaurant scope. */
async function authzWalkin(walkinId: string): Promise<{ userId: string; restaurantId: string } | null> {
  const [w] = await dbAdmin
    .select({ restaurantId: walkinQueue.restaurantId })
    .from(walkinQueue)
    .where(eq(walkinQueue.id, walkinId))
    .limit(1);
  const restaurantId = (w as { restaurantId: string } | undefined)?.restaurantId;
  if (!restaurantId) return null;
  const auth = await authzRestaurant(restaurantId);
  return auth ? { userId: auth.userId, restaurantId } : null;
}

export async function callWalkinAction(walkinId: string): Promise<Res> {
  const auth = await authzWalkin(walkinId);
  if (!auth) return { ok: false, error: "forbidden" };
  await walkinQueueOps.callWalkin(walkinId);
  revalidatePath(REFRESH);
  return { ok: true };
}

export async function markWalkinLeftAction(walkinId: string): Promise<Res> {
  const auth = await authzWalkin(walkinId);
  if (!auth) return { ok: false, error: "forbidden" };
  await walkinQueueOps.markWalkinLeft(walkinId);
  revalidatePath(REFRESH);
  return { ok: true };
}

export async function seatWalkinAction(input: { walkinId: string; tableId?: string }): Promise<Res> {
  const auth = await authzWalkin(input.walkinId);
  if (!auth) return { ok: false, error: "forbidden" };
  // If a table is chosen, it must belong to the walk-in's restaurant (no IDOR).
  if (input.tableId) {
    const tableRestaurant = await restaurantIdOfTable(input.tableId);
    if (tableRestaurant !== auth.restaurantId) return { ok: false, error: "forbidden" };
  }
  await walkinQueueOps.seatWalkin({
    walkinId: input.walkinId,
    tableId: input.tableId ?? null,
    changedByUserId: auth.userId,
  });
  revalidatePath(REFRESH);
  return { ok: true };
}
