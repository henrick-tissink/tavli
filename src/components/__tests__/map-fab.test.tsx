import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFab } from "../map-fab";

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
