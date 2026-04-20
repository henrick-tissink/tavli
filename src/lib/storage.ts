/**
 * Resolve a storage_path stored on restaurant_photos / menu_items into
 * a fully-qualified URL for next/image.
 *
 * Values like `https://images.unsplash.com/...` are passed through (the
 * seed script writes Unsplash URLs directly to cut scope on upload in
 * dev). Relative paths are treated as bucket-relative and resolved
 * through the Supabase public URL.
 */

const BUCKET = "restaurant-photos";

export function resolvePhotoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export const PHOTO_BUCKET = BUCKET;
