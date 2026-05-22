import { randomBytes } from "node:crypto";
import {
  makeReadImpersonationReturnCookie,
  type ImpersonationReturnPayload,
} from "../impersonation-cookie";
import { encryptAesGcm } from "../crypto";

const KEY = randomBytes(32).toString("base64");

function validPayload(overrides: Partial<ImpersonationReturnPayload> = {}): ImpersonationReturnPayload {
  return {
    v: 1,
    adminUserId: "00000000-0000-0000-0000-00000000a000",
    adminEmail: "admin@tavli.com",
    targetUserId: "00000000-0000-0000-0000-00000000b000",
    targetEmail: "partner@example.com",
    startedAt: "2026-05-22T10:00:00.000Z",
    adminAccessToken: "access-token",
    adminRefreshToken: "refresh-token",
    ...overrides,
  };
}

function mockCookies(value: string | null) {
  return async () => ({
    get: (name: string) =>
      name === "tavli_impersonation_return" && value !== null
        ? { value }
        : undefined,
  });
}

describe("readImpersonationReturnCookie", () => {
  it("returns null when cookie is absent", async () => {
    const read = makeReadImpersonationReturnCookie({
      cookies: mockCookies(null),
      keyBase64: KEY,
    });
    expect(await read()).toBeNull();
  });

  it("returns the decrypted payload when cookie is valid", async () => {
    const payload = validPayload();
    const cookieValue = encryptAesGcm(JSON.stringify(payload), KEY);
    const read = makeReadImpersonationReturnCookie({
      cookies: mockCookies(cookieValue),
      keyBase64: KEY,
    });
    expect(await read()).toEqual(payload);
  });

  it("returns null when decryption fails (tampered)", async () => {
    const payload = validPayload();
    const cookieValue = encryptAesGcm(JSON.stringify(payload), KEY);
    const tampered = cookieValue.slice(0, -2) + "AA";
    const read = makeReadImpersonationReturnCookie({
      cookies: mockCookies(tampered),
      keyBase64: KEY,
    });
    expect(await read()).toBeNull();
  });

  it("returns null when payload schema version mismatches", async () => {
    const payload = { ...validPayload(), v: 2 };
    const cookieValue = encryptAesGcm(JSON.stringify(payload), KEY);
    const read = makeReadImpersonationReturnCookie({
      cookies: mockCookies(cookieValue),
      keyBase64: KEY,
    });
    expect(await read()).toBeNull();
  });

  it("returns null when payload JSON is malformed", async () => {
    const cookieValue = encryptAesGcm("not json{", KEY);
    const read = makeReadImpersonationReturnCookie({
      cookies: mockCookies(cookieValue),
      keyBase64: KEY,
    });
    expect(await read()).toBeNull();
  });
});
