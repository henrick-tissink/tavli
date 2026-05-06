import { render, screen } from "@testing-library/react";
import { MapContainer } from "../map-container";

// Mock @vis.gl/react-google-maps so the component renders synchronously in jsdom
jest.mock("@vis.gl/react-google-maps", () => ({
  __esModule: true,
  APIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Map: ({
    children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid="map-container" {...rest}>
      {children}
    </div>
  ),
}));

const ORIGINAL_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

describe("MapContainer", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "test-key";
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = ORIGINAL_KEY;
  });

  it("renders a map container div when key is set", () => {
    render(<MapContainer center={[26.1025, 44.4268]} zoom={13} />);
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MapContainer center={[26.1025, 44.4268]} zoom={13} className="h-screen" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("h-screen");
  });

  it("renders children inside the map", () => {
    render(
      <MapContainer center={[26.1025, 44.4268]} zoom={13}>
        <div data-testid="child-el">overlay</div>
      </MapContainer>,
    );
    expect(screen.getByTestId("child-el")).toBeInTheDocument();
  });

  it("shows fallback when no API key is set", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "";
    render(<MapContainer center={[26.1025, 44.4268]} zoom={13} />);
    expect(screen.getByText(/Map preview unavailable/i)).toBeInTheDocument();
  });
});
