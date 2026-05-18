/**
 * Playwright E2E — consumer sheet v2 walkthrough.
 *
 * Status: scaffold. Skipped pending resolution of the pre-existing
 * unhandledRejection ("Maximum call stack size exceeded") that fires
 * whenever `next dev` boots with NEXT_PUBLIC_USE_DB=true (unrelated to
 * corporate-bookings; surfaces on any DB-mode route).
 *
 * Once that blocker clears, remove the .skip and the test should walk
 * the 4-step EventRequestSheetV2 against a seeded venue.
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
  await expect(page.getByRole("heading", { name: /E2E Test Venue/i })).toBeVisible({ timeout: 60_000 });

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
