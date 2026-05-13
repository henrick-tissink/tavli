/**
 * Playwright E2E — event-request happy path
 *
 * SKELETON STATUS — this spec is committed as a scaffold and does NOT
 * run as part of any CI today. Playwright is not yet a project
 * dependency (the `e2e/` directory is excluded from tsconfig.json on
 * purpose). To exercise it locally:
 *
 *   1. Install Playwright:
 *
 *        npm install -D @playwright/test
 *        npx playwright install
 *
 *   2. Add a top-level `playwright.config.ts` that points `testDir` at
 *      `e2e/` and sets `use.baseURL` to the dev server (`http://localhost:3000`
 *      against a local Supabase, or `https://tavli.ro` against prod).
 *
 *   3. Stand up the supporting stack:
 *
 *        - Local Next.js dev server (`npm run dev`) wired to a local
 *          Supabase project with the 0008 migration applied.
 *        - A mail catcher reachable from the test runner. Mailpit
 *          (http://localhost:8025) is the project convention. Supabase
 *          local stack ships with InBucket on port 54324; either works
 *          as long as `fetchOtpForEmail` below is implemented to match.
 *
 *   4. Export the env vars consumed below:
 *
 *        E2E_VENUE_URL      = /<city-slug>/<venue-slug> of a test venue
 *                             with events_intake_enabled = true
 *        E2E_PARTNER_EMAIL  = login email for the standing partner
 *                             account (see memory test_partner_account.md
 *                             for tavli.ro; mint a fresh one locally)
 *        E2E_CONSUMER_EMAIL = a fresh address routed to the mail catcher,
 *                             unique per run if possible
 *
 *   5. Implement the two project-specific helpers marked `TODO` below:
 *
 *        signInAsPartner(page, email)  — drives the /partner/sign-in OTP
 *                                        flow using the mail catcher
 *        fetchOtpForEmail(email)       — pulls the latest OTP/magic-link
 *                                        from the mail catcher API and
 *                                        returns either the 6-digit code
 *                                        or the full verify URL
 *
 *      Both should live in `e2e/helpers/` to be reused by future specs.
 *
 *   6. Run:
 *
 *        npx playwright test e2e/event-requests.spec.ts
 *
 * Until the items above are in place, the body is parked behind
 * `test.skip` so it does not pollute test reports if anyone wires up
 * Playwright before the helpers are ready.
 */

import { test, expect } from "@playwright/test";

const VENUE_URL = process.env.E2E_VENUE_URL ?? "/bucuresti/test-venue";
const PARTNER_EMAIL = process.env.E2E_PARTNER_EMAIL ?? "";
const CONSUMER_EMAIL = process.env.E2E_CONSUMER_EMAIL ?? "";

test.skip("event request happy path", async ({ page }) => {
  // Reference env vars to keep the linter quiet while the body is parked.
  void PARTNER_EMAIL;
  void CONSUMER_EMAIL;

  // 1. Consumer submits the request via the venue sheet.
  await page.goto(VENUE_URL);
  await page.getByRole("button", { name: /organizează un eveniment/i }).click();
  await page.getByRole("button", { name: /aniversare/i }).click();
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/dată/i).fill("2026-12-15");
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/persoane/i).fill("25");
  await page.getByRole("button", { name: /continuă/i }).click();
  await page.getByLabel(/nume/i).fill("E2E Tester");
  await page.getByLabel(/email/i).fill(CONSUMER_EMAIL);
  await page.getByRole("button", { name: /trimite cererea/i }).click();
  await expect(page.getByText(/verifică emailul/i)).toBeVisible();

  // 2. Resolve OTP via the mail catcher.
  // TODO: const otpUrl = await fetchOtpForEmail(CONSUMER_EMAIL);
  // TODO: await page.goto(otpUrl);

  // 3. Partner side: sign in as the standing test partner, open the
  //    Corporate inbox, send a quote.
  // TODO: await signInAsPartner(page, PARTNER_EMAIL);
  // TODO: await page.goto("/partner/corporate/events");
  // TODO: click into the new request, draft a quote, submit.

  // 4. Consumer accepts the quote via the tracking-token page.
  // TODO: read trackingToken (either from the inbox email or the URL
  //       captured after step 2) and drive the consumer accept flow.

  // 5. Partner materializes the reservation.
  // TODO: from the partner detail view, click "Materializează rezervarea"
  //       and verify it lands on /partner/reservations.

  // 6. Assert the reservations row exists with booking_type=private_event.
  //    Either by reading the partner reservations list UI or by hitting
  //    a test-only API endpoint that returns the latest reservation for
  //    the venue.
});
