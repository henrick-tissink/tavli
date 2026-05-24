import { render, screen } from "@testing-library/react";
import { MarketingManager } from "../MarketingManager";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("../../actions", () => ({
  setCampaignStatusAction: jest.fn(),
  sendCampaignAction: jest.fn(),
}));
jest.mock("@/components/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../NewCampaignForm", () => ({ NewCampaignForm: () => null }));

describe("MarketingManager toggle accessibility (audit #18)", () => {
  it("gives the on/off toggle an accessible name referencing the campaign", () => {
    render(
      <MarketingManager
        organizationId="org-1"
        campaigns={[
          {
            id: "c1",
            kind: "triggered",
            triggeredCampaignKey: "pre_arrival",
            name: "Pre-arrival",
            status: "active",
            channel: "email",
          },
        ]}
      />,
    );
    // SR users must hear the campaign name, not just "button, pressed".
    const toggle = screen.getByRole("button", { name: /Memento înainte de sosire/i });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
