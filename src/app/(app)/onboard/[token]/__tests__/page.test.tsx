import { render } from "@testing-library/react";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/invitations", () => ({
  hashInvitationToken: () => "hash",
}));

jest.mock("@/lib/i18n/app-locale", () => ({
  resolveAppLocale: jest.fn().mockResolvedValue("ro"),
}));

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import OnboardingLandingPage from "../page";
import { createSupabaseAdminClient } from "@/lib/db/admin";

function mockInvitation(invitation: Record<string, unknown> | null) {
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: invitation }),
        }),
      }),
    }),
  });
}

describe("OnboardingLandingPage copy", () => {
  it('says "în câteva minute" — not "în 10 minute"', async () => {
    mockInvitation({
      email: "alin@example.com",
      status: "pending",
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      proposed_name: null,
      cities: { name: "București" },
    });

    const params = Promise.resolve({ token: "abc" });
    const ui = await OnboardingLandingPage({ params });
    const { container } = render(ui);

    expect(container.textContent).toContain("în câteva minute");
    expect(container.textContent).not.toContain("10 minute");
  });
});
