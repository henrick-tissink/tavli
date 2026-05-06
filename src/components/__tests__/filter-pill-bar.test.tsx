import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPillBar } from "../filter-pill-bar";

describe("FilterPillBar", () => {
  it("renders default pills", () => {
    render(
      <FilterPillBar
        activePills={["Toate"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={jest.fn()}
      />
    );
    expect(screen.getByText("Toate")).toBeInTheDocument();
    expect(screen.getByText("Deschis acum")).toBeInTheDocument();
    expect(screen.getByText("Bucătărie")).toBeInTheDocument();
    expect(screen.getByText("Preț")).toBeInTheDocument();
    expect(screen.getByText("Distanță")).toBeInTheDocument();
    expect(screen.getByText("Mai multe")).toBeInTheDocument();
  });

  it("Toate pill is active", () => {
    const { container } = render(
      <FilterPillBar
        activePills={["Toate"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={jest.fn()}
      />
    );
    const allPill = container.querySelector("button");
    expect(allPill).toHaveClass("bg-brand-primary");
  });

  it("clicking non-dropdown pill calls onPillToggle", async () => {
    const user = userEvent.setup();
    const handleToggle = jest.fn();
    render(
      <FilterPillBar
        activePills={["Toate"]}
        onPillToggle={handleToggle}
        onDropdownOpen={jest.fn()}
      />
    );
    await user.click(screen.getByText("Deschis acum"));
    expect(handleToggle).toHaveBeenCalledWith("Deschis acum");
  });

  it("clicking dropdown pill calls onDropdownOpen", async () => {
    const user = userEvent.setup();
    const handleDropdown = jest.fn();
    render(
      <FilterPillBar
        activePills={["Toate"]}
        onPillToggle={jest.fn()}
        onDropdownOpen={handleDropdown}
      />
    );
    await user.click(screen.getByText("Bucătărie"));
    expect(handleDropdown).toHaveBeenCalledWith("Bucătărie");
  });
});
