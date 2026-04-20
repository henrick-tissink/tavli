import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DietaryFilterRow, type DietaryFilter } from "../dietary-filter-row";

describe("DietaryFilterRow", () => {
  it("renders all 4 filter pills in order", () => {
    const { container } = render(
      <DietaryFilterRow
        activeFilters={new Set()}
        onToggle={jest.fn()}
        onClear={jest.fn()}
      />
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(4);
    expect(buttons[0]).toHaveTextContent("Vegan");
    expect(buttons[1]).toHaveTextContent("Vegetarian");
    expect(buttons[2]).toHaveTextContent("Gluten-free");
    expect(buttons[3]).toHaveTextContent("Spicy");
  });

  it("renders active filters with active styling", () => {
    render(
      <DietaryFilterRow
        activeFilters={new Set<DietaryFilter>(["vegan"])}
        onToggle={jest.fn()}
        onClear={jest.fn()}
      />
    );
    const veganPill = screen.getByText("Vegan").closest("button");
    expect(veganPill).toHaveClass("bg-brand-primary-soft");
    expect(veganPill).toHaveClass("text-brand-primary-dark");

    const spicyPill = screen.getByText("Spicy").closest("button");
    expect(spicyPill).toHaveClass("bg-surface-white");
    expect(spicyPill).toHaveClass("text-text-secondary");
  });

  it("clicking a pill calls onToggle with that filter", async () => {
    const user = userEvent.setup();
    const handleToggle = jest.fn();
    render(
      <DietaryFilterRow
        activeFilters={new Set()}
        onToggle={handleToggle}
        onClear={jest.fn()}
      />
    );
    await user.click(screen.getByText("Gluten-free"));
    expect(handleToggle).toHaveBeenCalledWith("gluten-free");

    await user.click(screen.getByText("Spicy"));
    expect(handleToggle).toHaveBeenCalledWith("spicy");
  });

  it("does not render Clear button when activeFilters is empty", () => {
    render(
      <DietaryFilterRow
        activeFilters={new Set()}
        onToggle={jest.fn()}
        onClear={jest.fn()}
      />
    );
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });

  it("renders Clear button when at least one filter is active", () => {
    render(
      <DietaryFilterRow
        activeFilters={new Set<DietaryFilter>(["vegetarian"])}
        onToggle={jest.fn()}
        onClear={jest.fn()}
      />
    );
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("clicking Clear calls onClear", async () => {
    const user = userEvent.setup();
    const handleClear = jest.fn();
    render(
      <DietaryFilterRow
        activeFilters={new Set<DietaryFilter>(["vegan", "spicy"])}
        onToggle={jest.fn()}
        onClear={handleClear}
      />
    );
    await user.click(screen.getByText("Clear"));
    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});
