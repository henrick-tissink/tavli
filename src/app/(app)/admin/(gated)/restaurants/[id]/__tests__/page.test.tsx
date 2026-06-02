import { render, screen } from "@testing-library/react";

jest.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../actions", () => ({
  suspendRestaurant: jest.fn(),
  unsuspendRestaurant: jest.fn(),
}));
jest.mock("@/lib/i18n/app-locale", () => ({
  resolveAppLocale: jest.fn().mockResolvedValue("en"),
}));

import AdminRestaurantDetailPage from "../page";
import { createSupabaseServerClient } from "@/lib/db/server";

function mockRestaurant(restaurant: Record<string, unknown> | null) {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: restaurant }),
        }),
      }),
    }),
  });
}

describe("AdminRestaurantDetailPage", () => {
  it("renders restaurant name and cuisine when found", async () => {
    mockRestaurant({
      id: "r1",
      slug: "casa-veche",
      name: "Casa Veche",
      cuisines: ["Romanian"],
      status: "live",
      address: "Str. Lipscani 45",
      phone: "+40712345678",
      website_url: null,
      hero_note: null,
      photo_count: 3,
      vote_count: 0,
      rating: null,
      lat: 44.4,
      lng: 26.1,
      created_at: "2026-04-20T00:00:00Z",
      owner_user_id: "u1",
      cities: { name: "București", slug: "bucuresti" },
    });

    const ui = await AdminRestaurantDetailPage({
      params: Promise.resolve({ id: "r1" }),
    });
    render(ui);

    expect(screen.getByRole("heading", { name: "Casa Veche" })).toBeInTheDocument();
    expect(screen.getByText("Românească · București")).toBeInTheDocument();
    expect(screen.getByText("Str. Lipscani 45")).toBeInTheDocument();
  });

  it("renders 'Not found' when fetch returns null", async () => {
    mockRestaurant(null);

    const ui = await AdminRestaurantDetailPage({
      params: Promise.resolve({ id: "missing" }),
    });
    render(ui);

    expect(screen.getByText("Restaurant not found")).toBeInTheDocument();
  });

  it("links to public page only when status is live", async () => {
    mockRestaurant({
      id: "r1",
      slug: "draft-restaurant",
      name: "Draft",
      cuisines: ["Romanian"],
      status: "draft",
      address: null,
      phone: null,
      website_url: null,
      hero_note: null,
      photo_count: 0,
      vote_count: 0,
      rating: null,
      lat: null,
      lng: null,
      created_at: "2026-04-20T00:00:00Z",
      owner_user_id: null,
      cities: { name: "București", slug: "bucuresti" },
    });

    const ui = await AdminRestaurantDetailPage({
      params: Promise.resolve({ id: "r1" }),
    });
    render(ui);

    expect(screen.queryByText(/View public page/)).not.toBeInTheDocument();
  });
});
