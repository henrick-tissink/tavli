/**
 * @jest-environment node
 */
// Mock @react-email/render to avoid the library's dynamic import("react-dom/server")
// which Jest (no --experimental-vm-modules) cannot handle. Render via
// renderToStaticMarkup instead — same markup, no dynamic import.
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return {
    render: async (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node),
  };
});

import { render } from "@react-email/render";
import { TrialEndingEmail, getSubject as trialSubject } from "../TrialEndingEmail";
import {
  RecurringChargeConsentEmail,
  getSubject as consentSubject,
} from "../RecurringChargeConsentEmail";

const LOCALES = ["ro", "en", "de"] as const;
const TRIAL_END = new Date("2026-08-22T00:00:00Z");

describe("TrialEndingEmail", () => {
  for (const locale of LOCALES) {
    for (const day of [60, 75, 85] as const) {
      it(`renders day ${day} in ${locale} without throwing`, async () => {
        const html = await render(
          TrialEndingEmail({ day, trialEndsAt: TRIAL_END, chargeAmount: "€60", locale }),
        );
        expect(html).toContain("Tavli");
        expect(html.length).toBeGreaterThan(100);
      });
    }
  }

  it("day-85 copy references the upcoming charge", async () => {
    const html = await render(
      TrialEndingEmail({ day: 85, trialEndsAt: TRIAL_END, chargeAmount: "€60", locale: "en" }),
    );
    expect(html).toContain("€60");
  });

  it("getSubject returns a non-empty subject per locale", () => {
    for (const locale of LOCALES) {
      expect(trialSubject(locale, { day: 60 }).length).toBeGreaterThan(0);
    }
  });
});

describe("RecurringChargeConsentEmail", () => {
  for (const locale of LOCALES) {
    it(`renders in ${locale} without throwing`, async () => {
      const html = await render(RecurringChargeConsentEmail({ locale, chargeDescription: "Tavli Pro" }));
      expect(html).toContain("Tavli");
    });
  }

  it("English subject is the PSD2 consent confirmation line", () => {
    expect(consentSubject("en")).toMatch(/recurring charge/i);
  });
});
