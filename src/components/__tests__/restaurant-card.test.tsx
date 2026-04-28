import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestaurantCard } from "../restaurant-card";
import type { Restaurant } from "@/lib/types";

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill, ...props }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img data-fill={fill ? "true" : undefined} {...props} />;
  },
}));

const baseRestaurant: Restaurant = {
  id: "r1",
  slug: "la-mama",
  name: "La Mama",
  cuisines: ["Romanian"],
  priceLevel: 2,
  zone: "Old Town",
  city: "Bucharest",
  rating: 4.8,
  voteCount: 312,
  photoUrl: "https://example.com/photo.jpg",
  photoCount: 42,
  status: "open",
  closesAt: "23:00",
  availableSlots: ["19:00", "19:30", "20:00", "20:30", "21:00"],
  reviewSnippet: "Best sarmale in town",
  topDimensionLabel: "atmosphere",
  topDimensionPercent: 95,
};

describe("RestaurantCard", () => {
  it("renders restaurant name", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByText("La Mama")).toBeInTheDocument();
  });

  it("renders cuisine, price label, and zone", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByText(/Romanian · \$\$ · Old Town/)).toBeInTheDocument();
  });

  it("renders rating badge (the number 4.8)", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    const ratings = screen.getAllByText("4.8");
    expect(ratings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders open status", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByText("Open now")).toBeInTheDocument();
  });

  it("renders time slots limited to 4 visible with More arrow", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("19:30")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getByText("20:30")).toBeInTheDocument();
    expect(screen.queryByText("21:00")).not.toBeInTheDocument();
    expect(screen.getByText("More →")).toBeInTheDocument();
  });

  it("renders review snippet with fire emoji and dimension percentage", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(
      screen.getByText(/Best sarmale in town/)
    ).toBeInTheDocument();
    expect(screen.getByText(/95% loved the atmosphere/)).toBeInTheDocument();
  });

  it("renders photo count", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByText(/📸 42/)).toBeInTheDocument();
  });

  it("renders fallback when photoUrl is null", () => {
    const noPhoto = { ...baseRestaurant, photoUrl: null };
    render(<RestaurantCard restaurant={noPhoto} onSlotSelect={jest.fn()} />);
    // Fallback shows restaurant name in large text inside gradient
    const names = screen.getAllByText("La Mama");
    expect(names.length).toBeGreaterThanOrEqual(2); // one in fallback, one in info
  });

  it("renders Closed badge when status is closed", () => {
    const closed = { ...baseRestaurant, status: "closed" as const, opensAt: "12:00" };
    render(<RestaurantCard restaurant={closed} onSlotSelect={jest.fn()} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("renders save button with aria-label Save {name}", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    expect(screen.getByLabelText("Save La Mama")).toBeInTheDocument();
  });

  it("shows voteCount reviews fallback when no review snippet", () => {
    const noSnippet = {
      ...baseRestaurant,
      reviewSnippet: undefined,
      topDimensionPercent: undefined,
      topDimensionLabel: undefined,
    };
    render(<RestaurantCard restaurant={noSnippet} onSlotSelect={jest.fn()} />);
    expect(screen.getByText("312 reviews")).toBeInTheDocument();
  });

  it("calls onSave when save button clicked", async () => {
    const onSave = jest.fn();
    render(<RestaurantCard restaurant={baseRestaurant} saved={false} onSave={onSave} onSlotSelect={jest.fn()} />);
    await userEvent.click(screen.getByLabelText("Save La Mama"));
    expect(onSave).toHaveBeenCalledWith("r1");
  });

  it("has role=button and is keyboard accessible", () => {
    const { container } = render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("time slot click does not propagate to card onClick", async () => {
    const onClick = jest.fn();
    const onSlotSelect = jest.fn();
    render(
      <RestaurantCard
        restaurant={baseRestaurant}
        onClick={onClick}
        onSlotSelect={onSlotSelect}
      />
    );
    await userEvent.click(screen.getByText("19:00"));
    expect(onSlotSelect).toHaveBeenCalledWith("r1", "19:00");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses text-[17px] for card title", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    const title = screen.getByText("La Mama");
    expect(title).toHaveClass("text-[17px]");
  });

  it("uses text-xs for cuisine/zone row", () => {
    render(<RestaurantCard restaurant={baseRestaurant} onSlotSelect={jest.fn()} />);
    const row = screen.getByText(/Romanian · \$\$ · Old Town/);
    expect(row).toHaveClass("text-xs");
  });
});
