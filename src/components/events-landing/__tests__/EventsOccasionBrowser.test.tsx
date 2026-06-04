import { render, screen, fireEvent } from "@testing-library/react";
import { EventsOccasionBrowser } from "../EventsOccasionBrowser";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import enEvents from "@/messages/en/events.json";
import enDiscovery from "@/messages/en/discovery.json";
import type { EventOccasion, Restaurant } from "@/lib/types";

// jsdom lacks scrollIntoView; the grid calls it on selection.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

function venue(
  id: string,
  name: string,
  acceptedOccasions?: EventOccasion[],
): Restaurant {
  return {
    id,
    slug: id,
    name,
    cuisines: [],
    priceLevel: 2,
    zone: "Centru",
    city: "Bucharest",
    rating: 4.5,
    voteCount: 10,
    photoUrl: null,
    photoCount: 0,
    status: "open",
    availableSlots: [],
    acceptedOccasions,
  };
}

function setup(venues: Restaurant[]) {
  return render(
    <MessagesProvider
      locale="en"
      bundle={{ events: enEvents, discovery: enDiscovery }}
    >
      <EventsOccasionBrowser venues={venues} city="bucuresti" cityName="Bucharest" />
    </MessagesProvider>,
  );
}

const venues = [
  venue("alpha", "Alpha", ["wedding"]),
  venue("beta", "Beta", ["birthday"]),
  venue("gamma", "Gamma"), // no occasions ⇒ accepts all
];

const card = (name: string) =>
  screen.queryByRole("heading", { level: 3, name });

describe("EventsOccasionBrowser", () => {
  it("shows every venue before any occasion is chosen", () => {
    setup(venues);
    expect(card("Alpha")).toBeInTheDocument();
    expect(card("Beta")).toBeInTheDocument();
    expect(card("Gamma")).toBeInTheDocument();
  });

  it("filters to venues accepting the occasion; venues with no occasions stay (accept all)", () => {
    setup(venues);
    fireEvent.click(screen.getByRole("button", { name: /Wedding/ }));
    expect(card("Alpha")).toBeInTheDocument(); // accepts wedding
    expect(card("Beta")).not.toBeInTheDocument(); // birthday only
    expect(card("Gamma")).toBeInTheDocument(); // accepts all
    expect(screen.getByText("Wedding venues in Bucharest")).toBeInTheDocument();
  });

  it("shows the empty state when no venue accepts the occasion", () => {
    setup([venue("alpha", "Alpha", ["wedding"]), venue("beta", "Beta", ["birthday"])]);
    fireEvent.click(screen.getByRole("button", { name: /Product launch/ }));
    expect(card("Alpha")).not.toBeInTheDocument();
    expect(card("Beta")).not.toBeInTheDocument();
    expect(screen.getByText(/No venues for this occasion yet/)).toBeInTheDocument();
  });

  it("toggles the filter off when the active occasion is clicked again", () => {
    setup(venues);
    const wedding = screen.getByRole("button", { name: /Wedding/ });
    fireEvent.click(wedding);
    expect(card("Beta")).not.toBeInTheDocument();
    fireEvent.click(wedding);
    expect(card("Beta")).toBeInTheDocument();
  });
});
