import { makeCurrentActor } from "../current-actor";
import type { ImpersonationReturnPayload } from "../impersonation-cookie";

const payload: ImpersonationReturnPayload = {
  v: 1,
  adminUserId: "admin-id",
  adminEmail: "admin@tavli.com",
  targetUserId: "target-id",
  targetEmail: "target@example.com",
  startedAt: "2026-05-22T10:00:00Z",
  adminAccessToken: "a",
  adminRefreshToken: "r",
};

describe("currentActor", () => {
  it("returns actorUserId with null impersonator when no cookie", async () => {
    const currentActor = makeCurrentActor({
      readImpersonationReturnCookie: async () => null,
    });
    expect(await currentActor("user-1")).toEqual({
      actorUserId: "user-1",
      impersonatorUserId: null,
    });
  });

  it("returns actorUserId with adminUserId as impersonator when cookie present", async () => {
    const currentActor = makeCurrentActor({
      readImpersonationReturnCookie: async () => payload,
    });
    expect(await currentActor("target-id")).toEqual({
      actorUserId: "target-id",
      impersonatorUserId: "admin-id",
    });
  });
});
