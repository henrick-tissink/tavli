import { RatingChip } from "tavli";
export const WithVotes = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <RatingChip rating={4.8} voteCount={126} />
    <RatingChip rating={4.2} voteCount={38} />
  </div>
);
