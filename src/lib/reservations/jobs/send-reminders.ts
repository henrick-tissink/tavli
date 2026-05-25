/**
 * §02 §6 — `reservation.send-24h-reminder`, run as an hourly sweep.
 *
 * Finds confirmed, not-yet-reminded reservations whose venue-local slot is
 * ~24h out (computed via the restaurant's timezone, DST-correct) and emails a
 * pre-arrival reminder. Double-fire defense (§6, required): each row is CLAIMED
 * by setting reminder_sent_at in one guarded UPDATE *before* sending; if the
 * send fails the claim is released (back to NULL) so a later sweep retries.
 * Two concurrent sweeps or the overlapping window can never double-send because
 * only the claim that flips NULL→now() proceeds.
 *
 * Sweep (not per-reservation pgboss scheduling): robust against lost scheduled
 * jobs and naturally re-targets a modified reservation's new time, so no
 * reminder_job_id / cancel-on-modify bookkeeping is needed.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { appOrigin } from "@/lib/app-origin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";

interface ReminderRow {
  id: string;
  confirmation_token: string;
  guest_name: string;
  guest_email: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  zone: string | null;
  diner_id: string | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_address: string | null;
  organization_id: string | null;
}

export interface RenderReminderInput {
  restaurantName: string;
  restaurantAddress?: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  guestName: string;
  zone?: string;
  cancelUrl: string;
}

interface Deps {
  db: typeof dbAdmin;
  sendEmail: typeof sendTransactionalEmail;
  renderReminder: (input: RenderReminderInput) => Promise<{ html: string; text: string }>;
  recordAudit: typeof realRecordAudit;
  now?: () => Date;
}

export function makeSendReminders(deps: Deps) {
  return async function sendReminders(): Promise<{ sent: number }> {
    const rows = (await deps.db.execute(sql`
      SELECT r.id, r.confirmation_token, r.guest_name, r.guest_email,
             r.reservation_date::text AS reservation_date,
             to_char(r.reservation_time, 'HH24:MI') AS reservation_time,
             r.party_size, r.zone, r.diner_id, r.restaurant_id,
             rest.name AS restaurant_name, rest.address AS restaurant_address,
             rest.organization_id
      FROM reservations r
      JOIN restaurants rest ON rest.id = r.restaurant_id
      WHERE r.status = 'confirmed'
        AND r.reminder_sent_at IS NULL
        AND r.guest_email IS NOT NULL
        AND ((r.reservation_date + r.reservation_time) AT TIME ZONE rest.timezone)
            BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
    `)) as unknown as ReminderRow[];

    let sent = 0;
    for (const r of rows) {
      // CLAIM: flip NULL→now() under the guard; only the winner proceeds.
      const claimed = (await deps.db.execute(sql`
        UPDATE reservations SET reminder_sent_at = now()
        WHERE id = ${r.id} AND reminder_sent_at IS NULL AND status = 'confirmed'
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      if (claimed.length === 0) continue;

      try {
        const cancelUrl = `${appOrigin()}/reservations/${r.confirmation_token}`;
        const { html, text } = await deps.renderReminder({
          restaurantName: r.restaurant_name,
          restaurantAddress: r.restaurant_address ?? undefined,
          reservationDate: r.reservation_date,
          reservationTime: r.reservation_time,
          partySize: r.party_size,
          guestName: r.guest_name,
          zone: r.zone ?? undefined,
          cancelUrl,
        });
        const result = await deps.sendEmail({
          to: r.guest_email,
          locale: "ro",
          templateKey: "reservation_reminder",
          subject: `Mâine la ${r.restaurant_name}`,
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
        await deps.recordAudit({
          action: AUDIT.reservation.reminder_sent,
          subjectType: "reservation",
          subjectId: r.id,
          actorRole: "system",
          organizationId: r.organization_id ?? undefined,
          restaurantId: r.restaurant_id,
          context: { channel: "email" },
        });
        sent += 1;
      } catch (err) {
        // Release the claim so a later sweep retries; never leave it "sent"
        // when nothing went out.
        await deps.db.execute(sql`
          UPDATE reservations SET reminder_sent_at = NULL WHERE id = ${r.id}
        `);
        console.error("[reservation-reminder] send failed", { id: r.id, error: String(err) });
      }
    }
    return { sent };
  };
}

export const sendReminders = makeSendReminders({
  db: dbAdmin,
  sendEmail: sendTransactionalEmail,
  renderReminder: async (input) => {
    const { render } = await import("@react-email/render");
    const { ReservationReminderEmail } = await import("@/emails/ReservationReminderEmail");
    const node = ReservationReminderEmail(input);
    return { html: await render(node), text: await render(node, { plainText: true }) };
  },
  recordAudit: realRecordAudit,
});
