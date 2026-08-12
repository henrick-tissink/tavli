/**
 * @jest-environment node
 */
import { buildConfirmUrl } from "../confirm-url";

describe("buildConfirmUrl", () => {
  it("points at our own /auth/confirm route", () => {
    const u = new URL(buildConfirmUrl("abc123", "signup"));
    expect(u.pathname).toBe("/auth/confirm");
    expect(u.searchParams.get("token_hash")).toBe("abc123");
    expect(u.searchParams.get("type")).toBe("signup");
  });

  it("never links to Supabase's verify endpoint", () => {
    // That endpoint uses the implicit flow for admin-generated tokens and
    // returns the session in a URL fragment, which the server cannot read —
    // the recipient ends up confirmed but not signed in.
    for (const type of ["signup", "magiclink"] as const) {
      expect(buildConfirmUrl("t", type)).not.toContain("/auth/v1/verify");
      expect(buildConfirmUrl("t", type)).not.toContain("supabase.co");
    }
  });

  it("encodes tokens that contain URL-significant characters", () => {
    const raw = "a+b/c=d&e";
    const u = new URL(buildConfirmUrl(raw, "magiclink"));
    expect(u.searchParams.get("token_hash")).toBe(raw);
  });
});
