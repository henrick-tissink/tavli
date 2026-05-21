/**
 * NIST 800-63B password policy per §01 §5a.1 + foundations §5.1.
 *
 * Rules:
 *   - Minimum length 8 characters.
 *   - No upper-bound on length or character class.
 *   - No forced periodic rotation.
 *   - HIBP breach check via k-anonymity API on signup + password change.
 *     We send only the first 5 hex chars of SHA-1; the full password
 *     never leaves the server.
 *
 * Fail-open on HIBP outage. HIBP is a defense-in-depth check, not a
 * hard gate; a transient API failure shouldn't block legitimate
 * signups. The error is surfaced via console.warn so an operator can
 * investigate persistent outages.
 */

import "server-only";
import { createHash } from "node:crypto";

const MIN_LENGTH = 8;
const HIBP_RANGE_API = "https://api.pwnedpasswords.com/range";

export type PasswordPolicyReason = "too_short" | "pwned";
export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reason: PasswordPolicyReason };

function sha1Hex(input: string): string {
  return createHash("sha1").update(input).digest("hex").toUpperCase();
}

/**
 * HIBP k-anonymity lookup. Sends the first 5 hex chars of SHA-1(password);
 * receives ~500 candidate suffixes; checks locally whether our suffix
 * appears. Returns `{ pwned: true }` if the password is in the breach
 * corpus, `{ pwned: false }` if cleanly absent. On network / HTTP error,
 * returns `{ pwned: false, transientError: string }` — the caller should
 * treat this as "not blocked" but may want to log.
 */
export async function checkPasswordPwned(
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<{ pwned: boolean; transientError?: string }> {
  try {
    const hex = sha1Hex(password);
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const resp = await fetcher(`${HIBP_RANGE_API}/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!resp.ok) {
      return { pwned: false, transientError: `HIBP API ${resp.status}` };
    }
    const body = await resp.text();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const sep = line.indexOf(":");
      const candidate = (sep === -1 ? line : line.slice(0, sep)).toUpperCase();
      if (candidate === suffix) {
        return { pwned: true };
      }
    }
    return { pwned: false };
  } catch (e) {
    return { pwned: false, transientError: String(e) };
  }
}

/**
 * Apply the full NIST policy: length check first (cheap, no network),
 * then HIBP if length passes. HIBP soft-fails open per spec — the
 * helper returns ok:true on transient errors but logs via console.warn
 * so persistent outages surface.
 */
export async function validatePasswordPolicy(
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<PasswordPolicyResult> {
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: "too_short" };
  }
  const hibp = await checkPasswordPwned(password, fetcher);
  if (hibp.pwned) {
    return { ok: false, reason: "pwned" };
  }
  if (hibp.transientError) {
    console.warn(
      `[password-policy] HIBP check failed (fail-open): ${hibp.transientError}`,
    );
  }
  return { ok: true };
}
