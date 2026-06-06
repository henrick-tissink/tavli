import { render, screen, fireEvent, within } from "@testing-library/react";
import { EventRequestDetail } from "../EventRequestDetail";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roCorporate from "@/messages/ro/partner.corporate.json";
import roCommon from "@/messages/ro/partner.common.json";

// Server actions + sub-forms pull in server-only modules; stub them.
const acceptQuoteForEventRequest = jest.fn().mockResolvedValue({});
jest.mock("@/app/api/event-requests/actions", () => ({
  replyToEventRequest: jest.fn().mockResolvedValue({}),
  acceptQuoteForEventRequest: (...args: unknown[]) => acceptQuoteForEventRequest(...args),
}));
jest.mock("../QuoteForm", () => ({ QuoteForm: () => <div data-testid="quote-form" /> }));
jest.mock("../DeclineForm", () => ({ DeclineForm: () => <div data-testid="decline-form" /> }));
jest.mock("../MaterializeReservationForm", () => ({ MaterializeReservationForm: () => <div data-testid="mat-form" /> }));

function renderDetail(status: string) {
  return render(
    <MessagesProvider locale="ro" bundle={{ "partner.corporate": roCorporate, "partner.common": roCommon }}>
      <EventRequestDetail
        er={{
          id: "er1", status, occasion: "corporate_dinner", eventDate: "2026-08-01", partySize: 12,
          guestName: "Andreea", guestEmail: "a@b.co", guestPhone: null, spacePreference: null,
          budgetPerHeadCents: 25000, menuPreference: null, dietaryNotes: null, additionalNotes: null,
          partnerResponse: null, quotedAmountCents: 300000, privateSpaceName: null,
          claimedCompanyCui: null, claimedCompanyName: null,
        }}
        overlaps={[]}
      />
    </MessagesProvider>,
  );
}

beforeEach(() => {
  acceptQuoteForEventRequest.mockClear();
  // jsdom's location.reload() only warns (no-op), so no stub needed; confirm does.
  window.confirm = jest.fn(() => true);
});

describe("EventRequestDetail — quoted is no longer a dead end", () => {
  it("offers Accept + Decline for a quoted request (and not the reply/quote form)", () => {
    renderDetail("quoted");
    expect(screen.getByRole("button", { name: /marchează ca acceptată/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^refuză$/i })).toBeInTheDocument();
    // The new/viewing/replied reply box must not show for a quoted request.
    expect(screen.queryByText(/trimite ofertă/i)).toBeNull();
  });

  it("accepts the quote on confirm, calling the server action", () => {
    renderDetail("quoted");
    fireEvent.click(screen.getByRole("button", { name: /marchează ca acceptată/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(acceptQuoteForEventRequest).toHaveBeenCalledWith({ id: "er1" });
  });

  it("does not accept when the confirm is dismissed", () => {
    window.confirm = jest.fn(() => false);
    renderDetail("quoted");
    fireEvent.click(screen.getByRole("button", { name: /marchează ca acceptată/i }));
    expect(acceptQuoteForEventRequest).not.toHaveBeenCalled();
  });

  it("shows a terminal note (no actions) for a declined request", () => {
    renderDetail("declined");
    expect(screen.queryByRole("button", { name: /marchează ca acceptată/i })).toBeNull();
    expect(screen.getByText(/nicio acțiune suplimentară/i)).toBeInTheDocument();
  });
});
