import { render, screen } from "@testing-library/react";
import { PhotoGallery } from "../photo-gallery";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roRestaurant from "@/messages/ro/restaurant.json";

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

  it("shows fallback when photos array is empty", () => {
    renderGallery({ photos: [], restaurantName: "Test Restaurant" });
    expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
