/**
 * Sentry init for the Node.js server runtime. Imported from
 * `instrumentation.ts` via the NEXT_RUNTIME branch.
 *
 * Per foundations §12.1 + §15a.8:
 * - EU region: SENTRY_DSN must point at the EU ingest endpoint
 *   (e.g. https://...@o*.ingest.de.sentry.io/...). The DSN encodes the
 *   region — no separate env knob is needed.
 * - PII scrubbing: every event passes through `beforeSend` which strips
 *   known PII paths (guest_phone, guest_email, diner_*, payment fields)
 *   from the body and the breadcrumb chain.
 * - When SENTRY_DSN is unset, Sentry.init becomes a no-op (logs a
 *   warning in dev, silent in prod). No env keys are required for the
 *   build to succeed.
 */

import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry/scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Tracing: ship a sampled fraction of spans to Sentry's APM.
  // 1.0 = every transaction. Dial down in prod when traffic grows.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

  // Identify the deploy environment in the Sentry UI.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Same string OTel uses so Sentry + OTel correlate by service name.
  serverName: process.env.OTEL_SERVICE_NAME ?? "tavli-web",

  // Spec §12.1: never send PII strings; drop known-bad paths.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});
