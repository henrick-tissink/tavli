/**
 * @jest-environment node
 */
import { signSendToken, verifySendToken } from "@/lib/marketing/tokens";

const payload = { campaignId: "c1", dinerId: "d1" };

describe("send tokens", () => {
  test("a signed token verifies", () => {
    const tok = signSendToken("s1", payload);
    expect(verifySendToken("s1", tok, payload)).toBe(true);
  });

  test("token bound to the send id — not reusable across sends", () => {
    const tok = signSendToken("s1", payload);
    expect(verifySendToken("s2", tok, payload)).toBe(false);
  });

  test("token bound to the diner — not reusable across diners", () => {
    const tok = signSendToken("s1", payload);
    expect(verifySendToken("s1", tok, { campaignId: "c1", dinerId: "OTHER" })).toBe(false);
  });

  test("tampered token rejected", () => {
    const tok = signSendToken("s1", payload);
    expect(verifySendToken("s1", tok.slice(0, -1) + "X", payload)).toBe(false);
  });
});
