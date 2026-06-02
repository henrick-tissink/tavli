import { render, screen } from "@testing-library/react";
import CityEventsPage from "../page";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";
import roEvents from "@/messages/ro/events.json";

jest.mock("@/lib/repos/restaurants-repo", () => ({
  listRestaurants: jest.fn().mockResolvedValue([
    {
      id: "1",
      slug: "x",
      name: "X",
      cuisines: [],
      priceLevel: 2,
      zone: "Centru",
      city: "București",
      rating: 4.6,
      voteCount: 30,
      photoUrl: null,
      photoCount: 0,
      status: "open",
      availableSlots: [],
    },
  ]),
}));

describe("CityEventsPage", () => {
  it("renders editorial hero, occasion grid and listing", async () => {
    const ui = await CityEventsPage({
      params: Promise.resolve({ lang: "ro", city: "bucuresti" }),
    });
    render(
      <MessagesProvider
        locale="ro"
        bundle={{ discovery: roDiscovery, events: roEvents }}
      >
        {ui}
      </MessagesProvider>,
    );
    expect(
      screen.getByText(/Momente memorabile, găzduite în Bucure/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Pentru ce moment cauți/)).toBeInTheDocument();
    expect(screen.getByText(/Toate locațiile/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "X" }),
    ).toBeInTheDocument();
  });
});
