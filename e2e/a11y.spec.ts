/**
 * Playwright + axe-core a11y sweep (Wave-9 D3).
 *
 * Runs axe against the launch-critical public surfaces with the WCAG 2.x AA
 * rule tags. Requires the dev server (the Playwright webServer boots `next dev`)
 * and a seeded local DB for the venue page. Run:
 *
 *   npx playwright test e2e/a11y.spec.ts
 *
 * Each test fails on any WCAG 2.0/2.1/2.2 A/AA violation and prints a compact
 * summary (rule id + node count + first target) so regressions are actionable.
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function auditWcagAA(page: Page, disableRules: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_AA_TAGS);
  if (disableRules.length > 0) builder = builder.disableRules(disableRules);
  const results = await builder.analyze();
  if (results.violations.length > 0) {
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      help: v.help,
      example: v.nodes[0]?.target?.join(" "),
      // contrast nodes carry fg/bg/ratio here — handy when triaging failures.
      data: v.nodes[0]?.any?.[0]?.data,
    }));
    console.log(`\naxe violations (${results.violations.length}):\n` + JSON.stringify(summary, null, 2));
  }
  return results.violations;
}

test("home page passes WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await auditWcagAA(page)).toEqual([]);
});

test("RO pricing page passes WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");
  expect(await auditWcagAA(page)).toEqual([]);
});

test("EN pricing page passes WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/en/pricing");
  await page.waitForLoadState("networkidle");
  expect(await auditWcagAA(page)).toEqual([]);
});

test("DE pricing page passes WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/de/pricing");
  await page.waitForLoadState("networkidle");
  expect(await auditWcagAA(page)).toEqual([]);
});
