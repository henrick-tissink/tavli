/**
 * @jest-environment jsdom
 */

import { getTelemetryClientId, sendViewBeacon, sendSaveBeacon } from "../client";

const UUID = "18ed759e-209d-4d3f-943a-df7ff9382e52";

describe("telemetry client", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
  });

  it("generates a stable client id in localStorage", () => {
    const a = getTelemetryClientId();
    const b = getTelemetryClientId();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(localStorage.getItem("tavli-client-id")).toBe(a);
  });

  it("sends a view beacon for a uuid restaurant id", () => {
    sendViewBeacon(UUID, "en");
    expect(fetch).toHaveBeenCalledWith(
      "/api/telemetry",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ type: "view", restaurantId: UUID, locale: "en" }),
      }),
    );
  });

  it("skips the beacon for non-uuid (mock fixture) ids", () => {
    sendViewBeacon("5", "en");
    sendSaveBeacon("5", true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a save beacon including the client id", () => {
    const clientId = getTelemetryClientId();
    sendSaveBeacon(UUID, true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/telemetry",
      expect.objectContaining({
        body: JSON.stringify({ type: "save", restaurantId: UUID, clientId, saved: true }),
      }),
    );
  });

  it("swallows network failures", () => {
    (fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    expect(() => sendViewBeacon(UUID, "ro")).not.toThrow();
  });
});
