import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterSheet } from "../filter-sheet";
import { FilterProvider, useFilters } from "@/lib/filter-context";

// Helper to read context state
let latestCtx: ReturnType<typeof useFilters>;
function CtxSpy() {
  latestCtx = useFilters();
  return null;
}

function renderSheet(props: { open?: boolean; onClose?: () => void; resultCount?: number } = {}) {
  const onClose = props.onClose ?? jest.fn();
  const result = render(
    <FilterProvider>
      <CtxSpy />
      <FilterSheet open={props.open ?? true} onClose={onClose} resultCount={props.resultCount ?? 10} />
    </FilterProvider>,
  );
  return { ...result, onClose };
}

describe("FilterSheet", () => {
  it("renders all section headings", () => {
    renderSheet();
    expect(screen.getByText("Cuisine")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Neighborhood")).toBeInTheDocument();
    expect(screen.getByText("Minimum rating")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Collection")).toBeInTheDocument();
  });

  it("renders cuisine pills from mock data", () => {
    renderSheet();
    expect(screen.getByText("Italian")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
    expect(screen.getByText("Romanian")).toBeInTheDocument();
  });

  it("renders price options", () => {
    renderSheet();
    expect(screen.getByText("$ Affordable")).toBeInTheDocument();
    expect(screen.getByText("$$ Moderate")).toBeInTheDocument();
    expect(screen.getByText("$$$ Premium")).toBeInTheDocument();
    expect(screen.getByText("$$$$ Exclusive")).toBeInTheDocument();
  });

  it("renders venue type pills", () => {
    renderSheet();
    expect(screen.getByText("Restaurant")).toBeInTheDocument();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.getByText("Pizzerie")).toBeInTheDocument();
  });

  it("renders collection pills", () => {
    renderSheet();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("Fine Dining")).toBeInTheDocument();
    expect(screen.getByText("Dog Friendly")).toBeInTheDocument();
  });

  it("toggling a cuisine pill updates filters", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByText("Italian"));
    expect(latestCtx.filters.cuisines).toContain("Italian");
  });

  it("toggling a price button updates filters", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByText("$$$ Premium"));
    expect(latestCtx.filters.priceRange).toContain(3);
  });

  it("does not show Reset when no filters active", () => {
    renderSheet();
    expect(screen.queryByText("Reset")).not.toBeInTheDocument();
  });

  it("shows Reset when filters are active and clicking it clears filters", async () => {
    const user = userEvent.setup();
    renderSheet();
    // Activate a filter first
    await user.click(screen.getByText("Italian"));
    expect(screen.getByText("Reset")).toBeInTheDocument();
    await user.click(screen.getByText("Reset"));
    expect(latestCtx.filters.cuisines).toEqual([]);
  });

  it("shows result count in button", () => {
    renderSheet({ resultCount: 15 });
    expect(screen.getByText("Show 15 results")).toBeInTheDocument();
  });

  it("shows 'No results' when resultCount is 0", () => {
    renderSheet({ resultCount: 0 });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("calls onClose when show results button clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet({ resultCount: 5 });
    await user.click(screen.getByText("Show 5 results"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
