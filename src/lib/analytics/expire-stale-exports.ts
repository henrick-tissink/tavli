/**
 * §07 §10 — `analytics.expire-stale-exports` nightly cleanup. Deletes export
 * ZIPs whose 24h signed URL has elapsed and flips the job row to 'expired', so
 * PII-bearing files don't linger in storage.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";

type StorageClient = {
  from: (bucket: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> };
};

interface Deps {
  db: typeof dbAdmin;
  storage: StorageClient;
}

const EXPORTS_BUCKET = "exports";

export function makeExpireStaleExports(deps: Deps) {
  return async function expireStaleExports(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT id, storage_path FROM restaurant_export_jobs
      WHERE status = 'ready' AND signed_url_expires_at < now()
    `)) as unknown as Array<{ id: string; storage_path: string | null }>;

    for (const row of rows) {
      if (row.storage_path) {
        await deps.storage.from(EXPORTS_BUCKET).remove([row.storage_path]);
      }
      await deps.db.execute(sql`
        UPDATE restaurant_export_jobs SET status = 'expired', expired_at = now() WHERE id = ${row.id}
      `);
    }
  };
}

const lazyStorage: StorageClient = {
  from: (bucket: string) => createSupabaseAdminClient().storage.from(bucket) as unknown as ReturnType<StorageClient["from"]>,
};

export const expireStaleExports = makeExpireStaleExports({ db: dbAdmin, storage: lazyStorage });
