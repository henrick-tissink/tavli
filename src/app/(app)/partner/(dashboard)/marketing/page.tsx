import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, marketingCampaigns, marketingQuotaUsage, marketingSends, diners } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { MarketingManager } from "./_components/MarketingManager";
import { UsageMeter } from "./_components/UsageMeter";

export const dynamic = "force-dynamic";

const DEFAULT_ALLOWANCE: Record<string, number> = { email: 1000, sms: 250, whatsapp: 250 };

type MarketingMessages = ReturnType<typeof getMessages<"partner.marketing">>;
type CommonMessages = ReturnType<typeof getMessages<"partner.common">>;

function Header({ m, common }: { m: MarketingMessages; common: CommonMessages }) {
  return (
    <header>
      <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{common.nav.accountEyebrow}</p>
      <h1 className="mt-2 font-display text-4xl text-text-primary">{m.page.title}</h1>
    </header>
  );
}

export default async function PartnerMarketingPage() {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.marketing");
  const common = getMessages(locale, "partner.common");
  const bundle = buildBundle(locale, ["ui", "partner.common", "partner.marketing"]);

  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  let organizationId = session.profile.defaultOrganizationId;
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!organizationId && restaurantId) {
    const [r] = await dbAdmin
      .select({ orgId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId));
    organizationId = r?.orgId ?? null;
  }

  const allowed =
    !!organizationId &&
    !!restaurantId &&
    (await can(session, "campaign.read", {
      kind: "campaign",
      restaurant_id: restaurantId,
      organization_id: organizationId,
    }));

  if (!organizationId || !allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <Header m={m} common={common} />
        <div className="rounded-card border border-border bg-surface-white p-8 text-sm text-text-secondary">
          {m.page.noAccess}
        </div>
      </div>
    );
  }

  const sub = await loadActiveSubscription(organizationId);
  const isPro = sub?.tier === "pro";

  if (!isPro) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <Header m={m} common={common} />
        <div className="rounded-card border border-dashed border-border bg-surface-bg/60 p-12 text-center">
          <h2 className="font-display text-2xl font-bold text-text-primary">{m.page.proGateTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
            {m.page.proGateBody}
          </p>
          <Link
            href="/partner/billing"
            className="mt-5 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {m.page.proGateCta}
          </Link>
        </div>
      </div>
    );
  }

  const [campaignRows, quotaRows, reachRows, sendAggRows] = await Promise.all([
    dbAdmin
      .select({
        id: marketingCampaigns.id,
        kind: marketingCampaigns.kind,
        triggeredCampaignKey: marketingCampaigns.triggeredCampaignKey,
        name: marketingCampaigns.name,
        status: marketingCampaigns.status,
        channel: marketingCampaigns.channel,
        sentAt: marketingCampaigns.sentAt,
        scheduledSendAt: marketingCampaigns.scheduledSendAt,
        recipientCountEstimate: marketingCampaigns.recipientCountEstimate,
      })
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.organizationId, organizationId))
      .orderBy(desc(marketingCampaigns.createdAt)),
    dbAdmin
      .select({
        channel: marketingQuotaUsage.channel,
        sentCount: marketingQuotaUsage.sentCount,
        includedAllowance: marketingQuotaUsage.includedAllowance,
      })
      .from(marketingQuotaUsage)
      .where(
        and(
          eq(marketingQuotaUsage.organizationId, organizationId),
          eq(marketingQuotaUsage.yearMonth, sql`date_trunc('month', now())::date`),
        ),
      ),
    // Reachable audience: org diners not redacted with at least one contact point.
    dbAdmin
      .select({ n: sql<number>`count(*)::int` })
      .from(diners)
      .where(
        and(
          eq(diners.organizationId, organizationId),
          sql`${diners.redactedAt} is null`,
          sql`(${diners.email} is not null or ${diners.phone} is not null)`,
        ),
      ),
    // This-month delivery/open aggregate, for the average open rate.
    dbAdmin
      .select({
        delivered: sql<number>`count(*) filter (where ${marketingSends.deliveredAt} is not null)::int`,
        opened: sql<number>`count(*) filter (where ${marketingSends.openedAt} is not null)::int`,
      })
      .from(marketingSends)
      .where(
        and(
          eq(marketingSends.organizationId, organizationId),
          sql`${marketingSends.sentAt} >= date_trunc('month', now())`,
        ),
      ),
  ]);

  // Serialize timestamps for the client manager (RSC-safe ISO strings).
  const campaigns = campaignRows.map((c) => ({
    ...c,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    scheduledSendAt: c.scheduledSendAt ? c.scheduledSendAt.toISOString() : null,
  }));

  const usage = (channel: string) => {
    const row = quotaRows.find((q) => q.channel === channel);
    return { sent: row?.sentCount ?? 0, allowance: row?.includedAllowance ?? DEFAULT_ALLOWANCE[channel] };
  };
  const email = usage("email");
  const sms = usage("sms");
  const whatsapp = usage("whatsapp");

  // At-a-glance summary stats (hero band).
  const activeAutomations = campaignRows.filter(
    (c) => c.kind === "triggered" && c.status === "active",
  ).length;
  const sentThisMonth = quotaRows.reduce((acc, r) => acc + (r.sentCount ?? 0), 0);
  const reachableGuests = reachRows[0]?.n ?? 0;
  const delivered = sendAggRows[0]?.delivered ?? 0;
  const opened = sendAggRows[0]?.opened ?? 0;
  const openRate = delivered > 0 ? Math.round((opened / delivered) * 100) : null;

  const summaryStats = [
    { value: activeAutomations.toLocaleString(locale), label: m.page.summary.activeAutomations },
    { value: sentThisMonth.toLocaleString(locale), label: m.page.summary.sentThisMonth },
    { value: reachableGuests.toLocaleString(locale), label: m.page.summary.audienceReach },
    {
      value: openRate === null ? m.page.summary.openRateEmpty : `${openRate}%`,
      label: m.page.summary.openRate,
    },
  ];

  // §11 v1.5 — quota alert at 80% / 100% of the included allowance.
  const channelsAtRisk = [
    { label: "Email", u: email },
    { label: "SMS", u: sms },
    { label: "WhatsApp", u: whatsapp },
  ].filter(({ u }) => u.allowance > 0 && u.sent / u.allowance >= 0.8);
  const overChannels = channelsAtRisk.filter(({ u }) => u.sent >= u.allowance);

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-12">
        <Header m={m} common={common} />

        <section className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface-white shadow-card sm:grid-cols-4">
          {summaryStats.map((s, i) => (
            <div
              key={s.label}
              className={[
                "border-border px-5 py-4 sm:border-t-0",
                i % 2 === 1 ? "border-l" : "",
                i >= 2 ? "border-t" : "",
                i >= 1 ? "sm:border-l" : "",
              ].join(" ")}
            >
              <p className="font-display text-3xl font-bold leading-none text-text-primary tabular-nums">
                {s.value}
              </p>
              <p className="mt-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {channelsAtRisk.length > 0 && (
          <div
            className={`rounded-card border p-5 ${
              overChannels.length > 0 ? "border-error/40 bg-error/5" : "border-amber-300 bg-amber-50"
            }`}
          >
            <p className={`text-sm font-semibold ${overChannels.length > 0 ? "text-error" : "text-amber-900"}`}>
              {overChannels.length > 0
                ? interpolate(m.page.quotaOver, { channels: overChannels.map((c) => c.label).join(", ") })
                : interpolate(m.page.quotaNear, { channels: channelsAtRisk.map((c) => c.label).join(", ") })}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {m.page.quotaSurcharge}
            </p>
          </div>
        )}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {m.page.usageTitle}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UsageMeter label={m.channels.email} channel="email" sent={email.sent} allowance={email.allowance} leftLabel={m.page.meterLeft} locale={locale} />
            <UsageMeter label={m.channels.sms} channel="sms" sent={sms.sent} allowance={sms.allowance} leftLabel={m.page.meterLeft} locale={locale} />
            <UsageMeter label={m.channels.whatsapp} channel="whatsapp" sent={whatsapp.sent} allowance={whatsapp.allowance} leftLabel={m.page.meterLeft} locale={locale} />
          </div>
        </section>

        <Link
          href="/partner/marketing/segments"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary-dark hover:underline"
        >
          {m.page.segmentsLink}
        </Link>

        <MarketingManager organizationId={organizationId} campaigns={campaigns} locale={locale} />
      </div>
    </MessagesProvider>
  );
}
