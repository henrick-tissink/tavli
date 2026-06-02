import { render, screen } from "@testing-library/react";
import { HorizontalSection } from "../horizontal-section";
import type { Restaurant } from "@/lib/types";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={{ discovery: roDiscovery }}>
      {ui}
    </MessagesProvider>,
  );
}

const mockRestaurant: Restaurant = {
  id: "1",
  slug: "test-restaurant",
  name: "Test Restaurant",
  cuisines: ["Italian"],
  priceLevel: 2,
  zone: "Centru",
  city: "București",
  rating: 4.5,
  voteCount: 100,
  photoUrl: null,
  photoCount: 0,
  status: "open",
  availableSlots: ["19:00", "20:00"],
};

const mockRestaurants = [
  mockRestaurant,
  { ...mockRestaurant, id: "2", name: "Second Restaurant" },
];

describe("HorizontalSection", () => {
  it("renders the title", () => {
    renderWithProvider(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    expect(screen.getByText("Trending Now")).toBeInTheDocument();
  });

  it("renders restaurant cards", () => {
    renderWithProvider(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    expect(screen.getAllByText("Test Restaurant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Restaurant").length).toBeGreaterThan(0);
  });

  it("cards are in a scroll container", () => {
    const { container } = renderWithProvider(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
  });
});
