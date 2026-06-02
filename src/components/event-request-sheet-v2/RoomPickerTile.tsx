"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import type { PrivateSpaceTile } from "./types";

interface Props {
  space: PrivateSpaceTile;
  selected: boolean;
  partySize: number;
  publicPhotoUrl: (storagePath: string | null) => string | null;
  onPick: (id: string) => void;
}

/**
 * Visual picker tile for a single private space. Shows the photo (when
 * available), capacity range, and a "Potrivit pentru N persoane" hint when
 * the current party size lands inside the room's range.
 */
export function RoomPickerTile({
  space,
  selected,
  partySize,
  publicPhotoUrl,
  onPick,
}: Props) {
  const t = useT("events");
  const fits = partySize >= space.capacityMin && partySize <= space.capacityMax;
  const photo = publicPhotoUrl(space.photoStoragePath);
  return (
    <button
      type="button"
      onClick={() => onPick(space.id)}
      aria-pressed={selected}
      className={`relative rounded-card overflow-hidden text-left border-2 transition-all ${
        selected
          ? "border-brand-primary shadow-card-hover"
          : "border-border hover:border-text-muted"
      }`}
    >
      <div className="relative aspect-[4/3] bg-surface-bg">
        {photo ? (
          <Image src={photo} alt={space.name} fill className="object-cover" unoptimized />
        ) : null}
        {selected && (
          <span className="absolute top-2 right-2 bg-brand-primary text-surface-white rounded-full p-1">
            <Check className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="block font-semibold text-text-primary">{space.name}</span>
        <span className="block text-xs text-text-secondary mt-0.5">
          {t("roomPicker.capacityRange", {
            capacityMin: space.capacityMin,
            capacityMax: space.capacityMax,
          })}
        </span>
        {fits && (
          <span className="inline-block mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color:var(--color-occasion-product-soft)] text-[color:var(--color-occasion-product)]">
            {t("roomPicker.fits", { count: partySize, partySize })}
          </span>
        )}
      </div>
    </button>
  );
}
