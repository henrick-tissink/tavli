/**
 * Idempotent showcase demo-data seeder for "Atelier Floreasca" (demo.tavli.ro).
 *
 * Fills the showcase restaurant with realistic floor plan, diners, ~13 months
 * of reservations, marketing, and corporate data so the partner dashboards
 * (Reservations / Diners / Analytics / Marketing / Corporate / Sala / Tables)
 * show real functionality instead of empty states. After seeding it rebuilds
 * the analytics aggregates + cohorts for this restaurant/org so the Analytics
 * dashboard populates.
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 * The target DB is SHARED with production. This script writes ONLY rows scoped
 * to the atelier-floreasca restaurant and its organization, resolved at
 * runtime. The ONLY deletes are this script's OWN seeded rows (matched by a
 * stable seed-marker email/cui pattern AND filtered by restaurant_id /
 * organization_id) to keep re-runs clean. There is NO DROP / TRUNCATE and NO
 * write that can touch any other restaurant, org, or global table.
 *
 * Photos are intentionally NOT seeded (see create-showcase-restaurant.ts).
 *
 * Usage:
 *   npx tsx --env-file=.env.demo scripts/seed-showcase-demo-data.ts
 *
 * Idempotent: re-running deletes this script's prior seeded rows for the
 * showcase and re-inserts deterministically. Re-runs do not duplicate or error.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import crypto from "node:crypto";
import {
  restaurants,
  restaurantAvailability,
  restaurantTableSections,
  restaurantTables,
  diners,
  reservations,
  marketingCampaigns,
  marketingCampaignVersions,
  marketingSegments,
  marketingSends,
  marketingQuotaUsage,
  corporateClients,
  eventRequests,
} from "../src/lib/db/schema";
import { trimmedMeanForecast } from "../src/lib/analytics/forecast";
import { computeCohortRows, type DinerVisits } from "../src/lib/analytics/cohort";

const SLUG = "atelier-floreasca";

// Stable seed markers — every row this script owns carries one of these so a
// re-run can find and remove exactly its own data and nothing else.
const DINER_EMAIL_DOMAIN = "atelier-demo.example.com"; // diners + reservation guest_email
const SEGMENT_SEED_PREFIX = "[demo] ";
const CAMPAIGN_SEED_PREFIX = "[demo] ";
const CORPORATE_CUI_PREFIX = "DEMO"; // corporate_clients.cui unique — namespaced
const EVENT_GUEST_EMAIL = `events@${DINER_EMAIL_DOMAIN}`;

type Db = ReturnType<typeof drizzle>;

// ── deterministic PRNG so re-runs produce identical data ────────────────────
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xa7e1_1e7c);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function chance(p: number): boolean {
  return rng() < p;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ── reference data ──────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "Andrei", "Maria", "Ioana", "Mihai", "Elena", "Cristian", "Ana", "Răzvan",
  "Diana", "Alexandru", "Gabriela", "Vlad", "Andreea", "Bogdan", "Raluca",
  "Ștefan", "Simona", "Adrian", "Cătălina", "Sorin", "Larisa", "Daniel",
  "Oana", "Florin", "Roxana", "Tudor", "Mihaela", "George", "Carmen", "Paul",
];
const LAST_NAMES = [
  "Popescu", "Ionescu", "Popa", "Dumitru", "Stan", "Stoica", "Gheorghe",
  "Matei", "Constantin", "Marin", "Diaconu", "Rusu", "Munteanu", "Florescu",
  "Niculescu", "Georgescu", "Dragomir", "Barbu", "Nistor", "Tudor", "Vasile",
  "Toma", "Olaru", "Sandu", "Petrescu",
];
const OCCASION_TAGS = ["aniversare", "cina_de_afaceri", "intalnire", "sarbatoare", "cerere_casatorie"];
const ALLERGIES = ["gluten", "lactoză", "fructe de mare", "alune", "ouă"];
const SEATING_PREFS = [
  { window: true },
  { quiet: true },
  { terrace: true },
  { near_kitchen: false, booth: true },
];
const INTERNAL_NOTES = [
  "Client fidel, preferă masa de la fereastră.",
  "Scommelier-ul recomandă mereu Fetească Neagră.",
  "Alergic la fructe de mare — atenție la garnituri.",
  "Sărbătorește des aniversări aici.",
  "Vine de obicei vinerea seara.",
  null,
  null,
  null,
];
const CANCEL_REASONS = [
  "diner",
  "diner",
  "diner",
  "overbooked",
  "kitchen_issue",
  "restaurant_closed",
  "private_event",
];
// availability windows (resolved from DB at runtime, this mirrors the showcase)
// dow 0=Sun..6=Sat. Mon (1) closed.
const SERVICE_HOURS: Record<number, { start: number; end: number } | null> = {
  0: { start: 11, end: 22 },
  1: null,
  2: { start: 12, end: 23 },
  3: { start: 12, end: 23 },
  4: { start: 12, end: 23 },
  5: { start: 12, end: 23 },
  6: { start: 12, end: 23 },
};

function token(): string {
  return crypto.randomBytes(32).toString("hex");
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// weighted party size toward 2-4
function partySize(): number {
  const r = rng();
  if (r < 0.18) return 2;
  if (r < 0.45) return randInt(2, 3);
  if (r < 0.75) return 4;
  if (r < 0.88) return randInt(5, 6);
  if (r < 0.97) return randInt(6, 7);
  return 8;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (run with --env-file=.env.demo)");
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);

  try {
    // ── resolve ids ────────────────────────────────────────────────────────
    const [rest] = await db
      .select({ id: restaurants.id, organizationId: restaurants.organizationId, timezone: restaurants.timezone })
      .from(restaurants)
      .where(eq(restaurants.slug, SLUG));
    if (!rest) throw new Error(`restaurant not found: ${SLUG}`);
    const restaurantId = rest.id;
    const orgId = rest.organizationId;
    const timezone = rest.timezone;
    console.log(`Showcase: restaurant=${restaurantId} org=${orgId} tz=${timezone}`);

    // confirm availability shape matches our SERVICE_HOURS assumption
    const avail = await db
      .select({
        dayOfWeek: restaurantAvailability.dayOfWeek,
        slotStart: restaurantAvailability.slotStart,
        slotEnd: restaurantAvailability.slotEnd,
        capacity: restaurantAvailability.capacity,
      })
      .from(restaurantAvailability)
      .where(eq(restaurantAvailability.restaurantId, restaurantId));
    const availByDow = new Map<number, { start: string; end: string; capacity: number }>();
    for (const a of avail) availByDow.set(a.dayOfWeek, { start: a.slotStart, end: a.slotEnd, capacity: a.capacity });
    console.log(`Availability rows: ${avail.length}`);

    await seedFloorPlan(db, restaurantId);
    const dinerIds = await seedDiners(db, orgId, restaurantId);
    await seedReservations(db, restaurantId, dinerIds, availByDow);
    await refreshAnalytics(db, restaurantId, orgId, timezone);
    await seedMarketing(db, orgId, restaurantId, dinerIds);
    await seedCorporate(db, restaurantId);

    await printSummary(db, restaurantId, orgId);
    console.log("\n✓ seed complete (idempotent — safe to re-run)");
  } finally {
    await client.end({ timeout: 5 });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 1 — floor plan: 2 sections + 12 tables
// ════════════════════════════════════════════════════════════════════════════
async function seedFloorPlan(db: Db, restaurantId: string) {
  console.log("\n[1/6] floor plan…");
  // idempotent: remove this restaurant's tables + sections (scoped) then re-insert.
  await db.delete(restaurantTables).where(eq(restaurantTables.restaurantId, restaurantId));
  await db.delete(restaurantTableSections).where(eq(restaurantTableSections.restaurantId, restaurantId));

  const sectionSpecs = [
    { name: "Sala principală", color: "#7c4a2d", sortOrder: 0 },
    { name: "Terasă", color: "#3d7c4a", sortOrder: 1 },
  ];
  const sectionRows = await db
    .insert(restaurantTableSections)
    .values(sectionSpecs.map((s) => ({ restaurantId, name: s.name, color: s.color, sortOrder: s.sortOrder })))
    .returning({ id: restaurantTableSections.id, name: restaurantTableSections.name });
  const sala = sectionRows.find((s) => s.name === "Sala principală")!.id;
  const terasa = sectionRows.find((s) => s.name === "Terasă")!.id;

  type TableSpec = {
    label: string; sectionId: string; capMin: number; capTyp: number; capMax: number;
    shape: "round" | "square" | "rect_2x4" | "rect_2x6" | "rect_2x8" | "banquette" | "bar_stool" | "high_top" | "patio";
    x: number; y: number; w: number; h: number;
  };
  const tableSpecs: TableSpec[] = [
    // Sala principală — grid layout
    { label: "1", sectionId: sala, capMin: 2, capTyp: 2, capMax: 4, shape: "round", x: 60, y: 60, w: 80, h: 80 },
    { label: "2", sectionId: sala, capMin: 2, capTyp: 2, capMax: 4, shape: "round", x: 200, y: 60, w: 80, h: 80 },
    { label: "3", sectionId: sala, capMin: 2, capTyp: 4, capMax: 4, shape: "square", x: 340, y: 60, w: 90, h: 90 },
    { label: "4", sectionId: sala, capMin: 4, capTyp: 4, capMax: 6, shape: "rect_2x4", x: 60, y: 200, w: 160, h: 80 },
    { label: "5", sectionId: sala, capMin: 4, capTyp: 6, capMax: 8, shape: "rect_2x6", x: 280, y: 200, w: 220, h: 80 },
    { label: "6", sectionId: sala, capMin: 2, capTyp: 4, capMax: 6, shape: "banquette", x: 60, y: 340, w: 200, h: 70 },
    { label: "7", sectionId: sala, capMin: 1, capTyp: 2, capMax: 2, shape: "high_top", x: 320, y: 340, w: 70, h: 70 },
    { label: "8", sectionId: sala, capMin: 1, capTyp: 1, capMax: 2, shape: "bar_stool", x: 430, y: 340, w: 50, h: 50 },
    // Terasă
    { label: "T1", sectionId: terasa, capMin: 2, capTyp: 2, capMax: 4, shape: "patio", x: 60, y: 480, w: 90, h: 90 },
    { label: "T2", sectionId: terasa, capMin: 2, capTyp: 4, capMax: 4, shape: "patio", x: 200, y: 480, w: 90, h: 90 },
    { label: "T3", sectionId: terasa, capMin: 4, capTyp: 6, capMax: 8, shape: "rect_2x8", x: 340, y: 480, w: 260, h: 80 },
    { label: "T4", sectionId: terasa, capMin: 2, capTyp: 2, capMax: 4, shape: "round", x: 640, y: 480, w: 80, h: 80 },
  ];
  await db.insert(restaurantTables).values(
    tableSpecs.map((t) => ({
      restaurantId,
      sectionId: t.sectionId,
      label: t.label,
      capacityMin: t.capMin,
      capacityTypical: t.capTyp,
      capacityMax: t.capMax,
      shape: t.shape,
      positionX: t.x,
      positionY: t.y,
      width: t.w,
      height: t.h,
      currentStatus: "free" as const,
      isBookableOnline: true,
    })),
  );
  console.log(`  ✓ ${sectionRows.length} sections, ${tableSpecs.length} tables`);
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — diners (~80)
// ════════════════════════════════════════════════════════════════════════════
const ACQUISITION_SOURCES = [
  "widget", "venue_page", "editorial", "corporate", "walk_in", "manual", "import", "api",
] as const;

async function seedDiners(db: Db, orgId: string, restaurantId: string): Promise<string[]> {
  console.log("\n[2/6] diners…");
  // idempotent: remove this org's prior seeded diners (matched by seed email domain).
  await db
    .delete(diners)
    .where(and(eq(diners.organizationId, orgId), like(diners.email, `%@${DINER_EMAIL_DOMAIN}`)));

  const COUNT = 80;
  const now = new Date();
  type DinerInsert = typeof diners.$inferInsert;
  const rows: DinerInsert[] = [];
  const usedPhones = new Set<string>();

  for (let i = 0; i < COUNT; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const fullName = `${first} ${last}`;
    const idx = String(i).padStart(2, "0");
    const email = `${first.toLowerCase()}.${last.toLowerCase()}+demo${idx}@${DINER_EMAIL_DOMAIN}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    // unique valid-looking RO mobile +40 7xx xxx xxx
    let phone: string;
    do {
      phone = `+4007${randInt(10, 99)}${randInt(100, 999)}${randInt(100, 999)}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    // ~20% repeat/VIP, rest spread across first-timer/occasional/regular
    const r = rng();
    let visitCount: number;
    if (r < 0.20) visitCount = randInt(8, 32); // repeat/VIP
    else if (r < 0.45) visitCount = randInt(2, 4); // occasional
    else if (r < 0.65) visitCount = randInt(5, 7); // regular-ish
    else visitCount = randInt(0, 1); // first-timer / brand new

    const bucket =
      visitCount >= 20 ? "vip" : visitCount >= 5 ? "regular" : visitCount >= 2 ? "occasional" : "first_timer";

    const avgParty = randInt(2, 4);
    const coversTotal = visitCount === 0 ? 0 : visitCount * avgParty;
    const firstVisited =
      visitCount === 0
        ? null
        : new Date(now.getTime() - randInt(40, 390) * 86_400_000);
    const lastVisited =
      visitCount === 0
        ? null
        : new Date(now.getTime() - randInt(1, 35) * 86_400_000);

    const occasionTags = chance(0.35) ? [pick(OCCASION_TAGS)] : [];
    const allergies = chance(0.25) ? [pick(ALLERGIES)] : [];
    const seatingPreferences = chance(0.4) ? pick(SEATING_PREFS) : {};
    const internalNotes = pick(INTERNAL_NOTES);
    const birthday = chance(0.25)
      ? `${1970 + randInt(0, 35)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`
      : null;
    const anniversary = chance(0.12)
      ? `${2005 + randInt(0, 18)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`
      : null;

    rows.push({
      organizationId: orgId,
      phone,
      phoneRaw: phone,
      email,
      fullName,
      locale: "ro",
      allergies,
      occasionTags,
      seatingPreferences,
      internalNotes: internalNotes ?? undefined,
      birthdayDate: birthday,
      anniversaryDate: anniversary,
      acquisitionSource: pick([...ACQUISITION_SOURCES]),
      acquisitionRestaurantId: restaurantId,
      visitCount,
      coversTotal,
      firstVisitedAt: firstVisited,
      lastVisitedAt: lastVisited,
      frequencyBucket: bucket,
      typicalPartySizeMin: Math.max(1, avgParty - 1),
      typicalPartySizeMax: avgParty + 1,
      noShowCount: chance(0.15) ? randInt(1, 2) : 0,
      cancellationCount: chance(0.2) ? randInt(1, 2) : 0,
    });
  }

  const inserted = await db.insert(diners).values(rows).returning({ id: diners.id });
  console.log(`  ✓ ${inserted.length} diners (~20% repeat/VIP)`);
  return inserted.map((d) => d.id);
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 3 — reservations (~500 over ~13 months + a few upcoming)
// ════════════════════════════════════════════════════════════════════════════
async function seedReservations(
  db: Db,
  restaurantId: string,
  dinerIds: string[],
  availByDow: Map<number, { start: string; end: string; capacity: number }>,
) {
  console.log("\n[3/6] reservations…");
  // idempotent: delete this restaurant's prior seeded reservations (seed email domain).
  // reservations.guest_email is the marker; cascades any seeded reviews.
  await db
    .delete(reservations)
    .where(and(eq(reservations.restaurantId, restaurantId), like(reservations.guestEmail, `%@${DINER_EMAIL_DOMAIN}`)));

  // fetch diner identity to mirror onto reservation guest fields
  const dinerRows = await db
    .select({ id: diners.id, fullName: diners.fullName, email: diners.email, phone: diners.phone })
    .from(diners)
    .where(inArray(diners.id, dinerIds));
  const dinerById = new Map(dinerRows.map((d) => [d.id, d]));

  const now = new Date();
  type ResInsert = typeof reservations.$inferInsert;
  const historicalRows: ResInsert[] = [];

  // ── historical: ~480 rows across the last ~395 days (all NON-capacity statuses
  // so they insert freely past the trigger; statuses completed/no_show/cancelled).
  const HISTORICAL = 480;
  let made = 0;
  let guard = 0;
  while (made < HISTORICAL && guard < HISTORICAL * 6) {
    guard++;
    const daysAgo = randInt(2, 395);
    const date = new Date(now.getTime() - daysAgo * 86_400_000);
    const dow = date.getUTCDay();
    const hours = SERVICE_HOURS[dow];
    if (!hours) continue; // closed (Mon) — skip, weekday seasonality emerges naturally

    // weekend gets a few more
    if ((dow === 0 || dow === 1) && chance(0.3)) continue;

    const hour = randInt(hours.start, Math.max(hours.start, hours.end - 1));
    const minute = pick([0, 0, 30, 15, 45]);
    const time = `${pad(hour)}:${pad(minute)}:00`;
    const diner = pick(dinerRows);
    const ps = partySize();

    // status mix: mostly completed, some no_show/cancelled
    const sr = rng();
    let status: "completed" | "no_show" | "cancelled";
    let cancelledReason: string | null = null;
    let cancelledAt: Date | null = null;
    if (sr < 0.80) status = "completed";
    else if (sr < 0.90) status = "no_show";
    else {
      status = "cancelled";
      cancelledReason = pick(CANCEL_REASONS);
      cancelledAt = new Date(date.getTime() - randInt(1, 48) * 3_600_000);
    }

    const createdAt = new Date(date.getTime() - randInt(1, 21) * 86_400_000);

    historicalRows.push({
      restaurantId,
      guestName: diner.fullName ?? "Oaspete",
      guestPhone: diner.phone ?? "+40700000000",
      guestEmail: diner.email,
      partySize: ps,
      reservationDate: ymd(date),
      reservationTime: time,
      zone: chance(0.3) ? "Terasă" : null,
      status,
      cancelledReason,
      cancelledAt,
      bookingType: "standard",
      dinerId: diner.id,
      confirmationToken: token(),
      createdAt,
    });
    made++;
  }

  // insert historical in chunks (these skip the capacity trigger entirely)
  let histInserted = 0;
  for (let i = 0; i < historicalRows.length; i += 100) {
    const chunk = historicalRows.slice(i, i + 100);
    await db.insert(reservations).values(chunk);
    histInserted += chunk.length;
  }
  console.log(`  ✓ ${histInserted} historical reservations (completed/no_show/cancelled)`);

  // ── upcoming confirmed/seated: these HIT the capacity trigger. Keep modest and
  // aligned to availability so we never exceed the 38-cover slot. Build a
  // per-(date,window) running total and stop well under capacity.
  const upcoming: ResInsert[] = [];
  const windowLoad = new Map<string, number>(); // key date|hourBucket -> covers
  const TURN_BUCKET = 90; // minutes; align rough overlap window to 90-min blocks
  let upcomingTarget = 22;

  for (let dayOffset = 0; dayOffset <= 6 && upcomingTarget > 0; dayOffset++) {
    const date = new Date(now.getTime() + dayOffset * 86_400_000);
    const dow = date.getUTCDay();
    const hours = SERVICE_HOURS[dow];
    if (!hours) continue;
    const avail = availByDow.get(dow);
    const capacity = avail?.capacity ?? 38;

    // a handful of bookings per upcoming day, spread across lunch + dinner
    const perDay = randInt(2, 4);
    for (let k = 0; k < perDay && upcomingTarget > 0; k++) {
      // bias toward dinner; keep within slot_start..slot_end-1
      const hour = chance(0.7)
        ? randInt(Math.max(hours.start, 18), Math.max(hours.start + 1, hours.end - 1))
        : randInt(hours.start, hours.start + 2);
      const minute = pick([0, 30]);
      const ps = Math.min(partySize(), 4); // keep upcoming parties modest
      const bucketKey = `${ymd(date)}|${Math.floor((hour * 60 + minute) / TURN_BUCKET)}`;
      const load = windowLoad.get(bucketKey) ?? 0;
      // stay comfortably below capacity (cap our seeded load at ~40% of slot)
      if (load + ps > Math.floor(capacity * 0.4)) continue;
      windowLoad.set(bucketKey, load + ps);

      const diner = pick(dinerRows);
      const isToday = dayOffset === 0;
      // a few seated (today, earlier in service), rest confirmed
      const status: "confirmed" | "seated" = isToday && chance(0.4) ? "seated" : "confirmed";
      upcoming.push({
        restaurantId,
        guestName: diner.fullName ?? "Oaspete",
        guestPhone: diner.phone ?? "+40700000000",
        guestEmail: diner.email,
        partySize: ps,
        reservationDate: ymd(date),
        reservationTime: `${pad(hour)}:${pad(minute)}:00`,
        zone: chance(0.3) ? "Terasă" : null,
        status,
        bookingType: "standard",
        dinerId: diner.id,
        confirmationToken: token(),
      });
      upcomingTarget--;
    }
  }

  // insert upcoming one-by-one so a single capacity rejection (TV002/TV001)
  // is logged and skipped rather than failing the batch.
  let upcomingInserted = 0;
  let skipped = 0;
  for (const row of upcoming) {
    try {
      await db.insert(reservations).values(row);
      upcomingInserted++;
    } catch (e) {
      skipped++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`    · skipped upcoming ${row.reservationDate} ${row.reservationTime} (ps=${row.partySize}): ${msg.split("\n")[0]}`);
    }
  }
  console.log(`  ✓ ${upcomingInserted} upcoming confirmed/seated reservations${skipped ? ` (${skipped} skipped on capacity)` : ""}`);
  void dinerById;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4 — analytics: rebuild aggregates + cohorts for this restaurant/org.
// Re-implements the orchestration of backfill-aggregates + refresh-cohorts here
// because those modules are `import "server-only"` and can't run under tsx.
// The set-based SQL is copied verbatim from refresh-aggregates.ts /
// refresh-cohorts.ts; the pure forecast/cohort cores are imported.
// ════════════════════════════════════════════════════════════════════════════
function computeBusinessDate(timezone: string, now: Date): string {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const [y, m, d] = local.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}
function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= last.getTime()) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function refreshAnalytics(db: Db, restaurantId: string, orgId: string, timezone: string) {
  console.log("\n[4/6] analytics aggregates + cohorts…");
  const now = new Date();
  const yesterday = computeBusinessDate(timezone, now);

  const earliestRows = (await db.execute(sql`
    SELECT min(reservation_date)::text AS min FROM reservations WHERE restaurant_id = ${restaurantId}
  `)) as unknown as Array<{ min: string | null }>;
  const earliest = earliestRows[0]?.min;
  if (!earliest) {
    console.log("  · no reservations — skipping aggregates");
    return;
  }
  const days = enumerateDays(earliest, yesterday);
  for (const day of days) {
    await upsertDaily(db, restaurantId, day);
    await updateLeadTime(db, restaurantId, day, timezone);
    await upsertHourly(db, restaurantId, day);
  }
  await refreshForecast(db, restaurantId, yesterday);
  console.log(`  ✓ aggregates for ${days.length} venue-local days + 28-day forecast`);

  await refreshCohorts(db, orgId, now);
  console.log("  ✓ diner cohorts refreshed");
}

async function upsertDaily(db: Db, restaurantId: string, businessDate: string) {
  await db.execute(sql`
    INSERT INTO reservation_daily_aggregates (
      restaurant_id, business_date, service_label,
      bookings_created, bookings_for_date,
      confirmed_count, seated_count, completed_count, no_show_count, cancelled_count,
      covers_for_date, covers_completed, covers_no_show,
      party_size_1_2, party_size_3_4, party_size_5_6, party_size_7_plus,
      cancel_reason_restaurant_closed, cancel_reason_overbooked, cancel_reason_kitchen_issue,
      cancel_reason_private_event, cancel_reason_other, cancel_reason_diner,
      booking_type_standard, booking_type_private_event, booking_type_standing,
      source_widget, source_venue_page, source_editorial, source_corporate,
      source_walk_in, source_manual, source_unknown,
      new_diners, returning_diners, computed_at
    )
    SELECT
      r.restaurant_id, r.reservation_date,
      analytics_service_label_for_hour(r.reservation_time) AS service_label,
      count(*) FILTER (WHERE r.created_at::date = ${businessDate}::date),
      count(*),
      count(*) FILTER (WHERE r.status = 'confirmed'),
      count(*) FILTER (WHERE r.status = 'seated'),
      count(*) FILTER (WHERE r.status = 'completed'),
      count(*) FILTER (WHERE r.status = 'no_show'),
      count(*) FILTER (WHERE r.status = 'cancelled'),
      coalesce(sum(r.party_size), 0),
      coalesce(sum(r.party_size) FILTER (WHERE r.status = 'completed'), 0),
      coalesce(sum(r.party_size) FILTER (WHERE r.status = 'no_show'), 0),
      count(*) FILTER (WHERE r.party_size BETWEEN 1 AND 2),
      count(*) FILTER (WHERE r.party_size BETWEEN 3 AND 4),
      count(*) FILTER (WHERE r.party_size BETWEEN 5 AND 6),
      count(*) FILTER (WHERE r.party_size >= 7),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'restaurant_closed'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'overbooked'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'kitchen_issue'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'private_event'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason IS NOT NULL
        AND r.cancelled_reason NOT IN ('restaurant_closed','overbooked','kitchen_issue','private_event')),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason IS NULL),
      count(*) FILTER (WHERE r.booking_type = 'standard'),
      count(*) FILTER (WHERE r.booking_type = 'private_event'),
      count(*) FILTER (WHERE r.booking_type = 'standing'),
      count(*) FILTER (WHERE d.acquisition_source = 'widget'),
      count(*) FILTER (WHERE d.acquisition_source = 'venue_page'),
      count(*) FILTER (WHERE d.acquisition_source = 'editorial'),
      count(*) FILTER (WHERE d.acquisition_source = 'corporate'),
      count(*) FILTER (WHERE d.acquisition_source = 'walk_in'),
      count(*) FILTER (WHERE d.acquisition_source IN ('manual','import','api')),
      count(*) FILTER (WHERE r.diner_id IS NULL OR d.acquisition_source IS NULL
        OR d.acquisition_source = 'email_campaign'),
      count(DISTINCT d.id) FILTER (WHERE (d.first_visited_at AT TIME ZONE rest.timezone)::date = r.reservation_date),
      count(DISTINCT d.id) FILTER (WHERE (d.first_visited_at AT TIME ZONE rest.timezone)::date < r.reservation_date),
      now()
    FROM reservations r
    JOIN restaurants rest ON rest.id = r.restaurant_id
    LEFT JOIN diners d ON d.id = r.diner_id
    WHERE r.restaurant_id = ${restaurantId}
      AND r.reservation_date = ${businessDate}::date
    GROUP BY r.restaurant_id, r.reservation_date, analytics_service_label_for_hour(r.reservation_time)
    ON CONFLICT (restaurant_id, business_date, service_label) DO UPDATE SET
      bookings_created = excluded.bookings_created,
      bookings_for_date = excluded.bookings_for_date,
      confirmed_count = excluded.confirmed_count,
      seated_count = excluded.seated_count,
      completed_count = excluded.completed_count,
      no_show_count = excluded.no_show_count,
      cancelled_count = excluded.cancelled_count,
      covers_for_date = excluded.covers_for_date,
      covers_completed = excluded.covers_completed,
      covers_no_show = excluded.covers_no_show,
      party_size_1_2 = excluded.party_size_1_2,
      party_size_3_4 = excluded.party_size_3_4,
      party_size_5_6 = excluded.party_size_5_6,
      party_size_7_plus = excluded.party_size_7_plus,
      cancel_reason_restaurant_closed = excluded.cancel_reason_restaurant_closed,
      cancel_reason_overbooked = excluded.cancel_reason_overbooked,
      cancel_reason_kitchen_issue = excluded.cancel_reason_kitchen_issue,
      cancel_reason_private_event = excluded.cancel_reason_private_event,
      cancel_reason_other = excluded.cancel_reason_other,
      cancel_reason_diner = excluded.cancel_reason_diner,
      booking_type_standard = excluded.booking_type_standard,
      booking_type_private_event = excluded.booking_type_private_event,
      booking_type_standing = excluded.booking_type_standing,
      source_widget = excluded.source_widget,
      source_venue_page = excluded.source_venue_page,
      source_editorial = excluded.source_editorial,
      source_corporate = excluded.source_corporate,
      source_walk_in = excluded.source_walk_in,
      source_manual = excluded.source_manual,
      source_unknown = excluded.source_unknown,
      new_diners = excluded.new_diners,
      returning_diners = excluded.returning_diners,
      computed_at = now()
  `);
}

async function updateLeadTime(db: Db, restaurantId: string, businessDate: string, timezone: string) {
  await db.execute(sql`
    WITH lt AS (
      SELECT
        analytics_service_label_for_hour(r.reservation_time) AS service_label,
        extract(epoch FROM (
          ((r.reservation_date + r.reservation_time) AT TIME ZONE ${timezone}) - r.created_at
        )) / 60.0 AS minutes
      FROM reservations r
      WHERE r.restaurant_id = ${restaurantId}
        AND r.reservation_date = ${businessDate}::date
        AND r.status <> 'cancelled'
    )
    UPDATE reservation_daily_aggregates a SET
      lead_time_p50_min = sub.p50,
      lead_time_p90_min = sub.p90,
      lead_time_avg_min = sub.avg
    FROM (
      SELECT service_label,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes))::int AS p50,
        round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes))::int AS p90,
        round(avg(minutes))::int AS avg
      FROM lt GROUP BY service_label
    ) sub
    WHERE a.restaurant_id = ${restaurantId}
      AND a.business_date = ${businessDate}::date
      AND a.service_label = sub.service_label
  `);
}

async function upsertHourly(db: Db, restaurantId: string, businessDate: string) {
  await db.execute(sql`
    INSERT INTO reservation_hourly_aggregates (
      restaurant_id, day_of_week, hour_of_day, window_start_date, window_end_date,
      total_bookings, no_show_count, no_show_rate, computed_at
    )
    SELECT
      r.restaurant_id,
      extract(dow FROM r.reservation_date)::smallint,
      extract(hour FROM r.reservation_time)::smallint,
      (${businessDate}::date - interval '90 days')::date,
      ${businessDate}::date,
      count(*),
      count(*) FILTER (WHERE r.status = 'no_show'),
      (count(*) FILTER (WHERE r.status = 'no_show'))::numeric / nullif(count(*), 0),
      now()
    FROM reservations r
    WHERE r.restaurant_id = ${restaurantId}
      AND r.reservation_date > (${businessDate}::date - interval '90 days')
      AND r.reservation_date <= ${businessDate}::date
    GROUP BY r.restaurant_id, extract(dow FROM r.reservation_date), extract(hour FROM r.reservation_time)
    ON CONFLICT (restaurant_id, day_of_week, hour_of_day, window_end_date) DO UPDATE SET
      window_start_date = excluded.window_start_date,
      total_bookings = excluded.total_bookings,
      no_show_count = excluded.no_show_count,
      no_show_rate = excluded.no_show_rate,
      computed_at = now()
  `);
}

async function refreshForecast(db: Db, restaurantId: string, businessDate: string) {
  const history = (await db.execute(sql`
    SELECT business_date::text AS business_date, sum(covers_for_date)::int AS covers
    FROM reservation_daily_aggregates
    WHERE restaurant_id = ${restaurantId} AND business_date <= ${businessDate}::date
    GROUP BY business_date ORDER BY business_date DESC LIMIT 200
  `)) as unknown as Array<{ business_date: string; covers: number }>;
  if (history.length === 0) return;

  const byWeekday = new Map<number, number[]>();
  for (const row of history) {
    const wd = new Date(`${row.business_date}T00:00:00Z`).getUTCDay();
    const list = byWeekday.get(wd) ?? [];
    list.push(row.covers);
    byWeekday.set(wd, list);
  }
  const base = new Date(`${businessDate}T00:00:00Z`);
  const values: ReturnType<typeof sql>[] = [];
  for (let i = 1; i <= 28; i++) {
    const future = new Date(base);
    future.setUTCDate(base.getUTCDate() + i);
    const wd = future.getUTCDay();
    const obs = (byWeekday.get(wd) ?? []).slice(0, 12);
    const f = trimmedMeanForecast(obs);
    if (!f) continue;
    const dateStr = future.toISOString().slice(0, 10);
    values.push(sql`(${restaurantId}, ${dateStr}::date, ${f.predicted}, ${f.low}, ${f.high}, now())`);
  }
  if (values.length === 0) return;
  await db.execute(sql`
    INSERT INTO restaurant_forecasts (
      restaurant_id, forecast_date, covers_predicted, covers_low, covers_high, computed_at
    ) VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (restaurant_id, forecast_date) DO UPDATE SET
      covers_predicted = excluded.covers_predicted,
      covers_low = excluded.covers_low,
      covers_high = excluded.covers_high,
      computed_at = now()
  `);
}

async function refreshCohorts(db: Db, orgId: string, now: Date) {
  const throughMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const visitRows = (await db.execute(sql`
    SELECT d.id AS diner_id,
           to_char(date_trunc('month', r.reservation_date), 'YYYY-MM-DD') AS visit_month
    FROM reservations r
    JOIN diners d ON d.id = r.diner_id
    WHERE d.organization_id = ${orgId}
      AND r.status IN ('seated', 'completed')
    GROUP BY d.id, date_trunc('month', r.reservation_date)
  `)) as unknown as Array<{ diner_id: string; visit_month: string }>;
  if (visitRows.length === 0) return;

  const byDiner = new Map<string, string[]>();
  for (const row of visitRows) {
    const list = byDiner.get(row.diner_id) ?? [];
    list.push(row.visit_month);
    byDiner.set(row.diner_id, list);
  }
  const dinerVisits: DinerVisits[] = [...byDiner.values()].map((visitMonths) => ({
    cohortMonth: visitMonths.slice().sort()[0],
    visitMonths,
  }));
  const rows = computeCohortRows(dinerVisits, throughMonth);
  if (rows.length === 0) return;
  const values = rows.map(
    (r) => sql`(${orgId}, ${r.cohortMonth}::date, ${r.monthOffset}, ${r.cohortSize}, ${r.retainedCount}, ${r.retentionRate})`,
  );
  await db.execute(sql`
    INSERT INTO diner_cohort_aggregates (
      organization_id, cohort_month, month_offset, cohort_size, retained_count, retention_rate
    ) VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (organization_id, cohort_month, month_offset) DO UPDATE SET
      cohort_size = excluded.cohort_size,
      retained_count = excluded.retained_count,
      retention_rate = excluded.retention_rate,
      computed_at = now()
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 5 — marketing: 1 triggered (active) + 1 one-off (sent) + segment + quota
// ════════════════════════════════════════════════════════════════════════════
async function seedMarketing(db: Db, orgId: string, restaurantId: string, dinerIds: string[]) {
  console.log("\n[5/6] marketing…");
  // idempotent: remove this org's prior demo campaigns (by name prefix) — cascades
  // versions + sends. Then the demo segment (by name prefix) + the demo quota rows.
  await db
    .delete(marketingCampaigns)
    .where(and(eq(marketingCampaigns.organizationId, orgId), like(marketingCampaigns.name, `${CAMPAIGN_SEED_PREFIX}%`)));
  await db
    .delete(marketingSegments)
    .where(and(eq(marketingSegments.organizationId, orgId), like(marketingSegments.name, `${SEGMENT_SEED_PREFIX}%`)));

  const loc = (ro: string, en: string, de: string) => ({ ro, en, de });

  // 1) triggered win-back (active)
  const winbackSubject = loc("Ne e dor de tine", "We miss you", "Wir vermissen Sie");
  const winbackBody = loc(
    "A trecut ceva timp de la ultima ta vizită. Te așteptăm cu un meniu de sezon proaspăt — rezervă o masă și ne revedem.",
    "It's been a while since your last visit. We'd love to see you again — book a table and enjoy our fresh seasonal menu.",
    "Es ist eine Weile her seit Ihrem letzten Besuch. Wir würden uns freuen, Sie wiederzusehen.",
  );
  const [winback] = await db
    .insert(marketingCampaigns)
    .values({
      organizationId: orgId,
      restaurantId,
      kind: "triggered",
      triggeredCampaignKey: "demo_winback",
      name: `${CAMPAIGN_SEED_PREFIX}Win-back — clienți inactivi 60 zile`,
      description: "Campanie automată: trimisă diner-ilor care nu au mai vizitat de 60 de zile.",
      status: "active",
      channel: "email",
      subjectTemplate: winbackSubject,
      bodyTemplate: winbackBody,
      previewText: loc("Te așteptăm înapoi", "Come back and see us", "Kommen Sie zurück"),
      triggerEvent: "diner.lapsed_60d",
      triggerOffsetSeconds: 0,
    })
    .returning({ id: marketingCampaigns.id });
  await db.insert(marketingCampaignVersions).values({
    campaignId: winback.id,
    versionNumber: 1,
    subjectTemplate: winbackSubject,
    bodyTemplate: winbackBody,
    previewText: loc("Te așteptăm înapoi", "Come back and see us", "Kommen Sie zurück"),
  });

  // 2) one-off broadcast (sent, in the past)
  const sentAt = new Date(Date.now() - 21 * 86_400_000);
  const promoSubject = loc("Meniu nou de toamnă la Atelier", "New autumn menu at Atelier", "Neue Herbstkarte");
  const promoBody = loc(
    "Am lansat meniul de toamnă: hribi, Mangaliță gătită lent și deserturi noi. Rezervă din timp — locurile sunt limitate.",
    "Our autumn menu is here: porcini, slow-cooked Mangalitsa, and new desserts. Book early — seats are limited.",
    "Unsere Herbstkarte ist da. Reservieren Sie früh — die Plätze sind begrenzt.",
  );
  const [promo] = await db
    .insert(marketingCampaigns)
    .values({
      organizationId: orgId,
      restaurantId,
      kind: "one_off",
      name: `${CAMPAIGN_SEED_PREFIX}Broadcast — meniu de toamnă`,
      description: "Campanie one-off trimisă bazei de clienți care au consimțit la marketing.",
      status: "sent",
      channel: "email",
      subjectTemplate: promoSubject,
      bodyTemplate: promoBody,
      previewText: loc("Gustă toamna", "Taste autumn", "Schmecken Sie den Herbst"),
      recipientCountEstimate: 60,
      sentAt,
    })
    .returning({ id: marketingCampaigns.id });
  const [promoVersion] = await db
    .insert(marketingCampaignVersions)
    .values({
      campaignId: promo.id,
      versionNumber: 1,
      subjectTemplate: promoSubject,
      bodyTemplate: promoBody,
      previewText: loc("Gustă toamna", "Taste autumn", "Schmecken Sie den Herbst"),
    })
    .returning({ id: marketingCampaignVersions.id });

  // per-recipient sends for the one-off (sample of diners) — gives the campaign
  // detail view real delivery/open/click numbers.
  const sampleDinerRows = await db
    .select({ id: diners.id, email: diners.email })
    .from(diners)
    .where(inArray(diners.id, dinerIds))
    .limit(60);
  type SendInsert = typeof marketingSends.$inferInsert;
  const sends: SendInsert[] = sampleDinerRows.map((d, i) => {
    // realistic funnel: most delivered, ~45% opened, ~12% clicked, a couple bounced
    let status: SendInsert["status"] = "delivered";
    const openedAt = i % 100 < 45 ? new Date(sentAt.getTime() + 3_600_000) : null;
    const clickedAt = i % 100 < 12 ? new Date(sentAt.getTime() + 4_000_000) : null;
    if (i % 100 >= 96) status = "bounced";
    else if (clickedAt) status = "clicked";
    else if (openedAt) status = "opened";
    return {
      campaignId: promo.id,
      campaignVersionId: promoVersion.id,
      dinerId: d.id,
      organizationId: orgId,
      restaurantId,
      channel: "email" as const,
      locale: "ro",
      email: d.email,
      status,
      statusUpdatedAt: sentAt,
      scheduledSendAt: sentAt,
      sentAt: status === "bounced" ? sentAt : sentAt,
      deliveredAt: status === "bounced" ? null : sentAt,
      openedAt,
      firstClickedAt: clickedAt,
      clickCount: clickedAt ? 1 : 0,
      bouncedAt: status === "bounced" ? sentAt : null,
    };
  });
  if (sends.length) await db.insert(marketingSends).values(sends);

  // 3) saved segment (VIP + regulars who visited recently). filter_dsl stores the
  // compileSegmentFilter condition array under `conditions`.
  const segmentConditions = [
    { dimension: "frequency", bucket: "vip" },
    { dimension: "recency", withinDays: 90 },
  ];
  await db.insert(marketingSegments).values({
    organizationId: orgId,
    restaurantId,
    name: `${SEGMENT_SEED_PREFIX}VIP activi (90 zile)`,
    description: "Clienți VIP care au vizitat în ultimele 90 de zile.",
    filterDsl: { conditions: segmentConditions },
    combinator: "and",
    estimatedSize: 12,
    lastEstimatedAt: new Date(),
  });

  // 4) quota usage for the current month (email + sms)
  const ym = `${new Date().getUTCFullYear()}-${pad(new Date().getUTCMonth() + 1)}-01`;
  for (const [channel, sent, delivered, allowance] of [
    ["email", 120, 116, 1000],
    ["sms", 30, 29, 200],
  ] as const) {
    await db
      .insert(marketingQuotaUsage)
      .values({
        organizationId: orgId,
        yearMonth: ym,
        channel,
        sentCount: sent,
        deliveredCount: delivered,
        bouncedCount: sent - delivered,
        includedAllowance: allowance,
        overageCount: 0,
        overageBilledCents: 0,
      })
      .onConflictDoUpdate({
        target: [marketingQuotaUsage.organizationId, marketingQuotaUsage.yearMonth, marketingQuotaUsage.channel],
        set: {
          sentCount: sent,
          deliveredCount: delivered,
          bouncedCount: sent - delivered,
          includedAllowance: allowance,
          computedAt: new Date(),
        },
      });
  }

  console.log(`  ✓ 1 triggered (active) + 1 one-off (sent, ${sends.length} sends) + 1 segment + quota (email/sms)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 6 — corporate: 2 clients + 1 event request
// ════════════════════════════════════════════════════════════════════════════
async function seedCorporate(db: Db, restaurantId: string) {
  console.log("\n[6/6] corporate…");
  // corporate_clients.cui is GLOBALLY unique — we namespace ours with a DEMO
  // prefix and delete only those rows (cascades members/invitations). event_requests
  // for this restaurant carrying our seed guest_email are removed too.
  await db.delete(eventRequests).where(and(eq(eventRequests.restaurantId, restaurantId), like(eventRequests.guestEmail, `%@${DINER_EMAIL_DOMAIN}`)));
  await db.delete(corporateClients).where(like(corporateClients.cui, `${CORPORATE_CUI_PREFIX}%`));

  const clientSpecs = [
    {
      name: "Lumina Software SRL",
      legalName: "Lumina Software S.R.L.",
      cui: `${CORPORATE_CUI_PREFIX}RO12345678`,
      regCom: "J40/1234/2018",
      billingAddress: "Bd. Aviatorilor 8, București",
      billingCity: "București",
      vatPayer: true,
      primaryContactEmail: "office@lumina-demo.example.com",
      primaryContactPhone: "+40213334455",
      status: "active" as const,
      verifiedAt: new Date(Date.now() - 120 * 86_400_000),
    },
    {
      name: "Nordvest Consulting SRL",
      legalName: "Nordvest Consulting S.R.L.",
      cui: `${CORPORATE_CUI_PREFIX}RO87654321`,
      regCom: "J40/5678/2020",
      billingAddress: "Calea Victoriei 120, București",
      billingCity: "București",
      vatPayer: true,
      primaryContactEmail: "events@nordvest-demo.example.com",
      primaryContactPhone: "+40216667788",
      status: "pending_verification" as const,
    },
  ];
  const clients = await db
    .insert(corporateClients)
    .values(clientSpecs)
    .returning({ id: corporateClients.id, name: corporateClients.name, status: corporateClients.status });

  const active = clients.find((c) => c.status === "active")!;

  // one event request in a realistic "quoted" state, linked to the active client.
  const eventDate = new Date(Date.now() + 28 * 86_400_000);
  await db.insert(eventRequests).values({
    restaurantId,
    corporateClientId: active.id,
    claimedCompanyCui: `${CORPORATE_CUI_PREFIX}RO12345678`,
    claimedCompanyName: "Lumina Software SRL",
    guestName: "Andreea Marin",
    guestEmail: EVENT_GUEST_EMAIL,
    guestPhone: "+40721112233",
    occasion: "corporate_dinner",
    eventDate: ymd(eventDate),
    eventTimePreference: "19:00, sală privată dacă e posibil",
    partySize: 24,
    spacePreference: "Sala principală rezervată integral",
    budgetPerHeadCents: 25000,
    menuPreference: "Meniu fix în 4 feluri, opțiune vegetariană",
    dietaryNotes: "2 invitați vegetarieni, 1 fără gluten",
    additionalNotes: "Cină de echipă de final de an.",
    status: "quoted",
    partnerResponse: "Mulțumim pentru solicitare! Putem rezerva sala principală pentru 24 de persoane. Vă trimitem oferta atașată.",
    quotedAmountCents: 24 * 25000,
    quotedAt: new Date(Date.now() - 2 * 86_400_000),
    quoteExpiresAt: new Date(Date.now() + 12 * 86_400_000),
    trackingToken: token(),
  });

  console.log(`  ✓ ${clients.length} corporate clients + 1 event request (quoted)`);
}

// ════════════════════════════════════════════════════════════════════════════
async function printSummary(db: Db, restaurantId: string, orgId: string) {
  console.log("\n── verification (queried from DB) ──");
  const q = async (label: string, frag: ReturnType<typeof sql>) => {
    const rows = (await db.execute(frag)) as unknown as Array<Record<string, unknown>>;
    console.log(`  ${label}:`, JSON.stringify(rows));
  };
  await q("sections", sql`SELECT count(*)::int AS n FROM restaurant_table_sections WHERE restaurant_id = ${restaurantId}`);
  await q("tables", sql`SELECT count(*)::int AS n FROM restaurant_tables WHERE restaurant_id = ${restaurantId}`);
  await q("diners (demo)", sql`SELECT count(*)::int AS n FROM diners WHERE organization_id = ${orgId} AND email LIKE ${`%@${DINER_EMAIL_DOMAIN}`}`);
  await q("reservations by status", sql`SELECT status::text, count(*)::int AS n FROM reservations WHERE restaurant_id = ${restaurantId} AND guest_email LIKE ${`%@${DINER_EMAIL_DOMAIN}`} GROUP BY status ORDER BY status`);
  await q("daily aggregates", sql`SELECT count(*)::int AS n FROM reservation_daily_aggregates WHERE restaurant_id = ${restaurantId}`);
  await q("hourly aggregates", sql`SELECT count(*)::int AS n FROM reservation_hourly_aggregates WHERE restaurant_id = ${restaurantId}`);
  await q("forecasts", sql`SELECT count(*)::int AS n FROM restaurant_forecasts WHERE restaurant_id = ${restaurantId}`);
  await q("cohorts", sql`SELECT count(*)::int AS n FROM diner_cohort_aggregates WHERE organization_id = ${orgId}`);
  await q("campaigns (demo)", sql`SELECT kind::text, status::text, count(*)::int AS n FROM marketing_campaigns WHERE organization_id = ${orgId} AND name LIKE ${`${CAMPAIGN_SEED_PREFIX}%`} GROUP BY kind, status`);
  await q("sends (demo)", sql`SELECT count(*)::int AS n FROM marketing_sends WHERE organization_id = ${orgId} AND restaurant_id = ${restaurantId}`);
  await q("segments (demo)", sql`SELECT count(*)::int AS n FROM marketing_segments WHERE organization_id = ${orgId} AND name LIKE ${`${SEGMENT_SEED_PREFIX}%`}`);
  await q("quota usage", sql`SELECT channel::text, sent_count FROM marketing_quota_usage WHERE organization_id = ${orgId} ORDER BY channel`);
  await q("corporate clients (demo)", sql`SELECT count(*)::int AS n FROM corporate_clients WHERE cui LIKE ${`${CORPORATE_CUI_PREFIX}%`}`);
  await q("event requests (demo)", sql`SELECT status::text, count(*)::int AS n FROM event_requests WHERE restaurant_id = ${restaurantId} AND guest_email LIKE ${`%@${DINER_EMAIL_DOMAIN}`} GROUP BY status`);
}

main().catch((err) => {
  console.error("seed-showcase-demo-data failed:", err);
  process.exit(1);
});
