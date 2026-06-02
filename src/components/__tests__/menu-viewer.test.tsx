import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuViewer } from "../menu-viewer";
import type { Menu, Restaurant } from "@/lib/types";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";

// JSDOM lacks IntersectionObserver
class IOMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
beforeAll(() => {
  // @ts-expect-error test shim
  global.IntersectionObserver = IOMock;
  Element.prototype.scrollIntoView = jest.fn();
});

const restaurant: Restaurant = {
  id: "1",
  slug: "x",
  name: "Test Place",
  cuisines: ["Italian"],
  priceLevel: 2,
  zone: "Center",
  city: "București",
  rating: 4.5,
  voteCount: 100,
  photoUrl: null,
  photoCount: 0,
  status: "open",
  availableSlots: [],
};

const menu: Menu = {
  restaurantId: "1",
  currency: "lei",
  sections: [
    { id: "antipasti", name: "Antipasti" },
    { id: "primi", name: "Primi" },
  ],
  items: [
    {
      id: "a1",
      sectionId: "antipasti",
      name: "Bruschetta",
      description: "Toast.",
      price: 20,
    },
    {
      id: "p1",
      sectionId: "primi",
      name: "Carbonara",
      description: "Pasta.",
      price: 45,
    },
    {
      id: "p2",
      sectionId: "primi",
      name: "Cacio e Pepe",
      description: "Pasta.",
      price: 44,
    },
  ],
};

function renderViewer(props: React.ComponentProps<typeof MenuViewer>) {
  return render(
    <MessagesProvider locale="ro" bundle={{ discovery: roDiscovery }}>
      <MenuViewer {...props} />
    </MessagesProvider>,
  );
}

describe("MenuViewer", () => {
  it("renders all sections with counts", () => {
    renderViewer({ restaurant, menu, onBack: jest.fn() });
    expect(screen.getByRole("button", { name: /Antipasti \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Primi \(2\)/ })).toBeInTheDocument();
  });

  it("renders all items", () => {
    renderViewer({ restaurant, menu, onBack: jest.fn() });
    expect(screen.getByText("Bruschetta")).toBeInTheDocument();
    expect(screen.getByText("Carbonara")).toBeInTheDocument();
    expect(screen.getByText("Cacio e Pepe")).toBeInTheDocument();
  });

  it("fires onBack when back button clicked", async () => {
    const onBack = jest.fn();
    const user = userEvent.setup();
    renderViewer({ restaurant, menu, onBack });
    await user.click(screen.getByRole("button", { name: "Înapoi" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows item count in header", () => {
    renderViewer({ restaurant, menu, onBack: jest.fn() });
    expect(screen.getByText(/3 feluri/)).toBeInTheDocument();
  });
});
