/**
 * @jest-environment node
 *
 * Pure-logic tests for the OTel→traceparent stitching. The full enqueue
 * round-trip (boss.send → row → worker handler) needs a real Postgres
 * + pg-boss instance and lands as an integration test with the first
 * real handler.
 */

import { ROOT_CONTEXT, context, trace } from "@opentelemetry/api";
import { currentTraceparent } from "../enqueue";

describe("currentTraceparent", () => {
  it("returns undefined when no span is active", () => {
    expect(currentTraceparent()).toBeUndefined();
  });

  it("returns undefined for a non-recording (noop) span context", () => {
    // The OTel API's default tracer produces non-recording spans whose
    // span context fails `isSpanContextValid`. Without the validity
    // filter we'd emit a useless all-zero traceparent for every enqueue
    // made before `register()` runs (e.g. boot scripts).
    const tracer = trace.getTracer("test");
    const span = tracer.startSpan("noop-span");
    const ctxWithSpan = trace.setSpan(ROOT_CONTEXT, span);

    const result = context.with(ctxWithSpan, () => currentTraceparent());
    span.end();

    expect(result).toBeUndefined();
  });
});
