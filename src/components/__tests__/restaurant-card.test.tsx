import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestaurantCard } from "../restaurant-card";
import type { Restaurant } from "@/lib/types";
import { freezeClock, unfreezeClock } from "@/test-support/clock";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";

function renderCard(props: React.ComponentProps<typeof RestaurantCard>) {
  return render(
    <MessagesProvider locale="ro" bundle={{ discovery: roDiscovery }}>
      <RestaurantCard {...props} />
    </MessagesProvider>,
  );
}

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
  // Card renders TimeSlotPills (default past-slot filter); freeze to morning so
  // the evening test slots are never filtered out by the wall clock.
  beforeEach(() => freezeClock());
  afterEach(() => unfreezeClock());

  it("renders restaurant name", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByText("La Mama")).toBeInTheDocument();
  });

  it("renders cuisine, price label, and zone", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByText(/Românească · \$\$ · Old Town/)).toBeInTheDocument();
  });

  it("renders rating badge (the number 4.8)", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    const ratings = screen.getAllByText("4.8");
    expect(ratings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders open status", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByText("Deschis acum")).toBeInTheDocument();
  });

  it("renders time slots limited to 4 visible with More arrow", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("19:30")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getByText("20:30")).toBeInTheDocument();
    expect(screen.queryByText("21:00")).not.toBeInTheDocument();
    expect(screen.getByText("Mai multe →")).toBeInTheDocument();
  });

  it("renders review snippet with fire emoji and dimension percentage", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(
      screen.getByText(/Best sarmale in town/)
    ).toBeInTheDocument();
    expect(screen.getByText(/95% au adorat atmosphere/)).toBeInTheDocument();
  });

  it("renders photo count", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByText(/📸 42/)).toBeInTheDocument();
  });

  it("renders fallback when photoUrl is null", () => {
    const noPhoto = { ...baseRestaurant, photoUrl: null };
    renderCard({ restaurant: noPhoto, onSlotSelect: jest.fn() });
    // Fallback shows restaurant name in large text inside gradient
    const names = screen.getAllByText("La Mama");
    expect(names.length).toBeGreaterThanOrEqual(2); // one in fallback, one in info
  });

  it("renders Closed badge when status is closed", () => {
    const closed = { ...baseRestaurant, status: "closed" as const, opensAt: "12:00" };
    renderCard({ restaurant: closed, onSlotSelect: jest.fn() });
    expect(screen.getByText("Închis")).toBeInTheDocument();
  });

  it("renders save button with aria-label Save {name}", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    expect(screen.getByLabelText("Salvează La Mama")).toBeInTheDocument();
  });

  it("shows voteCount reviews fallback when no review snippet", () => {
    const noSnippet = {
      ...baseRestaurant,
      reviewSnippet: undefined,
      topDimensionPercent: undefined,
      topDimensionLabel: undefined,
    };
    renderCard({ restaurant: noSnippet, onSlotSelect: jest.fn() });
    expect(screen.getByText("312 recenzii")).toBeInTheDocument();
  });

  it("calls onSave when save button clicked", async () => {
    const onSave = jest.fn();
    renderCard({ restaurant: baseRestaurant, saved: false, onSave, onSlotSelect: jest.fn() });
    await userEvent.click(screen.getByLabelText("Salvează La Mama"));
    expect(onSave).toHaveBeenCalledWith("r1");
  });

  it("exposes a keyboard-accessible primary action (stretched button), not a nested-interactive card", () => {
    const { container } = renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    const card = container.firstChild as HTMLElement;
    // a11y fix: the card container is no longer role=button (which nested the
    // save button + slot pills inside an interactive). The primary action is a
    // real <button> that's keyboard-focusable.
    expect(card).not.toHaveAttribute("role", "button");
    expect(screen.getByLabelText("Vezi La Mama")).toBeInTheDocument();
  });

  it("invokes onClick via the stretched primary action", async () => {
    const onClick = jest.fn();
    renderCard({ restaurant: baseRestaurant, onClick, onSlotSelect: jest.fn() });
    await userEvent.click(screen.getByLabelText("Vezi La Mama"));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("time slot click does not propagate to card onClick", async () => {
    const onClick = jest.fn();
    const onSlotSelect = jest.fn();
    renderCard({
      restaurant: baseRestaurant,
      onClick,
      onSlotSelect,
    });
    await userEvent.click(screen.getByText("19:00"));
    expect(onSlotSelect).toHaveBeenCalledWith("r1", "19:00");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses text-[17px] for card title", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    const title = screen.getByText("La Mama");
    expect(title).toHaveClass("text-[17px]");
  });

  it("uses text-xs for cuisine/zone row", () => {
    renderCard({ restaurant: baseRestaurant, onSlotSelect: jest.fn() });
    const row = screen.getByText(/Românească · \$\$ · Old Town/);
    expect(row).toHaveClass("text-xs");
  });
});
