/**
 * @jest-environment node
 *
 * Every template emitted `<html lang="en">` regardless of the language it was
 * written in — a Romanian confirmation email announced itself as English to
 * screen readers, and gave Gmail and Outlook the wrong hyphenation, quote and
 * translation-prompt behaviour. Only the seven EventRequest* templates set it.
 */
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return {
    render: async (node: Parameters<typeof renderToStaticMarkup>[0]) =>
      renderToStaticMarkup(node),
  };
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { PartnerVerifyEmail } from "../PartnerVerifyEmail";
import { ConsumerVerifyEmail } from "../ConsumerVerifyEmail";
import { ReservationConfirmationEmail } from "../ReservationConfirmationEmail";

const LOCALES = ["ro", "en", "de"] as const;
const EMAILS_DIR = join(__dirname, "..");

describe("email <html lang>", () => {
  // A source-level guard so a NEW template cannot reintroduce the bug: the
  // render assertions below can only cover templates someone remembered to add.
  it("no template renders a bare <Html> without a lang", () => {
    const offenders = readdirSync(EMAILS_DIR)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /<Html>/.test(readFileSync(join(EMAILS_DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("covers every template in the directory", () => {
    // Guards the guard: if templates move elsewhere, the check above silently
    // passes over an empty list.
    const count = readdirSync(EMAILS_DIR).filter((f) => f.endsWith(".tsx")).length;
    expect(count).toBeGreaterThanOrEqual(24);
  });

  describe.each(LOCALES)("locale %s", (locale) => {
    it("PartnerVerifyEmail stamps the lang attribute", async () => {
      const html = await render(
        PartnerVerifyEmail({ fullName: "Ana", verifyUrl: "https://x.test/v", locale }),
      );
      expect(html).toContain(`lang="${locale}"`);
    });

    it("ConsumerVerifyEmail stamps the lang attribute", async () => {
      const html = await render(
        ConsumerVerifyEmail({ verifyUrl: "https://x.test/v", locale }),
      );
      expect(html).toContain(`lang="${locale}"`);
    });

    it("ReservationConfirmationEmail stamps the lang attribute", async () => {
      const html = await render(
        ReservationConfirmationEmail({
          restaurantName: "Casa Doina",
          guestName: "Ana",
          reservationDate: "2026-09-01",
          reservationTime: "18:00",
          partySize: 2,
          cancelUrl: "https://tavli.ro/r/abc/cancel",
          locale,
        }),
      );
      expect(html).toContain(`lang="${locale}"`);
    });
  });

  // The two single-locale templates state their language rather than inherit a
  // variable that does not exist: InvitationEmail is written in English,
  // ReviewRemovedStatementEmail in Romanian.
  it("single-locale templates hardcode the language of their copy", () => {
    const read = (f: string) => readFileSync(join(EMAILS_DIR, f), "utf8");
    expect(read("InvitationEmail.tsx")).toContain('<Html lang="en">');
    expect(read("ReviewRemovedStatementEmail.tsx")).toContain('<Html lang="ro">');
  });
});
