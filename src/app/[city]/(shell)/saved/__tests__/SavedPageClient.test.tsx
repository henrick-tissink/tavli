import { render, screen } from "@testing-library/react";
import { SavedProvider } from "@/lib/saved-context";
import { SavedPageClient } from "../SavedPageClient";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe("SavedPageClient empty states", () => {
  it("renders the saved EmptyState when no places are saved", () => {
    render(
      <SavedProvider>
        <SavedPageClient city="bucuresti" allRestaurants={[]} />
      </SavedProvider>,
    );
    expect(screen.getByRole("img", { name: /Niciun loc salvat/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descoperă restaurante/i })).toHaveAttribute(
      "href",
      "/bucuresti",
    );
  });

  it("renders the bookings EmptyState (no action) when no bookings exist", () => {
    render(
      <SavedProvider>
        <SavedPageClient city="bucuresti" allRestaurants={[]} />
      </SavedProvider>,
    );
    expect(screen.getByRole("img", { name: /Nicio rezervare/i })).toBeInTheDocument();
  });
});
