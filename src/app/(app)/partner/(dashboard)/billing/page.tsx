import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, invoices as invoicesTable } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { loadBillingAccess } from "@/lib/billing/dunning";
import { TIER_PRICES } from "@/lib/pricing/tier-prices";
import { formatEur } from "@/lib/pricing/display";
import { BillingActionsBar } from "./_components/BillingActionsBar";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(d) : null;

/** Whole days until the trial ends, or null when not trialing. Module-scoped so
 *  the impure `Date.now()` isn't called directly in the component render body. */
function trialDaysRemaining(status: string | undefined, endsAt: Date | null): number | null {
  if (status !== "trialing" || !endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
}

function tierAmountLabel(tier: "base" | "pro", frequency: "monthly" | "annual") {
  const t = TIER_PRICES.find((x) => x.key === tier)!;
  return frequency === "annual"
    ? `${formatEur(t.annualEurCents, "ro")}/an`
    : `${formatEur(t.monthlyEurCents, "ro")}/lună`;
}

function Header() {
  return (
    <header>
      <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Cont</p>
      <h1 className="mt-2 font-display text-4xl text-text-primary">Facturare</h1>
    </header>
  );
}

export default async function PartnerBillingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  // Billing is org-scoped; resolve the org from the session default or the venue.
  let organizationId = session.profile.defaultOrganizationId;
  if (!organizationId) {
    const restaurantId = await currentUserPrimaryRestaurant(session);
    if (restaurantId) {
      const [r] = await dbAdmin
        .select({ orgId: restaurants.organizationId })
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId));
      organizationId = r?.orgId ?? null;
    }
  }

  if (!organizationId || !(await can(session, "billing.read", { kind: "organization", id: organizationId }))) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        <Header />
        <div className="rounded-card border border-border bg-surface-white p-8 text-sm text-text-secondary">
          Facturarea e gestionată de proprietarul organizației. Contul tău nu are acces la facturare.
        </div>
      </div>
    );
  }

  const [subscription, access] = await Promise.all([
    loadActiveSubscription(organizationId),
    loadBillingAccess(organizationId),
  ]);

  const recentInvoices = await dbAdmin
    .select({
      id: invoicesTable.id,
      status: invoicesTable.status,
      amountDueCents: invoicesTable.amountDueCents,
      currency: invoicesTable.currency,
      hostedInvoiceUrl: invoicesTable.hostedInvoiceUrl,
      periodStart: invoicesTable.periodStart,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.organizationId, organizationId))
    .orderBy(desc(invoicesTable.periodStart))
    .limit(6);

  const periodEndLabel = fmtDate(subscription?.current_period_end ?? null);
  const trialDaysLeft = trialDaysRemaining(subscription?.status, subscription?.trial_ends_at ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-12">
      <Header />

      {/* Dunning banners (§12 §11.5) */}
      {access === "soft_lock" && (
        <div className="rounded-card border border-error/30 bg-error/5 p-5">
          <p className="text-sm font-semibold text-error">Plata a expirat — unele funcții sunt suspendate.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Actualizează cardul de mai jos pentru a relua accesul complet.
          </p>
        </div>
      )}
      {access === "read_only" && (
        <div className="rounded-card border border-error/40 bg-error/10 p-5">
          <p className="text-sm font-semibold text-error">Abonament suspendat — portalul e în doar-citire.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Actualizează cardul pentru a reactiva contul. Datele tale sunt în siguranță.
          </p>
        </div>
      )}

      {subscription ? (
        <>
          {trialDaysLeft !== null && (
            <div className="rounded-card border border-brand-primary/30 bg-brand-primary-soft p-5">
              <p className="text-sm font-semibold text-text-primary">
                Perioada gratuită se încheie în {trialDaysLeft}{" "}
                {trialDaysLeft === 1 ? "zi" : "zile"}.
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Pe {periodEndLabel} vom încasa {tierAmountLabel(subscription.tier, subscription.frequency)} de pe
                cardul salvat. Anulează oricând până atunci.
              </p>
            </div>
          )}

          <section className="rounded-card bg-surface-white p-8 shadow-card ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Planul tău</p>
                <h2 className="mt-1 font-display text-2xl text-text-primary">
                  {subscription.tier === "pro" ? "Tavli Pro" : "Tavli"}
                </h2>
              </div>
              <span className="font-display text-2xl font-bold text-text-primary">
                {tierAmountLabel(subscription.tier, subscription.frequency)}
              </span>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 text-sm">
              <div>
                <dt className="text-text-muted">Stare</dt>
                <dd className="mt-0.5 font-medium text-text-primary capitalize">{subscription.status}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Facturare</dt>
                <dd className="mt-0.5 font-medium text-text-primary">
                  {subscription.frequency === "annual" ? "Anual" : "Lunar"}
                </dd>
              </div>
              {periodEndLabel && (
                <div>
                  <dt className="text-text-muted">Următoarea reînnoire</dt>
                  <dd className="mt-0.5 font-medium text-text-primary">{periodEndLabel}</dd>
                </div>
              )}
              {subscription.items.some((i) => i.kind === "extra_location") && (
                <div>
                  <dt className="text-text-muted">Locații suplimentare</dt>
                  <dd className="mt-0.5 font-medium text-text-primary">
                    {subscription.items.find((i) => i.kind === "extra_location")?.quantity ?? 0}
                  </dd>
                </div>
              )}
            </dl>

            {subscription.pending_frequency_change && (
              <p className="mt-5 rounded-button bg-surface-bg px-4 py-3 text-xs text-text-secondary">
                Schimbare programată la {periodEndLabel}: facturare{" "}
                {subscription.pending_frequency_change === "annual" ? "anuală" : "lunară"}.
              </p>
            )}
          </section>

          <BillingActionsBar
            organizationId={organizationId}
            currentTier={subscription.tier}
            currentFrequency={subscription.frequency}
            periodEndLabel={periodEndLabel}
            readOnly={access === "read_only"}
          />

          {recentInvoices.length > 0 && (
            <section>
              <h2 className="font-display text-lg text-text-primary">Facturi recente</h2>
              <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface-white">
                {recentInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                    <span className="text-text-secondary">{fmtDate(inv.periodStart) ?? "—"}</span>
                    <span className="font-medium text-text-primary">
                      {formatEur(inv.amountDueCents, "ro")}
                    </span>
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-primary-dark underline underline-offset-2"
                      >
                        Vezi
                      </a>
                    ) : (
                      <span className="capitalize text-text-muted">{inv.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="rounded-card bg-surface-white p-8 shadow-card ring-1 ring-border">
          <h2 className="font-display text-2xl text-text-primary">Niciun abonament activ</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Organizația ta nu are încă un abonament Tavli. Începe perioada gratuită de 3 luni — nu plătești
            nimic până în ziua 91.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Vezi planurile
          </Link>
        </section>
      )}
    </div>
  );
}
