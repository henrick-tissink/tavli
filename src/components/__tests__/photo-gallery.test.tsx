import { render, screen, fireEvent } from "@testing-library/react";
import { PhotoGallery } from "../photo-gallery";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roRestaurant from "@/messages/ro/restaurant.json";

// jsdom doesn't implement Element.prototype.scrollTo; the gallery calls it to
// advance. Stub it so interaction tests can assert navigation was triggered.
beforeAll(() => {
  Element.prototype.scrollTo = jest.fn();
});

function renderGallery(props: React.ComponentProps<typeof PhotoGallery>) {
  return render(
    <MessagesProvider locale="ro" bundle={{ restaurant: roRestaurant }}>
      <PhotoGallery {...props} />
    </MessagesProvider>,
  );
}

// Mock next/image to render a plain img
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // next/image uses fill prop instead of width/height; render a simple img
    const { fill, ...rest } = props;
    return <img {...rest} />;
  },
}));

const photos = [
  "https://images.unsplash.com/photo-1?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-2?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-3?w=800&h=600&fit=crop",
];

describe("PhotoGallery", () => {
  it("renders photos", () => {
    renderGallery({ photos, restaurantName: "Test Restaurant" });
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(3);
  });

  it("renders dot indicators", () => {
    renderGallery({ photos, restaurantName: "Test Restaurant" });
    const dots = screen.getAllByTestId("gallery-dot");
    expect(dots).toHaveLength(3);
  });

  it("renders back, save, and share buttons", () => {
    const onBack = jest.fn();
    const onSave = jest.fn();
    const onShare = jest.fn();
    renderGallery({
      photos,
      restaurantName: "Test Restaurant",
      onBack,
      onSave,
      onShare,
    });
    expect(screen.getByLabelText("Înapoi")).toBeInTheDocument();
    expect(screen.getByLabelText("Salvează")).toBeInTheDocument();
    expect(screen.getByLabelText("Trimite")).toBeInTheDocument();
  });

  it("dots are clickable navigation controls (not passive indicators)", () => {
    renderGallery({ photos, restaurantName: "Test Restaurant" });
    const dotButtons = screen.getAllByRole("button", { name: /Mergi la fotografia/ });
    expect(dotButtons).toHaveLength(3);
    (Element.prototype.scrollTo as jest.Mock).mockClear();
    fireEvent.click(dotButtons[2]);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("renders prev/next arrow affordances when there is more than one photo", () => {
    renderGallery({ photos, restaurantName: "Test Restaurant" });
    expect(screen.getByLabelText("Fotografia anterioară")).toBeInTheDocument();
    const next = screen.getByLabelText("Fotografia următoare");
    (Element.prototype.scrollTo as jest.Mock).mockClear();
    fireEvent.click(next);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("shows no arrows for a single photo", () => {
    renderGallery({ photos: [photos[0]], restaurantName: "Test Restaurant" });
    expect(screen.queryByLabelText("Fotografia următoare")).not.toBeInTheDocument();
  });

  it("shows fallback when photos array is empty", () => {
    renderGallery({ photos: [], restaurantName: "Test Restaurant" });
    expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
