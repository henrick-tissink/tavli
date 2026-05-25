import "server-only";

/**
 * §08 §6.2 + §6.4 — walk-in queue operations + wait-time estimation.
 *
 * Wait estimate is the §6.4 heuristic, simplified for v1: turn-time uses the
 * restaurant's `turn_time_minutes` (median per-service aggregates land with
 * §07 once there's data); pay→clear and clear→free use fixed small windows.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables, restaurants, walkinQueue } from "@/lib/db/schema";
import { transitionTableStatus as defaultTransition } from "./transitions";
import type { TableStatus } from "./state-machine";

const PAY_TO_CLEAR_MIN = 8;
const CLEAR_TO_FREE_MIN = 4;

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
  transition?: typeof defaultTransition;
}

export interface WaitEstimate {
  /** null = the venue physically can't seat this party size tonight. */
  estimatedWaitMinutes: number | null;
  freeCount: number;
  canSeat: boolean;
}

export function makeWalkinQueue(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const transition = deps.transition ?? defaultTransition;

  async function estimateWait(input: { restaurantId: string; partySize: number }): Promise<WaitEstimate> {
    const [r] = (await deps.db
      .select({ turn: restaurants.turnTimeMinutes })
      .from(restaurants)
      .where(eq(restaurants.id, input.restaurantId))
      .limit(1)) as Array<{ turn: number }>;
    const turnMs = (r?.turn ?? 90) * 60_000;

    const candidates = (await deps.db
      .select({
        currentStatus: restaurantTables.currentStatus,
        currentStatusSince: restaurantTables.currentStatusSince,
      })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.restaurantId, input.restaurantId),
          sql`${restaurantTables.archivedAt} IS NULL`,
          sql`${restaurantTables.capacityMin} <= ${input.partySize}`,
          sql`${restaurantTables.capacityMax} >= ${input.partySize}`,
        ),
      )) as Array<{ currentStatus: TableStatus; currentStatusSince: Date }>;

    const nowMs = now().getTime();
    let freeCount = 0;
    let minReady = Infinity;
    for (const c of candidates) {
      const since = new Date(c.currentStatusSince).getTime();
      let ready: number;
      switch (c.currentStatus) {
        case "free":
          ready = nowMs;
          freeCount++;
          break;
        case "seated":
        case "booked":
          ready = since + turnMs;
          break;
        case "paying":
          ready = since + PAY_TO_CLEAR_MIN * 60_000;
          break;
        case "dirty":
          ready = since + CLEAR_TO_FREE_MIN * 60_000;
          break;
        default: // blocked / combined — excluded
          continue;
      }
      minReady = Math.min(minReady, ready);
    }

    if (minReady === Infinity) return { estimatedWaitMinutes: null, freeCount: 0, canSeat: false };
    const rawMin = Math.max(0, (minReady - nowMs) / 60_000);
    const rounded = Math.min(90, Math.max(5, Math.ceil(rawMin / 5) * 5));
    return { estimatedWaitMinutes: rounded, freeCount, canSeat: true };
  }

  async function addWalkin(input: {
    restaurantId: string;
    guestName: string;
    guestPhone?: string | null;
    partySize: number;
    notes?: string | null;
    addedByUserId: string;
  }): Promise<{ id: string; position: number; estimatedWaitMinutes: number | null }> {
    const est = await estimateWait({ restaurantId: input.restaurantId, partySize: input.partySize });
    const [maxRow] = (await deps.db
      .select({ max: sql<number | null>`max(${walkinQueue.position})` })
      .from(walkinQueue)
      .where(
        and(
          eq(walkinQueue.restaurantId, input.restaurantId),
          inArray(walkinQueue.status, ["waiting", "called"]),
        ),
      )) as Array<{ max: number | null }>;
    const position = (maxRow?.max ?? 0) + 1;

    const [row] = await deps.db
      .insert(walkinQueue)
      .values({
        restaurantId: input.restaurantId,
        guestName: input.guestName.trim().slice(0, 120),
        guestPhone: input.guestPhone?.trim() || null,
        partySize: input.partySize,
        notes: input.notes?.trim() || null,
        position,
        estimatedWaitMinutes: est.estimatedWaitMinutes,
        addedByUserId: input.addedByUserId,
      })
      .returning({ id: walkinQueue.id });
    return { id: row.id, position, estimatedWaitMinutes: est.estimatedWaitMinutes };
  }

  async function callWalkin(walkinId: string): Promise<void> {
    await deps.db
      .update(walkinQueue)
      .set({ status: "called", calledAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(walkinQueue.id, walkinId), eq(walkinQueue.status, "waiting")));
  }

  async function markWalkinLeft(walkinId: string): Promise<void> {
    await deps.db
      .update(walkinQueue)
      .set({ status: "left", leftAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(walkinQueue.id, walkinId), inArray(walkinQueue.status, ["waiting", "called"])));
  }

  /**
   * Seat a walk-in, optionally at a specific free table (transitions it to
   * `seated`). The table transition is best-effort relative to the queue update
   * — if the table was just taken, the walk-in is still marked seated.
   */
  async function seatWalkin(input: {
    walkinId: string;
    tableId?: string | null;
    changedByUserId: string;
  }): Promise<void> {
    if (input.tableId) {
      try {
        await transition({ tableId: input.tableId, toStatus: "seated", changedByUserId: input.changedByUserId });
      } catch {
        /* table no longer free — seat the walk-in anyway, host re-picks a table */
      }
    }
    await deps.db
      .update(walkinQueue)
      .set({
        status: "seated",
        seatedAt: sql`now()`,
        seatedTableId: input.tableId ?? null,
        updatedAt: sql`now()`,
      })
      .where(eq(walkinQueue.id, input.walkinId));
  }

  async function listActive(restaurantId: string) {
    return deps.db
      .select()
      .from(walkinQueue)
      .where(and(eq(walkinQueue.restaurantId, restaurantId), inArray(walkinQueue.status, ["waiting", "called"])))
      .orderBy(walkinQueue.position);
  }

  return { estimateWait, addWalkin, callWalkin, markWalkinLeft, seatWalkin, listActive };
}

export const walkinQueueOps = makeWalkinQueue({ db: dbAdmin });
