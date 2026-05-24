"use server";

/**
 * §11 — partner marketing actions over the Wave 7 engine. Pro-gated + permission
 * gated. Scope is the user's primary venue (campaign subject); sends enqueue the
 * shipped fan-out job. Visual segment builder / template library are v1.5.
 */
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { marketingCampaigns, marketingSegments } from "@/lib/db/schema";
import {
  compileSegmentFilter,
  type SegmentCondition,
  type Combinator,
} from "@/lib/marketing/segment-compile";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { enqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { ok, fail, unauthenticated, forbidden, type ActionResult } from "@/lib/server-action";

type Channel = "email" | "sms" | "whatsapp" | "in_confirmation";

async function gate(organizationId: string, action: "campaign.create" | "campaign.send" | "campaign.delete") {
  const session = await getCurrentSession();
  if (!session) return { error: unauthenticated() as ActionResult<never>, session: null, restaurantId: null };
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { error: forbidden() as ActionResult<never>, session: null, restaurantId: null };
  const denied = await can(session, action, {
    kind: "campaign",
    restaurant_id: restaurantId,
    organization_id: organizationId,
  });
  if (!denied) return { error: forbidden() as ActionResult<never>, session: null, restaurantId: null };
  const sub = await loadActiveSubscription(organizationId);
  if (sub?.tier !== "pro") return { error: fail("forbidden", "marketing_pro_only") as ActionResult<never>, session: null, restaurantId: null };
  return { error: null, session, restaurantId };
}

type LocaleCopy = { subject: string; body: string };

export async function createOneOffCampaignAction(input: {
  organizationId: string;
  name: string;
  channel: Channel;
  copy: Record<"ro" | "en" | "de", LocaleCopy>;
}): Promise<ActionResult<{ campaignId: string }>> {
  const { error, session, restaurantId } = await gate(input.organizationId, "campaign.create");
  if (error) return error;
  const name = input.name.trim();
  const roBody = input.copy.ro?.body?.trim() ?? "";
  if (!name || !roBody) return fail("invalid_input", "Name and Romanian body are required.");

  // Store only locales with body content; RO is always present.
  const subjectTemplate: Record<string, string> = {};
  const bodyTemplate: Record<string, string> = {};
  for (const loc of ["ro", "en", "de"] as const) {
    const c = input.copy[loc];
    const body = c?.body?.trim();
    if (!body) continue;
    bodyTemplate[loc] = body;
    const subject = c?.subject?.trim();
    if (subject) subjectTemplate[loc] = subject;
  }

  try {
    const actor = await currentActor(session!.userId);
    const [row] = await dbAdmin
      .insert(marketingCampaigns)
      .values({
        organizationId: input.organizationId,
        restaurantId,
        kind: "one_off",
        name,
        channel: input.channel,
        status: "draft",
        subjectTemplate,
        bodyTemplate,
        createdByUserId: actor.actorUserId,
      })
      .returning({ id: marketingCampaigns.id });
    revalidatePath("/partner/marketing");
    return ok({ campaignId: row.id });
  } catch (err) {
    return fail("internal", String(err));
  }
}

export async function setCampaignStatusAction(
  organizationId: string,
  campaignId: string,
  status: "active" | "paused" | "archived",
): Promise<ActionResult<void>> {
  const { error } = await gate(organizationId, "campaign.create");
  if (error) return error;
  try {
    await dbAdmin
      .update(marketingCampaigns)
      .set({ status, archivedAt: status === "archived" ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.organizationId, organizationId)));
    revalidatePath("/partner/marketing");
    return ok(undefined);
  } catch (err) {
    return fail("internal", String(err));
  }
}

export async function sendCampaignAction(
  organizationId: string,
  campaignId: string,
): Promise<ActionResult<void>> {
  const { error } = await gate(organizationId, "campaign.send");
  if (error) return error;
  try {
    await dbAdmin
      .update(marketingCampaigns)
      .set({ status: "sending", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.organizationId, organizationId)));
    await enqueue(JOBS.marketing.fanOut, { campaignId });
    revalidatePath("/partner/marketing");
    return ok(undefined);
  } catch (err) {
    return fail("internal", String(err));
  }
}

// ─── §11 v1.5 visual segment builder ───────────────────────────────────────

export async function previewSegmentSizeAction(
  organizationId: string,
  conditions: SegmentCondition[],
  combinator: Combinator,
): Promise<ActionResult<{ count: number }>> {
  const { error } = await gate(organizationId, "campaign.create");
  if (error) return error;
  try {
    const where = compileSegmentFilter(conditions, combinator);
    const rows = (await dbAdmin.execute(sql`
      SELECT count(*)::int AS n
      FROM diners d
      WHERE d.organization_id = ${organizationId}
        AND d.redacted_at IS NULL
        AND ${where}
    `)) as unknown as Array<{ n: number }>;
    return ok({ count: rows[0]?.n ?? 0 });
  } catch (err) {
    if (String(err).includes("TV900")) return fail("invalid_input", "Adaugă cel puțin o condiție.");
    return fail("internal", String(err));
  }
}

export async function saveSegmentAction(
  organizationId: string,
  name: string,
  conditions: SegmentCondition[],
  combinator: Combinator,
): Promise<ActionResult<{ id: string }>> {
  const { error, session } = await gate(organizationId, "campaign.create");
  if (error) return error;
  if (!name.trim()) return fail("invalid_input", "Numele segmentului e obligatoriu.");
  try {
    compileSegmentFilter(conditions, combinator); // validate before persisting
    const actor = await currentActor(session!.userId);
    const [row] = await dbAdmin
      .insert(marketingSegments)
      .values({
        organizationId,
        name: name.trim(),
        filterDsl: { conditions },
        combinator,
        createdByUserId: actor.actorUserId,
      })
      .returning({ id: marketingSegments.id });
    revalidatePath("/partner/marketing/segments");
    return ok({ id: row.id });
  } catch (err) {
    if (String(err).includes("TV900")) return fail("invalid_input", "Adaugă cel puțin o condiție.");
    return fail("internal", String(err));
  }
}
