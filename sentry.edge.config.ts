/**
 * Sentry init for the Edge runtime (middleware, edge route handlers).
 * Imported from `instrumentation.ts` when NEXT_RUNTIME === "edge".
 *
 * Subset of the Node config — no Node-specific integrations available
 * on Edge. PII scrubbing rule lives in src/lib/sentry/scrub so the
 * Node + Edge + browser configs share one source of truth.
 */

import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry/scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});
