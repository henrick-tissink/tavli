import { mapCancelReason } from "@/lib/analytics/cancel-reason";

describe("mapCancelReason", () => {
  test("structured partner reasons map to their bucket", () => {
    expect(mapCancelReason("cancelled", "restaurant_closed")).toBe("cancel_reason_restaurant_closed");
    expect(mapCancelReason("cancelled", "overbooked")).toBe("cancel_reason_overbooked");
    expect(mapCancelReason("cancelled", "kitchen_issue")).toBe("cancel_reason_kitchen_issue");
    expect(mapCancelReason("cancelled", "private_event")).toBe("cancel_reason_private_event");
    expect(mapCancelReason("cancelled", "other")).toBe("cancel_reason_other");
  });

  test("cancelled with no structured reason = diner-initiated", () => {
    expect(mapCancelReason("cancelled", null)).toBe("cancel_reason_diner");
    expect(mapCancelReason("cancelled", "")).toBe("cancel_reason_diner");
  });

  test("unrecognised free-text reason buckets as 'other'", () => {
    expect(mapCancelReason("cancelled", "weather")).toBe("cancel_reason_other");
  });

  test("non-cancelled statuses produce no cancel bucket", () => {
    expect(mapCancelReason("completed", null)).toBeNull();
    expect(mapCancelReason("no_show", "overbooked")).toBeNull();
    expect(mapCancelReason("confirmed", null)).toBeNull();
  });
});
