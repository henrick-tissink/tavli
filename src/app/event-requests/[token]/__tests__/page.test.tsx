import { render, screen } from "@testing-library/react";
import { TrackingClient } from "../TrackingClient";

// `./actions` reaches into dbAdmin / Drizzle on import, which blows up in
// jsdom. We're rendering only — the buttons are not clicked — so a thin
// mock is enough to satisfy the module graph.
jest.mock("../actions", () => ({
  consumerAcceptQuote: jest.fn(),
  consumerDeclineQuote: jest.fn(),
  consumerCancelEventRequest: jest.fn(),
}));

describe("TrackingClient", () => {
  it("renders quoted state with amount + Accept/Decline buttons", () => {
    render(
      <TrackingClient
        token="t"
        er={{
          id: "e",
          status: "quoted",
          occasion: "wedding",
          eventDate: "2026-08-01",
          partySize: 30,
          partnerResponse: "Bună!",
          quotedAmountCents: 750000,
          quoteExpiresAt: new Date("2026-07-15"),
          declineReason: null,
        }}
      />,
    );
    expect(screen.getByText(/7500\.00 lei/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /acceptă|accept/i }),
    ).toBeInTheDocument();
  });
});
