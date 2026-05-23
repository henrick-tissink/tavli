/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/billing/venue-hooks", () => ({ billingHooks: {} }));
jest.mock("@/lib/db/schema", () => ({
  organizations: {},
  restaurants: {},
  restaurantStaff: {},
  venueAdditionLog: {},
  reservations: {},
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNull: jest.fn(),
  gte: jest.fn(),
  count: jest.fn(),
  sql: Object.assign(jest.fn(), { raw: jest.fn() }),
}));

import { makeVenueActions } from "../venue-actions";

const ORG_ID = "org-uuid-1";
const REST_ID = "rest-uuid-9";
const SESSION = { userId: "user-1", profile: { role: "restaurant_owner" } };

// Fake db: insert/update return chains; transaction runs the callback with
// the fake db itself as `tx`. selectQueue is a FIFO of per-`select()` results.
function makeDb(over: any = {}) {
  const db: any = {
    _selectQueue: over.selectQueue ?? [],
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() =>
          Promise.resolve(db._selectQueue.length ? db._selectQueue.shift() : []),
        ),
      }),
    })),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: "rest-new-id" }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ count: 2 }]),
        }),
      }),
    }),
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(db)),
  };
  return Object.assign(db, over.db ?? {});
}

function deps(over: any = {}) {
  return {
    db: makeDb(over),
    recordAudit: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    getCurrentSession: jest.fn().mockResolvedValue(SESSION),
    loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "pro" }),
    billingHooks: {
      onVenueAdded: jest.fn().mockResolvedValue(undefined),
      onVenueRemoved: jest.fn().mockResolvedValue(undefined),
    },
    ...over.deps,
  };
}

const ADD_INPUT = {
  organizationId: ORG_ID,
  name: "Tom Yum Cluj",
  slug: "tom-yum-cluj",
  cityId: "city-1",
  address: "Str. Exemplu 1",
};

describe("addVenueToOrg", () => {
  it("creates a venue + increments counter + logs + audits on the pro happy path", async () => {
    const d = deps({ selectQueue: [[{ maxVenues: null, currentVenueCount: 1 }]] });
    const actions = makeVenueActions(d);
    const result = await actions.addVenueToOrg(ADD_INPUT);

    expect(result.restaurant_id).toBe("rest-new-id");
    expect(d.db.transaction).toHaveBeenCalled();
    expect(d.billingHooks.onVenueAdded).toHaveBeenCalledWith({
      orgId: ORG_ID,
      restaurantId: "rest-new-id",
    });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.updated",
        context: expect.objectContaining({ event: "venue_added" }),
      }),
    );
  });

  it("rejects with TV701 when the org is on the base tier", async () => {
    const d = deps({ deps: { loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "base" }) } });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/TV701/);
    expect(d.db.transaction).not.toHaveBeenCalled();
  });

  it("rejects with TV702 when max_venues cap is reached", async () => {
    const d = deps({ selectQueue: [[{ maxVenues: 2, currentVenueCount: 2 }]] });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/TV702/);
  });

  it("rejects when permission is denied", async () => {
    const d = deps({ deps: { can: jest.fn().mockResolvedValue(false) } });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/forbidden/);
  });

  it("does NOT roll back the venue when the billing hook throws", async () => {
    const d = deps({
      selectQueue: [[{ maxVenues: null, currentVenueCount: 1 }]],
      deps: {
        billingHooks: {
          onVenueAdded: jest.fn().mockRejectedValue(new Error("stripe down")),
          onVenueRemoved: jest.fn(),
        },
      },
    });
    const actions = makeVenueActions(d);
    const result = await actions.addVenueToOrg(ADD_INPUT);
    expect(result.restaurant_id).toBe("rest-new-id");
    expect(d.recordAudit).toHaveBeenCalled();
  });
});

describe("removeVenueFromOrg", () => {
  it("archives the venue + decrements counter + logs on the happy path", async () => {
    const d = deps({
      // 1st select: venue org lookup; 2nd select: future-reservation count (0)
      selectQueue: [[{ organizationId: ORG_ID }], [{ futureCount: 0 }]],
    });
    const actions = makeVenueActions(d);
    const result = await actions.removeVenueFromOrg({ restaurantId: REST_ID, reason: "closed" });

    expect(result.restaurant_id).toBe(REST_ID);
    expect(d.db.transaction).toHaveBeenCalled();
    expect(d.billingHooks.onVenueRemoved).toHaveBeenCalledWith({ orgId: ORG_ID, restaurantId: REST_ID });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.updated",
        context: expect.objectContaining({ event: "venue_removed", reason: "closed" }),
      }),
    );
  });

  it("rejects with TV703 when the venue has future confirmed reservations", async () => {
    const d = deps({
      selectQueue: [[{ organizationId: ORG_ID }], [{ futureCount: 3 }]],
    });
    const actions = makeVenueActions(d);
    await expect(
      actions.removeVenueFromOrg({ restaurantId: REST_ID, reason: "closed" }),
    ).rejects.toThrow(/TV703/);
    expect(d.db.transaction).not.toHaveBeenCalled();
  });
});

describe("reactivateVenue", () => {
  it("un-archives + re-increments counter + logs 'reactivated' on the pro happy path", async () => {
    const d = deps({
      // 1st select: venue lookup (org + archivedAt set); 2nd select: org cap lookup
      selectQueue: [
        [{ organizationId: ORG_ID, archivedAt: new Date() }],
        [{ maxVenues: null, currentVenueCount: 1 }],
      ],
    });
    const actions = makeVenueActions(d);
    const result = await actions.reactivateVenue({ restaurantId: REST_ID });

    expect(result.restaurant_id).toBe(REST_ID);
    expect(d.billingHooks.onVenueAdded).toHaveBeenCalledWith({ orgId: ORG_ID, restaurantId: REST_ID });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ event: "venue_reactivated" }) }),
    );
  });

  it("rejects when the venue is not archived", async () => {
    const d = deps({ selectQueue: [[{ organizationId: ORG_ID, archivedAt: null }]] });
    const actions = makeVenueActions(d);
    await expect(actions.reactivateVenue({ restaurantId: REST_ID })).rejects.toThrow(/not archived/);
  });

  it("rejects with TV701 when the org is on the base tier", async () => {
    const d = deps({
      selectQueue: [[{ organizationId: ORG_ID, archivedAt: new Date() }]],
      deps: { loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "base" }) },
    });
    const actions = makeVenueActions(d);
    await expect(actions.reactivateVenue({ restaurantId: REST_ID })).rejects.toThrow(/TV701/);
  });
});
