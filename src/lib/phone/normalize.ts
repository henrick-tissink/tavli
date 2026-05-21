/**
 * normalizePhone — normalises a phone-number string to E.164 at the action
 * boundary per §02 §4.7. Accepts local formats (e.g. `0712345678`) when
 * `defaultCountry` is supplied; accepts already-E.164 inputs
 * (`+40712345678`) regardless. Default country is RO since that's the
 * launch market; other defaults are supported for future expansion.
 *
 * Returns a discriminated union so callers distinguish "empty input"
 * (legitimate for optional fields → store null) from "non-empty but
 * un-parseable" (reject with a user-facing error).
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type NormalizePhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "invalid" };

export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "RO",
): NormalizePhoneResult {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, e164: parsed.number };
}
