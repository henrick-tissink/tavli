import { render as rtlRender, screen } from "@testing-library/react";

jest.mock("@/app/api/event-requests/actions", () => ({
  sendQuoteForEventRequest: jest.fn().mockResolvedValue({}),
}));

import { QuoteForm } from "../QuoteForm";
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("QuoteForm (v2)", () => {
  it("starts with a template line and totals live", () => {
    render(
      <QuoteForm
        eventRequestId="er1"
        partySize={20}
        budgetPerHeadCents={28000}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    // 20 * 280 = 5600
    expect(screen.getByText(/5\.600 lei/)).toBeInTheDocument();
  });

  it("renders suggested chip helpers", () => {
    render(
      <QuoteForm
        eventRequestId="er1"
        partySize={20}
        budgetPerHeadCents={null}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Welcome cocktail/)).toBeInTheDocument();
    expect(screen.getByText(/Open bar/)).toBeInTheDocument();
  });
});
