/**
 * `DEMO_MODE` — set ONLY on the demo.tavli.ro deployment, never on the live
 * tavli.ro site. When on, the app emits a site-wide noindex signal (proxy
 * `X-Robots-Tag` header + robots.txt disallow-all) so the demo, which serves
 * fake content over the seeded DB, can never surface in search results.
 *
 * Deliberately a plain (non-`NEXT_PUBLIC_`) env var: it's read at runtime by the
 * proxy middleware and the robots route, so it's evaluated per-deployment rather
 * than inlined at build time. Fail-safe: only the exact string `"true"` opts in.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
