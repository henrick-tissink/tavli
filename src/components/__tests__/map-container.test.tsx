import { render, screen } from "@testing-library/react";
import { MapContainer } from "../map-container";

// Mock mapbox-gl
jest.mock("mapbox-gl", () => {
  const mockMap = {
    on: jest.fn(),
    remove: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      accessToken: "",
      Map: jest.fn(() => mockMap),
    },
  };
});

// Mock the CSS import
jest.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

describe("MapContainer", () => {
  it("renders a map container div", () => {
    render(<MapContainer center={[26.1025, 44.4268]} zoom={13} />);
    const div = screen.getByTestId("map-container");
    expect(div).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <MapContainer center={[26.1025, 44.4268]} zoom={13} className="h-screen" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("h-screen");
  });

  it("renders children", () => {
    render(
      <MapContainer center={[26.1025, 44.4268]} zoom={13}>
        <div data-testid="child-el">overlay</div>
      </MapContainer>,
    );
    expect(screen.getByTestId("child-el")).toBeInTheDocument();
  });
});
