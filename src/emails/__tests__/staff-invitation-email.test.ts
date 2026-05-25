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
import { StaffInvitationEmail, getSubject } from "../StaffInvitationEmail";

const LOCALES = ["ro", "en", "de"] as const;
const EXPIRES = new Date("2026-06-08T12:00:00Z");
const URL = "https://tavli.ro/invitations/raw-token-abc/accept-staff";

describe("StaffInvitationEmail", () => {
  for (const locale of LOCALES) {
    for (const kind of ["org", "restaurant"] as const) {
      it(`renders ${kind} invite in ${locale} with the accept link`, async () => {
        const html = await render(
          StaffInvitationEmail({
            inviteUrl: URL,
            kind,
            role: kind === "org" ? "manager" : "host",
            expiresAt: EXPIRES,
            locale,
            invitedByName: "Ana",
          }),
        );
        expect(html).toContain("Tavli");
        expect(html).toContain(URL);
        expect(html).toContain("Ana");
        expect(html.length).toBeGreaterThan(200);
      });
    }
  }

  it("getSubject differs by kind and is non-empty per locale", () => {
    for (const locale of LOCALES) {
      const org = getSubject(locale, { kind: "org" });
      const venue = getSubject(locale, { kind: "restaurant" });
      expect(org.length).toBeGreaterThan(0);
      expect(venue.length).toBeGreaterThan(0);
      expect(org).not.toEqual(venue);
    }
  });
});
