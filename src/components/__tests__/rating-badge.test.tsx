import { render, screen } from "@testing-library/react";
import { RatingBadge } from "../rating-badge";

describe("RatingBadge", () => {
  it("renders rating", () => {
    render(<RatingBadge rating={4.5} />);
    expect(screen.getByText("4.5")).toBeInTheDocument();
  });

  it("renders star icon", () => {
    render(<RatingBadge rating={4.5} />);
    expect(screen.getByText("★")).toBeInTheDocument();
  });

  it("applies inline variant classes by default", () => {
    const { container } = render(<RatingBadge rating={4.5} />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("bg-brand-primary-soft", "text-brand-primary-dark");
  });

  it("applies overlay variant classes", () => {
    const { container } = render(<RatingBadge rating={4.5} variant="overlay" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("bg-black/45", "text-white");
  });

  it("renders formatted vote count", () => {
    render(<RatingBadge rating={4.5} voteCount={1234} />);
    expect(screen.getByText("(1.234)")).toBeInTheDocument();
  });

  it("does not render vote count when not provided", () => {
    const { container } = render(<RatingBadge rating={4.5} />);
    expect(container.textContent).not.toContain("(");
  });
});
