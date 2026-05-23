import "server-only";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantTables, restaurantTableSections } from "@/lib/db/schema";
import { can as defaultCan } from "@/lib/authz/can";
import { getCurrentSession as defaultGetCurrentSession } from "@/lib/auth/session";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

interface Deps {
  db: typeof dbAdmin;
  can: typeof defaultCan;
  getCurrentSession: typeof defaultGetCurrentSession;
  recordAudit: typeof defaultRecordAudit;
}

export interface CreateTableInput {
  restaurantId: string;
  organizationId: string;
  sectionId?: string;
  label: string;
  description?: string;
  capacityMin: number;
  capacityMax: number;
  capacityTypical?: number;
  shape:
    | "round"
    | "square"
    | "rect_2x4"
    | "rect_2x6"
    | "rect_2x8"
    | "banquette"
    | "bar_stool"
    | "high_top"
    | "patio";
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotationDegrees?: number;
  isBookableOnline?: boolean;
  isProOnly?: boolean;
}

export function makeTableActions(deps: Deps) {
  async function authz(
    action: "table.read" | "table.update" | "floor_plan.edit",
    restaurantId: string,
    organizationId: string,
  ) {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    const allowed = await deps.can(session, action, {
      kind: "restaurant",
      id: restaurantId,
      organization_id: organizationId,
    });
    if (!allowed) throw new Error(`forbidden: ${action}`);
    return session;
  }

  async function createTable(input: CreateTableInput): Promise<{ id: string }> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    const inserted = await deps.db
      .insert(restaurantTables)
      .values({
        restaurantId: input.restaurantId,
        sectionId: input.sectionId,
        label: input.label,
        description: input.description,
        capacityMin: input.capacityMin,
        capacityMax: input.capacityMax,
        capacityTypical: input.capacityTypical,
        shape: input.shape,
        positionX: input.positionX,
        positionY: input.positionY,
        width: input.width,
        height: input.height,
        rotationDegrees: input.rotationDegrees ?? 0,
        isBookableOnline: input.isBookableOnline ?? true,
        isProOnly: input.isProOnly ?? false,
      })
      .returning({ id: restaurantTables.id });
    const id = inserted[0].id;
    await deps.recordAudit({
      action: AUDIT.table.created,
      subjectType: "restaurant_table",
      subjectId: id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: { restaurant_id: input.restaurantId, label: input.label },
    });
    return { id };
  }

  async function updateTable(input: {
    id: string;
    restaurantId: string;
    organizationId: string;
    changes: Partial<Omit<CreateTableInput, "restaurantId" | "organizationId">>;
  }): Promise<void> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    await deps.db
      .update(restaurantTables)
      .set({ ...input.changes, updatedAt: new Date() })
      .where(eq(restaurantTables.id, input.id));
    await deps.recordAudit({
      action: AUDIT.table.updated,
      subjectType: "restaurant_table",
      subjectId: input.id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: {
        restaurant_id: input.restaurantId,
        changed_fields: Object.keys(input.changes).join(","),
      },
    });
  }

  async function archiveTable(input: {
    id: string;
    restaurantId: string;
    organizationId: string;
  }): Promise<void> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    await deps.db
      .update(restaurantTables)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(restaurantTables.id, input.id));
    await deps.recordAudit({
      action: AUDIT.table.archived,
      subjectType: "restaurant_table",
      subjectId: input.id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: { restaurant_id: input.restaurantId },
    });
  }

  async function createSection(input: {
    restaurantId: string;
    organizationId: string;
    name: string;
    color?: string;
    sortOrder?: number;
  }): Promise<{ id: string }> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    const inserted = await deps.db
      .insert(restaurantTableSections)
      .values({
        restaurantId: input.restaurantId,
        name: input.name,
        color: input.color,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning({ id: restaurantTableSections.id });
    const id = inserted[0].id;
    await deps.recordAudit({
      action: AUDIT.table.section_created,
      subjectType: "restaurant_table_section",
      subjectId: id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: { restaurant_id: input.restaurantId, name: input.name },
    });
    return { id };
  }

  async function updateSection(input: {
    id: string;
    restaurantId: string;
    organizationId: string;
    changes: { name?: string; color?: string; sortOrder?: number };
  }): Promise<void> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    await deps.db
      .update(restaurantTableSections)
      .set({ ...input.changes, updatedAt: new Date() })
      .where(eq(restaurantTableSections.id, input.id));
    await deps.recordAudit({
      action: AUDIT.table.section_updated,
      subjectType: "restaurant_table_section",
      subjectId: input.id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: { restaurant_id: input.restaurantId },
    });
  }

  async function archiveSection(input: {
    id: string;
    restaurantId: string;
    organizationId: string;
  }): Promise<void> {
    const session = await authz(
      "floor_plan.edit",
      input.restaurantId,
      input.organizationId,
    );
    // Sections don't have archived_at — hard delete (per §4.2 spec).
    // Member tables get section_id = NULL via FK ON DELETE SET NULL.
    await deps.db
      .delete(restaurantTableSections)
      .where(eq(restaurantTableSections.id, input.id));
    await deps.recordAudit({
      action: AUDIT.table.section_deleted,
      subjectType: "restaurant_table_section",
      subjectId: input.id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      context: { restaurant_id: input.restaurantId },
    });
  }

  return {
    createTable,
    updateTable,
    archiveTable,
    createSection,
    updateSection,
    archiveSection,
  };
}

export const tableActions = makeTableActions({
  db: dbAdmin,
  can: defaultCan,
  getCurrentSession: defaultGetCurrentSession,
  recordAudit: defaultRecordAudit,
});
