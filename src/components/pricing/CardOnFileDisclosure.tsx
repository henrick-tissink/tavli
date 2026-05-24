/**
 * §15 §7.4 — card-on-file / day-91 disclosure, shown under each tier CTA.
 * PSD2/SCA + ANPC require this be visible up front, not buried in checkout.
 * "Cancel anytime" is link-styled and routes to the FAQ cancellation entry.
 */
import type { PricingMessages } from "@/lib/i18n/load-messages";

export function CardOnFileDisclosure({ messages }: { messages: PricingMessages }) {
  const { cardOnFile } = messages;
  return (
    <p className="mt-4 text-[13px] leading-relaxed text-text-secondary">
      <span className="font-semibold text-text-primary">{cardOnFile.title}</span>{" "}
      {cardOnFile.body}{" "}
      <a
        href="#faq"
        className="font-medium text-brand-primary-dark underline decoration-brand-primary/40 underline-offset-2 hover:decoration-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        {cardOnFile.cancelText}
      </a>
    </p>
  );
}
