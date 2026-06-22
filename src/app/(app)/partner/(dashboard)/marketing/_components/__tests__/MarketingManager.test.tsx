import { render, screen } from "@testing-library/react";
import { MarketingManager } from "../MarketingManager";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roMarketing from "@/messages/ro/partner.marketing.json";
import roCommon from "@/messages/ro/partner.common.json";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("../../actions", () => ({
  setCampaignStatusAction: jest.fn(),
  sendCampaignAction: jest.fn(),
}));
jest.mock("@/components/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../NewCampaignForm", () => ({ NewCampaignForm: () => null }));

function renderWithMessages(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={{ "partner.marketing": roMarketing, "partner.common": roCommon }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("MarketingManager toggle accessibility (audit #18)", () => {
  it("gives the on/off toggle an accessible name referencing the campaign", () => {
    renderWithMessages(
      <MarketingManager
        organizationId="org-1"
        locale="ro"
        campaigns={[
          {
            id: "c1",
            kind: "triggered",
            triggeredCampaignKey: "pre_arrival",
            name: "Pre-arrival",
            status: "active",
            channel: "email",
            sentAt: null,
            scheduledSendAt: null,
            recipientCountEstimate: null,
          },
        ]}
      />,
    );
    // SR users must hear the campaign name, not just "button, pressed".
    const toggle = screen.getByRole("button", { name: /Memento înainte de sosire/i });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
