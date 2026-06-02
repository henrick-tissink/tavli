import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { CorporateOverview } from "../CorporateOverview";
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

const noop = jest.fn().mockResolvedValue(undefined);

describe("CorporateOverview", () => {
  beforeEach(() => {
    noop.mockClear();
  });

  it("renders four capability cards with toggle state from props", () => {
    render(
      <CorporateOverview
        restaurantId="r1"
        capabilities={{
          events: { enabled: false, openCount: 0 },
          corporateMeals: { enabled: false },
          standing: { enabled: false },
          meetingNooks: { enabled: false },
        }}
        onToggle={noop}
      />,
    );
    expect(screen.getByText(/evenimente private/i)).toBeInTheDocument();
    expect(screen.getByText(/comenzi corporate/i)).toBeInTheDocument();
    expect(screen.getByText(/rezervări recurente/i)).toBeInTheDocument();
    expect(screen.getByText(/spații pentru întâlniri/i)).toBeInTheDocument();
  });

  it("calls onToggle when events toggle clicked", async () => {
    render(
      <CorporateOverview
        restaurantId="r1"
        capabilities={{
          events: { enabled: false, openCount: 0 },
          corporateMeals: { enabled: false },
          standing: { enabled: false },
          meetingNooks: { enabled: false },
        }}
        onToggle={noop}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /evenimente private/i }));
    expect(noop).toHaveBeenCalledWith("events", true);
  });
});
