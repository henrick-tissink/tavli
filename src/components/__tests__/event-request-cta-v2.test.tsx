import { render, screen } from "@testing-library/react";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

jest.mock("../event-request-sheet-v2", () => ({
  EventRequestSheetV2: () => <div data-testid="sheet" />,
}));
import { EventRequestCtaV2 } from "../event-request-cta-v2";

function withProvider(ui: React.ReactNode) {
  return (
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      {ui}
    </MessagesProvider>
  );
}

describe("EventRequestCtaV2", () => {
  it("renders the CTA with secondary copy when enabled", () => {
    render(
      withProvider(
        <EventRequestCtaV2
          enabled
          restaurantId="r1"
          restaurantName="Atelier Floreasca"
          acceptedOccasions={["wedding", "birthday"]}
          privateSpaces={[]}
        />,
      ),
    );
    expect(
      screen.getByRole("button", { name: /organizează un eveniment privat/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/răspuns în mai puțin de 24 de ore/i),
    ).toBeInTheDocument();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      withProvider(
        <EventRequestCtaV2
          enabled={false}
          restaurantId="r1"
          restaurantName="X"
          acceptedOccasions={[]}
          privateSpaces={[]}
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
