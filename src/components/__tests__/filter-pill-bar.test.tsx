import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPillBar } from "../filter-pill-bar";

describe("FilterPillBar", () => {
  it("renders default pills", () => {
    render(
      <FilterPillBar
        activePills={["All"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={jest.fn()}
      />
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Open Now")).toBeInTheDocument();
    expect(screen.getByText("Cuisine")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("All pill is active", () => {
    const { container } = render(
      <FilterPillBar
        activePills={["All"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={jest.fn()}
      />
    );
    // The first button/pill should be active (bg-brand-primary)
    const allPill = container.querySelector("button");
    expect(allPill).toHaveClass("bg-brand-primary");
  });

  it("clicking non-dropdown pill calls onPillToggle", async () => {
    const user = userEvent.setup();
    const handleToggle = jest.fn();
    render(
      <FilterPillBar
        activePills={["All"]}
        onPillToggle={handleToggle}
        onDropdownOpen={jest.fn()}
      />
    );
    await user.click(screen.getByText("Open Now"));
    expect(handleToggle).toHaveBeenCalledWith("Open Now");
  });

  it("clicking dropdown pill calls onDropdownOpen", async () => {
    const user = userEvent.setup();
    const handleDropdown = jest.fn();
    render(
      <FilterPillBar
        activePills={["All"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={handleDropdown}
      />
    );
    await user.click(screen.getByText("Cuisine"));
    expect(handleDropdown).toHaveBeenCalledWith("Cuisine");
  });
});
