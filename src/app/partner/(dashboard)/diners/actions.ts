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
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations, reviews } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { currentActor } from "@/lib/auth/current-actor";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";

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
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };

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

  // Authorization (audit #1): being signed in is NOT enough — the caller
  // must hold an org-level role in the diners' organization. Without this
  // any authenticated user could merge/delete another org's diners.
  if (
    !(await can(session, "diner.merge", {
      kind: "organization",
      id: source.organizationId,
    }))
  ) {
    return { ok: false, error: "Forbidden." };
  }

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

  const actor = await currentActor(session.userId);
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

// ─── splitDinerAction ───────────────────────────────────────────────────
//
// Splits a subset of a source diner's reservations off onto a brand-new
// diner row in the same organization. Use case: a single physical diner
// row accidentally accumulated reservations from two different humans
// (shared phone, walk-in conflation, etc.) and the venue wants to peel
// them apart without losing history.
//
// Reviews follow their reservations — `reviews.reservation_id` is unique,
// so we filter the review-repoint by the moved reservation ids rather
// than by source diner id. (If we used the source-diner shortcut we'd
// drag along reviews tied to reservations that stay with the source.)

export interface SplitDinerInput {
  sourceId: string;
  reservationIds: string[];
  newDiner: {
    fullName: string;
    phone?: string;
    email?: string;
  };
}

export async function splitDinerAction(
  input: SplitDinerInput,
): Promise<ActionResult<{ newDinerId: string }>> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };

  // Identity requirement matches the diners CHECK constraint.
  if (!input.newDiner.phone && !input.newDiner.email) {
    return { ok: false, error: "New diner requires phone or email." };
  }
  if (input.reservationIds.length === 0) {
    return { ok: false, error: "No reservations selected to split." };
  }

  const sourceRows = await dbAdmin
    .select({
      id: diners.id,
      organizationId: diners.organizationId,
      phone: diners.phone,
      email: diners.email,
      locale: diners.locale,
      acquisitionRestaurantId: diners.acquisitionRestaurantId,
    })
    .from(diners)
    .where(eq(diners.id, input.sourceId));
  const source = sourceRows[0];
  if (!source) return { ok: false, error: "Source diner not found." };

  // Authorization (audit #1): the caller must hold an org-level role in the
  // source diner's organization. Without this any authenticated user could
  // fork another org's diner + reservation history onto a new row.
  if (
    !(await can(session, "diner.split", {
      kind: "organization",
      id: source.organizationId,
    }))
  ) {
    return { ok: false, error: "Forbidden." };
  }

  // Cheap pre-check before the DB throws a unique-violation. The DB
  // partial-unique index is still the source of truth (other diners in
  // the org might already use the contact info) — we re-catch that case
  // below.
  if (input.newDiner.phone && source.phone === input.newDiner.phone) {
    return {
      ok: false,
      error: "New diner phone matches source. Provide distinct identity.",
    };
  }
  if (input.newDiner.email && source.email === input.newDiner.email) {
    return {
      ok: false,
      error: "New diner email matches source. Provide distinct identity.",
    };
  }

  // Verify every selected reservation belongs to the source diner. This
  // catches both (a) typos/IDs from a different diner and (b) cross-org
  // attempts where the caller stitches in foreign reservations.
  const reservationCheck = await dbAdmin
    .select({ id: reservations.id, dinerId: reservations.dinerId })
    .from(reservations)
    .where(inArray(reservations.id, input.reservationIds));
  if (reservationCheck.length !== input.reservationIds.length) {
    return { ok: false, error: "Some reservations not found." };
  }
  if (reservationCheck.some((r) => r.dinerId !== input.sourceId)) {
    return {
      ok: false,
      error: "Some reservations are not owned by the source diner.",
    };
  }

  let newDinerId: string;
  try {
    newDinerId = await dbAdmin.transaction(async (tx) => {
      const inserted = await tx
        .insert(diners)
        .values({
          organizationId: source.organizationId,
          phone: input.newDiner.phone ?? null,
          email: input.newDiner.email ?? null,
          fullName: input.newDiner.fullName.trim() || null,
          locale: source.locale,
          acquisitionSource: "manual",
          acquisitionRestaurantId: source.acquisitionRestaurantId,
        })
        .returning({ id: diners.id });
      const id = inserted[0].id;
      // Reviews follow their reservations — filter by reservation_id (which
      // is unique on reviews) so reviews tied to reservations that stay
      // with the source are left alone.
      await tx
        .update(reservations)
        .set({ dinerId: id })
        .where(inArray(reservations.id, input.reservationIds));
      await tx
        .update(reviews)
        .set({ dinerId: id })
        .where(inArray(reviews.reservationId, input.reservationIds));
      return id;
    });
  } catch (e) {
    // Likely partial-unique-index violation on (org_id, phone) or
    // (org_id, lower(email)) — i.e. another diner in this org already
    // owns the contact info we're trying to assign. Map to a friendly
    // error instead of bubbling the raw Postgres message.
    const msg = (e as Error).message ?? "";
    if (
      msg.includes("diners_org_phone_unique") ||
      msg.includes("diners_org_email_unique")
    ) {
      return {
        ok: false,
        error: "Another diner in this organization already uses that contact info.",
      };
    }
    throw e;
  }

  const actor = await currentActor(session.userId);
  await recordAudit({
    action: AUDIT.diner.split,
    subjectType: "diner",
    subjectId: newDinerId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    organizationId: source.organizationId,
    context: {
      source_diner_id: input.sourceId,
      new_diner_id: newDinerId,
      moved_reservation_ids: input.reservationIds,
    },
  });

  return { ok: true, data: { newDinerId } };
}
