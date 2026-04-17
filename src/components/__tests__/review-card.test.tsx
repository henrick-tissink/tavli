import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewCard } from "../review-card";
import type { Review } from "@/lib/types";

const reviewWithReply: Review = {
  id: "r1",
  authorName: "Maria Popescu",
  rating: 4,
  date: "2026-04-10",
  reservationDate: "2026-04-08",
  guestCount: 2,
  text: "Great food and nice ambiance.",
  helpfulCount: 8,
  restaurantReply: {
    text: "Thank you, Maria!",
    authorName: "Alexandru",
    authorTitle: "Manager",
    date: "2026-04-11",
  },
};

const reviewWithoutReply: Review = {
  id: "r2",
  authorName: "Ion Dumitrescu",
  rating: 5,
  date: "2026-03-28",
  reservationDate: "2026-03-26",
  guestCount: 3,
  text: "Absolutely incredible experience.",
  helpfulCount: 12,
};

const reviewNoText: Review = {
  id: "r3",
  authorName: "Elena Stanescu",
  rating: 3,
  date: "2026-03-15",
  reservationDate: "2026-03-14",
  guestCount: 2,
  text: "",
  helpfulCount: 0,
};

describe("ReviewCard", () => {
  it("renders author name", () => {
    render(<ReviewCard review={reviewWithReply} />);
    expect(screen.getByText("Maria Popescu")).toBeInTheDocument();
  });

  it("renders stars", () => {
    render(<ReviewCard review={reviewWithReply} />);
    const stars = screen.getByTestId("review-stars");
    expect(stars).toBeInTheDocument();
    // 4-star review: 4 filled + 1 empty = 5 total star elements
    expect(stars.children).toHaveLength(5);
  });

  it("renders review text", () => {
    render(<ReviewCard review={reviewWithReply} />);
    expect(screen.getByText("Great food and nice ambiance.")).toBeInTheDocument();
  });

  it("renders helpful count", () => {
    render(<ReviewCard review={reviewWithReply} />);
    expect(screen.getByText(/Helpful \(8\)/)).toBeInTheDocument();
  });

  it("renders reply when present", () => {
    render(<ReviewCard review={reviewWithReply} />);
    expect(screen.getByText("Thank you, Maria!")).toBeInTheDocument();
    expect(screen.getByText(/Alexandru/)).toBeInTheDocument();
  });

  it("hides reply when absent", () => {
    render(<ReviewCard review={reviewWithoutReply} />);
    expect(screen.queryByText(/Manager/)).not.toBeInTheDocument();
  });

  it("hides text when empty", () => {
    const { container } = render(<ReviewCard review={reviewNoText} />);
    // Should not have a review text paragraph
    expect(screen.queryByTestId("review-text")).not.toBeInTheDocument();
  });
});
