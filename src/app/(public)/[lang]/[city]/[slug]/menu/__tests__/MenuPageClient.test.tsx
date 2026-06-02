import { render, screen } from "@testing-library/react";
import { MenuPageClient } from "@/app/(public)/[lang]/[city]/[slug]/menu/MenuPageClient";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/menu-viewer", () => ({
  MenuViewer: () => <div data-testid="menu-viewer-stub" />,
}));

const restaurantFixture = {
  id: "r1",
  slug: "trattoria-roma",
  name: "Trattoria Roma",
  cuisines: ["Italian"],
  priceLevel: 2 as const,
  zone: "Centro",
  city: "București",
  rating: 4.5,
  voteCount: 12,
  photoUrl: null,
  photoCount: 0,
  status: "open" as const,
  availableSlots: [],
};

describe("MenuPageClient", () => {
  test("renders the empty-menu state when menu is null", () => {
    render(
      <MenuPageClient
        city="bucuresti"
        slug="trattoria-roma"
        restaurant={restaurantFixture}
        menu={null}
      />,
    );
    expect(screen.getByText(/menu coming soon/i)).toBeInTheDocument();
    expect(
      screen.getByText(/please ask your server for a printed copy/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("menu-viewer-stub")).toBeNull();
  });

  test("renders MenuViewer when menu is non-null", () => {
    const menu = {
      restaurantId: "r1",
      currency: "lei" as const,
      sections: [{ id: "s1", name: "Pasta" }],
      items: [],
    };
    render(
      <MenuPageClient
        city="bucuresti"
        slug="trattoria-roma"
        restaurant={restaurantFixture}
        menu={menu}
      />,
    );
    expect(screen.getByTestId("menu-viewer-stub")).toBeInTheDocument();
    expect(screen.queryByText(/menu coming soon/i)).toBeNull();
  });
});
