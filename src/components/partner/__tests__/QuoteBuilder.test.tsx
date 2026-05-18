import { render, screen } from "@testing-library/react";

jest.mock("@/app/api/event-requests/actions", () => ({
  sendQuoteForEventRequest: jest.fn().mockResolvedValue({}),
}));

import { QuoteForm } from "../QuoteForm";

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
