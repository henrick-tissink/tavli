/**
 * §15 §3.4 (locked) — the customer-facing pricing copy states the offer on its
 * own terms and never names a competitor. This guards the trilingual message
 * files so a future copy edit can't reintroduce one. (feedback_pricing_no_competitor_naming)
 */
import ro from "@/messages/ro/pricing.json";
import en from "@/messages/en/pricing.json";
import de from "@/messages/de/pricing.json";

// Incumbent RO booking platforms + common comparison targets. Internal strategy
// docs may name these; the public page may not.
const FORBIDDEN = ["ialoc", "opentable", "thefork", "resy", "quandoo", "bookatable", "sevenrooms"];

describe("pricing copy contains no competitor names", () => {
  it.each([
    ["ro", ro],
    ["en", en],
    ["de", de],
  ])("%s/pricing.json", (_locale, catalogue) => {
    const haystack = JSON.stringify(catalogue).toLowerCase();
    for (const name of FORBIDDEN) {
      expect(haystack).not.toContain(name);
    }
  });
});
