# Verified-Reservation Reviews v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship verified-reservation reviews end-to-end — diners who confirmed a reservation get a one-click rating email after their visit; submitted reviews drive a denormalised aggregate rating on each restaurant. No accounts. No moderation. No partner-facing read view (Phase 2).

**Architecture:** New `reviews` table linked to `reservations` via a `UNIQUE` FK so each reservation gets at most one review. Authentication piggybacks on the existing `confirmation_token` already in the diner's confirmation email — no new auth surface. A new hourly cron route scans for reservations whose slot is ≥4h in the past and that haven't been emailed yet, and sends one post-visit email each. Aggregate rating + count are kept fresh on `restaurants.rating` / `restaurants.vote_count` by a Postgres `AFTER INSERT` trigger. The detail page already consumes `reviews[]` and `reviewIntelligence` shapes that today come back empty; this plan wires real data through. Card- and detail-level UI gates the visible rating chip behind `vote_count >= 3` to avoid the cold-start "1 review · 5★" footgun.

**Tech Stack:** Next.js 16.2.4 (App Router, server components default), Drizzle ORM 0.45.2 + raw-SQL Supabase migrations, Supabase admin client for trigger-trusted writes, anon client for public reads, Resend + React Email, Jest + RTL (jsdom).

**Out of scope (Phase 2):** photo uploads on reviews, multi-axis ratings, restaurant responses, admin moderation queue, partner-side review inbox, helpful votes, review status column.

---

## File Map

**New files:**
- `drizzle/migrations/0006_reviews.sql` — table + RLS + trigger + reservations column
- `src/emails/PostVisitReviewEmail.tsx` — one-click rating email template
- `src/emails/__tests__/PostVisitReviewEmail.test.tsx`
- `src/app/api/cron/post-visit-emails/route.ts` — hourly scanner
- `src/app/api/cron/post-visit-emails/__tests__/route.test.ts`
- `src/app/reviews/[token]/page.tsx` — server component, loads reservation + existing review
- `src/app/reviews/[token]/actions.ts` — `submitReviewByToken` server action
- `src/app/reviews/[token]/__tests__/actions.test.ts`
- `src/components/review-submit-form.tsx` — client component, star input + textarea
- `src/components/__tests__/review-submit-form.test.tsx`
- `src/lib/repos/reviews-repo.ts` — `getReviewsForRestaurant`, `firstNameFrom` helper
- `src/lib/repos/__tests__/reviews-repo.test.ts`

**Modified files:**
- `src/lib/db/schema.ts` — add `reviews` table; add `postVisitEmailSentAt` to `reservations`
- `src/lib/repos/restaurants-repo.ts` — populate `reviews` + `reviewIntelligence` in `dbGetRestaurantDetail`
- `src/app/[city]/[slug]/DetailPageClient.tsx` — gate the rating chip behind `voteCount >= 3`
- `src/components/__tests__/restaurant-card-or-similar.test.tsx` — same gating where stars are shown
- `.env.local.example` — `CRON_SECRET=`

---

## Task 1: Schema additions (TS + SQL migration together)

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/migrations/0006_reviews.sql`

The two changes are paired: Drizzle defines the ORM-side types, the SQL file is the source of truth for the DB. Keep them in lockstep.

- [ ] **Step 1: Add `reviews` table + `postVisitEmailSentAt` column in `schema.ts`**

In `src/lib/db/schema.ts`, edit the `reservations` table (around line 272) to add one column at the end of the column block (just before the closing `}, (t) => [`):

```typescript
  postVisitEmailSentAt: timestamp("post_visit_email_sent_at", {
    withTimezone: true,
  }),
```

Then append a new `reviews` table at the end of the file (after `draftRestaurants`):

```typescript
// ─── reviews ────────────────────────────────────────────────────────────
// Verified-reservation reviews: each row is anchored to a real reservation
// via a UNIQUE FK, so a reservation can produce at most one review and the
// review carries cryptographic provenance through the confirmation token
// flow. Aggregate rating + vote_count on `restaurants` are kept current by
// a Postgres AFTER-INSERT trigger (see migration 0006).
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id")
    .notNull()
    .unique()
    .references(() => reservations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  comment: text("comment"),
  firstName: text("first_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("reviews_restaurant_created_idx").on(t.restaurantId, t.createdAt),
]);
```

- [ ] **Step 2: Write the migration SQL**

Create `drizzle/migrations/0006_reviews.sql` with the exact contents below. The trigger uses `ROUND(AVG(...)::numeric, 1)` so it fits `restaurants.rating numeric(2,1)`.

```sql
-- 0006_reviews.sql
-- Verified-reservation reviews: every review is anchored to a real
-- reservation. Aggregate rating + count denormalised onto restaurants
-- via trigger so the consumer card path stays a single read.

ALTER TABLE "reservations"
  ADD COLUMN "post_visit_email_sent_at" TIMESTAMPTZ;

CREATE TABLE "reviews" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" UUID NOT NULL UNIQUE
    REFERENCES "reservations"("id") ON DELETE CASCADE,
  "restaurant_id"  UUID NOT NULL
    REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "rating"         SMALLINT NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment"        TEXT,
  "first_name"     TEXT NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "reviews_restaurant_created_idx"
  ON "reviews" ("restaurant_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION "fn_reviews_after_insert"() RETURNS TRIGGER AS $$
DECLARE
  v_avg   NUMERIC(2,1);
  v_count INTEGER;
BEGIN
  SELECT ROUND(AVG(rating)::numeric, 1), COUNT(*)
    INTO v_avg, v_count
    FROM "reviews"
    WHERE "restaurant_id" = NEW."restaurant_id";

  UPDATE "restaurants"
    SET "rating"      = v_avg,
        "vote_count"  = v_count,
        "updated_at"  = NOW()
    WHERE "id" = NEW."restaurant_id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_reviews_after_insert"
  AFTER INSERT ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "fn_reviews_after_insert"();

ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;

-- Public can read reviews of live restaurants. Inserts/updates/deletes
-- are blocked for anon/authenticated; only the service role (via
-- createSupabaseAdminClient) can write — same pattern as reservations.
CREATE POLICY "reviews_public_read" ON "reviews"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "restaurants" r
      WHERE r.id = "reviews"."restaurant_id"
        AND r.status = 'live'
    )
  );
```

- [ ] **Step 3: Apply the migration locally and verify**

Run: `npm run db:migrate`
Expected: completes without error; `0006_reviews.sql` is recorded.

Then verify the trigger by hand:

```bash
npm run supabase:status   # confirm local Supabase is running
```

Open Supabase Studio (URL printed by `status`), run in SQL editor:

```sql
-- Pick a live restaurant + one of its reservations.
SELECT id, confirmation_token, restaurant_id, guest_name
  FROM reservations
  WHERE status = 'confirmed'
  LIMIT 1;

-- Substitute IDs from above.
INSERT INTO reviews (reservation_id, restaurant_id, rating, first_name)
VALUES ('<reservation_id>', '<restaurant_id>', 5, 'Test');

-- Verify the trigger fired.
SELECT id, rating, vote_count FROM restaurants WHERE id = '<restaurant_id>';

-- Clean up.
DELETE FROM reviews WHERE first_name = 'Test';
```
Expected: `rating = 5.0`, `vote_count = 1` after insert; both update to prior values after delete only if you also re-trigger by inserting another row (the trigger is INSERT-only by design — Phase 1 doesn't support edits/deletes, so this is fine).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0006_reviews.sql
git commit -m "feat(reviews): schema + migration for verified-reservation reviews"
```

---

## Task 2: PostVisitReviewEmail template

**Files:**
- Create: `src/emails/PostVisitReviewEmail.tsx`
- Create: `src/emails/__tests__/PostVisitReviewEmail.test.tsx`

Style mirrors `ReservationConfirmationEmail.tsx` (same Tavli logo, container, palette). Five star buttons, each linking to `/reviews/[token]?rating=N`.

- [ ] **Step 1: Write the failing test**

Create `src/emails/__tests__/PostVisitReviewEmail.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { PostVisitReviewEmail } from "@/emails/PostVisitReviewEmail";

describe("PostVisitReviewEmail", () => {
  const props = {
    restaurantName: "Trattoria Roma",
    guestName: "Henrick Tissink",
    reviewBaseUrl: "https://tavli.ro/reviews/abc123",
  };

  test("renders restaurant name in heading", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    expect(container.textContent).toContain("Trattoria Roma");
  });

  test("greets the guest by first name only", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    expect(container.textContent).toContain("Henrick");
    expect(container.textContent).not.toContain("Tissink");
  });

  test("renders five rating links with rating query param 1..5", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    const links = Array.from(container.querySelectorAll("a"))
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h && h.includes("/reviews/"));
    expect(links).toEqual([
      "https://tavli.ro/reviews/abc123?rating=1",
      "https://tavli.ro/reviews/abc123?rating=2",
      "https://tavli.ro/reviews/abc123?rating=3",
      "https://tavli.ro/reviews/abc123?rating=4",
      "https://tavli.ro/reviews/abc123?rating=5",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/emails/__tests__/PostVisitReviewEmail.test.tsx`
Expected: FAIL — `Cannot find module '@/emails/PostVisitReviewEmail'`.

- [ ] **Step 3: Implement the email template**

Create `src/emails/PostVisitReviewEmail.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface Props {
  restaurantName: string;
  guestName: string;
  reviewBaseUrl: string; // e.g. https://tavli.ro/reviews/<token>
}

function firstNameOf(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0];
}

export function PostVisitReviewEmail({
  restaurantName,
  guestName,
  reviewBaseUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>How was {restaurantName}? One tap to rate.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            How was {restaurantName}?
          </Heading>
          <Text style={lede}>
            Hi {firstNameOf(guestName)} — one tap is all we need. Your rating
            stays anonymous (first name only) and helps the next diner.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Link
                key={n}
                href={`${reviewBaseUrl}?rating=${n}`}
                style={star}
              >
                {"★".repeat(n)}
              </Link>
            ))}
          </Section>
          <Text style={textMuted}>
            Tap a star above. You&apos;ll land on a page where you can add a
            comment if you want — or just submit and you&apos;re done.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Tavli — reservations across Romania and Turkey.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FAFAF9",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};
const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 24px",
  backgroundColor: "#FFFFFF",
  borderRadius: "16px",
};
const logo = {
  color: "#F97316",
  fontSize: "28px",
  fontWeight: 700,
  margin: "0 0 8px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const h1 = {
  fontSize: "30px",
  lineHeight: "1.15",
  color: "#1C1917",
  margin: "20px 0 12px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const lede = {
  fontSize: "16px",
  lineHeight: "1.55",
  color: "#44403C",
  margin: "0 0 8px",
};
const textMuted = {
  fontSize: "13px",
  lineHeight: "1.55",
  color: "#78716C",
  margin: "8px 0 0",
};
const star = {
  display: "inline-block",
  margin: "0 4px",
  padding: "12px 14px",
  backgroundColor: "#FFF7ED",
  border: "1px solid #FED7AA",
  borderRadius: "10px",
  color: "#F97316",
  fontSize: "20px",
  textDecoration: "none",
  fontWeight: 700,
};
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 12px" };
const footer = { fontSize: "12px", color: "#A8A29E", textAlign: "center" as const };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/emails/__tests__/PostVisitReviewEmail.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/emails/PostVisitReviewEmail.tsx src/emails/__tests__/PostVisitReviewEmail.test.tsx
git commit -m "feat(reviews): post-visit review email template"
```

---

## Task 3: Post-visit cron route

**Files:**
- Create: `src/app/api/cron/post-visit-emails/route.ts`
- Create: `src/app/api/cron/post-visit-emails/__tests__/route.test.ts`
- Modify: `.env.local.example` — add `CRON_SECRET=`

Cron is a `POST` route protected by `Authorization: Bearer ${CRON_SECRET}`. Self-hosted on Coolify; deployment config note appears in Task 11.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/cron/post-visit-emails/__tests__/route.test.ts`:

```typescript
import { POST } from "@/app/api/cron/post-visit-emails/route";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...OLD_ENV,
    CRON_SECRET: "test-secret",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    NEXT_PUBLIC_APP_URL: "https://tavli.ro",
  };
});

afterEach(() => {
  process.env = OLD_ENV;
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/post-visit-emails", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/post-visit-emails", () => {
  test("rejects without bearer token", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  test("rejects with wrong bearer token", async () => {
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  test("returns 500 when supabase env not set", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }),
    );
    expect(res.status).toBe(500);
  });

  test("sends email + updates sent_at for each eligible reservation", async () => {
    const longAgo = new Date(Date.now() - 6 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const oldTime = new Date(Date.now() - 6 * 3600_000)
      .toISOString()
      .slice(11, 19);
    const candidates = [
      {
        id: "res-1",
        confirmation_token: "tok-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        guest_email: "ana@example.com",
        reservation_date: longAgo,
        reservation_time: oldTime,
        restaurants: { name: "Roma" },
      },
    ];

    const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    const select = jest.fn().mockResolvedValue({ data: candidates, error: null });

    let chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.is = jest.fn(() => chain);
    chain.not = jest.fn(() => chain);
    chain.lte = jest.fn(() => chain);
    chain.gte = jest.fn().mockResolvedValue({ data: candidates, error: null });

    (createSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((tbl: string) => {
        if (tbl === "reservations") {
          return Object.assign({}, chain, { update });
        }
        return chain;
      }),
    });

    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }),
    );
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ post_visit_email_sent_at: expect.any(String) }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", "res-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/cron/post-visit-emails/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/cron/post-visit-emails/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";
import { PostVisitReviewEmail } from "@/emails/PostVisitReviewEmail";

export const dynamic = "force-dynamic";

const POST_VISIT_DELAY_MS = 4 * 3600_000; // 4 hours
const MAX_AGE_DAYS = 14;

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "config_missing" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const maxAgeStr = new Date(now - MAX_AGE_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const { data: candidates, error } = await admin
    .from("reservations")
    .select(
      "id, confirmation_token, restaurant_id, guest_name, guest_email, reservation_date, reservation_time, restaurants(name)",
    )
    .eq("status", "confirmed")
    .is("post_visit_email_sent_at", null)
    .not("guest_email", "is", null)
    .lte("reservation_date", todayStr)
    .gte("reservation_date", maxAgeStr);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter rows whose slot moment was at least POST_VISIT_DELAY_MS ago.
  // Slots are interpreted as Europe/Bucharest local time (+02:00) for MVP;
  // ~1h DST drift is acceptable since the threshold is 4h.
  const cutoff = now - POST_VISIT_DELAY_MS;
  const eligible = (candidates ?? []).filter((r) => {
    const slotMs = new Date(
      `${r.reservation_date}T${r.reservation_time}+02:00`,
    ).getTime();
    return slotMs <= cutoff;
  });

  let sent = 0;
  for (const r of eligible) {
    const restaurantField = r.restaurants as
      | { name: string }
      | { name: string }[]
      | null;
    const restaurantName = Array.isArray(restaurantField)
      ? restaurantField[0]?.name ?? "the restaurant"
      : restaurantField?.name ?? "the restaurant";

    const reviewBaseUrl = `${appOrigin()}/reviews/${r.confirmation_token}`;

    const result = await sendEmail({
      to: r.guest_email!,
      subject: `How was ${restaurantName}?`,
      react: PostVisitReviewEmail({
        restaurantName,
        guestName: r.guest_name,
        reviewBaseUrl,
      }),
    });

    if (result.ok) {
      await admin
        .from("reservations")
        .update({ post_visit_email_sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent += 1;
    }
  }

  return NextResponse.json({ ok: true, considered: eligible.length, sent });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/api/cron/post-visit-emails/__tests__/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add `CRON_SECRET` to env example**

Edit `.env.local.example` and append:

```
# Hourly cron auth — set in Coolify "scheduled tasks" too.
CRON_SECRET=
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/post-visit-emails/ .env.local.example
git commit -m "feat(reviews): hourly cron route for post-visit review emails"
```

---

## Task 4: Reviews repo + first-name helper

**Files:**
- Create: `src/lib/repos/reviews-repo.ts`
- Create: `src/lib/repos/__tests__/reviews-repo.test.ts`

Owns: derive first-name, fetch a restaurant's reviews, shape rows into the `Review` type already defined in `src/lib/types.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repos/__tests__/reviews-repo.test.ts`:

```typescript
import { firstNameFrom, mapRowToReview } from "@/lib/repos/reviews-repo";

describe("firstNameFrom", () => {
  test("returns first whitespace-separated token", () => {
    expect(firstNameFrom("Henrick Tissink")).toBe("Henrick");
    expect(firstNameFrom("Ana   Maria Pop")).toBe("Ana");
  });
  test("trims surrounding whitespace", () => {
    expect(firstNameFrom("  Bogdan  ")).toBe("Bogdan");
  });
  test("falls back when input is blank", () => {
    expect(firstNameFrom("")).toBe("Anonymous");
    expect(firstNameFrom("   ")).toBe("Anonymous");
  });
});

describe("mapRowToReview", () => {
  test("maps a DB row to a Review with deterministic id and ISO date", () => {
    const r = mapRowToReview({
      id: "rev-1",
      rating: 4,
      comment: "Lovely",
      first_name: "Ana",
      created_at: "2026-04-30T10:00:00Z",
      reservations: {
        reservation_date: "2026-04-29",
        party_size: 2,
      },
    });
    expect(r).toEqual({
      id: "rev-1",
      authorName: "Ana",
      rating: 4,
      date: "2026-04-30",
      reservationDate: "2026-04-29",
      guestCount: 2,
      text: "Lovely",
      helpfulCount: 0,
    });
  });
  test("treats null comment as empty text", () => {
    const r = mapRowToReview({
      id: "rev-2",
      rating: 5,
      comment: null,
      first_name: "Bogdan",
      created_at: "2026-04-30T10:00:00Z",
      reservations: { reservation_date: "2026-04-29", party_size: 4 },
    });
    expect(r.text).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/repos/__tests__/reviews-repo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

Create `src/lib/repos/reviews-repo.ts`:

```typescript
import "server-only";
import type { Review } from "@/lib/types";
import { supabaseAnon } from "@/lib/db/anon";

export function firstNameFrom(fullName: string): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Anonymous";
  return trimmed.split(/\s+/)[0];
}

interface RawReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  first_name: string;
  created_at: string;
  reservations:
    | { reservation_date: string; party_size: number }
    | { reservation_date: string; party_size: number }[]
    | null;
}

export function mapRowToReview(row: RawReviewRow): Review {
  const resv = Array.isArray(row.reservations)
    ? row.reservations[0]
    : row.reservations;
  return {
    id: row.id,
    authorName: row.first_name,
    rating: row.rating,
    date: row.created_at.slice(0, 10),
    reservationDate: resv?.reservation_date ?? row.created_at.slice(0, 10),
    guestCount: resv?.party_size ?? 0,
    text: row.comment ?? "",
    helpfulCount: 0,
  };
}

export async function getReviewsForRestaurant(
  restaurantId: string,
  limit = 20,
): Promise<Review[]> {
  const sb = supabaseAnon();
  if (!sb) return [];
  const { data } = await sb
    .from("reviews")
    .select(
      "id, rating, comment, first_name, created_at, reservations(reservation_date, party_size)",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapRowToReview(r as unknown as RawReviewRow));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/repos/__tests__/reviews-repo.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/reviews-repo.ts src/lib/repos/__tests__/reviews-repo.test.ts
git commit -m "feat(reviews): repo + first-name helper"
```

---

## Task 5: Review submit server action

**Files:**
- Create: `src/app/reviews/[token]/actions.ts`
- Create: `src/app/reviews/[token]/__tests__/actions.test.ts`

Auth piggybacks on the reservation `confirmation_token`. Action enforces: rating 1–5; comment ≤ 500 chars; reservation must not be `cancelled`; one review per reservation (DB UNIQUE).

- [ ] **Step 1: Write the failing test**

Create `src/app/reviews/[token]/__tests__/actions.test.ts`:

```typescript
import { submitReviewByToken } from "@/app/reviews/[token]/actions";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
import { createSupabaseAdminClient } from "@/lib/db/admin";

const OLD_ENV = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  };
});
afterEach(() => {
  process.env = OLD_ENV;
});

function buildAdminMock(opts: {
  reservation?: Record<string, unknown> | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const reservation = opts.reservation ?? null;
  const single = jest.fn().mockResolvedValue({
    data: reservation,
    error: reservation ? null : { message: "not found" },
  });
  const reservationsChain = {
    select: jest.fn(() => reservationsChain),
    eq: jest.fn(() => reservationsChain),
    maybeSingle: single,
  };
  const insertSelect = jest.fn().mockResolvedValue({
    data: opts.insertError ? null : [{ id: "rev-1" }],
    error: opts.insertError ?? null,
  });
  const reviewsChain = {
    insert: jest.fn(() => ({ select: insertSelect })),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((tbl: string) =>
      tbl === "reservations" ? reservationsChain : reviewsChain,
    ),
  });
  return { reservationsChain, reviewsChain, insertSelect };
}

describe("submitReviewByToken", () => {
  test("rejects rating outside 1..5", async () => {
    const r = await submitReviewByToken("tok", { rating: 0, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rating/i);
  });

  test("rejects comment longer than 500 chars", async () => {
    const r = await submitReviewByToken("tok", {
      rating: 5,
      comment: "x".repeat(501),
    });
    expect(r.ok).toBe(false);
  });

  test("returns not-found for unknown token", async () => {
    buildAdminMock({ reservation: null });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_FOUND");
  });

  test("rejects when reservation was cancelled", async () => {
    buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "cancelled",
      },
    });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("INELIGIBLE");
  });

  test("inserts a review with first-name only", async () => {
    const { reviewsChain } = buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "confirmed",
      },
    });
    const r = await submitReviewByToken("tok", {
      rating: 4,
      comment: " Lovely ",
    });
    expect(r.ok).toBe(true);
    expect(reviewsChain.insert).toHaveBeenCalledWith({
      reservation_id: "res-1",
      restaurant_id: "rest-1",
      rating: 4,
      comment: "Lovely",
      first_name: "Ana",
    });
  });

  test("returns ALREADY_REVIEWED on UNIQUE violation", async () => {
    buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "confirmed",
      },
      insertError: { code: "23505", message: "duplicate key" },
    });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("ALREADY_REVIEWED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/reviews/[token]/__tests__/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action**

Create `src/app/reviews/[token]/actions.ts`:

```typescript
"use server";

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { firstNameFrom } from "@/lib/repos/reviews-repo";

export interface SubmitReviewInput {
  rating: number;
  comment?: string;
}

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
  errorCode?: "NOT_FOUND" | "INELIGIBLE" | "ALREADY_REVIEWED" | "OTHER";
}

const MAX_COMMENT = 500;

export async function submitReviewByToken(
  token: string,
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Rating must be 1–5.", errorCode: "OTHER" };
  }
  const comment = (input.comment ?? "").trim();
  if (comment.length > MAX_COMMENT) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT} characters or fewer.`,
      errorCode: "OTHER",
    };
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, error: "Platform not configured." };
  }

  const admin = createSupabaseAdminClient();

  const { data: resv } = await admin
    .from("reservations")
    .select("id, restaurant_id, guest_name, status")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!resv) {
    return { ok: false, error: "Reservation not found.", errorCode: "NOT_FOUND" };
  }
  if (resv.status === "cancelled" || resv.status === "no_show") {
    return {
      ok: false,
      error: "This reservation isn't eligible for a review.",
      errorCode: "INELIGIBLE",
    };
  }

  const { error } = await admin
    .from("reviews")
    .insert({
      reservation_id: resv.id,
      restaurant_id: resv.restaurant_id,
      rating: input.rating,
      comment: comment || null,
      first_name: firstNameFrom(resv.guest_name),
    })
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "You've already left a review for this reservation.",
        errorCode: "ALREADY_REVIEWED",
      };
    }
    return { ok: false, error: error.message ?? "Could not save review.", errorCode: "OTHER" };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/reviews/[token]/__tests__/actions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/reviews/[token]/actions.ts src/app/reviews/[token]/__tests__/actions.test.ts
git commit -m "feat(reviews): submit-review server action with token auth"
```

---

## Task 6: Review submit form (client)

**Files:**
- Create: `src/components/review-submit-form.tsx`
- Create: `src/components/__tests__/review-submit-form.test.tsx`

Star input that pre-fills from URL; optional textarea; submit calls the server action.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/review-submit-form.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewSubmitForm } from "@/components/review-submit-form";

const submit = jest.fn();
jest.mock("@/app/reviews/[token]/actions", () => ({
  submitReviewByToken: (...args: unknown[]) => submit(...args),
}));

describe("ReviewSubmitForm", () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ ok: true });
  });

  test("pre-selects rating from initialRating prop", () => {
    render(<ReviewSubmitForm token="tok" initialRating={4} />);
    const stars = screen.getAllByRole("radio");
    expect(stars[3]).toBeChecked();
  });

  test("submitting sends current rating + comment to action", async () => {
    render(<ReviewSubmitForm token="tok" initialRating={3} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Great food" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith("tok", {
      rating: 3,
      comment: "Great food",
    });
  });

  test("renders success state after ok response", async () => {
    render(<ReviewSubmitForm token="tok" initialRating={5} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText(/thanks/i);
  });

  test("renders inline error from action", async () => {
    submit.mockResolvedValueOnce({ ok: false, error: "Already reviewed." });
    render(<ReviewSubmitForm token="tok" initialRating={5} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText(/already reviewed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/review-submit-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the form**

Create `src/components/review-submit-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { submitReviewByToken } from "@/app/reviews/[token]/actions";

interface Props {
  token: string;
  initialRating: number; // 1..5; 0 means none preselected
}

const MAX_COMMENT = 500;

export function ReviewSubmitForm({ token, initialRating }: Props) {
  const [rating, setRating] = useState<number>(
    initialRating >= 1 && initialRating <= 5 ? initialRating : 0,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Pick a star first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await submitReviewByToken(token, { rating, comment });
    setSubmitting(false);
    if (r.ok) {
      setDone(true);
    } else {
      setError(r.error ?? "Could not save review.");
    }
  }

  if (done) {
    return (
      <div className="rounded-card bg-brand-primary-soft p-6 text-center">
        <p className="font-display text-xl font-bold text-brand-primary-dark">
          Thanks — your review is in.
        </p>
        <p className="text-sm text-text-secondary mt-2">
          Verified diners help everyone choose better.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-text-primary mb-2">
          Your rating
        </legend>
        <div className="flex items-center gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span
                className={`text-3xl ${
                  n <= rating ? "text-brand-primary" : "text-gray-300"
                }`}
              >
                ★
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold text-text-primary">
          Comment <span className="text-text-muted font-normal">(optional)</span>
        </span>
        <textarea
          value={comment}
          maxLength={MAX_COMMENT}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="mt-2 block w-full rounded-lg border border-border p-3 text-sm"
          placeholder="What stood out?"
        />
        <span className="text-xs text-text-muted">
          {comment.length}/{MAX_COMMENT}
        </span>
      </label>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/review-submit-form.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/review-submit-form.tsx src/components/__tests__/review-submit-form.test.tsx
git commit -m "feat(reviews): submit form (client) with star input and inline errors"
```

---

## Task 7: Review submit page (server)

**Files:**
- Create: `src/app/reviews/[token]/page.tsx`

Mirrors the structure of `src/app/reservations/[token]/page.tsx`. Loads the reservation by token, branches on status, renders the form (or a blank state).

- [ ] **Step 1: Implement the page**

Create `src/app/reviews/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { ReviewSubmitForm } from "@/components/review-submit-form";

export const dynamic = "force-dynamic";

type Loaded =
  | {
      kind: "ready";
      restaurantName: string;
      guestName: string;
      reservationDate: string;
    }
  | { kind: "already_reviewed" }
  | { kind: "ineligible" }
  | { kind: "not_found" }
  | { kind: "config_missing" };

async function loadContext(token: string): Promise<Loaded> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { kind: "config_missing" };
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("reservations")
    .select(
      "id, status, guest_name, reservation_date, restaurants(name), reviews(id)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!data) return { kind: "not_found" };
  if (data.status === "cancelled" || data.status === "no_show")
    return { kind: "ineligible" };

  const review = Array.isArray(data.reviews) ? data.reviews[0] : data.reviews;
  if (review?.id) return { kind: "already_reviewed" };

  const restaurantField = data.restaurants as
    | { name: string }
    | { name: string }[]
    | null;
  const restaurantName = Array.isArray(restaurantField)
    ? restaurantField[0]?.name ?? "the restaurant"
    : restaurantField?.name ?? "the restaurant";

  return {
    kind: "ready",
    restaurantName,
    guestName: data.guest_name,
    reservationDate: data.reservation_date,
  };
}

function parseRating(v: string | string[] | undefined): number {
  if (typeof v !== "string") return 0;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

export default async function ReviewSubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadContext(token);
  const initialRating = parseRating(sp.rating);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 shadow-card">
        <Link
          href="/"
          className="font-display text-2xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          Review
        </p>

        {ctx.kind === "ready" && (
          <>
            <h1 className="font-display text-[28px] font-bold text-text-primary leading-tight mt-6">
              How was {ctx.restaurantName}?
            </h1>
            <p className="text-sm text-text-secondary mt-2">
              Visited on{" "}
              {new Date(`${ctx.reservationDate}T12:00:00`).toLocaleDateString(
                "en-GB",
                { weekday: "long", day: "numeric", month: "long" },
              )}
              . Your review is anonymous — only your first name is shown.
            </p>
            <div className="mt-6">
              <ReviewSubmitForm token={token} initialRating={initialRating} />
            </div>
          </>
        )}
        {ctx.kind === "already_reviewed" && (
          <Blank
            title="Already reviewed"
            body="You've already left a review for this reservation. Thanks again!"
          />
        )}
        {ctx.kind === "ineligible" && (
          <Blank
            title="Can't review this one"
            body="This reservation was cancelled or marked as no-show, so it isn't eligible for a review."
          />
        )}
        {ctx.kind === "not_found" && (
          <Blank
            title="Link not recognised"
            body="This review link wasn't recognised. It may have been mistyped — try copying it from your email again."
          />
        )}
        {ctx.kind === "config_missing" && (
          <Blank
            title="Platform not configured"
            body="Tavli is still setting up. Please try again later or contact support."
          />
        )}
      </div>
    </div>
  );
}

function Blank({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="font-display text-[26px] font-bold text-text-primary leading-tight mt-6">
        {title}
      </h1>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{body}</p>
      <p className="text-xs text-text-muted mt-6">
        Contact:{" "}
        <a href="mailto:hello@tavli.ro" className="text-brand-primary">
          hello@tavli.ro
        </a>
      </p>
    </>
  );
}
```

- [ ] **Step 2: Smoke-test the page**

Run: `npm run dev` (in another terminal). With local Supabase + a real reservation row in your dev DB:

1. Visit `http://localhost:3000/reviews/<confirmation_token>?rating=4` — verify the form shows with 4 stars pre-selected.
2. Visit with a fake token — verify "Link not recognised" state.
3. Submit a review — verify the success state and that `restaurants.rating`/`vote_count` update (Supabase Studio).
4. Re-submit with the same token — verify the page now shows "Already reviewed".

- [ ] **Step 3: Commit**

```bash
git add src/app/reviews/[token]/page.tsx
git commit -m "feat(reviews): /reviews/[token] submit page"
```

---

## Task 8: Wire reviews into restaurant detail repo

**Files:**
- Modify: `src/lib/repos/restaurants-repo.ts`

Today, `dbGetRestaurantDetail` returns `reviews: []` and `reviewIntelligence: null`. Replace with real data from `reviews-repo` and run the existing `processReviews` over comments to derive `reviewIntelligence`.

- [ ] **Step 1: Read the current shape**

Already read in Task setup — `dbGetRestaurantDetail` is at `src/lib/repos/restaurants-repo.ts:137-183`. The two stubbed lines are:

```typescript
const emptyIntelligence: ReviewIntelligence | null = null;
const reviews: Review[] = [];
```

- [ ] **Step 2: Replace stubs with real data**

In `src/lib/repos/restaurants-repo.ts`, add an import near the top of the file (next to the other repo imports — there are none today, so add a fresh line below the `computeSlots` import):

```typescript
import { getReviewsForRestaurant } from "@/lib/repos/reviews-repo";
import { processReviews } from "@/lib/review-processor";
```

Inside `dbGetRestaurantDetail`, replace this block:

```typescript
  const emptyIntelligence: ReviewIntelligence | null = null;
  const reviews: Review[] = [];
```

with:

```typescript
  const reviews = await getReviewsForRestaurant(data.id as string, 20);
  const reviewIntelligence = processReviews(reviews);
```

…and update the return literal so it uses `reviewIntelligence` (rename from the now-removed `emptyIntelligence`):

```typescript
    reviewIntelligence,
    reviews,
```

- [ ] **Step 3: Verify by running the existing repo tests**

Run: `npm test -- repos`
Expected: existing tests still pass; no new failures introduced.

- [ ] **Step 4: Smoke-test the detail page**

With `NEXT_PUBLIC_USE_DB=true` and a few reviews seeded in your local DB:

1. `npm run dev` then visit a restaurant detail URL.
2. Confirm review cards render under the "Reviews" section.
3. Confirm the `ReviewIntelligenceSection` renders only when `processReviews` returns non-null (≥5 reviews).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/restaurants-repo.ts
git commit -m "feat(reviews): populate detail page reviews + intelligence from DB"
```

---

## Task 9: Gate the rating chip behind ≥3 reviews

**Files:**
- Modify: `src/app/[city]/[slug]/DetailPageClient.tsx`
- Modify: any restaurant card component that renders `restaurant.rating` next to a star (search reveals the canonical one, e.g. `src/components/restaurant-card.tsx` — confirm exact path before editing)

The cold-start UX rule from the design discussion: **don't show a star rating below 3 reviews**, because "1 review · 5★" is worse than no rating. Below the threshold, fall back to a neutral label (cuisine + price) the card already renders.

- [ ] **Step 1: Locate every place that renders `restaurant.rating`**

Run: `grep -rn "\.rating" src/components src/app/\[city\] | grep -v node_modules | grep -v __tests__`

Expected: a small handful of card and list components. For each, plan to wrap the visible rating in a `voteCount >= 3` guard.

- [ ] **Step 2: Write a failing test for the detail page**

In `src/app/[city]/[slug]/__tests__/` (create dir if missing — note that DetailPageClient is currently a client component; check if it has tests already with `find src/app/\[city\] -name "*.test.tsx"`). If a test file for DetailPageClient does not exist, add `src/components/__tests__/detail-rating-gating.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { RatingChip } from "@/components/rating-chip";

describe("RatingChip", () => {
  test("shows rating + count when voteCount >= 3", () => {
    render(<RatingChip rating={4.6} voteCount={42} />);
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
  test("renders nothing when voteCount < 3", () => {
    const { container } = render(<RatingChip rating={5} voteCount={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest detail-rating-gating`
Expected: FAIL — `Cannot find module '@/components/rating-chip'`.

- [ ] **Step 4: Extract the rating chip**

Create `src/components/rating-chip.tsx`:

```tsx
const MIN_VOTES_TO_SHOW = 3;

interface Props {
  rating: number | null | undefined;
  voteCount: number;
  className?: string;
}

export function RatingChip({ rating, voteCount, className }: Props) {
  if (!rating || voteCount < MIN_VOTES_TO_SHOW) return null;
  return (
    <span className={className ?? "inline-flex items-center gap-1 text-sm"}>
      <span aria-hidden className="text-brand-primary">★</span>
      <span className="font-semibold">{rating.toFixed(1)}</span>
      <span className="text-text-muted">({voteCount})</span>
    </span>
  );
}
```

- [ ] **Step 5: Replace inline rating renders with `RatingChip`**

For each location flagged in Step 1, swap the inline `★ {rating}` markup for `<RatingChip rating={r.rating} voteCount={r.voteCount} />`. Two concrete sites to start with:

- `src/app/[city]/[slug]/DetailPageClient.tsx` — wherever the hero rating chip is shown (search for `★` or `rating?.toFixed`).
- The card component(s) discovered in Step 1.

If a card has no separate `voteCount` prop today, wire it through (`Restaurant` already has `voteCount: number` per `src/lib/types.ts:11`).

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS — including the new `detail-rating-gating` cases.

- [ ] **Step 7: Commit**

```bash
git add src/components/rating-chip.tsx src/components/__tests__/detail-rating-gating.test.tsx \
  src/app/[city]/[slug]/DetailPageClient.tsx \
  src/components/<each-card-component-touched>.tsx
git commit -m "feat(reviews): gate visible rating chip behind 3+ reviews"
```

---

## Task 10: Onboarding disclosure — review policy

**Files:**
- Modify: the onboarding wizard's review/publish step page (run `find src/app/onboard -name "page.tsx"` to locate; canonical name is the final wizard step, e.g. `src/app/onboard/[token]/review/page.tsx`)

Restaurants need to see the no-deletion policy *before* they publish. One paragraph in the final step.

- [ ] **Step 1: Locate the final onboarding step**

Run: `find src/app/onboard -name "page.tsx"` and identify which one is the publish/review step. Look for the page that says "Publish" or "Review your restaurant" and contains the final submit.

- [ ] **Step 2: Add the disclosure block**

In that page (server component), add — just above the publish button:

```tsx
<aside className="rounded-card border border-border bg-surface-bg p-4 mt-6 text-sm text-text-secondary">
  <p className="font-semibold text-text-primary mb-1">
    About reviews on Tavli
  </p>
  <p>
    After diners eat at your restaurant we ask them for a one-tap rating.
    Reviews are tied to a real reservation on Tavli — verified, not anonymous
    strangers. We don&apos;t remove or edit reviews. You&apos;ll be able to
    publicly respond to each review (coming soon).
  </p>
</aside>
```

- [ ] **Step 3: Add a render test**

Create or extend `src/app/onboard/[token]/<step>/__tests__/page.test.tsx`:

```tsx
import { render } from "@testing-library/react";
// ...import the page or its inner component
test("publish step discloses review policy", async () => {
  // Render the relevant subtree (not the whole page if it requires async data —
  // extract the disclosure into a small component if needed).
  // Verify "We don't remove or edit reviews" is in the document.
});
```

If extracting the disclosure makes testing easier, pull it into a small component `src/components/onboarding/review-policy-disclosure.tsx` and import it in both the page and the test.

- [ ] **Step 4: Run tests + commit**

Run: `npm test -- onboard`
Expected: PASS.

```bash
git add src/app/onboard/<path>/page.tsx \
  src/components/onboarding/review-policy-disclosure.tsx \
  src/components/onboarding/__tests__/review-policy-disclosure.test.tsx
git commit -m "feat(onboarding): disclose review policy at publish step"
```

---

## Task 11: Cron deployment note

**Files:**
- Modify: `docs/superpowers/plans/2026-05-02-verified-reservation-reviews.md` (this plan — append a "Deployment" section pointing the human operator at Coolify)

Production cron is wired manually in Coolify — the plan can't do this for you. Document it so the launch checklist captures it.

- [ ] **Step 1: Append a deployment note**

Append the following to the bottom of this plan file:

```markdown
---

## Deployment notes (run by Henrick after merge)

1. Set `CRON_SECRET` in the Coolify environment for `tavli` (use `openssl rand -hex 32`).
2. In Coolify → Application → "Scheduled Tasks", add a new task:
   - Name: `post-visit-reviews`
   - Schedule: `0 * * * *` (top of every hour)
   - Command: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://tavli.ro/api/cron/post-visit-emails`
3. Verify the first run in the application logs (`considered: N, sent: M`).
4. Apply the migration: `npm run db:migrate` — or, if already pushed via Coolify deploy, confirm migration `0006` ran in Supabase.
5. Smoke-test end-to-end: place a reservation in the past with `guest_email` set, manually `UPDATE reservations SET reservation_date = CURRENT_DATE - 1, reservation_time = '12:00' WHERE id = '<id>';`, trigger the cron once, verify the email lands.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-02-verified-reservation-reviews.md
git commit -m "docs(reviews): deployment note for Coolify cron"
```

---

## Self-Review (final)

**Spec coverage:**
- ✅ DB table + UNIQUE on reservation_id (Task 1)
- ✅ Aggregate trigger keeps `restaurants.rating`/`vote_count` current (Task 1)
- ✅ Post-visit email + one-click 5-star links (Task 2)
- ✅ Hourly cron, 4h delay, 14d cutoff, idempotent via `post_visit_email_sent_at` (Task 3)
- ✅ Repo + first-name derivation (Task 4)
- ✅ Submit action — rating clamp, 500-char comment cap, NOT_FOUND/INELIGIBLE/ALREADY_REVIEWED branches (Task 5)
- ✅ Submit form (client) with star input + textarea (Task 6)
- ✅ Submit page with all branches (Task 7)
- ✅ Detail page consumes real reviews + intelligence (Task 8)
- ✅ Rating chip gated behind 3+ reviews (Task 9)
- ✅ Owner-side disclosure of no-deletion policy (Task 10)
- ✅ Coolify deployment note (Task 11)

**Out-of-scope reminder (do not do in this plan):** photos on reviews, multi-axis ratings, restaurant responses, admin moderation, partner inbox, helpful votes, review status column, Google reviews aggregation. All Phase 2.

**Type consistency:** `Review.helpfulCount` is hardcoded to `0` in the mapper (Task 4) because the Phase 1 schema has no helpful-count column — type is satisfied; UI button just doesn't persist. `submit` argument shape `{ rating, comment }` is consistent across Tasks 5/6.

**Open verification gaps (acceptable):**
- The 0006 trigger is verified by hand in Supabase Studio (Task 1, Step 3) rather than by automated test, because the codebase has no DB-integration test harness today. Adding one is a separate infra project.
- Time-zone handling for the 4h post-visit cutoff is approximate (+02:00 hardcode); ~1h DST drift is acceptable since the threshold is already coarse.

---

## Deployment notes (run by Henrick after merge)

1. **Set `CRON_SECRET`** in the Coolify environment for `tavli`. Generate with `openssl rand -hex 32`.
2. **Confirm `RESEND_API_KEY` is set** in Coolify before flipping the cron on. Without it, `sendEmail` runs in dev-mode (console.log only) and the cron will mark reservations as `post_visit_email_sent_at = NOW()` without actually delivering anything — silent loss.
3. **Add the scheduled task in Coolify**:
   - Coolify → Application → "Scheduled Tasks" → New
   - Name: `post-visit-reviews`
   - Schedule: `0 * * * *` (top of every hour)
   - Command: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://tavli.ro/api/cron/post-visit-emails`
4. **Verify the first run** in the application logs — expect a JSON line like `{"ok":true,"considered":N,"sent":M}`. Send failures appear as `[post-visit-cron] send failed { id, error }` console errors.
5. **Apply migration `0006_reviews`** to the production DB. Per project convention, this is `psql -f drizzle/migrations/0006_reviews.sql` against the Supabase production connection string, then reconcile `__drizzle_migrations` and `_journal.json` (the snapshot is already committed). Mirror the bookkeeping pattern from `0005_cuisines_array`.
6. **Smoke-test end-to-end** before announcing to the trial cohort:
   - Manually `UPDATE reservations SET reservation_date = CURRENT_DATE - 1, reservation_time = '12:00', post_visit_email_sent_at = NULL WHERE id = '<a real reservation with guest_email>';`
   - Trigger the cron once: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://tavli.ro/api/cron/post-visit-emails`
   - Confirm the email lands in the test inbox.
   - Click a star rating → confirm the page loads and pre-selects the rating.
   - Submit → confirm the success state and that `restaurants.rating` / `vote_count` updated for that restaurant.

**Onboarding policy reminder (Task 10):** before launch, make sure the trial-cohort restaurants are walked through the no-deletion policy verbally as well — the in-page disclosure on the publish step is the legal anchor, but a human conversation removes surprise when the first 1★ review arrives. The wedge of this product is that reviews are durable; that only works if owners knew that going in.
