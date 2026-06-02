import { render, screen } from "@testing-library/react";
import { TrackingClient } from "../TrackingClient";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

// `./actions` reaches into dbAdmin / Drizzle on import, which blows up in
// jsdom. We're rendering only — the buttons are not clicked — so a thin
// mock is enough to satisfy the module graph.
jest.mock("../actions", () => ({
  consumerAcceptQuote: jest.fn(),
  consumerDeclineQuote: jest.fn(),
  consumerCancelEventRequest: jest.fn(),
}));

function renderTracking(status = "quoted") {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <TrackingClient
        token="t"
        er={{
          id: "e",
          status,
          occasion: "wedding",
          eventDate: "2026-08-01",
          partySize: 30,
          partnerResponse: "Bună!",
          quotedAmountCents: 750000,
          quoteExpiresAt: new Date("2026-07-15"),
          declineReason: null,
        }}
        restaurant={{ name: "Demo Bistro", heroPath: null }}
        quoteLineItems={[]}
      />
    </MessagesProvider>,
  );
}

describe("TrackingClient", () => {
  it("renders quoted state with amount + Accept/Decline buttons", () => {
    renderTracking();
    expect(screen.getByText(/7[\.,]500 lei/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /acceptă|accept/i }),
    ).toBeInTheDocument();
  });
});
