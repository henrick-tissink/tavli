import { render, screen } from "@testing-library/react";
import { ReviewPolicyDisclosure } from "@/components/onboarding/review-policy-disclosure";

describe("ReviewPolicyDisclosure", () => {
  test("communicates the no-deletion policy", () => {
    render(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/don't remove or edit/i)).toBeInTheDocument();
  });

  test("explains verified-reservation model", () => {
    render(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.getByText(/real reservation/i)).toBeInTheDocument();
  });
});
