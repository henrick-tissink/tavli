/**
 * Sentry init for the browser (client). Next.js 16 picks this file up
 * automatically — same instrumentation file convention as
 * `instrumentation.ts` but on the client side.
 *
 * NEXT_PUBLIC_SENTRY_DSN is read at build time; the value is inlined
 * into the client bundle. When unset, Sentry init is a no-op.
 *
 * No tracing here yet — server-side spans are enough for v1. Real-user
 * monitoring (Web Vitals beacon, session replay) is explicitly deferred
 * to v1.5 per foundations §12.4.
 */

import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry/scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

// Required for client-side navigation instrumentation per Sentry's
// Next.js setup contract — without it, the SDK warns at startup.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
