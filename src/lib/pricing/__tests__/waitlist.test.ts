/**
 * @jest-environment node
 */
import { makeJoinWaitlist, WaitlistError } from "@/lib/pricing/waitlist";
import { AUDIT } from "@/lib/audit/actions";

function makeDeps(overrides: {
  insertImpl?: () => Promise<{ id: string }[]>;
  allowed?: boolean;
} = {}) {
  const valuesReturning = jest
    .fn()
    .mockImplementation(overrides.insertImpl ?? (async () => [{ id: "wl-1" }]));
  const values = jest.fn().mockReturnValue({ returning: valuesReturning });
  const insert = jest.fn().mockReturnValue({ values });
  const enforceRateLimit = jest.fn().mockResolvedValue({
    allowed: overrides.allowed ?? true,
    remaining: 0,
    resetsAt: new Date(),
  });
  const recordAudit = jest.fn().mockResolvedValue(undefined);
  return {
    deps: { db: { insert } as never, enforceRateLimit, recordAudit },
    insert,
    values,
    enforceRateLimit,
    recordAudit,
  };
}

describe("joinWaitlist", () => {
  it("inserts a lowercased email and audits the join", async () => {
    const { deps, values, recordAudit } = makeDeps();
    const join = makeJoinWaitlist(deps);

    const result = await join({ email: "Owner@Bistro.RO", locale: "ro", ip: "1.2.3.4" });

    expect(result).toEqual({ id: "wl-1" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@bistro.ro",
        source: "pricing_page",
        sourceLocale: "ro",
        sourceIp: "1.2.3.4",
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT.pricing.waitlist_email_added,
        subjectId: "wl-1",
        actorRole: "diner",
      }),
    );
  });

  it("rejects a malformed email before touching the db", async () => {
    const { deps, insert, enforceRateLimit } = makeDeps();
    const join = makeJoinWaitlist(deps);
    await expect(join({ email: "not-an-email", locale: "ro" })).rejects.toThrow(WaitlistError);
    await expect(join({ email: "not-an-email", locale: "ro" })).rejects.toThrow("invalid_input");
    expect(insert).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("throws rate_limited when the per-email window is exhausted", async () => {
    const { deps, insert } = makeDeps({ allowed: false });
    const join = makeJoinWaitlist(deps);
    await expect(join({ email: "a@b.ro", locale: "ro" })).rejects.toThrow("rate_limited");
    expect(insert).not.toHaveBeenCalled();
  });

  it("maps a unique-violation to TV1301 (already pending)", async () => {
    const { deps } = makeDeps({
      insertImpl: async () => {
        throw Object.assign(new Error("dup"), { code: "23505" });
      },
    });
    const join = makeJoinWaitlist(deps);
    await expect(join({ email: "dup@b.ro", locale: "ro" })).rejects.toThrow("TV1301");
  });

  it("falls back to RO for an unsupported locale and trims the org hint", async () => {
    const { deps, values } = makeDeps();
    const join = makeJoinWaitlist(deps);
    await join({ email: "a@b.ro", locale: "fr", organizationNameHint: "  Tom Yum  " });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLocale: "ro", organizationNameHint: "Tom Yum" }),
    );
  });

  it("skips the per-ip check when no ip is supplied", async () => {
    const { deps, enforceRateLimit } = makeDeps();
    const join = makeJoinWaitlist(deps);
    await join({ email: "a@b.ro", locale: "en" });
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "pricing_waitlist_join_per_email" }),
    );
  });
});
