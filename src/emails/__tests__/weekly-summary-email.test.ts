/**
 * @jest-environment node
 */
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return { render: async (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node) };
});

import { render } from "@react-email/render";
import { WeeklySummaryEmail, getSubject, type WeeklySummaryEmailProps } from "../WeeklySummaryEmail";

const LOCALES = ["ro", "en", "de"] as const;
const baseProps: Omit<WeeklySummaryEmailProps, "locale"> = {
  restaurantName: "Tom Yum Bar",
  weekStart: new Date("2026-05-11T00:00:00Z"),
  weekEnd: new Date("2026-05-17T00:00:00Z"),
  metrics: {
    bookings: 120,
    covers: 340,
    completed: 110,
    noShows: 6,
    cancellations: 4,
    bookingsDelta: 12,
    coversDelta: -8,
  },
  reviews: { count: 9, avgRating: 4.6 },
  tier: "base",
};

describe("WeeklySummaryEmail", () => {
  for (const locale of LOCALES) {
    it(`renders ${locale} with the venue name + headline numbers`, async () => {
      const html = await render(WeeklySummaryEmail({ ...baseProps, locale }));
      expect(html).toContain("Tom Yum Bar");
      expect(html).toContain("120");
      expect(html.length).toBeGreaterThan(100);
    });
  }

  it("shows the Pro section only for Pro tier", async () => {
    const proHtml = await render(
      WeeklySummaryEmail({ ...baseProps, locale: "en", tier: "pro", pro: { topSource: "widget", forecastCovers: 360 } }),
    );
    expect(proHtml).toContain("360");
    const baseHtml = await render(WeeklySummaryEmail({ ...baseProps, locale: "en" }));
    expect(baseHtml).not.toContain("360");
  });

  it("getSubject embeds the restaurant name per locale", () => {
    for (const locale of LOCALES) {
      expect(getSubject(locale, { restaurantName: "Tom Yum Bar" })).toContain("Tom Yum Bar");
    }
  });
});
