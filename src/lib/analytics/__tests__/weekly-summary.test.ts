/**
 * @jest-environment node
 */
jest.mock("@react-email/render", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
  return { render: async (node: unknown) => renderToStaticMarkup(node as never) };
});

import { makeWeeklySummary } from "@/lib/analytics/weekly-summary";

function makeDeps(opts: {
  restaurants: Array<{ id: string; name: string; timezone: string; organization_id: string }>;
  totals?: Record<string, number>;
  reviews?: { count: number; avg_rating: number | null };
  audience?: Array<{ email: string | null; locale: string; role: string; isActive: boolean }>;
  tier?: "base" | "pro";
}) {
  let call = 0;
  const db = {
    execute: jest.fn(async () => {
      call++;
      if (call === 1) return opts.restaurants;
      if (call === 2) return [opts.totals ?? { bookings: 10, covers: 20, completed: 8, no_shows: 1, cancellations: 1, last_bookings: 8, last_covers: 22 }];
      if (call === 3) return [opts.reviews ?? { count: 3, avg_rating: 4.5 }];
      return opts.audience ?? [{ email: "owner@x.com", locale: "ro", role: "owner", isActive: true }];
    }),
  };
  const sendEmail = jest.fn(async (_input: { to: string }) => ({ status: "sent" }));
  const recordAudit = jest.fn(async (_input: { action: string }) => {});
  const loadTier = jest.fn(async () => opts.tier ?? "base");
  return { db, sendEmail, recordAudit, loadTier, now: () => new Date("2026-05-17T18:00:00Z") };
}

describe("makeWeeklySummary", () => {
  test("no restaurants → only the selection query, no email", async () => {
    const d = makeDeps({ restaurants: [] });
    await makeWeeklySummary(d as never)();
    expect(d.db.execute).toHaveBeenCalledTimes(1);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  test("sends to each audience member and audits the send", async () => {
    const d = makeDeps({
      restaurants: [{ id: "r1", name: "Tom Yum", timezone: "Europe/Bucharest", organization_id: "o1" }],
      audience: [
        { email: "a@x.com", locale: "ro", role: "owner", isActive: true },
        { email: "b@x.com", locale: "en", role: "manager", isActive: true },
        { email: null, locale: "ro", role: "admin", isActive: true },
      ],
    });
    await makeWeeklySummary(d as never)();
    expect(d.sendEmail).toHaveBeenCalledTimes(2); // null-email member skipped
    const actions = d.recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("analytics.weekly_summary_sent");
  });
});
