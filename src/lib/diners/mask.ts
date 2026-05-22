/**
 * Mask phone/email PII for list/search surfaces — Wave 3 §03 §5.4.
 *
 * Surfaces that render lists, search results, or any non-detail view of
 * diner contact info MUST mask the value at render time. Full unmasked
 * values require `revealPiiBatch` (§03 §5.5 / sub-unit B) so the access
 * is logged.
 *
 * The mask is deliberately deterministic + non-reversible so the rendered
 * string can safely flow through SSR/HTML caches without leaking PII.
 */

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.length < 6) return e164;
  // +40712345689 → +40 •• ••• •89 (keep country code + last 2 digits)
  const cc = e164.startsWith("+") ? e164.slice(0, 3) : e164.slice(0, 2);
  const last = e164.slice(-2);
  return `${cc} •• ••• •${last}`;
}

export function maskEmail(addr: string | null | undefined): string {
  if (!addr) return "";
  const at = addr.indexOf("@");
  if (at < 1) return addr;
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  if (!domain) return addr;
  if (local.length <= 2) return `${local[0]}•@${domain}`;
  return `${local[0]}•••${local.slice(-1)}@${domain}`;
}
