import { render } from "@testing-library/react";
import { PostVisitReviewEmail } from "@/emails/PostVisitReviewEmail";

describe("PostVisitReviewEmail", () => {
  const props = {
    restaurantName: "Trattoria Roma",
    guestName: "Henrick Tissink",
    reviewBaseUrl: "https://tavli.ro/reviews/abc123",
  };

  test("renders restaurant name in heading", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    expect(container.textContent).toContain("Trattoria Roma");
  });

  test("greets the guest by first name only", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    expect(container.textContent).toContain("Henrick");
    expect(container.textContent).not.toContain("Tissink");
  });

  test("renders five rating links with rating query param 1..5", () => {
    const { container } = render(<PostVisitReviewEmail {...props} />);
    const links = Array.from(container.querySelectorAll("a"))
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h && h.includes("/reviews/"));
    expect(links).toEqual([
      "https://tavli.ro/reviews/abc123?rating=1",
      "https://tavli.ro/reviews/abc123?rating=2",
      "https://tavli.ro/reviews/abc123?rating=3",
      "https://tavli.ro/reviews/abc123?rating=4",
      "https://tavli.ro/reviews/abc123?rating=5",
    ]);
  });
});
