/**
 * @jest-environment node
 */
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return {
    render: async (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node),
  };
});

import { render } from "@react-email/render";
import { PartnerWelcomeEmail, getSubject } from "../PartnerWelcomeEmail";

const LOCALES = ["ro", "en", "de"] as const;

describe("PartnerWelcomeEmail", () => {
  for (const locale of LOCALES) {
    it(`renders in ${locale} with the onboarding link + names`, async () => {
      const html = await render(
        PartnerWelcomeEmail({
          fullName: "Ana",
          restaurantName: "Tom Yum",
          onboardingUrl: "https://tavli.ro/partner/onboarding",
          locale,
        }),
      );
      expect(html).toContain("Tavli");
      expect(html).toContain("https://tavli.ro/partner/onboarding");
      expect(html).toContain("Ana");
      expect(html).toContain("Tom Yum");
    });
  }

  it("getSubject is non-empty per locale", () => {
    for (const locale of LOCALES) expect(getSubject(locale).length).toBeGreaterThan(0);
  });
});
