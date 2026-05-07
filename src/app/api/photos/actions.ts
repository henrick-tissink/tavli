"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { PHOTO_BUCKET } from "@/lib/storage";

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
 * Limits enforced here: max 50 photos per restaurant; must match
 * owner_user_id; image MIME type.
 */
export async function uploadRestaurantPhoto(
  formData: FormData,
): Promise<UploadResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nu ești autentificat." };

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

  // Verify ownership.
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("owner_user_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant || restaurant.owner_user_id !== user.id) {
    return { ok: false, error: "Nu este restaurantul tău." };
  }

  // Enforce per-restaurant photo cap.
  const { count } = await admin
    .from("restaurant_photos")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  if ((count ?? 0) >= 50) {
    return { ok: false, error: "Limita de fotografii a fost atinsă (50 per restaurant)." };
  }

  // Upload to Storage.
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const storagePath = `${restaurantId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, {
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nu ești autentificat." };

  const admin = createSupabaseAdminClient();

  const { data: photo } = await admin
    .from("restaurant_photos")
    .select("restaurant_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Fotografia nu a fost găsită." };

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("owner_user_id")
    .eq("id", photo.restaurant_id)
    .maybeSingle();
  if (!restaurant || restaurant.owner_user_id !== user.id) {
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nu ești autentificat." };

  const admin = createSupabaseAdminClient();

  const { data: photo } = await admin
    .from("restaurant_photos")
    .select("id, storage_path, restaurant_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Fotografia nu a fost găsită." };

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("owner_user_id")
    .eq("id", photo.restaurant_id)
    .maybeSingle();
  if (!restaurant || restaurant.owner_user_id !== user.id) {
    return { ok: false, error: "Nu este fotografia ta." };
  }

  await admin.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  await admin.from("restaurant_photos").delete().eq("id", photoId);

  revalidatePath("/partner");
  revalidatePath("/partner/photos");
  return { ok: true };
}
