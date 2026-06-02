import { render, screen } from "@testing-library/react";
import { MenuItemCard } from "../menu-item-card";
import type { MenuItem } from "@/lib/types";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roMenu from "@/messages/ro/menu.json";

function renderCard(props: React.ComponentProps<typeof MenuItemCard>) {
  return render(
    <MessagesProvider locale="ro" bundle={{ menu: roMenu }}>
      <MenuItemCard {...props} />
    </MessagesProvider>,
  );
}

const baseItem: MenuItem = {
  id: "x",
  sectionId: "s",
  name: "Test Dish",
  description: "A lovely dish.",
  price: 42,
};

describe("MenuItemCard", () => {
  it("renders name, description and price", () => {
    renderCard({ item: baseItem, currency: "lei" });
    expect(screen.getByText("Test Dish")).toBeInTheDocument();
    expect(screen.getByText("A lovely dish.")).toBeInTheDocument();
    expect(screen.getByText("42 lei")).toBeInTheDocument();
  });

  it("shows popular tag", () => {
    renderCard({ item: { ...baseItem, tags: ["popular"] }, currency: "lei" });
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("shows chef-pick star but no chef-pick tag text", () => {
    renderCard({ item: { ...baseItem, tags: ["chef-pick"] }, currency: "lei" });
    expect(screen.getByLabelText("Recomandarea bucătarului")).toBeInTheDocument();
    expect(screen.queryByText("Recomandarea bucătarului", { selector: "span" })).not.toBeInTheDocument();
  });

  it("shows VG but hides V when item is vegan and vegetarian", () => {
    renderCard({ item: { ...baseItem, tags: ["vegan", "vegetarian"] }, currency: "lei" });
    expect(screen.getByText("VG")).toBeInTheDocument();
    expect(screen.queryByText("V", { selector: "span" })).not.toBeInTheDocument();
  });

  it("shows spicy tag", () => {
    renderCard({ item: { ...baseItem, tags: ["spicy"] }, currency: "lei" });
    expect(screen.getByText("Picant")).toBeInTheDocument();
  });

  it("omits description tags row when no tags", () => {
    const { container } = renderCard({ item: baseItem, currency: "lei" });
    // No tag pills should exist
    expect(container.querySelectorAll("span.rounded-full").length).toBe(0);
  });
});
