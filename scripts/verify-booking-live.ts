/**
 * LIVE verification of the table-inventory booking commit against the real DB.
 * Books through the real commitFloorBooking (transaction + advisory lock +
 * trigger) on a far sentinel date, asserts the persisted floor state, then
 * deletes everything it created (sentinel-scoped, self-cleaning).
 *
 * commitFloorBooking pulls in `import "server-only"`, which Next bundles but
 * tsx can't resolve as a bare specifier. Provide a one-line empty stub for the
 * run, then remove it:
 *   mkdir -p node_modules/server-only
 *   printf '{"name":"server-only","version":"0.0.0","main":"index.js"}' > node_modules/server-only/package.json
 *   printf 'module.exports = {};\n' > node_modules/server-only/index.js
 *   npx tsx scripts/verify-booking-live.ts
 *   rm -rf node_modules/server-only
 *
 * Covers: A single auto-assign · B big-party combination (adjacency-aware) ·
 * C reshuffle persistence (a movable sibling is relocated, not bumped) ·
 * D the exclusion trigger rejecting a real same-table/time double-book.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { commitFloorBooking } from "../src/lib/reservations/booking-commit";

const REST = "18ed759e-209d-4d3f-943a-df7ff9382e52"; // Floreasca
const DATE = "2030-09-18"; // Wed, availability 12:00–23:00, turn 90, empty
const SENTINEL = "ZZ_VERIFY";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3 });

const tok = () => randomBytes(12).toString("hex");
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function rowsForDate() {
  return sql<
    { id: string; party_size: number; reservation_time: string; table_id: string | null; combination_id: string | null; auto_assigned: boolean; guest_name: string }[]
  >`select id, party_size, reservation_time, table_id, combination_id, auto_assigned, guest_name
    from reservations where restaurant_id=${REST} and reservation_date=${DATE} order by reservation_time`;
}

async function cleanup() {
  await sql`delete from table_combinations where reservation_id in (
    select id from reservations where restaurant_id=${REST} and reservation_date=${DATE})`;
  await sql`delete from reservations where restaurant_id=${REST} and reservation_date=${DATE}`;
}

async function main() {
  // Table geometry for assertions.
  const tables = await sql<{ id: string; capacity_max: number }[]>`
    select id, capacity_max from restaurant_tables
    where restaurant_id=${REST} and archived_at is null and is_bookable_online`;
  const capOf = new Map(tables.map((t) => [t.id, t.capacity_max]));
  const eightTops = tables.filter((t) => t.capacity_max === 8).map((t) => t.id);

  console.log("\n— pre-clean —");
  await cleanup();

  // ── Scenario A: single auto-assign (party 2 @ 19:00) ──────────────────────
  console.log("\n— A: single auto-assign —");
  const a = await commitFloorBooking({
    restaurantId: REST, date: DATE, time: "19:00", partySize: 2,
    guestName: `${SENTINEL} single`, guestPhone: "+40700000001", guestEmail: null,
    zone: null, notes: null, confirmationToken: tok(), locale: "ro",
  });
  check("commit ok", a.ok, JSON.stringify(a));
  if (a.ok) {
    const row = (await rowsForDate()).find((r) => r.guest_name.endsWith("single"))!;
    check("A persisted with a table_id", !!row.table_id, `table=${row.table_id}`);
    check("A auto_assigned=true", row.auto_assigned === true);
    check("A table physically fits party 2", !!row.table_id && capOf.get(row.table_id)! >= 2,
      `cap=${row.table_id && capOf.get(row.table_id)}`);
  }

  // ── Scenario B: combination (party 16 @ 21:30, no overlap with A) ──────────
  console.log("\n— B: big-party combination —");
  const b = await commitFloorBooking({
    restaurantId: REST, date: DATE, time: "21:30", partySize: 16,
    guestName: `${SENTINEL} combo`, guestPhone: "+40700000002", guestEmail: null,
    zone: null, notes: null, confirmationToken: tok(), locale: "ro",
  });
  check("commit ok", b.ok, JSON.stringify(b));
  if (b.ok) {
    const row = (await rowsForDate()).find((r) => r.guest_name.endsWith("combo"))!;
    check("B linked to a combination", !!row.combination_id, `combo=${row.combination_id}`);
    if (row.combination_id) {
      const [combo] = await sql<{ table_ids: string[]; combined_capacity: number; status: string }[]>`
        select table_ids, combined_capacity, status from table_combinations where id=${row.combination_id}`;
      check("B combination has ≥2 tables", combo.table_ids.length >= 2, `tables=${combo.table_ids.length}`);
      check("B combined capacity ≥ 16", combo.combined_capacity >= 16, `cap=${combo.combined_capacity}`);
      const sum = combo.table_ids.reduce((s, id) => s + (capOf.get(id) ?? 0), 0);
      check("B member caps actually sum ≥ 16", sum >= 16, `sum=${sum}`);
    }
  }

  // ── Scenario C: reshuffle persistence (move a movable sibling) ─────────────
  // Seed an auto-assigned party of 2 parked sub-optimally on an 8-top at 14:00,
  // then book a party of 8 at 14:00. The sweep must relocate the sibling so the
  // 8-top is free for the new party — and that move must be persisted.
  console.log("\n— C: reshuffle persistence —");
  const eightTop = eightTops[0]!;
  await sql`insert into reservations
    (restaurant_id, guest_name, guest_phone, party_size, reservation_date, reservation_time,
     status, confirmation_token, locale, table_id, auto_assigned)
    values (${REST}, ${`${SENTINEL} sibling`}, '+40700000003', 2, ${DATE}, '14:00:00',
     'confirmed', ${tok()}, 'ro', ${eightTop}, true)`;
  const c = await commitFloorBooking({
    restaurantId: REST, date: DATE, time: "14:00", partySize: 8,
    guestName: `${SENTINEL} bigsingle`, guestPhone: "+40700000004", guestEmail: null,
    zone: null, notes: null, confirmationToken: tok(), locale: "ro",
  });
  check("commit ok", c.ok, JSON.stringify(c));
  if (c.ok) {
    const rows = await rowsForDate();
    const sib = rows.find((r) => r.guest_name.endsWith("sibling"))!;
    const big = rows.find((r) => r.guest_name.endsWith("bigsingle"))!;
    check("C new party-of-8 seated on an 8-top", !!big.table_id && capOf.get(big.table_id) === 8,
      `table=${big.table_id} cap=${big.table_id && capOf.get(big.table_id)}`);
    check("C sibling RESHUFFLED off the 8-top (move persisted)", sib.table_id !== eightTop,
      `was=${eightTop} now=${sib.table_id}`);
    check("C sibling still seated (not bumped)", !!sib.table_id, `table=${sib.table_id}`);
    check("C the two parties hold distinct tables", big.table_id !== sib.table_id);
  }

  // ── Scenario D: exclusion trigger rejects a physical double-book ───────────
  console.log("\n— D: trigger double-book guard —");
  const occupied = (await rowsForDate()).find((r) => r.guest_name === `${SENTINEL} single`)!;
  console.log(`   targeting ${occupied.guest_name} @${occupied.reservation_time} table=${occupied.table_id}`);
  let rejected = false;
  try {
    await sql`insert into reservations
      (restaurant_id, guest_name, guest_phone, party_size, reservation_date, reservation_time,
       status, confirmation_token, locale, table_id, auto_assigned)
      values (${REST}, ${`${SENTINEL} collide`}, '+40700000005', 2, ${DATE}, '19:00:00',
       'confirmed', ${tok()}, 'ro', ${occupied.table_id}, false)`;
  } catch (e) {
    rejected = true;
    console.log(`   trigger raised: ${(e as Error).message.split("\n")[0]}`);
  }
  check("D double-book on the same table+time was rejected", rejected);

  console.log("\n— cleanup —");
  await cleanup();
  const left = await rowsForDate();
  check("cleanup left 0 rows for the sentinel date", left.length === 0, `left=${left.length}`);
}

main()
  .then(async () => {
    await sql.end();
    console.log(`\n${failures === 0 ? "ALL LIVE CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("\nFATAL", e);
    try { await cleanup(); } catch {}
    await sql.end();
    process.exit(2);
  });
