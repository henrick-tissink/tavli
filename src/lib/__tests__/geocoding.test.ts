/**
 * @jest-environment node
 */

import { geocode } from "../geocoding";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_GEOCODING_KEY = "test-key";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function mockFetch(payload: unknown, status = 200) {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify(payload), { status }),
  ) as unknown as typeof fetch;
}

describe("geocode", () => {
  it("returns coords when status=OK", async () => {
    mockFetch({
      status: "OK",
      results: [
        { geometry: { location: { lat: 44.43, lng: 26.10 } } },
      ],
    });
    const result = await geocode("Str. Lipscani 45, București");
    expect(result).toEqual({ lat: 44.43, lng: 26.1 });
  });

  it("returns null on ZERO_RESULTS", async () => {
    mockFetch({ status: "ZERO_RESULTS", results: [] });
    const result = await geocode("Definitely not a real place 999");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error (4xx/5xx)", async () => {
    mockFetch({ error: "boom" }, 500);
    const result = await geocode("anywhere");
    expect(result).toBeNull();
  });

  it("returns null on network error — never throws", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    await expect(geocode("anywhere")).resolves.toBeNull();
  });

  it("returns null when no API key is configured", async () => {
    delete process.env.GOOGLE_GEOCODING_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
    mockFetch({
      status: "OK",
      results: [{ geometry: { location: { lat: 1, lng: 2 } } }],
    });
    const result = await geocode("Str. Lipscani 45, București");
    expect(result).toBeNull();
  });

  it("falls back to NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY when GOOGLE_GEOCODING_KEY is unset", async () => {
    delete process.env.GOOGLE_GEOCODING_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "embed-key";
    mockFetch({
      status: "OK",
      results: [{ geometry: { location: { lat: 1, lng: 2 } } }],
    });
    const result = await geocode("anywhere");
    expect(result).toEqual({ lat: 1, lng: 2 });
  });

  it("returns null for empty address", async () => {
    const result = await geocode("");
    expect(result).toBeNull();
  });
});
