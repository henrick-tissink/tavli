import { render, screen } from "@testing-library/react";
import { ReviewPolicyDisclosure } from "@/components/onboarding/review-policy-disclosure";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roOnb from "@/messages/ro/partner.onboarding.json";
import roCommon from "@/messages/ro/partner.common.json";

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <MessagesProvider
      locale="ro"
      bundle={{ "partner.onboarding": roOnb, "partner.common": roCommon }}
    >
      {ui}
    </MessagesProvider>,
  );
}

describe("ReviewPolicyDisclosure", () => {
  test("communicates the no-deletion policy", () => {
    renderWithProvider(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/nu ștergem și nu edităm/i)).toBeInTheDocument();
  });

  test("explains verified-reservation model", () => {
    renderWithProvider(<ReviewPolicyDisclosure />);
    expect(screen.getByText(/verificate/i)).toBeInTheDocument();
    expect(screen.getByText(/rezervare reală/i)).toBeInTheDocument();
  });
});
