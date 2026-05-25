/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("drizzle-orm", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.join("?"), v }) }));

import { makeLogReservationStatus } from "../status-log";

describe("logReservationStatus", () => {
  it("inserts a reservation_status_log row capturing the transition", async () => {
    const execute = jest.fn(async (_q: unknown) => []);
    await makeLogReservationStatus({ db: { execute } as never })({
      reservationId: "res-1",
      restaurantId: "rest-1",
      fromStatus: "confirmed",
      toStatus: "no_show",
      changedByUserId: "u1",
      reason: "auto_no_show",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0][0])).toContain("INSERT INTO reservation_status_log");
  });
});
