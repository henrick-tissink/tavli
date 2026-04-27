/**
 * Preset cancel reasons used by the partner-initiated cancel flow.
 *
 * - `partnerLabel` is what the partner sees on the pill in the cancel sheet.
 * - `guestMessage` is what we surface to the guest in the cancellation email.
 *
 * The bare key (e.g. "overbooked") is what gets persisted in
 * `reservations.cancelled_reason`.
 */
export const CANCEL_REASONS = {
  restaurant_closed: {
    partnerLabel: "Restaurant unexpectedly closed",
    guestMessage: "The restaurant is unexpectedly closed today.",
  },
  overbooked: {
    partnerLabel: "Overbooked — no table available",
    guestMessage:
      "The restaurant is fully booked at this time and couldn't accommodate your reservation.",
  },
  kitchen_issue: {
    partnerLabel: "Kitchen issue / equipment failure",
    guestMessage: "The restaurant has had an unexpected kitchen issue.",
  },
  private_event: {
    partnerLabel: "Booked for a private event",
    guestMessage: "The restaurant has been booked for a private event.",
  },
  other: {
    partnerLabel: "Other",
    guestMessage: "The restaurant had to cancel this reservation.",
  },
} as const;

export type CancelReasonKey = keyof typeof CANCEL_REASONS;

export function isCancelReasonKey(value: string): value is CancelReasonKey {
  return Object.prototype.hasOwnProperty.call(CANCEL_REASONS, value);
}
