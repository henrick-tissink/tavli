import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchOverlay } from "../search-overlay";
import { getRestaurants } from "@/lib/mock-data";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
});

const defaultProps = {
  open: true,
  restaurants: getRestaurants(),
  onClose: jest.fn(),
  onSelectRestaurant: jest.fn(),
  onSelectCuisine: jest.fn(),
};

describe("SearchOverlay", () => {
  it("returns null when closed", () => {
    const { container } = render(<SearchOverlay {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders empty state sections", () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByText("Trending in București")).toBeInTheDocument();
    expect(screen.getByText("Quick categories")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search restaurants, cuisines...")).toBeInTheDocument();
  });

  it("renders trending items", () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByText("Korean BBQ")).toBeInTheDocument();
    expect(screen.getByText("Rooftop bars")).toBeInTheDocument();
    expect(screen.getByText("Sunday brunch")).toBeInTheDocument();
    expect(screen.getByText("New openings")).toBeInTheDocument();
  });

  it("renders quick category pills", () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByText("Pizza")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
    expect(screen.getByText("Burger")).toBeInTheDocument();
    expect(screen.getByText("Seafood")).toBeInTheDocument();
  });

  it("renders restaurant results for a query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...");
    await user.type(input, "Sakura");
    expect(screen.getByText("Sakura Sushi")).toBeInTheDocument();
    expect(screen.getByText("Restaurants")).toBeInTheDocument();
  });

  it("renders cuisine results for a query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...");
    await user.type(input, "Italian");
    expect(screen.getByText("Cuisines")).toBeInTheDocument();
    expect(screen.getByText(/Italian \(\d+ places?\)/)).toBeInTheDocument();
  });

  it("calls onSelectRestaurant when a restaurant is clicked", async () => {
    const user = userEvent.setup();
    const onSelectRestaurant = jest.fn();
    render(<SearchOverlay {...defaultProps} onSelectRestaurant={onSelectRestaurant} />);
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...");
    await user.type(input, "Sakura");
    await user.click(screen.getByText("Sakura Sushi"));
    expect(onSelectRestaurant).toHaveBeenCalledTimes(1);
    expect(onSelectRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sakura Sushi" }),
    );
  });

  it("calls onSelectCuisine when a cuisine is clicked", async () => {
    const user = userEvent.setup();
    const onSelectCuisine = jest.fn();
    render(<SearchOverlay {...defaultProps} onSelectCuisine={onSelectCuisine} />);
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...");
    await user.type(input, "Italian");
    await user.click(screen.getByText(/Italian \(\d+ places?\)/));
    expect(onSelectCuisine).toHaveBeenCalledTimes(1);
    expect(onSelectCuisine).toHaveBeenCalledWith("Italian");
  });

  it("shows no results message", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...");
    await user.type(input, "xyznotfound");
    expect(screen.getByText(/No restaurants found for 'xyznotfound'/)).toBeInTheDocument();
  });

  it("calls onClose when back button clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByLabelText("Back"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking a quick category sets the query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    await user.click(screen.getByText("Pizza"));
    // Pizza should now be in the input and trigger results
    const input = screen.getByPlaceholderText("Search restaurants, cuisines...") as HTMLInputElement;
    expect(input.value).toBe("Pizza");
  });
});
