type RatingBadgeVariant = "inline" | "overlay";

interface RatingBadgeProps {
  rating: number;
  voteCount?: number;
  variant?: RatingBadgeVariant;
}

const variantClasses: Record<RatingBadgeVariant, string> = {
  inline: "bg-brand-primary-soft text-brand-primary-dark",
  overlay: "bg-black/45 backdrop-blur-sm text-white",
};

export function RatingBadge({
  rating,
  voteCount,
  variant = "inline",
}: RatingBadgeProps) {
  const formattedCount =
    voteCount !== undefined
      ? `(${voteCount.toLocaleString()})`
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm ${variantClasses[variant]}`}
    >
      <span>{rating.toFixed(1)}</span>
      <span>★</span>
      {formattedCount && <span>{formattedCount}</span>}
    </span>
  );
}
