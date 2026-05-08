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
    expect(screen.getByText("Tendințe în București")).toBeInTheDocument();
    expect(screen.getByText("Categorii rapide")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Caută restaurante, bucătării…")).toBeInTheDocument();
  });

  it("renders trending items", () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByText("BBQ coreean")).toBeInTheDocument();
    expect(screen.getByText("Rooftop")).toBeInTheDocument();
    expect(screen.getByText("Brunch de duminică")).toBeInTheDocument();
    expect(screen.getByText("Noi deschideri")).toBeInTheDocument();
  });

  it("renders quick category pills", () => {
    render(<SearchOverlay {...defaultProps} />);
    expect(screen.getByText("Pizza")).toBeInTheDocument();
    expect(screen.getByText("Japoneză")).toBeInTheDocument();
    expect(screen.getByText("Burgeri")).toBeInTheDocument();
    expect(screen.getByText("Pește")).toBeInTheDocument();
  });

  it("renders restaurant results for a query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…");
    await user.type(input, "Sakura");
    expect(screen.getByText("Sakura Sushi")).toBeInTheDocument();
    expect(screen.getByText("Restaurante")).toBeInTheDocument();
  });

  it("renders cuisine results for a query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…");
    await user.type(input, "Italian");
    expect(screen.getByText("Bucătării")).toBeInTheDocument();
    expect(screen.getByText(/Italiană \(\d+ locuri?\)/)).toBeInTheDocument();
  });

  it("calls onSelectRestaurant when a restaurant is clicked", async () => {
    const user = userEvent.setup();
    const onSelectRestaurant = jest.fn();
    render(<SearchOverlay {...defaultProps} onSelectRestaurant={onSelectRestaurant} />);
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…");
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
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…");
    await user.type(input, "Italian");
    await user.click(screen.getByText(/Italiană \(\d+ locuri?\)/));
    expect(onSelectCuisine).toHaveBeenCalledTimes(1);
    expect(onSelectCuisine).toHaveBeenCalledWith("Italian");
  });

  it("shows no results message", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…");
    await user.type(input, "xyznotfound");
    expect(screen.getByText(/Niciun restaurant găsit pentru 'xyznotfound'/)).toBeInTheDocument();
  });

  it("calls onClose when back button clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<SearchOverlay {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByLabelText("Înapoi"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking a quick category sets the query", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay {...defaultProps} />);
    await user.click(screen.getByText("Pizza"));
    // Pizza should now be in the input and trigger results
    const input = screen.getByPlaceholderText("Caută restaurante, bucătării…") as HTMLInputElement;
    expect(input.value).toBe("Pizza");
  });
});
