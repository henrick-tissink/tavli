/**
 * @jest-environment node
 *
 * Guard: the auth callback must build redirects from the public origin, never
 * from `req.url`.
 *
 * Behind the reverse proxy a route handler's `req.url` carries the container's
 * internal address, so `new URL("/auth/verified", req.url)` emitted
 * `Location: https://0.0.0.0:3000/auth/verified`. Every emailed verification
 * link dead-ended on an unreachable host — for diners and partners alike, in
 * both environments. Middleware is unaffected, which is why proxy.ts redirects
 * looked correct and this survived.
 *
 * Asserted against the source rather than by booting the handler: reproducing
 * it properly needs a real proxied request, and the whole failure is that the
 * request object looks fine locally. The rule "no redirect built from the
 * request URL" is what actually needs enforcing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "route.ts"), "utf8");

describe("auth callback redirect origin", () => {
  it("never builds a redirect from the request URL", () => {
    // Matches `new URL(<anything>, url)` / `req.url` / `request.url` as the base.
    const offenders = SRC.split("\n").filter((line) =>
      /NextResponse\.redirect\(\s*new URL\([^)]*,\s*(url|req\.url|request\.url)\s*\)/.test(line),
    );
    expect(offenders).toEqual([]);
  });

  it("builds every redirect from the public origin", () => {
    const redirects = SRC.split("\n").filter((l) => l.includes("NextResponse.redirect(new URL("));
    expect(redirects.length).toBeGreaterThan(0);
    for (const line of redirects) {
      expect(line).toContain("publicOrigin");
    }
  });

  it("derives the public origin from appOrigin, not a header", () => {
    expect(SRC).toContain("const publicOrigin = appOrigin();");
  });
});
