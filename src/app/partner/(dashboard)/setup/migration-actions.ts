"use server";

/**
 * §14 §6.2 / §6.4 — migration import + rollback actions. The permission boundary;
 * the run-migration-import job trusts the row.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { migrationImports, reservations, diners } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { enqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

const ALLOWED_SOURCES = ["tavli_csv_template", "manual", "none"] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const startSchema = z.object({
  restaurantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  source: z.enum(ALLOWED_SOURCES),
  storagePath: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
});

export interface StartMigrationResult {
  ok: boolean;
  error?: string;
  migrationImportId?: string;
}

export async function startMigrationImport(raw: z.infer<typeof startSchema>): Promise<StartMigrationResult> {
  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const input = parsed.data;

  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!(await can(session, "migration.import", { kind: "restaurant", id: input.restaurantId, organization_id: input.organizationId })))
    return { ok: false, error: "Forbidden." };
  if (input.fileSizeBytes > MAX_BYTES) return { ok: false, error: "TV1203 migration_file_too_large" };

  const [row] = await dbAdmin
    .insert(migrationImports)
    .values({ restaurantId: input.restaurantId, source: input.source, sourceFileStoragePath: input.storagePath, status: "queued", importedByUserId: session.userId })
    .returning({ id: migrationImports.id });
  if (!row) return { ok: false, error: "Could not create import." };

  await recordAudit({
    action: AUDIT.setup.migration_started,
    subjectType: "migration_import",
    subjectId: row.id,
    actorUserId: session.userId,
    actorRole: "org_owner",
    restaurantId: input.restaurantId,
    context: { migration_import_id: row.id, source: input.source, file_size_bytes: input.fileSizeBytes },
  });
  await enqueue(JOBS.setup.runMigrationImport, { importId: row.id });
  return { ok: true, migrationImportId: row.id };
}

export async function rollbackMigrationImport(raw: { migrationImportId: string; restaurantId: string; organizationId: string }): Promise<{ ok: boolean; error?: string; reservationsDeleted?: number }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!(await can(session, "migration.rollback", { kind: "restaurant", id: raw.restaurantId, organization_id: raw.organizationId })))
    return { ok: false, error: "Forbidden." };

  // Ownership check (audit #2): can() gates the client-supplied restaurantId,
  // but the import id is also client-supplied. Verify the import actually
  // belongs to the gated restaurant before deleting anything — otherwise an
  // operator authorized for venue A could pass venue B's import id and delete
  // B's reservations.
  const [imp] = await dbAdmin
    .select({ restaurantId: migrationImports.restaurantId })
    .from(migrationImports)
    .where(eq(migrationImports.id, raw.migrationImportId))
    .limit(1);
  if (!imp) return { ok: false, error: "Migration import not found." };
  if (imp.restaurantId !== raw.restaurantId)
    return { ok: false, error: "Forbidden." };

  // Capture the import's diners before deleting reservations, then delete the
  // imported reservations + any now-orphan diners that this import created.
  // Scope the DELETE by restaurant_id as well as import id — defense in depth
  // against an import row that somehow points elsewhere.
  const deleted = (await dbAdmin
    .delete(reservations)
    .where(and(eq(reservations.migrationImportId, raw.migrationImportId), eq(reservations.restaurantId, raw.restaurantId)))
    .returning({ dinerId: reservations.dinerId })) as Array<{ dinerId: string | null }>;
  const dinerIds = [...new Set(deleted.map((d) => d.dinerId).filter((x): x is string => !!x))];
  let dinersDeleted = 0;
  for (const dinerId of dinerIds) {
    const remaining = await dbAdmin.select({ id: reservations.id }).from(reservations).where(eq(reservations.dinerId, dinerId)).limit(1);
    if (remaining.length === 0) {
      await dbAdmin.delete(diners).where(and(eq(diners.id, dinerId), isNull(diners.redactedAt)));
      dinersDeleted++;
    }
  }
  await dbAdmin.update(migrationImports).set({ status: "failed" }).where(eq(migrationImports.id, raw.migrationImportId));
  await recordAudit({
    action: AUDIT.setup.migration_rolled_back,
    subjectType: "migration_import",
    subjectId: raw.migrationImportId,
    actorUserId: session.userId,
    actorRole: "org_owner",
    restaurantId: raw.restaurantId,
    context: { migration_import_id: raw.migrationImportId, reservations_deleted: deleted.length, diners_deleted: dinersDeleted },
  });
  return { ok: true, reservationsDeleted: deleted.length };
}
