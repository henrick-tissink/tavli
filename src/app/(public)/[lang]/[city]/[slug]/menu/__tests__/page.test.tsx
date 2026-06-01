import { render, screen } from "@testing-library/react";
import DinerMenuPage from "@/app/(public)/[lang]/[city]/[slug]/menu/page";

const notFoundMock = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const getRestaurantBySlugMock = jest.fn();
const getRestaurantDetailMock = jest.fn();
const getMenuMock = jest.fn();
jest.mock("@/lib/repos/restaurants-repo", () => ({
  getRestaurantBySlug: (slug: string) => getRestaurantBySlugMock(slug),
  getRestaurantDetail: (slug: string) => getRestaurantDetailMock(slug),
  getMenu: (slug: string) => getMenuMock(slug),
}));

const menuClientMock = jest.fn();
jest.mock("@/app/(public)/[lang]/[city]/[slug]/menu/MenuPageClient", () => ({
  MenuPageClient: (props: Record<string, unknown>) => {
    menuClientMock(props);
    return <div data-testid="menu-page-client" />;
  },
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
  photoUrl: "https://example.com/photo.jpg",
  photoCount: 1,
  status: "open" as const,
  availableSlots: [],
};

const detailFixture = {
  ...restaurantFixture,
  lat: null,
  lng: null,
  description: "",
  photos: ["https://example.com/photo.jpg"],
  schedule: [],
  address: "",
  tags: [],
  reviewIntelligence: null,
  reviews: [],
  nearby: [],
};

const menuFixture = {
  restaurantId: "r1",
  currency: "lei" as const,
  sections: [{ id: "s1", name: "Pasta" }],
  items: [
    {
      id: "i1",
      sectionId: "s1",
      name: "Cacio e Pepe",
      description: "",
      price: 42,
    },
  ],
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
    getRestaurantBySlugMock.mockReset();
    getRestaurantDetailMock.mockReset();
    getMenuMock.mockReset();
    menuClientMock.mockReset();
  });

  test("happy path: renders Tavli wordmark, MenuPageClient with full props, and footer link", async () => {
    getRestaurantBySlugMock.mockResolvedValue(restaurantFixture);
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixture);
    await renderPage();
    expect(screen.getByTestId("tavli-wordmark")).toBeInTheDocument();
    expect(screen.getByTestId("menu-page-client")).toBeInTheDocument();
    expect(menuClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "bucuresti",
        slug: "trattoria-roma",
        restaurant: restaurantFixture,
        menu: menuFixture,
        heroPhoto: "https://example.com/photo.jpg",
      }),
    );
    const footerLink = screen.getByRole("link", { name: /tavli\.ro/i });
    expect(footerLink).toHaveAttribute("href", "/bucuresti/trattoria-roma");
  });

  test("Tavli wordmark at top is not a link", async () => {
    getRestaurantBySlugMock.mockResolvedValue(restaurantFixture);
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixture);
    const { container } = await renderPage();
    const wordmark = container.querySelector('[data-testid="tavli-wordmark"]');
    expect(wordmark).not.toBeNull();
    expect(wordmark!.tagName).not.toBe("A");
  });

  test("missing restaurant: calls notFound()", async () => {
    getRestaurantBySlugMock.mockResolvedValue(null);
    getRestaurantDetailMock.mockResolvedValue(null);
    getMenuMock.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
