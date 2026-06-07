// Status model (spec §3): requested → confirmed | declined;
// confirmed → cancelled | completed. declined/cancelled/completed are
// terminal and release the slot (the 0066 guard only counts
// requested/confirmed).

export type MeetingBookingStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed";

const TRANSITIONS: Record<MeetingBookingStatus, readonly MeetingBookingStatus[]> = {
  requested: ["confirmed", "declined"],
  confirmed: ["cancelled", "completed"],
  declined: [],
  cancelled: [],
  completed: [],
};

export function canTransitionMeetingBooking(
  from: MeetingBookingStatus,
  to: MeetingBookingStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}
