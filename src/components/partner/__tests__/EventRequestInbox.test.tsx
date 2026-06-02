import { render as rtlRender, screen } from "@testing-library/react";
import { EventRequestInbox } from "../EventRequestInbox";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roCorporate from "@/messages/ro/partner.corporate.json";
import roCommon from "@/messages/ro/partner.common.json";

function render(ui: React.ReactElement) {
  return rtlRender(
    <MessagesProvider
      locale="ro"
      bundle={{ "partner.corporate": roCorporate, "partner.common": roCommon }}
    >
      {ui}
    </MessagesProvider>,
  );
}

describe("EventRequestInbox (v2)", () => {
  it("renders one card per row with urgency, party size, days waiting", () => {
    const old = new Date(Date.now() - 4 * 86_400_000);
    render(
      <EventRequestInbox
        rows={[
          {
            id: "r1",
            occasion: "wedding",
            eventDate: "2026-09-15",
            partySize: 50,
            guestName: "Ana",
            status: "new",
            createdAt: old,
            budgetPerHeadCents: 30000,
          },
        ]}
      />,
    );
    expect(screen.getByText(/ana/i)).toBeInTheDocument();
    expect(screen.getByText(/4 zile/i)).toBeInTheDocument();
    expect(screen.getByText(/nuntă/i)).toBeInTheDocument();
    expect(screen.getByText(/300 lei\/pers/i)).toBeInTheDocument();
  });

  it("shows empty state when no rows", () => {
    render(<EventRequestInbox rows={[]} />);
    expect(screen.getByText(/nicio cerere/i)).toBeInTheDocument();
  });
});
