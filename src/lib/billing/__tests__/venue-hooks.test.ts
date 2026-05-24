/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

const syncMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/billing/sync-extra-location", () => ({
  syncExtraLocationQuantity: (orgId: string) => syncMock(orgId),
}));

import { billingHooks } from "../venue-hooks";

describe("billingHooks (§12 seam — delegates to syncExtraLocationQuantity, W5-F)", () => {
  beforeEach(() => syncMock.mockClear());

  it("onVenueAdded syncs the org's extra-location quantity", async () => {
    await billingHooks.onVenueAdded({ orgId: "org-1", restaurantId: "rest-1" });
    expect(syncMock).toHaveBeenCalledWith("org-1");
  });

  it("onVenueRemoved syncs the org's extra-location quantity", async () => {
    await billingHooks.onVenueRemoved({ orgId: "org-2", restaurantId: "rest-2" });
    expect(syncMock).toHaveBeenCalledWith("org-2");
  });
});
