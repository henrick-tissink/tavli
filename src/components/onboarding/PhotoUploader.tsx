"use client";

import Image from "next/image";
import { useCallback, useState, useTransition } from "react";
import { Upload, Trash2, Star } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { PHOTO_BUCKET, resolvePhotoUrl } from "@/lib/storage";

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
  const [_, startTransition] = useTransition();

  const hasHero = photos.some((p) => p.kind === "hero");

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);

      const supabase = createSupabaseBrowserClient();
      const toUpload = Array.from(files).slice(0, maxPhotos - photos.length);

      for (const file of toUpload) {
        if (!file.type.startsWith("image/")) {
          setError(`${file.name} isn't an image.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} is over 10 MB.`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          setError(`${file.name}: ${uploadErr.message}`);
          continue;
        }

        const shouldBeHero = !hasHero && photos.length === 0 && toUpload[0] === file;
        const maxSort = photos.reduce((m, p) => Math.max(m, p.sortOrder), -1);

        const { data: inserted, error: insertErr } = await supabase
          .from("restaurant_photos")
          .insert({
            restaurant_id: restaurantId,
            storage_path: path,
            kind: shouldBeHero ? "hero" : "gallery",
            sort_order: maxSort + 1,
          })
          .select("id, storage_path, kind, sort_order")
          .single();

        if (insertErr || !inserted) {
          setError(`${file.name}: ${insertErr?.message ?? "could not record"}`);
          continue;
        }

        setPhotos((prev) => [
          ...prev,
          {
            id: inserted.id,
            storagePath: inserted.storage_path,
            kind: inserted.kind,
            sortOrder: inserted.sort_order,
          },
        ]);
      }

      setUploading(false);
    },
    [photos, restaurantId, maxPhotos, hasHero],
  );

  const deletePhoto = useCallback(
    async (photo: PhotoRow) => {
      if (!confirm("Remove this photo?")) return;
      const supabase = createSupabaseBrowserClient();
      startTransition(async () => {
        await supabase.storage.from(PHOTO_BUCKET).remove([photo.storagePath]);
        await supabase.from("restaurant_photos").delete().eq("id", photo.id);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      });
    },
    [],
  );

  const setHero = useCallback(
    async (photo: PhotoRow) => {
      const supabase = createSupabaseBrowserClient();
      startTransition(async () => {
        const currentHero = photos.find((p) => p.kind === "hero");
        if (currentHero) {
          await supabase
            .from("restaurant_photos")
            .update({ kind: "gallery" })
            .eq("id", currentHero.id);
        }
        await supabase
          .from("restaurant_photos")
          .update({ kind: "hero" })
          .eq("id", photo.id);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? { ...p, kind: "hero" }
              : p.kind === "hero"
                ? { ...p, kind: "gallery" }
                : p,
          ),
        );
      });
    },
    [photos],
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
          {uploading ? "Uploading…" : "Add photos"}
        </p>
        <p className="text-xs text-text-muted mt-1">
          JPEG / PNG / WebP / AVIF, up to 10 MB each.{" "}
          {photos.length}/{maxPhotos} used.
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
                    <Star size={10} className="fill-white" /> Hero
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {!isHero && (
                    <button
                      type="button"
                      onClick={() => setHero(photo)}
                      aria-label="Set as hero"
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deletePhoto(photo)}
                    aria-label="Delete photo"
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
