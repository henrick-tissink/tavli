import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MapCarousel } from "../map-carousel";
import type { Restaurant } from "@/lib/types";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

// MapCarousel renders TimeSlotPills, which reads useT("booking").
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ booking: roBooking }}>
      {ui}
    </MessagesProvider>,
  );
}

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

const mockRestaurants: Restaurant[] = [
  {
    id: "1",
    slug: "test-one",
    name: "Test Restaurant One",
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
  },
  {
    id: "2",
    slug: "test-two",
    name: "Test Restaurant Two",
    cuisines: ["Japanese"],
    priceLevel: 3,
    zone: "Nord",
    city: "București",
    rating: 4.8,
    voteCount: 200,
    photoUrl: null,
    photoCount: 0,
    status: "open",
    availableSlots: ["20:00"],
  },
];

describe("MapCarousel", () => {
  it("renders restaurant names", () => {
    render(
      <MapCarousel
        restaurants={mockRestaurants}
        selectedId={null}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Test Restaurant One" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test Restaurant Two" })).toBeInTheDocument();
  });

  it("highlights selected card with ring", () => {
    render(
      <MapCarousel
        restaurants={mockRestaurants}
        selectedId="1"
        onSelect={jest.fn()}
      />,
    );
    const card = screen.getByRole("heading", { name: "Test Restaurant One" }).closest("[data-restaurant-id]");
    expect(card?.className).toContain("ring-2");
    expect(card?.className).toContain("ring-brand-primary");
  });

  it("does not highlight unselected card", () => {
    render(
      <MapCarousel
        restaurants={mockRestaurants}
        selectedId="1"
        onSelect={jest.fn()}
      />,
    );
    const card = screen.getByRole("heading", { name: "Test Restaurant Two" }).closest("[data-restaurant-id]");
    expect(card?.className).not.toContain("ring-2");
  });
});
