# §02 phone E.164 normalization

**Date:** 2026-05-21
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/02-bookings.md` §4.7 (second half — paired with the slot concurrency unit)
**Predecessor:** §02 slot concurrency safety (`b692391`).

---

## Problem

Phone inputs across the app are accepted in whatever format the user types. Stored values vary (`0712 345 678`, `+40712345678`, `0712-345-678`, etc.). §04 SMS reminders need E.164 format universally, and the spec asserts "stored `guest_phone` is always E.164." Currently a guest could type a phone in Romanian local format, the system stores it verbatim, and a downstream SMS attempt parses it differently or fails.

## Goal

Normalize every phone input to E.164 at the action boundary via `libphonenumber-js`. Default country code is `RO`. Reject un-normalisable input cleanly. New rows always store E.164.

## Non-goals

- **Backfill of existing prod data** to E.164. Forward-only; the 12 existing partners + their reservations stay as-is. Best-effort backfill (and the SMS-side defensive parsing) is a §04 concern.
- **Restaurant phone change at the SMS layer** — that's §04. Defense-in-depth lives there.
- **Display formatting** — stored is E.164; UI can re-format via `libphonenumber-js`'s formatter when needed. UI updates are out of scope.
- **Locale-aware error messages** — match each site's existing language style (RO partner-facing, EN for now where the action lives).

## Architecture

One new helper + four action-site updates. Single commit.

### `src/lib/phone/normalize.ts`

```ts
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type NormalizePhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Normalize a phone-number string to E.164. Accepts local formats
 * (`0712345678`) when `defaultCountry` is supplied; accepts already-E.164
 * inputs (`+40712345678`) regardless. Returns `{ok:false, reason:"empty"}`
 * for empty/whitespace strings, `{ok:false, reason:"invalid"}` for
 * un-parseable input, `{ok:true, e164}` on success.
 *
 * Defaults to RO since that's the launch country. Other defaultCountries
 * supported for future expansion.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "RO",
): NormalizePhoneResult;
```

Implementation: trim → if empty return `{ok:false, reason:"empty"}` → parse with libphonenumber-js → if invalid return `{ok:false, reason:"invalid"}` → return `{ok:true, e164: parsed.number}`.

### Tests (`src/lib/phone/__tests__/normalize.test.ts`)

5 cases:
1. Valid RO local format `0712345678` → `+40712345678`.
2. Already-E.164 `+40712345678` → `+40712345678` (idempotent).
3. International prefix `+1 415 555 0100` → `+14155550100`.
4. Empty/whitespace `   ` → `{ok:false, reason:"empty"}`.
5. Garbage `abc123` → `{ok:false, reason:"invalid"}`.

### Action-site wiring

For each site, add an import for `normalizePhone`, normalize the phone field immediately after input validation, and reject un-normalisable values with the site's existing error shape.

| Site | Field | Required? | Existing error shape | New behavior |
|---|---|---|---|---|
| `src/app/api/reservations/actions.ts` (~L46) | `input.guestPhone` | required | `{ok:false, mode:"db", error, errorCode?}` | reject with `errorCode:"OTHER"` + the spec's RO message |
| `src/app/api/event-requests/actions.ts` (Zod `submitSchema`) | `guestPhone` | optional | Zod parse throws | normalize after parse; reject by throwing `Error("invalid phone")` to match the file's existing pattern |
| `src/app/partner/(dashboard)/profile/actions.ts` | restaurant `phone` from FormData | optional | `{ok:false, error}` (existing pattern in this file) | reject with the existing shape |
| `src/app/onboard/[token]/profile/actions.ts` | restaurant `phone` from FormData | optional | same as partner profile | same |

For **optional** phones: empty/whitespace input maps to `null` stored (no error). Only NON-empty + non-normalisable triggers a rejection.

### Behavior for the `event-requests` Zod schema

Two options:
- (a) Add `.transform()` + `.refine()` in the schema. Pros: declarative; one place. Cons: failure surfaces as Zod parse error, which the file already handles by throwing.
- (b) Keep schema as `.max(32).optional()`; normalize after parse, before persist. Pros: explicit; keeps Zod schema simple.

Picking (b) for clarity. The pattern in the file is to parse-then-act; injecting validation back into Zod would obscure the failure-path semantics for the next reader.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/phone` — 5/5 pass.
3. `npm run lint 2>&1 | tail -5` — 14-error baseline.
4. `npm run build` — green.
5. Existing booking + event-request tests: if a fixture uses an unnormalisable phone (e.g. `123`), it'll fail post-retrofit. Inspect during implementation and adjust fixtures to use valid RO local or E.164 phones.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| `libphonenumber-js` rejects a valid number due to data gap | Very Low | Low | Library is the canonical Google-maintained metadata source. Acceptable for RO + neighbors. |
| Existing test fixtures use unnormalisable phones | Low | Low | Inspect; update to use `+40712345678` style. |
| FormData callsites trip on null vs empty handling | Low | Low | Helper distinguishes `"empty"` (→ store null) vs `"invalid"` (→ reject). |
| Bundle-size impact from libphonenumber-js (~150KB core) | Low | Low | Server-side helper; doesn't ship to client. Tree-shaking + the core (not max) build keep impact tight. |
| Existing prod rows with non-E.164 phones stay non-E.164 | Med | Low | Forward-only by design. §04's SMS layer will defensively re-parse + skip / surface unsendable rows. |

## Commit shape

Single commit:
- `package.json` + `package-lock.json` — `libphonenumber-js` added
- `src/lib/phone/normalize.ts` (new)
- `src/lib/phone/__tests__/normalize.test.ts` (new)
- `src/app/api/reservations/actions.ts`
- `src/app/api/event-requests/actions.ts`
- `src/app/partner/(dashboard)/profile/actions.ts`
- `src/app/onboard/[token]/profile/actions.ts`

```
feat(phone): normalize all phone inputs to E.164 at action boundaries per §02 §4.7
```

No migration. No data backfill.
