import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPillBar } from "../filter-pill-bar";
import { FilterProvider, useFilters } from "@/lib/filter-context";
import { getRestaurants } from "@/lib/mock-data";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/test-city",
  useParams: () => ({ city: "test-city" }),
}));

let latestCtx: ReturnType<typeof useFilters>;
function CtxSpy() {
  latestCtx = useFilters();
  return null;
}

function renderBar(
  props: Partial<React.ComponentProps<typeof FilterPillBar>> = {},
) {
  return render(
    <MessagesProvider locale="ro" bundle={{ discovery: roDiscovery }}>
      <FilterProvider>
        <CtxSpy />
        <FilterPillBar
          restaurants={getRestaurants()}
          injectedPills={props.injectedPills}
          onOpenAdvanced={props.onOpenAdvanced ?? jest.fn()}
        />
      </FilterProvider>
    </MessagesProvider>,
  );
}

describe("FilterPillBar", () => {
  it("renders the core pills and overflow Filtre button", () => {
    renderBar();
    expect(screen.getByText("Toate")).toBeInTheDocument();
    expect(screen.getByText("Deschis acum")).toBeInTheDocument();
    expect(screen.getByText("Bucătărie")).toBeInTheDocument();
    expect(screen.getByText("Preț")).toBeInTheDocument();
    expect(screen.getByText("Filtre")).toBeInTheDocument();
  });

  it("does NOT render the removed dead pills", () => {
    renderBar();
    expect(screen.queryByText("Distanță")).not.toBeInTheDocument();
    expect(screen.queryByText("Mai multe")).not.toBeInTheDocument();
  });

  it("Toate is active when no filters are set", () => {
    renderBar();
    expect(screen.getByText("Toate").closest("button")).toHaveClass(
      "bg-brand-primary",
    );
  });

  it("clicking Deschis acum toggles openNow", async () => {
    const user = userEvent.setup();
    renderBar();
    expect(latestCtx.filters.openNow).toBe(false);
    await user.click(screen.getByText("Deschis acum"));
    expect(latestCtx.filters.openNow).toBe(true);
  });

  it("clicking Bucătărie opens an inline popover with cuisine items", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Bucătărie"));
    // Mock data contains Italian / Japanese / Romanian; expect Romanian label.
    expect(screen.getByText("Italiană")).toBeInTheDocument();
    expect(screen.getByText("Japoneză")).toBeInTheDocument();
  });

  it("toggling an item in the cuisine popover updates filter state", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Bucătărie"));
    await user.click(screen.getByText("Italiană"));
    expect(latestCtx.filters.cuisines).toContain("Italian");
  });

  it("clicking the Preț popover toggles price levels", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Preț"));
    await user.click(screen.getByText("$$$"));
    expect(latestCtx.filters.priceRange).toContain(3);
  });

  it("Toate resets all filters", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Bucătărie"));
    await user.click(screen.getByText("Italiană"));
    expect(latestCtx.filters.cuisines.length).toBe(1);
    await user.click(screen.getByText("Toate"));
    expect(latestCtx.filters.cuisines).toEqual([]);
  });

  it("clicking the Filtre overflow button calls onOpenAdvanced", async () => {
    const user = userEvent.setup();
    const onOpenAdvanced = jest.fn();
    renderBar({ onOpenAdvanced });
    await user.click(screen.getByText("Filtre"));
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });

  it("toggles an injected time-context pill via internal state", async () => {
    const user = userEvent.setup();
    renderBar({ injectedPills: [{ label: "Brunch", icon: "🥂" }] });
    const brunch = screen.getByText("Brunch").closest("button")!;
    expect(brunch).not.toHaveClass("bg-brand-primary");
    await user.click(brunch);
    expect(brunch).toHaveClass("bg-brand-primary");
    // Clicking again toggles it off.
    await user.click(brunch);
    expect(brunch).not.toHaveClass("bg-brand-primary");
  });

  it("Toate clears both filters and active injected pills", async () => {
    const user = userEvent.setup();
    renderBar({ injectedPills: [{ label: "Brunch", icon: "🥂" }] });
    // Activate both a filter and an injected pill.
    await user.click(screen.getByText("Bucătărie"));
    await user.click(screen.getByText("Italiană"));
    await user.click(screen.getByText("Brunch"));
    const brunch = screen.getByText("Brunch").closest("button")!;
    expect(brunch).toHaveClass("bg-brand-primary");
    // Toate resets everything.
    await user.click(screen.getByText("Toate"));
    expect(latestCtx.filters.cuisines).toEqual([]);
    expect(brunch).not.toHaveClass("bg-brand-primary");
    expect(screen.getByText("Toate").closest("button")).toHaveClass(
      "bg-brand-primary",
    );
  });

  it("opens the Cartier popover when neighborhoods exist", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Cartier"));
    // Mock-data neighborhoods include "Centru Vechi"
    expect(screen.getByText("Centru Vechi")).toBeInTheDocument();
    await user.click(screen.getByText("Centru Vechi"));
    expect(latestCtx.filters.neighborhoods).toContain("Centru Vechi");
  });
});
