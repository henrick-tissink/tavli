/**
 * AES-256-GCM helpers — used by the impersonation return cookie (§01 §5a.3 phase 2).
 *
 * Uses node:crypto stdlib. Format: base64url(iv || tag || ciphertext).
 * GCM auth tag protects against tampering. Wrong key OR tampered payload → null.
 */

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptAesGcm(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("crypto: AES-256-GCM requires a 32-byte key.");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptAesGcm(payload: string, keyBase64: string): string | null {
  try {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) return null;
    const buf = Buffer.from(payload, "base64url");
    if (buf.length < IV_LENGTH + TAG_LENGTH) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
