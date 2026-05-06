"use client";

import { type ReactNode } from "react";
import { MapPin as MapPinIcon } from "lucide-react";
import { APIProvider, Map } from "@vis.gl/react-google-maps";

const MAP_ID = "tavli-map";
const PLACEHOLDER_VALUES = new Set([
  "",
  "your-google-maps-embed-key",
  "REPLACE_ME",
]);

interface MapContainerProps {
  /** [longitude, latitude] — kept Mapbox-style for backward compat with callers. */
  center: [number, number];
  zoom: number;
  className?: string;
  children?: ReactNode;
  /** Color scheme — Google supports `light` / `dark` via mapId or styles. */
  colorScheme?: "light" | "dark";
}

export function MapContainer({
  center,
  zoom,
  className,
  children,
  colorScheme = "light",
}: MapContainerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const hasValidKey = !!apiKey && !PLACEHOLDER_VALUES.has(apiKey);

  if (!hasValidKey) {
    return (
      <div className={className} style={{ position: "relative" }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-bg p-8 text-center pointer-events-none">
          <MapPinIcon className="text-text-muted mb-3" size={40} />
          <h3 className="font-bold text-text-primary mb-1">Map preview unavailable</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Set{" "}
            <code className="text-xs bg-surface-white px-1 rounded">
              NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY
            </code>{" "}
            to enable the live map.
          </p>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative" }}>
      <APIProvider apiKey={apiKey}>
        <Map
          mapId={MAP_ID}
          defaultCenter={{ lat: center[1], lng: center[0] }}
          defaultZoom={zoom}
          colorScheme={colorScheme.toUpperCase() as "LIGHT" | "DARK"}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          data-testid="map-container"
          style={{ width: "100%", height: "100%" }}
        >
          {children}
        </Map>
      </APIProvider>
    </div>
  );
}
