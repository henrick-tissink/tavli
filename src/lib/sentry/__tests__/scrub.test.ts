/**
 * @jest-environment node
 */

import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "../scrub";

const REDACTED = "[REDACTED]";

function baseEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    event_id: "evt-1",
    timestamp: 1700000000,
    ...overrides,
  } as ErrorEvent;
}

describe("scrubSentryEvent", () => {
  it("redacts known PII keys in request.data, nested", () => {
    const e = baseEvent({
      request: {
        data: {
          guest_name: "Ana Popescu",
          guest_email: "ana@example.com",
          guest_phone: "+40712345678",
          party_size: 4,
          restaurant_id: "rest-1",
          nested: { password: "hunter2", note: "ok" },
        },
      },
    });

    const out = scrubSentryEvent(e);
    const data = out.request!.data as Record<string, unknown>;

    expect(data.guest_name).toBe(REDACTED);
    expect(data.guest_email).toBe(REDACTED);
    expect(data.guest_phone).toBe(REDACTED);
    expect(data.party_size).toBe(4); // not PII
    expect(data.restaurant_id).toBe("rest-1"); // FK ids preserved
    expect((data.nested as Record<string, unknown>).password).toBe(REDACTED);
    expect((data.nested as Record<string, unknown>).note).toBe("ok");
  });

  it("redacts known PII keys in extra and contexts", () => {
    const e = baseEvent({
      extra: { email: "x@y.com", reservation_id: "r-1" },
      contexts: {
        user: { name: "Ana", api_key: "sk_test_xxx" } as Record<
          string,
          unknown
        >,
      },
    });

    const out = scrubSentryEvent(e);
    expect((out.extra as Record<string, unknown>).email).toBe(REDACTED);
    expect((out.extra as Record<string, unknown>).reservation_id).toBe("r-1");
    expect(
      (out.contexts!.user as unknown as Record<string, unknown>).api_key,
    ).toBe(REDACTED);
  });

  it("redacts data inside breadcrumbs but keeps breadcrumb shape", () => {
    const e = baseEvent({
      breadcrumbs: [
        {
          type: "default",
          category: "audit",
          message: "recordAudit",
          data: { email: "a@b.com", action: "reservation.created" },
        },
      ],
    });

    const out = scrubSentryEvent(e);
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs![0].data!.email).toBe(REDACTED);
    expect(out.breadcrumbs![0].data!.action).toBe("reservation.created");
  });

  it("returns the event when request/extra/contexts/breadcrumbs are absent", () => {
    const e = baseEvent();
    const out = scrubSentryEvent(e);
    expect(out).toBe(e); // structural identity preserved when nothing to scrub
  });
});
