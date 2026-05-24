/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { mapStripeStatus } from "../stripe-status";

describe("mapStripeStatus", () => {
  it("passes through the shared statuses", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("unpaid");
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
  });

  it("maps American 'canceled' + 'incomplete_expired' to local 'cancelled'", () => {
    expect(mapStripeStatus("canceled")).toBe("cancelled");
    expect(mapStripeStatus("incomplete_expired")).toBe("cancelled");
  });

  it("maps 'paused' to 'trialing' (no charge yet)", () => {
    expect(mapStripeStatus("paused")).toBe("trialing");
  });
});
