import { render, screen } from "@testing-library/react";

// Stub the server action — the sheet test only exercises step-1 rendering,
// but the import graph pulls StepIdentity which references the action.
jest.mock("@/app/api/event-requests/actions", () => ({
  submitEventRequestDraft: jest.fn(),
}));

// react-day-picker pulls a CSS import; jest's transform handles it via
// next/jest's default cssTransform, but we also pre-empt any potential
// IntersectionObserver gap from framer-motion below.

import { EventRequestSheetV2 } from "../index";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

function renderSheet(open = true) {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <EventRequestSheetV2
        open={open}
        onClose={() => {}}
        restaurantId="r1"
        restaurantName="Atelier"
        acceptedOccasions={["wedding"]}
        privateSpaces={[]}
      />
    </MessagesProvider>,
  );
}

describe("EventRequestSheetV2", () => {
  it("renders the dialog with progress on step 1", () => {
    renderSheet();
    expect(
      screen.getByText("Atelier · Eveniment privat"),
    ).toBeInTheDocument();
    expect(screen.getByText(/pas 1 din 4/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = renderSheet(false);
    expect(container).toBeEmptyDOMElement();
  });
});
