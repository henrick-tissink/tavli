/**
 * One-off: assign floor-plan tables to existing un-assigned reservations so the
 * live floor reflects the booking history. Best-fit, in date+time order,
 * respecting overlaps (the DB trigger also guards against collisions). Only
 * touches confirmed/seated, today-or-future, table_id-NULL, non-event rows.
 *
 *   npx tsx scripts/backfill-table-assignments.ts [restaurantId]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { pickTable } from "../src/lib/reservations/table-inventory";

const restaurantId = process.argv[2] ?? "18ed759e-209d-4d3f-943a-df7ff9382e52";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const toMin = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

async function main(): Promise<void> {
  const tablesRaw = await sql<{ id: string; capacity_min: number; capacity_max: number }[]>`
    select id, capacity_min, capacity_max from restaurant_tables
    where restaurant_id = ${restaurantId} and archived_at is null and is_bookable_online`;
  if (tablesRaw.length === 0) {
    console.log("no bookable floor plan — nothing to backfill");
    await sql.end();
    return;
  }
  const tables = tablesRaw.map((t) => ({ id: t.id, capacityMin: t.capacity_min, capacityMax: t.capacity_max }));
  const [{ turn_time_minutes: turn }] = await sql<{ turn_time_minutes: number }[]>`
    select turn_time_minutes from restaurants where id = ${restaurantId}`;

  const rows = await sql<{ id: string; reservation_date: string; reservation_time: string; party_size: number }[]>`
    select id, reservation_date::text, reservation_time::text, party_size
    from reservations
    where restaurant_id = ${restaurantId}
      and status in ('confirmed', 'seated')
      and reservation_date >= current_date
      and table_id is null
      and event_request_id is null
    order by reservation_date, reservation_time`;

  const byDate = new Map<string, { start: number; tableId: string }[]>();
  let assigned = 0;
  let unassigned = 0;

  for (const r of rows) {
    const holds = byDate.get(r.reservation_date) ?? [];
    const start = toMin(r.reservation_time);
    const held = new Set(holds.filter((h) => Math.abs(h.start - start) < turn).map((h) => h.tableId));
    const tableId = pickTable({ party: r.party_size, startMinutes: start, turnMinutes: turn, tables, heldTableIds: held });
    if (tableId) {
      await sql`update reservations set table_id = ${tableId}, auto_assigned = true where id = ${r.id}`;
      holds.push({ start, tableId });
      byDate.set(r.reservation_date, holds);
      assigned++;
    } else {
      unassigned++;
    }
  }

  console.log(
    `backfill complete: ${assigned} assigned, ${unassigned} left unassigned (feasible-but-tight; host seats at service)`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
