/**
 * @jest-environment node
 */

const recordViewMock = jest.fn();
const setSavedMock = jest.fn();
jest.mock("@/lib/telemetry/record", () => ({
  recordView: (...a: unknown[]) => recordViewMock(...a),
  setSaved: (...a: unknown[]) => setSavedMock(...a),
}));

import { POST } from "../route";

const UUID = "18ed759e-209d-4d3f-943a-df7ff9382e52";
const CLIENT = "b6c232d5-9c13-4ea4-b4a4-94a05d96902e";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/telemetry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/telemetry", () => {
  beforeEach(() => {
    recordViewMock.mockReset().mockResolvedValue(undefined);
    setSavedMock.mockReset().mockResolvedValue(undefined);
  });

  it("records a view event", async () => {
    const res = await POST(makeReq({ type: "view", restaurantId: UUID, locale: "en" }) as never);
    expect(res.status).toBe(204);
    expect(recordViewMock).toHaveBeenCalledWith(UUID, "en");
  });

  it("records a save", async () => {
    const res = await POST(
      makeReq({ type: "save", restaurantId: UUID, clientId: CLIENT, saved: true }) as never,
    );
    expect(res.status).toBe(204);
    expect(setSavedMock).toHaveBeenCalledWith(UUID, CLIENT, true);
  });

  it("records an unsave", async () => {
    const res = await POST(
      makeReq({ type: "save", restaurantId: UUID, clientId: CLIENT, saved: false }) as never,
    );
    expect(res.status).toBe(204);
    expect(setSavedMock).toHaveBeenCalledWith(UUID, CLIENT, false);
  });

  it("rejects a non-uuid restaurantId (mock-mode integer ids) without calling the lib", async () => {
    const res = await POST(makeReq({ type: "view", restaurantId: "5", locale: "en" }) as never);
    expect(res.status).toBe(400);
    expect(recordViewMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale and unknown type", async () => {
    const bad1 = await POST(makeReq({ type: "view", restaurantId: UUID, locale: "xx" }) as never);
    const bad2 = await POST(makeReq({ type: "boom", restaurantId: UUID }) as never);
    expect(bad1.status).toBe(400);
    expect(bad2.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://localhost/api/telemetry", { method: "POST", body: "{nope" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
