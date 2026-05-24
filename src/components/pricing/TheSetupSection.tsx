/**
 * §15 §8 — "The setup" as a visual timeline (not a checklist, per §3.5):
 * a connected row of numbered steps on desktop, a left-rail on mobile, with a
 * duration badge per step and a "Pro only" tag on the fifth. The founder quote
 * sits beneath as a large pull-quote.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function TheSetupSection({ messages }: { messages: PricingMessages }) {
  const { setup } = messages;
  return (
    <section className="mx-auto mt-24 max-w-5xl px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-primary">
        {setup.eyebrow}
      </p>
      <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
        {setup.heading}
      </h2>
      <p className="mt-3 max-w-2xl text-text-secondary">{setup.intro}</p>

      <ol className="relative mt-14 grid gap-10 md:grid-cols-5 md:gap-6">
        {/* connector rail (desktop) */}
        <div
          aria-hidden
          className="absolute left-[7%] right-[7%] top-7 hidden h-px bg-border md:block"
        />
        {setup.steps.map((step, i) => (
          <li key={i} className="relative flex gap-5 md:flex-col md:gap-0">
            <span
              aria-hidden
              className="z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-white font-display text-xl font-bold text-text-primary shadow-card ring-1 ring-border"
            >
              {i + 1}
            </span>
            <div className="md:mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold text-text-primary">{step.title}</h3>
                {step.proOnly && (
                  <span className="rounded-pill bg-brand-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-primary-dark">
                    Pro
                  </span>
                )}
              </div>
              <span className="mt-1 inline-block rounded-pill bg-surface-bg px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary ring-1 ring-border">
                {step.badge}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <figure className="mx-auto mt-16 max-w-3xl rounded-card bg-surface-warm/50 p-8 text-center md:p-10">
        <blockquote className="font-display text-2xl font-medium italic leading-snug text-text-primary md:text-[28px]">
          “{setup.quote}”
        </blockquote>
        <figcaption className="mt-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
          {setup.quoteAttribution}
        </figcaption>
      </figure>
    </section>
  );
}
