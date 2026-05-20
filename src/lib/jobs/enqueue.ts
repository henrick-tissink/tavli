/**
 * Typed enqueue helper for pg-boss. Per foundations §10.2 + §12.3.
 *
 * - `key` must be a registered JOBS value. The runtime contract is
 *   `<domain>.<kebab-case>`; the type forces an existing one.
 * - W3C `traceparent` is stitched into the payload as `_trace` so the
 *   worker can re-establish the parent span context before invoking the
 *   handler. This makes "user click → fan-out → per-recipient send" one
 *   end-to-end trace in Sentry/OTel APM (§12.3).
 * - Job-level retry/expire/deadLetter live in `options`; defaults are
 *   conservative per §10.2 and overridable per call.
 */

import "server-only";
import { isSpanContextValid, trace } from "@opentelemetry/api";
import type { SendOptions } from "pg-boss";
import { getBoss } from "./boss";
import type { JobKey } from "./keys";

const DEFAULT_OPTIONS: SendOptions = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 60,
  expireInMinutes: 10,
};

/**
 * Read the current OTel span's traceparent header, if any. Returns
 * undefined when no span is active (e.g. boot scripts, tests with no
 * instrumented entry point) so callers can omit the `_trace` field
 * rather than serialize a placeholder.
 */
export function currentTraceparent(): string | undefined {
  const ctx = trace.getActiveSpan()?.spanContext();
  // isSpanContextValid filters out non-recording spans (which return the
  // all-zero sentinel context). Without it, we'd serialize a useless
  // "00-0…-0…-00" header for every enqueue made outside an
  // instrumented entry point.
  if (!ctx || !isSpanContextValid(ctx)) return undefined;
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

export interface TracedPayload {
  _trace?: string;
}

export async function enqueue<T extends object>(
  key: JobKey,
  data: T,
  options: SendOptions = {},
): Promise<string | null> {
  const traceparent = currentTraceparent();
  const payload: T & TracedPayload = traceparent
    ? { ...data, _trace: traceparent }
    : data;

  const boss = await getBoss();
  return boss.send(key, payload, { ...DEFAULT_OPTIONS, ...options });
}
