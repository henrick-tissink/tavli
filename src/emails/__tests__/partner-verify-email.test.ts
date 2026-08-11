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
import { PartnerVerifyEmail, getSubject } from "../PartnerVerifyEmail";

const LOCALES = ["ro", "en", "de"] as const;
const URL = "https://xyz.supabase.co/auth/v1/verify?token=pkce_abc&type=signup";

describe("PartnerVerifyEmail", () => {
  for (const locale of LOCALES) {
    it(`renders in ${locale} with the confirmation link and the name`, async () => {
      const html = await render(
        PartnerVerifyEmail({ fullName: "Ana", verifyUrl: URL, locale }),
      );
      expect(html).toContain("Tavli");
      expect(html).toContain("Ana");
      // Present twice: once as the button href, once as copyable fallback text.
      expect(html).toContain(URL.replace(/&/g, "&amp;"));
    });
  }

  it("drops the salutation when no name is supplied (resend path)", async () => {
    const html = await render(PartnerVerifyEmail({ verifyUrl: URL, locale: "en" }));
    expect(html).toContain("One step left");
    expect(html).not.toContain("Hi ,");
    expect(html).not.toContain("undefined");
  });

  it("getSubject is non-empty per locale", () => {
    for (const locale of LOCALES) expect(getSubject(locale).length).toBeGreaterThan(0);
  });
});
