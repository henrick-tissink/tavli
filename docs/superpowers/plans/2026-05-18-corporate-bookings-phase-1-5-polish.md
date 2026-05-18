# Corporate Bookings — Phase 1.5 (Visible Depth) Polish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Visual work also requires `superpowers:frontend-design`** loaded for each UI task to keep design quality consistent.

**Goal:** Take the Phase 1 corporate-bookings UI from "contact form with extra steps" to "visible product depth" — premium-feeling consumer flow, partner SaaS surfaces that justify subscription, screens that hold up against side-by-side comparison with ialoc.

**Architecture:** No production schema rewrites — keep Phase 1's state machine, repos, RLS, and actions untouched. One new lightweight table (`restaurant_private_spaces`) so the venue's actual rooms drive the consumer picker. One new table (`event_request_quote_line_items`) so the partner quote builder shows a real breakdown. All other lift is component-level: replace native form controls with bespoke composers, restructure layouts, add motion, hook up data that already exists (`budget_per_head_guidance`, ANAF lookup, partner identity, quote expiry).

**Tech Stack:** Next.js 16.2.4 App Router (server components default), Drizzle ORM 0.45.2 + raw-SQL Supabase migrations, Tailwind v4 with the existing brand tokens (`--color-brand-primary`, `--container-content`, etc.), Framer Motion 11 (new dep) for sheet/timeline transitions, `react-day-picker` 9 (new dep) for the custom calendar, Jest 30 + RTL for structure tests, Playwright 1.60 for visual smoke tests against the live dev server.

**Out of scope:**
- Phase 2a corporate accounts (`/companies/*`) — separate plan.
- Inline buyer↔partner message thread on tracking page — needs `event_request_messages` table; flagged at Task 27.
- Booking-density / popular-dates heat map — needs historical event data; ship after first 50 bookings.
- "Comparable venue quoted" anchoring — needs price history; same dependency.
- Mobile native apps; trilingual EN+DE rollout (Phase 1.5 stays RO).

---

## File Map

**New files:**

Schema + migration:
- `drizzle/migrations/0010_private_spaces_and_quote_lines.sql`
- `drizzle/migrations/meta/0010_snapshot.json` (auto-generated)

Schema definitions (modify existing):
- `src/lib/db/schema.ts` — add `restaurantPrivateSpaces`, `eventRequestQuoteLineItems`.

Repos:
- `src/lib/repos/private-spaces-repo.ts`
- `src/lib/repos/quote-line-items-repo.ts`
- `src/lib/repos/__tests__/private-spaces-repo.test.ts`
- `src/lib/repos/__tests__/quote-line-items-repo.test.ts`

Consumer components (new):
- `src/components/event-request-sheet-v2/index.tsx` — orchestrator.
- `src/components/event-request-sheet-v2/StepOccasion.tsx`
- `src/components/event-request-sheet-v2/StepDate.tsx`
- `src/components/event-request-sheet-v2/StepDetails.tsx`
- `src/components/event-request-sheet-v2/StepIdentity.tsx`
- `src/components/event-request-sheet-v2/StepSent.tsx`
- `src/components/event-request-sheet-v2/SheetProgress.tsx`
- `src/components/event-request-sheet-v2/OccasionCard.tsx`
- `src/components/event-request-sheet-v2/RoomPickerTile.tsx`
- `src/components/event-request-sheet-v2/CuiLookupField.tsx`
- `src/components/event-request-cta-v2.tsx`
- `src/components/event-request-sheet-v2/__tests__/*.test.tsx` (one per step)

Consumer pages (modify existing):
- `src/app/event-requests/[token]/TrackingClient.tsx` — full rewrite as `TrackingClientV2`.
- `src/app/event-requests/[token]/__tests__/TrackingClient.test.tsx`
- `src/app/[city]/events/page.tsx` — editorial header + browse-by-occasion.
- `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` — swap CTA to v2.
- `src/components/event-request-cta.tsx` — keep as v1 fallback; v2 lives in `event-request-cta-v2.tsx`.

Tracking page sub-components (new):
- `src/components/tracking/StatusTimeline.tsx`
- `src/components/tracking/QuoteExpiryCountdown.tsx`
- `src/components/tracking/PartnerIdentityBadge.tsx`
- `src/components/tracking/__tests__/StatusTimeline.test.tsx`

Partner components (modify):
- `src/components/partner/EventRequestInbox.tsx` — full rewrite as card stream.
- `src/components/partner/EventRequestDetail.tsx` — full rewrite.
- `src/components/partner/QuoteForm.tsx` — full rewrite as line-item builder.
- `src/components/partner/MaterializeReservationForm.tsx` — visual time-slot picker.
- `src/components/partner/__tests__/EventRequestInbox.test.tsx`
- `src/components/partner/__tests__/QuoteBuilder.test.tsx`
- `src/components/partner/EventRequestCard.tsx` (new — used by inbox)
- `src/components/partner/RevenueEstimateWidget.tsx` (new — used by detail)
- `src/components/partner/QuoteLineItemRow.tsx` (new — used by quote form)

Partner sub-routes (new):
- `src/app/partner/(dashboard)/corporate/spaces/page.tsx` — CRUD for private spaces.
- `src/app/partner/(dashboard)/corporate/spaces/actions.ts`
- `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts`

Server actions (modify):
- `src/app/api/event-requests/actions.ts` — extend `submitEventRequestDraft` to accept `privateSpaceId`; extend `sendQuote` to accept line items.
- `src/app/api/event-requests/__tests__/actions.test.ts` — add coverage.

Brand tokens (modify):
- `src/styles/tokens.css` — add `--color-occasion-wedding`, `--color-occasion-corporate`, etc. for the new occasion-typed accent palette.

Dependencies (modify):
- `package.json` — add `framer-motion`, `react-day-picker`.

E2E (modify):
- `e2e/event-requests.spec.ts` — extend the (still-skipped) happy path to walk v2 selectors.

---

## Tasks

### Task 1: Schema — private_spaces + quote_line_items tables

**Files:**
- Create: `drizzle/migrations/0010_private_spaces_and_quote_lines.sql`
- Modify: `src/lib/db/schema.ts` (append two `pgTable` definitions and re-export)

- [ ] **Step 1: Write the migration**

```sql
-- 0010_private_spaces_and_quote_lines.sql
-- Phase 1.5: lightweight rooms catalogue + quote breakdown.

CREATE TABLE "restaurant_private_spaces" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"  UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "name"           VARCHAR(120) NOT NULL,
  "description"    TEXT,
  "capacity_min"   INTEGER NOT NULL,
  "capacity_max"   INTEGER NOT NULL,
  "photo_storage_path" TEXT,
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "rps_capacity_order" CHECK ("capacity_min" <= "capacity_max")
);

CREATE INDEX "rps_restaurant_active_idx"
  ON "restaurant_private_spaces" ("restaurant_id")
  WHERE "is_active" = TRUE;

ALTER TABLE "event_requests"
  ADD COLUMN "private_space_id" UUID REFERENCES "restaurant_private_spaces"("id") ON DELETE SET NULL;

CREATE TABLE "event_request_quote_line_items" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_request_id" UUID NOT NULL REFERENCES "event_requests"("id") ON DELETE CASCADE,
  "label"            VARCHAR(160) NOT NULL,
  "amount_cents"     INTEGER NOT NULL,
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX "erqli_event_request_idx"
  ON "event_request_quote_line_items" ("event_request_id", "sort_order");

ALTER TABLE "restaurant_private_spaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_request_quote_line_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_spaces_public_read" ON "restaurant_private_spaces" FOR SELECT
  USING ("is_active" = TRUE AND EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."status" = 'live'
  ));

CREATE POLICY "private_spaces_owner_write" ON "restaurant_private_spaces" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE POLICY "quote_lines_visible_with_request" ON "event_request_quote_line_items" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "event_requests" er
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
  ));

CREATE POLICY "quote_lines_owner_write" ON "event_request_quote_line_items" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "event_requests" er
    JOIN "restaurants" r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "event_requests" er
    JOIN "restaurants" r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE TRIGGER "trg_restaurant_private_spaces_touch_updated_at"
  BEFORE UPDATE ON "restaurant_private_spaces"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();
```

- [ ] **Step 2: Apply locally and confirm**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f drizzle/migrations/0010_private_spaces_and_quote_lines.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` (×4), `CREATE TRIGGER` — no errors.

- [ ] **Step 3: Add Drizzle definitions**

Append to `src/lib/db/schema.ts` (above the closing exports):

```ts
export const restaurantPrivateSpaces = pgTable("restaurant_private_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  capacityMin: integer("capacity_min").notNull(),
  capacityMax: integer("capacity_max").notNull(),
  photoStoragePath: text("photo_storage_path"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rps_restaurant_active_idx").on(t.restaurantId).where(sql`${t.isActive} = TRUE`),
]);

export const eventRequestQuoteLineItems = pgTable("event_request_quote_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventRequestId: uuid("event_request_id")
    .notNull()
    .references(() => eventRequests.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 160 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("erqli_event_request_idx").on(t.eventRequestId, t.sortOrder),
]);
```

Also add `privateSpaceId: uuid("private_space_id").references(() => restaurantPrivateSpaces.id, { onDelete: "set null" }),` to the `eventRequests` table definition.

- [ ] **Step 4: Reconcile journal/snapshot**

```bash
npm run db:generate
```

Expected: a new auto-tag (e.g., `0010_*`). Delete the auto-generated SQL file, rename `_journal.json` idx-10 tag to `0010_private_spaces_and_quote_lines`, keep the snapshot, fix `prevId` if needed (see commits `47eaffc`, `85d7949` for the established pattern).

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/0010_private_spaces_and_quote_lines.sql \
        drizzle/migrations/meta/_journal.json \
        drizzle/migrations/meta/0010_snapshot.json \
        src/lib/db/schema.ts
git commit -m "feat(schema): private_spaces + quote line items for Phase 1.5"
```

Production migration apply: hold for explicit user authorization (per the deploy convention).

---

### Task 2: Repo — `private-spaces-repo.ts`

**Files:**
- Create: `src/lib/repos/private-spaces-repo.ts`
- Test:   `src/lib/repos/__tests__/private-spaces-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repos/__tests__/private-spaces-repo.test.ts
/** @jest-environment node */
import { dbAdmin } from "@/lib/db/admin";
import { cities, restaurants } from "@/lib/db/schema";
import {
  createPrivateSpace,
  listActiveSpacesForVenue,
  updatePrivateSpace,
  deactivatePrivateSpace,
} from "../private-spaces-repo";

async function seedVenue() {
  await dbAdmin.insert(cities)
    .values({ slug: "ps", name: "PS", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ps-${Date.now()}`, name: "PS", cityId: c.id, status: "live",
  }).returning();
  return r;
}

describe("private-spaces-repo", () => {
  it("creates, lists, updates, and soft-deletes a space", async () => {
    const r = await seedVenue();
    const created = await createPrivateSpace({
      restaurantId: r.id,
      name: "Sala Verde",
      description: "Sala intimă cu vedere la grădină",
      capacityMin: 10,
      capacityMax: 20,
      photoStoragePath: null,
    });
    expect(created.name).toBe("Sala Verde");

    const listed = await listActiveSpacesForVenue(r.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const updated = await updatePrivateSpace(created.id, { capacityMax: 24 });
    expect(updated.capacityMax).toBe(24);

    await deactivatePrivateSpace(created.id);
    const afterDelete = await listActiveSpacesForVenue(r.id);
    expect(afterDelete).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/lib/repos/__tests__/private-spaces-repo.test.ts --forceExit
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the repo**

```ts
// src/lib/repos/private-spaces-repo.ts
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPrivateSpaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

type Space = typeof restaurantPrivateSpaces.$inferSelect;

export interface CreateSpaceInput {
  restaurantId: string;
  name: string;
  description?: string | null;
  capacityMin: number;
  capacityMax: number;
  photoStoragePath?: string | null;
  sortOrder?: number;
}

export async function createPrivateSpace(input: CreateSpaceInput): Promise<Space> {
  const [row] = await dbAdmin.insert(restaurantPrivateSpaces).values({
    restaurantId: input.restaurantId,
    name: input.name,
    description: input.description ?? null,
    capacityMin: input.capacityMin,
    capacityMax: input.capacityMax,
    photoStoragePath: input.photoStoragePath ?? null,
    sortOrder: input.sortOrder ?? 0,
  }).returning();
  return row;
}

export async function listActiveSpacesForVenue(restaurantId: string): Promise<Space[]> {
  return dbAdmin
    .select()
    .from(restaurantPrivateSpaces)
    .where(and(
      eq(restaurantPrivateSpaces.restaurantId, restaurantId),
      eq(restaurantPrivateSpaces.isActive, true),
    ))
    .orderBy(asc(restaurantPrivateSpaces.sortOrder), asc(restaurantPrivateSpaces.capacityMin));
}

export async function updatePrivateSpace(
  id: string,
  patch: Partial<Pick<Space, "name" | "description" | "capacityMin" | "capacityMax" | "photoStoragePath" | "sortOrder">>,
): Promise<Space> {
  const [row] = await dbAdmin
    .update(restaurantPrivateSpaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(restaurantPrivateSpaces.id, id))
    .returning();
  return row;
}

export async function deactivatePrivateSpace(id: string): Promise<void> {
  await dbAdmin
    .update(restaurantPrivateSpaces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(restaurantPrivateSpaces.id, id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest src/lib/repos/__tests__/private-spaces-repo.test.ts --forceExit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/private-spaces-repo.ts src/lib/repos/__tests__/private-spaces-repo.test.ts
git commit -m "feat(repos): private-spaces-repo with active/inactive lifecycle"
```

---

### Task 3: Repo — `quote-line-items-repo.ts`

**Files:**
- Create: `src/lib/repos/quote-line-items-repo.ts`
- Test:   `src/lib/repos/__tests__/quote-line-items-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repos/__tests__/quote-line-items-repo.test.ts
/** @jest-environment node */
import { dbAdmin } from "@/lib/db/admin";
import { cities, eventRequests, restaurants } from "@/lib/db/schema";
import { randomBytes } from "node:crypto";
import {
  replaceLineItems,
  listLineItems,
  sumLineItemCents,
} from "../quote-line-items-repo";

async function seedRequest() {
  await dbAdmin.insert(cities).values({ slug: "ql", name: "Q", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ql-${Date.now()}`, name: "Q", cityId: c.id, status: "live",
  }).returning();
  const [er] = await dbAdmin.insert(eventRequests).values({
    restaurantId: r.id, guestName: "G", guestEmail: "g@t.co",
    occasion: "wedding", eventDate: "2026-09-15", partySize: 20,
    status: "viewing", trackingToken: randomBytes(32).toString("hex"),
  }).returning();
  return er;
}

describe("quote-line-items-repo", () => {
  it("replaces lines atomically and totals correctly", async () => {
    const er = await seedRequest();
    await replaceLineItems(er.id, [
      { label: "Meniu standard", amountCents: 250_00 * 20 },
      { label: "Welcome cocktail", amountCents: 25_00 * 20 },
    ]);
    const lines = await listLineItems(er.id);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.label)).toEqual(["Meniu standard", "Welcome cocktail"]);
    expect(await sumLineItemCents(er.id)).toBe(275_00 * 20);

    // Replacing must wipe the previous lines.
    await replaceLineItems(er.id, [{ label: "Forfetar", amountCents: 6000_00 }]);
    expect(await listLineItems(er.id)).toHaveLength(1);
    expect(await sumLineItemCents(er.id)).toBe(6000_00);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/lib/repos/__tests__/quote-line-items-repo.test.ts --forceExit
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the repo**

```ts
// src/lib/repos/quote-line-items-repo.ts
import { dbAdmin } from "@/lib/db/admin";
import { eventRequestQuoteLineItems } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

type Line = typeof eventRequestQuoteLineItems.$inferSelect;

export interface NewLine {
  label: string;
  amountCents: number;
}

export async function replaceLineItems(
  eventRequestId: string,
  lines: NewLine[],
): Promise<void> {
  await dbAdmin.transaction(async (tx) => {
    await tx
      .delete(eventRequestQuoteLineItems)
      .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId));
    if (lines.length === 0) return;
    await tx.insert(eventRequestQuoteLineItems).values(
      lines.map((l, idx) => ({
        eventRequestId,
        label: l.label,
        amountCents: l.amountCents,
        sortOrder: idx,
      })),
    );
  });
}

export async function listLineItems(eventRequestId: string): Promise<Line[]> {
  return dbAdmin
    .select()
    .from(eventRequestQuoteLineItems)
    .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId))
    .orderBy(asc(eventRequestQuoteLineItems.sortOrder));
}

export async function sumLineItemCents(eventRequestId: string): Promise<number> {
  const [{ total }] = await dbAdmin
    .select({ total: sql<number>`COALESCE(SUM(${eventRequestQuoteLineItems.amountCents}), 0)::int` })
    .from(eventRequestQuoteLineItems)
    .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId));
  return total;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest src/lib/repos/__tests__/quote-line-items-repo.test.ts --forceExit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/quote-line-items-repo.ts src/lib/repos/__tests__/quote-line-items-repo.test.ts
git commit -m "feat(repos): quote-line-items-repo with atomic replace"
```

---

### Task 4: Extend `sendQuote` action to persist line items

**Files:**
- Modify: `src/app/api/event-requests/actions.ts` (the `sendQuoteSchema` + `sendQuoteForEventRequest` function)
- Modify: `src/app/api/event-requests/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/event-requests/__tests__/actions.test.ts`:

```ts
it("sendQuote persists line items and stores their total on the row", async () => {
  const r = await seedVenue();
  const er = await createEventRequestDraft({
    restaurantId: r.id, guestName: "G", guestEmail: "g@t.co",
    occasion: "wedding", eventDate: "2026-09-15", partySize: 20,
  });
  await promoteDraftToNew(er.id, (await seedConsumerProfile("ql")).id);
  await markViewing(er.id);
  await sendQuoteForEventRequest({
    id: er.id,
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    lineItems: [
      { label: "Meniu standard", amountCents: 250_00 * 20 },
      { label: "Welcome cocktail", amountCents: 25_00 * 20 },
    ],
    partnerResponse: "Mulțumim, atașat e meniul.",
  });
  const [row] = await dbAdmin.select().from(eventRequests).where(eq(eventRequests.id, er.id));
  expect(row.status).toBe("quoted");
  expect(row.quotedAmountCents).toBe(275_00 * 20);
  const lines = await listLineItems(er.id);
  expect(lines).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts --forceExit
```

Expected: FAIL — `sendQuoteForEventRequest` doesn't accept `lineItems`.

- [ ] **Step 3: Modify the action**

Update `sendQuoteSchema` to add a discriminated `lineItems` array; update the action body:

```ts
const sendQuoteSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string(),
  lineItems: z.array(z.object({
    label: z.string().min(1).max(160),
    amountCents: z.number().int().min(0).max(100_000_00),
  })).min(1).max(20),
  partnerResponse: z.string().max(2000).optional(),
});

export async function sendQuoteForEventRequest(
  input: z.infer<typeof sendQuoteSchema>,
): Promise<EventRequest> {
  const data = sendQuoteSchema.parse(input);
  const { restaurantId: _ } = await assertPartnerOwns(data.id);
  const total = data.lineItems.reduce((acc, l) => acc + l.amountCents, 0);
  return dbAdmin.transaction(async (_tx) => {
    await replaceLineItems(data.id, data.lineItems);
    const updated = await sendQuote(data.id, {
      amountCents: total,
      expiresAt: new Date(data.expiresAt),
      partnerResponse: data.partnerResponse,
    });
    return updated;
  });
}
```

Add the import: `import { replaceLineItems } from "@/lib/repos/quote-line-items-repo";`

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest src/app/api/event-requests/__tests__/actions.test.ts --forceExit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/event-requests/actions.ts src/app/api/event-requests/__tests__/actions.test.ts
git commit -m "feat(actions): sendQuote persists line items and totals from them"
```

---

### Task 5: Extend `submitEventRequestDraft` action to accept `privateSpaceId`

**Files:**
- Modify: `src/app/api/event-requests/actions.ts` (the `submitEventRequestDraftSchema` + draft insert)
- Modify: `src/lib/repos/event-requests-repo.ts` (createEventRequestDraft signature)
- Modify: existing tests

- [ ] **Step 1: Write the failing test**

Append to `src/lib/repos/__tests__/event-requests-repo.test.ts`:

```ts
it("createEventRequestDraft stores privateSpaceId when supplied", async () => {
  const r = await seedRestaurant();
  const [space] = await dbAdmin.insert(restaurantPrivateSpaces).values({
    restaurantId: r.id, name: "Sala Roșie", capacityMin: 10, capacityMax: 30,
  }).returning();
  const er = await createEventRequestDraft({
    restaurantId: r.id, guestName: "G", guestEmail: "g@t.co",
    occasion: "wedding", eventDate: "2026-09-15", partySize: 20,
    privateSpaceId: space.id,
  });
  expect(er.privateSpaceId).toBe(space.id);
});
```

Add `restaurantPrivateSpaces` to the schema imports at the top of the file.

- [ ] **Step 2: Run the test, expect FAIL**

```bash
npx jest src/lib/repos/__tests__/event-requests-repo.test.ts -t "privateSpaceId" --forceExit
```

Expected: FAIL — `createEventRequestDraft` doesn't accept `privateSpaceId`.

- [ ] **Step 3: Update repo + action**

In `src/lib/repos/event-requests-repo.ts`, extend the `CreateEventRequestDraftInput` interface with `privateSpaceId?: string | null;` and the insert with `privateSpaceId: input.privateSpaceId ?? null,`.

In `src/app/api/event-requests/actions.ts`, extend `submitEventRequestDraftSchema` with `privateSpaceId: z.string().uuid().optional(),` and pass it through to `createEventRequestDraft`.

- [ ] **Step 4: Run the test, expect PASS**

```bash
npx jest src/lib/repos/__tests__/event-requests-repo.test.ts --forceExit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/event-requests-repo.ts \
        src/app/api/event-requests/actions.ts \
        src/lib/repos/__tests__/event-requests-repo.test.ts
git commit -m "feat(actions): wire privateSpaceId through draft submission"
```

---

### Task 6: Partner CRUD page for private spaces

**Files:**
- Create: `src/app/partner/(dashboard)/corporate/spaces/page.tsx`
- Create: `src/app/partner/(dashboard)/corporate/spaces/actions.ts`
- Create: `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts`
- Modify: `src/components/partner/PartnerSidebar.tsx` (add nav entry under Corporate)

- [ ] **Step 1: Write the action tests**

```ts
// src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts
/** @jest-environment node */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, profiles, restaurants, restaurantPrivateSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
import { createSpaceAction, updateSpaceAction, deactivateSpaceAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@spaces.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin.update(profiles).set({ role: "restaurant_owner" }).where(eq(profiles.id, data!.user!.id));
  await dbAdmin.insert(cities).values({ slug: "sp", name: "S", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `sp-${Date.now()}`, name: "S", cityId: c.id, status: "live", ownerUserId: data!.user!.id,
  }).returning();
  mockSession.mockResolvedValue({ userId: data!.user!.id, userEmail: email,
    profile: { id: data!.user!.id, role: "restaurant_owner", email } } as never);
  return { userId: data!.user!.id, restaurantId: r.id };
}

describe("private-spaces partner actions", () => {
  it("owner creates, updates, deactivates a space", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createSpaceAction({
      restaurantId, name: "Sala Verde", capacityMin: 10, capacityMax: 20, description: "",
    });
    expect(created.ok).toBe(true);
    const [row] = await dbAdmin.select().from(restaurantPrivateSpaces).where(eq(restaurantPrivateSpaces.restaurantId, restaurantId));
    expect(row.name).toBe("Sala Verde");

    await updateSpaceAction({ id: row.id, name: "Sala Verde Renovată", capacityMax: 22 });
    const [after] = await dbAdmin.select().from(restaurantPrivateSpaces).where(eq(restaurantPrivateSpaces.id, row.id));
    expect(after.name).toBe("Sala Verde Renovată");
    expect(after.capacityMax).toBe(22);

    await deactivateSpaceAction({ id: row.id });
    const [gone] = await dbAdmin.select().from(restaurantPrivateSpaces).where(eq(restaurantPrivateSpaces.id, row.id));
    expect(gone.isActive).toBe(false);
  });

  it("non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    mockSession.mockResolvedValueOnce({ userId: "stranger", userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" } } as never);
    const res = await createSpaceAction({
      restaurantId, name: "Pirate Room", capacityMin: 1, capacityMax: 5, description: "",
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

```bash
npx jest "src/app/partner/\\(dashboard\\)/corporate/spaces/__tests__/actions.test.ts" --forceExit
```

Expected: FAIL — actions don't exist.

- [ ] **Step 3: Write the actions**

```ts
// src/app/partner/(dashboard)/corporate/spaces/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantPrivateSpaces, restaurants } from "@/lib/db/schema";
import {
  createPrivateSpace,
  updatePrivateSpace,
  deactivatePrivateSpace,
} from "@/lib/repos/private-spaces-repo";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function assertOwns(restaurantId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Unauthorised." };
  const [r] = await dbAdmin
    .select({ owner: restaurants.ownerUserId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!r || r.owner !== session.userId) return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.userId };
}

const createSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  capacityMin: z.number().int().min(1).max(2000),
  capacityMax: z.number().int().min(1).max(2000),
  photoStoragePath: z.string().max(500).optional().nullable(),
});

export async function createSpaceAction(input: z.infer<typeof createSchema>): Promise<Result> {
  const data = createSchema.parse(input);
  const auth = await assertOwns(data.restaurantId);
  if (!auth.ok) return auth;
  await createPrivateSpace({
    restaurantId: data.restaurantId,
    name: data.name,
    description: data.description ?? null,
    capacityMin: data.capacityMin,
    capacityMax: data.capacityMax,
    photoStoragePath: data.photoStoragePath ?? null,
  });
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  capacityMin: z.number().int().min(1).max(2000).optional(),
  capacityMax: z.number().int().min(1).max(2000).optional(),
  photoStoragePath: z.string().max(500).optional().nullable(),
});

export async function updateSpaceAction(input: z.infer<typeof updateSchema>): Promise<Result> {
  const data = updateSchema.parse(input);
  const [existing] = await dbAdmin.select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces).where(eq(restaurantPrivateSpaces.id, data.id)).limit(1);
  if (!existing) return { ok: false, error: "Not found." };
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  const { id: _, ...patch } = data;
  await updatePrivateSpace(data.id, patch);
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deactivateSpaceAction(input: z.infer<typeof deleteSchema>): Promise<Result> {
  const data = deleteSchema.parse(input);
  const [existing] = await dbAdmin.select({ restaurantId: restaurantPrivateSpaces.restaurantId })
    .from(restaurantPrivateSpaces).where(eq(restaurantPrivateSpaces.id, data.id)).limit(1);
  if (!existing) return { ok: false, error: "Not found." };
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  await deactivatePrivateSpace(data.id);
  revalidatePath("/partner/corporate/spaces");
  return { ok: true };
}
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
npx jest "src/app/partner/\\(dashboard\\)/corporate/spaces/__tests__/actions.test.ts" --forceExit
```

Expected: PASS.

- [ ] **Step 5: Build the page**

```tsx
// src/app/partner/(dashboard)/corporate/spaces/page.tsx
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantPrivateSpaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { SpacesEditor } from "./SpacesEditor";

export const dynamic = "force-dynamic";

export default async function SpacesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const [venue] = await dbAdmin.select().from(restaurants).where(eq(restaurants.ownerUserId, session.userId)).limit(1);
  if (!venue) redirect("/partner");
  const spaces = await dbAdmin
    .select()
    .from(restaurantPrivateSpaces)
    .where(and(eq(restaurantPrivateSpaces.restaurantId, venue.id), eq(restaurantPrivateSpaces.isActive, true)))
    .orderBy(asc(restaurantPrivateSpaces.sortOrder), asc(restaurantPrivateSpaces.capacityMin));
  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">Spațiile tale private</h1>
        <p className="text-sm text-text-secondary mt-1">
          Adaugă camerele și saloanele pe care le închiriezi pentru evenimente. Acestea apar în formularul de cerere al clientului.
        </p>
      </header>
      <SpacesEditor restaurantId={venue.id} initialSpaces={spaces} />
    </div>
  );
}
```

Build `SpacesEditor.tsx` as a client component with add/edit/delete UI. Use existing design tokens (`bg-surface-white`, `rounded-card`, `border-border`). Include photo upload affordance backed by Supabase storage (reuse `uploadPhoto` helper from `restaurant_photos` infra).

- [ ] **Step 6: Wire the sidebar entry**

In `src/components/partner/PartnerSidebar.tsx`, add `{ href: "/partner/corporate/spaces", label: "Spații" }` under the Corporate group.

- [ ] **Step 7: Commit**

```bash
git add src/app/partner/\(dashboard\)/corporate/spaces \
        src/components/partner/PartnerSidebar.tsx
git commit -m "feat(partner): private-spaces CRUD page"
```

---

### Task 7: Install Framer Motion + react-day-picker

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install framer-motion@^11.5.0 react-day-picker@^9.2.0 date-fns@^4.1.0
```

- [ ] **Step 2: Verify no peer-dep errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): framer-motion + react-day-picker for Phase 1.5"
```

---

### Task 8: Occasion-typed accent palette

**Files:**
- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Add tokens**

Append to the brand tokens block in `src/styles/tokens.css`:

```css
:root {
  /* Occasion accents — used by EventRequestSheet step 1 cards + tracking page. */
  --color-occasion-wedding:        oklch(0.74 0.13 22);   /* warm rose */
  --color-occasion-wedding-soft:   oklch(0.97 0.03 22);
  --color-occasion-birthday:       oklch(0.78 0.16 60);   /* peach */
  --color-occasion-birthday-soft:  oklch(0.97 0.04 60);
  --color-occasion-corporate:      oklch(0.55 0.13 240);  /* slate blue */
  --color-occasion-corporate-soft: oklch(0.96 0.02 240);
  --color-occasion-product:        oklch(0.62 0.15 165);  /* teal */
  --color-occasion-product-soft:   oklch(0.96 0.03 165);
  --color-occasion-other:          oklch(0.50 0.04 270);  /* neutral */
  --color-occasion-other-soft:     oklch(0.97 0.01 270);
}
```

- [ ] **Step 2: Run the dev server and visually confirm the tokens compile**

```bash
NEXT_PUBLIC_USE_DB=true npm run dev
# open the inspector on any page, type into Console:
#   getComputedStyle(document.documentElement).getPropertyValue('--color-occasion-wedding')
# expect "oklch(0.74 0.13 22)"
```

(Note: USE_DB=true currently triggers an unrelated stack-overflow per Phase 1 follow-ups — if that's still broken, run with USE_DB=false; the tokens load identically.)

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(tokens): occasion-typed accent palette for Phase 1.5"
```

---

### Task 9: `event-request-cta-v2.tsx` — premium CTA

**Files:**
- Create: `src/components/event-request-cta-v2.tsx`
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` (swap CTA)
- Create: `src/components/__tests__/event-request-cta-v2.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/event-request-cta-v2.test.tsx
import { render, screen } from "@testing-library/react";
jest.mock("../event-request-sheet-v2", () => ({
  EventRequestSheetV2: () => <div data-testid="sheet" />,
}));
import { EventRequestCtaV2 } from "../event-request-cta-v2";

describe("EventRequestCtaV2", () => {
  it("renders the CTA with secondary copy when enabled", () => {
    render(
      <EventRequestCtaV2
        enabled
        restaurantId="r1"
        restaurantName="Atelier Floreasca"
        acceptedOccasions={["wedding", "birthday"]}
        privateSpaces={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /organizează un eveniment privat/i })).toBeInTheDocument();
    expect(screen.getByText(/răspuns în mai puțin de 24 de ore/i)).toBeInTheDocument();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      <EventRequestCtaV2
        enabled={false}
        restaurantId="r1"
        restaurantName="X"
        acceptedOccasions={[]}
        privateSpaces={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

```bash
npx jest src/components/__tests__/event-request-cta-v2.test.tsx --forceExit
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Build the CTA**

```tsx
// src/components/event-request-cta-v2.tsx
"use client";
import { useState } from "react";
import { CalendarHeart, ChevronRight } from "lucide-react";
import { EventRequestSheetV2 } from "./event-request-sheet-v2";
import type { Occasion, PrivateSpaceTile } from "./event-request-sheet-v2/types";

interface Props {
  enabled: boolean;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  privateSpaces: PrivateSpaceTile[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export function EventRequestCtaV2({
  enabled,
  restaurantId,
  restaurantName,
  acceptedOccasions,
  privateSpaces,
  minLeadDays,
  budgetPerHeadGuidance,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group w-full rounded-card border border-border bg-gradient-to-br from-[var(--color-occasion-wedding-soft)] via-surface-white to-[var(--color-occasion-corporate-soft)] hover:shadow-elev2 transition-shadow text-left p-4 flex items-center gap-3"
      >
        <span className="shrink-0 rounded-full bg-surface-white p-2 shadow-elev1">
          <CalendarHeart className="w-5 h-5 text-[var(--color-occasion-wedding)]" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-text-primary">
            Organizează un eveniment privat
          </span>
          <span className="block text-xs text-text-secondary mt-0.5">
            Nuntă, aniversare, cină corporate · răspuns în mai puțin de 24 de ore
          </span>
        </span>
        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
      </button>
      {open && (
        <EventRequestSheetV2
          open={open}
          onClose={() => setOpen(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          acceptedOccasions={acceptedOccasions}
          privateSpaces={privateSpaces}
          minLeadDays={minLeadDays}
          budgetPerHeadGuidance={budgetPerHeadGuidance}
        />
      )}
    </>
  );
}
```

(The sheet itself comes in Task 10 onward — stub `EventRequestSheetV2` to return `<div data-testid="sheet" />` for now so the test passes.)

- [ ] **Step 4: Stub the sheet barrel**

Create `src/components/event-request-sheet-v2/index.tsx`:

```tsx
"use client";
import type { Occasion, PrivateSpaceTile } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  privateSpaces: PrivateSpaceTile[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export function EventRequestSheetV2(_props: Props) {
  return null; // Filled in Tasks 11–16.
}
```

Create `src/components/event-request-sheet-v2/types.ts`:

```ts
export type Occasion = "wedding" | "birthday" | "corporate_dinner" | "product_launch" | "other";

export interface PrivateSpaceTile {
  id: string;
  name: string;
  description: string | null;
  capacityMin: number;
  capacityMax: number;
  photoStoragePath: string | null;
}
```

- [ ] **Step 5: Run the test, expect PASS**

```bash
npx jest src/components/__tests__/event-request-cta-v2.test.tsx --forceExit
```

Expected: PASS.

- [ ] **Step 6: Wire into `DetailPageClient.tsx`**

Modify the import + JSX:

```tsx
// before:
import { EventRequestCta } from "@/components/event-request-cta";
// after:
import { EventRequestCtaV2 } from "@/components/event-request-cta-v2";
import { listActiveSpacesForVenue } from "@/lib/repos/private-spaces-repo";
```

In the page component (server-side hydration), fetch spaces and pass them down. In the JSX:

```tsx
<EventRequestCtaV2
  enabled={restaurant.eventsIntakeEnabled}
  restaurantId={restaurant.id}
  restaurantName={restaurant.name}
  acceptedOccasions={restaurant.acceptedOccasions}
  privateSpaces={restaurant.privateSpaces}
  minLeadDays={restaurant.minLeadDays}
  budgetPerHeadGuidance={restaurant.budgetPerHeadGuidance}
/>
```

(`restaurant.privateSpaces` requires extending the `Restaurant` type and `restaurantFromRow`; do that in this step. Default to `[]` for the mock-data path.)

- [ ] **Step 7: Commit**

```bash
git add src/components/event-request-cta-v2.tsx \
        src/components/__tests__/event-request-cta-v2.test.tsx \
        src/components/event-request-sheet-v2/ \
        src/app/\[city\]/\(shell\)/\[slug\]/DetailPageClient.tsx \
        src/lib/types.ts src/lib/repos/restaurants-repo.ts
git commit -m "feat(consumer): premium event-request CTA + sheet scaffold"
```

---

### Task 10: Sheet shell + step progress + animations

**Files:**
- Modify: `src/components/event-request-sheet-v2/index.tsx`
- Create: `src/components/event-request-sheet-v2/SheetProgress.tsx`
- Create: `src/components/event-request-sheet-v2/__tests__/sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/event-request-sheet-v2/__tests__/sheet.test.tsx
import { render, screen } from "@testing-library/react";
import { EventRequestSheetV2 } from "../index";

describe("EventRequestSheetV2", () => {
  it("renders the dialog with progress on step 1", () => {
    render(
      <EventRequestSheetV2
        open
        onClose={() => {}}
        restaurantId="r1"
        restaurantName="Atelier"
        acceptedOccasions={["wedding"]}
        privateSpaces={[]}
      />,
    );
    expect(screen.getByText("Atelier · Eveniment privat")).toBeInTheDocument();
    expect(screen.getByText(/pas 1 din 4/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx jest src/components/event-request-sheet-v2/__tests__/sheet.test.tsx --forceExit
```

- [ ] **Step 3: Build the shell**

```tsx
// src/components/event-request-sheet-v2/SheetProgress.tsx
"use client";
export function SheetProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        Pas {current} din {total}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i + 1 <= current ? "w-6 bg-brand-primary" : "w-3 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/event-request-sheet-v2/index.tsx (full)
"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SheetProgress } from "./SheetProgress";
import { StepOccasion } from "./StepOccasion";
import { StepDate } from "./StepDate";
import { StepDetails } from "./StepDetails";
import { StepIdentity } from "./StepIdentity";
import { StepSent } from "./StepSent";
import type { Occasion, PrivateSpaceTile } from "./types";

type Step = "occasion" | "date" | "details" | "identity" | "sent";
const ORDER: Step[] = ["occasion", "date", "details", "identity"];

interface Props {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  privateSpaces: PrivateSpaceTile[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export interface DraftState {
  occasion: Occasion | null;
  eventDate: string;
  eventTimePreference: string;
  partySize: number;
  privateSpaceId: string | null;
  spacePreference: string;
  budgetPerHeadCents: number | undefined;
  menuPreference: string;
  dietaryNotes: string;
  additionalNotes: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  bookingForCompany: boolean;
  claimedCompanyCui: string;
  claimedCompanyName: string;
}

const INITIAL: DraftState = {
  occasion: null, eventDate: "", eventTimePreference: "", partySize: 20,
  privateSpaceId: null, spacePreference: "", budgetPerHeadCents: undefined,
  menuPreference: "", dietaryNotes: "", additionalNotes: "",
  guestName: "", guestEmail: "", guestPhone: "",
  bookingForCompany: false, claimedCompanyCui: "", claimedCompanyName: "",
};

export function EventRequestSheetV2(props: Props) {
  const [step, setStep] = useState<Step>("occasion");
  const [draft, setDraft] = useState<DraftState>(INITIAL);
  if (!props.open) return null;
  const stepIndex = ORDER.indexOf(step);
  const update = (patch: Partial<DraftState>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-end desktop:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={props.onClose}>
      <motion.div
        initial={{ y: "20%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "20%", opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
        className="bg-surface-white w-full desktop:max-w-2xl rounded-t-card desktop:rounded-card shadow-elev3 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {props.restaurantName} · Eveniment privat
            </p>
            {step !== "sent" && <SheetProgress current={stepIndex + 1} total={ORDER.length} />}
          </div>
          <button onClick={props.onClose} aria-label="Închide">
            <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {step === "occasion" && (
              <motion.div key="occasion" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <StepOccasion
                  acceptedOccasions={props.acceptedOccasions}
                  selected={draft.occasion}
                  onPick={(o) => update({ occasion: o })}
                  onNext={() => setStep("date")}
                />
              </motion.div>
            )}
            {step === "date" && (
              <motion.div key="date" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <StepDate
                  minLeadDays={props.minLeadDays ?? 7}
                  value={draft.eventDate}
                  timePreference={draft.eventTimePreference}
                  onChange={(p) => update(p)}
                  onBack={() => setStep("occasion")}
                  onNext={() => setStep("details")}
                />
              </motion.div>
            )}
            {step === "details" && (
              <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <StepDetails
                  privateSpaces={props.privateSpaces}
                  budgetPerHeadGuidance={props.budgetPerHeadGuidance}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("date")}
                  onNext={() => setStep("identity")}
                />
              </motion.div>
            )}
            {step === "identity" && (
              <motion.div key="identity" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <StepIdentity
                  restaurantId={props.restaurantId}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("details")}
                  onSent={() => setStep("sent")}
                />
              </motion.div>
            )}
            {step === "sent" && (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <StepSent email={draft.guestEmail} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
npx jest src/components/event-request-sheet-v2/__tests__/sheet.test.tsx --forceExit
```

(Steps StepOccasion etc. live in next tasks; for this commit, stub them with named exports that render `<div>step-N</div>` so the import compiles.)

- [ ] **Step 5: Commit**

```bash
git add src/components/event-request-sheet-v2/
git commit -m "feat(consumer): sheet shell with progress + motion transitions"
```

---

### Task 11: Step 1 — Occasion as imagery cards

**Files:**
- Create: `src/components/event-request-sheet-v2/StepOccasion.tsx`
- Create: `src/components/event-request-sheet-v2/OccasionCard.tsx`
- Create: `src/components/event-request-sheet-v2/__tests__/StepOccasion.test.tsx`
- Add stock illustrations: place SVGs in `public/illustrations/occasion-wedding.svg`, `occasion-birthday.svg`, etc. (one per occasion; reuse simple line illustrations or commission from your design folder).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/StepOccasion.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepOccasion } from "../StepOccasion";

describe("StepOccasion", () => {
  it("renders one card per accepted occasion and calls onPick when clicked", () => {
    const onPick = jest.fn();
    render(
      <StepOccasion
        acceptedOccasions={["wedding", "birthday"]}
        selected={null}
        onPick={onPick}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText(/nuntă/i)).toBeInTheDocument();
    expect(screen.getByText(/aniversare/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/nuntă/i));
    expect(onPick).toHaveBeenCalledWith("wedding");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// OccasionCard.tsx
"use client";
import Image from "next/image";
import type { Occasion } from "./types";

interface CardProps {
  occasion: Occasion;
  label: string;
  blurb: string;
  selected: boolean;
  illustration: string;
  accentVar: string;
  onPick: (o: Occasion) => void;
}

export function OccasionCard({ occasion, label, blurb, selected, illustration, accentVar, onPick }: CardProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(occasion)}
      style={{ borderColor: selected ? `var(${accentVar})` : undefined, background: selected ? `var(${accentVar}-soft)` : undefined }}
      className={`group relative rounded-card border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-elev2 ${selected ? "shadow-elev2" : "border-border bg-surface-white"}`}
    >
      <Image src={illustration} alt="" width={64} height={64} className="mb-3" aria-hidden />
      <span className="block font-display font-semibold text-text-primary">{label}</span>
      <span className="block text-xs text-text-secondary mt-1 leading-relaxed">{blurb}</span>
    </button>
  );
}
```

```tsx
// StepOccasion.tsx
"use client";
import { OccasionCard } from "./OccasionCard";
import type { Occasion } from "./types";

const META: Record<Occasion, { label: string; blurb: string; illustration: string; accentVar: string }> = {
  wedding:         { label: "Nuntă",          blurb: "Cina sau petrecerea care contează. Te ajutăm să o organizezi de la zero.",    illustration: "/illustrations/occasion-wedding.svg",   accentVar: "--color-occasion-wedding" },
  birthday:        { label: "Aniversare",     blurb: "Rotund sau intim. Spune-ne câteva detalii și restaurantul face restul.",     illustration: "/illustrations/occasion-birthday.svg",  accentVar: "--color-occasion-birthday" },
  corporate_dinner:{ label: "Cină corporate", blurb: "Team dinner, client lunch, end-of-year — formal sau lejer, ca la birou.",   illustration: "/illustrations/occasion-corporate.svg", accentVar: "--color-occasion-corporate" },
  product_launch:  { label: "Lansare produs", blurb: "Open bar, cocktail, podea liberă — un eveniment care arată ce vrei să spui.", illustration: "/illustrations/occasion-product.svg",   accentVar: "--color-occasion-product" },
  other:           { label: "Altele",          blurb: "Vorbim despre detalii, găsim setarea potrivită.",                            illustration: "/illustrations/occasion-other.svg",     accentVar: "--color-occasion-other" },
};

interface Props {
  acceptedOccasions: Occasion[];
  selected: Occasion | null;
  onPick: (o: Occasion) => void;
  onNext: () => void;
}

export function StepOccasion({ acceptedOccasions, selected, onPick, onNext }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">Hai să facem din asta ceva memorabil.</h2>
      <p className="text-sm text-text-secondary">Ce sărbătorești?</p>
      <div className="grid grid-cols-2 gap-3">
        {acceptedOccasions.map((o) => (
          <OccasionCard key={o} occasion={o} selected={selected === o} onPick={onPick} {...META[o]} />
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onNext}
        className="w-full mt-4 bg-brand-primary text-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark"
      >
        Continuă
      </button>
    </div>
  );
}
```

Place placeholder SVGs in `public/illustrations/`. (If real artwork isn't ready, commit minimal hand-drawn line-icon SVGs — see e.g. Lucide outlines as a baseline.)

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/event-request-sheet-v2/StepOccasion.tsx \
        src/components/event-request-sheet-v2/OccasionCard.tsx \
        src/components/event-request-sheet-v2/__tests__/StepOccasion.test.tsx \
        public/illustrations/
git commit -m "feat(consumer): occasion picker as imagery cards"
```

---

### Task 12: Step 2 — Custom calendar with lead-time visualization

**Files:**
- Create: `src/components/event-request-sheet-v2/StepDate.tsx`
- Create: `src/components/event-request-sheet-v2/__tests__/StepDate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/StepDate.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepDate } from "../StepDate";

describe("StepDate", () => {
  it("disables dates earlier than today + minLeadDays", () => {
    render(
      <StepDate minLeadDays={14} value="" timePreference="" onChange={() => {}} onBack={() => {}} onNext={() => {}} />,
    );
    expect(screen.getByText(/14 zile/)).toBeInTheDocument();
  });

  it("calls onChange when a date is picked", () => {
    const onChange = jest.fn();
    render(
      <StepDate minLeadDays={7} value="" timePreference="" onChange={onChange} onBack={() => {}} onNext={() => {}} />,
    );
    // react-day-picker renders day buttons; pick the first enabled one.
    const enabledDay = screen.getAllByRole("gridcell").find((cell) => !cell.hasAttribute("aria-disabled"));
    if (enabledDay) fireEvent.click(enabledDay);
    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// StepDate.tsx
"use client";
import { DayPicker } from "react-day-picker";
import { ro } from "date-fns/locale";
import { addDays, format } from "date-fns";
import "react-day-picker/style.css";

interface Props {
  minLeadDays: number;
  value: string;
  timePreference: string;
  onChange: (patch: { eventDate?: string; eventTimePreference?: string }) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepDate({ minLeadDays, value, timePreference, onChange, onBack, onNext }: Props) {
  const today = new Date();
  const minDate = addDays(today, minLeadDays);
  const selected = value ? new Date(value) : undefined;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Când e ziua cea mare?</h2>
      <div className="rounded-card border border-border p-3 bg-[var(--color-occasion-corporate-soft)]/40">
        <p className="text-xs font-medium text-text-secondary">
          Acest restaurant primește cereri cu minim <span className="font-semibold text-text-primary">{minLeadDays} zile</span> înainte de eveniment.
        </p>
      </div>
      <div className="flex justify-center">
        <DayPicker
          mode="single"
          locale={ro}
          weekStartsOn={1}
          selected={selected}
          onSelect={(d) => d && onChange({ eventDate: format(d, "yyyy-MM-dd") })}
          disabled={{ before: minDate }}
          modifiers={{ leadEdge: minDate }}
          modifiersClassNames={{ selected: "rdp-selected-brand", leadEdge: "rdp-lead-edge" }}
        />
      </div>
      {selected && (
        <p className="text-sm text-center text-text-primary">
          {format(selected, "EEEE, d MMMM yyyy", { locale: ro })}
        </p>
      )}
      <div>
        <label className="block">
          <span className="text-sm font-medium">Preferință oră (opțional)</span>
          <input
            type="text"
            value={timePreference}
            placeholder="prânz, seară, 18:00…"
            onChange={(e) => onChange({ eventTimePreference: e.target.value })}
            className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 border border-border rounded-card py-3 font-semibold">Înapoi</button>
        <button onClick={onNext} disabled={!value} className="flex-1 bg-brand-primary text-white rounded-card py-3 font-semibold disabled:opacity-40">Continuă</button>
      </div>
    </div>
  );
}
```

Add brand overrides to `globals.css`:

```css
.rdp-selected-brand { background-color: var(--color-brand-primary) !important; color: white !important; }
.rdp-lead-edge { box-shadow: inset 0 -2px 0 var(--color-occasion-corporate); }
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/event-request-sheet-v2/StepDate.tsx \
        src/components/event-request-sheet-v2/__tests__/StepDate.test.tsx \
        src/styles/globals.css
git commit -m "feat(consumer): venue-aware date picker with lead-time visualization"
```

---

### Task 13: Step 3 — Visual room picker + inline price anchoring + better details

**Files:**
- Create: `src/components/event-request-sheet-v2/StepDetails.tsx`
- Create: `src/components/event-request-sheet-v2/RoomPickerTile.tsx`
- Create: `src/components/event-request-sheet-v2/__tests__/StepDetails.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/StepDetails.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepDetails } from "../StepDetails";
import type { DraftState } from "../index";

const baseDraft: DraftState = {
  occasion: "wedding", eventDate: "2026-09-15", eventTimePreference: "",
  partySize: 25, privateSpaceId: null, spacePreference: "",
  budgetPerHeadCents: undefined, menuPreference: "", dietaryNotes: "", additionalNotes: "",
  guestName: "", guestEmail: "", guestPhone: "",
  bookingForCompany: false, claimedCompanyCui: "", claimedCompanyName: "",
};

describe("StepDetails", () => {
  it("renders room tiles when spaces are provided and highlights size match", () => {
    render(
      <StepDetails
        privateSpaces={[
          { id: "s1", name: "Sala Verde", description: null, capacityMin: 10, capacityMax: 25, photoStoragePath: null },
          { id: "s2", name: "Salon Mare", description: null, capacityMin: 30, capacityMax: 80, photoStoragePath: null },
        ]}
        budgetPerHeadGuidance={"Bugetele tipice aici: 250–400 lei/pers"}
        draft={baseDraft}
        onChange={() => {}}
        onBack={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText(/sala verde/i)).toBeInTheDocument();
    expect(screen.getByText(/salon mare/i)).toBeInTheDocument();
    // Sala Verde fits 25 → should be marked "potrivit"
    expect(screen.getByText(/potrivit pentru 25 de persoane/i)).toBeInTheDocument();
  });

  it("renders the venue's budget-per-head guidance verbatim", () => {
    render(
      <StepDetails
        privateSpaces={[]}
        budgetPerHeadGuidance="Bugetele tipice aici: 250–400 lei/pers"
        draft={baseDraft}
        onChange={() => {}}
        onBack={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText(/250–400 lei\/pers/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Build the tile + step**

```tsx
// RoomPickerTile.tsx
"use client";
import Image from "next/image";
import { Check } from "lucide-react";
import type { PrivateSpaceTile } from "./types";

interface Props {
  space: PrivateSpaceTile;
  selected: boolean;
  partySize: number;
  publicPhotoUrl: (storagePath: string | null) => string | null;
  onPick: (id: string) => void;
}

export function RoomPickerTile({ space, selected, partySize, publicPhotoUrl, onPick }: Props) {
  const fits = partySize >= space.capacityMin && partySize <= space.capacityMax;
  const photo = publicPhotoUrl(space.photoStoragePath);
  return (
    <button
      type="button"
      onClick={() => onPick(space.id)}
      className={`relative rounded-card overflow-hidden text-left border-2 transition-all ${selected ? "border-brand-primary shadow-elev2" : "border-border hover:border-text-muted"}`}
    >
      <div className="relative aspect-[4/3] bg-surface-muted">
        {photo ? <Image src={photo} alt={space.name} fill className="object-cover" /> : null}
        {selected && (
          <span className="absolute top-2 right-2 bg-brand-primary text-white rounded-full p-1">
            <Check className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="block font-semibold">{space.name}</span>
        <span className="block text-xs text-text-secondary mt-0.5">
          {space.capacityMin}–{space.capacityMax} persoane
        </span>
        {fits && (
          <span className="inline-block mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-occasion-product-soft)] text-[var(--color-occasion-product)]">
            Potrivit pentru {partySize} de persoane
          </span>
        )}
      </div>
    </button>
  );
}
```

```tsx
// StepDetails.tsx
"use client";
import { useMemo } from "react";
import { RoomPickerTile } from "./RoomPickerTile";
import type { PrivateSpaceTile } from "./types";
import type { DraftState } from "./index";

interface Props {
  privateSpaces: PrivateSpaceTile[];
  budgetPerHeadGuidance?: string | null;
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onBack: () => void;
  onNext: () => void;
}

function publicPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/restaurant-photos/${storagePath}`;
}

export function StepDetails({ privateSpaces, budgetPerHeadGuidance, draft, onChange, onBack, onNext }: Props) {
  const sortedSpaces = useMemo(
    () => [...privateSpaces].sort((a, b) => a.capacityMin - b.capacityMin),
    [privateSpaces],
  );
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">Câteva detalii.</h2>

      <label className="block">
        <span className="text-sm font-medium">Câte persoane?</span>
        <input
          type="number" min={1} max={500} value={draft.partySize}
          onChange={(e) => onChange({ partySize: Number(e.target.value) })}
          className="w-full mt-1 border border-border rounded-card p-2"
        />
      </label>

      {sortedSpaces.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Spațiul tău preferat</p>
          <div className="grid grid-cols-2 gap-3">
            {sortedSpaces.map((space) => (
              <RoomPickerTile
                key={space.id}
                space={space}
                selected={draft.privateSpaceId === space.id}
                partySize={draft.partySize}
                publicPhotoUrl={publicPhotoUrl}
                onPick={(id) => onChange({ privateSpaceId: id, spacePreference: "" })}
              />
            ))}
          </div>
        </div>
      )}

      {sortedSpaces.length === 0 && (
        <label className="block">
          <span className="text-sm font-medium">Spațiu preferat (opțional)</span>
          <input
            type="text" value={draft.spacePreference}
            onChange={(e) => onChange({ spacePreference: e.target.value })}
            className="w-full mt-1 border border-border rounded-card p-2"
          />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium">Buget per persoană (lei)</span>
        <input
          type="number" min={0} step={10}
          value={draft.budgetPerHeadCents ? Math.round(draft.budgetPerHeadCents / 100) : ""}
          onChange={(e) => onChange({ budgetPerHeadCents: e.target.value ? Number(e.target.value) * 100 : undefined })}
          className="w-full mt-1 border border-border rounded-card p-2"
        />
        {budgetPerHeadGuidance && (
          <p className="text-xs text-[var(--color-occasion-corporate)] mt-1.5 font-medium">
            💡 {budgetPerHeadGuidance}
          </p>
        )}
      </label>

      <details className="rounded-card border border-border">
        <summary className="px-3 py-2 cursor-pointer text-sm font-medium">Meniu și restricții (opțional)</summary>
        <div className="p-3 space-y-2 border-t border-border">
          <textarea rows={2} placeholder="Meniu / dorințe"
            value={draft.menuPreference} onChange={(e) => onChange({ menuPreference: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm" />
          <textarea rows={2} placeholder="Restricții alimentare"
            value={draft.dietaryNotes} onChange={(e) => onChange({ dietaryNotes: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm" />
          <textarea rows={2} placeholder="Note suplimentare"
            value={draft.additionalNotes} onChange={(e) => onChange({ additionalNotes: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm" />
        </div>
      </details>

      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 border border-border rounded-card py-3 font-semibold">Înapoi</button>
        <button onClick={onNext} className="flex-1 bg-brand-primary text-white rounded-card py-3 font-semibold">Continuă</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/event-request-sheet-v2/StepDetails.tsx \
        src/components/event-request-sheet-v2/RoomPickerTile.tsx \
        src/components/event-request-sheet-v2/__tests__/StepDetails.test.tsx
git commit -m "feat(consumer): visual room picker + inline price anchoring"
```

---

### Task 14: Step 4 — Identity step with live ANAF CUI lookup

**Files:**
- Create: `src/components/event-request-sheet-v2/StepIdentity.tsx`
- Create: `src/components/event-request-sheet-v2/CuiLookupField.tsx`
- Create: `src/app/api/anaf/lookup/route.ts` (public read-only endpoint)
- Create: `src/components/event-request-sheet-v2/__tests__/CuiLookupField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/CuiLookupField.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CuiLookupField } from "../CuiLookupField";

describe("CuiLookupField", () => {
  it("calls /api/anaf/lookup on debounced input and surfaces denumire on success", async () => {
    (global.fetch as jest.Mock) = jest.fn(async () =>
      ({ ok: true, json: async () => ({ ok: true, denumire: "Acme S.R.L." }) }) as never,
    );
    const onChange = jest.fn();
    render(<CuiLookupField cui="" denumire="" onChange={onChange} />);
    const input = screen.getByLabelText(/cui/i);
    await userEvent.type(input, "RO12345678");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 1000 });
    await waitFor(() => expect(screen.getByText(/acme s\.r\.l\./i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Build the API + field**

```ts
// src/app/api/anaf/lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { lookupCui } from "@/lib/integrations/anaf";
export async function GET(req: NextRequest) {
  const cui = req.nextUrl.searchParams.get("cui");
  if (!cui) return NextResponse.json({ ok: false, error: "missing cui" }, { status: 400 });
  const result = await lookupCui(cui);
  return NextResponse.json(result);
}
```

```tsx
// CuiLookupField.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  cui: string;
  denumire: string;
  onChange: (p: { claimedCompanyCui: string; claimedCompanyName?: string }) => void;
}

export function CuiLookupField({ cui, denumire, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ denumire?: string; adresa?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cui || cui.replace(/^RO/i, "").length < 4) {
      setResult(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cui)}`);
        const json = await res.json();
        if (json.ok) {
          setResult({ denumire: json.denumire, adresa: json.adresa });
          if (json.denumire) onChange({ claimedCompanyCui: cui, claimedCompanyName: json.denumire });
        }
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cui]);

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium">CUI</span>
        <div className="relative">
          <input
            value={cui}
            placeholder="RO12345678"
            onChange={(e) => onChange({ claimedCompanyCui: e.target.value.trim() })}
            className="w-full mt-1 border border-border rounded-card p-2 pr-9"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
            {!loading && result?.denumire && <CheckCircle2 className="w-4 h-4 text-[var(--color-occasion-product)]" />}
          </span>
        </div>
      </label>
      {result?.denumire && (
        <p className="mt-1.5 text-xs bg-[var(--color-occasion-product-soft)] rounded p-2">
          <strong>{result.denumire}</strong>
          {result.adresa ? <><br /><span className="text-text-secondary">{result.adresa}</span></> : null}
        </p>
      )}
      {denumire && !result && (
        <p className="mt-1 text-xs text-text-secondary">Denumire: {denumire}</p>
      )}
    </div>
  );
}
```

```tsx
// StepIdentity.tsx
"use client";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { CuiLookupField } from "./CuiLookupField";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";
import type { DraftState } from "./index";

interface Props {
  restaurantId: string;
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onBack: () => void;
  onSent: () => void;
}

export function StepIdentity({ restaurantId, draft, onChange, onBack, onSent }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitEventRequestDraft({
          restaurantId,
          guestName: draft.guestName,
          guestEmail: draft.guestEmail,
          guestPhone: draft.guestPhone || undefined,
          occasion: draft.occasion!,
          eventDate: draft.eventDate,
          eventTimePreference: draft.eventTimePreference || undefined,
          partySize: draft.partySize,
          privateSpaceId: draft.privateSpaceId ?? undefined,
          spacePreference: draft.spacePreference || undefined,
          budgetPerHeadCents: draft.budgetPerHeadCents,
          menuPreference: draft.menuPreference || undefined,
          dietaryNotes: draft.dietaryNotes || undefined,
          additionalNotes: draft.additionalNotes || undefined,
          claimedCompanyCui: draft.bookingForCompany && draft.claimedCompanyCui ? draft.claimedCompanyCui : undefined,
          claimedCompanyName: draft.bookingForCompany && draft.claimedCompanyName ? draft.claimedCompanyName : undefined,
        });
        onSent();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Cum te găsim?</h2>

      <label className="block">
        <span className="text-sm font-medium">Nume</span>
        <input value={draft.guestName} onChange={(e) => onChange({ guestName: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input type="email" value={draft.guestEmail} onChange={(e) => onChange({ guestEmail: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Telefon (opțional)</span>
        <input type="tel" value={draft.guestPhone} onChange={(e) => onChange({ guestPhone: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2" />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.bookingForCompany}
          onChange={(e) => onChange({ bookingForCompany: e.target.checked })} />
        Rezervare pentru o companie (facturare cu CUI)
      </label>

      {draft.bookingForCompany && (
        <CuiLookupField
          cui={draft.claimedCompanyCui}
          denumire={draft.claimedCompanyName}
          onChange={onChange}
        />
      )}

      <div className="text-xs text-text-secondary flex items-start gap-2 bg-surface-muted rounded-card p-3">
        <ShieldCheck className="w-4 h-4 mt-0.5 text-[var(--color-occasion-corporate)]" />
        <span>Îți vom trimite un link de confirmare pe email. Restaurantul vede cererea ta doar după ce confirmi.</span>
      </div>

      {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onBack} disabled={pending} className="flex-1 border border-border rounded-card py-3 font-semibold">Înapoi</button>
        <button onClick={submit} disabled={pending || !draft.guestName || !draft.guestEmail}
          className="flex-1 bg-brand-primary text-white rounded-card py-3 font-semibold disabled:opacity-40">
          {pending ? "Se trimite…" : "Trimite cererea"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/event-request-sheet-v2/StepIdentity.tsx \
        src/components/event-request-sheet-v2/CuiLookupField.tsx \
        src/components/event-request-sheet-v2/__tests__/CuiLookupField.test.tsx \
        src/app/api/anaf/lookup/route.ts
git commit -m "feat(consumer): identity step with live ANAF CUI lookup"
```

---

### Task 15: Step 5 — Sent confirmation with visual polish

**Files:**
- Create: `src/components/event-request-sheet-v2/StepSent.tsx`

- [ ] **Step 1: Implement**

```tsx
// StepSent.tsx
"use client";
import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";

export function StepSent({ email }: { email: string }) {
  return (
    <div className="text-center py-6 space-y-4">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12 }}
        className="mx-auto w-16 h-16 rounded-full bg-[var(--color-occasion-product-soft)] flex items-center justify-center">
        <MailCheck className="w-8 h-8 text-[var(--color-occasion-product)]" />
      </motion.div>
      <h2 className="font-display text-2xl font-bold">Verifică emailul</h2>
      <p className="text-sm text-text-secondary max-w-sm mx-auto">
        Ți-am trimis un link la <strong className="text-text-primary">{email}</strong>. Click pe el ca să confirmi cererea — restaurantul o primește în inbox imediat după.
      </p>
      <p className="text-xs text-text-muted">Nu primești emailul? Verifică Spam-ul sau reîncearcă peste 2 minute.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/event-request-sheet-v2/StepSent.tsx
git commit -m "feat(consumer): polished post-submit confirmation"
```

---

### Task 16: Visual regression Playwright sweep — consumer sheet

**Files:**
- Create: `e2e/consumer-sheet.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/consumer-sheet.spec.ts
import { test, expect } from "@playwright/test";
import { seedEventVenue, cleanupVenue, disposeFixturesDb, type EventVenue } from "./helpers/fixtures";

let venue: EventVenue;
test.beforeAll(async () => { venue = await seedEventVenue("v2"); });
test.afterAll(async () => { await cleanupVenue(venue.id); await disposeFixturesDb(); });

test.skip(!!process.env.E2E_SKIP_LOCAL_BROWSER, "needs USE_DB=true dev server");

test("v2 sheet walks the 4 steps and submits", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/${venue.citySlug}/${venue.slug}`);
  await expect(page.getByRole("heading", { name: /E2E Test Venue/i })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /Organizează un eveniment privat/i }).click();
  await expect(page.getByText(/Pas 1 din 4/i)).toBeVisible();

  await page.getByText("Aniversare").click();
  await page.getByRole("button", { name: /Continuă/i }).click();
  await expect(page.getByText(/Pas 2 din 4/i)).toBeVisible();

  // pick the first enabled day in the calendar
  const day = page.locator(".rdp-day:not([aria-disabled='true'])").first();
  await day.click();
  await page.getByRole("button", { name: /Continuă/i }).click();
  await expect(page.getByText(/Pas 3 din 4/i)).toBeVisible();

  await page.getByRole("button", { name: /Continuă/i }).click();
  await expect(page.getByText(/Pas 4 din 4/i)).toBeVisible();

  await page.getByLabel(/Nume/i).fill("E2E Tester");
  await page.getByLabel(/Email/i).fill(`e2e-${Date.now()}@example.local`);
  await page.getByRole("button", { name: /Trimite cererea/i }).click();
  await expect(page.getByText(/Verifică emailul/i)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 2: Verify Playwright lists it**

```bash
npx playwright test --list e2e/consumer-sheet.spec.ts
```

- [ ] **Step 3: Skip + commit**

This stays skipped until the USE_DB stack-overflow blocker is resolved (Phase 1 follow-up); the spec ships so it's ready.

```bash
git add e2e/consumer-sheet.spec.ts
git commit -m "test(e2e): scaffold consumer-sheet v2 walkthrough"
```

---

### Task 17: TrackingClient v2 — timeline + countdown + partner identity

**Files:**
- Create: `src/components/tracking/StatusTimeline.tsx`
- Create: `src/components/tracking/QuoteExpiryCountdown.tsx`
- Create: `src/components/tracking/PartnerIdentityBadge.tsx`
- Create: `src/components/tracking/__tests__/StatusTimeline.test.tsx`
- Modify: `src/app/event-requests/[token]/TrackingClient.tsx`
- Modify: `src/app/event-requests/[token]/page.tsx` (pass partner data)

- [ ] **Step 1: Test the timeline**

```tsx
// __tests__/StatusTimeline.test.tsx
import { render, screen } from "@testing-library/react";
import { StatusTimeline } from "../StatusTimeline";

describe("StatusTimeline", () => {
  it("marks Submitted, Viewing as past and Quoted as current when status='quoted'", () => {
    render(<StatusTimeline status="quoted" />);
    expect(screen.getByText("Trimisă").closest("li")).toHaveAttribute("data-state", "past");
    expect(screen.getByText("Vizualizată").closest("li")).toHaveAttribute("data-state", "past");
    expect(screen.getByText("Ofertă").closest("li")).toHaveAttribute("data-state", "current");
    expect(screen.getByText("Decizie").closest("li")).toHaveAttribute("data-state", "future");
  });
});
```

- [ ] **Step 2: Build it**

```tsx
// StatusTimeline.tsx
"use client";
const STEPS = [
  { key: "submitted", label: "Trimisă" },
  { key: "viewing",   label: "Vizualizată" },
  { key: "quoted",    label: "Ofertă" },
  { key: "decided",   label: "Decizie" },
] as const;

function indexFor(status: string): number {
  if (status === "new" || status === "draft") return 0;
  if (status === "viewing" || status === "replied") return 1;
  if (status === "quoted" || status === "expired_quote") return 2;
  return 3; // accepted/declined/cancelled/expired/completed
}

export function StatusTimeline({ status }: { status: string }) {
  const current = indexFor(status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progres cerere">
      {STEPS.map((s, i) => {
        const state = i < current ? "past" : i === current ? "current" : "future";
        return (
          <li key={s.key} data-state={state} className="relative">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${state === "past" ? "bg-brand-primary" : state === "current" ? "bg-brand-primary ring-4 ring-brand-primary/20" : "bg-border"}`} />
              {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < current ? "bg-brand-primary" : "bg-border"}`} />}
            </div>
            <span className={`block mt-1 text-xs ${state === "future" ? "text-text-muted" : state === "current" ? "text-text-primary font-semibold" : "text-text-secondary"}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
```

```tsx
// QuoteExpiryCountdown.tsx
"use client";
import { useEffect, useState } from "react";
import { differenceInSeconds } from "date-fns";

export function QuoteExpiryCountdown({ expiresAt }: { expiresAt: Date | string }) {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, differenceInSeconds(target, now));
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (secs === 0) return <span className="text-red-600 font-medium">Oferta a expirat</span>;
  if (days >= 2) return <span>Expiră în <strong>{days} zile</strong></span>;
  if (days >= 1) return <span>Expiră în <strong>{days} zi {hours} ore</strong></span>;
  return <span className="text-amber-600 font-medium">Expiră astăzi (în {hours}h)</span>;
}
```

```tsx
// PartnerIdentityBadge.tsx
"use client";
import Image from "next/image";

export function PartnerIdentityBadge({ name, heroPath, viewing }: { name: string; heroPath: string | null; viewing: boolean }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = heroPath ? `${base}/storage/v1/object/public/restaurant-photos/${heroPath}` : null;
  return (
    <div className="flex items-center gap-3 bg-surface-muted rounded-card p-3">
      <span className="relative w-12 h-12 rounded-full overflow-hidden bg-border">
        {url && <Image src={url} alt="" fill className="object-cover" />}
        {viewing && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--color-occasion-product)] rounded-full ring-2 ring-surface-muted animate-pulse" aria-label="se uită acum" />}
      </span>
      <span>
        <span className="block font-semibold text-sm">{name}</span>
        <span className="block text-xs text-text-secondary">
          {viewing ? "Vede cererea ta acum" : "Restaurant verificat"}
        </span>
      </span>
    </div>
  );
}
```

```tsx
// TrackingClient.tsx (full rewrite)
"use client";
import { useTransition } from "react";
import { Calendar, Users } from "lucide-react";
import { StatusTimeline } from "@/components/tracking/StatusTimeline";
import { QuoteExpiryCountdown } from "@/components/tracking/QuoteExpiryCountdown";
import { PartnerIdentityBadge } from "@/components/tracking/PartnerIdentityBadge";
import { Button } from "@/components/button";
import {
  consumerAcceptQuote,
  consumerDeclineQuote,
  consumerCancelEventRequest,
} from "./actions";

interface Props {
  er: {
    id: string; status: string;
    occasion: string; eventDate: string; partySize: number;
    partnerResponse: string | null;
    quotedAmountCents: number | null;
    quoteExpiresAt: Date | null;
    declineReason: string | null;
  };
  restaurant: { name: string; heroPath: string | null };
  quoteLineItems: { label: string; amountCents: number }[];
  token: string;
}

const STATUS_HEADLINE: Record<string, string> = {
  new: "Cerere trimisă",
  viewing: "Restaurantul îți vede cererea",
  replied: "Ai primit un răspuns",
  quoted: "Ofertă primită",
  accepted: "Ofertă acceptată",
  declined: "Cerere refuzată",
  expired_quote: "Oferta a expirat",
  cancelled: "Cerere anulată",
  expired: "Cerere expirată",
  completed: "Eveniment finalizat",
};

export function TrackingClient({ er, restaurant, quoteLineItems, token }: Props) {
  const [pending, startTransition] = useTransition();
  const reloadAfter = (p: Promise<unknown>) => p.then(() => { if (typeof window !== "undefined") window.location.reload(); });

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cerere #{er.id.slice(0, 8)}</p>
        <h1 className="font-display text-3xl font-bold mt-1">{STATUS_HEADLINE[er.status] ?? er.status}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {er.eventDate}</span>
          <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {er.partySize} pers.</span>
        </div>
      </header>

      <StatusTimeline status={er.status} />

      <PartnerIdentityBadge name={restaurant.name} heroPath={restaurant.heroPath} viewing={er.status === "viewing"} />

      {er.partnerResponse && (
        <section className="bg-surface-muted p-4 rounded-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Răspuns restaurant</p>
          <p className="mt-2 whitespace-pre-line">{er.partnerResponse}</p>
        </section>
      )}

      {er.status === "quoted" && er.quotedAmountCents != null && (
        <section className="border border-brand-primary rounded-card p-4 space-y-3 bg-surface-white shadow-elev1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-secondary">Ofertă totală</span>
            <span className="font-display text-3xl font-bold text-brand-primary">
              {(er.quotedAmountCents / 100).toLocaleString("ro-RO")} lei
            </span>
          </div>
          {quoteLineItems.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {quoteLineItems.map((l, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span className="text-text-secondary">{l.label}</span>
                  <span className="tabular-nums">{(l.amountCents / 100).toLocaleString("ro-RO")} lei</span>
                </li>
              ))}
            </ul>
          )}
          {er.quoteExpiresAt && (
            <p className="text-xs"><QuoteExpiryCountdown expiresAt={er.quoteExpiresAt} /></p>
          )}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => startTransition(() => reloadAfter(consumerAcceptQuote(token)))}>
              Acceptă oferta
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => reloadAfter(consumerDeclineQuote({ token })))}>
              Refuză politicos
            </Button>
          </div>
        </section>
      )}

      {er.declineReason && er.status === "declined" && (
        <p className="text-sm text-text-secondary">Motiv: {er.declineReason}</p>
      )}

      {["new", "viewing", "replied", "quoted"].includes(er.status) && (
        <Button variant="ghost" disabled={pending}
          onClick={() => startTransition(() => reloadAfter(consumerCancelEventRequest(token)))}>
          Anulează cererea
        </Button>
      )}
    </main>
  );
}
```

In `page.tsx`, pull the restaurant hero photo + the quote line items and pass them in. Use `dbAdmin.select()` with proper joins.

- [ ] **Step 3: Run test, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/components/tracking/ src/app/event-requests/\[token\]/
git commit -m "feat(consumer): tracking page with timeline, countdown, partner identity"
```

---

### Task 18: Events landing page — editorial framing

**Files:**
- Modify: `src/app/[city]/events/page.tsx`
- Create: `src/components/events-landing/EditorialHero.tsx`
- Create: `src/components/events-landing/OccasionEntryGrid.tsx`

- [ ] **Step 1: Build editorial header**

```tsx
// EditorialHero.tsx
import Image from "next/image";

export function EditorialHero({ city, venueCount }: { city: string; venueCount: number }) {
  return (
    <header className="relative rounded-card overflow-hidden bg-gradient-to-br from-[var(--color-occasion-wedding-soft)] via-surface-white to-[var(--color-occasion-corporate-soft)] p-8 desktop:p-12 mb-8">
      <span className="text-xs font-semibold text-[var(--color-occasion-corporate)] uppercase tracking-widest">Tavli · evenimente private</span>
      <h1 className="font-display text-4xl desktop:text-5xl font-bold mt-2 max-w-2xl leading-tight">
        Momente memorabile, găzduite în {city}.
      </h1>
      <p className="text-base text-text-secondary mt-4 max-w-xl">
        Restaurante și locații atent verificate, care primesc cereri pentru evenimente private — nunți, aniversări, cine corporate. Cere ofertă în 60 de secunde.
      </p>
      <p className="text-xs text-text-muted mt-6">{venueCount} locații verificate · răspuns garantat în 24h</p>
    </header>
  );
}
```

- [ ] **Step 2: Build occasion entry grid**

```tsx
// OccasionEntryGrid.tsx
"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
const ENTRIES = [
  { key: "wedding",          label: "Nuntă",          blurb: "Săli pentru 40–200 oaspeți",      illustration: "/illustrations/occasion-wedding.svg",   accentVar: "--color-occasion-wedding" },
  { key: "corporate_dinner", label: "Cină corporate", blurb: "Cine de team, lansări, end-of-year", illustration: "/illustrations/occasion-corporate.svg", accentVar: "--color-occasion-corporate" },
  { key: "birthday",         label: "Aniversare",     blurb: "De la cină intimă la petrecere",  illustration: "/illustrations/occasion-birthday.svg",  accentVar: "--color-occasion-birthday" },
  { key: "product_launch",   label: "Lansare produs", blurb: "Cocktail, podea liberă, branding", illustration: "/illustrations/occasion-product.svg",   accentVar: "--color-occasion-product" },
];

export function OccasionEntryGrid() {
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl font-bold mb-4">Pentru ce moment cauți?</h2>
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        {ENTRIES.map((e) => (
          <a
            key={e.key}
            href={`#${e.key}`}
            style={{ background: `color-mix(in oklch, var(${e.accentVar}-soft) 80%, white)` }}
            className="rounded-card p-4 hover:shadow-elev2 transition-shadow border border-border"
          >
            <Image src={e.illustration} alt="" width={48} height={48} aria-hidden />
            <span className="block font-semibold mt-2">{e.label}</span>
            <span className="block text-xs text-text-secondary mt-1">{e.blurb}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Use them in the page**

```tsx
// src/app/[city]/events/page.tsx (rewrite)
import { notFound } from "next/navigation";
import { listRestaurants } from "@/lib/repos/restaurants-repo";
import { RestaurantCard } from "@/components/restaurant-card";
import { EditorialHero } from "@/components/events-landing/EditorialHero";
import { OccasionEntryGrid } from "@/components/events-landing/OccasionEntryGrid";

export default async function CityEventsPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const rows = await listRestaurants({ citySlug: city, capabilities: ["events"], limit: 60 });
  if (!rows) notFound();
  const cityCapitalised = city.charAt(0).toUpperCase() + city.slice(1);
  return (
    <main className="max-w-6xl mx-auto p-6">
      <EditorialHero city={cityCapitalised} venueCount={rows.length} />
      <OccasionEntryGrid />
      <section>
        <h2 className="font-display text-2xl font-bold mb-4">Toate locațiile</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <a key={r.id} href={`/${city}/${r.slug}`} className="block">
              <RestaurantCard restaurant={r} highlightCapability="events" />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\[city\]/events/page.tsx src/components/events-landing/
git commit -m "feat(consumer): editorial framing on /[city]/events"
```

---

### Task 19: Partner inbox — card stream replacing the table

**Files:**
- Modify: `src/components/partner/EventRequestInbox.tsx` (full rewrite)
- Create: `src/components/partner/EventRequestCard.tsx`
- Modify: `src/components/partner/__tests__/EventRequestInbox.test.tsx` (or create)

- [ ] **Step 1: Write a test asserting card markup**

```tsx
// EventRequestInbox.test.tsx
import { render, screen } from "@testing-library/react";
import { EventRequestInbox } from "../EventRequestInbox";

describe("EventRequestInbox (v2)", () => {
  it("renders one card per row with urgency, party size, days waiting", () => {
    const old = new Date(Date.now() - 4 * 86400_000);
    render(
      <EventRequestInbox rows={[
        { id: "r1", occasion: "wedding", eventDate: "2026-09-15", partySize: 50, guestName: "Ana", status: "new", createdAt: old, budgetPerHeadCents: 30000 },
      ]} />,
    );
    expect(screen.getByText(/ana/i)).toBeInTheDocument();
    expect(screen.getByText(/4 zile/i)).toBeInTheDocument();
    expect(screen.getByText(/nuntă/i)).toBeInTheDocument();
    expect(screen.getByText(/300 lei\/pers/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Build it**

```tsx
// EventRequestCard.tsx
"use client";
import Link from "next/link";
import { Calendar, Users, Wallet } from "lucide-react";

const OCCASION_LABELS_RO: Record<string, string> = {
  wedding: "Nuntă", birthday: "Aniversare", corporate_dinner: "Cină corporate",
  product_launch: "Lansare produs", other: "Altele",
};
const STATUS_TONES: Record<string, { label: string; tone: string }> = {
  new:      { label: "Nou",          tone: "bg-[var(--color-occasion-product-soft)] text-[var(--color-occasion-product)]" },
  viewing:  { label: "În lucru",     tone: "bg-[var(--color-occasion-corporate-soft)] text-[var(--color-occasion-corporate)]" },
  replied:  { label: "Răspuns",      tone: "bg-surface-muted text-text-secondary" },
  quoted:   { label: "Ofertă trimisă", tone: "bg-[var(--color-occasion-wedding-soft)] text-[var(--color-occasion-wedding)]" },
  accepted: { label: "Acceptat",     tone: "bg-green-100 text-green-700" },
  declined: { label: "Refuzat",      tone: "bg-zinc-100 text-zinc-500" },
};

export interface Row {
  id: string; occasion: string; eventDate: string; partySize: number;
  guestName: string; status: string; createdAt: Date;
  budgetPerHeadCents: number | null;
}

export function EventRequestCard({ row, nowMs }: { row: Row; nowMs: number }) {
  const days = Math.floor((nowMs - new Date(row.createdAt).getTime()) / 86_400_000);
  const urgent = row.status === "new" && days >= 2;
  const tone = STATUS_TONES[row.status] ?? { label: row.status, tone: "bg-surface-muted text-text-secondary" };
  return (
    <Link
      href={`/partner/corporate/events/${row.id}`}
      className={`block rounded-card border bg-surface-white p-4 hover:shadow-elev2 transition-shadow ${urgent ? "border-amber-400" : "border-border"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{row.guestName}</p>
          <p className="text-sm text-text-secondary">{OCCASION_LABELS_RO[row.occasion] ?? row.occasion}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${tone.tone}`}>{tone.label}</span>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-sm text-text-secondary">
        <span className="inline-flex items-center gap-1"><Calendar className="w-4 h-4" /> {row.eventDate}</span>
        <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" /> {row.partySize} pers.</span>
        {row.budgetPerHeadCents != null && (
          <span className="inline-flex items-center gap-1"><Wallet className="w-4 h-4" /> {Math.round(row.budgetPerHeadCents / 100)} lei/pers</span>
        )}
        <span className={`ml-auto ${urgent ? "text-amber-600 font-medium" : ""}`}>{days} zile</span>
      </div>
    </Link>
  );
}
```

```tsx
// EventRequestInbox.tsx (full rewrite)
"use client";
import { useState } from "react";
import { EventRequestCard, type Row } from "./EventRequestCard";

export function EventRequestInbox({ rows }: { rows: Row[] }) {
  const [nowMs] = useState(() => Date.now());
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="font-display text-lg">Nicio cerere încă.</p>
        <p className="text-sm text-text-secondary mt-1">Cererile noi apar aici imediat după ce sunt confirmate prin email.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => <EventRequestCard key={r.id} row={r} nowMs={nowMs} />)}
    </div>
  );
}
```

Update the inbox page that hydrates this with the additional `budgetPerHeadCents` field.

- [ ] **Step 3: Run test, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/components/partner/EventRequestInbox.tsx \
        src/components/partner/EventRequestCard.tsx \
        src/components/partner/__tests__/EventRequestInbox.test.tsx
git commit -m "feat(partner): card-stream inbox with urgency + budget surfacing"
```

---

### Task 20: Partner detail page — restructured with revenue widget

**Files:**
- Modify: `src/components/partner/EventRequestDetail.tsx` (full rewrite)
- Create: `src/components/partner/RevenueEstimateWidget.tsx`

- [ ] **Step 1: Build the revenue widget**

```tsx
// RevenueEstimateWidget.tsx
"use client";
export function RevenueEstimateWidget({ partySize, budgetPerHeadCents }: { partySize: number; budgetPerHeadCents: number | null }) {
  const lowCents  = budgetPerHeadCents ? Math.round(budgetPerHeadCents * 0.85) : null;
  const highCents = budgetPerHeadCents ? Math.round(budgetPerHeadCents * 1.15) : null;
  const low  = lowCents  != null ? Math.round(lowCents  / 100) * partySize : null;
  const high = highCents != null ? Math.round(highCents / 100) * partySize : null;
  return (
    <div className="rounded-card border border-border p-4 bg-gradient-to-br from-[var(--color-occasion-product-soft)] to-surface-white">
      <p className="text-xs font-semibold text-[var(--color-occasion-product)] uppercase tracking-wider">Estimare venit</p>
      {low != null && high != null ? (
        <p className="font-display text-2xl font-bold mt-1">
          {low.toLocaleString("ro-RO")} – {high.toLocaleString("ro-RO")} lei
        </p>
      ) : (
        <p className="font-display text-lg mt-1 text-text-secondary">Clientul nu a specificat buget</p>
      )}
      <p className="text-xs text-text-secondary mt-1">{partySize} pers. · interval ±15% față de bugetul declarat</p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the detail**

```tsx
// EventRequestDetail.tsx (excerpts of the full rewrite)
"use client";
import { useState, useTransition } from "react";
import { Calendar, Users, Mail, Phone, Building2 } from "lucide-react";
import { Button } from "@/components/button";
import { QuoteForm } from "./QuoteForm";
import { DeclineForm } from "./DeclineForm";
import { MaterializeReservationForm } from "./MaterializeReservationForm";
import { RevenueEstimateWidget } from "./RevenueEstimateWidget";
import { markEventRequestViewing, replyToEventRequest } from "@/app/api/event-requests/actions";

const OCCASION_LABELS: Record<string, string> = { wedding: "Nuntă", birthday: "Aniversare", corporate_dinner: "Cină corporate", product_launch: "Lansare produs", other: "Altele" };

interface ER {
  id: string; status: string; occasion: string; eventDate: string; partySize: number;
  guestName: string; guestEmail: string; guestPhone: string | null;
  privateSpace: { name: string } | null;
  spacePreference: string | null;
  budgetPerHeadCents: number | null;
  menuPreference: string | null; dietaryNotes: string | null; additionalNotes: string | null;
  partnerResponse: string | null; quotedAmountCents: number | null;
  claimedCompanyCui: string | null; claimedCompanyName: string | null;
}

export function EventRequestDetail({ er, overlaps }: { er: ER; overlaps: { id: string; reservationTime: string; partySize: number }[] }) {
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"detail" | "quote" | "decline" | "materialize">("detail");
  const [replyText, setReplyText] = useState("");

  return (
    <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cerere #{er.id.slice(0,8)}</p>
          <h1 className="font-display text-3xl font-bold mt-1">{OCCASION_LABELS[er.occasion] ?? er.occasion}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-text-secondary">
            <span className="inline-flex items-center gap-1"><Calendar className="w-4 h-4" /> {er.eventDate}</span>
            <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" /> {er.partySize} pers.</span>
          </div>
        </header>

        {overlaps.length > 0 && (
          <div className="border border-amber-400 bg-amber-50 rounded-card p-3 text-sm">
            ⚠ {overlaps.length} rezervări regulate pe această dată. Verifică înainte de a accepta.
          </div>
        )}

        <section className="grid sm:grid-cols-2 gap-3 text-sm">
          <Field icon={<Mail className="w-4 h-4" />} label="Email"  value={er.guestEmail} />
          {er.guestPhone && <Field icon={<Phone className="w-4 h-4" />} label="Telefon" value={er.guestPhone} />}
          {er.privateSpace && <Field icon={<Building2 className="w-4 h-4" />} label="Spațiu" value={er.privateSpace.name} />}
          {!er.privateSpace && er.spacePreference && <Field label="Spațiu preferat" value={er.spacePreference} />}
          {er.budgetPerHeadCents != null && <Field label="Buget/pers" value={`${Math.round(er.budgetPerHeadCents/100)} lei`} />}
          {er.claimedCompanyCui && <Field label="Companie" value={`${er.claimedCompanyName ?? "—"} · CUI ${er.claimedCompanyCui}`} />}
        </section>

        {(er.menuPreference || er.dietaryNotes || er.additionalNotes) && (
          <section className="space-y-2">
            {er.menuPreference && <Block label="Meniu" value={er.menuPreference} />}
            {er.dietaryNotes && <Block label="Restricții" value={er.dietaryNotes} />}
            {er.additionalNotes && <Block label="Note suplimentare" value={er.additionalNotes} />}
          </section>
        )}

        {er.partnerResponse && (
          <section className="bg-surface-muted rounded-card p-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Răspunsul tău anterior</p>
            <p className="whitespace-pre-line mt-1 text-sm">{er.partnerResponse}</p>
          </section>
        )}

        {view === "detail" && (er.status === "new" || er.status === "viewing" || er.status === "replied") && (
          <div className="space-y-3">
            <textarea
              value={replyText} onChange={(e) => setReplyText(e.target.value)}
              className="w-full border border-border rounded-card p-3" rows={3} placeholder="Răspuns rapid pentru client…"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || !replyText.trim()} onClick={() => startTransition(() => replyToEventRequest({ id: er.id, message: replyText }).then(() => location.reload()))}>
                Trimite răspuns
              </Button>
              <Button variant="secondary" onClick={() => setView("quote")}>Trimite ofertă</Button>
              <Button variant="ghost" onClick={() => setView("decline")}>Refuză</Button>
            </div>
          </div>
        )}

        {er.status === "accepted" && view === "detail" && (
          <Button onClick={() => setView("materialize")}>Creează rezervare</Button>
        )}

        {view === "quote" && <QuoteForm eventRequestId={er.id} partySize={er.partySize} budgetPerHeadCents={er.budgetPerHeadCents} onCancel={() => setView("detail")} />}
        {view === "decline" && <DeclineForm eventRequestId={er.id} onCancel={() => setView("detail")} />}
        {view === "materialize" && <MaterializeReservationForm eventRequestId={er.id} eventDate={er.eventDate} partySize={er.partySize} onCancel={() => setView("detail")} />}
      </div>

      <aside className="space-y-4">
        <RevenueEstimateWidget partySize={er.partySize} budgetPerHeadCents={er.budgetPerHeadCents} />
        <div className="rounded-card border border-border p-4 bg-surface-white">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Despre client</p>
          <p className="text-sm mt-2 font-medium">{er.guestName}</p>
          <p className="text-xs text-text-secondary mt-1">{er.guestEmail}</p>
          {er.guestPhone && <p className="text-xs text-text-secondary mt-1">{er.guestPhone}</p>}
        </div>
      </aside>
    </main>
  );
}

function Field({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-muted rounded-card p-3">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      <p className="mt-1 flex items-center gap-1.5">{icon}{value}</p>
    </div>
  );
}
function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm whitespace-pre-line mt-1">{value}</p>
    </div>
  );
}
```

Update the partner detail page handler to fetch the additional `privateSpace` join + `claimedCompanyCui`.

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/EventRequestDetail.tsx \
        src/components/partner/RevenueEstimateWidget.tsx
git commit -m "feat(partner): structured detail page with revenue estimate"
```

---

### Task 21: Live quote builder

**Files:**
- Modify: `src/components/partner/QuoteForm.tsx` (full rewrite)
- Create: `src/components/partner/QuoteLineItemRow.tsx`
- Create: `src/components/partner/__tests__/QuoteBuilder.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// QuoteBuilder.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { QuoteForm } from "../QuoteForm";

describe("QuoteForm (v2)", () => {
  it("totals line items live and previews the consumer-side amount", () => {
    render(
      <QuoteForm eventRequestId="er1" partySize={20} budgetPerHeadCents={28000} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Suma \(lei\)/i), { target: { value: "5000" } });
    expect(screen.getByText(/Total: 5\.000 lei/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Build the line-item row + form**

```tsx
// QuoteLineItemRow.tsx
"use client";
import { X } from "lucide-react";

export function QuoteLineItemRow({
  label, amount, onChange, onDelete, suggested,
}: {
  label: string;
  amount: string;
  onChange: (patch: { label?: string; amount?: string }) => void;
  onDelete: () => void;
  suggested?: { label: string; amountLei: number }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <input placeholder="Descriere" value={label} onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 border border-border rounded-card p-2" />
      <input type="number" placeholder="Suma (lei)" value={amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        className="w-32 border border-border rounded-card p-2 tabular-nums" />
      <button onClick={onDelete} aria-label="Șterge linie" className="text-text-muted hover:text-red-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

```tsx
// QuoteForm.tsx (full rewrite)
"use client";
import { useState, useMemo, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/button";
import { QuoteLineItemRow } from "./QuoteLineItemRow";
import { sendQuoteForEventRequest } from "@/app/api/event-requests/actions";

interface Line { id: string; label: string; amount: string; }

const STARTING_TEMPLATES = (partySize: number, budgetPerHeadCents: number | null): Line[] => {
  const perHead = budgetPerHeadCents ? Math.round(budgetPerHeadCents / 100) : 300;
  return [
    { id: "1", label: `Meniu standard (${partySize} pers. × ${perHead} lei)`, amount: String(partySize * perHead) },
  ];
};

const SUGGESTED = [
  { label: "Welcome cocktail", per: 25 },
  { label: "Open bar (3h)",    per: 90 },
  { label: "Tort personalizat", per: 18 },
  { label: "Decor floral",      flat: 800 },
  { label: "DJ / sonorizare",   flat: 1500 },
];

export function QuoteForm({ eventRequestId, partySize, budgetPerHeadCents, onCancel }: {
  eventRequestId: string; partySize: number; budgetPerHeadCents: number | null; onCancel: () => void;
}) {
  const [lines, setLines] = useState<Line[]>(() => STARTING_TEMPLATES(partySize, budgetPerHeadCents));
  const [expiresDays, setExpiresDays] = useState(7);
  const [partnerResponse, setPartnerResponse] = useState("");
  const [pending, startTransition] = useTransition();

  const totalLei = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0),
    [lines],
  );

  function addLine(label = "", amount = "") {
    setLines((ls) => [...ls, { id: String(Date.now()), label, amount }]);
  }
  function addSuggested(s: { label: string; per?: number; flat?: number }) {
    const amount = s.flat ?? (s.per ? s.per * partySize : 0);
    addLine(s.label, String(amount));
  }

  function send() {
    startTransition(async () => {
      await sendQuoteForEventRequest({
        id: eventRequestId,
        expiresAt: new Date(Date.now() + expiresDays * 86400_000).toISOString(),
        partnerResponse: partnerResponse || undefined,
        lineItems: lines
          .filter((l) => l.label.trim() && Number(l.amount) > 0)
          .map((l) => ({ label: l.label, amountCents: Number(l.amount) * 100 })),
      });
      window.location.reload();
    });
  }

  return (
    <section className="space-y-4 rounded-card border border-border p-4 bg-surface-white">
      <h3 className="font-display text-lg font-bold">Construiește oferta</h3>
      <div className="space-y-2">
        {lines.map((l) => (
          <QuoteLineItemRow
            key={l.id}
            label={l.label}
            amount={l.amount}
            onChange={(p) => setLines((ls) => ls.map((ll) => ll.id === l.id ? { ...ll, ...p } : ll))}
            onDelete={() => setLines((ls) => ls.filter((ll) => ll.id !== l.id))}
          />
        ))}
        <button onClick={() => addLine()} className="text-sm font-medium text-brand-primary inline-flex items-center gap-1">
          <Plus className="w-4 h-4" /> Adaugă linie
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Adăugări frecvente</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button key={s.label} onClick={() => addSuggested(s)}
              className="text-xs px-2 py-1 rounded-full bg-surface-muted hover:bg-border">
              + {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea value={partnerResponse} onChange={(e) => setPartnerResponse(e.target.value)} rows={3}
        placeholder="Mesaj însoțitor pentru client (opțional)"
        className="w-full border border-border rounded-card p-2 text-sm" />

      <label className="flex items-center gap-2 text-sm">
        <span>Oferta expiră în</span>
        <input type="number" min={1} max={30} value={expiresDays}
          onChange={(e) => setExpiresDays(Number(e.target.value))}
          className="w-16 border border-border rounded-card p-1 tabular-nums" />
        <span>zile</span>
      </label>

      <div className="flex items-center justify-between p-3 bg-[var(--color-occasion-product-soft)] rounded-card">
        <span className="text-sm font-medium">Total: {totalLei.toLocaleString("ro-RO")} lei</span>
        <span className="text-xs text-text-secondary">{partySize} pers. · {Math.round(totalLei / partySize).toLocaleString("ro-RO")} lei/pers</span>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Renunță</Button>
        <Button onClick={send} disabled={pending || totalLei === 0}>Trimite oferta</Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Run test, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/components/partner/QuoteForm.tsx \
        src/components/partner/QuoteLineItemRow.tsx \
        src/components/partner/__tests__/QuoteBuilder.test.tsx
git commit -m "feat(partner): live-totalling quote builder with line items"
```

---

### Task 22: Inbox filters + sorting

**Files:**
- Modify: `src/app/partner/(dashboard)/corporate/events/page.tsx`
- Create: `src/components/partner/InboxFilters.tsx`

- [ ] **Step 1: Build filter chips**

```tsx
// InboxFilters.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = [
  { key: "open",     label: "Active",     statuses: ["new", "viewing", "replied", "quoted"] },
  { key: "new",      label: "Nou",        statuses: ["new"] },
  { key: "viewing",  label: "În lucru",   statuses: ["viewing"] },
  { key: "quoted",   label: "Cu ofertă",  statuses: ["quoted"] },
  { key: "accepted", label: "Acceptate",  statuses: ["accepted"] },
  { key: "all",      label: "Toate",      statuses: [] },
];

export function InboxFilters({ active }: { active: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set("status", s.key);
            router.push(`?${next.toString()}`);
          }}
          className={`text-sm px-3 py-1.5 rounded-full ${active === s.key ? "bg-brand-primary text-white" : "bg-surface-muted hover:bg-border"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into page**

In `src/app/partner/(dashboard)/corporate/events/page.tsx`, accept `searchParams.status` and filter the inbox query accordingly. Render `<InboxFilters active={status} />` above `<EventRequestInbox rows={...} />`.

- [ ] **Step 3: Commit**

```bash
git add src/app/partner/\(dashboard\)/corporate/events/page.tsx \
        src/components/partner/InboxFilters.tsx
git commit -m "feat(partner): inbox filter chips by status"
```

---

### Task 23: Materialize — visual time-slot picker

**Files:**
- Modify: `src/components/partner/MaterializeReservationForm.tsx`

- [ ] **Step 1: Rewrite the form**

Replace the free-text time input with a visual picker derived from the venue's `restaurant_availability` for the chosen date. Slots are shown as pill buttons; selecting one populates `time`.

```tsx
// MaterializeReservationForm.tsx (excerpt)
"use client";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { materializeAcceptedEventRequest } from "@/app/api/event-requests/actions";

interface Slot { start: string; capacity: number; }

interface Props { eventRequestId: string; eventDate: string; partySize: number; onCancel: () => void; }

export function MaterializeReservationForm({ eventRequestId, eventDate, partySize, onCancel }: Props) {
  const [mode, setMode] = useState<"private_room" | "whole_venue">("private_room");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/partner/availability-slots?date=${eventDate}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []));
  }, [eventDate]);

  function submit() {
    if (!time) return;
    startTransition(async () => {
      await materializeAcceptedEventRequest({
        id: eventRequestId, mode,
        slots: [{ time, partySize }],
      });
      window.location.href = "/partner/reservations";
    });
  }

  return (
    <section className="space-y-4 rounded-card border border-border p-4 bg-surface-white">
      <h3 className="font-display text-lg font-bold">Creează rezervare</h3>
      <div className="flex gap-2">
        <button onClick={() => setMode("private_room")}
          className={`flex-1 rounded-card border-2 p-3 text-left ${mode === "private_room" ? "border-brand-primary bg-brand-primary/5" : "border-border"}`}>
          <span className="block font-semibold">Spațiu privat</span>
          <span className="text-xs text-text-secondary">Camera privată; restul venue-ului rămâne deschis.</span>
        </button>
        <button onClick={() => setMode("whole_venue")}
          className={`flex-1 rounded-card border-2 p-3 text-left ${mode === "whole_venue" ? "border-brand-primary bg-brand-primary/5" : "border-border"}`}>
          <span className="block font-semibold">Tot venue-ul</span>
          <span className="text-xs text-text-secondary">Închidere completă a venue-ului pentru evenimentul tău.</span>
        </button>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Slot</p>
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button key={s.start} onClick={() => setTime(s.start)}
              className={`text-sm px-3 py-1.5 rounded-full border ${time === s.start ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-surface-white"}`}>
              {s.start.slice(0, 5)}
            </button>
          ))}
          {slots.length === 0 && <span className="text-xs text-text-secondary">Niciun slot configurat pentru această zi. Configurează în pagina Disponibilitate.</span>}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Renunță</Button>
        <Button onClick={submit} disabled={pending || !time}>Confirmă rezervarea</Button>
      </div>
    </section>
  );
}
```

Create `src/app/api/partner/availability-slots/route.ts` returning the venue's slots for the given date (use `dayOfWeek` lookup).

- [ ] **Step 2: Commit**

```bash
git add src/components/partner/MaterializeReservationForm.tsx \
        src/app/api/partner/availability-slots/
git commit -m "feat(partner): visual time-slot picker on materialize"
```

---

### Task 24: PartnerNotificationBell — localized + accurate read state

**Files:**
- Modify: `src/components/partner/PartnerNotificationBell.tsx`

- [ ] **Step 1: Localize + fix optimistic read**

```tsx
// PartnerNotificationBell.tsx (excerpt)
const KIND_LABEL: Record<string, string> = {
  new_event_request:        "Cerere nouă",
  event_request_replied:    "Răspuns nou",
  event_request_quoted:     "Ofertă trimisă",
  quote_accepted:           "Ofertă acceptată",
  quote_declined:           "Ofertă refuzată",
  event_request_cancelled:  "Cerere anulată",
};

async function markAllRead() {
  const res = await fetch("/api/partner-notifications", { method: "POST" });
  if (!res.ok) throw new Error("mark-read failed");
}

// In the click handler:
async function onBellClick() {
  setOpen(true);
  if (count > 0) {
    try {
      await markAllRead();
      setCount(0);
    } catch (e) {
      console.error(e);
    }
  }
}
```

Render `KIND_LABEL[item.kind] ?? item.kind` instead of the raw kind string.

- [ ] **Step 2: Commit**

```bash
git add src/components/partner/PartnerNotificationBell.tsx
git commit -m "fix(partner): localized notification kinds + accurate read state"
```

---

### Task 25: Mobile sheet full-screen treatment

**Files:**
- Modify: `src/components/event-request-sheet-v2/index.tsx`

- [ ] **Step 1: Make the mobile sheet full-height**

In the wrapper div: change `items-end` to `items-end` on mobile but with `h-full` on the sheet itself when `viewport < md`. Detail in CSS:

```tsx
// On the motion.div className:
className="bg-surface-white w-full desktop:max-w-2xl rounded-t-card desktop:rounded-card shadow-elev3 h-[92vh] desktop:max-h-[92vh] desktop:h-auto flex flex-col"
```

This converts mobile to near-full-height bottom sheet, keeping desktop centered.

- [ ] **Step 2: Commit**

```bash
git add src/components/event-request-sheet-v2/index.tsx
git commit -m "fix(consumer): mobile sheet full-height treatment"
```

---

### Task 26: A11y sweep

**Files:**
- Audit all v2 components for: `aria-live` on the sent step, `aria-label` on icon-only buttons, focus management between steps, keyboard support for room picker tiles, visible focus rings everywhere.

- [ ] **Step 1: Run axe-core via Playwright**

```bash
npx playwright test --reporter=list
```

(After Phase 1 USE_DB blocker resolves — until then, document the audit in `e2e/a11y.spec.ts.skip`.)

Add the spec for completeness:

```ts
// e2e/a11y.spec.ts.skip
// Once USE_DB unblocks, rename to .spec.ts and run.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("event-request CTA + sheet pass axe rules", async ({ page }) => {
  await page.goto("/bucuresti/atelier-floreasca");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

`npm install -D @axe-core/playwright`.

- [ ] **Step 2: Commit**

```bash
git add e2e/a11y.spec.ts.skip package.json package-lock.json
git commit -m "test(a11y): scaffold axe sweep for Phase 1.5 components"
```

---

### Task 27: Final review + finishing

- [ ] **Step 1: Run the full test suite**

```bash
npx jest --forceExit
```

Expected: all green (488 + ~30 new = ~520 tests).

- [ ] **Step 2: Build verification**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 3: Dispatch reviewer subagent**

Use `superpowers:requesting-code-review` on the Phase 1.5 commit range.

- [ ] **Step 4: Fix Critical + Important findings**

- [ ] **Step 5: Visual review against the screenshot checklist**

Use Playwright (or manually) to capture:
- Venue page with new CTA — should now read as primary moment, not duplicate-of-reserve.
- Sheet step 1 — colorful occasion cards, clear hierarchy.
- Sheet step 2 — calendar with lead-time badge.
- Sheet step 3 — room picker tiles, inline guidance.
- Sheet step 4 — ANAF auto-lookup pill.
- Sheet step 5 — animated success.
- Tracking page — timeline + countdown + partner badge + line-item breakdown.
- Events landing — editorial hero + occasion entries.
- Partner inbox — card stream with urgency cues.
- Partner detail — sidebar revenue widget + structured fields.
- Quote builder — live total + suggested add-ons.

Each should look like a screenshot you'd put in a sales deck.

- [ ] **Step 6: Run finishing-a-development-branch**

```bash
# branch: feat/corporate-bookings-phase-1-5
```

Use `superpowers:finishing-a-development-branch`.

- [ ] **Step 7: Update memory**

Mark Phase 1.5 shipped in `MEMORY.md` + the project-corporate-bookings memory file.

---

## Verification

- **Visual**: 11 sales-deck-quality screenshots captured (Task 27 Step 5).
- **Tests**: Jest green; ~30 new test files / ~80 new test cases.
- **Build**: `tsc`, `eslint`, `next build` all clean.
- **Migration**: 0010 applied locally; prod apply held for explicit authorization per deploy convention.
- **Bundle size**: framer-motion adds ~30 KB gzip; react-day-picker ~20 KB. Acceptable for the consumer flow that's now the brand surface; do NOT load them on the main feed (they're behind `EventRequestSheetV2` which only mounts on click).
- **Performance**: events landing should still pass Core Web Vitals — hero is static, occasion grid uses `<Image>` with priority, restaurant cards lazy.

## Migration / Deploy Bookkeeping

- `0010_private_spaces_and_quote_lines.sql` — apply via psql + insert into `drizzle.__drizzle_migrations` with hash + ms epoch (pattern from [[deploy_setup]]).
- Snapshot + journal generated by `npm run db:generate`; retag and reconcile as established in prior migrations.
- Coolify redeploy required for the new routes (`/partner/corporate/spaces`) and the new components.

## Open Questions

1. **Illustrations.** The plan assumes 5 occasion SVGs in `public/illustrations/`. Source from your design folder, commission, or use Lucide-derived stubs? Decide before Task 11.
2. **Stock photography for room picker fallback.** If a venue uploads no photo for a private space, do we show a placeholder gradient or a stock interior? Currently the plan uses a muted gray block.
3. **Mobile half-sheet vs full-sheet.** Task 25 makes it ~92vh. Some users prefer half-height with the venue context still visible. Confirm preference before shipping.
4. **Trilingual rollout.** Phase 1.5 stays RO. EN strings exist in transactional emails; do we keep parity in-app, or defer to Phase 2 alongside the company-accounts launch?
