import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "../bottom-sheet";

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
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();
    render(
      <BottomSheet open onClose={handleClose}>
        <p>Content</p>
      </BottomSheet>
    );
    await user.click(screen.getByLabelText("Close"));
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
});
