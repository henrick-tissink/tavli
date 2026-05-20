/**
 * OpenTelemetry baseline per foundations §12.3.
 *
 * Next.js calls `register()` once per server start (Node + Edge runtimes
 * both fire). `@vercel/otel` handles the SDK init for both — auto-
 * instruments HTTP fetch and Next.js' own spans (route handlers,
 * server actions, RSC renders). Postgres + pg-boss auto-instrumentation
 * lands with the pg-boss unit (Wave 1 still in progress).
 *
 * Service name defaults to "tavli-web"; override via OTEL_SERVICE_NAME
 * if a worker process needs to identify itself separately.
 *
 * Exporter target: currently default (no explicit OTLP endpoint set).
 * The Sentry unit (Wave 1) will register Sentry's tracing exporter to
 * ship spans to its APM endpoint per §12.3.
 *
 * To see verbose Next.js spans during local dev: NEXT_OTEL_VERBOSE=1.
 */

import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "tavli-web",
  });
}
