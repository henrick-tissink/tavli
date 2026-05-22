/**
 * Impersonation return cookie reader (§01 §5a.3 phase 2).
 *
 * Cookie name: tavli_impersonation_return. Value is AES-256-GCM-encrypted
 * JSON. Payload contains the admin's session tokens so stopImpersonationSession
 * can restore the admin's original session.
 *
 * DI seam: makeReadImpersonationReturnCookie takes the cookies fn + the key
 * so tests can inject mocks. The production export reads next/headers cookies
 * and IMPERSONATION_COOKIE_SECRET at call time (not at import time).
 */

import "server-only";
import { cookies as nextCookies } from "next/headers";
import { decryptAesGcm } from "./crypto";

export const IMPERSONATION_COOKIE_NAME = "tavli_impersonation_return";

export interface ImpersonationReturnPayload {
  v: 1;
  adminUserId: string;
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  startedAt: string;
  adminAccessToken: string;
  adminRefreshToken: string;
}

interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

interface Deps {
  cookies: () => Promise<CookieReader>;
  keyBase64: string;
}

export function makeReadImpersonationReturnCookie(deps: Deps) {
  return async function readImpersonationReturnCookie(): Promise<ImpersonationReturnPayload | null> {
    const store = await deps.cookies();
    const raw = store.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!raw) return null;
    const decrypted = decryptAesGcm(raw, deps.keyBase64);
    if (decrypted === null) return null;
    try {
      const parsed = JSON.parse(decrypted) as Partial<ImpersonationReturnPayload>;
      if (parsed.v !== 1) return null;
      if (
        typeof parsed.adminUserId !== "string" ||
        typeof parsed.adminEmail !== "string" ||
        typeof parsed.targetUserId !== "string" ||
        typeof parsed.targetEmail !== "string" ||
        typeof parsed.startedAt !== "string" ||
        typeof parsed.adminAccessToken !== "string" ||
        typeof parsed.adminRefreshToken !== "string"
      ) {
        return null;
      }
      return parsed as ImpersonationReturnPayload;
    } catch {
      return null;
    }
  };
}

function productionKey(): string {
  const key = process.env.IMPERSONATION_COOKIE_SECRET;
  if (!key) throw new Error("IMPERSONATION_COOKIE_SECRET not set.");
  return key;
}

// Production export — reads env at CALL TIME (not import time) via a Proxy on Deps.
export const readImpersonationReturnCookie = makeReadImpersonationReturnCookie(
  new Proxy(
    {
      cookies: async () => {
        const store = await nextCookies();
        return { get: (name: string) => store.get(name) };
      },
    } as Deps,
    {
      get(target, prop) {
        if (prop === "keyBase64") return productionKey();
        return (target as never)[prop];
      },
    },
  ),
);
