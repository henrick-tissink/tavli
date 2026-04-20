import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuItemDetailSheet } from "../menu-item-detail-sheet";
import type { MenuItem, MenuSection } from "@/lib/types";

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill, ...props }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img data-fill={fill ? "true" : undefined} {...props} />;
  },
}));

const baseItem: MenuItem = {
  id: "main",
  sectionId: "primi",
  name: "Carbonara",
  description: "Eggs, guanciale, pecorino, black pepper.",
  price: 48,
  photoUrl: "https://example.com/carbonara.jpg",
};

const section: MenuSection = {
  id: "primi",
  name: "Primi",
};

const sibling1: MenuItem = {
  id: "s1",
  sectionId: "primi",
  name: "Cacio e Pepe",
  description: "Pasta, cheese, pepper.",
  price: 44,
  photoUrl: "https://example.com/cacio.jpg",
};

const sibling2: MenuItem = {
  id: "s2",
  sectionId: "primi",
  name: "Amatriciana",
  description: "Tomato, guanciale, pecorino.",
  price: 46,
  photoUrl: "https://example.com/amatriciana.jpg",
};

describe("MenuItemDetailSheet", () => {
  it("renders name, price, and description when open with item", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.getByText("Carbonara")).toBeInTheDocument();
    expect(screen.getByText("48 lei")).toBeInTheDocument();
    expect(
      screen.getByText("Eggs, guanciale, pecorino, black pepper."),
    ).toBeInTheDocument();
  });

  it("renders all visible dietary tags", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={{
          ...baseItem,
          tags: ["popular", "vegetarian", "gluten-free", "spicy"],
        }}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.getByText("Popular")).toBeInTheDocument();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("GF")).toBeInTheDocument();
    expect(screen.getByText("Spicy")).toBeInTheDocument();
  });

  it("shows VG but hides V when item is vegan and vegetarian", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={{ ...baseItem, tags: ["vegan", "vegetarian"] }}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.getByText("VG")).toBeInTheDocument();
    expect(screen.queryByText("V", { selector: "span" })).not.toBeInTheDocument();
  });

  it("renders chef's-note pullquote when item has chef-pick tag", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={{ ...baseItem, tags: ["chef-pick"] }}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.getByText("Chef's note")).toBeInTheDocument();
    expect(
      screen.getByText(
        /signature dish — selected by the chef for what the kitchen does best/i,
      ),
    ).toBeInTheDocument();
    // Star prefix beside the name
    expect(screen.getByLabelText("Chef's pick")).toBeInTheDocument();
  });

  it("does NOT render chef's-note pullquote when item has no chef-pick tag", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.queryByText("Chef's note")).not.toBeInTheDocument();
  });

  it("renders 'More from {section.name}' heading when moreFromSection is non-empty", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[sibling1, sibling2]}
        currency="lei"
      />,
    );
    expect(screen.getByText("More from Primi")).toBeInTheDocument();
    expect(screen.getByText("Cacio e Pepe")).toBeInTheDocument();
    expect(screen.getByText("Amatriciana")).toBeInTheDocument();
  });

  it("does NOT render 'More from' block when moreFromSection is empty", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.queryByText(/More from/)).not.toBeInTheDocument();
  });

  it("clicking a 'More from' item calls onSelectItem with that item", async () => {
    const onSelectItem = jest.fn();
    const user = userEvent.setup();
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[sibling1, sibling2]}
        currency="lei"
        onSelectItem={onSelectItem}
      />,
    );
    await user.click(screen.getByText("Cacio e Pepe"));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    expect(onSelectItem).toHaveBeenCalledWith(sibling1);
  });

  it("renders nothing visible when open=false", () => {
    render(
      <MenuItemDetailSheet
        open={false}
        onClose={jest.fn()}
        item={baseItem}
        section={section}
        moreFromSection={[sibling1]}
        currency="lei"
      />,
    );
    expect(screen.queryByText("Carbonara")).not.toBeInTheDocument();
    expect(screen.queryByText("48 lei")).not.toBeInTheDocument();
  });

  it("renders nothing visible when item is null", () => {
    render(
      <MenuItemDetailSheet
        open
        onClose={jest.fn()}
        item={null}
        section={section}
        moreFromSection={[]}
        currency="lei"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
