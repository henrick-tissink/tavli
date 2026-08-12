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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { ConsumerVerifyEmail, getSubject } from "../ConsumerVerifyEmail";

const LOCALES = ["ro", "en", "de"] as const;
const URL = "https://xyz.supabase.co/auth/v1/verify?token=pkce_abc&type=signup";

describe("ConsumerVerifyEmail", () => {
  for (const locale of LOCALES) {
    it(`renders in ${locale} with the confirmation link`, async () => {
      const html = await render(ConsumerVerifyEmail({ verifyUrl: URL, locale }));
      expect(html).toContain("Tavli");
      // Button href plus the copyable fallback link.
      expect(html).toContain(URL.replace(/&/g, "&amp;"));
      expect(html).not.toContain("undefined");
    });
  }

  it("uses brand-primary for the CTA, not the logo orange", () => {
    // #F97316 is ~2.8:1 under white text and fails WCAG AA; #C2410C is ~5.2:1.
    // The wordmark is the one legitimate use of the brighter orange.
    const src = readFileSync(
      join(__dirname, "..", "ConsumerVerifyEmail.tsx"),
      "utf8",
    );
    expect(src).toContain('backgroundColor: "#C2410C"');
    expect(src).not.toContain('backgroundColor: "#F97316"');
  });

  it("getSubject is non-empty per locale", () => {
    for (const locale of LOCALES) expect(getSubject(locale).length).toBeGreaterThan(0);
  });
});
