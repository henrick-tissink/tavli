import { isCancelReasonKey } from "@/lib/cancel-reasons";

/**
 * §07 §4.1 — map a reservation's cancellation into a daily-aggregate bucket.
 *
 * Only `status = 'cancelled'` rows produce a bucket (no_show/completed/etc. are
 * counted elsewhere). Partner-initiated cancels carry a structured
 * `cancelled_reason` key (see src/lib/cancel-reasons.ts); diner-initiated
 * cancels have no reason → `cancel_reason_diner`. Unrecognised free text →
 * `cancel_reason_other`.
 */
export type CancelBucket =
  | "cancel_reason_restaurant_closed"
  | "cancel_reason_overbooked"
  | "cancel_reason_kitchen_issue"
  | "cancel_reason_private_event"
  | "cancel_reason_other"
  | "cancel_reason_diner";

export function mapCancelReason(
  status: string,
  cancelledReason: string | null | undefined,
): CancelBucket | null {
  if (status !== "cancelled") return null;
  if (!cancelledReason) return "cancel_reason_diner";
  if (isCancelReasonKey(cancelledReason)) {
    return `cancel_reason_${cancelledReason}` as CancelBucket;
  }
  return "cancel_reason_other";
}
