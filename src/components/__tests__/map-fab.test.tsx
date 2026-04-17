import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFab } from "../map-fab";

describe("MapFab", () => {
  it("renders with map icon", () => {
    render(<MapFab onClick={jest.fn()} />);
    const button = screen.getByLabelText("Open map");
    expect(button).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<MapFab onClick={jest.fn()} />);
    expect(screen.getByLabelText("Open map")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(<MapFab onClick={handleClick} />);
    await user.click(screen.getByLabelText("Open map"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is a button element", () => {
    render(<MapFab onClick={jest.fn()} />);
    const button = screen.getByLabelText("Open map");
    expect(button.tagName).toBe("BUTTON");
  });
});
