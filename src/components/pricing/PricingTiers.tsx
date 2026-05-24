/**
 * §15 §6.2 / §7 — the two tier cards. Both the monthly and annual-effective
 * figures are rendered; the frequency toggle (FrequencyPricing) reveals one set
 * via `data-when`. Pro is visually elevated with an accent ring + ribbon (§7.2).
 * RON dual-display + the BNR footnote sit below the grid (§6.4).
 */
import type { PricingMessages, Locale, TierContent } from "@/lib/i18n/load-messages";
import type { PricingPrimitives, RonRate } from "@/lib/pricing/load-primitives";
import type { TierPrice } from "@/lib/pricing/tier-prices";
import {
  annualEffectiveMonthlyCents,
  formatEur,
  formatRon,
  ronFromEurCents,
} from "@/lib/pricing/display";
import { CardOnFileDisclosure } from "./CardOnFileDisclosure";
import { WaitlistButton } from "./WaitlistButton";

function PriceBlock({
  cadence,
  eurCents,
  perMonth,
  ronRate,
  locale,
  messages,
}: {
  cadence: "monthly" | "annual";
  eurCents: number;
  perMonth: string;
  ronRate: RonRate | null;
  locale: Locale;
  messages: PricingMessages;
}) {
  const ron = ronRate ? ronFromEurCents(eurCents, ronRate.rate) : null;
  return (
    <div data-when={cadence} className="flex items-baseline gap-2">
      <span className="font-display text-6xl font-bold tracking-tight text-text-primary tabular-nums">
        {formatEur(eurCents, locale)}
      </span>
      <span className="pb-1.5 text-base font-medium text-text-secondary">{perMonth}</span>
      {ron !== null && (
        <span className="pb-1.5 ml-1 text-sm italic text-text-muted">
          {messages.ron.prefix}
          {formatRon(ron, locale)}
        </span>
      )}
    </div>
  );
}

function TierCard({
  tier,
  content,
  locale,
  messages,
  ronRate,
  featured,
  signupEnabled,
}: {
  tier: TierPrice;
  content: TierContent;
  locale: Locale;
  messages: PricingMessages;
  ronRate: RonRate | null;
  featured: boolean;
  signupEnabled: boolean;
}) {
  const annualMonthlyCents = annualEffectiveMonthlyCents(tier.annualEurCents);
  const hrefBase = `/partner/sign-up?tier=${tier.key}`;

  return (
    <article
      className={[
        "relative flex flex-col rounded-card bg-surface-white p-8 transition-shadow md:p-10",
        featured
          ? "shadow-card-hover ring-2 ring-brand-primary md:-translate-y-3"
          : "shadow-card ring-1 ring-border",
      ].join(" ")}
    >
      {featured && content.ribbon && (
        <span className="absolute -top-3 left-8 rounded-pill bg-brand-primary px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-card">
          {content.ribbon}
        </span>
      )}

      <h3 className="font-display text-2xl font-bold text-text-primary">{content.name}</h3>
      <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-text-secondary">
        {content.tagline}
      </p>

      <div className="mt-6">
        <PriceBlock
          cadence="monthly"
          eurCents={tier.monthlyEurCents}
          perMonth={content.perMonth}
          ronRate={ronRate}
          locale={locale}
          messages={messages}
        />
        <PriceBlock
          cadence="annual"
          eurCents={annualMonthlyCents}
          perMonth={content.perMonth}
          ronRate={ronRate}
          locale={locale}
          messages={messages}
        />
      </div>

      {signupEnabled ? (
        <a
          data-cta
          data-href-base={hrefBase}
          href={`${hrefBase}&frequency=monthly`}
          className={[
            "mt-7 inline-flex min-h-[48px] items-center justify-center rounded-button px-6 py-3 text-sm font-bold transition-all active:scale-[0.98]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
            featured
              ? "bg-brand-primary text-white shadow-card hover:bg-brand-primary-dark"
              : "bg-text-primary text-surface-white hover:bg-text-primary/90",
          ].join(" ")}
        >
          {content.cta} → {content.name}
        </a>
      ) : (
        <WaitlistButton messages={messages} locale={locale} featured={featured} />
      )}

      <CardOnFileDisclosure messages={messages} />

      <p className="mt-7 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {content.includedHeading}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {content.bullets.map((bullet, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-text-primary">
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-[11px] font-bold text-brand-primary-dark"
            >
              ✓
            </span>
            <span className="sr-only">{messages.a11y.included}: </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <p className="mt-7 border-t border-border pt-4 text-xs text-text-secondary">
        {content.note}
      </p>
    </article>
  );
}

export function PricingTiers({
  messages,
  primitives,
  locale,
  signupEnabled,
}: {
  messages: PricingMessages;
  primitives: PricingPrimitives;
  locale: Locale;
  signupEnabled: boolean;
}) {
  const { ronRate } = primitives;
  const base = primitives.tiers.find((t) => t.key === "base")!;
  const pro = primitives.tiers.find((t) => t.key === "pro")!;
  const footnote = ronRate
    ? messages.ron.footnote
        .replace("{rate}", ronRate.rate.toFixed(4))
        .replace("{date}", ronRate.effectiveDate)
    : null;
  const staleHint =
    ronRate?.staleness === "stale_1d"
      ? messages.ron.staleOneDay
      : ronRate && ronRate.staleness !== "fresh"
        ? messages.ron.staleWarn
        : null;

  return (
    <section className="mx-auto max-w-5xl px-6">
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
        <TierCard
          tier={base}
          content={messages.tiers.base}
          locale={locale}
          messages={messages}
          ronRate={ronRate}
          featured={false}
          signupEnabled={signupEnabled}
        />
        <TierCard
          tier={pro}
          content={messages.tiers.pro}
          locale={locale}
          messages={messages}
          ronRate={ronRate}
          featured
          signupEnabled={signupEnabled}
        />
      </div>

      {footnote && (
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-text-muted">
          {footnote}
          {staleHint && (
            <span title={staleHint} className="ml-1 cursor-help text-brand-primary-dark">
              {" "}
              ⚠
            </span>
          )}
        </p>
      )}

      <div className="mx-auto mt-10 max-w-2xl rounded-card bg-surface-white/60 p-5 text-center ring-1 ring-border">
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{messages.decisionHelp.heading}</span>{" "}
          {messages.decisionHelp.body}
        </p>
      </div>
    </section>
  );
}
