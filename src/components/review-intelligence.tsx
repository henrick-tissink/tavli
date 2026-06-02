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
      <ul className="mt-2 space-y-1">
        {intelligence.topMentions.map((mention, i) => (
          <li key={mention.phrase} className="text-sm text-text-primary">
            {i === 0 && "🔥 "}
            &ldquo;{mention.phrase}&rdquo; &middot;&middot;&middot; {mention.count}&times;
          </li>
        ))}
      </ul>

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
