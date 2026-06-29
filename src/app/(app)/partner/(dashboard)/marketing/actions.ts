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
import { marketingCampaigns, marketingCampaignVersions, marketingSegments } from "@/lib/db/schema";
import {
  compileSegmentFilter,
  type SegmentCondition,
  type Combinator,
} from "@/lib/marketing/segment-compile";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { loadBillingAccess } from "@/lib/billing/dunning";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
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
  // Twilio Content SID (HX…) of the Meta-approved template. Required for the
  // whatsapp channel — business-initiated WhatsApp can only send approved
  // templates, so a campaign without one would never deliver.
  whatsappContentSid?: string;
}): Promise<ActionResult<{ campaignId: string }>> {
  const { error, session, restaurantId } = await gate(input.organizationId, "campaign.create");
  if (error) return error;
  const name = input.name.trim();
  const roBody = input.copy.ro?.body?.trim() ?? "";
  if (!name || !roBody) return fail("invalid_input", "Name and Romanian body are required.");
  const whatsappContentSid = input.whatsappContentSid?.trim() || null;
  if (input.channel === "whatsapp" && !whatsappContentSid) {
    return fail("invalid_input", "whatsapp_template_required");
  }

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
        whatsappContentSid,
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
    // Activating a triggered whatsapp campaign without an approved Content
    // template would only enqueue failing sends — block it.
    if (status === "active") {
      const [c] = await dbAdmin
        .select({ channel: marketingCampaigns.channel, whatsappContentSid: marketingCampaigns.whatsappContentSid })
        .from(marketingCampaigns)
        .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.organizationId, organizationId)));
      if (c?.channel === "whatsapp" && !c.whatsappContentSid) {
        return fail("invalid_input", "whatsapp_template_required");
      }
    }
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
  const { error, session } = await gate(organizationId, "campaign.send");
  if (error) return error;
  // NEW-5 / §11.5: dunning soft-lock (day 7+) and read-only (day 21+ / cancelled)
  // pause campaign sends. Diner-facing bookings are never gated (§11.6) — this
  // applies to operator marketing writes only.
  if ((await loadBillingAccess(organizationId)) !== "full") {
    return fail("forbidden", "billing_locked");
  }
  try {
    // audit #13 — only a draft campaign may be sent. The status='draft'
    // predicate makes the flip atomic: a sent/sending campaign matches no row
    // (so the fan-out, which re-inserts every marketing_sends, never re-runs),
    // and of two concurrent calls only one flips draft→sending and enqueues.
    // RETURNING the content so we can snapshot the version actually sent.
    const res = await dbAdmin
      .update(marketingCampaigns)
      .set({ status: "sending", sentAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(marketingCampaigns.id, campaignId),
          eq(marketingCampaigns.organizationId, organizationId),
          eq(marketingCampaigns.status, "draft"),
        ),
      )
      .returning({
        channel: marketingCampaigns.channel,
        whatsappContentSid: marketingCampaigns.whatsappContentSid,
        subjectTemplate: marketingCampaigns.subjectTemplate,
        bodyTemplate: marketingCampaigns.bodyTemplate,
        previewText: marketingCampaigns.previewText,
      });
    if (res.length === 0) {
      return fail("invalid_input", "campaign_not_sendable");
    }
    // A whatsapp campaign with no approved Content template would only produce
    // failed sends — block it (and roll the status back to draft).
    if (res[0].channel === "whatsapp" && !res[0].whatsappContentSid) {
      await dbAdmin
        .update(marketingCampaigns)
        .set({ status: "draft", sentAt: null, updatedAt: new Date() })
        .where(eq(marketingCampaigns.id, campaignId));
      return fail("invalid_input", "whatsapp_template_required");
    }
    // §11 §4.4 — snapshot the content version this send used (version 1 for the
    // v1 no-edit flow), so every marketing_sends row the fan-out inserts can be
    // attributed to it. Idempotent: the unique (campaign_id, version_number)
    // index + ON CONFLICT make the once-only draft→sending flip safe to re-snapshot.
    const camp = res[0];
    const actor = await currentActor(session!.userId);
    await dbAdmin
      .insert(marketingCampaignVersions)
      .values({
        campaignId,
        versionNumber: 1,
        subjectTemplate: camp.subjectTemplate,
        bodyTemplate: camp.bodyTemplate,
        previewText: camp.previewText,
        editedByUserId: actor.actorUserId,
      })
      .onConflictDoNothing();
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
    if (String(err).includes("TV900")) {
      const m = getMessages(await resolveAppLocale(), "partner.marketing");
      return fail("invalid_input", m.errors.atLeastOneCondition);
    }
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
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.marketing");
  if (!name.trim()) return fail("invalid_input", m.errors.segmentNameRequired);
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
    if (String(err).includes("TV900")) return fail("invalid_input", m.errors.atLeastOneCondition);
    return fail("internal", String(err));
  }
}
