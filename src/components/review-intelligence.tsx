"use client";

import type { ReviewIntelligence } from "@/lib/types";
import { SentimentBar } from "./sentiment-bar";
import { Pill } from "./pill";
import { useT } from "@/lib/i18n/messages-provider";

interface ReviewIntelligenceSectionProps {
  intelligence: ReviewIntelligence;
  totalReviews: number;
}

export function ReviewIntelligenceSection({
  intelligence,
  totalReviews,
}: ReviewIntelligenceSectionProps) {
  const t = useT("restaurant");
  return (
    <div>
      <h3 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
        {t("reviewIntelligence.title")}
      </h3>

      <div className="mt-3 space-y-2">
        {intelligence.dimensions.map((dim) => (
          <SentimentBar
            key={dim.label}
            icon={dim.icon}
            label={dim.label}
            percent={dim.percent}
            mentionCount={dim.mentionCount}
          />
        ))}
      </div>

      <p className="text-xs text-text-muted mt-2">
        {t("reviewIntelligence.basedOn", { count: totalReviews })}
      </p>

      <hr className="border-border my-4" />

      <h4 className="text-base font-bold text-text-primary mt-4">{t("reviewIntelligence.topMentionsTitle")}</h4>
      {/* Recurring guest phrases as editorial quote-chips — the italic display
          serif gives them a "what people keep saying" voice; the most-mentioned
          one is highlighted. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {intelligence.topMentions.map((mention, i) => (
          <span
            key={mention.phrase}
            className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 ${
              i === 0
                ? "border-brand-primary/30 bg-brand-primary-soft"
                : "border-border bg-surface-bg"
            }`}
          >
            {i === 0 && <span aria-hidden>🔥</span>}
            <span className="font-display italic text-sm text-text-primary">
              &ldquo;{mention.phrase}&rdquo;
            </span>
            <span className="text-xs font-bold text-brand-primary-dark tabular-nums">
              {mention.count}&times;
            </span>
          </span>
        ))}
      </div>

      <hr className="border-border my-4" />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-text-primary">{t("reviewIntelligence.bestForTitle")}</span>
        {intelligence.bestFor.map((tag) => (
          <Pill key={tag} label={tag} />
        ))}
      </div>
    </div>
  );
}
