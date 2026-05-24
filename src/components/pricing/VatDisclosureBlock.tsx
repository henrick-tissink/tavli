/**
 * §15 §6.4.1 — per-customer-type VAT disclosure (ANPC + EU VAT). Rendered as an
 * open-by-default <details> so it collapses to an accordion on mobile yet
 * satisfies the "prominent display" rule on first paint. Headline prices are
 * ex-VAT (Stripe tax_behavior: 'exclusive'); this panel explains how each
 * customer type pays from there.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function VatDisclosureBlock({ messages }: { messages: PricingMessages }) {
  const { vat } = messages;
  return (
    <section className="mx-auto mt-12 max-w-3xl px-6">
      <details
        open
        className="group rounded-card border border-border bg-surface-warm/40 p-6 md:p-7"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-text-primary [&::-webkit-details-marker]:hidden">
          {vat.heading}
          <span
            aria-hidden
            className="text-text-muted transition-transform group-open:rotate-180 md:hidden"
          >
            ▾
          </span>
        </summary>
        <p className="mt-4 text-sm font-medium text-text-secondary">{vat.intro}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {vat.types.map((t, i) => (
            <div key={i} className="rounded-button bg-surface-white/70 p-4">
              <dt className="text-sm font-semibold text-text-primary">{t.label}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-text-secondary">{t.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-text-muted">{vat.footer}</p>
      </details>
    </section>
  );
}
