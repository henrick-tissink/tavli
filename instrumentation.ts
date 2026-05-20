/**
 * Server-side instrumentation entry. Next.js 16 calls `register()`
 * once per server start, before the first request is served.
 *
 * Two layers, in order:
 *
 * 1. OpenTelemetry baseline per foundations §12.3 — registerOTel sets
 *    up auto-instrumentation for HTTP fetch + Next.js' own spans.
 *    Service name defaults to "tavli-web"; override via
 *    OTEL_SERVICE_NAME for separately-identifiable worker processes.
 *
 * 2. Sentry per foundations §12.1 — Node and Edge configs live in
 *    sibling files because their initializers differ. The async import
 *    pattern is required so Edge bundling doesn't try to pull Node-only
 *    modules into the Edge runtime.
 */

import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "tavli-web",
  });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Sentry's request-error hook — wired here so route handlers' uncaught
// errors land in Sentry with the same context as server-action throws.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
