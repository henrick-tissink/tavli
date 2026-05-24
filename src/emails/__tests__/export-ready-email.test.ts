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
import { ExportReadyEmail, getSubject } from "../ExportReadyEmail";

const LOCALES = ["ro", "en", "de"] as const;
const EXPIRES = new Date("2026-05-25T12:00:00Z");

describe("ExportReadyEmail", () => {
  for (const locale of LOCALES) {
    it(`renders in ${locale} with the download link`, async () => {
      const html = await render(
        ExportReadyEmail({
          downloadUrl: "https://example.com/signed/export.zip",
          expiresAt: EXPIRES,
          tables: ["reservations", "diners"],
          locale,
        }),
      );
      expect(html).toContain("Tavli");
      expect(html).toContain("https://example.com/signed/export.zip");
      expect(html.length).toBeGreaterThan(100);
    });
  }

  it("getSubject returns a non-empty subject per locale", () => {
    for (const locale of LOCALES) {
      expect(getSubject(locale).length).toBeGreaterThan(0);
    }
  });
});
