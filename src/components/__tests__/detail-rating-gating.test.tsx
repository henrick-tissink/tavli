import { render, screen } from "@testing-library/react";
import { RatingChip } from "@/components/rating-chip";

describe("RatingChip", () => {
  test("shows rating + count when voteCount >= 3", () => {
    render(<RatingChip rating={4.6} voteCount={42} />);
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
  test("renders nothing when voteCount < 3", () => {
    const { container } = render(<RatingChip rating={5} voteCount={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
