import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, marketingCampaigns, marketingQuotaUsage } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { StatCard } from "@/components/admin/StatCard";
import { ArrowLeft, Mail, MessageSquare, Phone } from "lucide-react";
import { MarketingManager } from "./_components/MarketingManager";

export const dynamic = "force-dynamic";

const DEFAULT_ALLOWANCE: Record<string, number> = { email: 1000, sms: 250, whatsapp: 250 };

function Header() {
  return (
    <header>
      <Link
        href="/partner"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} aria-hidden /> Înapoi la panou
      </Link>
      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-text-muted">Cont</p>
      <h1 className="mt-2 font-display text-4xl text-text-primary">Marketing</h1>
    </header>
  );
}

export default async function PartnerMarketingPage() {
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
        <Header />
        <div className="rounded-card border border-border bg-surface-white p-8 text-sm text-text-secondary">
          Nu ai acces la suita de marketing.
        </div>
      </div>
    );
  }

  const sub = await loadActiveSubscription(organizationId);
  const isPro = sub?.tier === "pro";

  if (!isPro) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <Header />
        <div className="rounded-card border border-dashed border-border bg-surface-bg/60 p-12 text-center">
          <h2 className="font-display text-2xl font-bold text-text-primary">Suita de marketing e parte din Tavli Pro</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
            Email, SMS și WhatsApp, șase campanii automate set-and-forget, segmentare pe șase dimensiuni și
            plafon de frecvență — toate cu planul Pro.
          </p>
          <Link
            href="/partner/billing"
            className="mt-5 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Treci la Pro
          </Link>
        </div>
      </div>
    );
  }

  const [campaigns, quotaRows] = await Promise.all([
    dbAdmin
      .select({
        id: marketingCampaigns.id,
        kind: marketingCampaigns.kind,
        triggeredCampaignKey: marketingCampaigns.triggeredCampaignKey,
        name: marketingCampaigns.name,
        status: marketingCampaigns.status,
        channel: marketingCampaigns.channel,
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
  ]);

  const usage = (channel: string) => {
    const row = quotaRows.find((q) => q.channel === channel);
    return { sent: row?.sentCount ?? 0, allowance: row?.includedAllowance ?? DEFAULT_ALLOWANCE[channel] };
  };
  const email = usage("email");
  const sms = usage("sms");
  const whatsapp = usage("whatsapp");

  // §11 v1.5 — quota alert at 80% / 100% of the included allowance.
  const channelsAtRisk = [
    { label: "Email", u: email },
    { label: "SMS", u: sms },
    { label: "WhatsApp", u: whatsapp },
  ].filter(({ u }) => u.allowance > 0 && u.sent / u.allowance >= 0.8);
  const overChannels = channelsAtRisk.filter(({ u }) => u.sent >= u.allowance);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <Header />

      {channelsAtRisk.length > 0 && (
        <div
          className={`rounded-card border p-5 ${
            overChannels.length > 0 ? "border-error/40 bg-error/5" : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className={`text-sm font-semibold ${overChannels.length > 0 ? "text-error" : "text-amber-900"}`}>
            {overChannels.length > 0
              ? `Ai depășit alocarea inclusă pe ${overChannels.map((c) => c.label).join(", ")}.`
              : `Aproape de limită pe ${channelsAtRisk.map((c) => c.label).join(", ")}.`}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Trimiterile peste alocare se facturează la suprataxă (€0,06/SMS, €0,03/WhatsApp; email gratuit).
          </p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Consum luna aceasta
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Email" value={`${email.sent} / ${email.allowance}`} icon={Mail} hint="incluse" />
          <StatCard label="SMS" value={`${sms.sent} / ${sms.allowance}`} icon={MessageSquare} hint="incluse" />
          <StatCard label="WhatsApp" value={`${whatsapp.sent} / ${whatsapp.allowance}`} icon={Phone} hint="incluse" />
        </div>
      </section>

      <Link
        href="/partner/marketing/segments"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary-dark hover:underline"
      >
        Construiește segmente de public →
      </Link>

      <MarketingManager organizationId={organizationId} campaigns={campaigns} />
    </div>
  );
}
