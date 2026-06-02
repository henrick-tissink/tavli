import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { MapFab } from "../map-fab";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roUi from "@/messages/ro/ui.json";

// MapFab reads useT("ui") for its aria-label.
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ ui: roUi }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("MapFab", () => {
  it("renders with map icon", () => {
    render(<MapFab onClick={jest.fn()} />);
    const button = screen.getByLabelText("Deschide harta");
    expect(button).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<MapFab onClick={jest.fn()} />);
    expect(screen.getByLabelText("Deschide harta")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(<MapFab onClick={handleClick} />);
    await user.click(screen.getByLabelText("Deschide harta"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is a button element", () => {
    render(<MapFab onClick={jest.fn()} />);
    const button = screen.getByLabelText("Deschide harta");
    expect(button.tagName).toBe("BUTTON");
  });
});
