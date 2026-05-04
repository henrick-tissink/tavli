/**
 * Public app origin used for composing fully-qualified URLs in transactional
 * email links, QR codes, and OG metadata. Falls through:
 *   NEXT_PUBLIC_APP_URL → https://${VERCEL_URL} → http://localhost:3000
 *
 * Always returns a string (never throws). Callers compose URLs by appending
 * `/path` directly — no trailing slash is included.
 */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}
