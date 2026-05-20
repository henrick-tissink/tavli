/**
 * ActionResult<T> + helpers for the server-action mutation contract.
 * Per foundations §3.2 + §16.1.
 *
 * Every server action returns Promise<ActionResult<T>>. Discriminated
 * union: callers branch on `ok`. The `code` on failure is i18n-keyable
 * (preferred); `message` is a human-readable English fallback for
 * logging/dev surfaces only.
 *
 * Conventions:
 * - `data: T` is never `T | null` — a "no result" outcome is
 *   `notFound()` or a domain-specific empty value, not null-in-ok.
 * - `fields` is RHF-keyed (path.join('.')) so clients can `setError`
 *   directly.
 * - Server actions never throw across the boundary — uncaught throws
 *   are converted to `fail('internal')` by the future withSentry wrapper.
 *   Domain code uses `fail()` / `invalid()` / `conflict()` explicitly.
 */

import type { ZodError } from "zod";
import type { ActionErrorCode } from "./errors/codes";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ActionErrorCode;
      message?: string;
      fields?: Record<string, string>;
    };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (
  code: ActionErrorCode,
  message?: string,
  fields?: Record<string, string>,
): ActionResult<never> => ({ ok: false, code, message, fields });

/**
 * Adapter from Zod's parse failure into the per-field shape callers
 * expect. Keys are dot-joined paths (matches react-hook-form name=).
 */
export const invalid = (err: ZodError): ActionResult<never> =>
  fail(
    "invalid_input",
    undefined,
    Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message])),
  );

export const unauthenticated = (): ActionResult<never> => fail("unauthenticated");
export const forbidden = (): ActionResult<never> => fail("forbidden");
export const notFound = (): ActionResult<never> => fail("not_found");
export const conflict = (msg?: string): ActionResult<never> => fail("conflict", msg);
export const rateLimited = (): ActionResult<never> => fail("rate_limited");
