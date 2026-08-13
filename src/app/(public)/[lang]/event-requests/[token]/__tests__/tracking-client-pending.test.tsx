/**
 * Regression guard: TrackingClient drives accept / decline / cancel from a
 * single `useTransition`, so `loading={pending}` would spin all three at once —
 * including "cancel request" while the guest is accepting a quote. The spinner
 * must name the action actually in flight; `disabled` still locks the others.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackingClient } from "../TrackingClient";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";
import { consumerAcceptQuote } from "../actions";

// `./actions` reaches into dbAdmin / Drizzle on import, which blows up in jsdom.
jest.mock("../actions", () => ({
  consumerAcceptQuote: jest.fn(),
  consumerDeclineQuote: jest.fn(),
  consumerCancelEventRequest: jest.fn(),
}));

function renderTracking() {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
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
          quoteExpiresAt: null,
          declineReason: null,
        }}
        restaurant={{ name: "Demo Bistro", heroPath: null }}
        quoteLineItems={[]}
      />
    </MessagesProvider>,
  );
}

/** The three action buttons, in DOM order: accept, decline, cancel. */
function actionButtons() {
  return screen.getAllByRole("button");
}

describe("TrackingClient pending scope", () => {
  it("spins only the pressed button, but disables all three", () => {
    // Never settles, so the in-flight render is what we assert against.
    (consumerAcceptQuote as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderTracking();

    const [accept, decline, cancel] = actionButtons();
    expect(accept).not.toHaveAttribute("aria-busy", "true");

    fireEvent.click(accept);

    expect(accept).toHaveAttribute("aria-busy", "true");
    // The failure this guards: these two spinning as well.
    expect(decline).not.toHaveAttribute("aria-busy", "true");
    expect(cancel).not.toHaveAttribute("aria-busy", "true");

    // …while still being locked, so the guest cannot fire a second action.
    expect(decline).toBeDisabled();
    expect(cancel).toBeDisabled();
  });
});
