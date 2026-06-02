import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../top-nav";

// locale-action uses next/headers (server-only); mock it for the jsdom environment.
jest.mock("@/app/(app)/locale-action", () => ({
  setAppLocale: jest.fn(),
}));

const defaultProps = {
  lang: "ro" as const,
  pathname: "/bucuresti",
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
      screen.getByPlaceholderText("Caută restaurante, bucătării…")
    ).toBeInTheDocument();
  });

  it("renders saved and profile icon buttons", () => {
    render(<TopNav {...defaultProps} />);
    expect(screen.getByLabelText("Restaurante salvate")).toBeInTheDocument();
    expect(screen.getByLabelText("Profil")).toBeInTheDocument();
  });

  it("calls onSavedClick when heart button clicked", async () => {
    const user = userEvent.setup();
    const onSavedClick = jest.fn();
    render(<TopNav {...defaultProps} onSavedClick={onSavedClick} />);
    await user.click(screen.getByLabelText("Restaurante salvate"));
    expect(onSavedClick).toHaveBeenCalledTimes(1);
  });

  it("calls onProfileClick when profile button clicked", async () => {
    const user = userEvent.setup();
    const onProfileClick = jest.fn();
    render(<TopNav {...defaultProps} onProfileClick={onProfileClick} />);
    await user.click(screen.getByLabelText("Profil"));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
  });

  it("is hidden on mobile (has hidden class)", () => {
    const { container } = render(<TopNav {...defaultProps} />);
    const header = container.querySelector("header");
    expect(header).toHaveClass("hidden");
  });
});
