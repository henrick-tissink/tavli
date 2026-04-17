"use client";

import { useRef, useEffect, type ReactNode } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn("Mapbox token not set — map will not render tiles.");
    }

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
      {children}
    </div>
  );
}
