import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FrequencyPricing } from "../FrequencyPricing";
import type { PricingMessages } from "@/lib/i18n/load-messages";

const messages = {
  frequency: {
    label: "Billing",
    monthly: "Monthly",
    annual: "Annual",
    annualBadge: "-2 months",
    annualTooltip: "Save with annual",
  },
} as unknown as PricingMessages;

function setHash(h: string) {
  window.history.replaceState(null, "", h || window.location.pathname);
}

describe("FrequencyPricing", () => {
  afterEach(() => setHash(""));

  it("does NOT rewrite an unrelated URL hash on mount (audit #7)", async () => {
    setHash("#faq");
    const spy = jest.spyOn(window.history, "replaceState");
    await act(async () => {
      render(<FrequencyPricing messages={messages}>child</FrequencyPricing>);
    });
    // Mount must not touch the hash — the #faq deep-link has to survive.
    expect(spy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#faq");
    spy.mockRestore();
  });

  it("writes the hash only on an actual user toggle", async () => {
    setHash("");
    const user = userEvent.setup();
    await act(async () => {
      render(<FrequencyPricing messages={messages}>child</FrequencyPricing>);
    });
    expect(window.location.hash).toBe("");
    await user.click(screen.getByRole("radio", { name: /annual/i }));
    expect(window.location.hash).toBe("#annual");
  });
});
