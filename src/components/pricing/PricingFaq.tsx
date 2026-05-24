/**
 * §15 §6.2 / §7.4 — trilingual FAQ. Native <details>/<summary> accordion for
 * keyboard + screen-reader accessibility; summary rows are ≥44px (§10a item 6).
 * Anchored #faq so the card-on-file "cancel anytime" link lands here.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function PricingFaq({ messages }: { messages: PricingMessages }) {
  const { faq } = messages;
  return (
    <section id="faq" className="mx-auto mt-24 mb-28 max-w-3xl px-6 scroll-mt-24">
      <h2 className="font-display text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
        {faq.heading}
      </h2>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {faq.items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-text-primary [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
              {item.label}
              <span
                aria-hidden
                className="shrink-0 text-xl font-normal text-brand-primary transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="pb-5 pr-8 text-sm leading-relaxed text-text-secondary">{item.body}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
