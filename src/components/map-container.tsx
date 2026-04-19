"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const PLACEHOLDER_TOKEN = "pk.placeholder_token_replace_with_real";

interface MapContainerProps {
  center: [number, number];
  zoom: number;
  onMapReady?: (map: mapboxgl.Map) => void;
  className?: string;
  children?: ReactNode;
  style?: string;
}

export function MapContainer({
  center,
  zoom,
  onMapReady,
  className,
  children,
  style: mapStyle = "mapbox://styles/mapbox/light-v11",
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasValidToken = !!token && token !== PLACEHOLDER_TOKEN;

  useEffect(() => {
    if (!hasValidToken) return;
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token ?? "";

    try {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapStyle,
        center,
        zoom,
      });

      mapRef.current = map;

      map.on("load", () => {
        onMapReady?.(map);
      });
    } catch (err) {
      console.error("Failed to initialize Mapbox map:", err);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={containerRef} data-testid="map-container" className="w-full h-full" />
      {!hasValidToken && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-bg p-8 text-center pointer-events-none">
          <MapPin className="text-text-muted mb-3" size={40} />
          <h3 className="font-bold text-text-primary mb-1">Map preview unavailable</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Set{" "}
            <code className="text-xs bg-surface-white px-1 rounded">
              NEXT_PUBLIC_MAPBOX_TOKEN
            </code>{" "}
            in{" "}
            <code className="text-xs bg-surface-white px-1 rounded">.env.local</code>{" "}
            to enable the live map.
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
