import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HorizontalSection } from "../horizontal-section";
import type { Restaurant } from "@/lib/types";

const mockRestaurant: Restaurant = {
  id: "1",
  slug: "test-restaurant",
  name: "Test Restaurant",
  cuisine: "Italian",
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
    render(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    expect(screen.getByText("Trending Now")).toBeInTheDocument();
  });

  it("renders restaurant cards", () => {
    render(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    expect(screen.getAllByText("Test Restaurant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Second Restaurant").length).toBeGreaterThan(0);
  });

  it("shows 'See all' when onSeeAll provided", () => {
    render(
      <HorizontalSection
        title="Trending Now"
        restaurants={mockRestaurants}
        onSeeAll={jest.fn()}
      />
    );
    expect(screen.getByText(/See all/)).toBeInTheDocument();
  });

  it("does not show 'See all' when onSeeAll not provided", () => {
    render(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    expect(screen.queryByText(/See all/)).not.toBeInTheDocument();
  });

  it("calls onSeeAll when clicked", async () => {
    const user = userEvent.setup();
    const handleSeeAll = jest.fn();
    render(
      <HorizontalSection
        title="Trending Now"
        restaurants={mockRestaurants}
        onSeeAll={handleSeeAll}
      />
    );
    await user.click(screen.getByText(/See all/));
    expect(handleSeeAll).toHaveBeenCalledTimes(1);
  });

  it("cards are in a scroll container", () => {
    const { container } = render(
      <HorizontalSection title="Trending Now" restaurants={mockRestaurants} />
    );
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
  });
});
