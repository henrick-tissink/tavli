# Partner Cancel-with-Reason — Design

**Date:** 2026-04-27
**Status:** Design approved, ready for implementation
**Roadmap item:** #2 of the week-of-2026-04-27 plan ("Booking management"), v1 split — cancel only. Edit is a separate spec to follow.
**Scope:** Replace the partner-side `confirm()` cancel with a preset-reason sheet, send a guest cancellation email, and tighten the cancel path to be the single place that voids a booking.

## Goal

Today the partner can click Cancel on a confirmed-or-seated reservation. It triggers a browser `confirm()`, hardcodes `cancelled_reason="Cancelled by restaurant"`, and **sends nothing to the guest** — despite the page subtitle promising "Consumers get an email when you cancel." That subtitle is a live lie on prod.

After this spec:

1. Cancel only appears on `confirmed` reservations. (Misclick recovery on `seated` rows uses No-show.)
2. Clicking Cancel opens a bottom-sheet with five preset-reason pills.
3. Submitting fires `cancelReservation(id, reasonKey)` which writes the cancellation, then sends a guest-facing email using the reason's friendly message.
4. The page subtitle becomes accurate.

Out of scope: editing reservations (separate v2 spec); custom free-text reasons (preset only — see brainstorming for why); multi-language emails (RO/TR i18n is Phase 3).

## Architecture

```
NEW  src/lib/cancel-reasons.ts                            preset map (key → partnerLabel + guestMessage)
NEW  src/lib/__tests__/cancel-reasons.test.ts
NEW  src/emails/PartnerCancelledEmail.tsx                 React Email template
NEW  src/emails/__tests__/PartnerCancelledEmail.test.tsx
NEW  src/components/partner/CancelReservationSheet.tsx    bottom-sheet client component with preset-pill picker
NEW  src/components/partner/__tests__/CancelReservationSheet.test.tsx
NEW  src/app/partner/(dashboard)/reservations/__tests__/actions.test.ts
MOD  src/app/partner/(dashboard)/reservations/actions.ts  add cancelReservation; remove "cancelled" from NewStatus union and the cancel patch logic
MOD  src/components/partner/ReservationsList.tsx          replace confirm() path with sheet trigger; remove Cancel from seated rows; update existing test assertion
```

The `src/lib/cancel-reasons.ts` module is pure data — easy to unit-test, no Next.js coupling, follows the same pattern as `src/lib/seo/*` builders. `cancelReservation` is a separate action from `updateReservationStatus` because the inputs differ (reasonKey) and it has email side effects the others don't. Keeps both functions small and single-purpose.

## Components

### `cancel-reasons.ts`

```typescript
export const CANCEL_REASONS = {
  restaurant_closed:  { partnerLabel: "Restaurant unexpectedly closed",     guestMessage: "The restaurant is unexpectedly closed today." },
  overbooked:         { partnerLabel: "Overbooked — no table available",    guestMessage: "The restaurant is fully booked at this time and couldn't accommodate your reservation." },
  kitchen_issue:      { partnerLabel: "Kitchen issue / equipment failure",  guestMessage: "The restaurant has had an unexpected kitchen issue." },
  private_event:      { partnerLabel: "Booked for a private event",         guestMessage: "The restaurant has been booked for a private event." },
  other:              { partnerLabel: "Other",                              guestMessage: "The restaurant had to cancel this reservation." },
} as const;

export type CancelReasonKey = keyof typeof CANCEL_REASONS;

export function isCancelReasonKey(value: string): value is CancelReasonKey {
  return value in CANCEL_REASONS;
}
```

The `cancelled_reason` column stores the bare key (e.g. `"overbooked"`). Stable enum-by-convention so future analytics joins are clean.

### `<PartnerCancelledEmail>`

Same visual language as `ReservationConfirmationEmail.tsx` (Fraunces logo, warm card with brand-orange left border, footer). Props:

```typescript
{
  restaurantName: string;
  restaurantCitySlug: string;
  restaurantSlug: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
  guestName: string;
  guestMessage: string;    // from CANCEL_REASONS[key].guestMessage
}
```

Body structure:
- Heading: "Reservation cancelled."
- "Hi {guestName} — unfortunately your reservation at {restaurantName} for {prettyDate} at {reservationTime} (party of {partySize}) has been cancelled."
- The `guestMessage` for the chosen reason in italics.
- "We're sorry for the inconvenience. You're welcome to rebook anytime."
- CTA button "Find another time" → `${SITE_URL}/${citySlug}/${slug}`
- Footer.

### `<CancelReservationSheet>`

Props: `{ open, onClose, reservation: { id, guestName, reservationDate, reservationTime, partySize } }`. Uses the existing `BottomSheet` primitive (mobile drawer, desktop center modal).

Layout:
- Header: "Cancel reservation" + a one-line summary "{guestName} · {prettyDate} {time} · party of {partySize}" so partners can verify the right row.
- Body: 5 reason pills (single-select). Selected pill uses brand-primary background; unselected use border + secondary text.
- Footer: secondary "Keep reservation" button (closes sheet) + danger-styled "Cancel reservation" button (disabled until a pill is selected; shows spinner during `useTransition`).

Submission:
```typescript
const result = await cancelReservation(reservation.id, selectedKey);
if (!result.ok) toast.error(result.error);
else if (result.emailSent === false) toast.success("Cancelled — guest email could not be sent.");
else toast.success("Reservation cancelled.");
onClose();
router.refresh();
```

### `cancelReservation(reservationId, reasonKey)` server action

```typescript
"use server";

export async function cancelReservation(
  reservationId: string,
  reasonKey: string,
): Promise<{ ok: boolean; error?: string; emailSent?: boolean }>;
```

Steps:
1. Validate `reasonKey` via `isCancelReasonKey` — reject with `"Invalid reason"` otherwise.
2. Auth: `getCurrentSession()`; reject if missing.
3. Lookup the partner's restaurant by `owner_user_id` (matches existing pattern in `updateReservationStatus`).
4. SELECT `reservations.{guest_name,guest_email,reservation_date,reservation_time,party_size,status}` joined with `restaurants.{name,email,slug,city_id}` and `cities.slug` for that reservation, scoped to the partner's restaurant_id. If not found → `"Reservation not found"`.
5. If `status !== 'confirmed'` → `"Only confirmed reservations can be cancelled"`. Belt-and-braces vs the UI restriction.
6. UPDATE `reservations` SET `status='cancelled'`, `cancelled_at=now()`, `cancelled_reason=reasonKey` WHERE id = ? AND restaurant_id = ?.
7. If `guest_email` is non-null, render `<PartnerCancelledEmail/>` with `CANCEL_REASONS[reasonKey].guestMessage` and call `sendEmail({ to: guest_email, replyTo: restaurant.email ?? undefined })`. Capture the result.
8. `revalidatePath("/partner/reservations")` and `"/partner"`.
9. Return `{ ok: true, emailSent: <bool> }`.

The DB write is the source of truth — email is best-effort. We don't roll back a cancellation if the email fails, because the slot needs to free up either way and the partner has a workable workaround (call the guest).

### Modifications to `updateReservationStatus`

Tighten the input type:

```typescript
// before
export type NewStatus = "seated" | "no_show" | "cancelled" | "completed";
// after
export type NewStatus = "seated" | "no_show" | "completed";
```

Remove the `if (nextStatus === "cancelled")` block that sets `cancelled_at` and `cancelled_reason`. The action becomes a pure status patcher.

### Modifications to `ReservationsList.tsx`

- Remove the Cancel button from `seated` rows. (No-show stays as the safety valve for misclicks.)
- Replace the `confirm()` Cancel path on `confirmed` rows with: open `<CancelReservationSheet>` keyed to that row's reservation.
- Track sheet state in component state (`{ open, reservation }` or null).

## Data flow

```
Partner clicks "Cancel" on a confirmed row
  → ReservationsList sets sheet state = { reservation }
  → <CancelReservationSheet> opens
  → partner picks reason pill, clicks "Cancel reservation"
  → cancelReservation(id, reasonKey)
       → validate reasonKey, session, ownership
       → SELECT join (guest + restaurant + city)
       → if status !== 'confirmed': reject
       → UPDATE reservations (status, cancelled_at, cancelled_reason)
       → if guest_email present: render+send <PartnerCancelledEmail>
       → revalidatePath, return { ok: true, emailSent }
  → sheet closes, toast, router.refresh()
```

## Graceful degradation & error handling

| Scenario | Behavior |
|---|---|
| Reservation not in `confirmed` status | Action rejects. UI never offers the path so this is belt-and-braces. |
| `guest_email` is null | Skip email. `emailSent: false`. Toast: "Reservation cancelled. (No email on file.)" |
| `RESEND_API_KEY` unset (dev) | `sendEmail` logs to console and returns `{ ok: true, devMode: true }` — treated as success. Standard toast. |
| Resend API error | DB write already committed. Action returns `{ ok: true, emailSent: false }` (the Resend error message is logged server-side, not returned to the client). Toast: "Cancelled — guest email could not be sent." Partner can call the guest. |
| RLS / ownership mismatch | Update affects 0 rows; action rejects with "Reservation not found". |
| Partner double-clicks Cancel | `useTransition.pending` disables the button. |
| Invalid `reasonKey` | Action rejects via `isCancelReasonKey` guard. |
| Sheet closed without confirming | No-op. Nothing written. |

## Testing

| Subject | How |
|---|---|
| `cancel-reasons.ts` | Jest unit — every key has both `partnerLabel` and `guestMessage`; `isCancelReasonKey` accepts known keys, rejects unknown. |
| `cancelReservation` action | Mock Supabase + `sendEmail`. Cases: happy path (status updated + email sent), no `guest_email` (email skipped, emailSent=false), Resend error (action still ok, emailSent=false), non-confirmed status (rejected), invalid reason key (rejected), ownership mismatch (rejected). |
| `<PartnerCancelledEmail>` | RTL render — verify each of the 5 keys produces its expected `guestMessage` substring; CTA href is `${getSiteUrl()}/${citySlug}/${slug}`. |
| `<CancelReservationSheet>` | RTL — opens with the right header summary; submit disabled until a pill is selected; clicking a pill enables submit; submitting calls action with correct args; closing without confirm doesn't fire action. |
| `ReservationsList` regression | Existing test updated: `seated` rows show Mark Complete + No-show but no Cancel; `confirmed` rows still show Cancel but it now opens the sheet instead of `confirm()`. |

4 new test files + 1 updated existing test. ~25 new cases. Existing 276-test suite stays green.

## Acceptance criteria

- Partner clicks Cancel on a `confirmed` row → sheet opens with reservation summary + 5 reason pills.
- Submit disabled until a pill is selected; clicking one of the 5 pills enables submit.
- Submitting writes `status='cancelled'`, `cancelled_at`, `cancelled_reason=<key>` and sends the guest a `PartnerCancelledEmail` with the right friendly message.
- `seated` rows no longer have a Cancel button.
- `updateReservationStatus` no longer accepts `"cancelled"` — TS error if anything tries to pass it.
- Page subtitle "Consumers get an email when you cancel" is accurate end-to-end.
- Email lookup at https://resend.com/emails shows the new `PartnerCancelledEmail` deliveries on prod after a real cancel.
- All tests pass; `tsc` clean; `next build` clean.

## Out of scope (explicit non-goals for this spec)

- **Editing a reservation** — separate v2 spec.
- **Custom / free-text reasons** — preset only (per brainstorming decision: avoids the "kitchen closed lol" failure mode).
- **"Undo seated"** — out of scope. Misclick recovery uses No-show.
- **Cancellation analytics dashboard** — the data is captured for future use but no UI ships in this spec.
- **Multi-language emails** — English only; RO/TR i18n is deferred to Phase 3.
- **SMS notifications** — only email; Tavli's `guest_phone` is for partner-side reach, not consumer notifications.
