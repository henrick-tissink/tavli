import { render } from "@testing-library/react";
import { ImpersonationBanner } from "../ImpersonationBanner";

jest.mock("@/lib/auth/impersonation-cookie", () => ({
  readImpersonationReturnCookie: jest.fn(),
  IMPERSONATION_COOKIE_NAME: "tavli_impersonation_return",
}));

jest.mock("@/lib/auth/impersonation-session", () => ({
  stopImpersonationSession: jest.fn(),
}));

import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";

describe("ImpersonationBanner", () => {
  beforeEach(() => (readImpersonationReturnCookie as jest.Mock).mockReset());

  it("renders nothing when no cookie", async () => {
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue(null);
    const ui = await ImpersonationBanner();
    expect(ui).toBeNull();
  });

  it("renders banner with admin email + target email + stop button when cookie present", async () => {
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue({
      v: 1,
      adminUserId: "admin-id",
      adminEmail: "henrick@tavli.com",
      targetUserId: "target-id",
      targetEmail: "alice@example.com",
      startedAt: new Date().toISOString(),
      adminAccessToken: "",
      adminRefreshToken: "",
    });
    const ui = await ImpersonationBanner();
    const { getByText, getByRole } = render(ui as React.ReactElement);
    expect(getByText(/henrick@tavli.com/)).toBeInTheDocument();
    expect(getByText(/alice@example.com/)).toBeInTheDocument();
    expect(getByRole("button", { name: /stop impersonating/i })).toBeInTheDocument();
  });

  it("has role=status and aria-label", async () => {
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue({
      v: 1,
      adminUserId: "a",
      adminEmail: "a@x",
      targetUserId: "t",
      targetEmail: "t@x",
      startedAt: new Date().toISOString(),
      adminAccessToken: "",
      adminRefreshToken: "",
    });
    const ui = await ImpersonationBanner();
    const { getByRole } = render(ui as React.ReactElement);
    const banner = getByRole("status");
    expect(banner).toHaveAttribute("aria-label", "Impersonation session active");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });
});
