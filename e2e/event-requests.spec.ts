/**
 * Playwright E2E — event-request flow.
 *
 * "consumer submits" validates the EventRequestSheet form + OTP delivery to
 * Mailpit. The dev-mode stack-overflow under USE_DB=true that used to block
 * every DB-backed route is FIXED (N+1 fan-out in restaurants-repo overflowing
 * React's dev-only recursive `visitAsyncNode` async-debug walker). The dev
 * server now boots and serves seeded venue pages cleanly under USE_DB=true.
 *
 * It stays `.skip`ped for a DIFFERENT, unrelated reason: the spec is a stale
 * scaffold that was never green. Two known gaps, both reproduced locally:
 *   1. `getByRole("heading", { name: /E2E Test Venue/i })` is a strict-mode
 *      violation — the name renders in both the hero h1 and the sticky h2;
 *      needs `.first()`.
 *   2. A bare seeded venue renders no "organizează un eveniment" CTA, so the
 *      form is unreachable. The fixture must also seed whatever gates it.
 *
 * Still to build: the full happy path (partner sign-in helper, quote flow,
 * consumer accept, partner materialize, DB assertion on reservations).
 *
 * Prerequisites:
 *   - `npx supabase start` (Mailpit on 54324, Postgres on 54322)
 *   - 0008_corporate_foundations migration applied
 *
 * Run: `npx playwright test e2e/event-requests.spec.ts`
 */

import { test, expect } from "@playwright/test";
import {
  clearMailpit,
  waitForLatestEmail,
} from "./helpers/mailpit";
import {
  cleanupVenue,
  disposeFixturesDb,
  seedEventVenue,
  type EventVenue,
} from "./helpers/fixtures";

let venue: EventVenue;

test.beforeAll(async () => {
  venue = await seedEventVenue("happy");
});

test.afterAll(async () => {
  await cleanupVenue(venue.id);
  await disposeFixturesDb();
});

test.beforeEach(async () => {
  await clearMailpit();
});

test.skip("consumer submits an event request and OTP lands in Mailpit", async ({ page }) => {
  test.setTimeout(120_000);
  const consumerEmail = `e2e-${Date.now()}@example.local`;

  await page.goto(`/${venue.citySlug}/${venue.slug}`);
  // Wait for the venue page to render before driving the form — first dev
  // server compile can take 20s+.
  await expect(page.getByRole("heading", { name: /E2E Test Venue/i })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: /organizează un eveniment/i }).click();

  // Step 1 — Occasion.
  await page.getByRole("button", { name: /aniversare/i }).click();
  await page.getByRole("button", { name: /continuă/i }).click();

  // Step 2 — Date.
  const futureDate = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.locator("input[type='date']").fill(futureDate);
  await page.getByRole("button", { name: /continuă/i }).click();

  // Step 3 — Details (party size already defaults; just continue).
  await page.getByRole("button", { name: /continuă/i }).click();

  // Step 4 — Identity.
  await page.getByLabel(/nume/i).fill("E2E Tester");
  await page.getByLabel(/email/i).fill(consumerEmail);
  await page.getByRole("button", { name: /trimite cererea/i }).click();

  await expect(page.getByText(/verifică emailul/i)).toBeVisible({
    timeout: 10_000,
  });

  const msg = await waitForLatestEmail(consumerEmail);
  expect(msg.Subject.toLowerCase()).toMatch(/sign in|otp|confirm|verifică|magic/);
});

/**
 * Full happy path — un-skip when ready to drive partner-side automation.
 *
 * TODO before un-skipping:
 *   1. Implement `signInAsPartner(page, email)` helper that drives
 *      /partner/sign-in via OTP through Mailpit. Needs a seeded partner
 *      profile whose user owns `venue.id`.
 *   2. After OTP click, navigate to /partner/corporate/events, open the
 *      new request, send a quote.
 *   3. Read the tracking-token URL from the partner-new email captured
 *      in Mailpit, navigate as consumer, accept the quote.
 *   4. Click "Materializează" on partner side, assert in DB that a row
 *      in reservations has booking_type='private_event' + event_request_id
 *      matching the seeded request.
 */
test.skip("full happy path — consumer → OTP → partner quote → consumer accept → materialize", async () => {
  // see TODO above
});
