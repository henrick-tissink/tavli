/**
 * Playwright A11y sweep for Phase 1.5 components.
 *
 * Status: skeleton. Skipped pending the USE_DB=true dev-server blocker
 * (same gate as consumer-sheet.spec.ts). When unblocked, this asserts
 * zero axe violations on the venue detail page (which renders the v2
 * CTA) and on the events landing page.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip("event-request CTA + sheet pass axe rules", async ({ page }) => {
  await page.goto("/bucuresti/atelier-floreasca");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test.skip("events landing page passes axe rules", async ({ page }) => {
  await page.goto("/bucuresti/events");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
