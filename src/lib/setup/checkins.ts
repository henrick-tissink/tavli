/**
 * §14 §9 — day-7/30/60 onboarding check-in emails, run as a daily sweep (find
 * restaurants created exactly N days ago) rather than per-restaurant startAfter,
 * so it's creation-path-agnostic. Idempotency rests on the once-daily cron +
 * exact-day match.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { render } from "@react-email/render";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { SetupCheckinEmail, getSubject, type CheckinDay, type Locale } from "@/emails/SetupCheckinEmail";

interface Deps {
  db: typeof dbAdmin;
  sendEmail: typeof sendTransactionalEmail;
  renderEmail?: (props: { day: CheckinDay; restaurantName: string; locale: Locale }) => Promise<{ html: string; text: string }>;
}

function asLocale(v: string | null): Locale {
  return v === "en" || v === "de" ? v : "ro";
}

export function makeSendDayNCheckin(deps: Deps, day: CheckinDay) {
  const renderEmail =
    deps.renderEmail ??
    (async (props: { day: CheckinDay; restaurantName: string; locale: Locale }) => ({
      html: await render(SetupCheckinEmail(props)),
      text: await render(SetupCheckinEmail(props), { plainText: true }),
    }));

  return async function sendDayNCheckin(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT r.id, r.name, r.organization_id, o.primary_contact_email AS email, o.locale
      FROM restaurants r JOIN organizations o ON o.id = r.organization_id
      WHERE r.created_at::date = (current_date - ${day}) AND r.archived_at IS NULL
    `)) as unknown as Array<{ id: string; name: string; organization_id: string; email: string | null; locale: string | null }>;

    for (const r of rows) {
      if (!r.email) continue;
      const locale = asLocale(r.locale);
      const props = { day, restaurantName: r.name, locale };
      const { html, text } = await renderEmail(props);
      await deps.sendEmail({
        to: r.email,
        locale,
        templateKey: `setup_checkin_day_${day}`,
        subject: getSubject(locale, { day, restaurantName: r.name }),
        html,
        text,
        context: { organization_id: r.organization_id, restaurant_id: r.id },
      });
    }
  };
}

export const sendDay7Checkin = makeSendDayNCheckin({ db: dbAdmin, sendEmail: sendTransactionalEmail }, 7);
export const sendDay30Checkin = makeSendDayNCheckin({ db: dbAdmin, sendEmail: sendTransactionalEmail }, 30);
export const sendDay60Checkin = makeSendDayNCheckin({ db: dbAdmin, sendEmail: sendTransactionalEmail }, 60);
