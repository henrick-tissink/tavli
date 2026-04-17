import type { Review } from "@/lib/types";
import { Avatar } from "./avatar";

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
        Booked: {review.reservationDate} &middot; {review.guestCount} guests
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
        onClick={() => onHelpful?.(review.id)}
        className="mt-2 text-xs bg-surface-bg rounded-lg px-3 py-1 hover:bg-gray-200 transition-colors"
      >
        👍 Helpful ({review.helpfulCount})
      </button>

      {/* Restaurant reply */}
      {review.restaurantReply && (
        <div className="ml-12 mt-3 bg-surface-bg rounded-card p-3">
          <div className="flex items-center gap-2">
            <span>🏪</span>
            <span className="font-bold text-xs text-text-primary">
              Restaurant reply
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
