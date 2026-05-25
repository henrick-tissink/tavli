/**
 * @jest-environment node
 *
 * §08 §4.9: operational live-view mutations (status / combine / walk-in) must
 * gate on `table.update` — "every venue staff including hosts" — NOT
 * `floor_plan.edit`, which the matrix denies to venue_host. Gating these on
 * floor_plan.edit locks the door host out of the live floor view they run.
 */
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/tables/transitions", () => ({ transitionTableStatus: jest.fn() }));
jest.mock("@/lib/tables/combine", () => ({ combineTables: jest.fn(), dissolveCombination: jest.fn() }));
jest.mock("@/lib/tables/walkin", () => ({ walkinQueueOps: { addWalkin: jest.fn(), callWalkin: jest.fn(), markWalkinLeft: jest.fn(), seatWalkin: jest.fn() } }));
jest.mock("@/lib/db/schema", () => ({ restaurantTables: { id: "rt.id", restaurantId: "rt.restId" }, restaurants: { id: "r.id", organizationId: "r.org" }, walkinQueue: { id: "w.id", restaurantId: "w.restId" } }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn((a, b) => ({ eq: [a, b] })) }));

const limit = jest.fn();
jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  },
}));

import { updateTableStatusAction } from "../live-actions";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({ userId: "host-1" });
  // restaurantIdOfTable → table row; authzRestaurant → restaurant org row
  limit
    .mockResolvedValueOnce([{ restaurantId: "rest-1" }])
    .mockResolvedValueOnce([{ orgId: "org-1" }]);
  (can as jest.Mock).mockResolvedValue(true);
});

describe("live-view operational authz (§08 §4.9)", () => {
  it("gates updateTableStatusAction on table.update, not floor_plan.edit (host lockout)", async () => {
    await updateTableStatusAction({ tableId: "t1", toStatus: "seated" });
    expect(can).toHaveBeenCalledWith(
      expect.anything(),
      "table.update",
      expect.objectContaining({ kind: "restaurant", id: "rest-1" }),
    );
    expect(can).not.toHaveBeenCalledWith(expect.anything(), "floor_plan.edit", expect.anything());
  });
});
