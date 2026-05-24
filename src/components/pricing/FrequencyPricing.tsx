"use client";

/**
 * §15 §6.3 — the one client component on the pricing page. It owns the
 * Monthly/Annual choice and projects it onto otherwise-static server markup:
 *   - sets `data-frequency` on a wrapper so CSS reveals the active price set
 *     and de-emphasises the off-cadence year-one rows (see globals.css),
 *   - keeps the choice in the URL hash so `/pricing#annual` deep-links work,
 *   - rewrites each tier CTA's `frequency` query param for the §01 signup flow.
 * Default (no JS) renders monthly, which the server already emitted.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PricingMessages } from "@/lib/i18n/load-messages";

type Frequency = "monthly" | "annual";

function FrequencyOption({
  active,
  label,
  badge,
  tooltip,
  onSelect,
}: {
  active: boolean;
  label: string;
  badge?: string;
  tooltip?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={[
        "relative inline-flex min-h-[44px] items-center gap-2 rounded-pill px-6 py-2.5 text-sm font-semibold transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
        active
          ? "bg-text-primary text-surface-white shadow-card"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span
          title={tooltip}
          className={[
            "rounded-pill px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            active ? "bg-brand-primary text-white" : "bg-brand-primary-soft text-brand-primary-dark",
          ].join(" ")}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function FrequencyPricing({
  messages,
  children,
}: {
  messages: PricingMessages;
  children: ReactNode;
}) {
  const { frequency } = messages;
  const [freq, setFreq] = useState<Frequency>("monthly");
  const wrapRef = useRef<HTMLDivElement>(null);
  // audit #7 — only an actual user toggle may write the URL hash. On mount the
  // projection effect must NOT rewrite the hash, or it clobbers deep-links like
  // /pricing#faq (the "cancel anytime" anchor) and stamps a spurious #monthly.
  const userToggled = useRef(false);

  function choose(next: Frequency) {
    userToggled.current = true;
    setFreq(next);
  }

  // Init from deep-link hash on mount. This must be an effect (not a useState
  // initializer): the URL hash isn't sent to the server, so reading it during
  // SSR is impossible — the client reconciles after hydration. This is a
  // programmatic sync, not a user toggle, so it never writes the hash back.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe deep-link read; see above
    if (window.location.hash === "#annual") setFreq("annual");
  }, []);

  // Project the choice onto the URL hash + the signup CTAs.
  useEffect(() => {
    // Hash is written only after the user toggles — never on mount / deep-link
    // sync, so an unrelated existing hash (#faq, …) is preserved.
    if (userToggled.current) {
      const hash = freq === "annual" ? "#annual" : "#monthly";
      if (window.location.hash !== hash) {
        window.history.replaceState(null, "", hash);
      }
    }
    const ctas = wrapRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-cta]");
    ctas?.forEach((a) => {
      const base = a.dataset.hrefBase;
      if (base) a.href = `${base}&frequency=${freq}`;
    });
  }, [freq]);

  return (
    <>
      <div className="mx-auto mb-10 flex flex-col items-center gap-3 px-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          {frequency.label}
        </span>
        <div
          role="radiogroup"
          aria-label={frequency.label}
          className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-white p-1 shadow-card"
        >
          <FrequencyOption
            active={freq === "monthly"}
            label={frequency.monthly}
            onSelect={() => choose("monthly")}
          />
          <FrequencyOption
            active={freq === "annual"}
            label={frequency.annual}
            badge={frequency.annualBadge}
            tooltip={frequency.annualTooltip}
            onSelect={() => choose("annual")}
          />
        </div>
      </div>
      <div ref={wrapRef} data-frequency={freq}>
        {children}
      </div>
    </>
  );
}
