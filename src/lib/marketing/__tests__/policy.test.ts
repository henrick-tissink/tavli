import { inQuietHours, makeMarketingPolicy, type EvaluateInput } from "@/lib/marketing/send/policy";

describe("inQuietHours", () => {
  // Default window 21:00→10:00 (wraps midnight), Bucharest.
  test("inside the wrapping window", () => {
    // 23:00 UTC → 01:00/02:00 Bucharest → quiet.
    expect(inQuietHours(new Date("2026-05-17T23:00:00Z"), "Europe/Bucharest", "21:00", "10:00")).toBe(true);
  });
  test("outside the window (afternoon)", () => {
    // 12:00 UTC → 15:00 Bucharest → allowed.
    expect(inQuietHours(new Date("2026-05-17T12:00:00Z"), "Europe/Bucharest", "21:00", "10:00")).toBe(false);
  });
  test("non-wrapping window", () => {
    expect(inQuietHours(new Date("2026-05-17T03:00:00Z"), "UTC", "01:00", "06:00")).toBe(true);
    expect(inQuietHours(new Date("2026-05-17T08:00:00Z"), "UTC", "01:00", "06:00")).toBe(false);
  });
});

const baseInput: EvaluateInput = {
  dinerId: "d1",
  organizationId: "o1",
  channel: "email",
  identifier: "a@b.com",
  freqCap: 4,
  includedAllowance: 1000,
  overageBuffer: 5,
  quietStartLocal: "21:00",
  quietEndLocal: "10:00",
  timezone: "Europe/Bucharest",
};

function deps(opts: { suppressed?: boolean; consent?: boolean; used?: number; quotaSent?: number }) {
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM marketing_sends")) return [{ used: opts.used ?? 0 }];
      if (t.includes("FROM marketing_quota_usage")) return [{ sent_count: opts.quotaSent ?? 0 }];
      return [];
    }),
  };
  const suppression = { isSuppressed: jest.fn(async () => opts.suppressed ?? false) };
  const consent = { hasConsent: jest.fn(async () => opts.consent ?? true) };
  return { db, suppression, consent, now: () => new Date("2026-05-17T12:00:00Z") };
}

describe("marketing policy evaluate", () => {
  test("allows a consented, non-suppressed, under-cap recipient", async () => {
    const r = await makeMarketingPolicy(deps({}) as never)(baseInput);
    expect(r).toEqual({ allow: true });
  });
  test("suppressed → skipped_suppressed", async () => {
    const r = await makeMarketingPolicy(deps({ suppressed: true }) as never)(baseInput);
    expect(r).toMatchObject({ allow: false, skip: "skipped_suppressed" });
  });
  test("no consent → skipped_suppressed", async () => {
    const r = await makeMarketingPolicy(deps({ consent: false }) as never)(baseInput);
    expect(r).toMatchObject({ allow: false, skip: "skipped_suppressed" });
  });
  test("over frequency cap → skipped_cap", async () => {
    const r = await makeMarketingPolicy(deps({ used: 4 }) as never)(baseInput);
    expect(r).toMatchObject({ allow: false, skip: "skipped_cap" });
  });
  test("over quota hard cap → skipped_quota", async () => {
    const r = await makeMarketingPolicy(deps({ quotaSent: 5000 }) as never)(baseInput);
    expect(r).toMatchObject({ allow: false, skip: "skipped_quota" });
  });
  test("sms during quiet hours → skipped_quiet_hours", async () => {
    // now 23:00 Bucharest-quiet via a late UTC time.
    const d = deps({});
    d.now = () => new Date("2026-05-17T23:30:00Z"); // ~02:30 Bucharest
    const r = await makeMarketingPolicy(d as never)({ ...baseInput, channel: "sms", identifier: "+40712345678" });
    expect(r).toMatchObject({ allow: false, skip: "skipped_quiet_hours" });
  });
});
