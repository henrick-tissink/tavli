// Mock @react-email/render to avoid the dynamic `import("react-dom/server")`
// inside the library's node entry — jsdom (no --experimental-vm-modules) cannot
// handle it. We render via renderToStaticMarkup and emit the same doctype
// prefix the real implementation produces.
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return {
    render: async (node: React.ReactElement) => {
      const html = renderToStaticMarkup(node);
      return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${html.replace(/<!DOCTYPE.*?>/, "")}`;
    },
  };
});

import { render } from "@react-email/render";
import EventRequestNewToPartnerEmail from "../EventRequestNewToPartnerEmail";
import EventRequestRepliedEmail from "../EventRequestRepliedEmail";
import EventRequestQuotedEmail from "../EventRequestQuotedEmail";
import EventRequestAcceptedEmail from "../EventRequestAcceptedEmail";
import EventRequestDeclinedEmail from "../EventRequestDeclinedEmail";
import EventRequestExpiredEmail from "../EventRequestExpiredEmail";
import EventRequestNudgeEmail from "../EventRequestNudgeEmail";

const base = {
  restaurantName: "Test R",
  occasion: "wedding" as const,
  eventDate: "2026-08-01",
  partySize: 30,
  guestName: "Sara",
  trackingUrl: "https://tavli.ro/event-requests/T",
};

describe("event-request email snapshots", () => {
  for (const locale of ["ro", "en", "de"] as const) {
    it(`new-to-partner ${locale}`, async () => {
      const html = await render(
        <EventRequestNewToPartnerEmail
          locale={locale}
          {...base}
          partnerInboxUrl="https://tavli.ro/partner/corporate/events"
        />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`replied ${locale}`, async () => {
      const html = await render(
        <EventRequestRepliedEmail
          locale={locale}
          {...base}
          partnerResponse="Disponibil!"
        />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`quoted ${locale}`, async () => {
      const html = await render(
        <EventRequestQuotedEmail
          locale={locale}
          {...base}
          amountLei={3500}
          quoteExpiresAt="2026-07-25"
        />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`accepted ${locale}`, async () => {
      const html = await render(
        <EventRequestAcceptedEmail locale={locale} {...base} amountLei={3500} />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`declined ${locale}`, async () => {
      const html = await render(
        <EventRequestDeclinedEmail
          locale={locale}
          {...base}
          declineReason="no_availability"
        />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`expired ${locale}`, async () => {
      const html = await render(
        <EventRequestExpiredEmail locale={locale} {...base} />,
      );
      expect(html).toMatchSnapshot();
    });
    it(`nudge ${locale}`, async () => {
      const html = await render(
        <EventRequestNudgeEmail
          locale={locale}
          {...base}
          daysOpen={7}
          partnerInboxUrl="https://tavli.ro/partner/corporate/events"
        />,
      );
      expect(html).toMatchSnapshot();
    });
  }
});
