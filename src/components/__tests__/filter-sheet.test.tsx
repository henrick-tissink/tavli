import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterSheet } from "../filter-sheet";
import { FilterProvider, useFilters } from "@/lib/filter-context";
import { getRestaurants } from "@/lib/mock-data";

// Helper to read context state
let latestCtx: ReturnType<typeof useFilters>;
function CtxSpy() {
  latestCtx = useFilters();
  return null;
}

function renderSheet(props: { open?: boolean; onClose?: () => void; resultCount?: number } = {}) {
  const onClose = props.onClose ?? jest.fn();
  const restaurants = getRestaurants();
  const result = render(
    <FilterProvider>
      <CtxSpy />
      <FilterSheet
        open={props.open ?? true}
        onClose={onClose}
        resultCount={props.resultCount ?? 10}
        restaurants={restaurants}
      />
    </FilterProvider>,
  );
  return { ...result, onClose };
}

describe("FilterSheet", () => {
  it("renders all section headings", () => {
    renderSheet();
    expect(screen.getByText("Bucătărie")).toBeInTheDocument();
    expect(screen.getByText("Preț")).toBeInTheDocument();
    expect(screen.getByText("Cartier")).toBeInTheDocument();
    expect(screen.getByText("Rating minim")).toBeInTheDocument();
    expect(screen.getByText("Tip")).toBeInTheDocument();
    expect(screen.getByText("Colecție")).toBeInTheDocument();
  });

  it("renders cuisine pills from mock data", () => {
    renderSheet();
    expect(screen.getByText("Italian")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
    expect(screen.getByText("Romanian")).toBeInTheDocument();
  });

  it("renders price options", () => {
    renderSheet();
    expect(screen.getByText("$ Accesibil")).toBeInTheDocument();
    expect(screen.getByText("$$ Moderat")).toBeInTheDocument();
    expect(screen.getByText("$$$ Premium")).toBeInTheDocument();
    expect(screen.getByText("$$$$ Exclusivist")).toBeInTheDocument();
  });

  it("renders venue type pills", () => {
    renderSheet();
    expect(screen.getByText("Restaurant")).toBeInTheDocument();
    expect(screen.getByText("Cafenea")).toBeInTheDocument();
    expect(screen.getByText("Pizzerie")).toBeInTheDocument();
  });

  it("renders collection pills", () => {
    renderSheet();
    expect(screen.getByText("Recomandate")).toBeInTheDocument();
    expect(screen.getByText("Fine Dining")).toBeInTheDocument();
    expect(screen.getByText("Pet friendly")).toBeInTheDocument();
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
    expect(screen.queryByText("Resetează")).not.toBeInTheDocument();
  });

  it("shows Reset when filters are active and clicking it clears filters", async () => {
    const user = userEvent.setup();
    renderSheet();
    // Activate a filter first
    await user.click(screen.getByText("Italian"));
    expect(screen.getByText("Resetează")).toBeInTheDocument();
    await user.click(screen.getByText("Resetează"));
    expect(latestCtx.filters.cuisines).toEqual([]);
  });

  it("shows result count in button", () => {
    renderSheet({ resultCount: 15 });
    expect(screen.getByText("Arată 15 rezultate")).toBeInTheDocument();
  });

  it("shows 'No results' when resultCount is 0", () => {
    renderSheet({ resultCount: 0 });
    expect(screen.getByText("Niciun rezultat")).toBeInTheDocument();
  });

  it("calls onClose when show results button clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet({ resultCount: 5 });
    await user.click(screen.getByText("Arată 5 rezultate"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
