import { render, act } from "@testing-library/react";

const sendSaveBeaconMock = jest.fn();
jest.mock("@/lib/telemetry/client", () => ({
  sendSaveBeacon: (...a: unknown[]) => sendSaveBeaconMock(...a),
}));

import { SavedProvider, useSaved } from "../saved-context";

function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useSaved>) => void }) {
  const ctx = useSaved();
  onRender(ctx);
  return null;
}

function renderWithProvider() {
  let ctx!: ReturnType<typeof useSaved>;
  render(
    <SavedProvider>
      <TestConsumer onRender={(c) => { ctx = c; }} />
    </SavedProvider>,
  );
  return () => ctx;
}

beforeEach(() => {
  localStorage.clear();
  sendSaveBeaconMock.mockClear();
});

describe("SavedContext", () => {
  it("toggleSave adds an id", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleSave("r1"); });
    expect(getCtx().savedIds).toContain("r1");
  });

  it("toggleSave removes an existing id", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleSave("r1"); });
    act(() => { getCtx().toggleSave("r1"); });
    expect(getCtx().savedIds).not.toContain("r1");
  });

  it("toggleSave fires a save beacon, then an unsave beacon", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleSave("r1"); });
    expect(sendSaveBeaconMock).toHaveBeenLastCalledWith("r1", true);
    act(() => { getCtx().toggleSave("r1"); });
    expect(sendSaveBeaconMock).toHaveBeenLastCalledWith("r1", false);
  });

  it("a rapid double-toggle in one batch sends save then unsave (no stale closure)", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().toggleSave("r1");
      getCtx().toggleSave("r1");
    });
    expect(sendSaveBeaconMock).toHaveBeenNthCalledWith(1, "r1", true);
    expect(sendSaveBeaconMock).toHaveBeenNthCalledWith(2, "r1", false);
    expect(getCtx().savedIds).not.toContain("r1");
  });

  it("isSaved returns correct state", () => {
    const getCtx = renderWithProvider();
    expect(getCtx().isSaved("r1")).toBe(false);
    act(() => { getCtx().toggleSave("r1"); });
    expect(getCtx().isSaved("r1")).toBe(true);
  });

  it("createList adds a new list", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().createList("Date Night"); });
    expect(getCtx().lists).toHaveLength(1);
    expect(getCtx().lists[0].name).toBe("Date Night");
    expect(getCtx().lists[0].restaurantIds).toEqual([]);
  });

  it("addToList adds a restaurant to a list", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().createList("Favorites"); });
    const listId = getCtx().lists[0].id;
    act(() => { getCtx().addToList(listId, "r1"); });
    expect(getCtx().lists[0].restaurantIds).toContain("r1");
  });

  it("addBooking adds a booking", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addBooking({
        id: "b1",
        restaurantId: "1",
        restaurantName: "Casa Veche",
        date: "2026-04-16",
        time: "19:00",
        guests: 2,
        reviewed: false,
      });
    });
    expect(getCtx().bookings).toHaveLength(1);
    expect(getCtx().bookings[0].restaurantName).toBe("Casa Veche");
  });

  it("persists to localStorage", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleSave("r1"); });
    const stored = localStorage.getItem("tavli-saved");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.savedIds).toContain("r1");
  });
});
