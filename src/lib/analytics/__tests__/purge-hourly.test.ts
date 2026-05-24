import { makePurgeStaleHourlyWindows } from "@/lib/analytics/purge-hourly";

describe("makePurgeStaleHourlyWindows", () => {
  test("issues one delete of windows older than 90 days", async () => {
    const db = { execute: jest.fn(async () => []) };
    await makePurgeStaleHourlyWindows({ db: db as never })();
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
