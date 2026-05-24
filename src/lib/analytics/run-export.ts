/**
 * §07 §8.1 — `analytics.run-export` job. Generates a ZIP of CSVs for the
 * requested tables, uploads it to the private `exports` bucket, mints a 24h
 * signed URL, audits the PII access, and emails the requester.
 *
 * Generic table loop (§8): no per-table conditional logic beyond the column
 * specs — it iterates `job.tables`. Permission was gated at the create-action
 * (§8 boundary); the job trusts the row. The `bypass_tier_limit_reason`
 * (cancellation / GDPR DSAR / admin) lifts the Base 12-month floor (§8.3).
 *
 * External clients are injected (no live keys): storage + email + audit + the
 * tier lookup. archiver streams to a temp file so rows aren't all held in
 * memory at once.
 */
import "server-only";
import { createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import archiver from "archiver";
import { sql } from "drizzle-orm";
import { render } from "@react-email/render";
import { dbAdmin } from "@/lib/db/admin";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { csvStringify, type CsvColumn, type CsvRow } from "@/lib/csv/stringify";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { ExportReadyEmail, getSubject, type Locale } from "@/emails/ExportReadyEmail";

type StorageClient = {
  from: (bucket: string) => {
    upload: (path: string, body: Buffer, opts?: Record<string, unknown>) => Promise<{ error: unknown }>;
    createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  };
};

interface RunExportDeps {
  db: typeof dbAdmin;
  storage: StorageClient;
  sendEmail: typeof sendTransactionalEmail;
  recordAudit: typeof realRecordAudit;
  loadTier: (organizationId: string) => Promise<"base" | "pro">;
  now?: () => Date;
}

export interface RunExportPayload {
  jobId: string;
}

interface ExportJobRow {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  requested_restaurants: string[];
  tables: string[];
  date_from: string | null;
  date_to: string | null;
  bypass_tier_limit_reason: string | null;
  requester_email: string | null;
  requester_locale: string;
}

const EXPORTS_BUCKET = "exports";
const SIGNED_URL_TTL_SECONDS = 24 * 3600;
// campaigns lives in §11 (Wave 7) — not yet a table; skip if requested.
const SUPPORTED_TABLES = ["reservations", "diners", "reviews"];

function asLocale(value: string | null | undefined): Locale {
  if (value === "en" || value === "de" || value === "ro") return value;
  if (value?.startsWith("en")) return "en";
  if (value?.startsWith("de")) return "de";
  return "ro";
}

export function makeRunExport(deps: RunExportDeps) {
  const now = deps.now ?? (() => new Date());

  return async function runExport(payload: RunExportPayload): Promise<void> {
    const jobRows = (await deps.db.execute(sql`
      SELECT j.id, j.organization_id, j.requested_by_user_id, j.requested_restaurants,
             j.tables, j.date_from::text AS date_from, j.date_to::text AS date_to,
             j.bypass_tier_limit_reason,
             p.email AS requester_email, p.locale AS requester_locale
      FROM restaurant_export_jobs j
      LEFT JOIN profiles p ON p.id = j.requested_by_user_id
      WHERE j.id = ${payload.jobId}
    `)) as unknown as ExportJobRow[];

    const job = jobRows[0];
    if (!job) throw new Error(`TV503 export_not_found: ${payload.jobId}`);

    try {
      await deps.db.execute(sql`
        UPDATE restaurant_export_jobs SET status = 'running' WHERE id = ${job.id}
      `);

      const included = job.tables.filter((t) => SUPPORTED_TABLES.includes(t));
      if (included.length === 0) {
        await markFailed(deps.db, job.id, "no supported tables selected");
        throw new Error(`TV504 export_no_tables_selected: ${job.id}`);
      }

      const tier = await deps.loadTier(job.organization_id);
      const applyFloor = !job.bypass_tier_limit_reason && tier !== "pro";

      const tmpPath = join(tmpdir(), `export-${job.id}.zip`);
      const archive = archiver("zip", { zlib: { level: 9 } });
      const output = createWriteStream(tmpPath);
      const finished = new Promise<void>((resolve, reject) => {
        output.on("close", () => resolve());
        output.on("error", reject);
        archive.on("error", reject);
      });
      archive.pipe(output);

      let totalRows = 0;
      for (const table of included) {
        const { rows, columns } = await fetchTable(deps.db, table, job, applyFloor);
        totalRows += rows.length;
        archive.append(csvStringify(rows, columns), { name: `${table}.csv` });
      }
      await archive.finalize();
      await finished;

      const buf = await readFile(tmpPath);
      const sizeBytes = buf.length;
      const storagePath = `org/${job.organization_id}/${job.id}.zip`;

      const up = await deps.storage
        .from(EXPORTS_BUCKET)
        .upload(storagePath, buf, { contentType: "application/zip", upsert: true });
      await unlink(tmpPath).catch(() => {});
      if (up.error) throw new Error(`export upload failed: ${JSON.stringify(up.error)}`);

      const expiresAt = new Date(now().getTime() + SIGNED_URL_TTL_SECONDS * 1000);
      const signed = await deps.storage.from(EXPORTS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      const signedUrl = signed.data?.signedUrl ?? null;

      await deps.db.execute(sql`
        UPDATE restaurant_export_jobs SET
          status = 'ready', storage_path = ${storagePath},
          signed_url_expires_at = ${expiresAt.toISOString()}, row_count = ${totalRows},
          size_bytes = ${sizeBytes}, ready_at = now()
        WHERE id = ${job.id}
      `);

      // PII-access audit — keyed on the job (not per diner), so no PII in context.
      await deps.recordAudit({
        action: AUDIT.diner.pii_accessed,
        subjectType: "export_job",
        subjectId: job.id,
        actorUserId: job.requested_by_user_id,
        actorRole: "system",
        organizationId: job.organization_id,
        context: {
          access_kind: "export",
          job_id: job.id,
          row_count: totalRows,
          tables: included,
          date_from: job.date_from,
          date_to: job.date_to,
        },
      });
      await deps.recordAudit({
        action: AUDIT.analytics.export_run,
        subjectType: "export_job",
        subjectId: job.id,
        actorUserId: job.requested_by_user_id,
        actorRole: "system",
        organizationId: job.organization_id,
        context: {
          export_job_id: job.id,
          restaurant_ids: job.requested_restaurants,
          tables: included,
          date_from: job.date_from,
          date_to: job.date_to,
          bypass_tier_limit_reason: job.bypass_tier_limit_reason ?? null,
        },
      });

      if (signedUrl && job.requester_email) {
        const locale = asLocale(job.requester_locale);
        const props = { downloadUrl: signedUrl, expiresAt, tables: included, locale };
        const html = await render(ExportReadyEmail(props));
        const text = await render(ExportReadyEmail(props), { plainText: true });
        await deps.sendEmail({
          to: job.requester_email,
          locale,
          templateKey: "export_ready",
          subject: getSubject(locale),
          html,
          text,
          context: { organization_id: job.organization_id },
        });
      }
    } catch (err) {
      await markFailed(deps.db, job.id, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}

async function markFailed(db: typeof dbAdmin, jobId: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE restaurant_export_jobs SET status = 'failed', failure_reason = ${reason.slice(0, 2000)}
    WHERE id = ${jobId} AND status <> 'ready'
  `);
}

// ── per-table fetch + CSV column specs (§8.2) ───────────────────────────────
async function fetchTable(
  db: typeof dbAdmin,
  table: string,
  job: ExportJobRow,
  applyFloor: boolean,
): Promise<{ rows: CsvRow[]; columns: CsvColumn[] }> {
  const orgScope = sql`r.organization_id = ${job.organization_id}`;
  const venueScope =
    job.requested_restaurants.length > 0
      ? sql`AND res.restaurant_id = ANY(${job.requested_restaurants}::uuid[])`
      : sql``;
  const floor = applyFloor ? sql`AND res.reservation_date >= (current_date - interval '12 months')` : sql``;
  const dateFrom = job.date_from ? sql`AND res.reservation_date >= ${job.date_from}::date` : sql``;
  const dateTo = job.date_to ? sql`AND res.reservation_date <= ${job.date_to}::date` : sql``;

  if (table === "reservations") {
    const rows = (await db.execute(sql`
      SELECT res.id, r.name AS restaurant_name, res.reservation_date AS business_date,
             res.reservation_time, res.party_size, res.status, res.guest_name, res.guest_phone,
             res.guest_email, res.notes, res.zone, res.booking_type, res.cancelled_reason,
             res.created_at, d.acquisition_source AS source
      FROM reservations res
      JOIN restaurants r ON r.id = res.restaurant_id
      LEFT JOIN diners d ON d.id = res.diner_id
      WHERE ${orgScope} ${venueScope} ${floor} ${dateFrom} ${dateTo}
      ORDER BY res.reservation_date DESC, res.reservation_time DESC
    `)) as unknown as CsvRow[];
    return {
      rows,
      columns: [
        { key: "id", header: "id" },
        { key: "restaurant_name", header: "restaurant_name" },
        { key: "business_date", header: "business_date" },
        { key: "reservation_time", header: "reservation_time" },
        { key: "party_size", header: "party_size" },
        { key: "status", header: "status" },
        { key: "guest_name", header: "guest_name" },
        { key: "guest_phone", header: "guest_phone" },
        { key: "guest_email", header: "guest_email" },
        { key: "notes", header: "notes" },
        { key: "zone", header: "zone" },
        { key: "booking_type", header: "booking_type" },
        { key: "cancelled_reason", header: "cancelled_reason" },
        { key: "created_at", header: "created_at" },
        { key: "source", header: "source" },
      ],
    };
  }

  if (table === "diners") {
    const rows = (await db.execute(sql`
      SELECT d.id, d.full_name, d.phone, d.email, d.acquisition_source,
             d.first_visited_at, d.last_visited_at, d.visit_count, d.created_at
      FROM diners d
      WHERE d.organization_id = ${job.organization_id} AND d.redacted_at IS NULL
      ORDER BY d.created_at DESC
    `)) as unknown as CsvRow[];
    return {
      rows,
      columns: [
        { key: "id", header: "id" },
        { key: "full_name", header: "full_name" },
        { key: "phone", header: "phone" },
        { key: "email", header: "email" },
        { key: "acquisition_source", header: "acquisition_source" },
        { key: "first_visited_at", header: "first_visited_at" },
        { key: "last_visited_at", header: "last_visited_at" },
        { key: "visit_count", header: "visit_count" },
        { key: "created_at", header: "created_at" },
      ],
    };
  }

  // reviews
  const rows = (await db.execute(sql`
    SELECT rev.id, r.name AS restaurant_name, rev.rating, rev.comment, rev.first_name,
           rev.party_size, rev.reservation_date AS business_date, rev.created_at
    FROM reviews rev
    JOIN restaurants r ON r.id = rev.restaurant_id
    JOIN reservations res ON res.id = rev.reservation_id
    WHERE ${orgScope} ${venueScope} ${floor} ${dateFrom} ${dateTo} AND rev.redacted_at IS NULL
    ORDER BY rev.created_at DESC
  `)) as unknown as CsvRow[];
  return {
    rows,
    columns: [
      { key: "id", header: "id" },
      { key: "restaurant_name", header: "restaurant_name" },
      { key: "rating", header: "rating" },
      { key: "comment", header: "comment" },
      { key: "first_name", header: "first_name" },
      { key: "party_size", header: "party_size" },
      { key: "business_date", header: "business_date" },
      { key: "created_at", header: "created_at" },
    ],
  };
}

// Lazy storage proxy — the admin client (and its env vars) is only resolved
// when a job actually runs, so importing this module never requires keys.
const lazyStorage: StorageClient = {
  from: (bucket: string) => createSupabaseAdminClient().storage.from(bucket) as unknown as ReturnType<StorageClient["from"]>,
};

export const runExport = makeRunExport({
  db: dbAdmin,
  storage: lazyStorage,
  sendEmail: sendTransactionalEmail,
  recordAudit: realRecordAudit,
  loadTier: async (orgId) => ((await loadActiveSubscription(orgId))?.tier === "pro" ? "pro" : "base"),
});
