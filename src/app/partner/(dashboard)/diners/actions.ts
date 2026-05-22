"use server";

/**
 * Diner mutations server actions — Wave 3 §03 §5.3 sub-unit D.
 *
 * mergeDinersAction: merge a source diner into a target diner within the
 * same organization. Repoints `reservations.diner_id` and `reviews.diner_id`
 * from the source to the target, unions array fields + shallow-merges jsonb
 * preferences, keeps the longer of the two `internal_notes` blobs, then
 * deletes the source row. Target identity (phone, email, full_name) wins.
 *
 * Cross-org merges are rejected — diner identity is org-scoped per §03 §4.1
 * and the partial unique indices.
 *
 * Audit row carries both source + target ids and is threaded through
 * `currentActor` so impersonation chains are visible per §01 §5a.3.
 */

import { eq, inArray } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/db/server";
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations, reviews } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { currentActor } from "@/lib/auth/current-actor";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── mergeDinersAction ──────────────────────────────────────────────────

export interface MergeDinersInput {
  sourceId: string;
  targetId: string;
}

/**
 * Picks the longer of two notes blobs. Empty/whitespace counts as absent.
 * If both are empty returns null so we don't overwrite the target column
 * with a useless empty string.
 */
function mergeNotes(
  targetNotes: string | null,
  sourceNotes: string | null,
): string | null {
  const t = (targetNotes ?? "").trim();
  const s = (sourceNotes ?? "").trim();
  if (!t && !s) return null;
  if (!s) return t;
  if (!t) return s;
  return t.length >= s.length ? t : s;
}

export async function mergeDinersAction(
  input: MergeDinersInput,
): Promise<ActionResult<{ targetDinerId: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Load both rows in a single query so we can validate cross-org + presence
  // without two round-trips.
  const rows = await dbAdmin
    .select({
      id: diners.id,
      organizationId: diners.organizationId,
      allergies: diners.allergies,
      occasionTags: diners.occasionTags,
      seatingPreferences: diners.seatingPreferences,
      dietaryPreferences: diners.dietaryPreferences,
      internalNotes: diners.internalNotes,
    })
    .from(diners)
    .where(inArray(diners.id, [input.sourceId, input.targetId]));

  const source = rows.find((r) => r.id === input.sourceId);
  const target = rows.find((r) => r.id === input.targetId);

  if (!source || !target) return { ok: false, error: "Diner not found." };
  if (source.organizationId !== target.organizationId) {
    return { ok: false, error: "Cross-org merge not permitted." };
  }

  // Profile merge: union arrays + shallow-merge jsonb (target wins on key
  // collisions) + keep the longer of the two notes blobs. Target identity
  // (phone/email/full_name) is intentionally untouched — the caller picked
  // the target as the canonical row.
  const mergedAllergies = Array.from(
    new Set([...target.allergies, ...source.allergies]),
  );
  const mergedOccasion = Array.from(
    new Set([...target.occasionTags, ...source.occasionTags]),
  );
  const mergedDietary = Array.from(
    new Set([...target.dietaryPreferences, ...source.dietaryPreferences]),
  );
  const mergedSeating = {
    ...(source.seatingPreferences as Record<string, unknown>),
    ...(target.seatingPreferences as Record<string, unknown>),
  };
  const mergedNotes = mergeNotes(target.internalNotes, source.internalNotes);

  await dbAdmin.transaction(async (tx) => {
    // Order matters: repoint FK-bearing rows BEFORE deleting the source so
    // we never momentarily orphan history. `reservations.diner_id` has
    // ON DELETE SET NULL, so an out-of-order delete would silently null
    // those links rather than fail loudly.
    await tx
      .update(reservations)
      .set({ dinerId: input.targetId })
      .where(eq(reservations.dinerId, input.sourceId));
    await tx
      .update(reviews)
      .set({ dinerId: input.targetId })
      .where(eq(reviews.dinerId, input.sourceId));
    await tx
      .update(diners)
      .set({
        allergies: mergedAllergies,
        occasionTags: mergedOccasion,
        dietaryPreferences: mergedDietary,
        seatingPreferences: mergedSeating,
        internalNotes: mergedNotes,
        updatedAt: new Date(),
      })
      .where(eq(diners.id, input.targetId));
    await tx.delete(diners).where(eq(diners.id, input.sourceId));
  });

  const actor = await currentActor(user.id);
  await recordAudit({
    action: AUDIT.diner.merged,
    subjectType: "diner",
    subjectId: input.targetId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    organizationId: target.organizationId,
    context: {
      source_diner_id: input.sourceId,
      target_diner_id: input.targetId,
    },
  });

  return { ok: true, data: { targetDinerId: input.targetId } };
}
