/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  profiles: { __t: "profiles" },
  organizations: { __t: "organizations" },
  restaurants: { __t: "restaurants" },
  organizationMembers: { __t: "organizationMembers" },
  restaurantStaff: { __t: "restaurantStaff" },
  subscriptions: { __t: "subscriptions" },
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNotNull: jest.fn(),
}));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/audit/actions", () => ({
  AUDIT: {
    user: { created: "user.created" },
    organization: { created: "organization.created" },
    restaurant: { created: "restaurant.created" },
  },
}));

import { makeSignupPartner, type SignupInput } from "../signup-partner";
import { organizations } from "@/lib/db/schema";

const BASE_INPUT: SignupInput = {
  email: "Owner@Example.RO",
  password: "supersecret",
  fullName: "Ana Pop",
  restaurantName: "Tom Yum",
  cityId: "city-1",
  organizationName: "Tom Yum Group",
  countryCode: "RO",
  taxId: "RO123",
  customerType: "business",
  tier: "pro",
  frequency: "monthly",
  termsAccepted: true,
  locale: "ro",
};

function makeDb(opts: { priorTrial?: boolean; txThrow?: unknown } = {}) {
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const tx = {
    insert: (table: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => {
        inserts.push({ table: table.__t, values: vals });
        if (opts.txThrow && table.__t === "organizations") throw opts.txThrow;
        const thenable = {
          returning: () =>
            Promise.resolve([{ id: table.__t === "organizations" ? "org-1" : "rest-1" }]),
          then: (res: (v: unknown) => unknown) => res(undefined),
        };
        return thenable;
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  };
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(opts.priorTrial ? [{ id: "sub-prior" }] : []),
        }),
      }),
    }),
    transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  };
  return { db: db as never, inserts };
}

function makeDeps(overrides: Partial<Parameters<typeof makeSignupPartner>[0]> = {}, dbOpts = {}) {
  const { db, inserts } = makeDb(dbOpts);
  const authAdmin = {
    createUser: jest.fn(async () => ({ userId: "user-1" })),
    deleteUser: jest.fn(async () => {}),
  };
  const startSubscription = jest.fn(async () => ({ stripeCheckoutUrl: "https://stripe/checkout" }));
  const sendWelcomeEmail = jest.fn(async () => {});
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  const seedTriggeredCampaigns = jest.fn(async () => 5);
  const deps = {
    db,
    authAdmin,
    startSubscription,
    sendWelcomeEmail,
    recordAudit,
    seedTriggeredCampaigns,
    genSlugSuffix: () => "abc123",
    ...overrides,
  } as Parameters<typeof makeSignupPartner>[0];
  return { deps, authAdmin, startSubscription, sendWelcomeEmail, recordAudit, seedTriggeredCampaigns, inserts };
}

describe("signupPartner", () => {
  it("happy path: creates user + rows, starts subscription, returns checkout url", async () => {
    const { deps, authAdmin, startSubscription, seedTriggeredCampaigns, inserts } = makeDeps();
    const res = await makeSignupPartner(deps)(BASE_INPUT);

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      restaurantId: "rest-1",
      stripeCheckoutUrl: "https://stripe/checkout",
      billingDeferred: false,
    });
    // email normalised to lowercase
    expect(authAdmin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.ro" }),
    );
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(startSubscription).toHaveBeenCalledWith({
      organizationId: "org-1",
      tier: "pro",
      frequency: "monthly",
    });
    // all five rows inserted, org as pending_verification, owner memberships
    const tables = inserts.map((i) => i.table);
    expect(tables).toEqual([
      "profiles",
      "organizations",
      "restaurants",
      "organizationMembers",
      "restaurantStaff",
    ]);
    const org = inserts.find((i) => i.table === "organizations")!;
    expect(org.values).toMatchObject({ status: "pending_verification", name: "Tom Yum Group", taxId: "RO123" });
    expect(inserts.find((i) => i.table === "organizationMembers")!.values).toMatchObject({ role: "owner" });
    expect(inserts.find((i) => i.table === "restaurantStaff")!.values).toMatchObject({ role: "owner" });
    // §11 §6 — default triggered campaigns seeded inside the signup tx
    expect(seedTriggeredCampaigns).toHaveBeenCalledWith("org-1", expect.anything());
  });

  it("audits user.created alongside organization/restaurant (M2 — §12 audit hooks)", async () => {
    const { deps, recordAudit } = makeDeps();
    await makeSignupPartner(deps)(BASE_INPUT);
    const actions = recordAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("user.created");
    expect(actions).toContain("organization.created");
    expect(actions).toContain("restaurant.created");
  });

  it("defers billing when customer_type is not yet supplied", async () => {
    const { deps, startSubscription } = makeDeps();
    const res = await makeSignupPartner(deps)({ ...BASE_INPUT, customerType: null, taxId: null });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.billingDeferred).toBe(true);
    expect(res.data.stripeCheckoutUrl).toBeNull();
    expect(startSubscription).not.toHaveBeenCalled();
  });

  it("refuses with TV1401 when the tax_id already used a trial — without creating a user", async () => {
    const { deps, authAdmin } = makeDeps({}, { priorTrial: true });
    const res = await makeSignupPartner(deps)(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("TV1401");
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it("compensates (deletes the auth user) and maps 23505 to TV1403 on tax_id race", async () => {
    const { deps, authAdmin } = makeDeps({}, { txThrow: { code: "23505" } });
    const res = await makeSignupPartner(deps)(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("TV1403");
    expect(authAdmin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("compensates and returns internal on a generic tx failure", async () => {
    const { deps, authAdmin } = makeDeps({}, { txThrow: new Error("db down") });
    const res = await makeSignupPartner(deps)(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("internal");
    expect(authAdmin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("still succeeds (billing deferred) when the Stripe handoff throws", async () => {
    const { deps, authAdmin } = makeDeps({
      startSubscription: jest.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const res = await makeSignupPartner(deps)(BASE_INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.billingDeferred).toBe(true);
    expect(res.data.stripeCheckoutUrl).toBeNull();
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects when terms are not accepted, before any user is created", async () => {
    const { deps, authAdmin } = makeDeps();
    const res = await makeSignupPartner(deps)({ ...BASE_INPUT, termsAccepted: false });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("invalid_input");
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it("maps a duplicate-email auth failure to conflict", async () => {
    const { deps } = makeDeps({
      authAdmin: {
        createUser: jest.fn(async () => {
          throw new Error("email exists");
        }),
        deleteUser: jest.fn(async () => {}),
      },
    });
    const res = await makeSignupPartner(deps)(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.code).toBe("conflict");
  });

  // referenced so the mocked schema import isn't tree-shaken / unused
  it("uses the mocked schema tables", () => {
    expect((organizations as unknown as { __t: string }).__t).toBe("organizations");
  });
});
