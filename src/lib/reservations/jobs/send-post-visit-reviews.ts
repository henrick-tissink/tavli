/**
 * §06 / §02 §6 — `reservation.send-post-visit-review-request`, hourly sweep.
 *
 * Replaces the legacy /api/cron/post-visit-emails route (build-order §9 step 6:
 * migrate to pg-boss). Fixes the route's hardcoded +02:00 by computing the
 * venue-local slot via restaurants.timezone (DST-correct). Emails a review
 * request 4h–14d after a confirmed visit; post_visit_email_sent_at is the
 * claim-before-send double-fire guard (released on send failure to retry).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { appOrigin } from "@/lib/app-origin";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";

interface Row {
  id: string;
  confirmation_token: string;
  guest_name: string;
  guest_email: string;
  diner_id: string | null;
  restaurant_id: string;
  restaurant_name: string;
  organization_id: string | null;
}

interface Deps {
  db: typeof dbAdmin;
  sendEmail: typeof sendTransactionalEmail;
  renderPostVisit: (input: { restaurantName: string; guestName: string; reviewBaseUrl: string }) => Promise<{ html: string; text: string }>;
}

export function makeSendPostVisitReviews(deps: Deps) {
  return async function sendPostVisitReviews(): Promise<{ sent: number }> {
    const rows = (await deps.db.execute(sql`
      SELECT r.id, r.confirmation_token, r.guest_name, r.guest_email, r.diner_id,
             r.restaurant_id, rest.name AS restaurant_name, rest.organization_id
      FROM reservations r
      JOIN restaurants rest ON rest.id = r.restaurant_id
      WHERE r.status = 'confirmed'
        AND r.post_visit_email_sent_at IS NULL
        AND r.guest_email IS NOT NULL
        AND ((r.reservation_date + r.reservation_time) AT TIME ZONE rest.timezone) + interval '4 hours' < now()
        AND ((r.reservation_date + r.reservation_time) AT TIME ZONE rest.timezone) >= now() - interval '14 days'
    `)) as unknown as Row[];

    let sent = 0;
    for (const r of rows) {
      const claimed = (await deps.db.execute(sql`
        UPDATE reservations SET post_visit_email_sent_at = now()
        WHERE id = ${r.id} AND post_visit_email_sent_at IS NULL AND status = 'confirmed'
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      if (claimed.length === 0) continue;

      try {
        const { html, text } = await deps.renderPostVisit({
          restaurantName: r.restaurant_name,
          guestName: r.guest_name,
          reviewBaseUrl: `${appOrigin()}/reviews/${r.confirmation_token}`,
        });
        const result = await deps.sendEmail({
          to: r.guest_email,
          locale: "ro",
          templateKey: "review_request",
          subject: `Cum a fost la ${r.restaurant_name}?`,
          html,
          text,
          context: {
            reservation_id: r.id,
            restaurant_id: r.restaurant_id,
            organization_id: r.organization_id ?? undefined,
            diner_id: r.diner_id ?? undefined,
          },
        });
        if (!result.ok) throw new Error(result.error ?? "send failed");
        sent += 1;
      } catch (err) {
        await deps.db.execute(sql`
          UPDATE reservations SET post_visit_email_sent_at = NULL WHERE id = ${r.id}
        `);
        console.error("[post-visit-review] send failed", { id: r.id, error: String(err) });
      }
    }
    return { sent };
  };
}

export const sendPostVisitReviews = makeSendPostVisitReviews({
  db: dbAdmin,
  sendEmail: sendTransactionalEmail,
  renderPostVisit: async (input) => {
    const { render } = await import("@react-email/render");
    const { PostVisitReviewEmail } = await import("@/emails/PostVisitReviewEmail");
    const node = PostVisitReviewEmail(input);
    return { html: await render(node), text: await render(node, { plainText: true }) };
  },
});
