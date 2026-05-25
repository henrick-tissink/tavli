import "server-only";
import { eq } from "drizzle-orm";
import { render } from "@react-email/render";
import { dbAdmin } from "@/lib/db/admin";
import { organizations } from "@/lib/db/schema";
import { loadActiveSubscription as defaultLoadActiveSubscription } from "@/lib/billing/load-subscription";
import { stripeOverageReporter } from "@/lib/billing/overage-reporter";
import {
  sendTransactionalEmail as defaultSendEmail,
  type SendTransactionalEmailInput,
} from "@/lib/email/send-transactional";
import {
  TrialEndingEmail,
  getSubject as trialSubject,
  type Locale,
  type TrialReminderDay,
} from "@/emails/TrialEndingEmail";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";
import type { OverageLine } from "@/lib/marketing/jobs/monthly-overage";

type SubLike = { status: string; tier: "base" | "pro"; frequency: "monthly" | "annual"; trial_ends_at: Date | null } | null;

export interface TrialReminderDeps {
  loadActiveSubscription: (orgId: string) => Promise<SubLike>;
  loadOrgContact: (orgId: string) => Promise<{ email: string; locale: Locale } | null>;
  sendEmail: (input: SendTransactionalEmailInput) => Promise<unknown>;
  day: TrialReminderDay;
}

const AMOUNT: Record<"base" | "pro", Record<"monthly" | "annual", string>> = {
  base: { monthly: "€30", annual: "€300" },
  pro: { monthly: "€60", annual: "€600" },
};

function narrowLocale(raw: string): Locale {
  return raw === "en" || raw === "de" ? raw : "ro";
}

/**
 * §12 §13 — day-60/75/85 trial reminder. No-ops if the subscription already
 * left `trialing` (operator converted or cancelled) or the org has no contact.
 * Fired via the startAfter enqueue in startSubscription, not a cron.
 */
export function makeTrialReminderHandler(deps: TrialReminderDeps) {
  return async function handle(payload: { organizationId: string }): Promise<void> {
    const sub = await deps.loadActiveSubscription(payload.organizationId);
    if (!sub || sub.status !== "trialing") return;

    const contact = await deps.loadOrgContact(payload.organizationId);
    if (!contact?.email) return;

    const props = {
      day: deps.day,
      trialEndsAt: sub.trial_ends_at ?? new Date(),
      chargeAmount: AMOUNT[sub.tier]?.[sub.frequency],
      locale: contact.locale,
    };
    const html = await render(TrialEndingEmail(props));
    const text = await render(TrialEndingEmail(props), { plainText: true });

    await deps.sendEmail({
      to: contact.email,
      locale: contact.locale,
      templateKey: `trial_ending_day_${deps.day}`,
      subject: trialSubject(contact.locale, { day: deps.day }),
      html,
      text,
      context: { organization_id: payload.organizationId },
    });
  };
}

async function defaultLoadOrgContact(
  orgId: string,
): Promise<{ email: string; locale: Locale } | null> {
  const rows = await dbAdmin
    .select({ email: organizations.primaryContactEmail, locale: organizations.locale })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const row = rows[0];
  if (!row?.email) return null;
  return { email: row.email, locale: narrowLocale(row.locale) };
}

function bind(day: TrialReminderDay) {
  return makeTrialReminderHandler({
    loadActiveSubscription: defaultLoadActiveSubscription,
    loadOrgContact: defaultLoadOrgContact,
    sendEmail: defaultSendEmail,
    day,
  });
}

export const handleTrialReminderDay60 = bind(60);
export const handleTrialReminderDay75 = bind(75);
export const handleTrialReminderDay85 = bind(85);

// ─── NEW-9: marketing overage → billing ──────────────────────────────────────
// monthly-overage-billing computes per-(org,channel) overage and enqueues
// JOBS.billing.reportMarketingOverage. Previously NO worker handler consumed it,
// so jobs piled up and overage was never recorded or billed. This handler
// durably records the overage owed (billing audit) and reports it to Stripe via
// an injected reporter. The reporter defaults to a keyless no-op seam: real
// metered billing needs Stripe meter config (createUsageRecord was removed in
// stripe@22 → Billing.meterEvents; the meter id is operational/dashboard config).

export interface ReportOverageDeps {
  recordBillingAudit: typeof defaultRecordBillingAudit;
  reportToStripe?: (input: {
    organizationId: string;
    yearMonth: string;
    totalCents: number;
    lines: OverageLine[];
  }) => Promise<void>;
}

export function makeReportMarketingOverageHandler(deps: ReportOverageDeps) {
  return async function handle(payload: {
    organizationId: string;
    yearMonth: string;
    lines: OverageLine[];
  }): Promise<void> {
    const totalCents = (payload.lines ?? []).reduce((s, l) => s + l.cents, 0);
    if (totalCents <= 0) return; // nothing billable
    await deps.recordBillingAudit({
      organizationId: payload.organizationId,
      eventType: "billing.overage_reported",
      context: {
        year_month: payload.yearMonth,
        total_cents: totalCents,
        lines: JSON.stringify(payload.lines),
      },
    });
    if (deps.reportToStripe) {
      await deps.reportToStripe({ ...payload, totalCents });
    } else {
      console.warn(
        `[billing] marketing overage ${totalCents}c for org ${payload.organizationId} (${payload.yearMonth}) recorded; ` +
          `Stripe meter reporting not configured (operational: Billing.meterEvents + meter id).`,
      );
    }
  };
}

export const handleReportMarketingOverage = makeReportMarketingOverageHandler({
  recordBillingAudit: defaultRecordBillingAudit,
  // F9: actually bill the overage once a live key is present (adds an invoice
  // item to the org's next invoice). No key (dev/pre-launch) → records + warns.
  reportToStripe: process.env.STRIPE_SECRET_KEY ? stripeOverageReporter : undefined,
});
