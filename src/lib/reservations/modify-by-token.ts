/**
 * §02 §4.3 — diner modifies their own reservation via the secure link, allowed
 * only > 24h before the slot (TV003) and only while confirmed (TV007). Uses
 * optimistic locking (version): the UPDATE is WHERE id = ? AND version = ?, so a
 * stale client (or concurrent edit) gets a conflict. The capacity trigger
 * re-checks the new slot (may raise TV002 → slot_full). Rotates the token.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { ok, fail, notFound, conflict, type ActionResult } from "@/lib/server-action";

const MODIFY_CUTOFF_MS = 24 * 60 * 60 * 1000;

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  now?: () => Date;
}

export interface ModifyByTokenInput {
  token: string;
  version: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  notes?: string;
}

export function makeModifyReservationByToken(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function modifyReservationByToken(
    input: ModifyByTokenInput,
  ): Promise<ActionResult<{ reservationId: string; version: number }>> {
    if (input.partySize < 1 || input.partySize > 50) return fail("invalid_input", "Party size out of range.");

    const rows = (await deps.db.execute(sql`
      SELECT r.id, r.status, r.version, r.restaurant_id,
             ((r.reservation_date + r.reservation_time) AT TIME ZONE rest.timezone) AS slot_at
      FROM reservations r JOIN restaurants rest ON rest.id = r.restaurant_id
      WHERE r.confirmation_token = ${input.token}
    `)) as unknown as Array<{ id: string; status: string; version: number; restaurant_id: string; slot_at: string }>;
    const r = rows[0];
    if (!r) return notFound();
    if (r.status !== "confirmed") return fail("invalid_input", "TV007 already_terminal");
    if (new Date(r.slot_at).getTime() - MODIFY_CUTOFF_MS <= now().getTime()) {
      return fail("invalid_input", "TV003 modification_window_closed");
    }

    let updated: Array<{ id: string }>;
    try {
      updated = (await deps.db.execute(sql`
        UPDATE reservations
        SET reservation_date = ${input.date}, reservation_time = ${input.time}, party_size = ${input.partySize},
            notes = ${input.notes ?? null}, version = version + 1, modified_at = now(),
            confirmation_token = gen_random_uuid()::text
        WHERE id = ${r.id} AND version = ${input.version} AND status = 'confirmed'
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (msg.includes("Slot is full") || msg.includes("TV002")) return fail("conflict", "TV002 slot_full");
      throw e;
    }
    if (updated.length === 0) return conflict("Reservation was changed elsewhere — reload and retry.");

    await deps.recordAudit({
      action: AUDIT.reservation.modified,
      subjectType: "reservation",
      subjectId: r.id,
      actorRole: "diner",
      restaurantId: r.restaurant_id,
      context: { via: "token", new_date: input.date, new_time: input.time, party_size: input.partySize },
    });
    return ok({ reservationId: r.id, version: input.version + 1 });
  };
}

export const modifyReservationByToken = makeModifyReservationByToken({ db: dbAdmin, recordAudit: defaultRecordAudit });
