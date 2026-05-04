import { render, screen } from "@testing-library/react";
import DinerMenuPage from "@/app/[city]/[slug]/menu/page";

const notFoundMock = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const getRestaurantDetailMock = jest.fn();
const getMenuMock = jest.fn();
jest.mock("@/lib/repos/restaurants-repo", () => ({
  getRestaurantDetail: (slug: string) => getRestaurantDetailMock(slug),
  getMenu: (slug: string) => getMenuMock(slug),
}));

jest.mock("@/components/menu-viewer", () => ({
  MenuViewer: ({ menu }: { menu: { items: Array<{ name: string }> } }) => (
    <div data-testid="menu-viewer">
      {menu.items.map((i) => (
        <span key={i.name}>{i.name}</span>
      ))}
    </div>
  ),
}));

const detailFixture = {
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
  lat: null,
  lng: null,
  description: "",
  photos: [],
  schedule: [],
  address: "",
  tags: [],
  reviewIntelligence: null,
  reviews: [],
  nearby: [],
};

const menuFixtureWithItems = {
  restaurantId: "r1",
  currency: "lei" as const,
  sections: [{ id: "s1", name: "Pasta" }],
  items: [
    {
      id: "i1",
      sectionId: "s1",
      name: "Cacio e Pepe",
      description: "Pecorino, pepper, perfection",
      price: 42,
    },
  ],
};

const menuFixtureEmpty = {
  restaurantId: "r1",
  currency: "lei" as const,
  sections: [],
  items: [],
};

async function renderPage(citySlug = "bucuresti", slug = "trattoria-roma") {
  const Page = (await DinerMenuPage({
    params: Promise.resolve({ city: citySlug, slug }),
  })) as React.ReactElement;
  return render(Page);
}

describe("DinerMenuPage", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getRestaurantDetailMock.mockReset();
    getMenuMock.mockReset();
  });

  test("happy path: renders restaurant name, MenuViewer, and footer link to discovery page", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureWithItems);
    await renderPage();
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.getByTestId("menu-viewer")).toBeInTheDocument();
    expect(screen.getByText("Cacio e Pepe")).toBeInTheDocument();
    const footerLink = screen.getByRole("link", { name: /tavli\.ro/i });
    expect(footerLink).toHaveAttribute("href", "/bucuresti/trattoria-roma");
  });

  test("empty menu: renders 'Menu coming soon' placeholder instead of MenuViewer", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureEmpty);
    await renderPage();
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-viewer")).toBeNull();
    expect(screen.getByText(/menu coming soon/i)).toBeInTheDocument();
  });

  test("missing restaurant: calls notFound()", async () => {
    getRestaurantDetailMock.mockResolvedValue(null);
    getMenuMock.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  test("Tavli wordmark at top is not a link", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureWithItems);
    const { container } = await renderPage();
    const wordmark = container.querySelector('[data-testid="tavli-wordmark"]');
    expect(wordmark).not.toBeNull();
    expect(wordmark!.tagName).not.toBe("A");
  });
});
