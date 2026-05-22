import { encryptAesGcm, decryptAesGcm } from "../crypto";
import { randomBytes } from "node:crypto";

const KEY = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round-trips plaintext through encrypt and decrypt", () => {
    const plaintext = "hello world — żółć €";
    const ciphertext = encryptAesGcm(plaintext, KEY);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptAesGcm(ciphertext, KEY)).toBe(plaintext);
  });

  it("returns null when ciphertext is tampered with", () => {
    const plaintext = "secret";
    const ciphertext = encryptAesGcm(plaintext, KEY);
    const tampered = ciphertext.slice(0, -2) + "AA";
    expect(decryptAesGcm(tampered, KEY)).toBeNull();
  });

  it("returns null when key is wrong", () => {
    const plaintext = "secret";
    const ciphertext = encryptAesGcm(plaintext, KEY);
    const otherKey = randomBytes(32).toString("base64");
    expect(decryptAesGcm(ciphertext, otherKey)).toBeNull();
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const plaintext = "stable input";
    const a = encryptAesGcm(plaintext, KEY);
    const b = encryptAesGcm(plaintext, KEY);
    expect(a).not.toBe(b);
    expect(decryptAesGcm(a, KEY)).toBe(plaintext);
    expect(decryptAesGcm(b, KEY)).toBe(plaintext);
  });
});
