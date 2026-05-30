import { render, screen } from "@testing-library/react";
import { ReviewPolicyDisclosure } from "@/components/onboarding/review-policy-disclosure";

describe("ReviewPolicyDisclosure", () => {
  test("communicates the no-deletion policy", () => {
    render(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/nu ștergem și nu edităm/i)).toBeInTheDocument();
  });

  test("explains verified-reservation model", () => {
    render(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/verificate/i)).toBeInTheDocument();
    expect(screen.getByText(/rezervare reală/i)).toBeInTheDocument();
  });
});
