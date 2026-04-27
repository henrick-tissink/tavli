import { render, screen } from "@testing-library/react";
import { GoogleMapEmbed } from "../google-map-embed";

describe("GoogleMapEmbed", () => {
  const originalKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = originalKey;
    }
  });

  test("renders an iframe pointing at the Google Maps Embed API when key is set", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "real-key-abc";
    const { container } = render(
      <GoogleMapEmbed lat={44.4323} lng={26.0966} name="Casa Veche" />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    const src = iframe!.getAttribute("src")!;
    expect(src).toContain("https://www.google.com/maps/embed/v1/place");
    expect(src).toContain("key=real-key-abc");
    expect(src).toContain("q=44.4323%2C26.0966");
    expect(iframe).toHaveAttribute("loading", "lazy");
  });

  test("iframe carries the restaurant name as title for accessibility", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "real-key-abc";
    render(<GoogleMapEmbed lat={44} lng={26} name="Casa Veche" />);
    expect(screen.getByTitle("Map of Casa Veche")).toBeInTheDocument();
  });

  test("renders nothing when the key env var is missing", () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
    const { container } = render(
      <GoogleMapEmbed lat={44} lng={26} name="X" />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when the key is the placeholder string", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "your-google-maps-embed-key";
    const { container } = render(
      <GoogleMapEmbed lat={44} lng={26} name="X" />,
    );
    expect(container.querySelector("iframe")).toBeNull();
  });
});
