/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { billingHooks } from "../venue-hooks";

describe("billingHooks (forward-declared no-op seam — §12 W5-F implements)", () => {
  it("onVenueAdded resolves without throwing", async () => {
    await expect(
      billingHooks.onVenueAdded({ orgId: "org-1", restaurantId: "rest-1" }),
    ).resolves.toBeUndefined();
  });

  it("onVenueRemoved resolves without throwing", async () => {
    await expect(
      billingHooks.onVenueRemoved({ orgId: "org-1", restaurantId: "rest-1" }),
    ).resolves.toBeUndefined();
  });
});
