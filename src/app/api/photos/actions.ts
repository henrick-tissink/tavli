"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { PHOTO_BUCKET, resolvePhotoUrl } from "@/lib/storage";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { stripExif } from "@/lib/photos/strip-exif";
import { loadActiveSubscription, isProFeatureActive } from "@/lib/billing/load-subscription";

export interface UploadResult {
  ok: boolean;
  error?: string;
  photo?: {
    id: string;
    storagePath: string;
    kind: "hero" | "gallery" | "dish" | "venue";
    sortOrder: number;
  };
}

/**
 * Upload a restaurant photo + insert the metadata row. Runs on the
 * server with the user's session (cookie-based, via SSR client) to
 * verify ownership, then uses the service-role client to write. This
 * sidesteps the browser-client session issue where anon/publishable
 * keys don't always propagate the access token in all SDK flows.
 *
 * Limits enforced here: max 20 photos (Base tier) per restaurant; user must hold
 * restaurant.update on the venue (via can()); image MIME type.
 * EXIF metadata is stripped from every upload before writing to Storage.
 */
export async function uploadRestaurantPhoto(
  formData: FormData,
): Promise<UploadResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const restaurantId = String(formData.get("restaurantId") ?? "");
  const kindIn = String(formData.get("kind") ?? "gallery");
  const kind = (["hero", "gallery", "dish", "venue"] as const).includes(
    kindIn as "hero" | "gallery" | "dish" | "venue",
  )
    ? (kindIn as "hero" | "gallery" | "dish" | "venue")
    : "gallery";
  const file = formData.get("file") as File | null;

  if (!restaurantId) return { ok: false, error: "Lipsește id-ul restaurantului." };
  if (!file) return { ok: false, error: "Niciun fișier atașat." };
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: `${file.name} nu este o imagine.` };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: `${file.name} depășește 10 MB.` };
  }

  const admin = createSupabaseAdminClient();

  // Verify ownership via the can() framework — first photo-action caller.
  const { data: restaurantRow } = await admin
    .from("restaurants")
    .select("organization_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurantRow) {
    return { ok: false, error: "Nu este restaurantul tău." };
  }
  if (
    !(await can(session, "restaurant.update", {
      kind: "restaurant",
      id: restaurantId,
      organization_id: restaurantRow.organization_id,
    }))
  ) {
    return { ok: false, error: "Nu este restaurantul tău." };
  }

  // Enforce per-restaurant photo cap (tier-aware). §05 §3.5. A past_due/unpaid
  // Pro org does NOT keep the unlimited cap — isProFeatureActive gates on a
  // paying/trialing status, not bare tier.
  const subscription = await loadActiveSubscription(restaurantRow.organization_id);
  const isProActive = isProFeatureActive(subscription);
  const PHOTO_CAP_BASE = 20;

  if (!isProActive) {
    const { count } = await admin
      .from("restaurant_photos")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId);
    if ((count ?? 0) >= PHOTO_CAP_BASE) {
      return {
        ok: false,
        error: `Limita de fotografii a fost atinsă (${PHOTO_CAP_BASE} per restaurant). Upgradeaza la Pro pentru nelimitat.`,
      };
    }
  }

  // Strip EXIF metadata before upload. §05 §5.1.
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const cleanBuffer = await stripExif(rawBuffer);

  // Upload to Storage.
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const storagePath = `${restaurantId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, cleanBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  // Pick next sort_order; if no hero exists yet, make this one hero.
  const { data: existing } = await admin
    .from("restaurant_photos")
    .select("id, kind, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false });

  const hasHero = (existing ?? []).some((p) => p.kind === "hero");
  const maxSort = (existing ?? []).reduce(
    (m, p) => Math.max(m, p.sort_order),
    -1,
  );
  const finalKind = !hasHero && kind === "gallery" ? "hero" : kind;

  const { data: inserted, error: insertErr } = await admin
    .from("restaurant_photos")
    .insert({
      restaurant_id: restaurantId,
      storage_path: storagePath,
      kind: finalKind,
      sort_order: maxSort + 1,
    })
    .select("id, storage_path, kind, sort_order")
    .single();

  if (insertErr || !inserted) {
    // Clean up the uploaded blob.
    await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return { ok: false, error: insertErr?.message ?? "Fotografia nu a putut fi înregistrată." };
  }

  revalidatePath("/partner");
  revalidatePath("/partner/photos");

  return {
    ok: true,
    photo: {
      id: inserted.id,
      storagePath: inserted.storage_path,
      kind: inserted.kind,
      sortOrder: inserted.sort_order,
    },
  };
}

export async function setPhotoHero(photoId: string): Promise<UploadResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const admin = createSupabaseAdminClient();

  const { data: photo } = await admin
    .from("restaurant_photos")
    .select("restaurant_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Fotografia nu a fost găsită." };

  const { data: restaurantRow } = await admin
    .from("restaurants")
    .select("organization_id")
    .eq("id", photo.restaurant_id)
    .maybeSingle();
  if (!restaurantRow) {
    return { ok: false, error: "Nu este fotografia ta." };
  }
  if (
    !(await can(session, "restaurant.update", {
      kind: "restaurant",
      id: photo.restaurant_id,
      organization_id: restaurantRow.organization_id,
    }))
  ) {
    return { ok: false, error: "Nu este fotografia ta." };
  }

  await admin
    .from("restaurant_photos")
    .update({ kind: "gallery" })
    .eq("restaurant_id", photo.restaurant_id)
    .eq("kind", "hero");

  await admin
    .from("restaurant_photos")
    .update({ kind: "hero" })
    .eq("id", photoId);

  revalidatePath("/partner");
  revalidatePath("/partner/photos");
  return { ok: true };
}

export async function deletePhoto(photoId: string): Promise<UploadResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const admin = createSupabaseAdminClient();

  const { data: photo } = await admin
    .from("restaurant_photos")
    .select("id, storage_path, restaurant_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Fotografia nu a fost găsită." };

  const { data: restaurantRow } = await admin
    .from("restaurants")
    .select("organization_id")
    .eq("id", photo.restaurant_id)
    .maybeSingle();
  if (!restaurantRow) {
    return { ok: false, error: "Nu este fotografia ta." };
  }
  if (
    !(await can(session, "restaurant.update", {
      kind: "restaurant",
      id: photo.restaurant_id,
      organization_id: restaurantRow.organization_id,
    }))
  ) {
    return { ok: false, error: "Nu este fotografia ta." };
  }

  await admin.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  await admin.from("restaurant_photos").delete().eq("id", photoId);

  revalidatePath("/partner");
  revalidatePath("/partner/photos");
  return { ok: true };
}

export interface DishPhotoResult {
  ok: boolean;
  error?: string;
  url?: string | null;
}

/**
 * Upload (or replace) a single dish photo. Unlike restaurant photos, dish
 * images are stored directly on `menu_items.photo_storage_path` — not as
 * `restaurant_photos` rows — so they stay 1:1 with the dish and do not count
 * against the gallery cap. Reuses the same ownership check, EXIF strip, and
 * bucket as uploadRestaurantPhoto.
 */
export async function uploadDishPhoto(
  formData: FormData,
): Promise<DishPhotoResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const restaurantId = String(formData.get("restaurantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const file = formData.get("file") as File | null;

  if (!restaurantId || !itemId) {
    return { ok: false, error: "Lipsește id-ul felului." };
  }
  if (!file) return { ok: false, error: "Niciun fișier atașat." };
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: `${file.name} nu este o imagine.` };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: `${file.name} depășește 10 MB.` };
  }

  const admin = createSupabaseAdminClient();

  const { data: restaurantRow } = await admin
    .from("restaurants")
    .select("organization_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurantRow) return { ok: false, error: "Nu este restaurantul tău." };
  if (
    !(await can(session, "restaurant.update", {
      kind: "restaurant",
      id: restaurantId,
      organization_id: restaurantRow.organization_id,
    }))
  ) {
    return { ok: false, error: "Nu este restaurantul tău." };
  }

  // The dish must belong to this restaurant (denormalised restaurant_id).
  const { data: item } = await admin
    .from("menu_items")
    .select("id, photo_storage_path")
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Felul nu a fost găsit." };

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const cleanBuffer = await stripExif(rawBuffer);
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const storagePath = `${restaurantId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, cleanBuffer, { contentType: file.type, upsert: false });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { error: updateErr } = await admin
    .from("menu_items")
    .update({ photo_storage_path: storagePath })
    .eq("id", itemId);
  if (updateErr) {
    await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return { ok: false, error: updateErr.message };
  }

  // Replace: drop the previous blob once the new path is committed.
  if (item.photo_storage_path) {
    await admin.storage.from(PHOTO_BUCKET).remove([item.photo_storage_path]);
  }

  revalidatePath("/partner/menu");
  revalidatePath("/partner/photos");
  return { ok: true, url: resolvePhotoUrl(storagePath) };
}

/** Remove a dish's photo: delete the blob and clear the column. */
export async function removeDishPhoto(
  itemId: string,
): Promise<DishPhotoResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const admin = createSupabaseAdminClient();

  const { data: item } = await admin
    .from("menu_items")
    .select("id, restaurant_id, photo_storage_path")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Felul nu a fost găsit." };

  const { data: restaurantRow } = await admin
    .from("restaurants")
    .select("organization_id")
    .eq("id", item.restaurant_id)
    .maybeSingle();
  if (!restaurantRow) return { ok: false, error: "Nu este restaurantul tău." };
  if (
    !(await can(session, "restaurant.update", {
      kind: "restaurant",
      id: item.restaurant_id,
      organization_id: restaurantRow.organization_id,
    }))
  ) {
    return { ok: false, error: "Nu este restaurantul tău." };
  }

  if (item.photo_storage_path) {
    await admin.storage.from(PHOTO_BUCKET).remove([item.photo_storage_path]);
  }
  await admin
    .from("menu_items")
    .update({ photo_storage_path: null })
    .eq("id", itemId);

  revalidatePath("/partner/menu");
  revalidatePath("/partner/photos");
  return { ok: true, url: null };
}
