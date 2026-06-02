import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, marketingSegments } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { SegmentBuilder } from "./_components/SegmentBuilder";

export const dynamic = "force-dynamic";

export default async function MarketingSegmentsPage() {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.marketing");
  const bundle = buildBundle(locale, ["partner.common", "partner.marketing"]);

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
  if (!organizationId || !allowed) redirect("/partner/marketing");

  const sub = await loadActiveSubscription(organizationId);
  if (sub?.tier !== "pro") redirect("/partner/marketing");

  const segments = await dbAdmin
    .select({
      id: marketingSegments.id,
      name: marketingSegments.name,
      estimatedSize: marketingSegments.estimatedSize,
      combinator: marketingSegments.combinator,
    })
    .from(marketingSegments)
    .where(eq(marketingSegments.organizationId, organizationId))
    .orderBy(desc(marketingSegments.createdAt));

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <header>
          <Link href="/partner/marketing" className="text-sm text-text-secondary hover:text-text-primary">
            ← {m.page.title}
          </Link>
          <h1 className="mt-2 font-display text-4xl text-text-primary">{m.segments.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {m.segments.subtitle}
          </p>
        </header>

        <SegmentBuilder organizationId={organizationId} />

        {segments.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {m.segments.savedTitle}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-white">
              {segments.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                  <span className="font-medium text-text-primary">{s.name}</span>
                  <span className="text-text-muted">
                    {s.estimatedSize != null
                      ? interpolate(m.segments.savedSize, { count: s.estimatedSize })
                      : m.segments.savedSizeEmpty}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </MessagesProvider>
  );
}
