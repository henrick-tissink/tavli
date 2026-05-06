import { render, screen } from "@testing-library/react";
import { PhotoGallery } from "../photo-gallery";

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
    render(<PhotoGallery photos={photos} restaurantName="Test Restaurant" />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(3);
  });

  it("renders dot indicators", () => {
    render(<PhotoGallery photos={photos} restaurantName="Test Restaurant" />);
    const dots = screen.getAllByTestId("gallery-dot");
    expect(dots).toHaveLength(3);
  });

  it("renders back, save, and share buttons", () => {
    const onBack = jest.fn();
    const onSave = jest.fn();
    const onShare = jest.fn();
    render(
      <PhotoGallery
        photos={photos}
        restaurantName="Test Restaurant"
        onBack={onBack}
        onSave={onSave}
        onShare={onShare}
      />
    );
    expect(screen.getByLabelText("Înapoi")).toBeInTheDocument();
    expect(screen.getByLabelText("Salvează")).toBeInTheDocument();
    expect(screen.getByLabelText("Trimite")).toBeInTheDocument();
  });

  it("shows fallback when photos array is empty", () => {
    render(<PhotoGallery photos={[]} restaurantName="Test Restaurant" />);
    expect(screen.getByText("Test Restaurant")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
