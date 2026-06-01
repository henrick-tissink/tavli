"use server";

/**
 * §07 §7.4 / §8 — requestAnalyticsExport.
 *
 * Creates a `restaurant_export_jobs` row and enqueues the async
 * `analytics.run-export` job. This action is the **permission boundary** (§8):
 * it gates `analytics.export` (+ `campaigns.read` when campaigns are
 * requested); the job then trusts the row. `bypass_tier_limit_reason` is
 * internal-only and can never be set from this user-facing action.
 */

import { z } from "zod";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantExportJobs } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { enqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORTABLE_TABLES = ["reservations", "diners", "reviews", "campaigns"] as const;

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    requestedRestaurants: z.array(z.string().uuid()).default([]),
    dateFrom: z.string().regex(DATE_RE).optional(),
    dateTo: z.string().regex(DATE_RE).optional(),
    tables: z.array(z.enum(EXPORTABLE_TABLES)).min(1).default(["reservations", "diners", "reviews"]),
    format: z.enum(["csv", "json"]).default("csv"),
  })
  .refine((i) => !i.dateFrom || !i.dateTo || i.dateFrom <= i.dateTo, {
    message: "dateFrom must be on or before dateTo.",
  });

export type RequestAnalyticsExportInput = z.infer<typeof inputSchema>;

export interface RequestAnalyticsExportResult {
  ok: boolean;
  error?: string;
  jobId?: string;
}

export async function requestAnalyticsExport(
  raw: RequestAnalyticsExportInput,
): Promise<RequestAnalyticsExportResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const subject = { kind: "organization" as const, id: input.organizationId };
  if (!(await can(session, "analytics.export", subject))) {
    return { ok: false, error: "Forbidden." };
  }
  if (input.tables.includes("campaigns") && !(await can(session, "campaign.read", subject))) {
    return { ok: false, error: "Forbidden." };
  }

  const [row] = await dbAdmin
    .insert(restaurantExportJobs)
    .values({
      organizationId: input.organizationId,
      requestedByUserId: session.userId,
      requestedRestaurants: input.requestedRestaurants,
      tables: input.tables,
      format: input.format,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      status: "queued",
      // bypass_tier_limit_reason intentionally omitted — internal callers only.
    })
    .returning({ id: restaurantExportJobs.id });

  if (!row) return { ok: false, error: "Could not create export job." };

  await enqueue(JOBS.analytics.runExport, { jobId: row.id });

  return { ok: true, jobId: row.id };
}
