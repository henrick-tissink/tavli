/**
 * §15 §6.2 — editorial pricing hero. Display-scale Fraunces headline, the
 * accent line set in italic with an orange underline flourish. Server component.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function PricingHero({ messages }: { messages: PricingMessages }) {
  const { hero } = messages;
  return (
    <header className="relative overflow-hidden">
      {/* warm radial wash for atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 12% -10%, #FFF7ED 0%, #FAFAF9 45%, #FAFAF9 100%)",
        }}
      />
      <div className="mx-auto max-w-5xl px-6 pt-20 pb-14 md:pt-28 md:pb-20">
        <p className="animate-pricing-rise text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary">
          {hero.eyebrow}
        </p>
        <h1 className="animate-pricing-rise mt-5 font-display text-[clamp(3rem,9vw,6rem)] font-bold leading-[0.95] tracking-tight text-text-primary [animation-delay:60ms]">
          {hero.title}
          <br />
          <span className="relative inline-block italic text-brand-primary">
            {hero.titleAccent}
            <svg
              aria-hidden
              viewBox="0 0 300 14"
              preserveAspectRatio="none"
              className="absolute -bottom-2 left-0 h-3 w-full text-brand-primary/40"
            >
              <path
                d="M2 9 C 70 2, 150 2, 298 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>
        <p className="animate-pricing-rise mt-8 max-w-2xl text-lg leading-relaxed text-text-secondary [animation-delay:120ms]">
          {hero.subtitle}
        </p>
        <p className="animate-pricing-rise mt-7 inline-flex items-center gap-2 rounded-pill bg-surface-white px-4 py-2 text-sm font-semibold text-text-primary shadow-card [animation-delay:180ms]">
          <span aria-hidden className="h-2 w-2 rounded-full bg-brand-primary" />
          {hero.trialNote}
        </p>
      </div>
    </header>
  );
}
