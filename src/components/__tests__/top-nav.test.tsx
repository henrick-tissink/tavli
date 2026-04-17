import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../top-nav";

const defaultProps = {
  currentCity: "București",
  onCityChange: jest.fn(),
  onSearchFocus: jest.fn(),
  onSavedClick: jest.fn(),
  onProfileClick: jest.fn(),
};

describe("TopNav", () => {
  it("renders the Tavli logo", () => {
    render(<TopNav {...defaultProps} />);
    expect(screen.getByText("Tavli")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<TopNav {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Search restaurants, cuisines...")
    ).toBeInTheDocument();
  });

  it("renders saved and profile icon buttons", () => {
    render(<TopNav {...defaultProps} />);
    expect(screen.getByLabelText("Saved restaurants")).toBeInTheDocument();
    expect(screen.getByLabelText("Profile")).toBeInTheDocument();
  });

  it("calls onSavedClick when heart button clicked", async () => {
    const user = userEvent.setup();
    const onSavedClick = jest.fn();
    render(<TopNav {...defaultProps} onSavedClick={onSavedClick} />);
    await user.click(screen.getByLabelText("Saved restaurants"));
    expect(onSavedClick).toHaveBeenCalledTimes(1);
  });

  it("calls onProfileClick when profile button clicked", async () => {
    const user = userEvent.setup();
    const onProfileClick = jest.fn();
    render(<TopNav {...defaultProps} onProfileClick={onProfileClick} />);
    await user.click(screen.getByLabelText("Profile"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
  });

  it("is hidden on mobile (has hidden class)", () => {
    const { container } = render(<TopNav {...defaultProps} />);
    const header = container.querySelector("header");
    expect(header).toHaveClass("hidden");
  });
});
