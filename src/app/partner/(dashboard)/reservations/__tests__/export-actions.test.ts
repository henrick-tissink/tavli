/**
 * Smoke tests for bulkExportReservations focused on the short-circuit
 * paths (schema validation, auth, can()). The happy-path query +
 * CSV-generation behavior is exercised by `src/lib/csv/__tests__/
 * stringify.test.ts` plus runtime integration; we don't deep-mock the
 * dbAdmin Drizzle chain here.
 */

jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));

jest.mock("@/lib/authz/can", () => ({
  can: jest.fn(),
}));

jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn(),
}));

jest.mock("@/lib/audit/actor-role", () => ({
  getActorRole: jest.fn().mockResolvedValue("venue_owner"),
}));

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    select: jest.fn(),
  },
}));

import { bulkExportReservations } from "../export-actions";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";

const mockSession = (userId = "u-1") =>
  ({
    userId,
    userEmail: `${userId}@example.com`,
    profile: {
      id: userId,
      role: "restaurant_owner" as const,
      fullName: null,
      email: `${userId}@example.com`,
      locale: "ro",
      defaultOrganizationId: null,
    },
  });

describe("bulkExportReservations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects when both restaurantId and organizationId are provided", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(mockSession());
    const result = await bulkExportReservations({
      restaurantId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      organizationId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      format: "csv",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exactly one/i);
  });

  it("rejects date ranges exceeding 365 days", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(mockSession());
    const result = await bulkExportReservations({
      restaurantId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      dateFrom: "2025-01-01",
      dateTo: "2026-12-31",
      format: "csv",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/365 days/i);
  });

  it("rejects when dateFrom is after dateTo", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(mockSession());
    const result = await bulkExportReservations({
      restaurantId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      dateFrom: "2026-02-01",
      dateTo: "2026-01-01",
      format: "csv",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/on or before/i);
  });

  it("returns 'Not signed in.' when there's no session", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    const result = await bulkExportReservations({
      restaurantId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      format: "csv",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Not signed in.");
  });

  it("returns 'Forbidden.' when can() denies", async () => {
    // dbAdmin.select for the restaurant org_id lookup
    const restaurantsRow = [{ organizationId: "org-1" }];
    const dbAdminMock = jest.requireMock("@/lib/db/admin").dbAdmin;
    dbAdminMock.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(restaurantsRow),
        }),
      }),
    });

    (getCurrentSession as jest.Mock).mockResolvedValue(mockSession());
    (can as jest.Mock).mockResolvedValue(false);

    const result = await bulkExportReservations({
      restaurantId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      format: "csv",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden.");
    expect(can).toHaveBeenCalledWith(
      expect.anything(),
      "analytics.export",
      expect.objectContaining({ kind: "restaurant", id: "f47ac10b-58cc-4372-a567-0e02b2c3d479" }),
    );
  });
});
