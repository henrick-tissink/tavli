const MIN_VOTES_TO_SHOW = 3;

interface Props {
  rating: number | null | undefined;
  voteCount: number;
  className?: string;
}

export function RatingChip({ rating, voteCount, className }: Props) {
  if (!rating || voteCount < MIN_VOTES_TO_SHOW) return null;
  return (
    <span className={className ?? "inline-flex items-center gap-1 text-sm"}>
      <span aria-hidden className="text-brand-primary">★</span>
      <span className="font-semibold">{rating.toFixed(1)}</span>
      <span className="text-text-muted">({voteCount})</span>
    </span>
  );
}
