"use client";

import { MapPin } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

interface MapFabProps {
  onClick: () => void;
}

export function MapFab({ onClick }: MapFabProps) {
  const t = useT("ui");
  return (
    <button
      type="button"
      aria-label={t("openMap")}
      className="fixed bottom-24 right-4 w-12 h-12 bg-brand-primary text-white shadow-floating rounded-full flex items-center justify-center desktop:hidden z-50"
      onClick={onClick}
    >
      <MapPin size={20} />
    </button>
  );
}
