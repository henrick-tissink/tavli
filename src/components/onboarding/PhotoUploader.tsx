"use client";

import Image from "next/image";
import { useCallback, useState, useTransition } from "react";
import { Upload, Trash2, Star } from "lucide-react";
import { resolvePhotoUrl } from "@/lib/storage";
import {
  uploadRestaurantPhoto,
  setPhotoHero,
  deletePhoto,
} from "@/app/api/photos/actions";

export interface PhotoRow {
  id: string;
  storagePath: string;
  kind: "hero" | "gallery" | "dish" | "venue";
  sortOrder: number;
}

interface Props {
  restaurantId: string;
  initialPhotos: PhotoRow[];
  maxPhotos?: number;
}

export function PhotoUploader({
  restaurantId,
  initialPhotos,
  maxPhotos = 12,
}: Props) {
  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);

      const toUpload = Array.from(files).slice(0, maxPhotos - photos.length);

      for (const file of toUpload) {
        if (!file.type.startsWith("image/")) {
          setError(`${file.name} nu este o imagine.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} depășește 10 MB.`);
          continue;
        }

        const fd = new FormData();
        fd.append("restaurantId", restaurantId);
        fd.append("kind", "gallery");
        fd.append("file", file);

        const result = await uploadRestaurantPhoto(fd);
        if (!result.ok || !result.photo) {
          setError(`${file.name}: ${result.error ?? "încărcarea a eșuat"}`);
          continue;
        }
        setPhotos((prev) => [...prev, result.photo!]);
      }

      setUploading(false);
    },
    [photos, restaurantId, maxPhotos],
  );

  const handleDelete = useCallback(
    (photo: PhotoRow) => {
      if (!confirm("Ștergi această fotografie?")) return;
      startTransition(async () => {
        const result = await deletePhoto(photo.id);
        if (!result.ok) {
          setError(result.error ?? "Nu s-a putut șterge.");
        } else {
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        }
      });
    },
    [],
  );

  const handleSetHero = useCallback(
    (photo: PhotoRow) => {
      startTransition(async () => {
        const result = await setPhotoHero(photo.id);
        if (!result.ok) {
          setError(result.error ?? "Nu s-a putut seta fotografia principală.");
        } else {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photo.id
                ? { ...p, kind: "hero" }
                : p.kind === "hero"
                  ? { ...p, kind: "gallery" }
                  : p,
            ),
          );
        }
      });
    },
    [],
  );

  return (
    <div className="space-y-5">
      <label
        className={`relative block rounded-card border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          uploading
            ? "border-brand-primary bg-brand-primary-soft"
            : "border-border hover:border-brand-primary hover:bg-surface-bg"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onFilesSelected(e.target.files)}
          className="sr-only"
          disabled={uploading || photos.length >= maxPhotos}
        />
        <Upload size={24} className="mx-auto text-text-muted" />
        <p className="font-semibold text-text-primary mt-2">
          {uploading ? "Se încarcă…" : "Adaugă fotografii"}
        </p>
        <p className="text-xs text-text-muted mt-1">
          JPEG / PNG / WebP / AVIF, până la 10 MB fiecare. {photos.length}/
          {maxPhotos} folosite.
        </p>
      </label>

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 desktop:grid-cols-3 gap-3">
          {photos.map((photo) => {
            const url = resolvePhotoUrl(photo.storagePath);
            const isHero = photo.kind === "hero";
            return (
              <div
                key={photo.id}
                className="relative rounded-card overflow-hidden bg-surface-bg aspect-[4/3] border border-border"
              >
                {url && (
                  <Image
                    src={url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 200px, 50vw"
                  />
                )}
                {isHero && (
                  <span className="absolute top-2 left-2 bg-brand-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Star size={10} className="fill-white" /> Principală
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {!isHero && (
                    <button
                      type="button"
                      onClick={() => handleSetHero(photo)}
                      aria-label="Setează ca principală"
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    aria-label="Șterge fotografia"
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
