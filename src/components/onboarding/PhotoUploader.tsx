"use client";

import Image from "next/image";
import { useCallback, useState, useTransition } from "react";
import { Upload, Trash2, Star } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { resolvePhotoUrl } from "@/lib/storage";
import { useT } from "@/lib/i18n/messages-provider";
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
  const t = useT("partner.common");
  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * Which tile's action is in flight. The transition's own `isPending` is a
   * single flag for the whole grid, so on its own it would either spin every
   * tile or (as before) nothing at all — pairing it with the photo id keeps
   * the feedback on the tile that was actually clicked.
   */
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);

      const toUpload = Array.from(files).slice(0, maxPhotos - photos.length);

      for (const file of toUpload) {
        if (!file.type.startsWith("image/")) {
          setError(t("photoUploader.notImage", { name: file.name }));
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(t("photoUploader.tooLarge", { name: file.name }));
          continue;
        }

        const fd = new FormData();
        fd.append("restaurantId", restaurantId);
        fd.append("kind", "gallery");
        fd.append("file", file);

        const result = await uploadRestaurantPhoto(fd);
        if (!result.ok || !result.photo) {
          setError(
            t("photoUploader.uploadFailed", {
              name: file.name,
              error: result.error ?? t("photoUploader.uploadFailedFallback"),
            }),
          );
          continue;
        }
        setPhotos((prev) => [...prev, result.photo!]);
      }

      setUploading(false);
    },
    [photos, restaurantId, maxPhotos, t],
  );

  const handleDelete = useCallback(
    (photo: PhotoRow) => {
      if (busyPhotoId) return;
      if (!confirm(t("photoUploader.deleteConfirm"))) return;
      setBusyPhotoId(photo.id);
      startTransition(async () => {
        try {
          const result = await deletePhoto(photo.id);
          if (!result.ok) {
            setError(result.error ?? t("photoUploader.deleteFailed"));
          } else {
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
          }
        } finally {
          setBusyPhotoId(null);
        }
      });
    },
    [busyPhotoId, t],
  );

  const handleSetHero = useCallback(
    (photo: PhotoRow) => {
      if (busyPhotoId) return;
      setBusyPhotoId(photo.id);
      startTransition(async () => {
        try {
          const result = await setPhotoHero(photo.id);
          if (!result.ok) {
            setError(result.error ?? t("photoUploader.setHeroFailed"));
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
        } finally {
          setBusyPhotoId(null);
        }
      });
    },
    [busyPhotoId, t],
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
          {uploading
            ? t("photoUploader.uploading")
            : t("photoUploader.addPhotos")}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {t("photoUploader.hint", { used: photos.length, max: maxPhotos })}
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
            // Disabled + aria-busy carry the state on their own: the spinner is
            // frozen under prefers-reduced-motion.
            const tileBusy = isPending && busyPhotoId === photo.id;
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
                    <Star size={10} className="fill-white" />{" "}
                    {t("photoUploader.heroBadge")}
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {!isHero && (
                    <button
                      type="button"
                      onClick={() => handleSetHero(photo)}
                      disabled={tileBusy}
                      aria-busy={tileBusy || undefined}
                      aria-label={t("photoUploader.setHeroAriaLabel")}
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-black/50"
                    >
                      {tileBusy ? <Spinner size={12} /> : <Star size={12} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    disabled={tileBusy}
                    aria-busy={tileBusy || undefined}
                    aria-label={t("photoUploader.deleteAriaLabel")}
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-black/50"
                  >
                    {tileBusy ? <Spinner size={12} /> : <Trash2 size={12} />}
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
