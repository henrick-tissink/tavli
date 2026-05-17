import { render, screen } from "@testing-library/react";
import CityEventsPage from "../page";

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
  it("renders heading and listing", async () => {
    const ui = await CityEventsPage({
      params: Promise.resolve({ city: "bucuresti" }),
    });
    render(ui);
    expect(
      screen.getByText(/Locații pentru evenimente private/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "X" })).toBeInTheDocument();
  });
});
