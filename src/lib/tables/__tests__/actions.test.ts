/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({
  restaurantTables: { id: "rt.id", restaurantId: "rt.restaurantId" },
  restaurantTableSections: { id: "rts.id", restaurantId: "rts.restaurantId" },
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  and: jest.fn((...xs) => ({ and: xs })),
}));

import { makeTableActions } from "../actions";
import { eq } from "drizzle-orm";
import { restaurantTables, restaurantTableSections } from "@/lib/db/schema";

const RESTAURANT_ID = "rest-uuid-1";
const ORG_ID = "org-uuid-1";
const SESSION = { userId: "user-1", profile: { role: "restaurant_owner" } };

function makeDb(override: any = {}) {
  const returningTable = jest
    .fn()
    .mockResolvedValue([{ id: "table-new-id" }]);
  const returningSection = jest
    .fn()
    .mockResolvedValue([{ id: "section-new-id" }]);
  const whereUpdate = jest.fn().mockResolvedValue([]);
  const whereDelete = jest.fn().mockResolvedValue([]);

  return {
    insert: jest.fn().mockImplementation((table) => ({
      values: jest.fn().mockReturnValue({
        returning: table === override._sectionTable
          ? returningSection
          : returningTable,
      }),
    })),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({ where: whereUpdate }),
    }),
    delete: jest.fn().mockReturnValue({ where: whereDelete }),
    ...override,
  };
}

function deps(override: any = {}) {
  return {
    db: makeDb(),
    recordAudit: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    getCurrentSession: jest.fn().mockResolvedValue(SESSION),
    ...override,
  };
}

// ─── createTable ────────────────────────────────────────────────────────────

describe("createTable", () => {
  it("inserts a table + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    const result = await actions.createTable({
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      label: "T1",
      capacityMin: 2,
      capacityMax: 4,
      shape: "round",
      positionX: 0,
      positionY: 0,
      width: 100,
      height: 100,
    });
    expect(result.id).toBe("table-new-id");
    expect(d.db.insert).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "table.created" }),
    );
  });

  it("checks floor_plan.edit permission with correct restaurant + org", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    await actions.createTable({
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      label: "T2",
      capacityMin: 1,
      capacityMax: 2,
      shape: "square",
      positionX: 0,
      positionY: 0,
      width: 80,
      height: 80,
    });
    expect(d.can).toHaveBeenCalledWith(
      SESSION,
      "floor_plan.edit",
      expect.objectContaining({ kind: "restaurant", id: RESTAURANT_ID, organization_id: ORG_ID }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.createTable({
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        label: "T",
        capacityMin: 1,
        capacityMax: 2,
        shape: "round",
        positionX: 0,
        positionY: 0,
        width: 80,
        height: 80,
      }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.createTable({
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        label: "T",
        capacityMin: 1,
        capacityMax: 2,
        shape: "round",
        positionX: 0,
        positionY: 0,
        width: 80,
        height: 80,
      }),
    ).rejects.toThrow(/forbidden/);
  });
});

// ─── updateTable ────────────────────────────────────────────────────────────

describe("updateTable", () => {
  it("updates table + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    await actions.updateTable({
      id: "table-1",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      changes: { label: "T1-updated" },
    });
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "table.updated",
        context: expect.objectContaining({ changed_fields: "label" }),
      }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.updateTable({
        id: "table-1",
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        changes: { label: "x" },
      }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.updateTable({
        id: "table-1",
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        changes: { label: "x" },
      }),
    ).rejects.toThrow(/forbidden/);
  });
});

// ─── archiveTable ───────────────────────────────────────────────────────────

describe("archiveTable", () => {
  it("sets archived_at + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    await actions.archiveTable({
      id: "table-1",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
    });
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "table.archived" }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.archiveTable({ id: "t1", restaurantId: RESTAURANT_ID, organizationId: ORG_ID }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.archiveTable({ id: "t1", restaurantId: RESTAURANT_ID, organizationId: ORG_ID }),
    ).rejects.toThrow(/forbidden/);
  });
});

// ─── cross-tenant scoping (NEW-3) ────────────────────────────────────────────
// Each mutator authorizes a client-supplied restaurantId; the write MUST also be
// scoped by restaurant_id so a foreign row id can't be mutated cross-tenant.

describe("cross-tenant write scoping (NEW-3)", () => {
  it("updateTable scopes the UPDATE by restaurant_id", async () => {
    (eq as jest.Mock).mockClear();
    await makeTableActions(deps()).updateTable({
      id: "table-from-another-venue",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      changes: { label: "x" },
    });
    expect(eq).toHaveBeenCalledWith(restaurantTables.restaurantId, RESTAURANT_ID);
  });

  it("archiveTable scopes the UPDATE by restaurant_id", async () => {
    (eq as jest.Mock).mockClear();
    await makeTableActions(deps()).archiveTable({
      id: "table-from-another-venue",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
    });
    expect(eq).toHaveBeenCalledWith(restaurantTables.restaurantId, RESTAURANT_ID);
  });

  it("updateSection scopes the UPDATE by restaurant_id", async () => {
    (eq as jest.Mock).mockClear();
    await makeTableActions(deps()).updateSection({
      id: "section-from-another-venue",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      changes: { name: "x" },
    });
    expect(eq).toHaveBeenCalledWith(restaurantTableSections.restaurantId, RESTAURANT_ID);
  });

  it("archiveSection scopes the DELETE by restaurant_id", async () => {
    (eq as jest.Mock).mockClear();
    await makeTableActions(deps()).archiveSection({
      id: "section-from-another-venue",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
    });
    expect(eq).toHaveBeenCalledWith(restaurantTableSections.restaurantId, RESTAURANT_ID);
  });
});

// ─── createSection ──────────────────────────────────────────────────────────

describe("createSection", () => {
  it("inserts section + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    const result = await actions.createSection({
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      name: "Main Room",
      color: "#aabbcc",
      sortOrder: 1,
    });
    expect(result.id).toBeDefined();
    expect(d.db.insert).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "table.section_created" }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.createSection({ restaurantId: RESTAURANT_ID, organizationId: ORG_ID, name: "X" }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.createSection({ restaurantId: RESTAURANT_ID, organizationId: ORG_ID, name: "X" }),
    ).rejects.toThrow(/forbidden/);
  });
});

// ─── updateSection ──────────────────────────────────────────────────────────

describe("updateSection", () => {
  it("updates section + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    await actions.updateSection({
      id: "sect-1",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
      changes: { name: "Terrace" },
    });
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "table.section_updated" }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.updateSection({
        id: "sect-1",
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        changes: { name: "X" },
      }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.updateSection({
        id: "sect-1",
        restaurantId: RESTAURANT_ID,
        organizationId: ORG_ID,
        changes: { name: "X" },
      }),
    ).rejects.toThrow(/forbidden/);
  });
});

// ─── archiveSection ─────────────────────────────────────────────────────────

describe("archiveSection", () => {
  it("hard-deletes section + records audit on happy path", async () => {
    const d = deps();
    const actions = makeTableActions(d);
    await actions.archiveSection({
      id: "sect-1",
      restaurantId: RESTAURANT_ID,
      organizationId: ORG_ID,
    });
    expect(d.db.delete).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "table.section_deleted" }),
    );
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeTableActions(d);
    await expect(
      actions.archiveSection({ id: "sect-1", restaurantId: RESTAURANT_ID, organizationId: ORG_ID }),
    ).rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeTableActions(d);
    await expect(
      actions.archiveSection({ id: "sect-1", restaurantId: RESTAURANT_ID, organizationId: ORG_ID }),
    ).rejects.toThrow(/forbidden/);
  });
});
