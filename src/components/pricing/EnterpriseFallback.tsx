/**
 * §15 §7 — "Running five or more locations?" enterprise fallback. Routes
 * prospects into the §10 manual sales conversation via mailto.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function EnterpriseFallback({ messages }: { messages: PricingMessages }) {
  const { enterprise } = messages;
  return (
    <section className="mx-auto mt-24 max-w-3xl px-6">
      <div className="rounded-card bg-brand-primary-soft p-8 md:p-12">
        <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
          {enterprise.heading}
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-text-secondary">{enterprise.body}</p>
        <a
          href={`mailto:${enterprise.email}`}
          className="mt-6 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          {enterprise.cta}
        </a>
      </div>
    </section>
  );
}
