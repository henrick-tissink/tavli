"use client";

import { useState } from "react";
import type { Review } from "@/lib/types";
import { Avatar } from "./avatar";
import { useT } from "@/lib/i18n/messages-provider";

interface ReviewCardProps {
  review: Review;
  onHelpful?: (reviewId: string) => void;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div data-testid="review-stars" className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-sm ${i < rating ? "text-brand-primary" : "text-gray-300"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export function ReviewCard({ review, onHelpful }: ReviewCardProps) {
  const t = useT("restaurant");
  const [helped, setHelped] = useState(false);
  const count = review.helpfulCount + (helped ? 1 : 0);

  const handleHelpful = () => {
    setHelped((prev) => !prev);
    onHelpful?.(review.id);
  };

  return (
    <div className="py-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar name={review.authorName} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-text-primary">{review.authorName}</span>
            <span className="text-xs text-text-muted">{review.date}</span>
          </div>
          <StarRow rating={review.rating} />
        </div>
      </div>

      {/* Booking context */}
      <p className="text-xs text-text-muted mt-1">
        {t("reviewCard.bookedContext", {
          date: review.reservationDate,
          count: review.guestCount,
          unit: review.guestCount === 1 ? t("reviewCard.guestOne") : t("reviewCard.guestOther"),
        })}
      </p>

      {/* Review text */}
      {review.text && (
        <p data-testid="review-text" className="text-sm text-text-primary mt-2">
          {review.text}
        </p>
      )}

      {/* Helpful button */}
      <button
        type="button"
        onClick={handleHelpful}
        aria-pressed={helped}
        className={`mt-2 text-xs rounded-lg px-3 py-1 transition-colors ${
          helped
            ? "bg-brand-primary-soft text-brand-primary-dark"
            : "bg-surface-bg hover:bg-gray-200"
        }`}
      >
        {t("reviewCard.helpful", { count })}
      </button>

      {/* Restaurant reply */}
      {review.restaurantReply && (
        <div className="ml-12 mt-3 bg-surface-bg rounded-card p-3">
          <div className="flex items-center gap-2">
            <span>🏪</span>
            <span className="font-bold text-xs text-text-primary">
              {t("reviewCard.restaurantReply")}
            </span>
          </div>
          <p className="text-sm text-text-primary mt-1">
            {review.restaurantReply.text}
          </p>
          <p className="text-xs text-text-muted mt-1">
            — {review.restaurantReply.authorName}, {review.restaurantReply.authorTitle}
          </p>
        </div>
      )}
    </div>
  );
}
