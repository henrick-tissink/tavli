/**
 * Google Geocoding wrapper. Always fail-soft: returns null on any error
 * (no key, network, ZERO_RESULTS, malformed payload). Listings still save
 * even when geocoding fails — the map just won't render.
 */
export interface Coords {
  lat: number;
  lng: number;
}

function getKey(): string | null {
  const key =
    process.env.GOOGLE_GEOCODING_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!key) return null;
  if (
    key === "" ||
    key === "REPLACE_ME" ||
    key === "your-google-maps-embed-key"
  ) {
    return null;
  }
  return key;
}

export async function geocode(address: string): Promise<Coords | null> {
  if (!address || address.trim() === "") return null;
  const key = getKey();
  if (!key) return null;

  const params = new URLSearchParams({ address, key });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    if (body.status !== "OK") return null;
    const loc = body.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      return null;
    }
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}
