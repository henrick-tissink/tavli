interface GoogleMapEmbedProps {
  lat: number | null;
  lng: number | null;
  name: string;
  className?: string;
  /**
   * Localized iframe title for screen readers. Defaults to the RO-source
   * `Map of {name}` label when the caller omits it.
   */
  title?: string;
}

const PLACEHOLDER_VALUES = new Set([
  "",
  "your-google-maps-embed-key",
  "REPLACE_ME",
]);

export function GoogleMapEmbed({ lat, lng, name, className, title }: GoogleMapEmbedProps) {
  if (lat == null || lng == null) return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!key || PLACEHOLDER_VALUES.has(key)) return null;

  const params = new URLSearchParams({
    key,
    q: `${lat},${lng}`,
  });
  const src = `https://www.google.com/maps/embed/v1/place?${params.toString()}`;

  return (
    <iframe
      title={title ?? `Map of ${name}`}
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
      className={className ?? "w-full aspect-[16/10] rounded-card border-0"}
    />
  );
}
