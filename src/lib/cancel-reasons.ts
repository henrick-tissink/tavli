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
    partnerLabel: "Restaurant închis neașteptat",
    guestMessage: "Restaurantul este închis astăzi în mod neașteptat.",
  },
  overbooked: {
    partnerLabel: "Suprarezervare — nu mai sunt mese",
    guestMessage:
      "Restaurantul este complet rezervat la acea oră și nu a putut onora rezervarea ta.",
  },
  kitchen_issue: {
    partnerLabel: "Problemă în bucătărie / defecțiune",
    guestMessage: "Restaurantul a avut o problemă neașteptată în bucătărie.",
  },
  private_event: {
    partnerLabel: "Rezervat pentru un eveniment privat",
    guestMessage: "Restaurantul a fost rezervat pentru un eveniment privat.",
  },
  other: {
    partnerLabel: "Altul",
    guestMessage: "Restaurantul a fost nevoit să anuleze această rezervare.",
  },
} as const;

export type CancelReasonKey = keyof typeof CANCEL_REASONS;

export function isCancelReasonKey(value: string): value is CancelReasonKey {
  return Object.prototype.hasOwnProperty.call(CANCEL_REASONS, value);
}
