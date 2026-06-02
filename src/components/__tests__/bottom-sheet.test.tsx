import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "../bottom-sheet";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roUi from "@/messages/ro/ui.json";

// BottomSheet reads useT("ui") for its close-button aria-label, so every render
// must be wrapped in a MessagesProvider carrying the `ui` namespace.
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ ui: roUi }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("BottomSheet", () => {
  it("renders children when open", () => {
    render(
      <BottomSheet open onClose={jest.fn()}>
        <p>Sheet content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Sheet content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <BottomSheet open={false} onClose={jest.fn()}>
        <p>Sheet content</p>
      </BottomSheet>
    );
    expect(screen.queryByText("Sheet content")).not.toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Choose a time">
        <p>Content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Choose a time")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <BottomSheet open onClose={jest.fn()}>
        <p>Content</p>
      </BottomSheet>
    );
    expect(screen.getByLabelText("Închide")).toBeInTheDocument();
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();
    render(
      <BottomSheet open onClose={handleClose}>
        <p>Content</p>
      </BottomSheet>
    );
    await user.click(screen.getByLabelText("Închide"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click calls onClose", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();
    render(
      <BottomSheet open onClose={handleClose}>
        <p>Content</p>
      </BottomSheet>
    );
    await user.click(screen.getByTestId("sheet-backdrop"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("has role=dialog and aria-modal=true", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="Test">
        <p>Content</p>
      </BottomSheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders above tab bar / map FAB (z-index higher than 50)", () => {
    // The TabBar and MapFab use z-50. The sheet must render above them so
    // its sticky bottom action button is reachable.
    render(
      <BottomSheet open onClose={jest.fn()}>
        <p>Content</p>
      </BottomSheet>,
    );
    // The outermost container that holds backdrop + panel is what controls layering.
    const outer = screen.getByTestId("sheet-backdrop").parentElement!;
    expect(outer.className).toMatch(/z-\[60\]|z-60/);
  });

  it("panel has bottom padding for the iOS home indicator + sticky button", () => {
    render(
      <BottomSheet open onClose={jest.fn()}>
        <p>Content</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toMatch(/safe-area-inset-bottom|safe-area/);
  });

  it("has aria-labelledby pointing to title", () => {
    render(
      <BottomSheet open onClose={jest.fn()} title="My Title">
        <p>Content</p>
      </BottomSheet>
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = document.getElementById(labelledBy!);
    expect(title).toHaveTextContent("My Title");
  });
});
