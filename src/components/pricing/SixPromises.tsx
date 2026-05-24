/**
 * §15 §9 — the six contractual promises: the editorial centerpiece (§3.5).
 * A dark band gives the contract terms weight; each promise is marked with an
 * oversized Fraunces numeral (custom marker, not a generic check icon). Copy is
 * verbatim per the locked decision — never re-translated creatively.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function SixPromises({ messages }: { messages: PricingMessages }) {
  const { promises } = messages;
  return (
    <section className="mt-24 bg-text-primary py-20 text-surface-white md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          {promises.heading}
        </h2>
        <p className="mt-4 max-w-2xl font-display text-xl italic text-surface-white/70">
          {promises.intro}
        </p>

        <ol className="mt-14 grid gap-x-12 gap-y-12 md:grid-cols-2">
          {promises.items.map((promise, i) => (
            <li key={i} className="flex gap-5">
              <span
                aria-hidden
                className="select-none font-display text-5xl font-bold leading-none text-brand-primary"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-white/10 pl-5">
                <p className="font-display text-xl font-bold leading-snug">{promise.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-surface-white/70">{promise.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
