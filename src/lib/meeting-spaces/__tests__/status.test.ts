import { canTransitionMeetingBooking } from "../status";

describe("meeting-booking status transitions", () => {
  it.each([
    ["requested", "confirmed", true],
    ["requested", "declined", true],
    ["requested", "cancelled", false],
    ["requested", "completed", false],
    ["confirmed", "cancelled", true],
    ["confirmed", "completed", true],
    ["confirmed", "declined", false],
    ["confirmed", "requested", false],
    ["declined", "confirmed", false],
    ["cancelled", "completed", false],
    ["completed", "cancelled", false],
  ] as const)("%s → %s = %s", (from, to, ok) => {
    expect(canTransitionMeetingBooking(from, to)).toBe(ok);
  });
});
