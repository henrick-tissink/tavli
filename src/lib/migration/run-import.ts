/**
 * §14 §6.3 — `setup.run-migration-import` job. Parses the uploaded manual CSV,
 * dedups against existing reservations (4-tuple, E.164 phone), find-or-creates
 * a diner per row, inserts the reservation tagged with migration_import_id, and
 * records counts + audit. Re-running the same file is safe (dedup).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { findOrCreateDinerForReservation } from "@/lib/diners/upsert";
import { normalizePhone } from "@/lib/phone/normalize";
import { parseManualCsv } from "@/lib/migration/manual-csv";
import { dedupKey, isDuplicate } from "@/lib/migration/dedup";

interface FindOrCreateDiner {
  (input: { restaurantId: string; guestName: string; guestPhone: string | null; guestEmail: string | null }): Promise<{ dinerId: string; created: boolean }>;
}

interface Deps {
  db: typeof dbAdmin;
  loadCsv: (storagePath: string) => Promise<string>;
  findOrCreateDiner: FindOrCreateDiner;
  recordAudit: typeof realRecordAudit;
  now?: () => Date;
}

export function makeRunMigrationImport(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function runMigrationImport(payload: { importId: string }): Promise<void> {
    const jobRows = (await deps.db.execute(sql`
      SELECT restaurant_id, source_file_storage_path FROM migration_imports WHERE id = ${payload.importId}
    `)) as unknown as Array<{ restaurant_id: string; source_file_storage_path: string | null }>;
    const job = jobRows[0];
    if (!job || !job.source_file_storage_path) return;

    await deps.db.execute(sql`UPDATE migration_imports SET status = 'running', started_at = now() WHERE id = ${payload.importId}`);

    const text = await deps.loadCsv(job.source_file_storage_path);
    const { rows, errors } = parseManualCsv(text);

    const existing = (await deps.db.execute(sql`
      SELECT reservation_date::text AS d, reservation_time::text AS t, guest_phone AS p, party_size AS ps
      FROM reservations WHERE restaurant_id = ${job.restaurant_id} AND guest_phone IS NOT NULL
    `)) as unknown as Array<{ d: string; t: string; p: string; ps: number }>;
    const keys = new Set<string>();
    for (const e of existing) {
      const norm = normalizePhone(e.p, "RO");
      const k = dedupKey(e.d, e.t, norm.ok ? norm.e164 : e.p, e.ps);
      if (k) keys.add(k);
    }

    const today = now().toISOString().slice(0, 10);
    let imported = 0;
    let skipped = 0;
    let dinersImported = 0;

    for (const row of rows) {
      const norm = normalizePhone(row.guest_phone, "RO");
      const phoneE164 = norm.ok ? norm.e164 : row.guest_phone;
      const key = dedupKey(row.reservation_date, row.reservation_time, phoneE164, row.party_size);
      if (isDuplicate(key, keys)) {
        skipped++;
        continue;
      }
      const diner = await deps.findOrCreateDiner({
        restaurantId: job.restaurant_id,
        guestName: row.guest_name,
        guestPhone: row.guest_phone,
        guestEmail: row.guest_email,
      });
      if (diner.created) dinersImported++;
      const status = row.status ?? (row.reservation_date < today ? "completed" : "confirmed");
      await deps.db.execute(sql`
        INSERT INTO reservations (restaurant_id, guest_name, guest_phone, guest_email, party_size,
          reservation_date, reservation_time, status, confirmation_token, booking_type, diner_id, migration_import_id, notes)
        VALUES (${job.restaurant_id}, ${row.guest_name}, ${row.guest_phone}, ${row.guest_email}, ${row.party_size},
          ${row.reservation_date}::date, ${row.reservation_time}::time, ${status}::reservation_status,
          ${"mig_" + randomUUID().replace(/-/g, "")}, 'standard', ${diner.dinerId}, ${payload.importId}, ${row.notes})
      `);
      imported++;
      if (key) keys.add(key);
    }

    await deps.db.execute(sql`
      UPDATE migration_imports SET status = 'completed',
        reservations_imported = ${imported}, reservations_skipped = ${skipped},
        reservations_failed = ${errors.length}, diners_imported = ${dinersImported},
        error_log = ${sql`${JSON.stringify(errors)}::jsonb`}, completed_at = now()
      WHERE id = ${payload.importId}
    `);

    await deps.recordAudit({
      action: AUDIT.setup.migration_completed,
      subjectType: "migration_import",
      subjectId: payload.importId,
      actorRole: "system",
      restaurantId: job.restaurant_id,
      context: { migration_import_id: payload.importId, reservations_imported: imported, reservations_skipped: skipped, reservations_failed: errors.length, diners_imported: dinersImported },
    });
  };
}

export const runMigrationImport = makeRunMigrationImport({
  db: dbAdmin,
  loadCsv: async (path) => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from("migrations").download(path);
    if (error || !data) throw new Error(`migration CSV download failed: ${error?.message}`);
    return await data.text();
  },
  findOrCreateDiner: async ({ restaurantId, guestName, guestPhone, guestEmail }) => {
    const orgRows = (await dbAdmin.execute(sql`SELECT organization_id FROM restaurants WHERE id = ${restaurantId}`)) as unknown as Array<{ organization_id: string }>;
    const res = await findOrCreateDinerForReservation({
      organizationId: orgRows[0]!.organization_id,
      restaurantId,
      guestName,
      guestPhone: guestPhone ?? undefined,
      guestEmail: guestEmail ?? undefined,
      acquisitionSource: "import",
    });
    return { dinerId: res.dinerId, created: res.isNew };
  },
  recordAudit: realRecordAudit,
});
