/**
 * Playwright E2E — consumer sheet v2 walkthrough.
 *
 * Walks the 4-step EventRequestSheetV2 against a seeded venue.
 *
 * The long-standing "Maximum call stack size exceeded" unhandledRejection that
 * used to block every DB-mode dev route is FIXED (it was the N+1 fan-out in
 * restaurants-repo overflowing React's dev-only recursive `visitAsyncNode`
 * async-debug walker). Verified: the seeded venue page now renders in ~250ms
 * with zero unhandledRejections, and the heading assertion below passes.
 *
 * Still `.skip`ped for a DIFFERENT, unrelated reason: this spec is an
 * unfinished scaffold that was never green. The venue detail page renders no
 * "Organizează un eveniment privat" CTA for a bare seeded venue, so step 1
 * times out. Un-skipping needs the fixture to seed whatever gates that CTA
 * (a `restaurant_event_settings` row and/or the private-spaces/occasions data)
 * and the step 2-4 selectors re-checked against current copy — product work,
 * not an infrastructure blocker.
 */

import { test, expect } from "@playwright/test";
import {
  seedEventVenue,
  cleanupVenue,
  disposeFixturesDb,
  type EventVenue,
} from "./helpers/fixtures";

let venue: EventVenue;
test.beforeAll(async () => {
  venue = await seedEventVenue("v2");
});
test.afterAll(async () => {
  await cleanupVenue(venue.id);
  await disposeFixturesDb();
});

test.skip("v2 sheet walks the 4 steps and submits", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/${venue.citySlug}/${venue.slug}`);
  // The venue name appears in both the hero h1 and the sticky desktop h2.
  await expect(
    page.getByRole("heading", { name: /E2E Test Venue/i }).first(),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /Organizează un eveniment privat/i }).click();
  await expect(page.getByText(/Pas 1 din 4/i)).toBeVisible();

  await page.getByText("Aniversare").click();
  await page.getByRole("button", { name: /Continuă/i }).click();
  await expect(page.getByText(/Pas 2 din 4/i)).toBeVisible();

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
