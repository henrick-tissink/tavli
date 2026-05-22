import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAAL2 } from "../aal";

function mockSupabase(level: "aal1" | "aal2"): SupabaseClient {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
          data: { currentLevel: level, nextLevel: level },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("requireAAL2", () => {
  it("resolves true when current level is aal2", async () => {
    expect(await requireAAL2(mockSupabase("aal2"))).toBe(true);
  });

  it("resolves false when current level is aal1", async () => {
    expect(await requireAAL2(mockSupabase("aal1"))).toBe(false);
  });
});
